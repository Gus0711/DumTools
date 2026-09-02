import "server-only";
import { prisma } from "@/lib/db";
import { etatArret, plusRecente, type EtatArret } from "./arret";
import { EtatAffaire, BesoinArmoire, EtatTache } from "@/generated/prisma/enums";
import type { DomaineVue, MaTacheRow, TacheDetail, TacheRow } from "./taches";
import type { NoteContenu } from "@/tools/notes/model";

export { ETATS_AFFAIRE, etatLabel } from "./etats";

/**
 * Résout un numéro Why vers l'id de l'Affaire (Chantier), en créant l'affaire au
 * besoin (upsert par numeroWhy — clé naturelle). Nécessite un client (une affaire
 * appartient à un client). Retourne null si pas de numéro Why ou pas de client.
 * On n'écrase JAMAIS le nom / l'état d'une affaire existante (édités côté fiche).
 */
export async function resoudreChantierId(
  numeroWhy: string | null | undefined,
  clientId: string | null | undefined,
  nomFallback: string,
): Promise<string | null> {
  const why = (numeroWhy ?? "").trim();
  if (!why || !clientId) return null;
  const c = await prisma.chantier.upsert({
    where: { numeroWhy: why },
    update: {},
    create: { numeroWhy: why, nom: nomFallback.trim() || why, clientId },
    select: { id: true },
  });
  return c.id;
}

export interface AffaireResume {
  id: string;
  nom: string;
  numeroWhy: string | null;
  etat: EtatAffaire;
  clientNom: string;
  updatedAt: Date;
  /** Nombre d'artefacts rattachés, tous outils confondus. */
  nbRealisations: number;
  /** Qui suit l'affaire chez nous. Null = personne d'attitré. */
  suiviParId: string | null;
  suiviParNom: string | null;
  /** « Est-ce que c'est fait ? », lisible sans ouvrir la fiche : combien
   *  d'automates sont arrêtés, combien ont été retouchés depuis, et où en est
   *  le besoin en matériel. Voir lib/chantiers/arret.ts. */
  arret: {
    projetsArretes: number;
    projetsRetouches: number;
    projetsTotal: number;
    bom: EtatArret;
  };
}

/** Liste de toutes les affaires (tableau de bord). */
export async function listerAffaires(): Promise<AffaireResume[]> {
  const affaires = await prisma.chantier.findMany({
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      nom: true,
      numeroWhy: true,
      etat: true,
      updatedAt: true,
      client: { select: { nom: true } },
      suiviPar: { select: { id: true, nom: true } },
      bomArreteeLe: true,
      bomToucheeLe: true,
      _count: { select: { affectations: true } },
      // Deux scalaires par automate — de quoi dériver l'arrêt de tout le
      // tableau de bord sans une requête par ligne (le patron de l'accueil).
      affectations: { select: { arreteLe: true, updatedAt: true } },
    },
  });
  return affaires.map((a) => ({
    id: a.id,
    nom: a.nom,
    numeroWhy: a.numeroWhy,
    etat: a.etat,
    clientNom: a.client.nom,
    updatedAt: a.updatedAt,
    nbRealisations: a._count.affectations,
    suiviParId: a.suiviPar?.id ?? null,
    suiviParNom: a.suiviPar?.nom ?? null,
    arret: {
      projetsArretes: a.affectations.filter((x) => etatArret(x.arreteLe, x.updatedAt) === "arrete")
        .length,
      projetsRetouches: a.affectations.filter(
        (x) => etatArret(x.arreteLe, x.updatedAt) === "retouche",
      ).length,
      projetsTotal: a.affectations.length,
      // Même repère de fraîcheur que `arretBom` (arret-serveur.ts) : le besoin
      // se périme quand un automate bouge OU quand on retouche la liste.
      bom: etatArret(
        a.bomArreteeLe,
        plusRecente(a.bomToucheeLe, ...a.affectations.map((x) => x.updatedAt)),
      ),
    },
  }));
}

