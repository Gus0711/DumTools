/* Modèle de l'outil « Notes » — types client-safe partagés entre l'éditeur
 * (client) et les queries/actions (serveur). Aucun import serveur ici.
 *
 * Le contenu d'une note est le document de l'éditeur BlockNote : un tableau de
 * blocs JSON (paragraphes, titres, listes, images, tables de données typées,
 * embeds HTML…). On le transporte en `unknown[]` : seul l'éditeur (qui possède
 * le schéma) sait le typer précisément — le serveur le stocke tel quel. */

export type NoteContenu = unknown[];

/* --- Table de données typée (bloc custom « esprit Coda ») -------------------- */

export type TypeColonne = "texte" | "nombre" | "date" | "case" | "choix" | "url";

export const TYPE_COLONNE_LABEL: Record<TypeColonne, string> = {
  texte: "Texte",
  nombre: "Nombre",
  date: "Date",
  case: "Case à cocher",
  choix: "Choix",
  url: "URL",
};

export interface ColonneTable {
  id: string;
  nom: string;
  type: TypeColonne;
  /** Valeurs proposées pour le type « choix ». */
  options?: string[];
}

export type ValeurCellule = string | number | boolean | null;

export interface LigneTable {
  id: string;
  valeurs: Record<string, ValeurCellule>;
}

/** Données d'un bloc « table de données » (sérialisées en JSON dans les props
 *  du bloc — BlockNote n'accepte que des props scalaires). */
export interface TableDonnees {
  colonnes: ColonneTable[];
  lignes: LigneTable[];
}

export function tableVide(): TableDonnees {
  const col = (nom: string): ColonneTable => ({ id: uidCourt(), nom, type: "texte" });
  return {
    colonnes: [col("Nom"), col("Détail")],
    lignes: [
      { id: uidCourt(), valeurs: {} },
      { id: uidCourt(), valeurs: {} },
    ],
  };
}

export function uidCourt(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID().slice(0, 8)
    : Math.random().toString(36).slice(2, 10);
}

/* --- Médias ------------------------------------------------------------------ */

/** Images collées + pièces jointes : 50 Mo de marge (les photos sont bien plus
 *  petites, mais une note peut porter un PDF ou une archive). */
export const TAILLE_MAX_MEDIA_NOTE = 50 * 1024 * 1024;

/** URL canonique d'un média de note — c'est CETTE forme qui est stockée dans le
 *  document ; la vue publique la réécrit vers la route scopée au jeton. */
export function urlMediaNote(mediaId: string): string {
  return `/api/notes/media/${mediaId}`;
}

/** Réécrit les URLs médias d'un document vers la route publique scopée au
 *  jeton (la route authentifiée /api/notes/media/* exigerait une session que
 *  le lecteur du lien public n'a pas). */
export function reecrireMediasPublics(contenu: NoteContenu, jeton: string): NoteContenu {
  const json = JSON.stringify(contenu ?? []);
  return JSON.parse(
    json.replaceAll("/api/notes/media/", `/api/public/notes/${jeton}/media/`),
  ) as NoteContenu;
}

/** Extrait les ids de médias référencés par un document (pour la purge des
 *  médias orphelins au save). */
export function mediasReferences(contenu: NoteContenu): Set<string> {
  const ids = new Set<string>();
  const json = JSON.stringify(contenu ?? []);
  const re = /\/api\/notes\/media\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/gi;
  for (const m of json.matchAll(re)) ids.add(m[1].toLowerCase());
  return ids;
}

/* --- Résumé (fiches client / affaire, index) ---------------------------------- */

type BlocApprox = {
  type?: string;
  content?: unknown;
  children?: unknown[];
};

function texteInline(content: unknown, out: string[]): void {
  if (!Array.isArray(content)) return;
  for (const item of content) {
    const i = item as { type?: string; text?: string; content?: unknown };
    if (typeof i?.text === "string") out.push(i.text);
    else if (i?.content) texteInline(i.content, out);
  }
}

/** Texte brut approximatif d'un document (pour résumés et recherches légères). */
export function extraireTexte(contenu: NoteContenu, maxChars = 160): string {
  const out: string[] = [];
  const walk = (blocs: unknown[]) => {
    for (const b of blocs) {
      if (out.join(" ").length > maxChars) return;
      const bloc = b as BlocApprox;
      texteInline(bloc.content, out);
      if (Array.isArray(bloc.children)) walk(bloc.children);
    }
  };
  walk(Array.isArray(contenu) ? contenu : []);
  const texte = out.join(" ").replace(/\s+/g, " ").trim();
  return texte.length > maxChars ? `${texte.slice(0, maxChars - 1)}…` : texte;
}

export function resumeNote(contenu: NoteContenu): string {
  const texte = extraireTexte(contenu, 90);
  if (texte) return texte;
  const n = Array.isArray(contenu) ? contenu.length : 0;
  return n === 0 ? "Note vide" : `${n} bloc${n > 1 ? "s" : ""}`;
}
