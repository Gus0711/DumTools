/**
 * Génère trois devis d'exemple, sans affaire rattachée, couvrant tous les cas
 * que le moteur sait traiter.
 *
 *   npx tsx --conditions=react-server scripts/devis-exemples.mts
 *
 * Ce sont de VRAIES données, dans la vraie base : le script n'efface rien. Il
 * est rejouable (il crée simplement trois devis de plus, avec les numéros
 * suivants).
 *
 * ⚠️ Les TAUX DE PRESTATION posés ici sont des ordres de grandeur destinés à
 * rendre les exemples lisibles — ce ne sont pas les tarifs de Dumortier. À
 * corriger sur /perso/gus/devis/referentiels avant tout usage réel.
 *
 * Le script repasse par les MÊMES fonctions que l'application (cascade du
 * coefficient, arrondi, compteur atomique) : ce qu'il produit est exactement ce
 * que l'interface aurait produit à la main.
 */

import "dotenv/config";
import { prisma } from "../src/lib/db";
import { prixParProduit, prixReference } from "../src/tools/magasin/queries";
import {
  RANG_DEVIS_MAX,
  coefApplicable,
  formatNumeroDevis,
  pvDepuisDebourse,
  type GenreLigne,
  type GrilleCoefs,
} from "../src/tools/devis/model";

/* --- Le référentiel de prestations (ordres de grandeur, à corriger) -------- */

const PRESTATIONS = [
  { libelle: "Étude & synoptique", famille: "Bureau d'études", prix: 6800, unite: "h", ordre: 1 },
  { libelle: "Programmation automate", famille: "Bureau d'études", prix: 7400, unite: "h", ordre: 2 },
  { libelle: "Mise en service", famille: "Terrain", prix: 7900, unite: "h", ordre: 3 },
  { libelle: "Câblage armoire", famille: "Atelier", prix: 6200, unite: "h", ordre: 4 },
  { libelle: "Déplacement", famille: "Terrain", prix: 9500, unite: "forfait", ordre: 5 },
  { libelle: "Formation & transfert de compétences", famille: "Bureau d'études", prix: 48000, unite: "j", ordre: 6 },
];

/* --- Utilitaires ----------------------------------------------------------- */

async function prochainRang(annee: number): Promise<number> {
  const lignes = await prisma.$queryRaw<{ dernier: number }[]>`
    INSERT INTO "CompteurDevis" ("annee", "dernier") VALUES (${annee}, 1)
    ON CONFLICT ("annee") DO UPDATE SET "dernier" = "CompteurDevis"."dernier" + 1
    RETURNING "dernier"`;
  const rang = lignes[0]?.dernier ?? 1;
  if (rang > RANG_DEVIS_MAX) throw new Error("Compteur de devis saturé");
  return rang;
}

let curseurOrdre = 0;
function ordreSuivant(): number {
  curseurOrdre += 1000;
  return curseurOrdre;
}

async function grille(): Promise<GrilleCoefs> {
  const lignes = await prisma.coefVente.findMany();
  const g: GrilleCoefs = { globalMillieme: 1350, parCategorie: {}, parProduit: {} };
  for (const l of lignes) {
    if (l.portee === "GLOBAL") g.globalMillieme = l.coefMillieme;
    else if (l.portee === "CATEGORIE" && l.cibleId) g.parCategorie[l.cibleId] = l.coefMillieme;
    else if (l.portee === "PRODUIT" && l.cibleId) g.parProduit[l.cibleId] = l.coefMillieme;
  }
  return g;
}

async function produit(ref: string) {
  const p = await prisma.produit.findUnique({
    where: { refInterne: ref },
    select: { id: true, refInterne: true, designation: true, unite: true, categorieId: true },
  });
  if (!p) throw new Error(`Article introuvable : ${ref}`);
  return p;
}

/* --- Les trois fabriques de lignes, calquées sur actions.ts ---------------- */

interface Ctx {
  devisId: string;
  coefDefaut: number;
  g: GrilleCoefs;
  prix: Awaited<ReturnType<typeof prixParProduit>>;
}

