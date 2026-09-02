"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { EtatTache, PrioriteTache } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";
import { purgerMediasOrphelins } from "@/lib/medias-document/purge";
import type { ResultatSauvegarde } from "@/lib/editeur-riche/use-sauvegarde-document";
import { PREFIXE_MEDIA_TACHE } from "./taches";

/** L'utilisateur de la session — son ID, pas seulement sa présence : une tâche
 *  qu'on crée s'assigne à soi (voir `creerTache`). */
async function requireUser(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Non authentifié");
  return session.user.id;
}

/** Valide un état arrivé du client (les actions sont appelables au réseau). */
function valideEtat(etat: string): EtatTache {
  if (!Object.values(EtatTache).includes(etat as EtatTache))
    throw new Error("État de tâche inconnu");
  return etat as EtatTache;
}

/**
 * Crée une tâche dans une colonne du kanban. Le client (qui connaît sa colonne)
 * fournit l'ordre de fin de colonne ; ce qui est retourné réconcilie l'ajout
 * optimiste.
 *
 * ⚠️ ELLE S'ASSIGNE À SON AUTEUR. « Mes tâches » (tableau de bord) et la
 * pastille du rail ne lisent QUE `assigneId` : une tâche créée sans assigné
 * n'existait que sur le kanban de son affaire — invisible partout où l'on va
 * voir ce qu'on a à faire, donc perdue. Or on écrit presque toujours une tâche
 * pour soi ; le cas où elle est pour quelqu'un d'autre reste à un clic (le menu
 * d'assignation, qui sait aussi retirer l'assignation).
 */
export async function creerTache(p: {
  chantierId: string;
  titre: string;
  etat: EtatTache;
  ordre: number;
}): Promise<{ id: string; assigneId: string | null; assigneNom: string | null }> {
  const moiId = await requireUser();
  const titre = p.titre.trim();
  if (!titre) throw new Error("Titre requis");
  const tache = await prisma.tacheAffaire.create({
    data: {
      chantierId: p.chantierId,
      titre,
      etat: valideEtat(p.etat),
      ordre: p.ordre,
      assigneId: moiId,
    },
    select: { id: true, assigneId: true, assigne: { select: { nom: true } } },
  });
  revalidatePath(`/affaires/${p.chantierId}`);
  // La tâche vient d'entrer dans « Mes tâches » et dans la pastille du rail :
  // les deux vivent sur /affaires, qu'il faut donc invalider aussi.
  revalidatePath("/affaires");
  return { id: tache.id, assigneId: tache.assigneId, assigneNom: tache.assigne?.nom ?? null };
}

/** Déplace une tâche : changement de colonne (état) et/ou de position (ordre). */
export async function deplacerTache(
  id: string,
  p: { etat: EtatTache; ordre: number },
): Promise<void> {
  await requireUser();
  const t = await prisma.tacheAffaire.update({
    where: { id },
    data: { etat: valideEtat(p.etat), ordre: p.ordre },
    select: { chantierId: true },
  });
  // ⚠️ `chantierId` peut être null depuis le 2026-09-01 (tâche interne) : sans
  // la garde, on invaliderait « /affaires/null ».
  if (t.chantierId) revalidatePath(`/affaires/${t.chantierId}`);
  revalidatePath("/mes-taches");
}

/** Change l'état d'une tâche en la plaçant en fin de colonne cible. Utilisé par
 *  la vue « Mes tâches », qui ne connaît pas les colonnes du kanban : l'ordre
 *  est calculé ici, côté serveur. */
export async function changerEtatTacheEnFin(id: string, etat: EtatTache): Promise<void> {
  await requireUser();
  const e = valideEtat(etat);
  const tache = await prisma.tacheAffaire.findUnique({
    where: { id },
    select: { chantierId: true },
  });
  if (!tache) throw new Error("Tâche introuvable");
  const max = await prisma.tacheAffaire.aggregate({
    where: { chantierId: tache.chantierId, etat: e },
    _max: { ordre: true },
  });
  await prisma.tacheAffaire.update({
    where: { id },
    data: { etat: e, ordre: (max._max.ordre ?? 0) + 1 },
  });
  revalidatePath("/affaires");
  revalidatePath("/mes-taches");
  if (tache.chantierId) revalidatePath(`/affaires/${tache.chantierId}`);
}

export async function renommerTache(id: string, titre: string): Promise<void> {
  await requireUser();
  const t = titre.trim();
  if (!t) throw new Error("Titre requis");
  const tache = await prisma.tacheAffaire.update({
    where: { id },
    data: { titre: t },
    select: { chantierId: true },
  });
  if (tache.chantierId) revalidatePath(`/affaires/${tache.chantierId}`);
  revalidatePath("/mes-taches");
}

