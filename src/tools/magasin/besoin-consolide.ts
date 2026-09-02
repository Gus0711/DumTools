import "server-only";
import { prisma } from "@/lib/db";
import { bomAffaire } from "./bom";
import type {
  AffaireBesoin,
  LigneConsolidee,
  TrouConsolide,
} from "./model";

/* =============================================================================
 * LE BESOIN CONSOLIDÉ — CE QU'IL FAUT COMMANDER, TOUTES AFFAIRES CONFONDUES
 *
 * On ne recalcule RIEN ici : on appelle `bomAffaire()` affaire par affaire, la
 * même fonction que la fiche de matériel. C'est délibéré et non négociable —
 * une seconde dérivation, même « équivalente », finirait par diverger, et la
 * divergence se verrait le jour où l'écran d'affaire dit 3 et la commande 2.
 * Mesuré sur la vraie base : 40 affaires en parallèle, ~900 ms. Le jour où ça
 * pèse, on factorisera la dérivation — pas avant, et pas en la recopiant.
 *
 * Ce que la fonction ajoute à la BOM, c'est ce que la BOM d'UNE affaire n'a pas
 * besoin de savoir :
 *   · le FOURNISSEUR et sa référence — on commande par fournisseur, pas par
 *     catégorie, et c'est sa référence à lui qui va sur le bon ;
 *   · les RÉSERVATIONS DES AUTRES AFFAIRES — du stock présent mais déjà promis.
 *     Sans elles, on compterait disponible une sonde qui attend son chantier.
 *
 * Le filtrage (client, état, affaires cochées) est fait par l'ÉCRAN : la
 * sélection change à chaque clic, et un aller-retour serveur par case cochée
 * rendrait l'outil inutilisable. Le serveur renvoie donc les contributions
 * détaillées, l'écran fait la somme (`totaliser`, model.ts).
 * ========================================================================== */

export interface BesoinConsolide {
  /** Les affaires candidates — le filtrage fin se fait à l'écran. */
  affaires: AffaireBesoin[];
  lignes: LigneConsolidee[];
  trous: TrouConsolide[];
  /** Points réglés « aucun matériel », par affaire : ni ligne, ni trou, mais on
   *  ne les efface pas du récit (voir BomAffaire.sansMateriel). */
  sansMateriel: { chantierId: string; nom: string; occurrences: number }[];
}

/** Les affaires qui peuvent encore appeler du matériel. Clôturée = plus rien à
 *  acheter ; Corbeille = affaire qui n'existe pas. Les deux sont écartées à la
 *  source : les proposer ferait cocher par erreur du matériel déjà soldé. */
const ETATS_CANDIDATS = ["DEVIS", "COMMANDE", "EN_COURS", "LIVRE"] as const;

