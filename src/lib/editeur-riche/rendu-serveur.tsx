/* Rendu SERVEUR d'un document BlockNote — blocs JSON → HTML, sans monter
 * d'éditeur ni exécuter le moindre script côté client.
 *
 * POURQUOI, alors que Notes et Wiki savent déjà rendre un document ?
 * Parce qu'ils le rendent avec BlockNote lui-même (`lecture-impl.tsx`, un
 * composant client) : parfait pour une lecture interne, inutilisable pour un
 * DOCUMENT QUI S'IMPRIME chez un client. Trois raisons, dans l'ordre :
 *
 *   1. l'impression et le PDF ne doivent pas dépendre d'une hydratation — un
 *      « Chargement… » capturé par le moteur de PDF, c'est un devis blanc ;
 *   2. la page publique d'un devis n'a aucune raison d'embarquer un éditeur
 *      (~200 ko) pour afficher trois paragraphes ;
 *   3. le HTML produit ici est le nôtre : il suit la charte du document et se
 *      pagine (`break-inside`), là où le DOM de BlockNote suit la sienne.
 *
 * Le contrat est explicite : on rend un SOUS-ENSEMBLE fidèle, et ce qu'on ne
 * sait pas rendre est DIT (jamais silencieusement escamoté) — même règle que le
 * « ce qu'on ne sait pas chiffrer est dit » du devis.
 *
 * ⚠️ Le HTML embarqué (bloc `embedHtml`) n'est JAMAIS injecté : cette page est
 * servie sans session, sur internet. Du HTML écrit en base et rendu tel quel sur
 * une page publique, c'est une injection avec un aller-retour de plus.
 */
import type { ReactNode } from "react";

/* --- Formes approximatives : on lit du JSON, pas un type ------------------- */

interface BlocJson {
  id?: string;
  type?: string;
  props?: Record<string, unknown>;
  content?: unknown;
  children?: unknown[];
}

interface InlineJson {
  type?: string;
  text?: string;
  href?: string;
  content?: unknown;
  styles?: Record<string, unknown>;
}

