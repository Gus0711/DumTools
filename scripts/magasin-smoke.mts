/* Test de bout en bout du Magasin, contre la VRAIE base.
 *
 *   npx tsx scripts/magasin-smoke.mts
 *
 * Vérifie les deux invariants du cadrage (docs/MAGASIN.md §2) :
 *   1. le stock est la SOMME des mouvements (source décrémente, destination
 *      incrémente, quantité toujours positive) ;
 *   2. la sérialisation est opportuniste (0 à n exemplaires par mouvement,
 *      sans jamais fausser le stock).
 * Et le reste de la chaîne : PMP, réservation, BOM dérivée, écart d'inventaire.
 *
 * NON DESTRUCTIF : tout est créé sous un préfixe dédié puis supprimé, y compris
 * en cas d'échec (bloc finally).
 */
import "dotenv/config";
import { createRequire } from "node:module";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

// `server-only` refuse de se charger hors composant serveur : ici on EST le
// serveur (script Node), donc on neutralise la sentinelle pour pouvoir tester
// les vraies requêtes de l'application plutôt que d'en réécrire une copie.
const requireCjs = createRequire(import.meta.url);
const cheminServerOnly = requireCjs.resolve("server-only");
requireCjs.cache[cheminServerOnly] = {
  id: cheminServerOnly,
  filename: cheminServerOnly,
  loaded: true,
  exports: {},
} as unknown as NodeJS.Module;

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const PREFIXE = "ZZ-SMOKE-";
let ko = 0;

function verifier(libelle: string, obtenu: unknown, attendu: unknown) {
  const ok = JSON.stringify(obtenu) === JSON.stringify(attendu);
  if (!ok) ko += 1;
  console.log(
    `${ok ? "✓" : "✗"} ${libelle}${ok ? "" : ` — attendu ${JSON.stringify(attendu)}, obtenu ${JSON.stringify(obtenu)}`}`,
  );
}

async function stockDe(produitId: string, depotIds: string[]): Promise<number> {
  const [entrees, sorties] = await Promise.all([
    prisma.mouvementStock.aggregate({
      where: { produitId, depotDestId: { in: depotIds } },
      _sum: { quantite: true },
    }),
    prisma.mouvementStock.aggregate({
      where: { produitId, depotSourceId: { in: depotIds } },
      _sum: { quantite: true },
    }),
  ]);
  return (entrees._sum.quantite ?? 0) - (sorties._sum.quantite ?? 0);
}

