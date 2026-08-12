/**
 * REGARDER le document client d'un devis — écran, téléphone et PDF.
 *
 *   scripts/serve-prod.sh --build            # dans un autre terminal
 *   npx tsx scripts/devis-document-apercu.mts
 *   # → /tmp/devis-apercu/{ecran.png, mobile.png, document.pdf, page-N.png}
 *
 * POURQUOI ce script en plus des deux harnais de test : parce que trois défauts
 * réels de ce document étaient INVISIBLES aux vérifications fonctionnelles.
 *
 *   1. le PDF sortait ENTIÈREMENT BLANC (le patron d'impression global masque
 *      tout sauf `.print-root`) — et il restait un PDF valide, avec des polices
 *      et deux pages : tous les contrôles automatiques passaient ;
 *   2. les listes à puces d'un texte libre perdaient leurs marqueurs (le reset
 *      de l'application enlève `list-style`) ;
 *   3. sur téléphone, la table des prix débordait de l'écran.
 *
 * Aucun de ces trois-là ne se voit autrement qu'en regardant. À relancer après
 * toute retouche de `document-devis.css` ou `rendu-serveur.tsx`.
 *
 * Le devis de démonstration est volontairement le plus dur possible : deux lots,
 * une remise de ligne, une option, un texte riche (gras, puces), une remise
 * globale, un pavé destinataire de cinq lignes. NON DESTRUCTIF : créé sous un
 * préfixe dédié, supprimé en sortie même en cas d'échec.
 */
import "dotenv/config";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { PrismaPg } from "@prisma/adapter-pg";
import { chromium } from "playwright-core";
import { PrismaClient } from "../src/generated/prisma/client";

// `server-only` refuse de se charger hors composant serveur : ici on EST le
// serveur (script Node), donc on neutralise la sentinelle pour réutiliser la
// VRAIE recherche de Chromium plutôt que d'en réécrire une copie qui divergera.
// (Même parade que scripts/magasin-smoke.mts.)
const requireCjs = createRequire(import.meta.url);
const cheminServerOnly = requireCjs.resolve("server-only");
requireCjs.cache[cheminServerOnly] = {
  id: cheminServerOnly,
  filename: cheminServerOnly,
  loaded: true,
  exports: {},
} as unknown as NodeJS.Module;

const BASE = process.env.SMOKE_BASE_URL || `http://127.0.0.1:${process.env.PORT || 3000}`;
const SORTIE = process.env.SORTIE || "/tmp/devis-apercu";
const MARQUE = "ZZ-APERCU-DOC";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

/** Le Chromium de playwright, comme la route PDF le cherche. */
async function chromiumLocal(): Promise<string> {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  const { trouverChromium } = await import("../src/lib/pdf-navigateur");
  const c = await trouverChromium();
  if (!c) throw new Error("Aucun Chromium trouvé (voir CHROMIUM_PATH)");
  return c;
}

async function nettoyer() {
  const devis = await prisma.devis.findMany({
    where: { titre: { startsWith: MARQUE } },
    select: { id: true },
  });
  for (const d of devis) await prisma.devis.delete({ where: { id: d.id } });
}

await mkdir(SORTIE, { recursive: true });

