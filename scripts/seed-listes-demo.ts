/**
 * Seed de démonstration : ~10 listes de points aléatoires pour l'outil
 * « Liste de Points GTB ». Réutilise le référentiel client + les modèles de
 * sections du catalogue. Idempotent-ish : préfixe les titres par [DEMO] pour
 * pouvoir les repérer / purger.
 *
 *   npx tsx scripts/seed-listes-demo.ts [nombre]
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import type { Prisma } from "../src/generated/prisma/client";
import { CLIENTS, CATALOG, TEMPLATES } from "../src/tools/liste-points/catalog";
import { emptyIo, type PointRow, type IoType } from "../src/tools/liste-points/model";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const N = Number(process.argv[2]) || 10;

const rand = (n: number) => Math.floor(Math.random() * n);
const pick = <T>(arr: T[]): T => arr[rand(arr.length)];
const catByName = new Map(CATALOG.map((c) => [c.nom, c.type as IoType]));

const CHANTIER_MOTS = [
  "Rénovation chaufferie", "Mise aux normes GTB", "Extension CTA",
  "Groupe scolaire", "EHPAD", "Centre technique", "Piscine", "Mairie",
  "Gymnase", "Bureaux", "Atelier", "Logements collectifs", "Cuisine centrale",
];
const VILLES = [
  "Laon", "Soissons", "Saint-Quentin", "Chauny", "Tergnier", "Reims",
  "Compiègne", "Amiens", "Château-Thierry", "Guise", "Hirson",
];

function rowId(): string {
  return crypto.randomUUID();
}

/** Construit une ligne "point" avec l'E/S correspondant à son type catalogue. */
function pointRow(nom: string): PointRow {
  const io = emptyIo();
  const type = catByName.get(nom);
  if (type) io[type] = 1;
  return { id: rowId(), kind: "point", nom, io };
}

/** Génère un jeu de lignes : 2 à 4 sections tirées des modèles. */
function genRows(): PointRow[] {
  const sections = Object.keys(TEMPLATES);
  const nb = 2 + rand(3); // 2..4
  const choisies = [...sections].sort(() => Math.random() - 0.5).slice(0, nb);
  const rows: PointRow[] = [];
  for (const s of choisies) {
    rows.push({ id: rowId(), kind: "section", nom: s });
    for (const nomPoint of TEMPLATES[s]) rows.push(pointRow(nomPoint));
  }
  return rows;
}

async function main() {
  const user = await prisma.user.findFirst({
    orderBy: { createdAt: "asc" },
    select: { id: true, nom: true },
  });
  if (!user) {
    throw new Error("Aucun utilisateur — lancez d'abord `npm run db:seed`.");
  }

  const created: string[] = [];
  for (let i = 0; i < N; i++) {
    const client = pick(CLIENTS);
    const chantier = `${pick(CHANTIER_MOTS)} — ${pick(VILLES)}`;
    const rows = genRows();
    // Date étalée sur ~18 mois dans le passé.
    const date = new Date();
    date.setDate(date.getDate() - rand(540));

    const doc = await prisma.pointsList.create({
      data: {
        titre: `[DEMO] ${chantier}`,
        clientNom: client,
        chantierNom: chantier,
        date,
        rows: rows as unknown as Prisma.InputJsonValue,
        createdById: user.id,
      },
      select: { id: true, clientNom: true, chantierNom: true },
    });
    created.push(`  • ${doc.clientNom} — ${doc.chantierNom} (${rows.filter((r) => r.kind === "point").length} pts)`);
  }

  console.log(`✔ ${N} listes de démonstration créées (auteur : ${user.nom}) :`);
  console.log(created.join("\n"));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