async function main() {
  const atelier = await prisma.depot.findFirst({ where: { dortoir: false, actif: true } });
  if (!atelier) throw new Error("Aucun dépôt tenu : la migration a-t-elle bien créé « Atelier » ?");
  console.log(`Dépôt de travail : ${atelier.nom} (${atelier.code})\n`);

  // --- 1. Référentiel ------------------------------------------------------
  // Catégorie et fabricant sont des tables depuis le 2026-08-04 : on se raccroche
  // à celles du seed plutôt que d'en inventer, sinon le smoke laisserait des
  // rayons fantômes derrière lui.
  const catAutomate = await prisma.categorieProduit.findUnique({ where: { nom: "Automate" } });
  const catSonde = await prisma.categorieProduit.findUnique({ where: { nom: "Sonde" } });
  if (!catAutomate || !catSonde) {
    throw new Error("Catégories « Automate »/« Sonde » absentes : la migration est-elle passée ?");
  }

  const automate = await prisma.produit.create({
    data: {
      refInterne: `${PREFIXE}ECY-303`,
      refFabricant: "ECY-303",
      designation: "Automate ECLYPSE (smoke)",
      categorieId: catAutomate.id,
      serialisable: true,
      seuilMini: 2,
    },
  });
  const sonde = await prisma.produit.create({
    data: {
      refInterne: `${PREFIXE}SONDE-GAINE`,
      designation: "Sonde de gaine (smoke)",
      categorieId: catSonde.id,
      seuilMini: 5,
    },
  });

  // --- 2. Réceptions valorisées → stock + PMP ------------------------------
  await prisma.mouvementStock.create({
    data: {
      type: "RECEPTION",
      produitId: automate.id,
      quantite: 2,
      depotDestId: atelier.id,
      prixUnitaireCents: 40000,
    },
  });
  const reception2 = await prisma.mouvementStock.create({
    data: {
      type: "RECEPTION",
      produitId: automate.id,
      quantite: 3,
      depotDestId: atelier.id,
      prixUnitaireCents: 50000,
    },
  });
  verifier("stock après 2+3 réceptions", await stockDe(automate.id, [atelier.id]), 5);

  const pmpLignes = await prisma.$queryRaw<{ total: number; qte: number }[]>`
    SELECT SUM("quantite" * "prixUnitaireCents")::double precision AS total,
           SUM("quantite")::double precision AS qte
      FROM "MouvementStock"
     WHERE "type" = 'RECEPTION' AND "prixUnitaireCents" IS NOT NULL
       AND "produitId" = ${automate.id}`;
  const pmp = Math.round(pmpLignes[0].total / pmpLignes[0].qte);
  // (2×400 + 3×500) / 5 = 460 €
  verifier("prix moyen pondéré (centimes)", pmp, 46000);

  // --- 3. Sérialisation opportuniste ---------------------------------------
  for (const numeroSerie of ["SN-A", "SN-B"]) {
    await prisma.exemplaire.create({
      data: {
        produitId: automate.id,
        numeroSerie,
        etat: "EN_STOCK",
        depotId: atelier.id,
        receptionId: reception2.id,
      },
    });
  }
  const nbExemplaires = await prisma.exemplaire.count({ where: { produitId: automate.id } });
  verifier("exemplaires ≤ quantité reçue", nbExemplaires <= 5, true);
  verifier("le stock ne dépend PAS des séries", await stockDe(automate.id, [atelier.id]), 5);

  // --- 4. Sortie sur une affaire + BOM -------------------------------------
  const affaire = await prisma.chantier.findFirst({ where: { etat: { not: "CORBEILLE" } } });
  if (affaire) {
    await prisma.mouvementStock.create({
      data: {
        type: "SORTIE",
        produitId: automate.id,
        quantite: 1,
        depotSourceId: atelier.id,
        chantierId: affaire.id,
      },
    });
    verifier("stock après une sortie", await stockDe(automate.id, [atelier.id]), 4);

    await prisma.ligneMaterielAffaire.create({
      data: { chantierId: affaire.id, produitId: sonde.id, quantite: 6, note: "smoke" },
    });
    const { bomAffaire } = await import("../src/tools/magasin/bom");
    const bom = await bomAffaire(affaire.id);
    const ligneSonde = bom.lignes.find((l) => l.produitId === sonde.id);
    verifier("la ligne manuelle entre dans la BOM", ligneSonde?.besoin, 6);
    verifier("elle est intégralement manquante", ligneSonde?.manquant, 6);

    await prisma.reservationStock.create({
      data: { chantierId: affaire.id, produitId: sonde.id, quantite: 6 },
    });
    const bom2 = await bomAffaire(affaire.id);
    verifier(
      "réserver couvre le manquant",
      bom2.lignes.find((l) => l.produitId === sonde.id)?.manquant,
      0,
    );
  } else {
    console.log("… aucune affaire en base : étapes BOM/sortie sautées");
  }

  // --- 4 bis. « Aucun matériel » : réglé, donc plus signalé ------------------
  if (affaire) {
    const nomPoint = `${PREFIXE}Commande sur contact existant`;
    const projet = await prisma.affectationProjet.create({
      data: {
        nom: `${PREFIXE}projet`,
        chantierId: affaire.id,
        data: {
          rows: [{ id: "r1", kind: "point", nom: nomPoint, io: { AI: 0, DI: 0, AO: 0, DO: 1, COM: 0 } }],
          modules: [],
          controller: "",
        },
      },
    });

    const { bomAffaire } = await import("../src/tools/magasin/bom");
    const avant = await bomAffaire(affaire.id);
    verifier(
      "un point sans nomenclature est signalé",
      avant.trous.some((t) => t.cle === nomPoint && t.genre === "point"),
      true,
    );
    // Le type d'E/S est relevé pour créer l'entrée de catalogue, mais ne décide
    // de RIEN : une DO peut parfaitement appeler du matériel.
    verifier(
      "le type d'E/S est relevé sur la ligne",
      avant.trous.find((t) => t.cle === nomPoint)?.typeIo,
      "DO",
    );

    await prisma.pointCatalog.create({ data: { nom: nomPoint, type: "DO", sansMateriel: true } });
    const apres = await bomAffaire(affaire.id);
    verifier(
      "marqué « aucun matériel », il n'est plus signalé",
      apres.trous.some((t) => t.cle === nomPoint),
      false,
    );
    verifier(
      "et il n'ajoute aucune ligne de BOM",
      apres.lignes.length,
      avant.lignes.length,
    );

    await prisma.affectationProjet.delete({ where: { id: projet.id } });
    await prisma.pointCatalog.deleteMany({ where: { nom: { startsWith: PREFIXE } } });
  }

  // --- 4 quater. « Hors de notre fourniture » --------------------------------
  // L'article est bien appelé par le chantier, mais il est déjà sur place : la
  // ligne doit RESTER VISIBLE (sinon on ne pourrait pas décocher) tout en
  // sortant du besoin, du manquant et du coût. Et cocher/décocher doit être
  // exactement symétrique.
  if (affaire) {
    const { bomAffaire } = await import("../src/tools/magasin/bom");

    const avant = await bomAffaire(affaire.id);
    const ligneAvant = avant.lignes.find((l) => l.produitId === sonde.id);
    verifier("fourni : la ligne pèse sur le besoin", (ligneAvant?.besoin ?? 0) > 0, true);
    verifier("fourni : elle n'est pas hors fourniture", ligneAvant?.horsFourniture, false);
    const besoinAvant = avant.lignes.reduce((s, l) => (l.horsFourniture ? s : s + l.besoin), 0);
    const coutAvant = avant.coutPrevuCents;

    // `basculerHorsFourniture` passe par auth() : on écrit la ligne en direct,
    // c'est l'invariant de la BOM qu'on teste ici, pas la garde d'authentification.
    await prisma.materielHorsFourniture.create({
      data: { chantierId: affaire.id, produitId: sonde.id, note: "smoke" },
    });

    const apres = await bomAffaire(affaire.id);
    const ligneApres = apres.lignes.find((l) => l.produitId === sonde.id);
    verifier("hors fourniture : la ligne reste visible", !!ligneApres, true);
    verifier("hors fourniture : elle est marquée", ligneApres?.horsFourniture, true);
    verifier("hors fourniture : plus rien ne manque dessus", ligneApres?.manquant, 0);
    verifier("hors fourniture : elle est comptée à part", apres.nbHorsFourniture, 1);
    verifier(
      "hors fourniture : le besoin à fournir retombe",
      apres.lignes.reduce((s, l) => (l.horsFourniture ? s : s + l.besoin), 0),
      besoinAvant - (ligneAvant?.besoin ?? 0),
    );
    verifier(
      "hors fourniture : le coût prévu ne la compte plus",
      apres.coutPrevuCents,
      coutAvant - (ligneAvant?.pmpCents ?? 0) * (ligneAvant?.besoin ?? 0),
    );

    await prisma.materielHorsFourniture.deleteMany({
      where: { chantierId: affaire.id, produitId: sonde.id },
    });
    const retour = await bomAffaire(affaire.id);
    verifier("décocher rend le besoin à l'identique", retour.coutPrevuCents, coutAvant);
    verifier("décocher ne laisse aucune trace", retour.nbHorsFourniture, 0);
  }

  // --- 4 ter. Le modèle d'import se relit tout seul --------------------------
  // Le fichier proposé au téléchargement porte exactement les libellés attendus :
  // si cette propriété casse, l'utilisateur télécharge un modèle que l'import ne
  // sait plus mapper — et il n'y a rien de plus déroutant.
  {
    const { genererModele } = await import("../src/tools/magasin/modele-import");
    const { CHAMPS, devinerMapping } = await import("../src/tools/magasin/import-model");
    for (const genre of ["produits", "stock"] as const) {
      const csv = genererModele(genre);
      const lignes = csv.replace(/^﻿/, "").trim().split("\r\n");
      const entetes = lignes[0].split(";").map((c) => c.replace(/^"|"$/g, "").replace(/""/g, '"'));
      const mapping = devinerMapping(genre, entetes);
      verifier(
        `modèle « ${genre} » : toutes les colonnes reconnues`,
        Object.keys(mapping).length,
        CHAMPS[genre].length,
      );
      verifier(`modèle « ${genre} » : deux lignes d'exemple`, lignes.length - 1, 2);
    }
  }

  // --- 4 quater. Supprimable ou non ----------------------------------------
  // Le garde-fou de la suppression : `MouvementStock` est en cascade sur le
  // produit, donc supprimer un article qui a bougé emporterait son historique.
  {
    const { ficheProduit } = await import("../src/tools/magasin/queries");
    const ficheAutomate = await ficheProduit(automate.id);
    verifier("un produit qui a bougé n'est PAS supprimable", ficheAutomate?.supprimable, false);

    const jetable = await prisma.produit.create({
      data: { refInterne: `${PREFIXE}JETABLE`, designation: "Créé par erreur" },
    });
    const ficheJetable = await ficheProduit(jetable.id);
    verifier("un produit sans histoire est supprimable", ficheJetable?.supprimable, true);
    await prisma.produit.delete({ where: { id: jetable.id } });
  }

  // --- 5. Écart d'inventaire ------------------------------------------------
  await prisma.mouvementStock.create({
    data: {
      type: "ECART",
      produitId: automate.id,
      quantite: 1,
      // compté 1 de moins que le théorique → une sortie d'écart
      depotSourceId: atelier.id,
      note: "smoke : écart négatif",
    },
  });
  verifier(
    "un écart négatif décrémente comme une sortie",
    await stockDe(automate.id, [atelier.id]),
    affaire ? 3 : 4,
  );

  // --- 6. Le rayon voit la même chose --------------------------------------
  const { listerRayon } = await import("../src/tools/magasin/queries");
  const rayon = await listerRayon({ q: PREFIXE });
  const ligneAutomate = rayon.find((l) => l.id === automate.id);
  verifier("le rayon calcule le même stock", ligneAutomate?.stock, affaire ? 3 : 4);
  verifier("le rayon calcule le même PMP", ligneAutomate?.pmpCents, 46000);
  const ligneSondeRayon = rayon.find((l) => l.id === sonde.id);
  verifier("la sonde réservée passe sous son seuil", ligneSondeRayon?.sousSeuil, true);

  // --- 7. Un produit jamais reçu se chiffre au prix d'achat annoncé ---------
  verifier("sans achat ni prix annoncé, aucun prix", ligneSondeRayon?.prixRefCents, null);
  const fournisseur = await prisma.fournisseur.create({ data: { nom: `${PREFIXE}Fournisseur` } });
  await prisma.produit.update({
    where: { id: sonde.id },
    data: { fournisseurId: fournisseur.id, prixAchatCents: 8900, refFournisseur: "F-SONDE" },
  });
  const rayon2 = await listerRayon({ q: PREFIXE });
  const sonde2 = rayon2.find((l) => l.id === sonde.id);
  verifier("le prix d'achat annoncé sert de repli", sonde2?.prixRefCents, 8900);
  verifier("et la provenance est annoncée", sonde2?.sourcePrix, "achat");
  // L'automate, lui, A été reçu : le prix payé doit primer sur le prix annoncé.
  await prisma.produit.update({
    where: { id: automate.id },
    data: { fournisseurId: fournisseur.id, prixAchatCents: 99900 },
  });
  const rayon3 = await listerRayon({ q: PREFIXE });
  const automate3 = rayon3.find((l) => l.id === automate.id);
  verifier("le prix payé prime sur le prix annoncé", automate3?.prixRefCents, 46000);
  verifier("et la provenance le dit", automate3?.sourcePrix, "pmp");
  // Un produit = un fournisseur : la fiche le porte directement.
  const ficheSonde = await (await import("../src/tools/magasin/queries")).ficheProduit(sonde.id);
  verifier("le fournisseur est porté par le produit", ficheSonde?.fournisseurNom, `${PREFIXE}Fournisseur`);
  verifier("avec sa référence à lui", ficheSonde?.refFournisseur, "F-SONDE");

  // --- 8. Les référentiels catégorie & fabricant ---------------------------
  // Deux promesses à tenir : un libellé écrit autrement ne crée pas un doublon,
  // et supprimer une entrée ne supprime jamais les produits qui la portent.
  {
    const { cleReferentiel } = await import("../src/tools/magasin/model");
    verifier(
      "casse, accents et espaces ne font pas deux fabricants",
      [cleReferentiel("SIEMENS"), cleReferentiel(" Siémens "), cleReferentiel("siemens")].every(
        (c) => c === "siemens",
      ),
      true,
    );
    verifier(
      "une vraie faute de frappe reste distincte (elle se fusionne à la main)",
      cleReferentiel("Siemnes") === cleReferentiel("Siemens"),
      false,
    );

    const fabricant = await prisma.fabricant.create({ data: { nom: `${PREFIXE}Fabricant` } });
    const categorie = await prisma.categorieProduit.create({
      data: { nom: `${PREFIXE}Catégorie`, ordre: 99 },
    });
    await prisma.produit.update({
      where: { id: sonde.id },
      data: { fabricantId: fabricant.id, categorieId: categorie.id },
    });

    const rayonRef = await listerRayon({ q: PREFIXE });
    const sondeRef = rayonRef.find((l) => l.id === sonde.id);
    verifier("le rayon affiche le fabricant", sondeRef?.fabricantNom, `${PREFIXE}Fabricant`);
    verifier("le rayon affiche la catégorie", sondeRef?.categorieNom, `${PREFIXE}Catégorie`);

    // Un nom déjà pris ne peut pas exister deux fois : c'est l'index unique qui
    // le garantit, pas seulement la couche applicative.
    let refusee = false;
    try {
      await prisma.categorieProduit.create({ data: { nom: `${PREFIXE}Catégorie` } });
    } catch {
      refusee = true;
    }
    verifier("deux catégories ne peuvent pas porter le même nom", refusee, true);

    // Le point qui compte : supprimer emporte le rangement, jamais le produit.
    await prisma.categorieProduit.delete({ where: { id: categorie.id } });
    await prisma.fabricant.delete({ where: { id: fabricant.id } });
    const sondeApres = await prisma.produit.findUnique({
      where: { id: sonde.id },
      select: { id: true, categorieId: true, fabricantId: true },
    });
    verifier("supprimer une catégorie ne supprime pas ses produits", Boolean(sondeApres), true);
    verifier("le produit se retrouve sans catégorie", sondeApres?.categorieId, null);
    verifier("et sans fabricant", sondeApres?.fabricantId, null);
  }

  // La fiche produit agrège séparément (elle détaille par dépôt) : les deux
  // chemins de calcul doivent tomber sur le même chiffre.
  const { ficheProduit } = await import("../src/tools/magasin/queries");
  const fiche = await ficheProduit(automate.id);
  verifier("la fiche produit calcule le même stock", fiche?.stock, affaire ? 3 : 4);
  verifier(
    "le stock par dépôt correspond",
    fiche?.parDepot.find((d) => d.depotId === atelier.id)?.quantite,
    affaire ? 3 : 4,
  );
}