async function ligneArticle(
  ctx: Ctx,
  lotId: string | null,
  ref: string,
  quantite: number,
  extra: { option?: boolean; remisePourMille?: number; coefForce?: number; note?: string } = {},
) {
  const p = await produit(ref);
  const debourse = prixReference(ctx.prix.get(p.id)).cents;
  const { coefMillieme, origine } = coefApplicable(
    ctx.g,
    ctx.coefDefaut,
    { produitId: p.id, categorieId: p.categorieId },
    extra.coefForce ?? null,
  );
  await prisma.ligneDevis.create({
    data: {
      devisId: ctx.devisId,
      lotId,
      ordre: ordreSuivant(),
      genre: "PRODUIT",
      produitId: p.id,
      designation: p.designation,
      refInterne: p.refInterne,
      unite: p.unite,
      quantiteMillieme: Math.round(quantite * 1000),
      debourseCents: debourse,
      coefMillieme: debourse === null ? null : coefMillieme,
      origineCoef: origine,
      pvUnitaireCents: debourse === null ? 0 : pvDepuisDebourse(debourse, coefMillieme),
      option: extra.option ?? false,
      remisePourMille: extra.remisePourMille ?? 0,
      note: extra.note ?? "",
    },
  });
}

async function lignePrestation(
  ctx: Ctx,
  lotId: string | null,
  libelle: string,
  quantite: number,
) {
  const p = await prisma.prestation.findUnique({ where: { libelle } });
  if (!p) throw new Error(`Prestation introuvable : ${libelle}`);
  await prisma.ligneDevis.create({
    data: {
      devisId: ctx.devisId,
      lotId,
      ordre: ordreSuivant(),
      genre: "PRESTATION",
      prestationId: p.id,
      designation: p.libelle,
      unite: p.unite,
      quantiteMillieme: Math.round(quantite * 1000),
      debourseCents: null,
      coefMillieme: null,
      origineCoef: "ligne",
      pvUnitaireCents: p.prixVenteCents,
    },
  });
}

async function ligneSimple(
  ctx: Ctx,
  lotId: string | null,
  genre: Exclude<GenreLigne, "PRODUIT" | "PRESTATION">,
  designation: string,
  options: { pv?: number; quantite?: number; unite?: string } = {},
) {
  await prisma.ligneDevis.create({
    data: {
      devisId: ctx.devisId,
      lotId,
      ordre: ordreSuivant(),
      genre,
      designation,
      unite: options.unite ?? "U",
      quantiteMillieme: genre === "TEXTE" ? 0 : Math.round((options.quantite ?? 1) * 1000),
      debourseCents: null,
      coefMillieme: null,
      origineCoef: "ligne",
      pvUnitaireCents: genre === "TEXTE" ? 0 : (options.pv ?? 0),
    },
  });
}

async function nouveauLot(devisId: string, titre: string) {
  return prisma.lotDevis.create({
    data: { devisId, titre, ordre: ordreSuivant() },
    select: { id: true },
  });
}

async function nouveauDevis(
  auteurId: string,
  d: {
    titre: string;
    clientNom: string;
    etat: "BROUILLON" | "EMIS" | "ACCEPTE" | "REFUSE";
    tva: number;
    coefDefaut: number;
    remisePourMille?: number;
    remiseCents?: number;
    note?: string;
    validiteJours?: number;
  },
) {
  const annee = new Date().getFullYear();
  const numero = formatNumeroDevis(annee, await prochainRang(annee));
  return prisma.devis.create({
    data: {
      numero,
      revision: 1,
      titre: d.titre,
      etat: d.etat,
      clientNom: d.clientNom,
      // Client résolu dans le référentiel (convention de la maison), mais AUCUNE
      // affaire rattachée : c'est le cas du devis d'avant-projet.
      clientId: (
        await prisma.client.upsert({
          where: { nom: d.clientNom },
          update: {},
          create: { nom: d.clientNom },
          select: { id: true },
        })
      ).id,
      numeroWhy: null,
      chantierId: null,
      coefDefautMillieme: d.coefDefaut,
      tauxTvaCentieme: d.tva,
      remiseGlobalePourMille: d.remisePourMille ?? null,
      remiseGlobaleCents: d.remiseCents ?? null,
      validiteJours: d.validiteJours ?? 30,
      note: d.note ?? "",
      emisLe: d.etat === "EMIS" || d.etat === "ACCEPTE" ? new Date() : null,
      createdById: auteurId,
      updatedById: auteurId,
    },
  });
}

/* =============================================================================
 * LE SCRIPT
 * ========================================================================== */

const auteur =
  (await prisma.user.findFirst({ where: { email: "augustin.duhant@fareneit.fr" } })) ??
  (await prisma.user.findFirst({ where: { role: "ADMIN" } }));
if (!auteur) throw new Error("Aucun administrateur en base");

/* --- 1. Le référentiel : prestations + coefficients ------------------------ */

for (const p of PRESTATIONS) {
  await prisma.prestation.upsert({
    where: { libelle: p.libelle },
    update: {},
    create: {
      libelle: p.libelle,
      famille: p.famille,
      prixVenteCents: p.prix,
      unite: p.unite,
      ordre: p.ordre,
    },
  });
}
console.log(`✔ ${PRESTATIONS.length} prestations en place (taux à corriger).`);

