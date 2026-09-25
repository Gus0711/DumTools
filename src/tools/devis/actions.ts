"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { dureeParId, echeanceDepuis } from "@/lib/partage/model";
import { lireMedia, supprimerMedia } from "@/lib/medias-document/stockage";
import { bomAffaire } from "@/tools/magasin/bom";
import { estCategorie } from "@/tools/documents/model";
import { ecrireSpool } from "@/tools/documents/spool";
import { trouverDoublon } from "@/tools/documents/queries";
import { propositionDestinataire, type ChoixContact } from "./queries";
import * as noyau from "./ecritures";
import {
  BASE_DEVIS,
  LONGUEUR_MAX_MESSAGE,
  dureesPartageDevis,
  ordreEntre,
  paveReprenable,
  peutGererReferentielDevis,
  type ContenuRiche,
} from "./model";

/* =============================================================================
 * ÉCRITURES DE L'OUTIL DEVIS
 *
 * Deux règles portent tout ce fichier :
 *
 *  1. LA GARDE EST ICI, pas seulement sur l'écran. Un écran fermé n'est pas une
 *     autorisation refusée : ces actions exposent le déboursé et les
 *     coefficients de marge de la maison.
 *
 *  2. LE MÉTIER DES ÉCRITURES PARTAGÉES EST DANS LE NOYAU (`./ecritures`) :
 *     créer, chiffrer, réviser, rafraîchir. Le serveur MCP y entre par la même
 *     porte ; l'action n'ajoute que la session et le rafraîchissement des
 *     écrans. Tout ce qui s'affiche y est COPIÉ — une ligne porte son prix,
 *     elle ne pointe pas vers lui.
 * ========================================================================== */

const RACINE = BASE_DEVIS;

function rafraichirEcrans(devisId?: string) {
  revalidatePath(RACINE);
  if (devisId) revalidatePath(`${RACINE}/${devisId}`);
}

interface Acteur {
  id: string;
  role: string | undefined;
}

/** ⚠️ Plus de filtre de rôle ici depuis le 2026-08-12 : l'outil est ouvert à
 *  toute l'équipe (voir la note « DROITS » de model.ts). Écrire un devis ne
 *  demande qu'une session — MODIFIER le référentiel, si (`acteurReferentiel`). */
async function acteur(): Promise<Acteur> {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) throw new Error("Non authentifié");
  return { id, role: session.user.role };
}

async function acteurReferentiel(): Promise<Acteur> {
  const a = await acteur();
  if (!peutGererReferentielDevis(a.role)) {
    throw new Error("Réservé aux profils Achats et Administrateur");
  }
  return a;
}

function texte(v: unknown): string {
  return String(v ?? "").trim();
}

function texteOuNull(v: unknown): string | null {
  const t = texte(v);
  return t === "" ? null : t;
}

function entier(v: unknown, defaut = 0): number {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? n : defaut;
}

