"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { getTool } from "@/tools/registry";
import type { CategorieFrais } from "@/generated/prisma/enums";
import { categorieAutorisee, demandeInvites, periodeValide } from "./model";
import type { CategorieFrais as CategorieVue, ProfilNdf } from "./model";
import { profilNdfDe, resoudrePeriode } from "./queries";
import { supprimerJustificatifFichier } from "./stockage";

/* Écritures de l'outil « Notes de frais ».
 * Comme les lectures : chaque action ré-authentifie et vérifie la PROPRIÉTÉ de
 * la ligne visée. Un identifiant deviné ne donne accès à rien. */

const RACINE = getTool("notes-de-frais")?.href ?? "/perso/gus/notes-de-frais";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export interface DepensePayload {
  /** UUID généré côté client (l'upload du justificatif s'y rattache aussitôt). */
  id: string;
  /** « YYYY-MM-DD ». */
  date: string;
  categorie: CategorieVue;
  montantCents: number;
  tvaCents: number | null;
  descriptif: string;
  numeroAffaire: string;
  nbInvites: number | null;
  invites: string;
}

export type ResultatDepense =
  | { ok: true; id: string; periode: string; reportee: boolean }
  | { ok: false; error: string };

function rafraichir() {
  revalidatePath(RACINE);
}

/**
 * Crée ou mémorise une dépense. Idempotent par UUID client : rejouer un envoi
 * (double tap sur « Enregistrer », réseau capricieux) ne duplique jamais la
 * ligne. La période d'imputation est (re)calculée à chaque écriture, ce qui
 * applique la règle de rattrapage même si la date est corrigée après coup.
 */
export async function enregistrerDepense(
  p: DepensePayload,
): Promise<ResultatDepense> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "Non authentifié" };

  const profil = await profilNdfDe(userId);
  if (!profil) {
    return {
      ok: false,
      error: "Aucun profil de note de frais n'est associé à ton compte.",
    };
  }

  if (!UUID_RE.test(p.id)) return { ok: false, error: "Identifiant invalide" };
  if (!DATE_RE.test(p.date)) return { ok: false, error: "Date invalide" };
  const date = new Date(`${p.date}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return { ok: false, error: "Date invalide" };

  if (!categorieAutorisee(profil as ProfilNdf, p.categorie)) {
    return { ok: false, error: "Rubrique indisponible pour ton profil" };
  }
  if (!Number.isInteger(p.montantCents) || p.montantCents <= 0) {
    return { ok: false, error: "Montant invalide" };
  }
  if (
    p.tvaCents != null &&
    (!Number.isInteger(p.tvaCents) || p.tvaCents < 0 || p.tvaCents > p.montantCents)
  ) {
    return { ok: false, error: "TVA invalide (elle ne peut pas dépasser le montant)" };
  }

  // Les champs « invités » n'ont de sens que pour un repas d'affaires : on les
  // neutralise sinon, plutôt que de laisser traîner une valeur incohérente.
  const avecInvites = demandeInvites(p.categorie);
  const nbInvites =
    avecInvites && Number.isInteger(p.nbInvites) && (p.nbInvites ?? 0) > 0
      ? p.nbInvites
      : null;
  const invites = avecInvites ? p.invites.trim().slice(0, 500) : "";

  const existant = await prisma.depenseFrais.findUnique({
    where: { id: p.id },
    select: { createdById: true },
  });
  if (existant && existant.createdById !== userId) {
    // Ligne de quelqu'un d'autre : on ne dit pas qu'elle existe.
    return { ok: false, error: "Dépense introuvable" };
  }

  const { periode, periodeOrigine } = await resoudrePeriode(userId, date);

  const donnees = {
    date,
    categorie: p.categorie as CategorieFrais,
    montantCents: p.montantCents,
    tvaCents: p.tvaCents,
    descriptif: p.descriptif.trim().slice(0, 500),
    numeroAffaire: p.numeroAffaire.trim().slice(0, 60),
    nbInvites,
    invites,
    periode,
    periodeOrigine,
  };

  if (existant) {
    await prisma.depenseFrais.update({ where: { id: p.id }, data: donnees });
  } else {
    await prisma.depenseFrais.create({
      data: { id: p.id, ...donnees, createdById: userId },
    });
  }

  rafraichir();
  return { ok: true, id: p.id, periode, reportee: periodeOrigine !== null };
}

export async function supprimerDepense(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "Non authentifié" };

  const d = await prisma.depenseFrais.findFirst({
    where: { id, createdById: userId },
    select: { id: true, justificatifs: { select: { fichier: true } } },
  });
  if (!d) return { ok: false, error: "Dépense introuvable" };

  // Binaires d'abord : une ligne supprimée dont le fichier reste sur le disque
  // est un orphelin invisible que plus rien ne référence.
  for (const j of d.justificatifs) await supprimerJustificatifFichier(j.fichier);
  await prisma.depenseFrais.delete({ where: { id } });

  rafraichir();
  return { ok: true };
}

export async function supprimerJustificatif(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "Non authentifié" };

  const j = await prisma.justificatifFrais.findFirst({
    where: { id, depense: { createdById: userId } },
    select: { id: true, fichier: true },
  });
  if (!j) return { ok: false, error: "Justificatif introuvable" };

  await supprimerJustificatifFichier(j.fichier);
  await prisma.justificatifFrais.delete({ where: { id } });

  rafraichir();
  return { ok: true };
}

/**
 * Marque le mois comme remis à la compta (horodaté). La note reste rouvrable et
 * régénérable : c'est un jalon, pas un verrou. Effet de bord voulu : les
 * dépenses complétées plus tard seront reportées sur le mois suivant.
 */
export async function marquerTransmise(
  periode: string,
): Promise<{ ok: true; transmiseLe: Date } | { ok: false; error: string }> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "Non authentifié" };
  if (!periodeValide(periode)) return { ok: false, error: "Période invalide" };

  const transmiseLe = new Date();
  await prisma.noteFraisMois.upsert({
    where: { userId_periode: { userId, periode } },
    create: { userId, periode, transmiseLe },
    update: { transmiseLe },
  });

  rafraichir();
  return { ok: true, transmiseLe };
}

/** Rouvre un mois transmis (correction demandée par la compta). */
export async function rouvrirMois(
  periode: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "Non authentifié" };
  if (!periodeValide(periode)) return { ok: false, error: "Période invalide" };

  await prisma.noteFraisMois.updateMany({
    where: { userId, periode },
    data: { transmiseLe: null },
  });

  rafraichir();
  return { ok: true };
}