export async function besoinConsolide(): Promise<BesoinConsolide> {
  const affaires = await prisma.chantier.findMany({
    where: { etat: { in: [...ETATS_CANDIDATS] } },
    select: {
      id: true,
      nom: true,
      numeroWhy: true,
      etat: true,
      clientId: true,
      client: { select: { nom: true } },
    },
    orderBy: [{ numeroWhy: "asc" }, { nom: "asc" }],
  });

  if (affaires.length === 0) {
    return { affaires: [], lignes: [], trous: [], sansMateriel: [] };
  }

  const boms = await Promise.all(affaires.map((a) => bomAffaire(a.id)));

  /* --- Une ligne par produit, les affaires en contributions --------------- */

  const parProduit = new Map<string, LigneConsolidee>();
  const trous = new Map<string, TrouConsolide>();
  const sansMateriel: BesoinConsolide["sansMateriel"] = [];

  boms.forEach((bom, i) => {
    const chantierId = affaires[i]!.id;

    for (const l of bom.lignes) {
      const existante = parProduit.get(l.produitId);
      if (existante) {
        // Le stock et le prix sont les mêmes pour tout le monde : on les a déjà.
        existante.contribs.push({
          chantierId,
          besoin: l.besoin,
          manquant: l.manquant,
          horsFourniture: l.horsFourniture,
        });
        continue;
      }
      parProduit.set(l.produitId, {
        produitId: l.produitId,
        refInterne: l.refInterne,
        refFournisseur: null, // complété plus bas
        designation: l.designation,
        unite: l.unite,
        categorieNom: l.categorieNom,
        fournisseurId: null,
        fournisseurNom: null,
        stock: l.stock,
        reserveTotale: 0, // complété plus bas
        prixCents: l.pmpCents,
        contribs: [
          {
            chantierId,
            besoin: l.besoin,
            manquant: l.manquant,
            horsFourniture: l.horsFourniture,
          },
        ],
      });
    }

    for (const t of bom.trous) {
      const k = `${t.genre}:${t.cle}`;
      const existant = trous.get(k);
      if (existant) existant.parAffaire.push({ chantierId, occurrences: t.occurrences });
      else
        trous.set(k, {
          nom: t.nom,
          genre: t.genre,
          cle: t.cle,
          typeIo: t.typeIo ?? null,
          parAffaire: [{ chantierId, occurrences: t.occurrences }],
        });
    }

    for (const s of bom.sansMateriel) {
      sansMateriel.push({ chantierId, nom: s.nom, occurrences: s.occurrences });
    }
  });

  const produitIds = [...parProduit.keys()];
  if (produitIds.length === 0) {
    return {
      affaires: affaires.map(enAffaireBesoin),
      lignes: [],
      trous: [...trous.values()],
      sansMateriel,
    };
  }

  /* --- Ce que la BOM d'une affaire n'a pas besoin de savoir --------------- */

  const [produits, reservations] = await Promise.all([
    prisma.produit.findMany({
      where: { id: { in: produitIds } },
      select: {
        id: true,
        refFournisseur: true,
        fournisseurId: true,
        fournisseur: { select: { nom: true } },
      },
    }),
    // TOUTES les affaires, pas seulement les candidates : une réservation posée
    // sur une affaire clôturée immobilise le stock tout autant.
    prisma.reservationStock.groupBy({
      by: ["produitId"],
      where: { etat: "RESERVEE", produitId: { in: produitIds } },
      _sum: { quantite: true },
    }),
  ]);

  const reserveParProduit = new Map(reservations.map((r) => [r.produitId, r._sum.quantite ?? 0]));
  for (const p of produits) {
    const ligne = parProduit.get(p.id);
    if (!ligne) continue;
    ligne.refFournisseur = p.refFournisseur;
    ligne.fournisseurId = p.fournisseurId;
    ligne.fournisseurNom = p.fournisseur?.nom ?? null;
  }
  for (const [produitId, quantite] of reserveParProduit) {
    const ligne = parProduit.get(produitId);
    if (ligne) ligne.reserveTotale = quantite;
  }

  // Par fournisseur, les sans-fournisseur en dernier — comme les produits sans
  // catégorie du rayon : c'est un oubli à réparer, pas une priorité d'affichage.
  const lignes = [...parProduit.values()].sort(
    (a, b) =>
      Number(a.fournisseurNom === null) - Number(b.fournisseurNom === null) ||
      (a.fournisseurNom ?? "").localeCompare(b.fournisseurNom ?? "") ||
      a.refInterne.localeCompare(b.refInterne),
  );

  return {
    affaires: affaires.map(enAffaireBesoin),
    lignes,
    trous: [...trous.values()].sort(
      (a, b) =>
        b.parAffaire.reduce((s, x) => s + x.occurrences, 0) -
        a.parAffaire.reduce((s, x) => s + x.occurrences, 0),
    ),
    sansMateriel,
  };
}

function enAffaireBesoin(a: {
  id: string;
  nom: string;
  numeroWhy: string | null;
  etat: string;
  clientId: string;
  client: { nom: string };
}): AffaireBesoin {
  return {
    id: a.id,
    nom: a.nom,
    numeroWhy: a.numeroWhy,
    etat: a.etat,
    clientId: a.clientId,
    clientNom: a.client.nom,
  };
}
