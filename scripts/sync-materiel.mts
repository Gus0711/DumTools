// Synchronise la base matériel (AutomateModele / ModuleModele) sur les valeurs
// par défaut de src/tools/affectation-es/catalogue.ts : crée les entrées
// manquantes (ECY-APEX, ECY-303-M3, ECY-6UO, ECY-8UI6DOT, variantes -HOA…) et
// met à jour les champs (capacités, docUrl, compat…) des entrées existantes.
//
//   npx tsx scripts/sync-materiel.mts
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, Prisma } from "../src/generated/prisma/client";
import { catalogueParDefaut } from "../src/tools/affectation-es/catalogue";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const json = (v: unknown) => v as unknown as Prisma.InputJsonValue;

async function main() {
  const cat = catalogueParDefaut();
  let aCrees = 0, aMaj = 0, mCrees = 0, mMaj = 0;

  for (let i = 0; i < cat.automates.length; i++) {
    const a = cat.automates[i];
    const data = {
      ordre: i,
      image: a.image,
      alimIntegree: a.alimIntegree,
      alimLabel: a.alimLabel,
      entreeKind: a.entreeKind,
      entreeCount: a.entreeCount,
      sortieKind: a.sortieKind,
      sortieCount: a.sortieCount,
      entreeCodes: json(a.entreeCodes),
      sortieCodes: json(a.sortieCodes),
      extensible: a.extensible,
      modulesCompat: json(a.modulesCompat),
      maxModules: a.maxModules,
      maxPoints: a.maxPoints,
      docUrl: a.docUrl,
    };
    const exists = await prisma.automateModele.findUnique({ where: { reference: a.reference }, select: { id: true } });
    await prisma.automateModele.upsert({
      where: { reference: a.reference },
      create: { reference: a.reference, actif: true, ...data },
      update: data,
    });
    exists ? aMaj++ : aCrees++;
  }

  for (let i = 0; i < cat.modules.length; i++) {
    const m = cat.modules[i];
    const data = {
      ordre: i,
      image: m.image,
      categorie: m.categorie,
      entreeKind: m.entreeKind,
      entreeCount: m.entreeCount,
      sortieKind: m.sortieKind,
      sortieCount: m.sortieCount,
      docUrl: m.docUrl,
    };
    const exists = await prisma.moduleModele.findUnique({ where: { type: m.type }, select: { id: true } });
    await prisma.moduleModele.upsert({
      where: { type: m.type },
      create: { type: m.type, actif: true, ...data },
      update: data,
    });
    exists ? mMaj++ : mCrees++;
  }

  console.log(`Automates : +${aCrees} créés, ${aMaj} mis à jour`);
  console.log(`Modules   : +${mCrees} créés, ${mMaj} mis à jour`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
