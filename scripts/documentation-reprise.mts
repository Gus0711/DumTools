// Reprise des fiches Distech : de `public/materiel/Documentations_Distech/`
// vers la documentation des PRODUITS du magasin.
//
// Ce que ça change, et pourquoi ça vaut le déménagement : les 8 PDF vivaient
// dans le dépôt Git et étaient servis en statique, donc ajouter une fiche
// demandait un commit et une reconstruction d'image. Une fois rattachées au
// produit, elles remontent d'elles-mêmes sur la fiche article, dans la base
// matériel (par `produitId`) et en annexe des devis qui chiffrent ce produit.
//
// UNE FICHE SERT PLUSIEURS PRODUITS : « ECY IO Modules » couvre les six modules
// d'extension, « ECY-300-Series » toute la série. C'est pour ça que la reprise
// crée UN document et N rattachements, et non un document par modèle.
//
// Déroulé en deux temps — rien ne s'écrit sans qu'on ait lu le rapport :
//
//   1. npx tsx scripts/documentation-reprise.mts
//      Montre ce qui serait créé et rattaché. Aucune écriture.
//
//   2. npx tsx scripts/documentation-reprise.mts --appliquer
//      Copie les binaires dans le dépôt disque et écrit en base.
//
// IDEMPOTENT : une fiche déjà reprise (même nom de fichier) est laissée
// tranquille, seuls les rattachements manquants sont ajoutés. On peut donc le
// rejouer après avoir relié de nouveaux modèles à leur produit.
//
// ⚠️ Les PDF de `public/` NE SONT PAS SUPPRIMÉS : `AutomateModele.docUrl` et
// `ModuleModele.docUrl` pointent encore dessus et servent de repli pour les
// modèles qui n'ont pas de produit. Leur retrait est une décision à part.
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const SOURCE = "public/materiel/Documentations_Distech";
const DEPOT = process.env.DOC_MEDIA_DIR ?? join(process.cwd(), ".documentation-media");
const appliquer = process.argv.includes("--appliquer");

/** Le titre lisible d'un fichier : « ECY-600-Series_SP.pdf » → « ECY-600-Series ». */
function titreDe(fichier: string): string {
  return fichier.replace(/_SP\.pdf$/i, "").replace(/\.pdf$/i, "");
}

async function main() {
  const fichiers = readdirSync(join(process.cwd(), SOURCE))
    .filter((f) => f.toLowerCase().endsWith(".pdf"))
    .sort((a, b) => a.localeCompare(b, "fr"));

  console.log(`\n${fichiers.length} fiche(s) dans ${SOURCE}\n`);

  // Qui pointe vers quoi, aujourd'hui — via le `docUrl` hérité.
  const [automates, modules] = await Promise.all([
    prisma.automateModele.findMany({
      select: { reference: true, docUrl: true, produitId: true },
    }),
    prisma.moduleModele.findMany({ select: { type: true, docUrl: true, produitId: true } }),
  ]);

  const modeles = [
    ...automates.map((a) => ({ nom: a.reference, docUrl: a.docUrl, produitId: a.produitId })),
    ...modules.map((m) => ({ nom: m.type, docUrl: m.docUrl, produitId: m.produitId })),
  ];

  let creees = 0;
  let rattachements = 0;
  const orphelins: string[] = [];

  for (const fichier of fichiers) {
    // Le rapprochement se fait sur le NOM DE FICHIER, pas sur l'URL entière :
    // les `docUrl` en base ont pu être saisis avec ou sans le préfixe, encodés
    // ou non.
    const concernes = modeles.filter((m) => decodeURI(m.docUrl || "").endsWith(fichier));
    const produitIds = [...new Set(concernes.map((m) => m.produitId).filter((x): x is string => !!x))];
    const sansProduit = concernes.filter((m) => !m.produitId).map((m) => m.nom);

    const contenu = readFileSync(join(process.cwd(), SOURCE, fichier));
    const titre = titreDe(fichier);

    console.log(`▸ ${titre}`);
    console.log(
      `    ${(contenu.byteLength / 1024 / 1024).toFixed(1)} Mo · ${concernes.length} modèle(s) · ${produitIds.length} produit(s)`,
    );
    if (sansProduit.length > 0) {
      console.log(`    ⚠ sans produit relié : ${sansProduit.join(", ")}`);
      orphelins.push(...sansProduit);
    }
    if (concernes.length === 0) {
      console.log("    ⚠ aucun modèle ne la référence — reprise quand même, à rattacher à la main");
    }

    if (!appliquer) continue;

    let doc = await prisma.documentation.findFirst({
      where: { nom: fichier },
      select: { id: true },
    });

    if (!doc) {
      await mkdir(DEPOT, { recursive: true });
      const chemin = join(DEPOT, randomUUID());
      await writeFile(chemin, contenu);
      doc = await prisma.documentation.create({
        data: {
          titre,
          categorie: "fiche",
          fichier: chemin,
          nom: fichier,
          mimeType: "application/pdf",
          taille: contenu.byteLength,
          note: "Reprise de la documentation Distech (écran /documentation).",
        },
        select: { id: true },
      });
      creees++;
      console.log(`    ✔ créée`);
    }

    for (const produitId of produitIds) {
      // Écriture TECHNIQUE : pas d'auteur (règle du fil d'activité — un script
      // de reprise n'est pas une modification humaine).
      const existe = await prisma.produitDocumentation.findUnique({
        where: { produitId_documentationId: { produitId, documentationId: doc.id } },
        select: { produitId: true },
      });
      if (existe) continue;
      await prisma.produitDocumentation.create({
        data: { produitId, documentationId: doc.id },
      });
      rattachements++;
    }
    if (produitIds.length > 0) console.log(`    ✔ ${produitIds.length} rattachement(s) à jour`);
  }

  console.log("");
  if (!appliquer) {
    console.log("Rien n'a été écrit. Relancez avec --appliquer pour reprendre.");
  } else {
    console.log(`${creees} fiche(s) créée(s), ${rattachements} rattachement(s) ajouté(s).`);
    console.log(`Binaires déposés dans ${DEPOT}`);
  }
  if (orphelins.length > 0) {
    console.log(
      `\n⚠ ${new Set(orphelins).size} modèle(s) de la base matériel n'ont pas de produit relié :`,
    );
    console.log(`  ${[...new Set(orphelins)].join(", ")}`);
    console.log(
      "  Leur fiche continue de s'afficher par le `docUrl` hérité. Reliez-les à un produit\n" +
        "  (fiche produit du magasin) pour qu'ils profitent de la documentation partagée.",
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
