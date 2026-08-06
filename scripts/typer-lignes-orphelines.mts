// Redonne son type d'E/S à une ligne de point qui n'en porte aucun.
//
// Une ligne dont l'objet `io` est tout à zéro ne produit AUCUNE borne : elle
// n'entre ni dans les totaux, ni dans l'affectation, ni dans la BOM. Elle est
// pourtant bien là, avec son nom — donc invisible sans l'être vraiment. Cas
// typique : « Sonde retour » héritée de l'ancien outil autonome, où le type
// était porté par des compteurs par colonne et non par une case unique.
//
// Le type n'est pas deviné : il est repris du CATALOGUE, à nom exact (avec son
// signal par défaut). Une ligne dont le nom est absent du catalogue est laissée
// telle quelle et signalée — c'est un arbitrage humain, pas une déduction.
//
//   npx tsx scripts/typer-lignes-orphelines.mts              (aperçu, aucune écriture)
//   npx tsx scripts/typer-lignes-orphelines.mts --appliquer
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { emptyIo, IO_TYPES, type IoType, type PointRow } from "../src/tools/liste-points/model";
import { syncPoints } from "../src/tools/affectation-es/derivation";
import { affecterAuto } from "../src/tools/affectation-es/affectation-auto";
import type { Project } from "../src/tools/affectation-es/model";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const propre = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim();
const typeDe = (r: PointRow) => IO_TYPES.find((t) => r.io?.[t]);

async function main() {
  const appliquer = process.argv.includes("--appliquer");
  const catalogue = new Map(
    (await prisma.pointCatalog.findMany()).map((c) => [c.nom, { type: c.type as IoType, signal: c.signal }]),
  );

  const corriges: string[] = [];
  const orphelins = new Map<string, number>();

  /** Type la ligne depuis le catalogue ; null si rien à faire. */
  const typer = (r: PointRow, doc: string): PointRow | null => {
    if (r.kind !== "point" || typeDe(r)) return null;
    const nom = propre(r.nom);
    if (!nom) return null;
    const def = catalogue.get(nom);
    if (!def) {
      orphelins.set(nom, (orphelins.get(nom) ?? 0) + 1);
      return null;
    }
    const io = emptyIo();
    io[def.type] = 1;
    corriges.push(`   ${doc} · « ${nom} » → ${def.type}${def.signal ? ` / ${def.signal}` : ""}`);
    return { ...r, io, signal: r.signal ?? def.signal ?? undefined };
  };

  let nbProjets = 0;
  let nbListes = 0;

  await prisma.$transaction(async (tx) => {
    for (const p of await tx.affectationProjet.findMany({ select: { id: true, nom: true, data: true } })) {
      const projet = (p.data ?? {}) as Partial<Project>;
      const rows = (projet.rows ?? []) as PointRow[];
      let touche = false;
      const nouvelles = rows.map((r) => {
        const c = typer(r, `GTB ${p.nom}`);
        if (!c) return r;
        touche = true;
        nbProjets += 1;
        return c;
      });
      if (!touche) continue;
      // Une ligne nouvellement typée doit produire sa borne : on re-dérive et on
      // ré-affecte, exactement comme l'éditeur au save (updateProjectRows).
      const maj = { ...projet, rows: nouvelles } as Project;
      maj.points = affecterAuto({ ...maj, points: syncPoints(nouvelles, maj.points ?? []) });
      if (appliquer)
        await tx.affectationProjet.update({ where: { id: p.id }, data: { data: maj as object } });
    }

    for (const l of await tx.pointsList.findMany({ select: { id: true, titre: true, rows: true } })) {
      const rows = (l.rows ?? []) as unknown as PointRow[];
      let touche = false;
      const nouvelles = rows.map((r) => {
        const c = typer(r, `LST ${l.titre ?? "(sans titre)"}`);
        if (!c) return r;
        touche = true;
        nbListes += 1;
        return c;
      });
      if (!touche) continue;
      if (appliquer) await tx.pointsList.update({ where: { id: l.id }, data: { rows: nouvelles as object } });
    }
  });

  const prefixe = appliquer ? "" : "[aperçu] ";
  if (corriges.length) {
    console.log(`${prefixe}Lignes retypées :`);
    console.log(corriges.join("\n"));
  }
  console.log(`\n${prefixe}${nbProjets} ligne(s) de projet GTB · ${nbListes} ligne(s) de liste.`);
  if (orphelins.size) {
    console.log(`\n⚠️  Sans type ET absentes du catalogue — à trancher à la main :`);
    for (const [nom, n] of orphelins) console.log(`   ${n}× « ${nom} »`);
  }
  if (!appliquer) console.log(`\nRien n'a été écrit. Relancez avec --appliquer.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