async function poserCoef(portee: string, cibleId: string | null, coef: number, note: string) {
  const existant = await prisma.coefVente.findFirst({ where: { portee, cibleId } });
  if (existant) {
    await prisma.coefVente.update({
      where: { id: existant.id },
      data: { coefMillieme: coef, note, updatedById: auteur!.id },
    });
  } else {
    await prisma.coefVente.create({
      data: { portee, cibleId, coefMillieme: coef, note, updatedById: auteur!.id },
    });
  }
}

await poserCoef("GLOBAL", null, 1400, "Coefficient par défaut de la maison");
const catAutomate = await prisma.categorieProduit.findFirst({ where: { nom: "Automate" } });
if (catAutomate) {
  await poserCoef("CATEGORIE", catAutomate.id, 1250, "Matériel Distech — volume, marge plus courte");
}
const ecran = await prisma.produit.findFirst({ where: { refInterne: "DISHORYZONC10" } });
if (ecran) await poserCoef("PRODUIT", ecran.id, 1550, "Écran tactile — pose et paramétrage compris");
console.log("✔ Coefficients posés : global ×1,40 · Automate ×1,25 · écran C10 ×1,55.");

const g = await grille();
const prix = await prixParProduit();

/* --- Devis 1 : le cas complet ---------------------------------------------- */

const d1 = await nouveauDevis(auteur.id, {
  titre: "GTB chaufferie & CTA — Groupe scolaire Les Tilleuls",
  clientNom: "Commune de Vervins",
  etat: "BROUILLON",
  tva: 2000,
  coefDefaut: 1400,
  remisePourMille: 30,
  validiteJours: 45,
  note: "Chiffrage sur relevé du 12/07. Reprise des sondes existantes en chaufferie.",
});
const c1: Ctx = { devisId: d1.id, coefDefaut: 1400, g, prix };

const l1a = await nouveauLot(d1.id, "Fourniture GTB");
await ligneArticle(c1, l1a.id, "DISECY600C25", 1);
await ligneArticle(c1, l1a.id, "DISECY8UI", 2, { remisePourMille: 50 });
await ligneArticle(c1, l1a.id, "DISECY6UO", 2, { remisePourMille: 50 });
await ligneArticle(c1, l1a.id, "DISECYPS24", 1);
await ligneArticle(c1, l1a.id, "COF3RANGEES", 1);
await ligneSimple(
  c1,
  l1a.id,
  "TEXTE",
  "Armoire équipée et repérée en atelier, essais à blanc avant livraison sur site.",
);
// L'option : chiffrée, affichée, hors total tant qu'elle n'est pas levée.
await ligneArticle(c1, l1a.id, "DISHORYZONC10", 1, { option: true });

const l1b = await nouveauLot(d1.id, "Armoire électrique");
// Un disjoncteur SANS prix d'achat connu : la ligne existe, elle est signalée,
// et elle n'est surtout pas comptée pour zéro.
await ligneArticle(c1, l1b.id, "DISC6", 6);
await ligneSimple(c1, l1b.id, "LIBRE", "Petit appareillage, goulottes et repérage — forfait atelier", {
  pv: 34000,
});

const l1c = await nouveauLot(d1.id, "Main d'œuvre");
await lignePrestation(c1, l1c.id, "Étude & synoptique", 8);
await lignePrestation(c1, l1c.id, "Programmation automate", 24);
await lignePrestation(c1, l1c.id, "Mise en service", 16);
await lignePrestation(c1, l1c.id, "Déplacement", 2);
console.log(`✔ ${d1.numero} — le cas complet (3 lots, option, remises, ligne sans prix).`);

/* --- Devis 2 : autoliquidation, coef forcé, hors lot ----------------------- */

const d2 = await nouveauDevis(auteur.id, {
  titre: "Reprise supervision EC-Net — sous-traitance",
  clientNom: "Eiffage Énergie Systèmes",
  etat: "EMIS",
  tva: 0,
  coefDefaut: 1400,
  remiseCents: 50000,
  validiteJours: 30,
  note: "Autoliquidation de la TVA — sous-traitance bâtiment (art. 283-2 nonies du CGI).",
});
const c2: Ctx = { devisId: d2.id, coefDefaut: 1400, g, prix };

const l2a = await nouveauLot(d2.id, "Matériel");
// Coefficient FORCÉ sur la ligne : il gagne sur la catégorie et sur le défaut.
await ligneArticle(c2, l2a.id, "DISECNet Designer 5000", 1, { coefForce: 1150 });
await ligneArticle(c2, l2a.id, "DISECNet Supervisor Integration Pack - 1250", 1);

