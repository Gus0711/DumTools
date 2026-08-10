/**
 * Test de bout en bout de la RESTITUTION CLIENT d'un devis — contre la VRAIE
 * base et le VRAI serveur.
 *
 *   scripts/serve-prod.sh --build      # dans un autre terminal (ou next dev)
 *   npx tsx scripts/devis-restitution-smoke.mts
 *
 * Ce que le harnais pur (devis-smoke.mts) ne peut pas voir, et qui casse en
 * silence :
 *   1. la page publique répond-elle SANS session (matcher de proxy.ts) ?
 *   2. le document contient-il les prix… et AUCUN déboursé, coefficient ou
 *      référence interne — la seule vérification qui compte vraiment ;
 *   3. un jeton échu, révoqué ou inconnu donne-t-il bien 404 ?
 *   4. l'étanchéité entre deux devis publiés (le média de l'un n'est pas
 *      accessible par le jeton de l'autre) ;
 *   5. la balise de consultation compte-t-elle une visite, et une seule ;
 *   6. le PDF sort-il, et est-ce un vrai PDF avec du texte ?
 *   7. un devis de PLUSIEURS PAGES se pagine-t-il sans rien perdre, et sans
 *      répéter le sous-total de lot (§7 bis — deux défauts réels).
 *
 * ⚠️ CE QUI N'EST PAS COUVERT ICI : l'impression depuis l'APERÇU INTERNE
 * (`/perso/gus/devis/[id]/apercu`), qui demande une session. C'est pourtant là
 * qu'un défaut de pagination s'est produit — le document y vit dans la coquille
 * de l'application, dont le cadre est `h-screen overflow-hidden`, et il s'y
 * faisait clipper à UNE page. À vérifier à la main après toute retouche de
 * `document-devis.css` : ouvrir l'aperçu d'un devis de trois pages et imprimer.
 *
 * NON DESTRUCTIF : tout est créé sous un préfixe dédié puis supprimé, y compris
 * en cas d'échec (bloc finally).
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { randomUUID } from "node:crypto";

const BASE = process.env.SMOKE_BASE_URL || `http://127.0.0.1:${process.env.PORT || 3000}`;
const MARQUE = "ZZ-SMOKE-RESTIT";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

let ok = 0;
let ko = 0;

function verifier(nom: string, condition: boolean, detail?: string) {
  if (condition) {
    ok += 1;
    console.log(`  ✔ ${nom}`);
  } else {
    ko += 1;
    console.error(`  ✘ ${nom}${detail ? ` — ${detail}` : ""}`);
  }
}

function egal(nom: string, obtenu: unknown, attendu: unknown) {
  verifier(nom, Object.is(obtenu, attendu), `obtenu ${String(obtenu)}, attendu ${String(attendu)}`);
}

/** Le texte d'un PDF SANS AUCUN ESPACE.
 *
 *  Chromium sème des espaces à l'intérieur des mots dans la couche de texte
 *  (« BO N PO UR AC C O RD », « CHARGÉ D 'AFFAI RE S ») : c'est l'effet du
 *  `letter-spacing` des estampilles. Chercher un libellé tel qu'on l'a écrit
 *  échoue donc sur du contenu pourtant bien présent — ça a failli me faire
 *  corriger un faux bug. ⚠️ Ne JAMAIS s'en servir pour vérifier une ABSENCE de
 *  montant : sans les espaces, « 840,00 » se trouve dans « 1 840,00 ». */
function sansEspaces(texte: string): string {
  return texte.replace(/\s/g, "");
}

/** Le nombre de pages — la seule mesure qui dise si un document a été coupé. */
async function nbPagesPdf(bin: Buffer): Promise<number> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({ data: new Uint8Array(bin) }).promise;
  return doc.numPages;
}

/** Le texte d'un PDF, page par page (pdf.js, déjà au dépôt pour l'import de
 *  schémas). Les espaces insécables sont ramenés à des espaces simples : le
 *  formatage des montants en pose, et on compare à des chaînes écrites à la
 *  main. */
