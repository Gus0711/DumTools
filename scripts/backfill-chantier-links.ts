/**
 * Backfill : rattache les projets d'affectation existants à une Affaire
 * (Chantier) via leur `numeroWhy`. Crée l'affaire manquante (ancrée sur le
 * client déjà résolu). Sans numéro Why ou sans client → laissé non rattaché.
 * À lancer une fois après la migration affaire_pivot.
 *
 *   npx tsx scripts/backfill-chantier-links.ts
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  let rattaches = 0;
  let ignores = 0;

  const affectations = await prisma.affectationProjet.findMany({
    where: { chantierId: null },
    select: { id: true, nom: true, numeroWhy: true, clientId: true },
  });

  for (const p of affectations) {
    const why = (p.numeroWhy ?? "").trim();
    if (!why || !p.clientId) {
      ignores++;
      continue;
    }
    const chantier = await prisma.chantier.upsert({
      where: { numeroWhy: why },
      update: {},
      create: { numeroWhy: why, nom: p.nom?.trim() || why, clientId: p.clientId },
      select: { id: true },
    });
    await prisma.affectationProjet.update({
      where: { id: p.id },
      data: { chantierId: chantier.id },
    });
    rattaches++;
  }

  console.log(
    `✔ Backfill affaires terminé : ${rattaches} projet(s) rattaché(s), ${ignores} ignoré(s) (sans n° Why ou sans client).`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
