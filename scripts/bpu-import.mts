// Import du BPU (bordereau de prix unitaires) dans le référentiel de devis.
//
//   npx tsx scripts/bpu-import.mts              → essai à blanc (n'écrit rien)
//   npx tsx scripts/bpu-import.mts --appliquer  → écrit en base
//
// POURQUOI DES `Prestation` ET NON DES `Produit` (docs/DEVIS.md §2) :
// un article de BPU donne un PRIX DE VENTE FERME, jamais un déboursé. Le moteur
// de devis n'a qu'un chemin de calcul — déboursé × coefficient = PV — et un
// `Produit` sans déboursé tomberait dans `nbSansPrix` (« ce qu'on ne sait pas
// chiffrer ») avec un PV à zéro : exactement le contraire de la réalité, où le
// prix est le seul chiffre connu et il est contractuel. Une ligne PRESTATION
// porte `debourseCents: null` et le moteur ne la signale PAS comme un trou.
// Conséquence assumée : ces lignes ne nourrissent pas la « marge sur la
// fourniture » — on ne connaît pas le coût du couple matériel + pose.
//
// Idempotent : l'appariement se fait sur le libellé (unique en base). Rejouer
// après une révision du BPU met les prix à jour et dit ce qui a bougé.
import "dotenv/config";
import "../mcp/sans-server-only.mts";
import { prisma } from "../src/lib/db";

/* --- Le bordereau, tel qu'il nous a été transmis ---------------------------- */
// art | famille | désignation | prix de vente HT (€)
const BPU = `
5.1.1 | Automates | Fourniture et installation d'un coffret "standard" | 538.33
5.1.2 | Automates | Fourniture et installation d'un coffret "extérieur" | 538.33
5.1.3 | Automates | Fourniture et installation d'un coffret "grandes dimensions" | 919.67
5.1.4 | Automates | Fourniture et installation d'un automate standard | 616.83
5.1.5 | Automates | Fourniture et installation d'un automate extensible | 1721.04
5.1.6 | Automates | Fourniture et installation d'un mini automate | 324.07
5.1.7 | Automates | Fourniture et installation d'un écran tactile | 1150.24
5.2.1 | Filaires | Fourniture et installation d'une sonde filaire de température ambiante | 117.86
5.2.2 | Filaires | Fourniture et installation d'une sonde filaire de température ambiante "boule noire" | 165.63
5.2.3 | Filaires | Fourniture et installation d'une sonde filaire de température extérieure | 113.19
5.2.4 | Filaires | Fourniture et installation d'une sonde filaire de contact | 118.94
5.2.5 | Filaires | Fourniture et installation d'une sonde filaire doigt de gant | 137.65
5.2.6 | Filaires | Fourniture et installation d'une sonde filaire de gaine | 174.85
5.2.7 | Filaires | Câblage et paramétrage d'un équipement en 0-10V | 230.00
5.2.8 | Filaires | Câblage et paramétrage d'un équipement modbus | 430.00
5.2.9 | Filaires | Fourniture et installation d'un relais 10V DC | 39.27
5.2.10 | Filaires | Fourniture et installation d'un module 2 relais | 61.47
5.2.11 | Filaires | Fourniture et installation d'une alimentation modulaire 24v/1,5A minimum | 48.45
5.2.12 | Filaires | Fourniture et installation d'un servomoteur 0-10V | 376.40
5.2.13 | Filaires | Fourniture et installation d'un servomoteur 230v / 3 points | 446.27
5.2.14 | Filaires | Fourniture et installation d'un capteur d'ouverture de coffret photosensible | 109.63
5.2.15 | Filaires | Fourniture et installation d'un capteur d'ouverture de coffret avec contact | 124.17
5.3.1 | GSM ou LORA | Fourniture et installation d'un modem | 281.17
5.3.2 | GSM ou LORA | Fourniture et installation d'une antenne extérieure GSM déportée | 308.13
5.3.3 | GSM ou LORA | Fourniture et installation d'une gateway LORA | 659.00
5.3.4 | GSM ou LORA | Fourniture et installation d'une gateway LORA IP67 | 1383.17
5.3.5 | GSM ou LORA | Fourniture et installation d'une antenne extérieure LORA déportée | 393.67
5.4.1 | LORA | Fourniture et installation d'une sonde de température ambiante LORA | 200.77
5.4.2 | LORA | Fourniture et installation d'une sonde de qualité de l'air ambiante LORA | 317.50
5.4.3 | LORA | Fourniture et installation d'un totalisateur LORA | 247.93
5.4.4 | LORA | Fourniture et installation d'un totalisateur sortie filaire | 196.00
5.4.5 | LORA | Fourniture et installation d'un émetteur impulsion LORA | 281.33
5.4.6 | LORA | Fourniture et installation d'un émetteur impulsion LORA ATEX | 388.50
5.4.7 | LORA | Fourniture et installation d'un doubleur d'impulsions > 20ms/impulsion | 304.50
5.4.8 | LORA | Fourniture et installation d'un équipement LORA pour télérelève TIC | 404.35
5.4.9 | LORA | Fourniture et installation d'un capteur ultrason 10m LORA | 563.47
5.4.10 | LORA | Fourniture et installation d'un capteur ultrason 4,5m LORA | 560.07
5.4.11 | LORA | Fourniture et installation d'un capteur de niveau Tof LORA | 360.60
5.4.12 | LORA | Fourniture et installation d'un capteur de niveau submersible LORA | 678.33
5.4.13 | LORA | Fourniture et installation d'un capteur de stationnement LORA | 583.28
5.4.14 | LORA | Fourniture et installation d'un contact magnétique d'ouverture de coffret LORA | 261.89
5.4.15 | LORA | Fourniture et installation d'un capteur de comptage de personnes | 1393.33
5.4.16 | LORA | Fourniture et installation d'un capteur de niveau sonore | 324.17
5.4.17 | LORA | Fourniture et installation d'une vanne thermostatique LORA | 240.83
5.4.18 | LORA | Fourniture et installation d'un contrôleur entrées-sorties LORA | 453.93
5.4.19 | LORA | Remplacement d'une pile d'un capteur LORA autonome | 120.17
5.4.20 | LORA | Remplacement d'une pile certifiée ATEX d'un capteur LORA autonome | 160.67
5.5.1 | Electriques | Fourniture, installation et configuration d'un compteur modbus monophasé 20A | 221.87
5.5.2 | Electriques | Fourniture, installation et configuration d'un compteur modbus monophasé 40A | 254.37
5.5.3 | Electriques | Fourniture, installation et configuration d'un compteur modbus tétrapolaire 63A | 371.53
5.5.4 | Electriques | Fourniture, installation et configuration d'un compteur modbus tétrapolaire équipé de tores de mesures | 550.69
5.5.5 | Electriques | Passage de câble d'alimentation 230V type 3G2,5mm2 | 31.47
5.5.6 | Electriques | Passage de câble d'alimentation 24V | 31.33
5.5.7 | Electriques | Passage de câble courant faible 4 paires | 31.33
5.5.8 | Electriques | Passage de câble courant modbus | 32.67
5.6.1 | Divers | Rapport hebdomadaire de bon fonctionnement | 400.00
5.6.2 | Divers | Audit d'une installation | 400.00
5.6.3 | Divers | Indemnité kilométrique journalière | 223.33
5.6.4 | Divers | Marge sur fourniture d'une pièce | 0.35
5.6.5 | Divers | Coût horaire pour prestation hors BPU | 65.00
5.6.6 | Divers | Nacelle 1/2 journée hauteur de travail 10m | 986.67
5.6.7 | Divers | Nacelle 1 journée hauteur de travail 10m | 986.67
`;