async function texteDuPdf(bin: Buffer): Promise<string> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  // La construction `legacy` se passe de worker dans Node, et ses types
  // n'acceptent que `data` : on ne lui donne rien de plus.
  const doc = await pdfjs.getDocument({ data: new Uint8Array(bin) }).promise;
  let out = "";
  for (let p = 1; p <= doc.numPages; p += 1) {
    const page = await doc.getPage(p);
    const contenu = await page.getTextContent();
    out += contenu.items.map((i) => ("str" in i ? i.str : "")).join(" ") + "\n";
  }
  return out.replace(/[   ]/g, " ");
}

async function nettoyer() {
  const devis = await prisma.devis.findMany({
    where: { titre: { startsWith: MARQUE } },
    select: { id: true },
  });
  for (const d of devis) await prisma.devis.delete({ where: { id: d.id } });
  await prisma.client.deleteMany({ where: { nom: { startsWith: MARQUE } } });
}

try {
  await nettoyer();

  /* --- Le décor : un devis complet, publié -------------------------------- */
  console.log("\n1. Un devis publié");

  const jeton = randomUUID();
  const jetonAutre = randomUUID();

  const devis = await prisma.devis.create({
    data: {
      numero: "DT999901",
      revision: 1,
      titre: `${MARQUE} Complexe sportif`,
      etat: "EMIS",
      clientNom: `${MARQUE} Client`,
      destinataire: `${MARQUE} CLIENT\nService technique\n02800 CHARMES`,
      tauxTvaCentieme: 2000,
      validiteJours: 30,
      jetonPartage: jeton,
      partageExpireLe: new Date(Date.now() + 30 * 24 * 3600 * 1000),
      publieLe: new Date(),
      lots: {
        create: [
          { titre: "Fourniture GTB", ordre: 1000 },
          { titre: "Main d'œuvre", ordre: 2000 },
        ],
      },
    },
    include: { lots: true },
  });
  const lotFourniture = devis.lots.find((l) => l.titre === "Fourniture GTB")!;
  const lotMo = devis.lots.find((l) => l.titre === "Main d'œuvre")!;

  await prisma.ligneDevis.createMany({
    data: [
      {
        devisId: devis.id,
        lotId: lotFourniture.id,
        ordre: 1000,
        genre: "PRODUIT",
        designation: "AUTOMATE DISTECH ECY-303",
        // Ce sont ces trois valeurs qui NE DOIVENT PAS sortir chez le client.
        refInterne: "ZZSECRET-REF",
        debourseCents: 84000,
        coefMillieme: 1250,
        pvUnitaireCents: 105000,
        quantiteMillieme: 2000,
        unite: "U",
      },
      {
        devisId: devis.id,
        lotId: lotFourniture.id,
        ordre: 2000,
        genre: "TEXTE",
        designation: "Suivant schéma électrique joint",
        contenu: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "Suivant schéma électrique joint", styles: {} }],
          },
        ],
      },
      {
        devisId: devis.id,
        lotId: lotMo.id,
        ordre: 3000,
        genre: "PRESTATION",
        designation: "Mise en service",
        unite: "j",
        quantiteMillieme: 3000,
        pvUnitaireCents: 62000,
      },
      {
        devisId: devis.id,
        lotId: lotMo.id,
        ordre: 4000,
        genre: "PRODUIT",
        designation: "OPTION Supervision déportée",
        debourseCents: 40000,
        coefMillieme: 1350,
        pvUnitaireCents: 54000,
        option: true,
      },
    ],
  });

  // Un SECOND devis publié : c'est lui qui prouve l'étanchéité entre jetons.
  const autre = await prisma.devis.create({
    data: {
      numero: "DT999902",
      revision: 1,
      titre: `${MARQUE} Autre affaire`,
      etat: "EMIS",
      clientNom: `${MARQUE} Client`,
      jetonPartage: jetonAutre,
      partageExpireLe: new Date(Date.now() + 30 * 24 * 3600 * 1000),
      publieLe: new Date(),
    },
  });
  const mediaAutre = await prisma.devisMedia.create({
    data: {
      id: randomUUID(),
      devisId: autre.id,
      nom: "plan.png",
      mimeType: "image/png",
      taille: 4,
      fichier: "/inexistant/plan.png",
    },
  });

  /* --- 2. La page publique ----------------------------------------------- */
  console.log("\n2. La page publique, sans session");

  const rep = await fetch(`${BASE}/d/${jeton}`, { redirect: "manual" });
  egal("la page répond 200 sans authentification", rep.status, 200);
  const html = await rep.text();

  verifier("le numéro du devis est là", html.includes("DT999901"));
  verifier("l'objet est là", html.includes("Complexe sportif"));
  verifier("le pavé destinataire est là", html.includes("Service technique"));
  verifier("les lots sont titrés", html.includes("Fourniture GTB") && html.includes("Main d&#x27;œuvre") || html.includes("Main d'œuvre"));
  verifier("le commentaire du chiffrage est rendu", html.includes("Suivant schéma électrique joint"));

  // Les prix de vente : 2 × 1 050,00 = 2 100,00 ; 3 j × 620,00 = 1 860,00.
  verifier("le prix unitaire de vente est affiché", html.includes("1 050,00"));
  verifier("le total de ligne est affiché", html.includes("2 100,00"));
  verifier("le total HT est affiché (3 960,00)", html.includes("3 960,00"));
  verifier("la TVA est affichée (792,00)", html.includes("792,00"));
  verifier("le TTC est affiché (4 752,00)", html.includes("4 752,00"));
  verifier("l'acompte est calculé sur le TTC (2 376,00)", html.includes("2 376,00"));
  verifier("l'option est listée à part", html.includes("Options"));
  verifier("… et son montant n'entre pas dans le total", !html.includes("5 400,00"));
  verifier("le pied légal est présent", html.includes("RCS"));
  verifier("le cadre à signer est présent", html.includes("Bon pour accord"));
  verifier("la page n'est pas indexable", html.includes("noindex"));

  // LA vérification qui compte : rien du chiffrage interne ne sort.
  console.log("\n3. Ce qui ne doit JAMAIS sortir");
  verifier("aucune référence interne", !html.includes("ZZSECRET-REF"));
  verifier("aucun déboursé (840,00)", !html.includes("840,00"));
  verifier("aucun déboursé de l'option (400,00)", !html.includes("400,00"));
  verifier("aucun coefficient (1,25 / ×1,25)", !html.includes("×1,25") && !html.includes("1,250"));
  verifier("aucune mention de marge", !/marge/i.test(html));
  verifier("aucune mention de déboursé", !/débours/i.test(html));

  /* --- 4. Les jetons qui ne valent rien ----------------------------------- */
  console.log("\n4. Jeton inconnu, échu, révoqué");

  egal("jeton inconnu → 404", (await fetch(`${BASE}/d/${randomUUID()}`)).status, 404);

  await prisma.devis.update({
    where: { id: autre.id },
    data: { partageExpireLe: new Date(Date.now() - 3600_000) },
  });
  egal("jeton ÉCHU → 404 (le jeton reste en base)", (await fetch(`${BASE}/d/${jetonAutre}`)).status, 404);
  egal(
    "… et son PDF aussi",
    (await fetch(`${BASE}/api/public/devis/${jetonAutre}/pdf`)).status,
    404,
  );

  // Remis en service pour la suite (prolongation à la même URL).
  await prisma.devis.update({
    where: { id: autre.id },
    data: { partageExpireLe: new Date(Date.now() + 3600_000) },
  });
  egal("prolongé → le MÊME lien remarche", (await fetch(`${BASE}/d/${jetonAutre}`)).status, 200);

  /* --- 5. Étanchéité entre deux devis ------------------------------------- */
  console.log("\n5. Étanchéité entre jetons");
  egal(
    "le média d'un autre devis n'est pas servi par ce jeton",
    (await fetch(`${BASE}/api/public/devis/${jeton}/media/${mediaAutre.id}`)).status,
    404,
  );
  egal(
    "la route média interne reste fermée sans session",
    (await fetch(`${BASE}/api/devis/media/${mediaAutre.id}`, { redirect: "manual" })).status,
    // Sans session, le proxy renvoie sur /login (307) — jamais le binaire.
    307,
  );

  /* --- 6. Le journal de consultation -------------------------------------- */
  console.log("\n6. Le journal de consultation");

  egal("aucune consultation avant la balise", await prisma.devisConsultation.count({ where: { devisId: devis.id } }), 0);

  const balise = await fetch(`${BASE}/api/public/devis/${jeton}/vu`, { method: "POST" });
  egal("la balise répond 204", balise.status, 204);
  egal(
    "une consultation est enregistrée",
    await prisma.devisConsultation.count({ where: { devisId: devis.id } }),
    1,
  );

  await fetch(`${BASE}/api/public/devis/${jeton}/vu`, { method: "POST" });
  await fetch(`${BASE}/api/public/devis/${jeton}/vu`, { method: "POST" });
  egal(
    "trois rafraîchissements du même lecteur = une seule visite",
    await prisma.devisConsultation.count({ where: { devisId: devis.id } }),
    1,
  );

  const vu = await prisma.devisConsultation.findFirst({ where: { devisId: devis.id } });
  verifier("l'IP enregistrée est tronquée", !!vu && (vu.ip === "" || /x\.x$|…$/.test(vu.ip)), vu?.ip);

  egal(
    "un jeton inconnu n'écrit rien",
    (await fetch(`${BASE}/api/public/devis/${randomUUID()}/vu`, { method: "POST" })).status,
    404,
  );

  /* --- 7. Le PDF ---------------------------------------------------------- */
  console.log("\n7. Le PDF");

  const repPdf = await fetch(`${BASE}/api/public/devis/${jeton}/pdf`);
  if (repPdf.status === 503) {
    console.log("  ⊘ Chromium absent sur cette machine : PDF non testé (repli « Imprimer » prévu)");
    console.log(`    ${(await repPdf.json()).error}`);
  } else {
    egal("le PDF répond 200", repPdf.status, 200);
    egal("… en application/pdf", repPdf.headers.get("content-type"), "application/pdf");
    verifier(
      "… avec le nom du devis en pièce jointe",
      (repPdf.headers.get("content-disposition") || "").includes("DT999901"),
    );
    const bin = Buffer.from(await repPdf.arrayBuffer());
    verifier("… c'est bien un PDF (%PDF)", bin.subarray(0, 4).toString() === "%PDF");
    verifier("… non vide (> 10 ko)", bin.length > 10_000, `${bin.length} octets`);

    /* ⚠️ On LIT le texte du PDF, on ne se contente pas de chercher « /Font »
       dans le binaire. Cette version faible du contrôle a laissé passer un PDF
       ENTIÈREMENT BLANC : le patron d'impression global masque tout sauf
       `.print-root`, le document sortait vide — et il restait un PDF valide, à
       deux pages, portant des polices (celles du pied de page que Chromium
       ajoute lui-même). Tous les contrôles passaient au vert. */
    const texte = await texteDuPdf(bin);
    verifier("… il porte du VRAI texte, extractible", texte.length > 200, `${texte.length} caractères`);
    verifier("… avec le numéro du devis", texte.includes("DT999901"));
    verifier("… la désignation des articles", texte.includes("AUTOMATE DISTECH"));
    verifier("… et les montants", texte.includes("3 960,00") && texte.includes("4 752,00"));
    verifier("… le déboursé n'y est pas non plus", !texte.includes("840,00"));
  }

  /* --- 7 bis. UN DEVIS QUI FAIT PLUSIEURS PAGES --------------------------
   *
   * Le devis ci-dessus tient sur une page : il ne dit rien de la pagination, et
   * c'est exactement là que ce document s'est cassé deux fois.
   *
   *   · l'aperçu interne n'imprimait QU'UNE PAGE sur un devis de quatre — le
   *     document vivait dans la coquille de l'application (`h-screen
   *     overflow-hidden`) et s'y faisait clipper ;
   *   · le sous-total de lot se RÉPÉTAIT en bas de chaque page traversée (un
   *     `<tfoot>` se répète comme un `<thead>`) : « Sous-total du lot » sous une
   *     demi-liste, c'est-à-dire un total qui n'est pas celui de ce qui est
   *     au-dessus.
   *
   * Aucun des deux ne produit d'erreur, et le premier laissait un PDF valide.
   * ------------------------------------------------------------------------ */
  console.log("\n7 bis. Un devis de plusieurs pages");

  const NB_LOTS = 3;
  const jetonLong = randomUUID();
  const long = await prisma.devis.create({
    data: {
      numero: "DT999903",
      titre: `${MARQUE} Multi-pages`,
      etat: "EMIS",
      clientNom: `${MARQUE} Client`,
      jetonPartage: jetonLong,
      partageExpireLe: new Date(Date.now() + 3600_000),
      publieLe: new Date(),
      lots: {
        create: Array.from({ length: NB_LOTS }, (_, i) => ({
          titre: `Lot ${i + 1}`,
          ordre: (i + 1) * 1000,
        })),
      },
    },
    include: { lots: true },
  });
  await prisma.ligneDevis.createMany({
    data: long.lots.flatMap((lot, il) =>
      // 14 lignes par lot : assez pour qu'un lot traverse une coupure de page,
      // ce qui est LE cas qui faisait apparaître le sous-total en double.
      Array.from({ length: 14 }, (_, i) => ({
        devisId: long.id,
        lotId: lot.id,
        ordre: il * 10_000 + (i + 1) * 100,
        genre: "PRODUIT" as const,
        designation: `LOT ${il + 1} ARTICLE ${i + 1} DÉSIGNATION LONGUE POUR OCCUPER LA COLONNE`,
        unite: "U",
        quantiteMillieme: 1000,
        debourseCents: 12000,
        coefMillieme: 1350,
        pvUnitaireCents: 16200,
      })),
    ),
  });

  const repLong = await fetch(`${BASE}/api/public/devis/${jetonLong}/pdf`);
  if (repLong.status === 503) {
    console.log("  ⊘ Chromium absent : pagination non testée");
  } else {
    const binLong = Buffer.from(await repLong.arrayBuffer());
    const pages = await nbPagesPdf(binLong);
    verifier("le document fait plusieurs pages", pages >= 3, `${pages} page(s)`);

    const brut = await texteDuPdf(binLong);
    const compact = sansEspaces(brut);

    // LA garde du sous-total : une fois par lot, jamais une de plus.
    const nbSousTotaux = compact.split("Sous-totaldulot").length - 1;
    egal("un sous-total par lot, pas un de plus", nbSousTotaux, NB_LOTS);

    // Toutes les lignes sont là : rien n'a été coupé au passage d'une page.
    const nbArticles = brut.split("DÉSIGNATION LONGUE").length - 1;
    egal("toutes les lignes sont imprimées", nbArticles, NB_LOTS * 14);

    // Et la FIN du document, celle qu'une troncature emporte la première.
    verifier("le cadre à signer survit à la pagination", compact.includes("BONPOURACCORD"));
    verifier("… et le pavé des totaux", compact.includes("TotalTTC"));
  }

  /* --- 8. Le rendu PDF de la page ---------------------------------------- */
  console.log("\n8. La page en mode PDF");
  const repVuePdf = await fetch(`${BASE}/d/${jeton}?pdf=1`);
  const htmlPdf = await repVuePdf.text();
  verifier("la barre du lecteur disparaît", !htmlPdf.includes("Télécharger le PDF"));
  verifier("… donc aucune consultation n'est comptée au téléchargement", !htmlPdf.includes("devis-lecteur"));
  verifier("le document reste entier", htmlPdf.includes("DT999901") && htmlPdf.includes("3 960,00"));
  verifier("la classe « pour-pdf » est posée", htmlPdf.includes("pour-pdf"));
} finally {
  await nettoyer();
  await prisma.$disconnect();
}

console.log(`\n${ok + ko} contrôles — ${ok} ✔  ${ko} ✘`);
if (ko > 0) process.exit(1);
console.log("La restitution client tient ses gardes.\n");
