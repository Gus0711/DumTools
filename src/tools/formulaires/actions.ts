"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { titreReponse } from "./model";
import type { ReponseData, SchemaFormulaire } from "./model";
import { supprimerMediaFormulaire } from "./stockage";

/** Crée un formulaire vierge dans un espace perso → id créé (pour rediriger vers
 *  le builder). */
export async function creerFormulaire(
  proprietaire: string,
): Promise<{ id: string } | { error: string }> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { error: "Non authentifié" };
  if (session?.user?.role !== "ADMIN")
    return { error: "Réservé aux administrateurs" };

  const row = await prisma.formulaire.create({
    data: { proprietaire, createdById: userId },
    select: { id: true },
  });
  return { id: row.id };
}

/** Données de sauvegarde de la DÉFINITION d'un formulaire. */
export interface SauvegardeFormulaire {
  nom: string;
  description: string;
  schema: SchemaFormulaire;
  publie: boolean;
  /** Version sur laquelle l'éditeur s'est basé (verrou optimiste anti-collision). */
  versionBase: number;
}

export type ResultatSauvegarde =
  | { ok: true; version: number; updatedAt: Date; publieLe: Date | null }
  | { ok: false; conflit: true; version: number; updatedAt: Date }
  | { ok: false; error: string };

/**
 * Sauvegarde la définition. Verrou optimiste (comme les Notes / le Wiki) :
 * n'écrit QUE si la ligne est encore à `versionBase` ; sinon 0 ligne touchée →
 * conflit signalé (pas d'écrasement silencieux si deux éditeurs). Ne touche PAS
 * aux réponses déjà collectées (elles portent leur propre snapshot du schéma).
 */
export async function sauverFormulaire(
  id: string,
  data: SauvegardeFormulaire,
): Promise<ResultatSauvegarde> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Non authentifié" };
  if (session.user.role !== "ADMIN")
    return { ok: false, error: "Réservé aux administrateurs" };

  // Round-trip JSON : élimine les `undefined` (props optionnelles des ChampDef)
  // que Prisma refuse dans une valeur Json.
  const schema = JSON.parse(
    JSON.stringify(data.schema ?? []),
  ) as Prisma.InputJsonValue;

  // Date de mise à disposition : fixée à la 1re publication, conservée ensuite.
  const avant = await prisma.formulaire.findUnique({
    where: { id },
    select: { publieLe: true },
  });
  const publieLe = data.publie
    ? (avant?.publieLe ?? new Date())
    : (avant?.publieLe ?? null);

  const res = await prisma.formulaire.updateMany({
    where: { id, version: data.versionBase },
    data: {
      nom: data.nom.trim() || "Formulaire sans nom",
      description: data.description,
      schema,
      publie: data.publie,
      publieLe,
      version: data.versionBase + 1,
    },
  });

  const apres = await prisma.formulaire.findUnique({
    where: { id },
    select: { version: true, updatedAt: true, publieLe: true },
  });
  if (!apres) return { ok: false, error: "Formulaire introuvable" };

  if (res.count === 0) {
    return {
      ok: false,
      conflit: true,
      version: apres.version,
      updatedAt: apres.updatedAt,
    };
  }
  return {
    ok: true,
    version: apres.version,
    updatedAt: apres.updatedAt,
    publieLe: apres.publieLe,
  };
}

/** Supprime un formulaire (et, en cascade, ses réponses + médias — cf. schéma). */
export async function supprimerFormulaire(id: string): Promise<void> {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") return;
  await prisma.formulaire.delete({ where: { id } });
}

/** Supprime une réponse synchronisée (et ses médias). ADMIN uniquement — pour un
 *  membre, les réponses sont figées (consultation seule). */
export async function supprimerReponse(id: string): Promise<void> {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") return;
  const r = await prisma.formulaireReponse.findUnique({
    where: { id },
    select: { medias: { select: { fichier: true } } },
  });
  if (!r) return;
  for (const m of r.medias) await supprimerMediaFormulaire(m.fichier);
  await prisma.formulaireReponse.delete({ where: { id } });
}

/** Ce que l'îlot de remplissage pousse au serveur (la réponse locale). */
export interface ReponsePayload {
  id: string;
  formulaireId: string;
  formulaireVersion: number;
  /** schemaSnapshot figé + valeurs + méta médias + updatedTs. */
  data: ReponseData;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Upsert idempotent d'une réponse poussée par le remplissage (offline-first,
 * patron syncVisite). `id` = UUID client → rejouer la file est toujours sûr.
 * « Dernier gagne » par réponse via `data.updatedTs`. Le schéma effectif reste
 * FIGÉ dans `data.schemaSnapshot` : lecture stable même si le formulaire a changé.
 * Les binaires (photos/signatures) arrivent séparément via /api/formulaires/media
 * APRÈS la réponse (la ligne doit exister).
 */
export async function syncReponse(
  payload: ReponsePayload,
): Promise<{ ok: true } | { error: string }> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { error: "Non authentifié" };
  if (!UUID_RE.test(payload.id)) return { error: "Identifiant invalide" };
  if (!payload.data || typeof payload.data.updatedTs !== "number") {
    return { error: "Contenu de réponse invalide" };
  }

  const f = await prisma.formulaire.findUnique({
    where: { id: payload.formulaireId },
    select: { id: true, publie: true },
  });
  if (!f) return { error: "Formulaire introuvable" };
  // Un brouillon n'accepte des réponses que d'un admin (il n'est pas « diffusé »).
  if (!f.publie && session.user.role !== "ADMIN")
    return { error: "Formulaire non disponible" };

  const snapshot: SchemaFormulaire = payload.data.schemaSnapshot ?? [];
  const commun = {
    formulaireId: payload.formulaireId,
    formulaireVersion: payload.formulaireVersion,
    titre: titreReponse(snapshot, payload.data.valeurs ?? {}),
    data: JSON.parse(JSON.stringify(payload.data)) as Prisma.InputJsonValue,
  };

  const existant = await prisma.formulaireReponse.findUnique({
    where: { id: payload.id },
    select: { id: true, data: true },
  });

  if (existant) {
    const ancienTs =
      (existant.data as { updatedTs?: number } | null)?.updatedTs ?? 0;
    if (payload.data.updatedTs < ancienTs) return { ok: true }; // périmé → ignoré
    await prisma.formulaireReponse.update({
      where: { id: payload.id },
      data: commun,
    });
    // Médias retirés côté terrain → purger base + disque (le data fait foi).
    const gardes = new Set((payload.data.medias ?? []).map((m) => m.id));
    const enBase = await prisma.formulaireMedia.findMany({
      where: { reponseId: payload.id },
      select: { id: true, fichier: true },
    });
    for (const m of enBase) {
      if (gardes.has(m.id)) continue;
      await supprimerMediaFormulaire(m.fichier);
      await prisma.formulaireMedia.delete({ where: { id: m.id } });
    }
  } else {
    await prisma.formulaireReponse.create({
      data: { id: payload.id, ...commun, createdById: userId },
    });
  }
  return { ok: true };
}