/* --- Unités ------------------------------------------------------------------
 * Le bordereau n'en donne aucune. Défaut « U » (un article posé = une unité) ;
 * ne sont nommées que celles que le libellé énonce lui-même. Les cas douteux
 * sont listés en fin d'exécution plutôt que devinés en silence.
 * ---------------------------------------------------------------------------- */
const UNITE = new Map<string, string>([
  ["5.6.1", "forfait"], // rapport hebdomadaire
  ["5.6.2", "forfait"], // audit
  ["5.6.3", "j"], // indemnité JOURNALIÈRE
  ["5.6.5", "h"], // coût HORAIRE
  ["5.6.6", "forfait"], // nacelle 1/2 journée
  ["5.6.7", "forfait"], // nacelle 1 journée
]);

const A_VERIFIER = new Map<string, string>([
  ["5.5.5", "au mètre linéaire ou au passage ? (unité posée à « U »)"],
  ["5.5.6", "au mètre linéaire ou au passage ? (unité posée à « U »)"],
  ["5.5.7", "au mètre linéaire ou au passage ? (unité posée à « U »)"],
  ["5.5.8", "au mètre linéaire ou au passage ? (unité posée à « U »)"],
  ["5.6.4", "0,35 € : marge par euro de fourniture (35 %) ou par pièce ? (unité « U »)"],
  ["5.6.6", "même prix que 5.6.7 (1 journée) — 986,67 € : coquille du bordereau ?"],
  ["5.6.7", "même prix que 5.6.6 (1/2 journée) — 986,67 € : coquille du bordereau ?"],
]);

