import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, Prisma } from "../src/generated/prisma/client";
import { Role } from "../src/generated/prisma/enums";
import { CLIENTS, CATALOG, modelesParDefaut } from "../src/tools/liste-points/catalog";
import { signalCatalogueParDefaut } from "../src/tools/liste-points/model";
import { catalogueParDefaut } from "../src/tools/affectation-es/catalogue";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

/* Crée (ou met à jour) le compte administrateur initial.
 * Surchargeable via SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD / SEED_ADMIN_NOM. */
async function main() {
  const email = process.env.SEED_ADMIN_EMAIL ?? "admin@dumortier02.fr";
  const password = process.env.SEED_ADMIN_PASSWORD ?? "changeme";
  const nom = process.env.SEED_ADMIN_NOM ?? "Administrateur";

  const passwordHash = await bcrypt.hash(password, 10);

  const user = await prisma.user.upsert({
    where: { email },
    update: { nom, role: Role.ADMIN, actif: true },
    create: { email, nom, passwordHash, role: Role.ADMIN, actif: true },
  });

  console.log(`✔ Admin prêt : ${user.email} (rôle ${user.role})`);
  if (!process.env.SEED_ADMIN_PASSWORD) {
    console.log(`  Mot de passe par défaut : "${password}" — À CHANGER.`);
  }

  // Référentiel client + catalogue de points de l'outil Liste de Points.
  const clients = await prisma.client.createMany({
    data: CLIENTS.map((nom) => ({ nom })),
    skipDuplicates: true,
  });
  const catalog = await prisma.pointCatalog.createMany({
    data: CATALOG.map((p) => ({
      nom: p.nom,
      type: p.type,
      signal: signalCatalogueParDefaut(p.nom, p.type),
    })),
    skipDuplicates: true,
  });
  console.log(
    `✔ Référentiel : +${clients.count} clients, +${catalog.count} points au catalogue`,
  );

  // Modèles de saisie (sections pré-remplies) de l'outil Liste de points.
  const defs = modelesParDefaut();
  const modeles = await prisma.modele.createMany({
    data: defs.map((m, i) => ({
      nom: m.nom,
      ordre: i,
      points: m.points as unknown as Prisma.InputJsonValue,
    })),
    skipDuplicates: true,
  });
  console.log(`✔ Modèles de saisie : +${modeles.count}`);

  // Base matériel de l'outil Affectation E/S (automates + modules Distech).
  const cat = catalogueParDefaut();
  const automates = await prisma.automateModele.createMany({
    data: cat.automates.map((a, i) => ({
      reference: a.reference,
      ordre: i,
      image: a.image,
      alimIntegree: a.alimIntegree,
      alimLabel: a.alimLabel,
      entreeKind: a.entreeKind,
      entreeCount: a.entreeCount,
      sortieKind: a.sortieKind,
      sortieCount: a.sortieCount,
      entreeCodes: a.entreeCodes as unknown as Prisma.InputJsonValue,
      sortieCodes: a.sortieCodes as unknown as Prisma.InputJsonValue,
      extensible: a.extensible,
      modulesCompat: a.modulesCompat as unknown as Prisma.InputJsonValue,
      maxModules: a.maxModules,
      maxPoints: a.maxPoints,
      docUrl: a.docUrl,
    })),
    skipDuplicates: true,
  });
  const modules = await prisma.moduleModele.createMany({
    data: cat.modules.map((m, i) => ({
      type: m.type,
      ordre: i,
      image: m.image,
      categorie: m.categorie,
      entreeKind: m.entreeKind,
      entreeCount: m.entreeCount,
      sortieKind: m.sortieKind,
      sortieCount: m.sortieCount,
      docUrl: m.docUrl,
    })),
    skipDuplicates: true,
  });
  console.log(
    `✔ Base matériel : +${automates.count} automates, +${modules.count} modules`,
  );

  // Rubriques thématiques du Wiki (base de connaissances interne). Upsert par
  // slug : re-seed idempotent, et un libellé/icône ajusté ici est repris. Les
  // couleurs sont des CLÉS de teinte (résolues en classes côté UI), pas des #hex.
  const RUBRIQUES = [
    {
      slug: "administration",
      nom: "Administration",
      icon: "Building2",
      couleur: "brand",
      description: "Procédures internes, RH, gestion, documents administratifs.",
    },
    {
      slug: "commerce",
      nom: "Commerce",
      icon: "BadgeEuro",
      couleur: "accent",
      description: "Devis, relation client, offres et méthodes commerciales.",
    },
    {
      slug: "dev-automatisme",
      nom: "Dev-Automatisme",
      icon: "CircuitBoard",
      couleur: "ao",
      description: "Programmation GTB, scripts, automates, supervision Niagara/Distech.",
    },
    {
      slug: "chantier",
      nom: "Chantier",
      icon: "HardHat",
      couleur: "do",
      description: "Déroulé de chantier, mise en service, interventions terrain.",
    },
    {
      slug: "armoire",
      nom: "Armoire",
      icon: "Server",
      couleur: "com",
      description: "Câblage, armoires électriques, choix et montage du matériel.",
    },
  ];
  for (const [i, r] of RUBRIQUES.entries()) {
    await prisma.wikiRubrique.upsert({
      where: { slug: r.slug },
      update: { nom: r.nom, icon: r.icon, couleur: r.couleur, description: r.description, ordre: i },
      create: { ...r, ordre: i },
    });
  }
  console.log(`✔ Wiki : ${RUBRIQUES.length} rubriques prêtes`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