const l2b = await nouveauLot(d2.id, "Prestations");
await lignePrestation(c2, l2b.id, "Programmation automate", 12);
await lignePrestation(c2, l2b.id, "Mise en service", 8);
await lignePrestation(c2, l2b.id, "Formation & transfert de compétences", 1);

// Deux lignes HORS LOT : elles se rangent en fin de devis, sous leur propre
// groupe. Rien n'oblige à tout classer.
await ligneSimple(c2, null, "LIBRE", "Sauvegarde et restitution des programmes existants", {
  pv: 28000,
});
await ligneSimple(c2, null, "TEXTE", "Intervention en site occupé, hors horaires d'exploitation.");
console.log(`✔ ${d2.numero} — autoliquidation, coefficient forcé, lignes hors lot.`);

/* --- Devis 3 : v1 émise, puis v2 négociée ---------------------------------- */

const d3 = await nouveauDevis(auteur.id, {
  titre: "Régulation CTA + GTC — Centre technique municipal",
  clientNom: "Ville de Saint-Quentin",
  etat: "EMIS",
  tva: 2000,
  coefDefaut: 1400,
  validiteJours: 30,
});
const c3: Ctx = { devisId: d3.id, coefDefaut: 1400, g, prix };

const l3a = await nouveauLot(d3.id, "Fourniture");
await ligneArticle(c3, l3a.id, "DISECYS1000C50", 1);
await ligneArticle(c3, l3a.id, "DISECY4UI4UO", 3);
await ligneArticle(c3, l3a.id, "DISIORM3", 4);
await ligneArticle(c3, l3a.id, "HDR1524", 2);
await ligneArticle(c3, l3a.id, "DISECYDISPLAY15", 1, { option: true });

const l3b = await nouveauLot(d3.id, "Main d'œuvre");
await lignePrestation(c3, l3b.id, "Étude & synoptique", 6);
await lignePrestation(c3, l3b.id, "Câblage armoire", 14);
await lignePrestation(c3, l3b.id, "Programmation automate", 18);
await lignePrestation(c3, l3b.id, "Mise en service", 10);
console.log(`✔ ${d3.numero} v1 — émise.`);

// La révision : même numéro, contenu recopié À L'IDENTIQUE (les prix figés le
// restent), puis on négocie.
const source = await prisma.devis.findUnique({
  where: { id: d3.id },
  include: { lots: { orderBy: { ordre: "asc" } }, lignes: { orderBy: { ordre: "asc" } } },
});
const v2 = await prisma.devis.create({
  data: {
    numero: source!.numero,
    revision: 2,
    parentId: source!.id,
    titre: source!.titre,
    etat: "BROUILLON",
    clientNom: source!.clientNom,
    clientId: source!.clientId,
    coefDefautMillieme: source!.coefDefautMillieme,
    tauxTvaCentieme: source!.tauxTvaCentieme,
    // La négociation : remise plus forte que sur la v1.
    remiseGlobalePourMille: 70,
    validiteJours: source!.validiteJours,
    note: "Révision après négociation du 05/08 : remise portée à 7 %, écran déporté retiré.",
    createdById: auteur.id,
    updatedById: auteur.id,
  },
});
const idLot = new Map<string, string>();
for (const l of source!.lots) {
  const n = await prisma.lotDevis.create({
    data: { devisId: v2.id, titre: l.titre, ordre: l.ordre, note: l.note },
  });
  idLot.set(l.id, n.id);
}
for (const l of source!.lignes) {
  // L'option a sauté à la négociation : elle n'est pas recopiée dans la v2.
  if (l.option) continue;
  await prisma.ligneDevis.create({
    data: {
      devisId: v2.id,
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
      option: false,
      note: l.note,
    },
  });
}
// Un prix de vente FORCÉ à la main sur la v2 : le coefficient s'efface, la
// colonne l'annonce (« P.V. forcé »).
const aForcer = await prisma.ligneDevis.findFirst({
  where: { devisId: v2.id, refInterne: "DISECYS1000C50" },
});
if (aForcer) {
  await prisma.ligneDevis.update({
    where: { id: aForcer.id },
    data: { pvUnitaireCents: 175000, coefMillieme: null, origineCoef: "ligne" },
  });
}
console.log(`✔ ${v2.numero} v2 — révision négociée (option retirée, P.V. forcé).`);

await prisma.$disconnect();
console.log("\nTrois devis créés, sans affaire rattachée. Bonne visite.");
