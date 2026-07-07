/**
 * Backfill : relie les documents existants (listes de points, projets
 * d'affectation) au référentiel Client via leur `clientNom`. Crée les clients
 * manquants. À lancer une fois après la migration client-links-numero-why.
 *
 *   npx tsx scripts/backfill-client-links.ts
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function clientIdPourNom(cache: Map<string, string>, nom: string) {
  const n = nom.trim();
  if (!n) return null;
  const hit = cache.get(n);
  if (hit) return hit;
  const c = await prisma.client.upsert({
    where: { nom: n },
    update: {},
    create: { nom: n },
    select: { id: true },
  });
  cache.set(n, c.id);
  return c.id;
}

async function main() {
  const cache = new Map<string, string>();
  let listes = 0;
  let projets = 0;

  const pointsLists = await prisma.pointsList.findMany({
    where: { clientId: null },
    select: { id: true, clientNom: true },
  });
  for (const d of pointsLists) {
    const clientId = await clientIdPourNom(cache, d.clientNom);
    if (!clientId) continue;
    await prisma.pointsList.update({ where: { id: d.id }, data: { clientId } });
    listes++;
  }

  const affectations = await prisma.affectationProjet.findMany({
    where: { clientId: null },
    select: { id: true, clientNom: true },
  });
  for (const p of affectations) {
    const clientId = await clientIdPourNom(cache, p.clientNom);
    if (!clientId) continue;
    await prisma.affectationProjet.update({ where: { id: p.id }, data: { clientId } });
    projets++;
  }

  console.log(
    `✔ Backfill terminé : ${listes} liste(s) et ${projets} projet(s) rattachés (` +
      `${cache.size} client(s) référencés).`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
