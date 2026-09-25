import "server-only";

import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { resoudreClientId } from "@/lib/clients/queries";
import { resoudreChantierId } from "@/lib/chantiers/queries";
import { purgerMediasOrphelins } from "@/lib/medias-document/purge";
import { ecrireMedia, lireMedia, supprimerMedia } from "@/lib/medias-document/stockage";
import { prixParProduit, prixReference } from "@/tools/magasin/queries";
import { bomAffaire } from "@/tools/magasin/bom";
import {
  CONTACT_VIDE,
  grilleCoefs,
  propositionDestinataire,
  type ChoixContact,
} from "./queries";
import { DEPOT_MEDIAS_DEVIS } from "./stockage";
import {
  PREFIXE_MEDIA_DEVIS,
  RANG_DEVIS_MAX,
  TEXTE_LIGNE_REPLI,
  coefApplicable,
  contenuTexteSimple,
  estEtatDevis,
  evenementDEtat,
  estGenreLigne,
  estRenduLot,
  formatNumeroDevis,
  ordreEntre,
  paveReprenable,
  pvDepuisDebourse,
  resumeTexteLigne,
  type ContenuRiche,
  type EvenementEnregistre,
  type GenreLigne,
  type OrigineCoef,
} from "./model";

/* =============================================================================
 * LE NOYAU DES ÉCRITURES DE L'OUTIL DEVIS
 *
 * Deux portes mènent ici : les server actions de l'éditeur (`./actions`) et le
 * serveur MCP (`mcp/data.mts`). Ce module ne connaît donc NI la session NI les
 * écrans — l'appelant dit qui écrit et rafraîchit ce qui doit l'être.
 *
 * ⚠️ Toute règle métier d'une écriture vit ICI, jamais dans l'action qui
 * l'enrobe : posée côté action, elle serait contournée par le MCP sans que rien
 * ne le signale. C'est la raison d'être du fichier (docs/DEVIS.md §28).
 *
 * Deux règles portent tout ce qui suit :
 *
 *  1. TOUT CE QUI S'AFFICHE EST COPIÉ. Une ligne ne « pointe » pas vers un prix,
 *     elle le porte. Le référentiel n'est relu que sur demande explicite
 *     (rafraichirLignes) — jamais au fil de l'eau.
 *
 *  2. ON NE CRÉE RIEN DANS LE RÉFÉRENTIEL. Un article absent du Magasin se
 *     chiffre en ligne « Divers » (`ajouterLigneLibre`) ; aucune fonction de ce
 *     fichier ne crée de produit ni de prestation.
 * ========================================================================== */

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

/** Réglages de numérotation d'une création.
 *  ⚠️ `annee` n'existe que pour les contrôles de bout en bout : un script qui
 *  crée des devis sur la vraie base consommerait sinon de VRAIS numéros, et un
 *  brouillon abandonné laisse un trou dans la séquence. Jamais depuis un écran. */
export interface OptionsNumerotation {
  annee?: number;
}

/* =============================================================================
 * LE DEVIS
 * ========================================================================== */

export async function creerDevis(
  acteurId: string,
  saisie: {
    titre?: string;
    clientNom?: string;
    numeroWhy?: string;
    chantierId?: string | null;
  },
  options: OptionsNumerotation = {},
): Promise<{ id: string; numero: string }> {
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
  const annee = options.annee ?? new Date().getFullYear();
  const numero = formatNumeroDevis(annee, await prochainRang(annee));

  // Le destinataire est PRÉ-REMPLI depuis la fiche client, avec son contact
  // principal s'il en a un. C'est le cas le plus tranquille du mécanisme : un
  // devis qui vient de naître n'a rien à écraser (docs/DEVIS.md §24).
  const propose = await propositionDestinataire(clientIdRetenu, { mode: "principal" });

  const d = await prisma.devis.create({
    data: {
      numero,
      revision: 1,
      titre,
      clientNom: nomClientRetenu,
      clientId: clientIdRetenu,
      numeroWhy: whyRetenu,
      chantierId,
      destinataire: propose.pave,
      ...propose.contact,
      // Le coefficient global est COPIÉ, pas référencé : réviser la politique de
      // la maison ne doit pas modifier un devis déjà chiffré.
      coefDefautMillieme: grille.globalMillieme,
      createdById: acteurId,
      updatedById: acteurId,
    },
    select: { id: true, numero: true },
  });
  // Un devis neuf ouvre SON PROPRE fil. `filId` ne peut pas être posé dans le
  // `create` — l'id n'existe pas encore : une seconde écriture, immédiate.
  await prisma.devis.update({ where: { id: d.id }, data: { filId: d.id } });
  return d;
}

