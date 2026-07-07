// Migration : convertit chaque `PointsList` (outil Liste de points autonome) en
// `AffectationProjet` (outil unifié). NON DESTRUCTIF : les PointsList sont
// conservées. IDEMPOTENT : marque `data.migratedFromListe = <listeId>` et saute
// les listes déjà migrées. Éclate les anciennes lignes multi-types en lignes
// mono-type (règle « 1 ligne = 1 type »).
//
//   npx tsx scripts/migrate-listes-vers-projets.mts [--dry]
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, Prisma } from "../src/generated/prisma/client";
import { IO_TYPES, emptyIo, type IoType, type PointRow } from "../src/tools/liste-points/model";
import { defaultProject } from "../src/tools/affectation-es/model";
import { syncPoints } from "../src/tools/affectation-es/derivation";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const DRY = process.argv.includes("--dry");

const rid = () => "r" + Math.random().toString(36).slice(2, 10);

let splits = 0;
function normaliseRows(rows: PointRow[]): PointRow[] {
  const out: PointRow[] = [];
  for (const r of rows) {
    if (r.kind === "section") {
      out.push({ id: r.id, kind: "section", nom: r.nom });
      continue;
    }
    const io = r.io ?? emptyIo();
    const types = IO_TYPES.filter((t) => io[t]) as IoType[];
    if (types.length <= 1) {
      const one = emptyIo();
      if (types[0]) one[types[0]] = 1;
      out.push({ id: r.id, kind: "point", nom: r.nom, note: r.note, io: one });
    } else {
      // Ligne multi-types (dette de l'ancien modèle) → une ligne par type.
      types.forEach((t) => {
        const one = emptyIo();
        one[t] = 1;
        out.push({ id: `${r.id}-${t}-${rid()}`, kind: "point", nom: r.nom, note: r.note, io: one });
      });
      splits += types.length - 1;
    }
  }
  return out;
}

function dateLabel(d: Date | null): string {
  if (!d) return new Date().toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
  return d.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
}

async function main() {
  const listes = await prisma.pointsList.findMany({ orderBy: { createdAt: "asc" } });
  let migres = 0;
  let sautes = 0;

  for (const l of listes) {
    const deja = await prisma.affectationProjet.findFirst({
      where: { data: { path: ["migratedFromListe"], equals: l.id } },
      select: { id: true },
    });
    if (deja) {
      sautes++;
      continue;
    }

    const rows = normaliseRows((l.rows as unknown as PointRow[]) ?? []);
    const project: Record<string, unknown> = {
      ...defaultProject(dateLabel(l.date)),
      name: l.titre?.trim() || l.clientNom || "Depuis liste de points",
      header: [l.clientNom, l.chantierNom].filter((v) => v && v.trim()).join(" - ") || "CLIENT - SITE",
      rows,
      points: syncPoints(rows, []),
      migratedFromListe: l.id,
    };

    console.log(
      `→ ${l.titre || l.clientNom || l.id} : ${rows.filter((r) => r.kind === "point").length} points`,
    );
    if (!DRY) {
      await prisma.affectationProjet.create({
        data: {
          nom: project.name as string,
          clientNom: l.clientNom,
          clientId: l.clientId,
          numeroWhy: l.numeroWhy,
          createdById: l.createdById,
          data: project as unknown as Prisma.InputJsonValue,
        },
      });
    }
    migres++;
  }

  console.log(
    `\n${DRY ? "[DRY] " : ""}Migrées : ${migres} · déjà migrées (sautées) : ${sautes} · lignes multi-types éclatées : +${splits}`,
  );
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
