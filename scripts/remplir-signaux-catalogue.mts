// Remplit le champ `signal` des points du catalogue déjà en base à partir de
// l'heuristique nom+type (voir signalCatalogueParDefaut). Idempotent : ne touche
// QUE les points sans signal (préserve les valeurs saisies manuellement).
//   Lancement : npx tsx scripts/remplir-signaux-catalogue.mts
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { signalCatalogueParDefaut, signalLabel } from "../src/tools/liste-points/model";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const points = await prisma.pointCatalog.findMany({ orderBy: { nom: "asc" } });
  let maj = 0;
  for (const p of points) {
    if (p.signal != null && p.signal !== "") continue; // déjà renseigné → on garde
    const signal = signalCatalogueParDefaut(p.nom, p.type);
    if (signal == null) continue; // COM / type sans borne → pas de signal
    await prisma.pointCatalog.update({ where: { id: p.id }, data: { signal } });
    console.log(`  ${p.nom} [${p.type}] → ${signalLabel(signal)}`);
    maj += 1;
  }
  console.log(`✔ ${maj} point(s) du catalogue mis à jour (sur ${points.length}).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