function chaine(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function nombre(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/* =============================================================================
 * CONTENU EN LIGNE
 * ========================================================================== */

/** Les styles de caractère, dans l'ordre où ils s'empilent. */
function habiller(noeud: ReactNode, styles: Record<string, unknown> | undefined): ReactNode {
  if (!styles) return noeud;
  let out = noeud;
  if (styles.code) out = <code className="rd-code">{out}</code>;
  if (styles.bold) out = <strong>{out}</strong>;
  if (styles.italic) out = <em>{out}</em>;
  if (styles.underline) out = <u>{out}</u>;
  if (styles.strike) out = <s>{out}</s>;

  // Les couleurs de BlockNote sont des NOMS ("blue", "yellow"), pas des hex :
  // on les laisse à une classe, qui les mappe sur les tokens du document. Une
  // couleur inconnue ne casse rien — la classe n'existe simplement pas.
  const teinte = chaine(styles.textColor);
  const fond = chaine(styles.backgroundColor);
  if ((teinte && teinte !== "default") || (fond && fond !== "default")) {
    out = (
      <span
        className={[
          teinte && teinte !== "default" ? `rd-t-${teinte}` : "",
          fond && fond !== "default" ? `rd-f-${fond}` : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {out}
      </span>
    );
  }
  return out;
}

function rendreInline(content: unknown, cle = "i"): ReactNode {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return null;
  return content.map((item, i) => {
    const n = item as InlineJson;
    const k = `${cle}-${i}`;
    if (n?.type === "link") {
      const href = chaine(n.href);
      return (
        <a key={k} href={href || undefined} className="rd-lien">
          {rendreInline(n.content, k) || href}
        </a>
      );
    }
    if (typeof n?.text === "string") {
      return <span key={k}>{habiller(n.text, n.styles)}</span>;
    }
    return null;
  });
}

/** Le texte nu d'un contenu en ligne (alt d'image, titre de carte…). */
function texteDe(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((item) => {
      const n = item as InlineJson;
      if (typeof n?.text === "string") return n.text;
      if (n?.type === "link") return texteDe(n.content) || chaine(n.href);
      return "";
    })
    .join("");
}

/* =============================================================================
 * TABLEAUX
 * ========================================================================== */

/** Une cellule est soit un contenu en ligne brut (ancien format), soit un objet
 *  `tableCell` porteur de props. Les deux existent dans la base. */
function cellule(c: unknown): { contenu: unknown; colSpan?: number; rowSpan?: number } {
  if (c && typeof c === "object" && !Array.isArray(c)) {
    const o = c as { type?: string; content?: unknown; props?: Record<string, unknown> };
    if (o.type === "tableCell" || o.props) {
      return {
        contenu: o.content,
        colSpan: nombre(o.props?.["colspan"]) ?? undefined,
        rowSpan: nombre(o.props?.["rowspan"]) ?? undefined,
      };
    }
  }
  return { contenu: c };
}

function RendreTable({ content }: { content: unknown }) {
  const rows = (content as { rows?: unknown[] } | undefined)?.rows;
  if (!Array.isArray(rows) || rows.length === 0) return null;

  // La première rangée sert d'en-tête : c'est ce que fait l'éditeur à l'écran,
  // et un tableau collé dans un devis a presque toujours une ligne de titres.
  const [tete, ...corps] = rows as { cells?: unknown[] }[];
  const cellules = (r: { cells?: unknown[] } | undefined) =>
    Array.isArray(r?.cells) ? r!.cells : [];

  return (
    <div className="rd-table-cadre">
      <table className="rd-table">
        <thead>
          <tr>
            {cellules(tete).map((c, i) => {
              const { contenu, colSpan, rowSpan } = cellule(c);
              return (
                <th key={i} colSpan={colSpan} rowSpan={rowSpan}>
                  {rendreInline(contenu, `th-${i}`)}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {corps.map((r, ir) => (
            <tr key={ir}>
              {cellules(r).map((c, ic) => {
                const { contenu, colSpan, rowSpan } = cellule(c);
                return (
                  <td key={ic} colSpan={colSpan} rowSpan={rowSpan}>
                    {rendreInline(contenu, `td-${ir}-${ic}`)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Table de données typée (bloc métier des notes). Elle n'est PAS proposée dans
 *  un devis, mais un document collé depuis une note peut en porter une : on la
 *  rend en tableau simple plutôt que de la perdre. */
function RendreTableDonnees({ props }: { props: Record<string, unknown> | undefined }) {
  let data: { colonnes?: { id: string; nom: string }[]; lignes?: { valeurs?: Record<string, unknown> }[] };
  try {
    data = JSON.parse(chaine(props?.["data"]) || "{}");
  } catch {
    return null;
  }
  const colonnes = data.colonnes ?? [];
  const lignes = data.lignes ?? [];
  if (colonnes.length === 0) return null;

  const valeur = (v: unknown): string => {
    if (v === null || v === undefined || v === "") return "";
    if (typeof v === "boolean") return v ? "Oui" : "Non";
    return String(v);
  };

  return (
    <div className="rd-table-cadre">
      <table className="rd-table">
        <thead>
          <tr>
            {colonnes.map((c) => (
              <th key={c.id}>{c.nom}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {lignes.map((l, i) => (
            <tr key={i}>
              {colonnes.map((c) => (
                <td key={c.id}>{valeur(l.valeurs?.[c.id])}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* =============================================================================
 * BLOCS
 * ========================================================================== */

const TYPES_LISTE = new Set(["bulletListItem", "numberedListItem", "checkListItem"]);

/**
 * Une liste BlockNote est une SUITE DE BLOCS FRÈRES, pas un `<ul>` : sans ce
 * regroupement, dix puces donnent dix listes d'un élément — et dix fois la
 * marge verticale d'une liste.
 */
function grouper(blocs: BlocJson[]): (BlocJson | { liste: string; items: BlocJson[] })[] {
  const out: (BlocJson | { liste: string; items: BlocJson[] })[] = [];
  for (const b of blocs) {
    const t = chaine(b.type);
    if (TYPES_LISTE.has(t)) {
      const dernier = out[out.length - 1];
      if (dernier && "liste" in dernier && dernier.liste === t) {
        dernier.items.push(b);
        continue;
      }
      out.push({ liste: t, items: [b] });
      continue;
    }
    out.push(b);
  }
  return out;
}

function classeAlignement(props: Record<string, unknown> | undefined): string | undefined {
  const a = chaine(props?.["textAlignment"]);
  return a && a !== "left" ? `rd-al-${a}` : undefined;
}

function RendreBloc({ bloc, cle }: { bloc: BlocJson; cle: string }) {
  const type = chaine(bloc.type) || "paragraph";
  const props = bloc.props;
  const align = classeAlignement(props);
  const enfants = Array.isArray(bloc.children) && bloc.children.length > 0 ? bloc.children : null;
  const sous = enfants ? <div className="rd-enfants">{rendreBlocs(enfants, cle)}</div> : null;

  switch (type) {
    case "heading": {
      const niveau = nombre(props?.["level"]) ?? 1;
      // Le document porte déjà son `<h1>` (le titre du devis) : les titres d'un
      // texte libre commencent donc à h3, pour ne pas casser la hiérarchie.
      const Balise = (niveau <= 1 ? "h3" : niveau === 2 ? "h4" : "h5") as "h3" | "h4" | "h5";
      return (
        <>
          <Balise className={["rd-titre", align].filter(Boolean).join(" ")}>
            {rendreInline(bloc.content, cle)}
          </Balise>
          {sous}
        </>
      );
    }

    case "quote":
      return (
        <>
          <blockquote className={["rd-cit", align].filter(Boolean).join(" ")}>
            {rendreInline(bloc.content, cle)}
          </blockquote>
          {sous}
        </>
      );

    case "codeBlock":
      return (
        <pre className="rd-pre">
          <code>{texteDe(bloc.content)}</code>
        </pre>
      );

    case "table":
      return (
        <>
          <RendreTable content={bloc.content} />
          {sous}
        </>
      );

    case "tableDonnees":
      return <RendreTableDonnees props={props} />;

    case "image": {
      const url = chaine(props?.["url"]);
      if (!url) return null;
      const legende = chaine(props?.["caption"]);
      const largeur = nombre(props?.["previewWidth"]);
      return (
        <figure className={["rd-figure", align].filter(Boolean).join(" ")}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt={legende || ""}
            className="rd-image"
            style={largeur ? { width: `${largeur}px` } : undefined}
          />
          {legende && <figcaption className="rd-legende">{legende}</figcaption>}
        </figure>
      );
    }

    case "video":
    case "audio":
    case "file": {
      // Un média temporel n'a aucun sens sur du papier : on en garde le LIEN,
      // qui reste cliquable dans le PDF et dit ce qui existe.
      const url = chaine(props?.["url"]);
      const nom = chaine(props?.["name"]) || chaine(props?.["caption"]) || "Pièce jointe";
      if (!url) return null;
      return (
        <p className="rd-piece">
          <a href={url} className="rd-lien">
            {nom}
          </a>
        </p>
      );
    }

    case "lienCarte": {
      const url = chaine(props?.["url"]);
      const titre = chaine(props?.["titre"]) || url;
      const desc = chaine(props?.["description"]);
      if (!url && !titre) return null;
      return (
        <p className="rd-carte">
          <a href={url || undefined} className="rd-lien">
            {titre}
          </a>
          {desc && <span className="rd-carte-desc"> — {desc}</span>}
        </p>
      );
    }

    case "pageBreak":
      return <div className="rd-saut" aria-hidden />;

    case "embedHtml":
      // Dit, jamais rendu (voir l'avertissement en tête de fichier).
      return <p className="rd-absent">[ contenu HTML embarqué — non reproduit sur ce document ]</p>;

    default: {
      // Paragraphe, et tout bloc inconnu : on en rend au moins le texte plutôt
      // que de le faire disparaître.
      const inline = rendreInline(bloc.content, cle);
      if (!inline && !sous) return null;
      return (
        <>
          {inline && <p className={["rd-p", align].filter(Boolean).join(" ")}>{inline}</p>}
          {sous}
        </>
      );
    }
  }
}

function rendreBlocs(blocs: unknown[], prefixe = "b"): ReactNode {
  return grouper(blocs as BlocJson[]).map((entree, i) => {
    const cle = `${prefixe}-${i}`;
    if ("liste" in entree) {
      const ordonnee = entree.liste === "numberedListItem";
      const Balise = (ordonnee ? "ol" : "ul") as "ol" | "ul";
      return (
        <Balise key={cle} className={ordonnee ? "rd-ol" : "rd-ul"}>
          {entree.items.map((item, j) => {
            const coche = item.props?.["checked"] === true;
            return (
              <li key={`${cle}-${j}`} className={entree.liste === "checkListItem" ? "rd-li-case" : undefined}>
                {entree.liste === "checkListItem" && (
                  <span className="rd-case" aria-hidden>
                    {coche ? "☑" : "☐"}
                  </span>
                )}
                {rendreInline(item.content, `${cle}-${j}`)}
                {Array.isArray(item.children) && item.children.length > 0 && (
                  <div className="rd-enfants">{rendreBlocs(item.children, `${cle}-${j}`)}</div>
                )}
              </li>
            );
          })}
        </Balise>
      );
    }
    return <RendreBloc key={cle} bloc={entree} cle={cle} />;
  });
}

/**
 * Rend un document BlockNote en HTML statique.
 *
 * `contenu` est du JSON venu de la base : on ne suppose rien de sa forme (une
 * valeur bricolée à la main ne doit pas faire tomber une page publique).
 */
export function DocumentRiche({ contenu, className }: { contenu: unknown; className?: string }) {
  if (!Array.isArray(contenu) || contenu.length === 0) return null;
  return <div className={["rd", className].filter(Boolean).join(" ")}>{rendreBlocs(contenu)}</div>;
}
