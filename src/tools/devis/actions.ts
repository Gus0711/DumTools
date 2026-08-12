"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { resoudreClientId } from "@/lib/clients/queries";
import { resoudreChantierId } from "@/lib/chantiers/queries";
import { purgerMediasOrphelins } from "@/lib/medias-document/purge";
import { dureeParId, echeanceDepuis } from "@/lib/partage/model";
import { ecrireMedia, lireMedia, supprimerMedia } from "@/lib/medias-document/stockage";
import { prixParProduit, prixReference } from "@/tools/magasin/queries";
import { bomAffaire } from "@/tools/magasin/bom";
import { estCategorie } from "@/tools/documents/model";
import { ecrireSpool } from "@/tools/documents/spool";
import { trouverDoublon } from "@/tools/documents/queries";
import { grilleCoefs } from "./queries";
import { DEPOT_MEDIAS_DEVIS } from "./stockage";
import {
  PREFIXE_MEDIA_DEVIS,
  RANG_DEVIS_MAX,
  TEXTE_LIGNE_REPLI,
  coefApplicable,
  contenuTexteSimple,
  LONGUEUR_MAX_MESSAGE,
  dureesPartageDevis,
  estEtatDevis,
  evenementDEtat,
  estGenreLigne,
  estRenduLot,
  formatNumeroDevis,
  ordreEntre,
  peutGererReferentielDevis,
  peutVoirDevis,
  pvDepuisDebourse,
  resumeTexteLigne,
  type ContenuRiche,
  type EvenementEnregistre,
  type GenreLigne,
  type OrigineCoef,
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
 *  2. TOUT CE QUI S'AFFICHE EST COPIÉ. Une ligne ne « pointe » pas vers un prix,
 *     elle le porte. Le référentiel n'est relu que sur demande explicite
 *     (rafraichirLignes) — jamais au fil de l'eau.
 * ========================================================================== */

const RACINE = "/perso/gus/devis";

function rafraichirEcrans(devisId?: string) {
  revalidatePath(RACINE);
  if (devisId) revalidatePath(`${RACINE}/${devisId}`);
}

interface Acteur {
  id: string;
  role: string | undefined;
}

async function acteur(): Promise<Acteur> {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) throw new Error("Non authentifié");
  if (!peutVoirDevis(session.user.role)) {
    throw new Error("Réservé aux profils Achats et Administrateur");
  }
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
 * LA NUMÉROTATION — DT{AA}{NNNN}
 * ========================================================================== */

/**
 * Attribue le rang suivant de l'année, de façon ATOMIQUE.
 *
 * Un `max + 1` lu puis écrit donnerait deux fois le même numéro sur deux
 * créations simultanées — et un numéro de devis en double est un incident, pas
 * un détail. L'INSERT … ON CONFLICT DO UPDATE règle le premier passage de
 * l'année et les suivants d'une seule instruction.
 */
async function prochainRang(annee: number): Promise<number> {
  const lignes = await prisma.$queryRaw<{ dernier: number }[]>`
    INSERT INTO "CompteurDevis" ("annee", "dernier") VALUES (${annee}, 1)
    ON CONFLICT ("annee") DO UPDATE SET "dernier" = "CompteurDevis"."dernier" + 1
    RETURNING "dernier"`;
  const rang = lignes[0]?.dernier ?? 1;
  if (rang > RANG_DEVIS_MAX) {
    // Refuser plutôt que produire un « DT2610000 » à 9 caractères que personne
    // n'attend et qu'aucun tri n'ordonnera correctement.
    throw new Error(
      `Le compteur ${annee} a dépassé ${RANG_DEVIS_MAX} devis : le format DT{AA}{NNNN} ne suffit plus.`,
    );
  }
  return rang;
}

/* =============================================================================
 * LE DEVIS
 * ========================================================================== */

export async function creerDevis(saisie: {
  titre?: string;
  clientNom?: string;
  numeroWhy?: string;
  chantierId?: string | null;
}): Promise<{ id: string; numero: string }> {
  const a = await acteur();

  const clientNom = texte(saisie.clientNom);
  const numeroWhy = texteOuNull(saisie.numeroWhy);
  const titre = texte(saisie.titre);

  const clientId = await resoudreClientId(clientNom);
  // Rattachement à l'affaire : soit choisie explicitement, soit résolue par son
  // n° Why (convention de la maison — on référence, on ne recopie pas).
  const chantierId =
    texteOuNull(saisie.chantierId) ??
    (await resoudreChantierId(numeroWhy, clientId, titre || (numeroWhy ?? "")));

  // Si l'affaire vient d'un choix explicite, on hérite de son client et de son
  // n° Why plutôt que de laisser deux vérités se contredire.
  let nomClientRetenu = clientNom;
  let whyRetenu = numeroWhy;
  let clientIdRetenu = clientId;
  if (chantierId) {
    const ch = await prisma.chantier.findUnique({
      where: { id: chantierId },
      select: { numeroWhy: true, clientId: true, client: { select: { nom: true } } },
    });
    if (ch) {
      nomClientRetenu = clientNom || ch.client.nom;
      whyRetenu = numeroWhy ?? ch.numeroWhy;
      clientIdRetenu = clientId ?? ch.clientId;
    }
  }

  const grille = await grilleCoefs();
  const annee = new Date().getFullYear();
  const numero = formatNumeroDevis(annee, await prochainRang(annee));

  const d = await prisma.devis.create({
    data: {
      numero,
      revision: 1,
      titre,
      clientNom: nomClientRetenu,
      clientId: clientIdRetenu,
      numeroWhy: whyRetenu,
      chantierId,
      // Le coefficient global est COPIÉ, pas référencé : réviser la politique de
      // la maison ne doit pas modifier un devis déjà chiffré.
      coefDefautMillieme: grille.globalMillieme,
      createdById: a.id,
      updatedById: a.id,
    },
    select: { id: true, numero: true },
  });
  // Un devis neuf ouvre SON PROPRE fil. `filId` ne peut pas être posé dans le
  // `create` — l'id n'existe pas encore : une seconde écriture, immédiate.
  await prisma.devis.update({ where: { id: d.id }, data: { filId: d.id } });
  rafraichirEcrans(d.id);
  return d;
}

export async function majEnteteDevis(
  id: string,
  patch: {
    titre?: string;
    clientNom?: string;
    numeroWhy?: string | null;
    chantierId?: string | null;
    coefDefautMillieme?: number;
    tauxTvaCentieme?: number;
    remiseGlobalePourMille?: number | null;
    remiseGlobaleCents?: number | null;
    validiteJours?: number;
    etat?: string;
    destinataire?: string;
    montrerPrixUnitaires?: boolean;
    montrerSousTotauxLots?: boolean;
    montrerOptions?: boolean;
  },
): Promise<void> {
  const a = await acteur();
  const actuel = await prisma.devis.findUnique({
    where: { id },
    select: { etat: true, emisLe: true },
  });
  if (!actuel) throw new Error("Devis introuvable");

  const data: Record<string, unknown> = { updatedById: a.id };

  if (patch.titre !== undefined) data.titre = texte(patch.titre);
  // Le pavé destinataire garde ses RETOURS À LA LIGNE : c'est une adresse, elle
  // s'imprime telle qu'on l'a saisie. Seuls les blancs de bord sautent.
  if (patch.destinataire !== undefined) {
    data.destinataire = String(patch.destinataire ?? "")
      .split("\n")
      .map((l) => l.trimEnd())
      .join("\n")
      .trim();
  }
  if (patch.montrerPrixUnitaires !== undefined) {
    data.montrerPrixUnitaires = !!patch.montrerPrixUnitaires;
  }
  if (patch.montrerSousTotauxLots !== undefined) {
    data.montrerSousTotauxLots = !!patch.montrerSousTotauxLots;
  }
  if (patch.montrerOptions !== undefined) data.montrerOptions = !!patch.montrerOptions;
  if (patch.validiteJours !== undefined) {
    data.validiteJours = borne(entier(patch.validiteJours, 30), 0, 3650);
  }
  if (patch.coefDefautMillieme !== undefined) {
    const c = entier(patch.coefDefautMillieme, 1000);
    if (c <= 0) throw new Error("Le coefficient doit être supérieur à zéro");
    data.coefDefautMillieme = c;
  }
  if (patch.tauxTvaCentieme !== undefined) {
    data.tauxTvaCentieme = borne(entier(patch.tauxTvaCentieme, 2000), 0, 10_000);
  }

  // La remise globale est EXCLUSIVE : poser l'une efface l'autre, sans quoi on
  // ne saurait plus laquelle s'applique.
  if (patch.remiseGlobalePourMille !== undefined) {
    const v = patch.remiseGlobalePourMille;
    data.remiseGlobalePourMille = v === null ? null : borne(entier(v), 0, 1000);
    if (v !== null) data.remiseGlobaleCents = null;
  }
  if (patch.remiseGlobaleCents !== undefined) {
    const v = patch.remiseGlobaleCents;
    data.remiseGlobaleCents = v === null ? null : Math.max(0, entier(v));
    if (v !== null) data.remiseGlobalePourMille = null;
  }

  if (patch.clientNom !== undefined) {
    const nom = texte(patch.clientNom);
    data.clientNom = nom;
    data.clientId = await resoudreClientId(nom);
  }
  if (patch.numeroWhy !== undefined) data.numeroWhy = texteOuNull(patch.numeroWhy);
  if (patch.chantierId !== undefined) {
    const cid = texteOuNull(patch.chantierId);
    data.chantierId = cid;
    if (cid) {
      const ch = await prisma.chantier.findUnique({
        where: { id: cid },
        select: { numeroWhy: true, clientId: true, client: { select: { nom: true } } },
      });
      if (ch) {
        // Rattacher à une affaire aligne le client et le n° Why : deux vérités
        // qui se contredisent sur un devis, c'est un devis qu'on n'envoie pas.
        data.clientNom = ch.client.nom;
        data.clientId = ch.clientId;
        data.numeroWhy = ch.numeroWhy;
      }
    }
  }

  if (patch.etat !== undefined) {
    if (!estEtatDevis(patch.etat)) throw new Error("État inconnu");
    data.etat = patch.etat;
    // La date d'émission se pose UNE fois : repasser en brouillon puis réémettre
    // ne doit pas réécrire l'histoire.
    if (patch.etat === "EMIS" && !actuel.emisLe) data.emisLe = new Date();
  }

  await prisma.devis.update({ where: { id }, data });

  /* Le fil garde la trace des réponses du client. ⚠️ On n'enregistre QUE ce
     qu'aucune colonne ne retient : « Émis » a déjà `emisLe`, « publié » a
     `publieLe` — les inscrire ici donnerait deux lignes pour un seul fait, et
     la première divergence entre les deux serait un bug illisible.
     (docs/DEVIS-FIL.md — la règle du §4 bis.) */
  if (patch.etat !== undefined && estEtatDevis(patch.etat)) {
    const trace = evenementDEtat(
      estEtatDevis(actuel.etat) ? actuel.etat : "BROUILLON",
      patch.etat,
    );
    if (trace) await inscrireEvenement(id, trace, a.id);
  }

  rafraichirEcrans(id);
}

/**
 * Pose un fait dans le fil. Silencieux en cas d'échec : perdre une ligne de
 * journal ne doit pas faire échouer le geste qui l'a produite — on vient de
 * changer l'état d'un devis, c'est ça qui compte.
 */
async function inscrireEvenement(
  devisId: string,
  evenement: EvenementEnregistre,
  auteurId: string,
): Promise<void> {
  try {
    const d = await prisma.devis.findUnique({
      where: { id: devisId },
      select: { id: true, filId: true },
    });
    if (!d) return;
    await prisma.messageDevis.create({
      data: { filId: d.filId || d.id, devisId: d.id, evenement, auteurId },
    });
  } catch {
    /* le journal n'est pas la donnée : on ne casse pas l'écriture pour lui */
  }
}

export async function supprimerDevis(id: string): Promise<void> {
  await acteur();
  // Les lignes média partent en cascade, mais pas les BINAIRES : on les efface
  // avant, sinon ils resteraient sur le disque de la VM sans plus rien pour les
  // désigner — donc invisibles et éternels (même geste que supprimerNote).
  const devis = await prisma.devis.findUnique({
    where: { id },
    select: { medias: { select: { fichier: true } } },
  });
  if (!devis) return;
  await Promise.all(devis.medias.map((m) => supprimerMedia(m.fichier)));

  // Lots et lignes partent en cascade ; les révisions filles perdent leur parent
  // (onDelete: SetNull) plutôt que d'être emportées avec lui.
  await prisma.devis.delete({ where: { id } });
  revalidatePath(RACINE);
}

/**
 * Nouvelle révision : même numéro, révision suivante, contenu recopié À
 * L'IDENTIQUE (les prix figés le restent — c'est tout l'intérêt de garder la v1
 * lisible après négociation).
 */
export async function nouvelleRevision(id: string): Promise<{ id: string }> {
  const a = await acteur();
  const source = await prisma.devis.findUnique({
    where: { id },
    include: {
      lots: { orderBy: { ordre: "asc" } },
      lignes: { orderBy: { ordre: "asc" } },
      // ⚠️ `messageId: null` : les pièces jointes du FIL ne sont PAS recopiées.
      // Le fil est partagé par toute la chaîne de révisions — les recopier les
      // dupliquerait sur le disque ET dans l'onglet. (docs/DEVIS-FIL.md §5)
      medias: { where: { messageId: null } },
    },
  });
  if (!source) throw new Error("Devis introuvable");

  // Les médias des textes libres sont RECOPIÉS, pas partagés. Sans ça, la v2
  // citerait des binaires appartenant à la v1 : purger ou supprimer la v1
  // ferait disparaître des images de la v2. Chaque révision reste un document
  // autosuffisant — c'est la même doctrine que les prix figés.
  const copies = await copierMedias(source.medias);

  const derniere = await prisma.devis.findFirst({
    where: { numero: source.numero },
    orderBy: { revision: "desc" },
    select: { revision: true },
  });

  const cree = await prisma.$transaction(async (tx) => {
    const d = await tx.devis.create({
      data: {
        numero: source.numero,
        revision: (derniere?.revision ?? source.revision) + 1,
        parentId: source.id,
        // Le FIL suit la chaîne : v1 et v2 parlent de la même négociation.
        // `|| source.id` couvre un devis d'avant la reprise (filId vide).
        filId: source.filId || source.id,
        titre: source.titre,
        etat: "BROUILLON",
        clientNom: source.clientNom,
        clientId: source.clientId,
        numeroWhy: source.numeroWhy,
        chantierId: source.chantierId,
        coefDefautMillieme: source.coefDefautMillieme,
        tauxTvaCentieme: source.tauxTvaCentieme,
        remiseGlobalePourMille: source.remiseGlobalePourMille,
        remiseGlobaleCents: source.remiseGlobaleCents,
        validiteJours: source.validiteJours,
        // La mise en forme du document client suit (destinataire, ce qu'on
        // montre) : c'est un réglage de présentation, pas un prix. En revanche
        // NI le jeton NI la date de publication — la v2 n'est pas encore
        // partie, et le lien de la v1 continue de montrer ce qui a réellement
        // été envoyé.
        destinataire: source.destinataire,
        montrerPrixUnitaires: source.montrerPrixUnitaires,
        montrerSousTotauxLots: source.montrerSousTotauxLots,
        montrerOptions: source.montrerOptions,
        createdById: a.id,
        updatedById: a.id,
      },
    });
    const idLot = new Map<string, string>();
    for (const l of source.lots) {
      const nouveau = await tx.lotDevis.create({
        // ⚠️ `rendu` et `libelleClient` DOIVENT suivre. Les oublier ne casse
        // rien de visible : ça DÉCOUVRE simplement au client, à la révision
        // suivante, le détail qu'on avait choisi de lui cacher.
        data: {
          devisId: d.id,
          titre: l.titre,
          ordre: l.ordre,
          note: l.note,
          rendu: l.rendu,
          libelleClient: l.libelleClient,
        },
      });
      idLot.set(l.id, nouveau.id);
    }
    if (source.lignes.length > 0) {
      await tx.ligneDevis.createMany({
        data: source.lignes.map((l) => ({
          devisId: d.id,
          lotId: l.lotId ? (idLot.get(l.lotId) ?? null) : null,
          ordre: l.ordre,
          genre: l.genre,
          produitId: l.produitId,
          prestationId: l.prestationId,
          designation: l.designation,
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
          // Le document riche suit, avec ses URLs média réécrites vers les
          // copies. La version repart à 0 : c'est un autre document.
          contenu: reecrireMedias(l.contenu, copies.correspondance),
          version: 0,
        })),
      });
    }
    if (copies.lignes.length > 0) {
      await tx.devisMedia.createMany({
        data: copies.lignes.map((m) => ({ ...m, devisId: d.id })),
      });
    }
    return d;
  });

  rafraichirEcrans(cree.id);
  return { id: cree.id };
}

/**
 * Duplique un devis vers un NOUVEAU NUMÉRO — quel que soit son état.
 *
 * À ne pas confondre avec `nouvelleRevision`, et la différence n'est pas
 * cosmétique :
 *
 *   révision  → MÊME numéro, révision suivante, chaînée au parent. C'est la
 *               négociation d'une même affaire, dont on garde la trace.
 *   copie     → NOUVEAU numéro, révision 1, aucun parent. C'est le devis
 *               d'à côté : la même chaufferie pour un autre client.
 *
 * Une copie repart donc en BROUILLON, sans date d'émission, et prend le numéro
 * suivant du compteur. Les prix restent figés tels qu'ils étaient : c'est une
 * copie, pas un rechiffrage — « Tout rafraîchir » est là pour ça, et c'est un
 * geste explicite (docs/DEVIS.md §2.1).
 */export async function dupliquerDevis(id: string): Promise<{ id: string; numero: string }> {
  const a = await acteur();
  const source = await prisma.devis.findUnique({
    where: { id },
    include: {
      lots: { orderBy: { ordre: "asc" } },
      lignes: { orderBy: { ordre: "asc" } },
      // ⚠️ `messageId: null` : les pièces jointes du FIL ne sont PAS recopiées.
      // Le fil est partagé par toute la chaîne de révisions — les recopier les
      // dupliquerait sur le disque ET dans l'onglet. (docs/DEVIS-FIL.md §5)
      medias: { where: { messageId: null } },
    },
  });
  if (!source) throw new Error("Devis introuvable");

  // Les médias des textes libres sont RECOPIÉS, pas partagés. Sans ça, la v2
  // citerait des binaires appartenant à la v1 : purger ou supprimer la v1
  // ferait disparaître des images de la v2. Chaque révision reste un document
  // autosuffisant — c'est la même doctrine que les prix figés.
  const copies = await copierMedias(source.medias);

  const annee = new Date().getFullYear();
  const numero = formatNumeroDevis(annee, await prochainRang(annee));

  const cree = await prisma.$transaction(async (tx) => {
    const d = await tx.devis.create({
      data: {
        numero,
        revision: 1,
        // AUCUN lien vers la source : une copie n'est pas une révision. La
        // révision poursuit une négociation sur le même numéro ; la copie ouvre
        // une autre affaire, qui vivra sa vie.
        parentId: null,
        titre: source.titre ? `${source.titre} (copie)` : "",
        etat: "BROUILLON",
        emisLe: null,
        clientNom: source.clientNom,
        clientId: source.clientId,
        numeroWhy: source.numeroWhy,
        chantierId: source.chantierId,
        coefDefautMillieme: source.coefDefautMillieme,
        tauxTvaCentieme: source.tauxTvaCentieme,
        remiseGlobalePourMille: source.remiseGlobalePourMille,
        remiseGlobaleCents: source.remiseGlobaleCents,
        validiteJours: source.validiteJours,
        // Présentation reprise, publication non : la copie est un devis à part,
        // qui n'a jamais été envoyé à personne.
        destinataire: source.destinataire,
        montrerPrixUnitaires: source.montrerPrixUnitaires,
        montrerSousTotauxLots: source.montrerSousTotauxLots,
        montrerOptions: source.montrerOptions,
        createdById: a.id,
        updatedById: a.id,
      },
    });
    const idLot = new Map<string, string>();
    for (const l of source.lots) {
      const nouveau = await tx.lotDevis.create({
        // ⚠️ `rendu` et `libelleClient` DOIVENT suivre. Les oublier ne casse
        // rien de visible : ça DÉCOUVRE simplement au client, à la révision
        // suivante, le détail qu'on avait choisi de lui cacher.
        data: {
          devisId: d.id,
          titre: l.titre,
          ordre: l.ordre,
          note: l.note,
          rendu: l.rendu,
          libelleClient: l.libelleClient,
        },
      });
      idLot.set(l.id, nouveau.id);
    }
    if (source.lignes.length > 0) {
      await tx.ligneDevis.createMany({
        data: source.lignes.map((l) => ({
          devisId: d.id,
          lotId: l.lotId ? (idLot.get(l.lotId) ?? null) : null,
          ordre: l.ordre,
          genre: l.genre,
          produitId: l.produitId,
          prestationId: l.prestationId,
          designation: l.designation,
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
          // Le document riche suit, avec ses URLs média réécrites vers les
          // copies. La version repart à 0 : c'est un autre document.
          contenu: reecrireMedias(l.contenu, copies.correspondance),
          version: 0,
        })),
      });
    }
    if (copies.lignes.length > 0) {
      await tx.devisMedia.createMany({
        data: copies.lignes.map((m) => ({ ...m, devisId: d.id })),
      });
    }
    return d;
  });

  // Une COPIE ouvre un fil NEUF : c'est le devis d'à côté, pas la suite d'une
  // conversation. (Une révision, elle, hérite du fil de son parent.)
  await prisma.devis.update({ where: { id: cree.id }, data: { filId: cree.id } });
  rafraichirEcrans(cree.id);
  return { id: cree.id, numero: cree.numero };
}

/* =============================================================================
 * LES LOTS
 * ========================================================================== */

/**
 * Un nouveau bloc. `rendu` est demandé À LA CRÉATION parce que c'est là que ça
 * se décide : « + Nouveau forfait » pose un bloc déjà condensé, curseur dans la
 * phrase du client. Assembler le même résultat en quatre gestes (créer, nommer,
 * basculer, écrire) est le meilleur moyen de faire contourner l'outil.
 */
export async function ajouterLot(
  devisId: string,
  titre: string,
  options: { rendu?: string } = {},
): Promise<{ id: string }> {
  await acteur();
  const dernier = await prisma.lotDevis.findFirst({
    where: { devisId },
    orderBy: { ordre: "desc" },
    select: { ordre: true },
  });
  const rendu = estRenduLot(options.rendu) ? options.rendu : "DETAILLE";
  const lot = await prisma.lotDevis.create({
    data: {
      devisId,
      titre: texte(titre) || (rendu === "CONDENSE" ? "Nouveau forfait" : "Nouveau lot"),
      ordre: ordreEntre(dernier?.ordre ?? null, null),
      rendu,
    },
    select: { id: true },
  });
  rafraichirEcrans(devisId);
  return lot;
}

export async function majLot(
  lotId: string,
  patch: { titre?: string; note?: string; rendu?: string; libelleClient?: string },
): Promise<void> {
  await acteur();
  // ⚠️ `rendu` est validé ici et pas seulement à l'écran : c'est lui qui décide
  // de ce qui sort du serveur vers le client. Une valeur inconnue retomberait
  // sur DETAILLE côté lecture — donc sur un bloc DÉVOILÉ. On refuse plutôt.
  if (patch.rendu !== undefined && !estRenduLot(patch.rendu)) {
    throw new Error("Rendu de lot inconnu");
  }
  const lot = await prisma.lotDevis.update({
    where: { id: lotId },
    data: {
      ...(patch.titre !== undefined ? { titre: texte(patch.titre) || "Lot" } : {}),
      ...(patch.note !== undefined ? { note: texte(patch.note) } : {}),
      ...(patch.rendu !== undefined ? { rendu: patch.rendu } : {}),
      // Pas de `texte()` ici : c'est un paragraphe destiné au client, ses
      // retours à la ligne sont significatifs (une ligne = une puce).
      ...(patch.libelleClient !== undefined
        ? { libelleClient: patch.libelleClient.trim() }
        : {}),
    },
    select: { devisId: true },
  });
  rafraichirEcrans(lot.devisId);
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

async function ordreSuivant(devisId: string, lotId: string | null): Promise<number> {
  const dernier = await prisma.ligneDevis.findFirst({
    where: { devisId, lotId },
    orderBy: { ordre: "desc" },
    select: { ordre: true },
  });
  return ordreEntre(dernier?.ordre ?? null, null);
}

/**
 * Ajout d'un ARTICLE. C'est ici que le principe n°1 s'applique : on lit le
 * référentiel une fois, on copie tout, et on n'y revient plus.
 */
export async function ajouterLigneProduit(
  devisId: string,
  produitId: string,
  options: { lotId?: string | null; quantiteMillieme?: number } = {},
): Promise<{ id: string }> {
  await acteur();
  const [devis, produit, grille, prix] = await Promise.all([
    prisma.devis.findUnique({ where: { id: devisId }, select: { coefDefautMillieme: true } }),
    prisma.produit.findUnique({
      where: { id: produitId },
      select: { id: true, refInterne: true, designation: true, unite: true, categorieId: true },
    }),
    grilleCoefs(),
    prixParProduit(),
  ]);
  if (!devis) throw new Error("Devis introuvable");
  if (!produit) throw new Error("Article introuvable");

  const debourse = prixReference(prix.get(produit.id)).cents;
  const { coefMillieme, origine } = coefApplicable(grille, devis.coefDefautMillieme, {
    produitId: produit.id,
    categorieId: produit.categorieId,
  });

  const lotId = texteOuNull(options.lotId ?? null);
  const ligne = await prisma.ligneDevis.create({
    data: {
      devisId,
      lotId,
      ordre: await ordreSuivant(devisId, lotId),
      genre: "PRODUIT",
      produitId: produit.id,
      designation: produit.designation,
      refInterne: produit.refInterne,
      unite: produit.unite,
      quantiteMillieme: Math.max(1, entier(options.quantiteMillieme, 1000)),
      debourseCents: debourse,
      // Prix inconnu : on n'invente pas un prix de vente. La ligne reste, elle
      // est signalée, et le total la dit exclue (principe n°3).
      coefMillieme: debourse === null ? null : coefMillieme,
      origineCoef: origine,
      pvUnitaireCents: debourse === null ? 0 : pvDepuisDebourse(debourse, coefMillieme),
    },
    select: { id: true },
  });
  rafraichirEcrans(devisId);
  return ligne;
}

export async function ajouterLignePrestation(
  devisId: string,
  prestationId: string,
  options: { lotId?: string | null; quantiteMillieme?: number } = {},
): Promise<{ id: string }> {
  await acteur();
  const prestation = await prisma.prestation.findUnique({ where: { id: prestationId } });
  if (!prestation) throw new Error("Prestation introuvable");

  const lotId = texteOuNull(options.lotId ?? null);
  const ligne = await prisma.ligneDevis.create({
    data: {
      devisId,
      lotId,
      ordre: await ordreSuivant(devisId, lotId),
      genre: "PRESTATION",
      prestationId: prestation.id,
      designation: prestation.libelle,
      unite: prestation.unite,
      quantiteMillieme: Math.max(1, entier(options.quantiteMillieme, 1000)),
      // Taux de VENTE direct : pas de déboursé, donc pas de coefficient. Ce
      // n'est pas un trou de chiffrage — le moteur ne l'alerte pas.
      debourseCents: null,
      coefMillieme: null,
      origineCoef: "ligne",
      pvUnitaireCents: prestation.prixVenteCents,
    },
    select: { id: true },
  });
  rafraichirEcrans(devisId);
  return ligne;
}

/**
 * Ajout d'un TEXTE LIBRE — un document riche, pas une phrase (voir model.ts).
 *
 * La ligne naît avec son contenu : celui qu'on venait de taper dans la barre
 * d'ajout, ou vide. Pas de `contenu` null pour une ligne neuve — le null est
 * réservé aux lignes d'avant la bascule en riche, que l'éditeur amorce alors
 * depuis leur ancienne désignation.
 */
export async function ajouterLigneTexte(
  devisId: string,
  options: { lotId?: string | null; texte?: string } = {},
): Promise<{ id: string }> {
  await acteur();
  const t = texte(options.texte);
  const lotId = texteOuNull(options.lotId ?? null);

  const ligne = await prisma.ligneDevis.create({
    data: {
      devisId,
      lotId,
      ordre: await ordreSuivant(devisId, lotId),
      genre: "TEXTE",
      designation: t || TEXTE_LIGNE_REPLI,
      contenu: contenuTexteSimple(t) as Prisma.InputJsonValue,
      unite: "U",
      quantiteMillieme: 0,
      debourseCents: null,
      coefMillieme: null,
      origineCoef: "ligne",
      pvUnitaireCents: 0,
    },
    select: { id: true },
  });
  rafraichirEcrans(devisId);
  return ligne;
}

export type SauverTexteLigneResultat =
  | { ok: true; version: number; updatedAt: string }
  /** Conflit : quelqu'un a sauvé entre-temps — l'éditeur cesse d'écraser. */
  | { ok: false; conflit: true; version: number; updatedAt: string };

/**
 * Sauvegarde du document riche d'une ligne TEXTE — autosave à 700 ms, même
 * socle que Notes et Wiki (`useSauvegardeDocument`).
 *
 * Deux choses s'écrivent ensemble, et c'est le point important : le DOCUMENT et
 * son RÉSUMÉ EN TEXTE BRUT (`designation`). Tout ce qui lit une ligne sans
 * savoir rendre des blocs — index, export, futur PDF client — continue de
 * trouver une phrase lisible.
 *
 * `updateManyAndReturn` : la garde de version et la lecture du résultat sont la
 * MÊME requête (cf. CLAUDE.md — un `updateMany` suivi d'un `findUnique` laisse
 * un save concurrent s'intercaler et renvoyer SA version).
 *
 * Volontairement SANS `revalidatePath` : cette action part toutes les 700 ms de
 * frappe, et aucun total ne dépend d'un texte. Invalider les écrans à chaque
 * caractère ferait payer au devis entier le prix d'une virgule.
 */
export async function sauverTexteLigne(
  ligneId: string,
  data: { contenu: ContenuRiche; versionBase: number },
): Promise<SauverTexteLigneResultat> {
  await acteur();

  // Les blocs BlockNote portent des `undefined` DANS des tableaux (ex.
  // columnWidths) ; les server actions les préservent et Prisma les refuse en
  // JSON → la sérialisation les normalise en null (forme native de BlockNote).
  const contenu = JSON.parse(JSON.stringify(data.contenu ?? [])) as Prisma.InputJsonValue;

  const [ligne] = await prisma.ligneDevis.updateManyAndReturn({
    where: { id: ligneId, version: data.versionBase },
    data: {
      contenu,
      designation: resumeTexteLigne(data.contenu),
      version: data.versionBase + 1,
    },
    select: { version: true, updatedAt: true, devisId: true },
  });

  if (!ligne) {
    // Rien écrit : soit conflit de version, soit ligne disparue.
    const courante = await prisma.ligneDevis.findUnique({
      where: { id: ligneId },
      select: { version: true, updatedAt: true },
    });
    if (!courante) throw new Error("Ligne introuvable");
    return {
      ok: false,
      conflit: true,
      version: courante.version,
      updatedAt: courante.updatedAt.toISOString(),
    };
  }

  await purgerMediasDevis(ligne.devisId);
  return { ok: true, version: ligne.version, updatedAt: ligne.updatedAt.toISOString() };
}

/**
 * Purge des médias que PLUS AUCUNE ligne du devis ne cite.
 *
 * Le document de référence est ici l'ensemble des textes du devis, pas celui
 * qu'on vient d'écrire : les médias appartiennent au devis (une image doit
 * survivre au déplacement de sa ligne), donc c'est le devis entier qui décide
 * de ce qui est orphelin. La fenêtre de grâce du socle protège l'image en cours
 * de téléversement.
 */
async function purgerMediasDevis(devisId: string): Promise<void> {
  const lignes = await prisma.ligneDevis.findMany({
    where: { devisId },
    select: { contenu: true },
  });
  return purgerMediasOrphelins({
    contenu: lignes.map((l) => l.contenu),
    prefixeUrl: PREFIXE_MEDIA_DEVIS,
    candidats: (gardes, avant) =>
      prisma.devisMedia.findMany({
        // ⚠️ `messageId: null` : une pièce jointe du FIL n'est citée par aucune
        // ligne — sans ce filtre elle serait effacée du disque à la frappe
        // suivante dans n'importe quel texte libre. (docs/DEVIS-FIL.md §5)
        where: { devisId, messageId: null, createdAt: { lt: avant }, id: { notIn: gardes } },
        select: { id: true, fichier: true },
      }),
    oublier: async (ids) => {
      await prisma.devisMedia.deleteMany({ where: { id: { in: ids } } });
    },
  });
}

/**
 * Recopie les binaires d'un devis sous de nouveaux identifiants (révision).
 *
 * Les fichiers sont écrits AVANT la transaction : si celle-ci échoue, il reste
 * quelques octets que rien ne référence — moins grave qu'une ligne en base
 * pointant vers un fichier absent, qui ferait répondre 410 à l'affichage.
 * Un binaire déjà perdu n'est pas recopié : on ne fabrique pas une seconde
 * référence morte.
 */
async function copierMedias(
  medias: { id: string; nom: string; mimeType: string; taille: number; fichier: string }[],
): Promise<{
  correspondance: Map<string, string>;
  lignes: { id: string; nom: string; mimeType: string; taille: number; fichier: string }[];
}> {
  const correspondance = new Map<string, string>();
  const lignes: { id: string; nom: string; mimeType: string; taille: number; fichier: string }[] =
    [];

  for (const m of medias) {
    let binaire: Buffer;
    try {
      binaire = await lireMedia(m.fichier);
    } catch {
      continue;
    }
    const nouvelId = randomUUID();
    const fichier = await ecrireMedia(DEPOT_MEDIAS_DEVIS, nouvelId, binaire);
    correspondance.set(m.id, nouvelId);
    lignes.push({ id: nouvelId, nom: m.nom, mimeType: m.mimeType, taille: m.taille, fichier });
  }
  return { correspondance, lignes };
}

/** Réécrit les URLs média d'un document vers les copies. Un remplacement sur le
 *  JSON sérialisé, comme la purge : un média peut être cité par un bloc image,
 *  une pièce jointe ou un lien inline — leur seul point commun est l'URL. */
function reecrireMedias(
  contenu: Prisma.JsonValue,
  correspondance: Map<string, string>,
): Prisma.InputJsonValue | typeof Prisma.DbNull {
  if (contenu === null || contenu === undefined) return Prisma.DbNull;
  if (correspondance.size === 0) return contenu as Prisma.InputJsonValue;
  let json = JSON.stringify(contenu);
  for (const [avant, apres] of correspondance) json = json.replaceAll(avant, apres);
  return JSON.parse(json) as Prisma.InputJsonValue;
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
  const genre: GenreLigne =
    saisie.genre && estGenreLigne(saisie.genre) && saisie.genre !== "PRODUIT"
      ? saisie.genre
      : "LIBRE";
  const designation = texte(saisie.designation);
  if (!designation) throw new Error("Un libellé est nécessaire");

  const lotId = texteOuNull(saisie.lotId ?? null);
  const ligne = await prisma.ligneDevis.create({
    data: {
      devisId,
      lotId,
      ordre: await ordreSuivant(devisId, lotId),
      genre,
      designation,
      unite: texte(saisie.unite) || "U",
      quantiteMillieme: genre === "TEXTE" ? 0 : Math.max(1, entier(saisie.quantiteMillieme, 1000)),
      debourseCents: null,
      coefMillieme: null,
      origineCoef: "ligne",
      pvUnitaireCents: genre === "TEXTE" ? 0 : Math.max(0, entier(saisie.pvUnitaireCents)),
    },
    select: { id: true },
  });
  rafraichirEcrans(devisId);
  return ligne;
}

/**
 * Modification d'une ligne. Deux façons de piloter le prix, et elles s'excluent :
 *
 *  - on donne un COEFFICIENT → le PV se recalcule depuis le déboursé figé ;
 *  - on donne un PRIX DE VENTE → le coefficient est effacé (la relation
 *    déboursé × coef = PV n'a plus cours sur cette ligne), origine « ligne ».
 *
 * Sans cette exclusion, une ligne afficherait un coefficient qui n'explique pas
 * son prix — le pire des deux mondes.
 */
export async function majLigne(
  ligneId: string,
  patch: {
    designation?: string;
    unite?: string;
    quantiteMillieme?: number;
    coefMillieme?: number | null;
    pvUnitaireCents?: number;
    debourseCents?: number | null;
    remisePourMille?: number;
    option?: boolean;
    note?: string;
    lotId?: string | null;
  },
): Promise<void> {
  await acteur();
  const ligne = await prisma.ligneDevis.findUnique({ where: { id: ligneId } });
  if (!ligne) throw new Error("Ligne introuvable");

  const data: Record<string, unknown> = {};
  if (patch.designation !== undefined) {
    const d = texte(patch.designation);
    if (!d) throw new Error("Un libellé est nécessaire");
    data.designation = d;
  }
  if (patch.unite !== undefined) data.unite = texte(patch.unite) || "U";
  if (patch.note !== undefined) data.note = texte(patch.note);
  if (patch.option !== undefined) data.option = Boolean(patch.option);
  if (patch.quantiteMillieme !== undefined) {
    data.quantiteMillieme = Math.max(0, entier(patch.quantiteMillieme, 1000));
  }
  if (patch.remisePourMille !== undefined) {
    data.remisePourMille = borne(entier(patch.remisePourMille), 0, 1000);
  }
  if (patch.lotId !== undefined) data.lotId = texteOuNull(patch.lotId);

  // Le déboursé se corrige à la main quand le référentiel ne sait pas (article
  // hors magasin, prix négocié) — le PV suit alors le coefficient en place.
  let debourse = ligne.debourseCents;
  if (patch.debourseCents !== undefined) {
    debourse = patch.debourseCents === null ? null : Math.max(0, entier(patch.debourseCents));
    data.debourseCents = debourse;
  }

  if (patch.pvUnitaireCents !== undefined) {
    data.pvUnitaireCents = Math.max(0, entier(patch.pvUnitaireCents));
    data.coefMillieme = null;
    data.origineCoef = "ligne" satisfies OrigineCoef;
  } else if (patch.coefMillieme !== undefined) {
    const coef = patch.coefMillieme === null ? null : entier(patch.coefMillieme);
    if (coef !== null && coef <= 0) throw new Error("Le coefficient doit être supérieur à zéro");
    data.coefMillieme = coef;
    data.origineCoef = "ligne" satisfies OrigineCoef;
    if (coef !== null && debourse !== null) {
      data.pvUnitaireCents = pvDepuisDebourse(debourse, coef);
    }
  } else if (patch.debourseCents !== undefined && debourse !== null && ligne.coefMillieme) {
    // Le déboursé a bougé mais pas le coefficient : le PV suit.
    data.pvUnitaireCents = pvDepuisDebourse(debourse, ligne.coefMillieme);
  }

  await prisma.ligneDevis.update({ where: { id: ligneId }, data });
  await prisma.devis.update({
    where: { id: ligne.devisId },
    data: { updatedAt: new Date() },
  });
  rafraichirEcrans(ligne.devisId);
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
  const ligne = await prisma.ligneDevis.delete({
    where: { id: ligneId },
    select: { devisId: true, genre: true },
  });
  // Une ligne TEXTE emporte ses images : plus personne ne les cite, et sans ce
  // passage elles n'attendraient que la prochaine frappe dans un AUTRE texte du
  // devis pour disparaître — c'est-à-dire, sur un devis sans texte restant,
  // jamais.
  if (ligne.genre === "TEXTE") await purgerMediasDevis(ligne.devisId);
  rafraichirEcrans(ligne.devisId);
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
 * LE RAFRAÎCHISSEMENT — le seul endroit où le référentiel reprend la main
 *
 * Et il ne la prend que parce qu'on le lui demande. Le déboursé ET la cascade
 * du coefficient sont rejoués : un article qui a changé de catégorie depuis, ou
 * dont on a réglé le coefficient entre-temps, doit en profiter.
 *
 * Une ligne dont le coefficient a été FORCÉ à la main garde son forçage : c'est
 * une décision, pas un défaut.
 * ========================================================================== */

export async function rafraichirLignes(
  devisId: string,
  ligneIds?: string[],
): Promise<{ misesAJour: number }> {
  await acteur();
  const devis = await prisma.devis.findUnique({
    where: { id: devisId },
    select: { coefDefautMillieme: true },
  });
  if (!devis) throw new Error("Devis introuvable");

  const lignes = await prisma.ligneDevis.findMany({
    where: {
      devisId,
      genre: "PRODUIT",
      produitId: { not: null },
      ...(ligneIds && ligneIds.length > 0 ? { id: { in: ligneIds } } : {}),
    },
  });
  if (lignes.length === 0) return { misesAJour: 0 };

  const produitIds = [...new Set(lignes.map((l) => l.produitId!).filter(Boolean))];
  const [produits, grille, prix] = await Promise.all([
    prisma.produit.findMany({
      where: { id: { in: produitIds } },
      select: { id: true, categorieId: true, designation: true, refInterne: true, unite: true },
    }),
    grilleCoefs(),
    prixParProduit(),
  ]);
  const parId = new Map(produits.map((p) => [p.id, p]));

  const ecritures = [];
  for (const l of lignes) {
    const p = parId.get(l.produitId!);
    // L'article a disparu du référentiel : on ne touche à rien. La ligne reste
    // telle qu'elle a été chiffrée — c'est exactement le point du snapshot.
    if (!p) continue;
    const debourse = prixReference(prix.get(p.id)).cents;
    if (debourse === null) continue;

    const force = l.origineCoef === "ligne" ? l.coefMillieme : null;
    const { coefMillieme, origine } = coefApplicable(
      grille,
      devis.coefDefautMillieme,
      { produitId: p.id, categorieId: p.categorieId },
      force,
    );
    const pv = pvDepuisDebourse(debourse, coefMillieme);
    if (debourse === l.debourseCents && pv === l.pvUnitaireCents) continue;

    ecritures.push(
      prisma.ligneDevis.update({
        where: { id: l.id },
        data: {
          debourseCents: debourse,
          coefMillieme,
          origineCoef: origine,
          pvUnitaireCents: pv,
          // La désignation suit aussi : un article renommé au magasin ne doit
          // pas garder son ancien nom sur un devis qu'on vient de remettre à jour.
          designation: p.designation,
          refInterne: p.refInterne,
        },
      }),
    );
  }
  if (ecritures.length > 0) await prisma.$transaction(ecritures);
  rafraichirEcrans(devisId);
  return { misesAJour: ecritures.length };
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

/**
 * Verse la sélection dans un lot. Le devis reste MAÎTRE de ce qu'il contient :
 * on copie, on ne synchronise pas. La BOM continuera d'évoluer avec l'affaire,
 * le devis restera ce qui a été chiffré.
 */
export async function reprendreBom(
  devisId: string,
  chantierId: string,
  produitIds: string[],
  options: { titreLot?: string } = {},
): Promise<{ ajoutees: number; lotId: string | null }> {
  await acteur();
  if (produitIds.length === 0) return { ajoutees: 0, lotId: null };

  const bom = await bomAffaire(chantierId);
  const voulus = new Set(produitIds);
  const retenues = bom.lignes.filter((l) => voulus.has(l.produitId));
  if (retenues.length === 0) return { ajoutees: 0, lotId: null };

  const titreLot = texte(options.titreLot) || "Fourniture";
  const { id: lotId } = await ajouterLot(devisId, titreLot);

  // Une ligne à la fois : chaque ajout rejoue la cascade du coefficient pour
  // SON article, ce qu'un createMany ne saurait pas faire.
  let ajoutees = 0;
  for (const l of retenues) {
    await ajouterLigneProduit(devisId, l.produitId, {
      lotId,
      quantiteMillieme: Math.max(1, Math.round(l.besoin * 1000)),
    });
    ajoutees += 1;
  }
  rafraichirEcrans(devisId);
  return { ajoutees, lotId };
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
    await ajouterLigneProduit(devisId, produitId, {
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