/** Assigne la tâche à un utilisateur (null = retirer l'assignation). */
export async function assignerTache(id: string, assigneId: string | null): Promise<void> {
  await requireUser();
  const tache = await prisma.tacheAffaire.update({
    where: { id },
    data: { assigneId },
    select: { chantierId: true },
  });
  if (tache.chantierId) revalidatePath(`/affaires/${tache.chantierId}`);
  revalidatePath("/affaires");
  revalidatePath("/mes-taches");
}

/** Valide une priorité arrivée du client. */
function validePriorite(p: string): PrioriteTache {
  if (!Object.values(PrioriteTache).includes(p as PrioriteTache))
    throw new Error("Priorité inconnue");
  return p as PrioriteTache;
}

/**
 * Une échéance est un JOUR (`AAAA-MM-JJ`), jamais un instant.
 *
 * ⚠️ On la pose à MIDI UTC et non à minuit : à minuit, tout fuseau à l'ouest
 * ramène la date à la veille, et l'échéance qu'on vient de saisir s'affiche
 * décalée d'un jour. Midi laisse douze heures de marge des deux côtés.
 */
function jourVersDate(jour: string | null): Date | null {
  if (!jour) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(jour)) throw new Error("Date d'échéance invalide");
  return new Date(`${jour}T12:00:00.000Z`);
}

/**
 * Le rattachement d'une tâche : UNE affaire, OU UN client, OU UN domaine —
 * jamais deux à la fois. L'ordre ci-dessous EST la règle de priorité, et il va
 * du plus précis au plus large.
 *
 * ⚠️ Une tâche d'affaire ne recopie PAS le client de son affaire : elle le tient
 * déjà par elle. Le dupliquer créerait deux vérités, et la première à mentir
 * serait celle qu'on oublie de mettre à jour quand une affaire change de client.
 *
 * Le domaine est résolu par NOM et créé au besoin — même patron que
 * `resoudreClientId` : on ne fait pas quitter son formulaire à quelqu'un pour
 * aller créer « Atelier » ailleurs. La casse et les espaces sont normalisés,
 * sinon « atelier » et « Atelier » deviennent deux rangements pour une chose.
 */
async function resoudreRattachement(p: {
  chantierId?: string | null;
  clientId?: string | null;
  domaine?: string | null;
}): Promise<{ chantierId: string | null; clientId: string | null; domaineId: string | null }> {
  const vide = { chantierId: null, clientId: null, domaineId: null };

  const chantierId = p.chantierId?.trim() || null;
  if (chantierId) return { ...vide, chantierId };

  const clientId = p.clientId?.trim() || null;
  if (clientId) return { ...vide, clientId };

  const nom = p.domaine?.trim() ?? "";
  if (!nom) return vide;

  const existant = await prisma.domaineTache.findFirst({
    where: { nom: { equals: nom, mode: "insensitive" } },
    select: { id: true },
  });
  if (existant) return { ...vide, domaineId: existant.id };

  const cree = await prisma.domaineTache.create({
    data: { nom, ordre: 99 },
    select: { id: true },
  });
  return { ...vide, domaineId: cree.id };
}

/**
 * Crée une tâche depuis l'écran « Mes tâches » — avec ou SANS affaire.
 *
 * Distincte de `creerTache` (le kanban) parce que les deux entrées ne savent
 * pas les mêmes choses : le kanban connaît sa colonne et sa position, cet
 * écran-ci connaît une priorité, une échéance et un rattachement libre. C'est
 * donc ici qu'on calcule l'ordre, en fin de colonne « À faire ».
 */
export async function creerTacheLibre(p: {
  titre: string;
  chantierId?: string | null;
  clientId?: string | null;
  domaine?: string | null;
  priorite?: string;
  echeance?: string | null;
  assigneId?: string | null;
}): Promise<{ id: string }> {
  const moiId = await requireUser();
  const titre = p.titre.trim();
  if (!titre) throw new Error("Titre requis");

  const rattachement = await resoudreRattachement(p);
  const etat: EtatTache = "A_FAIRE";
  const max = await prisma.tacheAffaire.aggregate({
    where: { chantierId: rattachement.chantierId, etat },
    _max: { ordre: true },
  });

  const tache = await prisma.tacheAffaire.create({
    data: {
      titre,
      etat,
      ordre: (max._max.ordre ?? 0) + 1,
      priorite: p.priorite ? validePriorite(p.priorite) : "NORMALE",
      echeance: jourVersDate(p.echeance ?? null),
      // Même règle que le kanban : une tâche s'assigne à son auteur, sauf si
      // on l'écrit explicitement pour quelqu'un d'autre. Une tâche que
      // personne ne porte n'apparaît sur le tableau de personne.
      assigneId: p.assigneId === undefined ? moiId : p.assigneId,
      ...rattachement,
    },
    select: { id: true },
  });

  revalidatePath("/mes-taches");
  revalidatePath("/affaires");
  if (rattachement.chantierId) revalidatePath(`/affaires/${rattachement.chantierId}`);
  return tache;
}

