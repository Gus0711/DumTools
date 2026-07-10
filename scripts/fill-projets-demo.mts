/**
 * Démo « de A à Z » : remplit les projets (automates) déjà créés par
 * seed-affaires-demo.mts avec une liste de points réaliste dimensionnée à la
 * capacité de chaque automate, dérive les E/S physiques + les affecte aux
 * bornes (syncPoints → affecterAuto), et pose un suivi de mise en service
 * cohérent avec l'état de l'affaire (LIVRE/CLOTURE = testé, EN_COURS = partiel).
 *
 * Non destructif, idempotent (identifiants de ligne stables). Cible les
 * automates par leur nom.
 *
 *   npx tsx scripts/fill-projets-demo.mts
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, Prisma } from "../src/generated/prisma/client";
import type { Project } from "../src/tools/affectation-es/model";
import type { PointRow, Io, IoType } from "../src/tools/liste-points/model";
import { emptyIo } from "../src/tools/liste-points/model";
import { catalogueParDefaut } from "../src/tools/affectation-es/catalogue";
import { syncPoints } from "../src/tools/affectation-es/derivation";
import { reconcilierModules, affecterAuto } from "../src/tools/affectation-es/affectation-auto";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });
const cat = catalogueParDefaut();

// --- Petits helpers de saisie ----------------------------------------------
type Ligne =
  | { sec: string }
  | { nom: string; type: IoType; signal?: string };

const sec = (nom: string): Ligne => ({ sec: nom });
const pt = (nom: string, type: IoType, signal?: string): Ligne => ({ nom, type, signal });

/** Signal par défaut si non précisé (TOR → D, AO/AI → 0-10V, COM → protocole). */
function signalDefaut(type: IoType): string | undefined {
  if (type === "DI" || type === "DO") return "D";
  if (type === "AI" || type === "AO") return "0-10V";
  return undefined; // COM : signal explicite (protocole)
}

/** Construit les PointRow (id stable slug-i) depuis la saisie compacte. */
function buildRows(slug: string, lignes: Ligne[]): PointRow[] {
  return lignes.map((l, i) => {
    const id = `${slug}-${i}`;
    if ("sec" in l) return { id, kind: "section", nom: l.sec };
    const io: Io = emptyIo();
    io[l.type] = 1;
    return { id, kind: "point", nom: l.nom, io, signal: l.signal ?? signalDefaut(l.type) };
  });
}

// --- Suivi de mise en service ----------------------------------------------
type TestMode = "ok" | "none";

/** Applique un statut de test à chaque point selon l'état de l'affaire. */
function poserTests(
  points: Project["points"],
  mode: TestMode,
  defauts: Record<string, string> = {},
) {
  for (const p of points) {
    const defaut = defauts[p.designation];
    if (defaut) {
      p.testStatus = "defaut";
      p.testComment = defaut;
    } else if (mode === "ok") {
      p.testStatus = "ok";
    } else {
      p.testStatus = "non-teste";
    }
  }
}

// --- Définition des automates (clé = nom de l'automate) --------------------
interface AutoDef {
  slug: string;
  lignes: Ligne[];
  test: TestMode;
  defauts?: Record<string, string>;
  ip?: string;
  ip2?: string;
}