async function nettoyer() {
  const produits = await prisma.produit.findMany({
    where: { refInterne: { startsWith: PREFIXE } },
    select: { id: true },
  });
  const ids = produits.map((p) => p.id);
  if (ids.length === 0) return;
  await prisma.produit.updateMany({ where: { id: { in: ids } }, data: { fournisseurId: null } });
  await prisma.exemplaire.deleteMany({ where: { produitId: { in: ids } } });
  await prisma.mouvementStock.deleteMany({ where: { produitId: { in: ids } } });
  await prisma.reservationStock.deleteMany({ where: { produitId: { in: ids } } });
  await prisma.ligneMaterielAffaire.deleteMany({ where: { produitId: { in: ids } } });
  await prisma.ligneInventaire.deleteMany({ where: { produitId: { in: ids } } });
  await prisma.nomenclaturePoint.deleteMany({ where: { produitId: { in: ids } } });
  await prisma.codeBarreProduit.deleteMany({ where: { produitId: { in: ids } } });
  await prisma.produit.deleteMany({ where: { id: { in: ids } } });
  // Filets de sécurité : ces deux-là sont supprimés dans le fil du test, mais
  // un échec en cours de route ne doit rien laisser derrière lui.
  await prisma.affectationProjet.deleteMany({ where: { nom: { startsWith: PREFIXE } } });
  await prisma.pointCatalog.deleteMany({ where: { nom: { startsWith: PREFIXE } } });
  await prisma.fournisseur.deleteMany({ where: { nom: { startsWith: PREFIXE } } });
  await prisma.categorieProduit.deleteMany({ where: { nom: { startsWith: PREFIXE } } });
  await prisma.fabricant.deleteMany({ where: { nom: { startsWith: PREFIXE } } });
  console.log(`\nNettoyage : ${ids.length} produit(s) de test supprimé(s).`);
}

main()
  .catch((e) => {
    ko += 1;
    console.error("✗ ERREUR :", e);
  })
  .finally(async () => {
    await nettoyer();
    await prisma.$disconnect();
    console.log(ko === 0 ? "\n✅ Tout est cohérent." : `\n❌ ${ko} vérification(s) en échec.`);
    process.exit(ko === 0 ? 0 : 1);
  });