function borne(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/* =============================================================================
 * LE DEVIS
 *
 * Les écritures vivent dans `./ecritures` — le NOYAU partagé avec le serveur
 * MCP. Une action n'ajoute ici que ce qui appartient à l'écran : la session
 * (qui écrit) et le rafraîchissement des pages. ⚠️ Une règle métier posée ici
 * plutôt que dans le noyau serait contournée par le MCP sans que rien ne le
 * signale (docs/DEVIS.md §28).
 * ========================================================================== */

export async function creerDevis(saisie: {
  titre?: string;
  clientNom?: string;
  numeroWhy?: string;
  chantierId?: string | null;
}): Promise<{ id: string; numero: string }> {
  const a = await acteur();
  const d = await noyau.creerDevis(a.id, saisie);
  rafraichirEcrans(d.id);
  return d;
}

export async function majEnteteDevis(
  id: string,
  patch: noyau.PatchEnteteDevis,
): Promise<void> {
  const a = await acteur();
  await noyau.majEnteteDevis(a.id, id, patch);
  rafraichirEcrans(id);
}

/**
 * Choisir la personne à qui ce devis est adressé — et la FIGER.
 *
 * Ce qu'on copie ne bougera plus : si M. Dupont quitte la société l'an prochain,
 * ce devis dira toujours qu'il lui a été adressé. `contactId` reste, mais pour
 * proposer un rafraîchissement, pas pour afficher (docs/DEVIS.md §24).
 *
 * Le pavé destinataire ne suit QUE s'il est reprenable : vide, ou encore
 * identique à ce que le référentiel proposait. Sinon on ne touche à rien et
 * l'écran offre le bouton « Reprendre du client ».
 */
export async function definirContactDevis(
  id: string,
  contactId: string | null,
): Promise<{ ok: boolean; error?: string }> {
  const a = await acteur();
  const d = await prisma.devis.findUnique({
    where: { id },
    select: { clientId: true, destinataire: true, contactId: true },
  });
  if (!d) return { ok: false, error: "Devis introuvable" };

  const choix: ChoixContact = contactId ? { mode: "precis", id: contactId } : { mode: "aucun" };
  const propose = await propositionDestinataire(d.clientId, choix);
  if (!propose.ok) {
    // La garde : ce contact n'est pas chez ce client.
    return { ok: false, error: "Ce contact n'appartient pas au client de ce devis" };
  }

  const data: Record<string, unknown> = { ...propose.contact, updatedById: a.id };

  const choixAvant: ChoixContact = d.contactId
    ? { mode: "precis", id: d.contactId }
    : { mode: "aucun" };
  const avant = await propositionDestinataire(d.clientId, choixAvant);
  if (paveReprenable(d.destinataire, avant.pave)) data.destinataire = propose.pave;

  await prisma.devis.update({ where: { id }, data });
  rafraichirEcrans(id);
  return { ok: true };
}

/**
 * Le bouton explicite : réécrire le pavé depuis la fiche client, MAINTENANT.
 *
 * C'est la seule écriture qui écrase un pavé retapé à la main — parce que c'est
 * exactement ce qu'on lui demande. Le reste du mécanisme ne remplit que le vide.
 */
export async function reprendreIdentiteClient(
  id: string,
): Promise<{ ok: boolean; error?: string }> {
  const a = await acteur();
  const d = await prisma.devis.findUnique({
    where: { id },
    select: { clientId: true, contactId: true },
  });
  if (!d) return { ok: false, error: "Devis introuvable" };
  if (!d.clientId) return { ok: false, error: "Ce devis n'est rattaché à aucun client" };

  // On garde la personne déjà choisie si elle tient toujours, sinon le principal
  // du client : reprendre l'adresse ne doit pas changer le destinataire.
  const choix: ChoixContact = d.contactId
    ? { mode: "precis", id: d.contactId }
    : { mode: "principal" };
  let propose = await propositionDestinataire(d.clientId, choix);
  if (!propose.ok) propose = await propositionDestinataire(d.clientId, { mode: "principal" });

  if (!propose.pave) {
    return { ok: false, error: "La fiche de ce client ne porte ni adresse ni contact" };
  }

  await prisma.devis.update({
    where: { id },
    data: { destinataire: propose.pave, ...propose.contact, updatedById: a.id },
  });
  rafraichirEcrans(id);
  return { ok: true };
}

export async function supprimerDevis(id: string): Promise<void> {
  await acteur();
  if (await noyau.supprimerDevis(id)) revalidatePath(RACINE);
}

/** Nouvelle révision : MÊME numéro, révision suivante, prix figés recopiés. */
export async function nouvelleRevision(id: string): Promise<{ id: string }> {
  const a = await acteur();
  const cree = await noyau.nouvelleRevision(a.id, id);
  rafraichirEcrans(cree.id);
  return cree;
}

/** Copie vers un NOUVEAU numéro — ce n'est pas une révision (voir le noyau). */
export async function dupliquerDevis(id: string): Promise<{ id: string; numero: string }> {
  const a = await acteur();
  const cree = await noyau.dupliquerDevis(a.id, id);
  rafraichirEcrans(cree.id);
  return cree;
}

/* =============================================================================
 * LES LOTS
 * ========================================================================== */

export async function ajouterLot(
  devisId: string,
  titre: string,
  options: { rendu?: string } = {},
): Promise<{ id: string }> {
  await acteur();
  const lot = await noyau.ajouterLot(devisId, titre, options);
  rafraichirEcrans(devisId);
  return lot;
}

export async function majLot(
  lotId: string,
  patch: { titre?: string; note?: string; rendu?: string; libelleClient?: string },
): Promise<void> {
  await acteur();
  const { devisId } = await noyau.majLot(lotId, patch);
  rafraichirEcrans(devisId);
}

/** Supprimer un lot ne supprime PAS ses lignes : elles retombent « hors lot »
 *  (onDelete: SetNull). On ne perd jamais du chiffrage en rangeant. */
export async function supprimerLot(lotId: string): Promise<void> {
  await acteur();
  const lot = await prisma.lotDevis.delete({ where: { id: lotId }, select: { devisId: true } });
  rafraichirEcrans(lot.devisId);
}

export async function deplacerLot(lotId: string, sens: "haut" | "bas"): Promise<void> {
  await acteur();
  const lot = await prisma.lotDevis.findUnique({ where: { id: lotId } });
  if (!lot) throw new Error("Lot introuvable");
  const voisin = await prisma.lotDevis.findFirst({
    where: {
      devisId: lot.devisId,
      ordre: sens === "haut" ? { lt: lot.ordre } : { gt: lot.ordre },
    },
    orderBy: { ordre: sens === "haut" ? "desc" : "asc" },
  });
  if (!voisin) return;
  // Échange des positions : deux lots seulement sont touchés, pas de
  // renumérotation globale.
  await prisma.$transaction([
    prisma.lotDevis.update({ where: { id: lot.id }, data: { ordre: voisin.ordre } }),
    prisma.lotDevis.update({ where: { id: voisin.id }, data: { ordre: lot.ordre } }),
  ]);
  rafraichirEcrans(lot.devisId);
}

/* =============================================================================
 * LES LIGNES
 * ========================================================================== */

export async function ajouterLigneProduit(
  devisId: string,
  produitId: string,
  options: { lotId?: string | null; quantiteMillieme?: number } = {},
): Promise<{ id: string }> {
  await acteur();
  const ligne = await noyau.ajouterLigneProduit(devisId, produitId, options);
  rafraichirEcrans(devisId);
  return ligne;
}

export async function ajouterLignePrestation(
  devisId: string,
  prestationId: string,
  options: { lotId?: string | null; quantiteMillieme?: number } = {},
): Promise<{ id: string }> {
  await acteur();
  const ligne = await noyau.ajouterLignePrestation(devisId, prestationId, options);
  rafraichirEcrans(devisId);
  return ligne;
}

export async function ajouterLigneTexte(
  devisId: string,
  options: { lotId?: string | null; texte?: string } = {},
): Promise<{ id: string }> {
  await acteur();
  const ligne = await noyau.ajouterLigneTexte(devisId, options);
  rafraichirEcrans(devisId);
  return ligne;
}

export type SauverTexteLigneResultat = noyau.SauverTexteLigneResultat;

/** Autosave du document riche d'une ligne TEXTE. Volontairement SANS
 *  `revalidatePath` : elle part toutes les 700 ms de frappe, et aucun total ne
 *  dépend d'un texte — qui n'invalide pas affiche son propre état (§14.3). */
export async function sauverTexteLigne(
  ligneId: string,
  data: { contenu: ContenuRiche; versionBase: number },
): Promise<SauverTexteLigneResultat> {
  await acteur();
  return noyau.sauverTexteLigne(ligneId, data);
}

export async function ajouterLigneLibre(
  devisId: string,
  saisie: {
    genre?: string;
    designation: string;
    pvUnitaireCents?: number;
    unite?: string;
    quantiteMillieme?: number;
    lotId?: string | null;
  },
): Promise<{ id: string }> {
  await acteur();
  const ligne = await noyau.ajouterLigneLibre(devisId, saisie);
  rafraichirEcrans(devisId);
  return ligne;
}

export async function majLigne(ligneId: string, patch: noyau.PatchLigne): Promise<void> {
  await acteur();
  const { devisId } = await noyau.majLigne(ligneId, patch);
  rafraichirEcrans(devisId);
}

/**
 * Dupliquer une ligne, JUSTE EN DESSOUS de l'originale.
 *
 * Le geste le plus fréquent du chiffrage après l'ajout : la même sonde à un
 * autre étage, le même automate dans une seconde armoire. Y arriver par le
 * magasin recoûte une recherche — et surtout **recopie le prix
 * d'aujourd'hui** : la copie repart alors sur un déboursé différent de son
 * jumeau, ce que personne ne remarque. On copie donc la LIGNE, telle qu'elle a
 * été chiffrée (principe n°1 : le devis fige).
 *
 * Ce qui NE se copie pas : le document riche d'une ligne TEXTE se copie bien,
 * lui — ses images sont parentées au devis, pas à la ligne, et le devis est le
 * même. Rien à recopier sur le disque.
 */
export async function dupliquerLigne(ligneId: string): Promise<{ id: string }> {
  await acteur();
  const l = await prisma.ligneDevis.findUnique({ where: { id: ligneId } });
  if (!l) throw new Error("Ligne introuvable");

  // La copie se glisse entre l'originale et sa voisine du dessous : on la
  // retrouve sous les doigts, pas en bas d'un lot de quarante lignes.
  const suivante = await prisma.ligneDevis.findFirst({
    where: { devisId: l.devisId, lotId: l.lotId, ordre: { gt: l.ordre } },
    orderBy: { ordre: "asc" },
    select: { ordre: true },
  });

  const copie = await prisma.ligneDevis.create({
    data: {
      devisId: l.devisId,
      lotId: l.lotId,
      ordre: ordreEntre(l.ordre, suivante?.ordre ?? null),
      genre: l.genre,
      produitId: l.produitId,
      prestationId: l.prestationId,
      designation: l.designation,
      contenu: l.contenu === null ? Prisma.DbNull : (l.contenu as Prisma.InputJsonValue),
      refInterne: l.refInterne,
      unite: l.unite,
      quantiteMillieme: l.quantiteMillieme,
      debourseCents: l.debourseCents,
      coefMillieme: l.coefMillieme,
      origineCoef: l.origineCoef,
      pvUnitaireCents: l.pvUnitaireCents,
      remisePourMille: l.remisePourMille,
      option: l.option,
      note: l.note,
    },
    select: { id: true },
  });

  rafraichirEcrans(l.devisId);
  return copie;
}

export async function supprimerLigne(ligneId: string): Promise<void> {
  await acteur();
  const { devisId } = await noyau.supprimerLigne(ligneId);
  rafraichirEcrans(devisId);
}

export async function deplacerLigne(ligneId: string, sens: "haut" | "bas"): Promise<void> {
  await acteur();
  const ligne = await prisma.ligneDevis.findUnique({ where: { id: ligneId } });
  if (!ligne) throw new Error("Ligne introuvable");
  const voisin = await prisma.ligneDevis.findFirst({
    where: {
      devisId: ligne.devisId,
      lotId: ligne.lotId,
      ordre: sens === "haut" ? { lt: ligne.ordre } : { gt: ligne.ordre },
    },
    orderBy: { ordre: sens === "haut" ? "desc" : "asc" },
  });
  if (!voisin) return;
  await prisma.$transaction([
    prisma.ligneDevis.update({ where: { id: ligne.id }, data: { ordre: voisin.ordre } }),
    prisma.ligneDevis.update({ where: { id: voisin.id }, data: { ordre: ligne.ordre } }),
  ]);
  rafraichirEcrans(ligne.devisId);
}

/**
 * Réordonne un lot d'un bloc, à partir de la liste ORDONNÉE de ses lignes.
 *
 * C'est le geste du glisser-déposer. On renvoie l'ordre complet du lot plutôt
 * qu'un « insère celle-ci avant celle-là » : une seule écriture, aucun calcul de
 * point médian, et le résultat ne peut pas diverger de ce que l'écran affichait.
 *
 * `lotIdCible` sert aussi à DÉPLACER une ligne d'un lot à l'autre : toute ligne
 * citée ici se voit affecter ce lot, quel que soit celui d'où elle vient.
 */
export async function reordonnerLignes(
  devisId: string,
  lotIdCible: string | null,
  idsOrdonnes: string[],
): Promise<void> {
  await acteur();
  if (idsOrdonnes.length === 0) return;

  // On ne réordonne que des lignes de CE devis : un id venu d'ailleurs (onglet
  // resté ouvert, copier-coller d'URL) ne doit pas pouvoir déplacer autre chose.
  const lignes = await prisma.ligneDevis.findMany({
    where: { devisId, id: { in: idsOrdonnes } },
    select: { id: true },
  });
  const connues = new Set(lignes.map((l) => l.id));
  const lot = texteOuNull(lotIdCible);

  await prisma.$transaction(
    idsOrdonnes
      .filter((id) => connues.has(id))
      .map((id, i) =>
        prisma.ligneDevis.update({
          where: { id },
          data: { ordre: (i + 1) * 1000, lotId: lot },
        }),
      ),
  );
  rafraichirEcrans(devisId);
}

/* =============================================================================
 * LE RAFRAÎCHISSEMENT — le seul endroit où le référentiel reprend la main, et
 * seulement parce qu'on le lui demande (voir le noyau).
 * ========================================================================== */

export async function rafraichirLignes(
  devisId: string,
  ligneIds?: string[],
): Promise<{ misesAJour: number }> {
  await acteur();
  const r = await noyau.rafraichirLignes(devisId, ligneIds);
  rafraichirEcrans(devisId);
  return r;
}

/* =============================================================================
 * LA REPRISE DE LA BOM D'UNE AFFAIRE
 * ========================================================================== */

export interface LigneReprise {
  produitId: string;
  refInterne: string;
  designation: string;
  unite: string;
  categorieNom: string | null;
  besoin: number;
  debourseCents: number | null;
  horsFourniture: boolean;
  origines: string[];
}

export interface ApercuReprise {
  lignes: LigneReprise[];
  /** Ce que la BOM ne sait pas chiffrer — annoncé, jamais versé en silence. */
  trous: { nom: string; genre: string; occurrences: number }[];
  projets: { id: string; nom: string }[];
}

/** Aperçu de ce qu'une affaire apporterait : on montre AVANT de verser. */
export async function apercuReprise(chantierId: string): Promise<ApercuReprise> {
  await acteur();
  const bom = await bomAffaire(chantierId);
  return {
    lignes: bom.lignes.map((l) => ({
      produitId: l.produitId,
      refInterne: l.refInterne,
      designation: l.designation,
      unite: l.unite,
      categorieNom: l.categorieNom,
      besoin: l.besoin,
      debourseCents: l.pmpCents,
      horsFourniture: l.horsFourniture,
      origines: l.origines.map((o) => o.libelle),
    })),
    trous: bom.trous.map((t) => ({ nom: t.nom, genre: t.genre, occurrences: t.occurrences })),
    projets: bom.projets,
  };
}

/** Verse la sélection dans un lot : on copie, on ne synchronise pas. */
export async function reprendreBom(
  devisId: string,
  chantierId: string,
  produitIds: string[],
  options: { titreLot?: string } = {},
): Promise<{ ajoutees: number; lotId: string | null }> {
  await acteur();
  const r = await noyau.reprendreBom(devisId, chantierId, produitIds, options);
  if (r.ajoutees > 0) rafraichirEcrans(devisId);
  return r;
}

/* =============================================================================
 * LES RÉFÉRENTIELS (prestations & coefficients)
 * ========================================================================== */

export async function enregistrerPrestation(saisie: {
  id?: string;
  libelle: string;
  unite?: string;
  prixVenteCents?: number;
  famille?: string;
  ordre?: number;
  actif?: boolean;
  note?: string;
}): Promise<{ id: string }> {
  await acteurReferentiel();
  const libelle = texte(saisie.libelle);
  if (!libelle) throw new Error("Un libellé est nécessaire");

  const data = {
    libelle,
    unite: texte(saisie.unite) || "h",
    prixVenteCents: Math.max(0, entier(saisie.prixVenteCents)),
    famille: texte(saisie.famille),
    ordre: entier(saisie.ordre),
    actif: saisie.actif === undefined ? true : Boolean(saisie.actif),
    note: texte(saisie.note),
  };

  const p = saisie.id
    ? await prisma.prestation.update({ where: { id: saisie.id }, data, select: { id: true } })
    : await prisma.prestation.create({ data, select: { id: true } });
  revalidatePath(`${RACINE}/referentiels`);
  revalidatePath(RACINE);
  return p;
}

/** Supprimer une prestation encore portée par un devis effacerait du chiffrage :
 *  on archive à la place (elle quitte les choix, elle reste sur les devis). */
export async function supprimerPrestation(id: string): Promise<{ archivee: boolean }> {
  await acteurReferentiel();
  const nb = await prisma.ligneDevis.count({ where: { prestationId: id } });
  if (nb > 0) {
    await prisma.prestation.update({ where: { id }, data: { actif: false } });
    revalidatePath(`${RACINE}/referentiels`);
    return { archivee: true };
  }
  await prisma.prestation.delete({ where: { id } });
  revalidatePath(`${RACINE}/referentiels`);
  return { archivee: false };
}

export async function enregistrerCoef(saisie: {
  portee: string;
  cibleId?: string | null;
  coefMillieme: number;
  note?: string;
}): Promise<void> {
  const a = await acteurReferentiel();
  const portee = texte(saisie.portee).toUpperCase();
  if (portee !== "GLOBAL" && portee !== "CATEGORIE" && portee !== "PRODUIT") {
    throw new Error("Portée inconnue");
  }
  const cibleId = portee === "GLOBAL" ? null : texteOuNull(saisie.cibleId);
  if (portee !== "GLOBAL" && !cibleId) throw new Error("Une cible est nécessaire");

  const coefMillieme = entier(saisie.coefMillieme);
  if (coefMillieme <= 0) throw new Error("Le coefficient doit être supérieur à zéro");

  // `@@unique([portee, cibleId])` : régler deux fois la même cible met à jour,
  // ça n'empile pas deux règles contradictoires.
  const existant = await prisma.coefVente.findFirst({ where: { portee, cibleId } });
  if (existant) {
    await prisma.coefVente.update({
      where: { id: existant.id },
      data: { coefMillieme, note: texte(saisie.note), updatedById: a.id },
    });
  } else {
    await prisma.coefVente.create({
      data: { portee, cibleId, coefMillieme, note: texte(saisie.note), updatedById: a.id },
    });
  }
  revalidatePath(`${RACINE}/referentiels`);
  revalidatePath(RACINE);
}

/** Retirer une règle : les devis déjà chiffrés ne bougent pas (leur coefficient
 *  est copié) — seuls les prochains ajouts retomberont sur l'étage du dessus. */
export async function supprimerCoef(id: string): Promise<void> {
  await acteurReferentiel();
  await prisma.coefVente.delete({ where: { id } });
  revalidatePath(`${RACINE}/referentiels`);
}

/* =============================================================================
 * L'IDENTITÉ DE LA MAISON
 *
 * Réservée au référentiel : ce sont les mentions légales et les conditions de
 * vente de l'entreprise, pas un réglage d'écran. Une seule ligne en base, d'où
 * l'upsert sur un id fixe.
 * ========================================================================== */

export async function enregistrerSociete(saisie: Record<string, unknown>): Promise<void> {
  await acteurReferentiel();

  const champsTexte = [
    "raisonSociale",
    "formeCapital",
    "adresse",
    "codePostal",
    "ville",
    "telephone",
    "email",
    "siteWeb",
    "rcs",
    "codeApe",
    "tvaIntracom",
    "iban",
    "bic",
    "reglement",
    "conditionsReglement",
    "dureeRealisation",
    "remarques",
  ] as const;

  const data: Record<string, unknown> = {};
  for (const cle of champsTexte) {
    if (saisie[cle] !== undefined) data[cle] = texte(saisie[cle]);
  }
  if (saisie.acomptePourMille !== undefined) {
    // 0 = pas d'acompte (la ligne disparaît du document) ; 1000 = payé d'avance.
    data.acomptePourMille = borne(entier(saisie.acomptePourMille, 0), 0, 1000);
  }

  await prisma.reglageSociete.upsert({
    where: { id: "societe" },
    update: data,
    create: { id: "societe", ...data },
  });
  revalidatePath(`${RACINE}/referentiels`);
}

/* =============================================================================
 * LA PUBLICATION — le lien qu'on envoie au client
 *
 * Le lien montre le devis À SA SOURCE (pas un instantané) : c'est le choix pris
 * le 2026-08-08, et il a une conséquence qu'on assume plutôt que de la cacher —
 * modifier un devis publié change ce que le client voit. D'où, sur le document,
 * la date de mise à jour en clair, et ici le journal de consultation : « il l'a
 * ouvert hier » est ce qui dit s'il faut le prévenir.
 *
 * Le jeton est un UUID v4 : non devinable, et l'app est exposée sur internet.
 * ========================================================================== */

/** Résout une durée de partage offerte pour CE devis en échéance absolue. */
function echeancePartage(dureeId: string, validiteJours: number): Date | null {
  const duree = dureeParId(texte(dureeId), dureesPartageDevis(validiteJours));
  if (!duree) throw new Error("Durée de partage inconnue");
  // Le catalogue du devis n'offre AUCUN « sans limite » : un lien qui survit à
  // l'offre qu'il porte laisse un prix périmé accessible au monde entier.
  if (duree.heures === null) throw new Error("Un devis se partage toujours pour une durée");
  return echeanceDepuis(duree.heures);
}

/**
 * Publie le devis : pose le jeton, l'échéance, et la date d'établissement.
 *
 * Passe le devis en ÉMIS s'il était en brouillon — publier EST l'émission, et
 * laisser un devis « brouillon » dont le client a le lien serait un mensonge de
 * plus dans la liste. L'état se corrige à la main juste au-dessus si besoin.
 */
export async function publierDevis(
  id: string,
  dureeId: string,
): Promise<{ jeton: string; expireLe: string | null }> {
  const a = await acteur();
  const d = await prisma.devis.findUnique({
    where: { id },
    select: { validiteJours: true, etat: true, emisLe: true, publieLe: true, jetonPartage: true },
  });
  if (!d) throw new Error("Devis introuvable");

  const maintenant = new Date();
  const jeton = d.jetonPartage ?? randomUUID();
  const expireLe = echeancePartage(dureeId, d.validiteJours);

  await prisma.devis.update({
    where: { id },
    data: {
      jetonPartage: jeton,
      partageExpireLe: expireLe,
      // La date d'établissement se pose UNE fois : republier après une
      // correction ne redate pas l'offre (et ne relance donc pas sa validité).
      publieLe: d.publieLe ?? maintenant,
      ...(d.etat === "BROUILLON" ? { etat: "EMIS" as const } : {}),
      ...(d.emisLe ? {} : { emisLe: maintenant }),
      updatedById: a.id,
    },
  });
  rafraichirEcrans(id);
  return { jeton, expireLe: expireLe?.toISOString() ?? null };
}

/** Repousse l'échéance SANS changer le jeton : le lien déjà envoyé survit. */
export async function prolongerPartageDevis(
  id: string,
  dureeId: string,
): Promise<{ expireLe: string | null }> {
  const a = await acteur();
  const d = await prisma.devis.findUnique({
    where: { id },
    select: { validiteJours: true, jetonPartage: true },
  });
  if (!d) throw new Error("Devis introuvable");
  if (!d.jetonPartage) throw new Error("Ce devis n'a pas encore de lien");

  const expireLe = echeancePartage(dureeId, d.validiteJours);
  await prisma.devis.update({
    where: { id },
    data: { partageExpireLe: expireLe, updatedById: a.id },
  });
  rafraichirEcrans(id);
  return { expireLe: expireLe?.toISOString() ?? null };
}

/**
 * Coupe le lien. Le jeton est EFFACÉ, pas seulement échu : republier donnera une
 * autre URL. C'est la différence avec « laisser expirer » — on révoque quand le
 * document ne doit plus être lu, y compris par qui a gardé le lien.
 *
 * Les consultations restent : elles disent ce qui a été lu, et effacer la trace
 * d'une lecture n'a jamais aidé personne.
 */
export async function revoquerPartageDevis(id: string): Promise<void> {
  const a = await acteur();
  await prisma.devis.update({
    where: { id },
    data: { jetonPartage: null, partageExpireLe: null, updatedById: a.id },
  });
  rafraichirEcrans(id);
}

/* =============================================================================
 * AJOUT AVEC ASSOCIÉS
 * ========================================================================== */

/**
 * Pose le produit déclencheur ET les associés retenus, dans l'ordre, en une
 * seule opération.
 *
 * Une par une plutôt qu'un `createMany` : chaque ligne doit rejouer la cascade
 * du coefficient POUR SON article (l'automate est en catégorie « Automate »
 * à ×1,25, son alimentation peut-être pas). Un lot d'insertion perdrait
 * exactement ce qui fait la valeur du chiffrage.
 *
 * Le déclencheur d'abord : un devis se lit dans l'ordre où on l'a composé, et
 * l'accessoire se lit sous l'article qui l'appelle.
 */
export async function ajouterProduitAvecAssocies(
  devisId: string,
  lignes: { produitId: string; quantiteMillieme: number }[],
  options: { lotId?: string | null } = {},
): Promise<{ ajoutees: number }> {
  await acteur();
  const lotId = texteOuNull(options.lotId ?? null);

  let ajoutees = 0;
  for (const l of lignes) {
    const produitId = texte(l.produitId);
    if (!produitId) continue;
    await noyau.ajouterLigneProduit(devisId, produitId, {
      lotId,
      quantiteMillieme: Math.max(1, entier(l.quantiteMillieme, 1000)),
    });
    ajoutees += 1;
  }
  rafraichirEcrans(devisId);
  return { ajoutees };
}


/* =============================================================================
 * LE FIL DU DEVIS (docs/DEVIS-FIL.md)
 *
 * ⚠️ AUCUN `revalidatePath` ici. Le fil tient son propre état et pose le message
 * localement — aucun total ne dépend d'un message, et invalider l'écran à
 * chaque frappe rejouerait les trois pièges mesurés au §20 de DEVIS.md. La
 * contrepartie est la règle du §14.3 : qui n'invalide pas doit afficher son
 * propre état.
 * ========================================================================== */

/** Le fil d'un devis, c'est celui de sa CHAÎNE. Un devis d'avant la reprise
 *  (filId vide) est sa propre racine. */
async function filDe(devisId: string): Promise<{ devisId: string; filId: string }> {
  const d = await prisma.devis.findUnique({
    where: { id: devisId },
    select: { id: true, filId: true },
  });
  if (!d) throw new Error("Devis introuvable");
  return { devisId: d.id, filId: d.filId || d.id };
}

export async function posterMessage(
  devisId: string,
  saisie: { corps?: string; pieces?: string[] },
): Promise<{ id: string }> {
  const a = await acteur();
  const { filId } = await filDe(devisId);

  const corps = texte(saisie.corps).slice(0, LONGUEUR_MAX_MESSAGE);
  const pieces = (saisie.pieces ?? []).filter((x) => typeof x === "string" && x.length > 0);
  // Un message vide n'est pas un message — sauf s'il porte une pièce jointe :
  // envoyer une photo sans commentaire est un geste normal.
  if (!corps && pieces.length === 0) throw new Error("Message vide");

  const message = await prisma.messageDevis.create({
    data: { filId, devisId, corps, auteurId: a.id },
    select: { id: true },
  });

  // Les pièces ont été téléversées AVANT le message (la route média les crée
  // rattachées au devis). On les raccroche maintenant — et on vérifie qu'elles
  // appartiennent bien à ce devis : un id de média ne se devine pas, mais il
  // se recopie.
  if (pieces.length > 0) {
    await prisma.devisMedia.updateMany({
      where: { id: { in: pieces }, devisId, messageId: null },
      data: { messageId: message.id },
    });
  }
  return message;
}

export async function modifierMessage(messageId: string, corps: string): Promise<void> {
  const a = await acteur();
  const m = await prisma.messageDevis.findUnique({
    where: { id: messageId },
    select: { auteurId: true, evenement: true },
  });
  if (!m) throw new Error("Message introuvable");
  // Un fait ne se réécrit pas : il s'est produit.
  if (m.evenement) throw new Error("Un événement ne se modifie pas");
  if (m.auteurId !== a.id) throw new Error("On ne modifie que ses propres messages");

  const t = texte(corps).slice(0, LONGUEUR_MAX_MESSAGE);
  if (!t) throw new Error("Message vide");
  await prisma.messageDevis.update({
    where: { id: messageId },
    data: { corps: t, modifieLe: new Date() },
  });
}

/**
 * Suppression FRANCHE — pas de « message supprimé » en pierre tombale : à trois
 * personnes, la bureaucratie du tombstone coûte plus qu'elle ne rapporte.
 * Les pièces jointes partent avec (cascade en base) — mais leurs BINAIRES ne
 * partent pas tout seuls : on les efface d'abord, sinon ils resteraient sur le
 * disque sans plus rien pour les désigner (même geste que `supprimerDevis`).
 */
export async function supprimerMessage(messageId: string): Promise<void> {
  const a = await acteur();
  const m = await prisma.messageDevis.findUnique({
    where: { id: messageId },
    select: { auteurId: true, pieces: { select: { fichier: true } } },
  });
  if (!m) return;
  if (m.auteurId !== a.id && a.role !== "ADMIN") {
    throw new Error("On ne supprime que ses propres messages");
  }
  await Promise.all(m.pieces.map((x) => supprimerMedia(x.fichier)));
  await prisma.messageDevis.delete({ where: { id: messageId } });
}

/** Épingler : « le client veut la livraison en octobre » ne doit pas se perdre
 *  dans le défilement. Chacun peut épingler — c'est une aide de lecture
 *  partagée, pas une propriété. */
export async function epinglerMessage(messageId: string, epingle: boolean): Promise<void> {
  await acteur();
  await prisma.messageDevis.update({
    where: { id: messageId },
    data: { epingle: !!epingle },
  });
}

/** « J'ai lu » — écrit à l'OUVERTURE DE L'ONGLET, pas au chargement de la page :
 *  ouvrir un devis pour corriger un prix ne vaut pas une lecture. */
export async function marquerFilLu(devisId: string): Promise<void> {
  const a = await acteur();
  const { filId } = await filDe(devisId);
  const vuLe = new Date();
  await prisma.lectureFilDevis.upsert({
    where: { userId_filId: { userId: a.id, filId } },
    create: { userId: a.id, filId, vuLe },
    update: { vuLe },
  });
}


/* --- Le versement d'une pièce vers la GED de l'affaire ----------------------
 * PONCTUEL, jamais une synchronisation : le fil et la GED ne peuvent pas rester
 * d'accord (le devis fige, l'affaire vit). Le versement COPIE — la pièce reste
 * dans le fil.
 *
 * ⚠️ Condition d'existence : `Devis.chantierId` est nullable, `Document.chantierId`
 * ne l'est pas. Sans affaire il n'y a nulle part où verser — l'écran n'affiche
 * donc pas le bouton, et l'action refuse en clair plutôt que de créer une ligne
 * orpheline. (docs/DEVIS-FIL.md §8.1)
 * -------------------------------------------------------------------------- */
export async function verserPieceAuGed(
  pieceId: string,
  options: { categorie?: string; mode?: "" | "ecraser" | "renommer" } = {},
): Promise<{ ok: true } | { doublon: true; nom: string }> {
  const a = await acteur();

  const piece = await prisma.devisMedia.findUnique({
    where: { id: pieceId },
    select: {
      id: true,
      nom: true,
      mimeType: true,
      taille: true,
      fichier: true,
      messageId: true,
      devis: { select: { chantierId: true } },
    },
  });
  if (!piece) throw new Error("Pièce introuvable");
  if (!piece.messageId) throw new Error("Cette pièce n'appartient pas au fil");

  const chantierId = piece.devis?.chantierId ?? null;
  if (!chantierId) {
    throw new Error("Rattachez le devis à une affaire pour verser dans la GED");
  }

  const categorie = options.categorie && estCategorie(options.categorie)
    ? options.categorie
    : "Vente";

  const chantier = await prisma.chantier.findUnique({
    where: { id: chantierId },
    select: { id: true, clientId: true, numeroWhy: true },
  });
  if (!chantier) throw new Error("Affaire introuvable");

  // Même question que l'outil Documents pose au dépôt, avec le même couple de
  // réponses : écraser (nouvelle version kDrive) ou renommer.
  const doublon = await trouverDoublon(chantierId, categorie, piece.nom);
  if (doublon && !options.mode) return { doublon: true, nom: piece.nom };

  const cible =
    doublon && options.mode === "ecraser"
      ? doublon
      : await prisma.document.create({
          data: {
            nom: piece.nom,
            categorie,
            mimeType: piece.mimeType,
            taille: piece.taille,
            chantierId,
            clientId: chantier.clientId,
            numeroWhy: chantier.numeroWhy,
            politiqueConflit: options.mode === "renommer" ? "RENAME" : "VERSION",
            statutSync: "EN_ATTENTE",
            createdById: a.id,
          },
          select: { id: true },
        });

  // Le binaire est RELU depuis le disque des devis et RECOPIÉ dans le spool :
  // les deux dépôts sont séparés, et la pièce doit survivre à la purge de l'un
  // comme à celle de l'autre.
  const binaire = await lireMedia(piece.fichier);
  const spoolPath = await ecrireSpool(cible.id, piece.nom, binaire);
  await prisma.document.update({
    where: { id: cible.id },
    data: { spoolPath, statutSync: "EN_ATTENTE", tentatives: 0, syncError: null },
  });

  await prisma.devisMedia.update({
    where: { id: pieceId },
    data: { verseeLe: new Date() },
  });
  return { ok: true };
}