const AUTOMATES: Record<string, AutoDef> = {
  // Affaire EN_COURS — Lycée Jean Moulin (multi-automate).
  "CTA Toiture": {
    slug: "cta-toit",
    test: "ok",
    defauts: { "Sonde Air Repris": "Sonde HS au démarrage — remplacée le 08/07, à recontrôler." },
    ip: "192.168.10.11",
    ip2: "10.0.10.11",
    lignes: [
      sec("CTA double flux — toiture"),
      pt("Sonde Air Neuf", "AI", "PT1000"),
      pt("Sonde Air Soufflé", "AI", "PT1000"),
      pt("Sonde Air Repris", "AI", "PT1000"),
      pt("Sonde Après Echangeur", "AI", "PT1000"),
      pt("Pressostat Filtre d'Air Neuf", "DI"),
      pt("Pressostat Filtre d'Air Repris", "DI"),
      pt("Défaut Moteur Air Soufflé", "DI"),
      pt("Défaut Moteur Air Repris", "DI"),
      pt("Défaut Débit Air Soufflé", "DI"),
      pt("Défaut Débit Air Repris", "DI"),
      pt("Commande Moteur Air Soufflé", "AO"),
      pt("Commande Moteur Air Repris", "AO"),
      pt("Commande Vanne Chaud", "AO"),
      pt("Commande Vanne Froid", "AO"),
      pt("Commande registre Air Neuf", "AO"),
      pt("Commande registre Air Regeté", "AO"),
    ],
  },
  Chaufferie: {
    slug: "chauf-ljm",
    test: "ok",
    ip: "192.168.10.12",
    ip2: "10.0.10.12",
    lignes: [
      sec("Chaufferie gaz"),
      pt("Sonde extérieur", "AI", "PT1000"),
      pt("Sonde départ primaire", "AI", "PT1000"),
      pt("Sonde départ chaudiere 1", "AI", "PT1000"),
      pt("Defaut chaudière 1", "DI"),
      pt("Defaut Manque Gaz", "DI"),
      pt("Defaut Manque Tension", "DI"),
      pt("Commande chaudiére 1", "AO"),
      pt("Commande Vanne 3 voies", "AO"),
      pt("Commande pompe 1", "DO"),
      pt("Commande pompe 2", "DO"),
    ],
  },
  "VMC Sous-sol": {
    slug: "vmc-ljm",
    test: "none", // mise en service pas encore commencée
    lignes: [
      sec("VMC sous-sol"),
      pt("Sonde CO2", "AI", "0-10V"),
      pt("Sonde reprise", "AI", "PT1000"),
      pt("Pressostat d'air", "DI"),
      pt("Retour marche", "DI"),
      pt("Defaut", "DI"),
      pt("Pilotage", "AO"),
      pt("Commande", "DO"),
      pt("Compteur Modbus", "COM", "Modbus RTU"),
    ],
  },

  // Affaire COMMANDE — Mairie de Laon (pas encore en mise en service).
  "Production ECS": {
    slug: "ecs-laon",
    test: "none",
    lignes: [
      sec("Production ECS"),
      pt("Sonde départ", "AI", "PT1000"),
      pt("Sonde retour", "AI", "PT1000"),
      pt("Defaut ECS", "DI"),
      pt("Defaut Pompe bouclage 1", "DI"),
      pt("Defaut Pompe primaire ECS", "DI"),
      pt("Commande Vanne 3 voies", "AO"),
      pt("Commande Pompe primaire ECS", "DO"),
    ],
  },
  "Éclairage & CVC": {
    slug: "cvc-laon",
    test: "none",
    lignes: [
      sec("Généralité"),
      pt("Sonde extérieur", "AI", "PT1000"),
      sec("Circuit chauffage Nord"),
      pt("Sonde départ", "AI", "PT1000"),
      pt("Sonde ambiance", "AI", "PT1000"),
      pt("Defaut pompe 1", "DI"),
      pt("Commande Vanne 3 voies", "AO"),
      pt("Commande pompe 1", "DO"),
      sec("Circuit chauffage Sud"),
      pt("Sonde départ", "AI", "PT1000"),
      pt("Sonde ambiance", "AI", "PT1000"),
      pt("Defaut pompe 1", "DI"),
      pt("Commande Vanne 3 voies", "AO"),
      pt("Commande pompe 1", "DO"),
      sec("Éclairage"),
      pt("Commande éclairage hall", "DO"),
      pt("Commande éclairage extérieur", "DO"),
      pt("Compteur Modbus", "COM", "Modbus TCP"),
    ],
  },

  // Affaire DEVIS — Clinique Saint-Roch (chiffrage, pas de mise en service).
  "Chaufferie gaz": {
    slug: "chauf-clin",
    test: "none",
    lignes: [
      sec("Généralité"),
      pt("Sonde extérieur", "AI", "PT1000"),
      pt("Sonde départ primaire", "AI", "PT1000"),
      pt("Defaut Manque Eau", "DI"),
      pt("Defaut Manque Gaz", "DI"),
      pt("Defaut Manque Tension", "DI"),
      sec("Chaufferie"),
      pt("Sonde départ chaudiere 1", "AI", "PT1000"),
      pt("Sonde départ chaudiere 2", "AI", "PT1000"),
      pt("Defaut chaudière 1", "DI"),
      pt("Defaut chaudière 2", "DI"),
      pt("Commande chaudiére 1", "AO"),
      pt("Commande chaudiére 2", "AO"),
      pt("Commande pompe 1", "DO"),
      pt("Commande pompe 2", "DO"),
      sec("ECS"),
      pt("Sonde départ", "AI", "PT1000"),
      pt("Sonde retour", "AI", "PT1000"),
      pt("Defaut ECS", "DI"),
      pt("Commande Vanne 3 voies", "AO"),
      pt("Commande Pompe primaire ECS", "DO"),
    ],
  },

  // Affaire LIVRE — Collège Pasteur (mise en service terminée).
  "Bâtiment C": {
    slug: "batc-past",
    test: "ok",
    ip: "192.168.30.10",
    ip2: "10.0.30.10",
    lignes: [
      sec("Bâtiment C — chauffage"),
      pt("Sonde extérieur", "AI", "PT1000"),
      pt("Sonde départ", "AI", "PT1000"),
      pt("Sonde ambiance", "AI", "PT1000"),
      pt("Defaut pompe 1", "DI"),
      pt("Commande Vanne 3 voies", "AO"),
      pt("Commande pompe 1", "DO"),
      pt("Commande pompe 2", "DO"),
    ],
  },

  // Affaire CLOTURE — Piscine municipale (multi-automate, réceptionnée).
  "Traitement d'eau": {
    slug: "eau-pisc",
    test: "ok",
    ip: "192.168.40.10",
    ip2: "10.0.40.10",
    lignes: [
      sec("Traitement d'eau — bassin"),
      pt("Sonde départ", "AI", "PT1000"),
      pt("Capteur pression", "AI", "0-10V"),
      pt("Sonde ambiance", "AI", "PT1000"),
      pt("Defaut pompe 1", "DI"),
      pt("Defaut pompe 2", "DI"),
      pt("Pressostat d'air", "DI"),
      pt("Commande pompe 1", "DO"),
      pt("Commande pompe 2", "DO"),
      pt("Commande Vanne 3 voies", "AO"),
      pt("Compteur Modbus", "COM", "Modbus TCP"),
    ],
  },
  "Ventilation halls": {
    slug: "vent-pisc",
    test: "ok",
    ip: "192.168.40.11",
    ip2: "10.0.40.11",
    lignes: [
      sec("Ventilation halls piscine"),
      pt("Sonde Air Soufflé", "AI", "PT1000"),
      pt("Sonde Air Repris", "AI", "PT1000"),
      pt("Défaut Moteur Air Soufflé", "DI"),
      pt("Pressostat Filtre d'Air Neuf", "DI"),
      pt("Commande Moteur Air Soufflé", "AO"),
      pt("Commande Moteur Air Repris", "AO"),
      pt("Commande Vanne Chaud", "AO"),
    ],
  },
};

