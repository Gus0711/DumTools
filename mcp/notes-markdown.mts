// Conversion Markdown ⇄ blocs BlockNote pour le serveur MCP (outil Notes).
//
// Les IA lisent/écrivent du MARKDOWN ; les notes stockent des blocs BlockNote.
// On utilise ServerBlockNoteEditor (schéma STANDARD, sans nos blocs React) :
// - lecture : les blocs standard passent par le convertisseur officiel, et nos
//   trois blocs métier sont rendus À LA MAIN en équivalent markdown (table GFM,
//   bloc de code html, lien) — sans ça ils disparaîtraient (conversion lossy) ;
// - écriture : markdown → blocs standard uniquement (une table markdown devient
//   un tableau riche BlockNote ; les blocs métier se créent dans l'éditeur).
import { ServerBlockNoteEditor } from "@blocknote/server-util";
import type { NoteContenu, TableDonnees, ValeurCellule } from "../src/tools/notes/model";

const editeur = ServerBlockNoteEditor.create();

type BlocApprox = {
  type?: string;
  props?: Record<string, unknown>;
};

function celluleVersTexte(v: ValeurCellule): string {
  if (v == null || v === "") return "";
  if (typeof v === "boolean") return v ? "✔" : "✘";
  // Les barres verticales casseraient la table GFM.
  return String(v).replaceAll("|", "\\|").replaceAll("\n", " ");
}

/** Bloc « table de données » → table markdown (GFM), types de colonnes en 2e ligne d'en-tête implicite. */
function tableVersMarkdown(props: Record<string, unknown>): string {
  let table: TableDonnees;
  try {
    table = JSON.parse(String(props.data ?? "")) as TableDonnees;
  } catch {
    return "";
  }
  if (!Array.isArray(table?.colonnes) || table.colonnes.length === 0) return "";
  const entete = `| ${table.colonnes.map((c) => celluleVersTexte(c.nom)).join(" | ")} |`;
  const separateur = `| ${table.colonnes.map(() => "---").join(" | ")} |`;
  const lignes = (table.lignes ?? []).map(
    (l) => `| ${table.colonnes.map((c) => celluleVersTexte(l.valeurs?.[c.id] ?? null)).join(" | ")} |`,
  );
  return [entete, separateur, ...lignes].join("\n");
}

/** Document de note → markdown, blocs métier compris. */
export async function blocsVersMarkdown(contenu: NoteContenu): Promise<string> {
  const morceaux: string[] = [];
  let tampon: unknown[] = [];

  const viderTampon = async () => {
    if (tampon.length === 0) return;
    const md = (await editeur.blocksToMarkdownLossy(tampon as never)).trim();
    if (md) morceaux.push(md);
    tampon = [];
  };

  for (const bloc of Array.isArray(contenu) ? contenu : []) {
    const b = bloc as BlocApprox;
    if (b.type === "tableDonnees") {
      await viderTampon();
      const md = tableVersMarkdown(b.props ?? {});
      if (md) morceaux.push(md);
    } else if (b.type === "embedHtml") {
      await viderTampon();
      const html = String(b.props?.html ?? "").trim();
      if (html) morceaux.push("```html\n" + html + "\n```");
    } else if (b.type === "lienCarte") {
      await viderTampon();
      const url = String(b.props?.url ?? "").trim();
      const titre = String(b.props?.titre ?? "").trim() || url;
      if (url) morceaux.push(`[${titre}](${url})`);
    } else if (b.type === "pageBreak") {
      // Saut de page (impression) : pas d'équivalent markdown — et le schéma
      // standard du ServerBlockNoteEditor ne le connaît pas, il ferait planter
      // blocksToMarkdownLossy. On l'ignore.
      await viderTampon();
    } else {
      tampon.push(bloc);
    }
  }
  await viderTampon();
  return morceaux.join("\n\n");
}

/** Markdown → blocs BlockNote standard (titres, listes, tables riches, code…). */
export async function markdownVersBlocs(markdown: string): Promise<NoteContenu> {
  const texte = markdown?.trim();
  if (!texte) return [];
  const blocs = await editeur.tryParseMarkdownToBlocks(texte);
  // Le parseur laisse des `undefined` dans les tableaux (ex. columnWidths) que
  // Prisma refuse en JSON — la sérialisation les normalise en null (forme native).
  return JSON.parse(JSON.stringify(blocs)) as NoteContenu;
}