try {
  await nettoyer();
  const jeton = randomUUID();
  const auteur = await prisma.user.findFirst({ select: { id: true, nom: true } });

  const devis = await prisma.devis.create({
    data: {
      numero: "DT260042",
      revision: 2,
      titre: `${MARQUE} PROG — Complexe sportif Cormontreuil`,
      etat: "EMIS",
      clientNom: "SOCIÉTÉ NOUVELLE HENRI CONRAUX",
      destinataire:
        "SOCIÉTÉ NOUVELLE HENRI CONRAUX\nComptabilité Fournisseurs\nTSA 60013\n35093 RENNES CEDEX 9\nÀ l'attention de M. Fabien AVRIL",
      tauxTvaCentieme: 2000,
      validiteJours: 30,
      remiseGlobalePourMille: 30,
      jetonPartage: jeton,
      partageExpireLe: new Date(Date.now() + 30 * 86_400_000),
      publieLe: new Date(),
      createdById: auteur?.id ?? null,
      lots: {
        create: [
          {
            titre: "Fourniture — armoire GTB",
            ordre: 1000,
            note: "Matériel Distech Controls, livré et câblé en atelier.",
          },
          { titre: "Prestations", ordre: 2000 },
          // LE BLOC FORFAITAIRE (docs/DEVIS-DETAIL.md) : une désignation qui est
          // un PARAGRAPHE en capitales, une description en puces, et derrière
          // un chiffrage mêlant matériel et main d'œuvre. C'est le cas le plus
          // dur du document — et il faut le REGARDER.
          {
            titre: "Régulation chaufferie — interne",
            ordre: 3000,
            rendu: "CONDENSE",
            libelleClient:
              "DÉPOSE DE L'ANCIENNE RÉGULATION, POSE, RACCORDEMENT DE LA NOUVELLE RÉGULATION ET CONTRÔLE DES POINTS — COMPRIS DISTECH + PROGRAMMATION + SUPERVISION",
            note: "2× départ pour pompe\n4× pilotage V3V\n1× pompe de relevage\nMise en service et formation sur site",
          },
        ],
      },
    },
    include: { lots: true },
  });
  const fourniture = devis.lots.find((l) => l.ordre === 1000)!;
  const prestations = devis.lots.find((l) => l.ordre === 2000)!;
  const forfait = devis.lots.find((l) => l.ordre === 3000)!;

  await prisma.ligneDevis.createMany({
    data: [
      // --- Le contenu du bloc forfaitaire : invisible sur le document client,
      //     visible sur le bordereau interne (?detail=1).
      {
        devisId: devis.id,
        lotId: forfait.id,
        ordre: 9000,
        genre: "PRODUIT",
        designation: "AUTOMATE DISTECH ECY-S1000-C50",
        refInterne: "DIS-S1000-C50",
        unite: "U",
        quantiteMillieme: 1000,
        debourseCents: 149400,
        coefMillieme: 1250,
        pvUnitaireCents: 186750,
      },
      {
        devisId: devis.id,
        lotId: forfait.id,
        ordre: 9100,
        genre: "PRODUIT",
        designation: "ALIMENTATION 24 V 5 A RAIL DIN",
        refInterne: "ALM-24-5",
        unite: "U",
        quantiteMillieme: 1000,
        debourseCents: 7800,
        coefMillieme: 1250,
        pvUnitaireCents: 9750,
      },
      {
        devisId: devis.id,
        lotId: forfait.id,
        ordre: 9200,
        genre: "PRESTATION",
        designation: "Programmation automate",
        unite: "h",
        quantiteMillieme: 30000,
        pvUnitaireCents: 7400,
      },
      {
        devisId: devis.id,
        lotId: fourniture.id,
        ordre: 1000,
        genre: "PRODUIT",
        designation: "AUTOMATE DISTECH ECY-303 AVEC ALIMENTATION",
        unite: "U",
        quantiteMillieme: 2000,
        debourseCents: 84000,
        coefMillieme: 1250,
        pvUnitaireCents: 105000,
      },
      {
        devisId: devis.id,
        lotId: fourniture.id,
        ordre: 2000,
        genre: "PRODUIT",
        designation: "MODULE D'EXTENSION EC-MULTI-24",
        unite: "U",
        quantiteMillieme: 3000,
        debourseCents: 31000,
        coefMillieme: 1250,
        pvUnitaireCents: 38750,
      },
      {
        devisId: devis.id,
        lotId: fourniture.id,
        ordre: 3000,
        genre: "PRODUIT",
        designation: "SONDE DE TEMPÉRATURE GAINE PT1000",
        unite: "U",
        quantiteMillieme: 12000,
        debourseCents: 4250,
        coefMillieme: 1350,
        pvUnitaireCents: 5738,
      },
      {
        devisId: devis.id,
        lotId: fourniture.id,
        ordre: 3500,
        genre: "PRODUIT",
        designation: "COFFRET MÉTAL 600×400 AVEC PLATINE",
        unite: "U",
        quantiteMillieme: 1000,
        debourseCents: 39500,
        coefMillieme: 1350,
        pvUnitaireCents: 53325,
        // Une remise DE LIGNE : le prix barré et le net doivent tenir dans la
        // colonne, y compris sur le papier.
        remisePourMille: 100,
      },
      {
        devisId: devis.id,
        lotId: fourniture.id,
        ordre: 4000,
        genre: "TEXTE",
        designation: "Ajout supervision de 32 compteurs électriques…",
        contenu: [
          {
            type: "paragraph",
            props: {},
            content: [
              {
                type: "text",
                text: "Ajout supervision de 32 compteurs électriques, suivant schéma.",
                styles: {},
              },
            ],
          },
          {
            type: "paragraph",
            props: {},
            content: [
              { type: "text", text: "ATTENTION : ", styles: { bold: true } },
              {
                type: "text",
                text: "le paramétrage et l'adressage des compteurs sont à votre charge et devront être réalisés avant notre intervention.",
                styles: {},
              },
            ],
          },
          {
            type: "bulletListItem",
            props: {},
            content: [
              { type: "text", text: "Armoire fournie câblée, essais en atelier", styles: {} },
            ],
          },
          {
            type: "bulletListItem",
            props: {},
            content: [
              { type: "text", text: "Repérage suivant liste de points annexée", styles: {} },
            ],
          },
        ],
      },
      {
        devisId: devis.id,
        lotId: prestations.id,
        ordre: 5000,
        genre: "PRESTATION",
        designation: "PRESTATION DE MAIN D'ŒUVRE — MISE EN SERVICE",
        unite: "j",
        quantiteMillieme: 5000,
        pvUnitaireCents: 62000,
      },
      {
        devisId: devis.id,
        lotId: prestations.id,
        ordre: 6000,
        genre: "PRESTATION",
        designation: "PROGRAMMATION ET SYNOPTIQUES DE SUPERVISION",
        unite: "j",
        quantiteMillieme: 4000,
        pvUnitaireCents: 68000,
      },
      {
        devisId: devis.id,
        lotId: prestations.id,
        ordre: 7000,
        genre: "PRODUIT",
        designation: "OPTION — REPORT D'ALARMES PAR SMS (MODEM 4G)",
        unite: "U",
        quantiteMillieme: 1000,
        debourseCents: 48000,
        coefMillieme: 1350,
        pvUnitaireCents: 64800,
        option: true,
      },
    ],
  });

  const url = `${BASE}/d/${jeton}`;
  const nav = await chromium.launch({ executablePath: await chromiumLocal() });
  try {
    // L'écran de bureau : la feuille posée sur le plan de travail.
    const bureau = await nav.newPage({ viewport: { width: 1100, height: 1400 }, deviceScaleFactor: 2 });
    await bureau.goto(url, { waitUntil: "networkidle" });
    await bureau.screenshot({ path: `${SORTIE}/ecran.png`, fullPage: true });

    // Le téléphone : c'est là que le client ouvrira le lien, depuis sa boîte
    // mail. Le débordement horizontal est le défaut à surveiller.
    const tel = await nav.newPage({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
    });
    await tel.goto(url, { waitUntil: "networkidle" });
    const mesure = await tel.evaluate(() => ({
      doc: document.documentElement.scrollWidth,
      vue: document.documentElement.clientWidth,
    }));
    await tel.screenshot({ path: `${SORTIE}/mobile.png`, fullPage: true });
    console.log(
      mesure.doc > mesure.vue
        ? `  ✘ DÉBORDEMENT sur téléphone : ${mesure.doc} px de document pour ${mesure.vue} px d'écran`
        : `  ✔ aucun débordement sur téléphone (${mesure.vue} px)`,
    );
  } finally {
    await nav.close();
  }

  // Le PDF, par la route publique — donc exactement celui que le client reçoit.
  const rep = await fetch(`${BASE}/api/public/devis/${jeton}/pdf`);
  if (!rep.ok) {
    console.log(`  ⊘ PDF indisponible (${rep.status}) : ${JSON.stringify(await rep.json())}`);
  } else {
    const bin = Buffer.from(await rep.arrayBuffer());
    await writeFile(`${SORTIE}/document.pdf`, bin);
    console.log(`  ✔ PDF écrit (${Math.round(bin.length / 1024)} ko)`);
    console.log(`     pour le regarder page par page : pdftoppm -png -r 90 ${SORTIE}/document.pdf ${SORTIE}/page`);
  }

  console.log(`\nÉcrit dans ${SORTIE} — ouvrir ecran.png, mobile.png et document.pdf.`);
} finally {
  await nettoyer();
  await prisma.$disconnect();
}
