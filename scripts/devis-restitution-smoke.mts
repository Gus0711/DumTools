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
 * (`/outils/devis/[id]/apercu`), qui demande une session. C'est pourtant là
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
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

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
  // Les documentations et leurs produits (la jonction part en cascade).
  const docs = await prisma.documentation.findMany({
    where: { titre: { startsWith: MARQUE } },
    select: { fichier: true },
  });
  for (const d of docs) if (d.fichier) await rm(d.fichier, { force: true }).catch(() => {});
  await prisma.documentation.deleteMany({ where: { titre: { startsWith: MARQUE } } });
  await prisma.produit.deleteMany({ where: { refInterne: { startsWith: MARQUE } } });
}

try {
  await nettoyer();

  /* --- Le décor de la DOCUMENTATION -------------------------------------- *
   * Deux produits, deux fiches. L'un est chiffré dans un lot ordinaire, l'autre
   * DANS LE BLOC FORFAITAIRE : c'est le témoin négatif du chantier. Si la fiche
   * du second sortait, la liste des annexes déballerait exactement ce que la
   * condensation prend soin de cacher. */
  const depotDocs = process.env.DOC_MEDIA_DIR ?? join(process.cwd(), ".documentation-media");
  await mkdir(depotDocs, { recursive: true });

  async function fiche(titre: string, produit: { ref: string; designation: string }) {
    const p = await prisma.produit.create({
      data: { refInterne: `${MARQUE}-${produit.ref}`, designation: produit.designation },
      select: { id: true },
    });
    const chemin = join(depotDocs, randomUUID());
    // Un vrai PDF minimal : la route sert un binaire, pas une chaîne vide.
    await writeFile(chemin, Buffer.from("%PDF-1.4\n% fiche de test\n"));
    const d = await prisma.documentation.create({
      data: {
        titre,
        categorie: "fiche",
        fichier: chemin,
        nom: `${titre}.pdf`,
        mimeType: "application/pdf",
        taille: 24,
        produits: { create: { produitId: p.id } },
      },
      select: { id: true },
    });
    return { produitId: p.id, docId: d.id };
  }

  const docVisible = await fiche(`${MARQUE} Fiche ECY-303`, {
    ref: "ECY303",
    designation: "Automate ECY-303",
  });
  const docForfait = await fiche(`${MARQUE} ZZSECRET Fiche S1000`, {
    ref: "S1000",
    designation: "Automate S1000",
  });

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
      destinataire: `${MARQUE} CLIENT\nÀ l'attention de M. Jean Dupont\nService technique\n02800 CHARMES`,
      // Le contact FIGÉ (docs/DEVIS.md §24). Son nom s'imprime — mais par le
      // pavé ci-dessus, et par lui seul. Ses coordonnées, elles, sont des
      // données internes : elles servent au mail à venir, pas au document.
      contactNom: "Jean Dupont",
      contactFonction: "Conducteur de travaux",
      contactEmail: "ZZSECRET-MAIL@client.fr",
      contactTel: "ZZSECRET-TEL 06 12 34 56 78",
      tauxTvaCentieme: 2000,
      validiteJours: 30,
      jetonPartage: jeton,
      partageExpireLe: new Date(Date.now() + 30 * 24 * 3600 * 1000),
      publieLe: new Date(),
      lots: {
        create: [
          { titre: "Fourniture GTB", ordre: 1000 },
          { titre: "Main d'œuvre", ordre: 2000 },
          // LE BLOC FORFAITAIRE (docs/DEVIS-DETAIL.md). Son titre interne, ses
          // lignes et ses références ne doivent JAMAIS sortir.
          {
            titre: "ZZSECRET Matériel Distech + MO",
            ordre: 3000,
            rendu: "CONDENSE",
            libelleClient:
              "DÉPOSE DE L'ANCIENNE RÉGULATION, POSE ET RACCORDEMENT — COMPRIS DISTECH",
            note: "2× départ pour pompe\n4× pilotage V3V",
          },
        ],
      },
    },
    include: { lots: true },
  });
  const lotFourniture = devis.lots.find((l) => l.titre === "Fourniture GTB")!;
  const lotMo = devis.lots.find((l) => l.titre === "Main d'œuvre")!;
  const lotForfait = devis.lots.find((l) => l.rendu === "CONDENSE")!;

  await prisma.ligneDevis.createMany({
    data: [
      {
        devisId: devis.id,
        lotId: lotFourniture.id,
        ordre: 1000,
        genre: "PRODUIT",
        produitId: docVisible.produitId,
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
      // --- Le contenu du BLOC FORFAITAIRE : rien de tout ceci ne doit sortir.
      {
        devisId: devis.id,
        lotId: lotForfait.id,
        ordre: 5000,
        genre: "PRODUIT",
        produitId: docForfait.produitId,
        designation: "ZZSECRET AUTOMATE ECY-S1000-C50",
        refInterne: "ZZSECRET-S1000",
        debourseCents: 149400,
        coefMillieme: 1250,
        pvUnitaireCents: 186750,
        quantiteMillieme: 1000,
        unite: "U",
      },
      {
        devisId: devis.id,
        lotId: lotForfait.id,
        ordre: 6000,
        genre: "PRESTATION",
        designation: "ZZSECRET Programmation automate",
        unite: "h",
        quantiteMillieme: 30000,
        pvUnitaireCents: 7400,
      },
      {
        devisId: devis.id,
        lotId: lotForfait.id,
        ordre: 7000,
        genre: "TEXTE",
        designation: "ZZSECRET commentaire interne du bloc",
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
  // 2 100,00 (fourniture) + 1 860,00 (MO) + 4 087,50 (le bloc forfaitaire).
  // Un devis MIXTE — c'est le cas normal, pas l'exception (DEVIS-DETAIL.md §1).
  verifier("le total HT est affiché (8 047,50)", html.includes("8 047,50"));
  verifier("la TVA est affichée (1 609,50)", html.includes("1 609,50"));
  verifier("le TTC est affiché (9 657,00)", html.includes("9 657,00"));
  verifier("l'acompte est calculé sur le TTC (4 828,50)", html.includes("4 828,50"));
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
    verifier("… et les montants", texte.includes("8 047,50") && texte.includes("9 657,00"));
    verifier("… le déboursé n'y est pas non plus", !texte.includes("840,00"));
    // Le PDF est l'artefact qui part VRAIMENT chez le client : la garde se
    // vérifie sur lui aussi, pas seulement sur le HTML dont il est tiré.
    verifier("… ni le détail d'un bloc forfaitaire", !texte.includes("ZZSECRET"));
    verifier("… mais bien la phrase qui le remplace", texte.includes("DÉPOSE DE L'ANCIENNE"));
    // Le contact figé (§24) : son nom est dans le pavé, ses coordonnées nulle
    // part. Le `ZZSECRET` ci-dessus les couvre déjà — c'est dit ici pour que
    // le prochain lecteur sache ce que ce contrôle protège.
    verifier("… le nom du destinataire est bien là", texte.includes("Jean Dupont"));
    // Les annexes voyagent avec le PDF — en LIENS. Chromium en fait de vraies
    // annotations cliquables ; ce qu'on vérifie ici, c'est que le titre est
    // imprimé (un lien sans intitulé ne se lit pas) et que la fiche du bloc
    // forfaitaire n'y est pas (le `ZZSECRET` ci-dessus la couvre déjà).
    verifier("… la fiche technique annexée est listée", texte.includes("Fiche ECY-303"));
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

  /* --- 7 ter. LE BLOC FORFAITAIRE NE FUIT PAS ---------------------------- */
  console.log("\n7 ter. Le bloc forfaitaire (docs/DEVIS-DETAIL.md)");
  {
    // La garde vit dans `getDevisPublic`, pas dans le composant : ce qui est
    // vérifié ici, c'est que le détail n'est NULLE PART dans la réponse — ni
    // rendu, ni embarqué dans la charge utile du client React.
    const rep = await fetch(`${BASE}/d/${jeton}`);
    const page = await rep.text();

    verifier("la phrase du client est imprimée", page.includes("DÉPOSE DE L&#x27;ANCIENNE RÉGULATION") || page.includes("DÉPOSE DE L'ANCIENNE RÉGULATION"));
    verifier("… avec sa description en puces", page.includes("2× départ pour pompe"));
    // 1 867,50 + 30 h × 74,00 = 4 087,50 € : le sous-total DOIT apparaître,
    // sinon le client reçoit une phrase sans prix (le piège du §6b).
    verifier("… et le montant du bloc", page.includes("4 087,50"));

    // ⚠️ LE contrôle qui compte. Un seul « ZZSECRET » suffit à tout invalider.
    const fuites = (page.match(/ZZSECRET[^"<\s]*/g) ?? []).filter(
      (m) => !m.startsWith("ZZSECRET-REF"),
    );
    verifier(
      "AUCUNE désignation, référence ni ligne du bloc ne traverse",
      fuites.length === 0,
      fuites.slice(0, 5).join(" · "),
    );
    verifier("… le titre INTERNE du bloc non plus", !page.includes("Matériel Distech + MO"));

    // Témoin négatif : sans lui, ce test passerait au vert sur une page vide.
    verifier(
      "TÉMOIN : le bloc DÉTAILLÉ voisin est bien rendu, lui",
      page.includes("AUTOMATE DISTECH ECY-303"),
    );

    // La note d'une LIGNE est interne et ne doit plus être dans la réponse.
    await prisma.ligneDevis.updateMany({
      where: { devisId: devis.id, designation: "AUTOMATE DISTECH ECY-303" },
      data: { note: "ZZNOTEINTERNE négociable à -12 %" },
    });
    const page2 = await fetch(`${BASE}/d/${jeton}`).then((r) => r.text());
    verifier("la note interne d'une ligne ne sort pas non plus", !page2.includes("ZZNOTEINTERNE"));
  }

  console.log("\n7 quater. Les coordonnées du contact ne sortent pas (§24)");
  {
    /* Le contact d'un devis sert au pré-remplissage et — plus tard — au mail.
       Rien ne l'imprime : le PAVÉ destinataire est le seul texte du
       destinataire sur le document. Ses coordonnées n'ont donc aucune raison
       de traverser, et `getDevisPublic` les neutralise. */
    const page = await fetch(`${BASE}/d/${jeton}`).then((r) => r.text());

    verifier("l'adresse mail du contact NE SORT PAS", !page.includes("ZZSECRET-MAIL"));
    verifier("son téléphone non plus", !page.includes("ZZSECRET-TEL"));
    verifier("… ni sa fonction, qui n'est pas dans le pavé", !page.includes("Conducteur de travaux"));

    // Témoin négatif : sans lui, ces trois contrôles passeraient au vert sur
    // une page blanche. Le nom EST attendu — il est écrit dans le pavé.
    verifier(
      "TÉMOIN : le nom, lui, s'imprime bien — par le pavé destinataire",
      page.includes("À l&#x27;attention de M. Jean Dupont") ||
        page.includes("À l'attention de M. Jean Dupont"),
    );
  }

  /* --- 7 quinquies. LES ANNEXES DE DOCUMENTATION ------------------------- */
  console.log("\n7 quinquies. Les fiches techniques annexées");
  {
    /* Le devis annexe les fiches des produits qu'il chiffre — EN LIENS, jamais
       en pièces jointes. Deux gardes se croisent ici, et la seconde est celle
       qui a motivé tout le découpage :

         1. la liste suit les lignes que le CLIENT VOIT — un bloc forfaitaire
            n'annexe rien, sinon les annexes nommeraient les produits que la
            condensation vient de cacher ;
         2. la route publique est scopée au jeton ET à la liste de CE devis —
            sans quoi un jeton de devis servirait toute la documentation de la
            maison. */
    const page = await fetch(`${BASE}/d/${jeton}`).then((r) => r.text());

    verifier("le bloc d'annexes est là", page.includes("Documentation technique"));
    verifier(
      "la fiche du produit chiffré est listée",
      page.includes(`${MARQUE} Fiche ECY-303`),
    );
    // ⚠️ LE TÉMOIN NÉGATIF du chantier : la fiche du produit d'un bloc
    // FORFAITAIRE ne doit apparaître nulle part. Elle est nommée ZZSECRET, donc
    // le filet du 7 ter la rattraperait aussi — on le dit quand même ici, parce
    // que c'est ICI que la règle se décide.
    verifier(
      "TÉMOIN NÉGATIF : la fiche d'un produit du bloc forfaitaire NE SORT PAS",
      !page.includes("Fiche S1000"),
    );
    verifier(
      "aucun binaire n'est joint — que des liens",
      page.includes(`/api/public/devis/${jeton}/doc/`),
    );

    // La route publique sert la fiche annexée…
    const repDoc = await fetch(`${BASE}/api/public/devis/${jeton}/doc/${docVisible.docId}`);
    egal("la route publique sert la fiche annexée", repDoc.status, 200);
    egal(
      "… avec son type MIME",
      repDoc.headers.get("content-type"),
      "application/pdf",
    );
    const bin = Buffer.from(await repDoc.arrayBuffer());
    verifier("… et un vrai binaire", bin.subarray(0, 5).toString() === "%PDF-");

    // … et REFUSE celle du bloc forfaitaire, avec le même jeton.
    const repSecret = await fetch(`${BASE}/api/public/devis/${jeton}/doc/${docForfait.docId}`);
    egal(
      "la fiche d'un bloc forfaitaire n'est pas servie, même avec le bon jeton",
      repSecret.status,
      404,
    );

    // Étanchéité entre devis : le jeton du voisin ne l'ouvre pas non plus.
    const repAutre = await fetch(`${BASE}/api/public/devis/${jetonAutre}/doc/${docVisible.docId}`);
    egal("le jeton d'un AUTRE devis ne sert pas cette fiche", repAutre.status, 404);

    // L'interrupteur de publication.
    await prisma.devis.update({
      where: { id: devis.id },
      data: { montrerDocumentations: false },
    });
    const sans = await fetch(`${BASE}/d/${jeton}`).then((r) => r.text());
    verifier("décoché, le bloc d'annexes disparaît", !sans.includes("Documentation technique"));
    const repCoupee = await fetch(`${BASE}/api/public/devis/${jeton}/doc/${docVisible.docId}`);
    egal(
      "… et la route ne sert plus rien (la garde suit le réglage)",
      repCoupee.status,
      404,
    );
    await prisma.devis.update({
      where: { id: devis.id },
      data: { montrerDocumentations: true },
    });
  }

  /* --- 8. Le rendu PDF de la page ---------------------------------------- */
  console.log("\n8. La page en mode PDF");
  const repVuePdf = await fetch(`${BASE}/d/${jeton}?pdf=1`);
  const htmlPdf = await repVuePdf.text();
  verifier("la barre du lecteur disparaît", !htmlPdf.includes("Télécharger le PDF"));
  verifier("… donc aucune consultation n'est comptée au téléchargement", !htmlPdf.includes("devis-lecteur"));
  verifier("le document reste entier", htmlPdf.includes("DT999901") && htmlPdf.includes("8 047,50"));
  verifier("la classe « pour-pdf » est posée", htmlPdf.includes("pour-pdf"));
} finally {
  await nettoyer();
  await prisma.$disconnect();
}

console.log(`\n${ok + ko} contrôles — ${ok} ✔  ${ko} ✘`);
if (ko > 0) process.exit(1);
console.log("La restitution client tient ses gardes.\n");