export async function changerPrioriteTache(id: string, priorite: string): Promise<void> {
  await requireUser();
  const tache = await prisma.tacheAffaire.update({
    where: { id },
    data: { priorite: validePriorite(priorite) },
    select: { chantierId: true },
  });
  revalidatePath("/mes-taches");
  if (tache.chantierId) revalidatePath(`/affaires/${tache.chantierId}`);
}

/** `jour` en `AAAA-MM-JJ`, ou null pour retirer l'échéance. */
export async function changerEcheanceTache(id: string, jour: string | null): Promise<void> {
  await requireUser();
  const tache = await prisma.tacheAffaire.update({
    where: { id },
    data: { echeance: jourVersDate(jour) },
    select: { chantierId: true },
  });
  revalidatePath("/mes-taches");
  if (tache.chantierId) revalidatePath(`/affaires/${tache.chantierId}`);
}

export async function supprimerTache(id: string): Promise<void> {
  await requireUser();
  const tache = await prisma.tacheAffaire.delete({
    where: { id },
    select: { chantierId: true },
  });
  if (tache.chantierId) revalidatePath(`/affaires/${tache.chantierId}`);
  revalidatePath("/affaires");
  revalidatePath("/mes-taches");
}

/* =============================================================================
 * LE CORPS DE LA TÂCHE — un document riche
 *
 * 4ᵉ consommateur du moteur partagé (Notes, Wiki, texte libre d'une ligne de
 * devis). Une tâche n'était qu'une ligne : le contexte — ce qui a été dit au
 * téléphone, les trois sous-étapes, la référence à confirmer — vivait ailleurs
 * ou nulle part. Il vit maintenant AVEC la chose à faire.
 *
 * ⚠️ Sans `revalidatePath` : la sauvegarde part à chaque frappe (debounce du
 * socle), et aucun compteur, aucun tri, aucune obligation ne dépend d'un corps.
 * Le corollaire est non négociable (règle du §14.3 de DEVIS.md) : QUI N'INVALIDE
 * PAS DOIT AFFICHER SON PROPRE ÉTAT — le composant garde sa dernière écriture
 * acceptée, sinon fermer l'éditeur réafficherait l'ancien texte et le rouvrir
 * repartirait sur l'ancienne version, donc sur un faux conflit.
 * ========================================================================== */

/* Le type de retour vient du SOCLE (`ResultatSauvegarde`) : c'est une union
 * discriminée, et c'est elle qui oblige l'appelant à traiter le conflit. Un
 * `{ ok: boolean; conflit?: boolean }` maison aurait laissé passer un oubli. */
export async function sauverCorpsTache(
  id: string,
  data: { contenu: unknown[]; versionBase: number },
): Promise<ResultatSauvegarde> {
  await requireUser();

  // Les blocs BlockNote portent des `undefined` DANS des tableaux (columnWidths
  // par exemple) ; les server actions les préservent et Prisma les refuse en
  // JSON → on les normalise en null, forme native de BlockNote.
  const contenu = JSON.parse(JSON.stringify(data.contenu ?? [])) as Prisma.InputJsonValue;

  // `updateManyAndReturn` : garde de version ET lecture du résultat dans la
  // MÊME requête. Le couple update + findUnique laissait une écriture
  // concurrente s'intercaler et renvoyer SA version, d'où un faux conflit au
  // save suivant.
  const [tache] = await prisma.tacheAffaire.updateManyAndReturn({
    where: { id, version: data.versionBase },
    data: { contenu, version: data.versionBase + 1 },
    select: { version: true, updatedAt: true },
  });

  if (!tache) {
    const courante = await prisma.tacheAffaire.findUnique({
      where: { id },
      select: { version: true, updatedAt: true },
    });
    if (!courante) throw new Error("Tâche introuvable");
    return {
      ok: false,
      conflit: true,
      version: courante.version,
      updatedAt: courante.updatedAt.toISOString(),
    };
  }

  await purgerMediasTache(id, data.contenu);
  return { ok: true, version: tache.version, updatedAt: tache.updatedAt.toISOString() };
}

/**
 * Purge les médias que le corps de la tâche ne cite plus.
 *
 * ⚠️ Le délai de grâce du socle (`GRACE_ORPHELIN_MS`) est essentiel ici : la
 * sauvegarde part à chaque frappe, et un téléversement en cours n'est encore
 * cité par aucun document — sans lui, on effacerait l'image au moment même où
 * elle arrive.
 */
async function purgerMediasTache(tacheId: string, contenu: unknown): Promise<void> {
  await purgerMediasOrphelins({
    contenu,
    prefixeUrl: PREFIXE_MEDIA_TACHE,
    candidats: (gardes, avant) =>
      prisma.tacheMedia.findMany({
        where: { tacheId, id: { notIn: gardes }, createdAt: { lt: avant } },
        select: { id: true, fichier: true },
      }),
    oublier: async (ids) => {
      await prisma.tacheMedia.deleteMany({ where: { id: { in: ids } } });
    },
  });
}