/** Tâches (todo) d'une affaire, triées par position dans leur colonne. */
export async function listerTaches(chantierId: string): Promise<TacheRow[]> {
  const taches = await prisma.tacheAffaire.findMany({
    where: { chantierId },
    orderBy: [{ ordre: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      titre: true,
      etat: true,
      ordre: true,
      priorite: true,
      echeance: true,
      assigneId: true,
      assigne: { select: { nom: true } },
    },
  });
  return taches.map((t) => ({
    id: t.id,
    titre: t.titre,
    etat: t.etat,
    ordre: t.ordre,
    priorite: t.priorite,
    echeance: t.echeance ? t.echeance.toISOString().slice(0, 10) : null,
    assigneId: t.assigneId,
    assigneNom: t.assigne?.nom ?? null,
  }));
}

/** Tâches ouvertes assignées à un utilisateur, toutes affaires confondues
 *  (vue « Mes tâches »). Affaires les plus actives d'abord, puis l'ordre des
 *  colonnes du kanban (À faire, En cours) et la position dans la colonne.
 *  Les affaires en Corbeille sont exclues (une affaire clôturée, elle, garde
 *  ses tâches visibles : un reste à faire se fait même après clôture). */
export async function listerMesTaches(userId: string): Promise<MaTacheRow[]> {
  const taches = await prisma.tacheAffaire.findMany({
    where: {
      assigneId: userId,
      etat: { not: EtatTache.TERMINEE },
      // Une tâche INTERNE n'a pas d'affaire : elle ne peut donc pas être
      // écartée par l'état d'une affaire, et elle a toute sa place ici.
      OR: [{ chantierId: null }, { chantier: { etat: { not: EtatAffaire.CORBEILLE } } }],
    },
    orderBy: [{ chantier: { updatedAt: "desc" } }, { etat: "asc" }, { ordre: "asc" }],
    select: {
      id: true,
      titre: true,
      etat: true,
      domaine: { select: { nom: true } },
      client: { select: { nom: true } },
      chantier: { select: { id: true, nom: true, client: { select: { nom: true } } } },
    },
  });
  return taches.map((t) => ({
    id: t.id,
    titre: t.titre,
    etat: t.etat,
    affaireId: t.chantier?.id ?? null,
    affaireNom: t.chantier?.nom ?? null,
    clientNom: t.chantier?.client.nom ?? t.client?.nom ?? null,
    domaineNom: t.domaine?.nom ?? null,
  }));
}

/**
 * TOUTES les tâches — l'écran `/mes-taches`.
 *
 * On charge tout le monde, pas seulement l'utilisateur courant : le filtre
 * « qui » se manipule à l'écran (voir qui n'a rien pris, passer une tâche à un
 * collègue), et un aller-retour serveur par clic sur un filtre rendrait l'écran
 * poisseux. Le volume le permet — quelques dizaines de lignes.
 *
 * `listerMesTaches` (plus haut) reste le strict nécessaire du BLOC d'accueil :
 * ce qui m'est assigné, pas terminé. Les deux ne se remplacent pas.
 *
 * Les affaires en corbeille sont exclues : leurs tâches ne sont pas en retard,
 * elles n'existent plus. Les tâches INTERNES (sans affaire) ne sont jamais
 * concernées par ce filtre — c'est tout l'intérêt.
 */
export async function listerTachesCompletes(): Promise<TacheDetail[]> {
  const taches = await prisma.tacheAffaire.findMany({
    where: {
      OR: [{ chantierId: null }, { chantier: { etat: { not: EtatAffaire.CORBEILLE } } }],
    },
    orderBy: [{ etat: "asc" }, { updatedAt: "desc" }],
    select: {
      id: true,
      titre: true,
      etat: true,
      priorite: true,
      echeance: true,
      contenu: true,
      version: true,
      createdAt: true,
      updatedAt: true,
      assigne: { select: { id: true, nom: true } },
      domaine: { select: { id: true, nom: true } },
      client: { select: { id: true, nom: true } },
      chantier: {
        select: {
          id: true,
          nom: true,
          numeroWhy: true,
          client: { select: { id: true, nom: true } },
        },
      },
    },
  });
  return taches.map((t) => ({
    id: t.id,
    titre: t.titre,
    etat: t.etat,
    priorite: t.priorite,
    // Une échéance est un JOUR, pas un instant : on la sert en `AAAA-MM-JJ`
    // pour qu'elle ne se décale pas d'un jour selon le fuseau du navigateur.
    echeance: t.echeance ? t.echeance.toISOString().slice(0, 10) : null,
    affaireId: t.chantier?.id ?? null,
    affaireNom: t.chantier?.nom ?? null,
    // Le client vient de l'AFFAIRE quand il y en a une, du rattachement direct
    // sinon. Une seule colonne à l'écran, donc une seule valeur ici — c'est
    // `clientDirect` qui dit laquelle des deux voies l'a fournie.
    clientId: t.chantier?.client.id ?? t.client?.id ?? null,
    clientNom: t.chantier?.client.nom ?? t.client?.nom ?? null,
    clientDirect: !t.chantier && !!t.client,
    numeroWhy: t.chantier?.numeroWhy ?? null,
    domaineId: t.domaine?.id ?? null,
    domaineNom: t.domaine?.nom ?? null,
    assigneId: t.assigne?.id ?? null,
    assigneNom: t.assigne?.nom ?? null,
    creeeLe: t.createdAt.toISOString(),
    modifieeLe: t.updatedAt.toISOString(),
    contenu: (t.contenu as NoteContenu | null) ?? null,
    version: t.version,
  }));
}

/** Les domaines où ranger une tâche interne. Les inactifs sont servis aussi :
 *  une tâche ancienne peut en porter un, et il doit rester lisible. */
export async function listerDomainesTache(): Promise<DomaineVue[]> {
  return prisma.domaineTache.findMany({
    orderBy: [{ ordre: "asc" }, { nom: "asc" }],
    select: { id: true, nom: true, actif: true },
  });
}

/** Les clients proposables au rattachement direct d'une tâche. */
export async function listerClientsPourTache(): Promise<{ id: string; nom: string }[]> {
  return prisma.client.findMany({ orderBy: { nom: "asc" }, select: { id: true, nom: true } });
}

/** Les affaires proposables au rattachement d'une tâche (hors corbeille). */
export async function listerAffairesPourTache(): Promise<
  { id: string; nom: string; clientNom: string; numeroWhy: string | null }[]
> {
  const affaires = await prisma.chantier.findMany({
    where: { etat: { not: EtatAffaire.CORBEILLE } },
    orderBy: [{ updatedAt: "desc" }],
    select: { id: true, nom: true, numeroWhy: true, client: { select: { nom: true } } },
  });
  return affaires.map((a) => ({
    id: a.id,
    nom: a.nom,
    clientNom: a.client.nom,
    numeroWhy: a.numeroWhy,
  }));
}

/** Combien de tâches me sont assignées et pas terminées (pastille de la nav) —
 *  mêmes filtres que listerMesTaches, mais un simple COUNT. */
export async function compterMesTaches(userId: string): Promise<number> {
  return prisma.tacheAffaire.count({
    where: {
      assigneId: userId,
      etat: { not: EtatTache.TERMINEE },
      OR: [{ chantierId: null }, { chantier: { etat: { not: EtatAffaire.CORBEILLE } } }],
    },
  });
}

export interface AffaireDetail {
  id: string;
  nom: string;
  numeroWhy: string | null;
  etat: EtatAffaire;
  besoinArmoire: BesoinArmoire | null;
  clientId: string;
  clientNom: string;
  /** Qui suit l'affaire chez nous. Null = personne d'attitré. Le nom est repris
   *  même si le compte a été désactivé depuis : sinon le menu de la fiche, qui
   *  ne liste que les actifs, afficherait « Personne » alors que la base dit le
   *  contraire. */
  suiviParId: string | null;
  suiviParNom: string | null;
}

export async function getAffaire(id: string): Promise<AffaireDetail | null> {
  const a = await prisma.chantier.findUnique({
    where: { id },
    select: {
      id: true,
      nom: true,
      numeroWhy: true,
      etat: true,
      besoinArmoire: true,
      clientId: true,
      suiviParId: true,
      client: { select: { nom: true } },
      suiviPar: { select: { nom: true } },
    },
  });
  if (!a) return null;
  return {
    id: a.id,
    nom: a.nom,
    numeroWhy: a.numeroWhy,
    etat: a.etat,
    besoinArmoire: a.besoinArmoire,
    clientId: a.clientId,
    clientNom: a.client.nom,
    suiviParId: a.suiviParId,
    suiviParNom: a.suiviPar?.nom ?? null,
  };
}