async function main() {
  const projets = await prisma.affectationProjet.findMany({
    select: { id: true, nom: true, data: true },
  });

  let traites = 0;
  for (const rec of projets) {
    const def = AUTOMATES[rec.nom];
    if (!def) {
      console.log(`• ignoré (pas de modèle) : ${rec.nom}`);
      continue;
    }
    const p = rec.data as unknown as Project;

    // 1. Liste de points (saisie).
    p.rows = buildRows(def.slug, def.lignes);

    // 2. Dérive les E/S physiques, réconcilie le module intégré, affecte aux bornes.
    p.points = syncPoints(p.rows, p.points ?? []);
    p.modules = reconcilierModules(cat, p.controller, p.modules ?? []);
    p.points = affecterAuto(p);

    // 3. Suivi de mise en service selon l'état de l'affaire.
    poserTests(p.points, def.test, def.defauts);

    // 4. Réseau / IP (aperçu plus riche pour les automates en service).
    if (def.ip) p.controller_ip = def.ip;
    if (def.ip2) p.controller_ip_2 = def.ip2;

    await prisma.affectationProjet.update({
      where: { id: rec.id },
      data: { data: p as unknown as Prisma.InputJsonValue },
    });

    const es = p.points.length;
    const affectes = p.points.filter((x) => x.module != null).length;
    console.log(
      `✔ ${rec.nom.padEnd(18)} ${p.controller.padEnd(12)} ${es} E/S (${affectes} affectées) · tests: ${def.test}`,
    );
    traites += 1;
  }
  console.log(`\n✔ ${traites}/${projets.length} automates remplis.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