export interface PatchEnteteDevis {
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
  montrerDocumentations?: boolean;
}

export async function majEnteteDevis(
  acteurId: string,
  id: string,
  patch: PatchEnteteDevis,
): Promise<void> {
  const actuel = await prisma.devis.findUnique({
    where: { id },
    select: {
      etat: true,
      emisLe: true,
      // Pour décider si le destinataire peut suivre un changement de client
      // sans rien détruire (docs/DEVIS.md §24).
      clientId: true,
      destinataire: true,
      contactId: true,
    },
  });
  if (!actuel) throw new Error("Devis introuvable");

  const data: Record<string, unknown> = { updatedById: acteurId };

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
  if (patch.montrerDocumentations !== undefined) {
    data.montrerDocumentations = !!patch.montrerDocumentations;
  }
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

  /* Le destinataire SUIT le client — tant qu'il n'a pas été écrit à la main.
     Changer de client sur un devis, c'est presque toujours corriger une erreur
     de saisie : garder le pavé et le contact du client précédent adresserait le
     devis à la mauvaise société, en silence. Mais un pavé retapé (un service de
     facturation, une TSA) ne se fait pas écraser pour autant : `paveReprenable`
     le compare à ce que l'ANCIEN client proposait. (docs/DEVIS.md §24) */
  const nouveauClientId = data.clientId as string | null | undefined;
  const changeDeClient =
    nouveauClientId !== undefined && (nouveauClientId ?? null) !== actuel.clientId;
  if (changeDeClient) {
    // Le contact figé appartenait à l'ancien client : il ne peut plus rester.
    Object.assign(data, CONTACT_VIDE);
    if (patch.destinataire === undefined) {
      const choixAvant: ChoixContact = actuel.contactId
        ? { mode: "precis", id: actuel.contactId }
        : { mode: "aucun" };
      const avant = await propositionDestinataire(actuel.clientId, choixAvant);
      if (paveReprenable(actuel.destinataire, avant.pave)) {
        const apres = await propositionDestinataire(nouveauClientId ?? null, {
          mode: "principal",
        });
        data.destinataire = apres.pave;
        Object.assign(data, apres.contact);
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
    if (trace) await inscrireEvenement(id, trace, acteurId);
  }
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

/** Supprime un devis. Rend `false` s'il n'existait pas (déjà supprimé). */
export async function supprimerDevis(id: string): Promise<boolean> {
  // Les lignes média partent en cascade, mais pas les BINAIRES : on les efface
  // avant, sinon ils resteraient sur le disque de la VM sans plus rien pour les
  // désigner — donc invisibles et éternels (même geste que supprimerNote).
  const devis = await prisma.devis.findUnique({
    where: { id },
    select: { medias: { select: { fichier: true } } },
  });
  if (!devis) return false;
  await Promise.all(devis.medias.map((m) => supprimerMedia(m.fichier)));

  // Lots et lignes partent en cascade ; les révisions filles perdent leur parent
  // (onDelete: SetNull) plutôt que d'être emportées avec lui.
  await prisma.devis.delete({ where: { id } });
  return true;
}

/**
 * Nouvelle révision : même numéro, révision suivante, contenu recopié À
 * L'IDENTIQUE (les prix figés le restent — c'est tout l'intérêt de garder la v1
 * lisible après négociation).
 */
export async function nouvelleRevision(acteurId: string, id: string): Promise<{ id: string }> {
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
        //
        // ⚠️ Le contact figé DOIT suivre, et il se recopie TEL QUEL — on ne le
        // relit pas dans le référentiel. Une v2 négociée trois semaines plus
        // tard part à la même personne ; la relire ferait basculer le devis sur
        // le nouveau principal du client sans que personne ne l'ait demandé.
        destinataire: source.destinataire,
        contactId: source.contactId,
        contactNom: source.contactNom,
        contactFonction: source.contactFonction,
        contactEmail: source.contactEmail,
        contactTel: source.contactTel,
        montrerPrixUnitaires: source.montrerPrixUnitaires,
        montrerSousTotauxLots: source.montrerSousTotauxLots,
        montrerOptions: source.montrerOptions,
        montrerDocumentations: source.montrerDocumentations,
        createdById: acteurId,
        updatedById: acteurId,
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
 */
export async function dupliquerDevis(
  acteurId: string,
  id: string,
  options: OptionsNumerotation = {},
): Promise<{ id: string; numero: string }> {
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

  const annee = options.annee ?? new Date().getFullYear();
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
        // qui n'a jamais été envoyé à personne. Le destinataire suit quand même,
        // contact compris : on duplique presque toujours pour le même
        // interlocuteur, et il se corrige d'un menu déroulant.
        destinataire: source.destinataire,
        contactId: source.contactId,
        contactNom: source.contactNom,
        contactFonction: source.contactFonction,
        contactEmail: source.contactEmail,
        contactTel: source.contactTel,
        montrerPrixUnitaires: source.montrerPrixUnitaires,
        montrerSousTotauxLots: source.montrerSousTotauxLots,
        montrerOptions: source.montrerOptions,
        montrerDocumentations: source.montrerDocumentations,
        createdById: acteurId,
        updatedById: acteurId,
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
  const dernier = await prisma.lotDevis.findFirst({
    where: { devisId },
    orderBy: { ordre: "desc" },
    select: { ordre: true },
  });
  const rendu = estRenduLot(options.rendu) ? options.rendu : "DETAILLE";
  return prisma.lotDevis.create({
    data: {
      devisId,
      titre: texte(titre) || (rendu === "CONDENSE" ? "Nouveau forfait" : "Nouveau lot"),
      ordre: ordreEntre(dernier?.ordre ?? null, null),
      rendu,
    },
    select: { id: true },
  });
}

export async function majLot(
  lotId: string,
  patch: { titre?: string; note?: string; rendu?: string; libelleClient?: string },
): Promise<{ devisId: string }> {
  // ⚠️ `rendu` est validé ici et pas seulement à l'écran : c'est lui qui décide
  // de ce qui sort du serveur vers le client. Une valeur inconnue retomberait
  // sur DETAILLE côté lecture — donc sur un bloc DÉVOILÉ. On refuse plutôt.
  if (patch.rendu !== undefined && !estRenduLot(patch.rendu)) {
    throw new Error("Rendu de lot inconnu");
  }
  return prisma.lotDevis.update({
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

/** Ce qui peut se poser EN MÊME TEMPS qu'une ligne chiffrée, plutôt qu'en
 *  retouche derrière. L'éditeur n'en passe que les deux premiers ; le MCP, qui
 *  compose un devis entier d'un appel, s'en sert pour ne pas écrire deux fois. */
export interface OptionsAjoutLigne {
  lotId?: string | null;
  quantiteMillieme?: number;
  remisePourMille?: number;
  option?: boolean;
  note?: string;
}

function complementsAjout(o: OptionsAjoutLigne) {
  return {
    remisePourMille: o.remisePourMille === undefined ? 0 : borne(entier(o.remisePourMille), 0, 1000),
    option: Boolean(o.option),
    note: texte(o.note),
  };
}

/**
 * Ajout d'un ARTICLE. C'est ici que le principe n°1 s'applique : on lit le
 * référentiel une fois, on copie tout, et on n'y revient plus.
 */
export async function ajouterLigneProduit(
  devisId: string,
  produitId: string,
  options: OptionsAjoutLigne = {},
): Promise<{ id: string }> {
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
  return prisma.ligneDevis.create({
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
      ...complementsAjout(options),
    },
    select: { id: true },
  });
}

export async function ajouterLignePrestation(
  devisId: string,
  prestationId: string,
  options: OptionsAjoutLigne = {},
): Promise<{ id: string }> {
  const prestation = await prisma.prestation.findUnique({ where: { id: prestationId } });
  if (!prestation) throw new Error("Prestation introuvable");

  const lotId = texteOuNull(options.lotId ?? null);
  return prisma.ligneDevis.create({
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
      ...complementsAjout(options),
    },
    select: { id: true },
  });
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
  const t = texte(options.texte);
  const lotId = texteOuNull(options.lotId ?? null);

  return prisma.ligneDevis.create({
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
 * Volontairement SANS rafraîchissement d'écran côté action : elle part toutes
 * les 700 ms de frappe, et aucun total ne dépend d'un texte.
 */
export async function sauverTexteLigne(
  ligneId: string,
  data: { contenu: ContenuRiche; versionBase: number },
): Promise<SauverTexteLigneResultat> {
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

/**
 * Ajout d'une ligne « DIVERS » — libellé et prix posés à la main.
 *
 * C'est la ligne de ce que le Magasin ne connaît pas, et elle le reste : on n'y
 * crée jamais d'article. Deux façons de la chiffrer, qui s'excluent comme sur
 * `majLigne` :
 *
 *  - un PRIX DE VENTE direct → pas de coefficient, origine « ligne » ;
 *  - un DÉBOURSÉ connu (le devis d'un fournisseur pour un article hors
 *    magasin) → le PV en découle par le MÊME chemin qu'un article (principe
 *    n°2), au coefficient forcé s'il est donné, sinon à celui du devis. La
 *    ligne entre alors dans la marge sur la fourniture, comme elle le doit.
 *
 * `refInterne` porte la référence CITÉE pour l'article (celle du fournisseur,
 * du fabricant) : l'éditeur l'affiche et le bordereau interne la reprend, le
 * document client ne la montre jamais.
 */
export async function ajouterLigneLibre(
  devisId: string,
  saisie: {
    genre?: string;
    designation: string;
    pvUnitaireCents?: number;
    unite?: string;
    quantiteMillieme?: number;
    lotId?: string | null;
    debourseCents?: number | null;
    coefMillieme?: number | null;
    refInterne?: string | null;
    remisePourMille?: number;
    option?: boolean;
    note?: string;
  },
): Promise<{ id: string }> {
  const genre: GenreLigne =
    saisie.genre && estGenreLigne(saisie.genre) && saisie.genre !== "PRODUIT"
      ? saisie.genre
      : "LIBRE";
  const designation = texte(saisie.designation);
  if (!designation) throw new Error("Un libellé est nécessaire");
  const estTexte = genre === "TEXTE";

  let pvUnitaireCents = estTexte ? 0 : Math.max(0, entier(saisie.pvUnitaireCents));
  let debourseCents: number | null = null;
  let coefMillieme: number | null = null;
  let origineCoef: OrigineCoef = "ligne";

  if (!estTexte && saisie.debourseCents !== undefined && saisie.debourseCents !== null) {
    debourseCents = Math.max(0, entier(saisie.debourseCents));
    if (saisie.pvUnitaireCents === undefined) {
      let coef = saisie.coefMillieme == null ? null : entier(saisie.coefMillieme);
      if (coef !== null && coef <= 0) throw new Error("Le coefficient doit être supérieur à zéro");
      if (coef === null) {
        const devis = await prisma.devis.findUnique({
          where: { id: devisId },
          select: { coefDefautMillieme: true },
        });
        if (!devis) throw new Error("Devis introuvable");
        coef = devis.coefDefautMillieme;
        origineCoef = "devis";
      }
      coefMillieme = coef;
      pvUnitaireCents = pvDepuisDebourse(debourseCents, coef);
    }
  }

  const lotId = texteOuNull(saisie.lotId ?? null);
  return prisma.ligneDevis.create({
    data: {
      devisId,
      lotId,
      ordre: await ordreSuivant(devisId, lotId),
      genre,
      designation,
      refInterne: estTexte ? null : texteOuNull(saisie.refInterne),
      unite: texte(saisie.unite) || "U",
      quantiteMillieme: estTexte ? 0 : Math.max(1, entier(saisie.quantiteMillieme, 1000)),
      debourseCents,
      coefMillieme,
      origineCoef,
      pvUnitaireCents,
      ...(estTexte ? {} : complementsAjout(saisie)),
    },
    select: { id: true },
  });
}

export interface PatchLigne {
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
export async function majLigne(ligneId: string, patch: PatchLigne): Promise<{ devisId: string }> {
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
  return { devisId: ligne.devisId };
}

export async function supprimerLigne(ligneId: string): Promise<{ devisId: string }> {
  const ligne = await prisma.ligneDevis.delete({
    where: { id: ligneId },
    select: { devisId: true, genre: true },
  });
  // Une ligne TEXTE emporte ses images : plus personne ne les cite, et sans ce
  // passage elles n'attendraient que la prochaine frappe dans un AUTRE texte du
  // devis pour disparaître — c'est-à-dire, sur un devis sans texte restant,
  // jamais.
  if (ligne.genre === "TEXTE") await purgerMediasDevis(ligne.devisId);
  return { devisId: ligne.devisId };
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
  return { misesAJour: ecritures.length };
}

/* =============================================================================
 * LA REPRISE DE LA BOM D'UNE AFFAIRE
 * ========================================================================== */

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
  return { ajoutees, lotId };
}