interface Article {
  art: string;
  famille: string;
  libelle: string;
  cents: number;
  unite: string;
  ordre: number;
}

/** « 5.4.20 » → 50420 : le tri du référentiel suit l'ordre du bordereau. */
function ordreDepuisArt(art: string): number {
  const [a, b, c] = art.split(".").map((n) => parseInt(n, 10));
  return a! * 10_000 + b! * 100 + c!;
}

/** Euros → centimes. L'argent est en centimes partout (docs/DEVIS.md §2). */
function cents(montant: string): number {
  const n = Number(montant.replace(/\s| | /g, "").replace(",", "."));
  if (!Number.isFinite(n)) throw new Error(`Montant illisible : « ${montant} »`);
  return Math.round(n * 100);
}

function lire(): Article[] {
  return BPU.trim()
    .split("\n")
    .map((ligne) => {
      const [art, famille, libelle, prix] = ligne.split("|").map((c) => c.trim().replace(/\s+/g, " "));
      return {
        art: art!,
        famille: famille!,
        libelle: libelle!,
        cents: cents(prix!),
        unite: UNITE.get(art!) ?? "U",
        ordre: ordreDepuisArt(art!),
      };
    });
}

const euros = (c: number) => (c / 100).toFixed(2).replace(".", ",") + " €";

async function main() {
  const appliquer = process.argv.includes("--appliquer");
  const articles = lire();

  const doublons = articles.filter((a, i) => articles.findIndex((b) => b.libelle === a.libelle) !== i);
  if (doublons.length) {
    throw new Error(
      `Libellés en double dans le bordereau (le libellé est la clé) : ${doublons.map((d) => d.art).join(", ")}`,
    );
  }

  const enBase = await prisma.prestation.findMany({
    select: { id: true, libelle: true, prixVenteCents: true, unite: true, famille: true, ordre: true, note: true },
  });
  const parLibelle = new Map(enBase.map((p) => [p.libelle, p]));

  console.log(`\n${appliquer ? "IMPORT" : "ESSAI À BLANC"} — ${articles.length} articles de BPU\n`);
  console.log("art      famille       unité    PV HT          état");
  console.log("─".repeat(96));

  let nouveaux = 0;
  let majPrix = 0;
  let inchanges = 0;

  for (const a of articles) {
    const existant = parLibelle.get(a.libelle);
    let etat: string;
    if (!existant) {
      etat = "nouveau";
      nouveaux++;
    } else if (existant.prixVenteCents !== a.cents) {
      etat = `prix : ${euros(existant.prixVenteCents)} → ${euros(a.cents)}`;
      majPrix++;
    } else {
      etat = "inchangé";
      inchanges++;
    }
    console.log(
      `${a.art.padEnd(8)} ${a.famille.padEnd(13)} ${a.unite.padEnd(8)} ${euros(a.cents).padStart(12)}   ${etat}`,
    );

    if (appliquer) {
      const donnees = {
        libelle: a.libelle,
        unite: a.unite,
        prixVenteCents: a.cents,
        famille: a.famille,
        ordre: a.ordre,
        actif: true,
        note: `BPU ${a.art}`,
      };
      await prisma.prestation.upsert({
        where: { libelle: a.libelle },
        create: donnees,
        update: donnees,
      });
    }
  }

  console.log("─".repeat(96));
  console.log(`${nouveaux} nouveaux · ${majPrix} prix modifiés · ${inchanges} inchangés`);
  const total = articles.reduce((n, a) => n + a.cents, 0);
  console.log(`Somme des prix unitaires (contrôle de saisie) : ${euros(total)}`);

  console.log("\nCorrections faites sur le bordereau reçu :");
  console.log("  · 5.1.2 « Foutniture » → « Fourniture » (et double espace resserré)");
  console.log("  · espaces multiples et espaces de fin resserrés partout");

  console.log("\nÀ VÉRIFIER (rien n'a été deviné en silence) :");
  for (const [art, quoi] of A_VERIFIER) console.log(`  · ${art} — ${quoi}`);

  if (!appliquer) {
    console.log("\nRien n'a été écrit. Relancer avec --appliquer pour enregistrer.\n");
  } else {
    console.log(`\n✅ Écrit en base. Référentiel : /outils/devis/referentiels\n`);
  }
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("\nÉCHEC :", e instanceof Error ? e.message : e);
  await prisma.$disconnect();
  process.exit(1);
});
