import "server-only";
import { prisma } from "@/lib/db";
import { pousserVersKdrive } from "./index";

/* Worker de synchro : draine les documents en attente vers kDrive.
 * Concurrence sûre : chaque ligne est « claimée » atomiquement (EN_ATTENTE →
 * EN_COURS via UPDATE conditionnel + FOR UPDATE SKIP LOCKED), donc deux drains
 * qui se chevauchent (cron toutes les ~2 min) ne poussent jamais deux fois la
 * même ligne. Backoff simple : plafond de tentatives. */

export const MAX_TENTATIVES = 5;
/** Un push est considéré « orphelin » (worker mort en cours de route) au-delà de
 *  ce délai en EN_COURS → il redevient éligible. Marge large (> durée d'un gros
 *  upload) pour ne pas voler un push réellement en vol. */
const EN_COURS_PERIME_MIN = 15;

/** Réclame atomiquement le prochain document à pousser (ou null s'il n'y en a plus).
 *  Éligibles : EN_ATTENTE, ERREUR sous plafond, et EN_COURS périmé (auto-guérison
 *  des claims orphelins d'un drain interrompu). */
async function claimProchain(): Promise<string | null> {
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    UPDATE "Document" SET "statutSync" = 'EN_COURS', "updatedAt" = now()
    WHERE id = (
      SELECT id FROM "Document"
      WHERE "spoolPath" IS NOT NULL
        AND ("statutSync" = 'EN_ATTENTE'
             OR ("statutSync" = 'ERREUR' AND "tentatives" < ${MAX_TENTATIVES})
             OR ("statutSync" = 'EN_COURS'
                 AND "updatedAt" < now() - make_interval(mins => ${EN_COURS_PERIME_MIN})))
      ORDER BY "createdAt" ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    RETURNING id`;
  return rows[0]?.id ?? null;
}

async function pousserUn(id: string): Promise<boolean> {
  try {
    await pousserVersKdrive(id);
    return true;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erreur inconnue";
    await prisma.document.update({
      where: { id },
      data: { statutSync: "ERREUR", syncError: msg, tentatives: { increment: 1 } },
    });
    return false;
  }
}

/** Draine jusqu'à `max` documents. Renvoie le bilan. */
export async function drain(max = 25): Promise<{ traites: number; erreurs: number }> {
  let traites = 0;
  let erreurs = 0;
  for (let i = 0; i < max; i++) {
    const id = await claimProchain();
    if (!id) break;
    traites += 1;
    if (!(await pousserUn(id))) erreurs += 1;
  }
  return { traites, erreurs };
}
