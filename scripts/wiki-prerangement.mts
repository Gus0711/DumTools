/* Pré-rangement one-shot des pages de la rubrique « Dev-Automatisme » du Wiki
 * sous 3 dossiers (façon Notion), d'après leurs tags. IDEMPOTENT : les dossiers
 * sont retrouvés par titre s'ils existent déjà, et seules les pages ENCORE à la
 * racine (parentId null, hors dossiers) sont classées → relançable sans dégât.
 *
 *   npx tsx scripts/wiki-prerangement.mts
 *
 * Règles (docs/RECHERCHE-WIKI.md / arborescence) :
 *   - tag « Home Page »            → Home Pages N4
 *   - tag « Designer » ou « DGLux5 » → Snippets Designer
 *   - le reste                      → Programmes N4 & scripts serveur
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const RUBRIQUE = "dev-automatisme";

const DOSSIERS = [
  {
    cle: "home",
    titre: "Home Pages N4",
    resume: "Pages de login Niagara 4 (skins / thèmes) prêtes à l'emploi.",
  },
  {
    cle: "designer",
    titre: "Snippets Designer",
    resume: "Petits scripts EC Designer / DGLux5 : tables, dataFlow, filtres, formats, BQL.",
  },
  {
    cle: "programmes",
    titre: "Programmes N4 & scripts serveur",
    resume:
      "ProgramObjects Niagara 4, intégrations et scripts serveur (historiques, énergie, BACnet, API…).",
  },
] as const;

type Cle = (typeof DOSSIERS)[number]["cle"];

function categorie(tags: string[]): Cle {
  if (tags.includes("Home Page")) return "home";
  if (tags.includes("Designer") || tags.includes("DGLux5")) return "designer";
  return "programmes";
}

async function main() {
  const rub = await prisma.wikiRubrique.findUnique({
    where: { slug: RUBRIQUE },
    select: { id: true },
  });
  if (!rub) throw new Error(`Rubrique « ${RUBRIQUE} » introuvable.`);

  const admin = await prisma.user.findFirst({
    where: { role: "ADMIN" },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });

  // 1) Créer / retrouver les 3 dossiers (à la racine de la rubrique).
  const idDossier: Record<string, string> = {};
  let ordreRacine = 0;
  for (const d of DOSSIERS) {
    const existant = await prisma.wikiPage.findFirst({
      where: { rubriqueId: rub.id, parentId: null, titre: d.titre },
      select: { id: true },
    });
    if (existant) {
      idDossier[d.cle] = existant.id;
    } else {
      const page = await prisma.wikiPage.create({
        data: {
          rubriqueId: rub.id,
          titre: d.titre,
          resume: d.resume,
          texte: `${d.titre} ${d.resume}`,
          ordre: ordreRacine,
          createdById: admin?.id ?? null,
        },
        select: { id: true },
      });
      idDossier[d.cle] = page.id;
    }
    ordreRacine++;
  }
  const idsDossiers = Object.values(idDossier);

  // 2) Classer les pages encore à la racine (hors dossiers) sous le bon dossier.
  const aRanger = await prisma.wikiPage.findMany({
    where: { rubriqueId: rub.id, parentId: null, id: { notIn: idsDossiers } },
    orderBy: { updatedAt: "asc" },
    select: { id: true, tags: { select: { tag: { select: { nom: true } } } } },
  });

  const compteur: Record<Cle, number> = { home: 0, designer: 0, programmes: 0 };
  for (const p of aRanger) {
    const cat = categorie(p.tags.map((t) => t.tag.nom));
    await prisma.wikiPage.update({
      where: { id: p.id },
      data: { parentId: idDossier[cat], ordre: compteur[cat]++ },
    });
  }

  console.log(`✔ Dossiers prêts (${idsDossiers.length}) · pages rangées : ${aRanger.length}`);
  console.log(
    `  Home Pages N4=${compteur.home} · Snippets Designer=${compteur.designer} · Programmes=${compteur.programmes}`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
