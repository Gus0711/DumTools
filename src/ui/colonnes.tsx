"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronUp,
  Columns3,
  Eye,
  EyeOff,
  GripVertical,
  RotateCcw,
} from "lucide-react";
import { cn } from "@/lib/cn";

/* =============================================================================
 * LE RÉGLAGE DES COLONNES — chacun sa table
 *
 * Un tableau de l'appli est lu par des gens qui n'y cherchent pas la même
 * chose : aux achats on regarde le déboursé et le coefficient, en réunion on
 * ne veut que la désignation et le total. Plutôt que d'arbitrer une fois pour
 * toutes dans le code, chaque poste RÈGLE SA TABLE — largeur, ordre,
 * visibilité — et le réglage lui reste (localStorage, comme le thème et la
 * densité).
 *
 * Trois principes :
 *
 *  1. **Le défaut doit être bon.** Le réglage est un ajustement, pas une
 *     configuration obligatoire : une table jamais réglée est déjà lisible, et
 *     « Réinitialiser » y ramène en un clic.
 *  2. **Une colonne SOUPLE prend la place qui reste** (la désignation). Les
 *     autres portent une largeur en pixels. La table remplit donc toujours son
 *     cadre sans mesure JavaScript, et ne défile horizontalement que lorsque
 *     la somme des colonnes fixes ne tient plus.
 *  3. **Le tirage ne re-rend rien.** Les largeurs sont des variables CSS posées
 *     sur un conteneur ; pendant le glissement on écrit dans le DOM, et l'état
 *     React n'est mis à jour qu'au lâcher. Un devis de cent lignes se
 *     redimensionne donc sans à-coup — et plusieurs tables (les lots d'un
 *     devis) partagent le même réglage en héritant des mêmes variables.
 *
 * Au téléphone, `.table-cards` reprend la main : la table devient une pile de
 * cartes, les largeurs ne veulent plus rien dire — mais l'ordre et les colonnes
 * masquées, eux, valent toujours.
 * ========================================================================== */

export interface DefColonne {
  /** Identifiant stable — sert de clé de rendu, de stockage et de variable CSS. */
  cle: string;
  /** Libellé de l'entête. Sert aussi de `data-label` au téléphone. */
  libelle: string;
  /** Largeur par défaut, en pixels. Ignorée par la colonne souple. */
  largeur?: number;
  /** Largeur minimale au tirage (défaut 64 px). */
  min?: number;
  /** LA colonne qui prend la place restante. Une seule par table. */
  souple?: boolean;
  /** Colonne de service (poignée, boutons) : hors du réglage, jamais déplacée. */
  ancree?: boolean;
  /** Toujours affichée — proposée dans la liste, mais l'œil est verrouillé. */
  essentielle?: boolean;
  /** Utile mais pas de premier plan : présente, masquée tant qu'on ne la
   *  demande pas. Le défaut doit être une table qu'on lit, pas tout ce qu'on
   *  sait afficher. */
  masqueeDefaut?: boolean;
  /** Alignement du contenu. Par défaut à gauche. */
  align?: "droite" | "centre";
  /** Texte long : retour à la ligne autorisé (`.cell-wrap`). */
  retourLigne?: boolean;
  /** Contenu coupé à l'ellipse plutôt que débordant sur la colonne voisine. */
  tronque?: boolean;
  /** Cellule de tête de carte au téléphone (`.cell-card-title`), sans libellé. */
  carteTitre?: boolean;
  /** Entête sans libellé visible (colonnes de service). */
  muette?: boolean;
  /** L'entête devient un bouton de tri. Le comparateur reste chez l'appelant :
   *  seule la liste sait ce que « trier par état » veut dire. */
  triable?: boolean;
}

/** Le tri courant d'une table — la colonne, et le sens. */
export interface EtatTri {
  cle: string;
  sens: "asc" | "desc";
}

export type ColonneReglee = DefColonne & { visible: boolean; largeurCourante: number };

interface Reglages {
  v: 1;
  /** Ordre des colonnes réglables (les ancrées gardent leur place). */
  ordre: string[];
  caches: string[];
  largeurs: Record<string, number>;
}

const LARGEUR_DEFAUT = 120;
const MIN_DEFAUT = 64;

/** L'état « jamais réglé » d'une table : l'ordre du code, et les colonnes
 *  d'appoint repliées. C'est lui que « Réinitialiser » restaure. */
function defaut(defs: DefColonne[]): Reglages {
  return {
    v: 1,
    ordre: [],
    caches: defs.filter((d) => d.masqueeDefaut).map((d) => d.cle),
    largeurs: {},
  };
}

function memeReglage(a: Reglages, b: Reglages) {
  return (
    a.ordre.join() === b.ordre.join() &&
    [...a.caches].sort().join() === [...b.caches].sort().join() &&
    JSON.stringify(a.largeurs) === JSON.stringify(b.largeurs)
  );
}

function cleStockage(cle: string) {
  return `dumtools.colonnes.${cle}`;
}

/** `debourse` → `--c-debourse`. Les clés viennent du code, on assainit tout de même. */
function variable(cle: string) {
  return `--c-${cle.replace(/[^a-z0-9_-]/gi, "-")}`;
}

function lire(cle: string, defs: DefColonne[]): Reglages {
  try {
    const brut = window.localStorage.getItem(cleStockage(cle));
    if (!brut) return defaut(defs);
    const j = JSON.parse(brut) as Partial<Reglages>;
    const connues = new Set(defs.map((d) => d.cle));
    // On jette ce qu'on ne reconnaît plus (colonne retirée du code) et on
    // laisse tomber les colonnes nouvelles à leur place d'origine : un réglage
    // enregistré ne doit pas empêcher une colonne ajoutée d'apparaître.
    return {
      v: 1,
      ordre: Array.isArray(j.ordre) ? j.ordre.filter((c) => connues.has(c)) : [],
      caches: Array.isArray(j.caches) ? j.caches.filter((c) => connues.has(c)) : [],
      largeurs:
        j.largeurs && typeof j.largeurs === "object"
          ? Object.fromEntries(
              Object.entries(j.largeurs).filter(
                ([c, v]) => connues.has(c) && typeof v === "number" && v > 0,
              ),
            )
          : {},
    };
  } catch {
    return defaut(defs);
  }
}

/* --- Le réglage est un magasin EXTERNE --------------------------------------
 * `localStorage` n'est pas un état React : le serveur ne le connaît pas, et
 * deux tables réglées sur la même clé (les lots d'un devis, deux onglets
 * ouverts) doivent voir la même chose. On le lit donc comme ce qu'il est —
 * une source extérieure — via `useSyncExternalStore` : le rendu serveur donne
 * le défaut, l'hydratation ne diverge pas, et une écriture prévient tous les
 * abonnés d'un coup.
 * -------------------------------------------------------------------------- */

const cacheClient = new Map<string, Reglages>();
const cacheServeur = new Map<string, Reglages>();
const abonnes = new Map<string, Set<() => void>>();
let ecouteAutresOnglets = false;

function notifier(cle: string) {
  for (const fn of abonnes.get(cle) ?? []) fn();
}

function abonner(cle: string, fn: () => void) {
  let set = abonnes.get(cle);
  if (!set) abonnes.set(cle, (set = new Set()));
  set.add(fn);

  // Un autre onglet qui règle sa table doit se voir ici aussi : sinon les deux
  // écrans se contredisent jusqu'au prochain rechargement.
  if (!ecouteAutresOnglets && typeof window !== "undefined") {
    ecouteAutresOnglets = true;
    window.addEventListener("storage", (e) => {
      if (!e.key?.startsWith("dumtools.colonnes.")) return;
      const c = e.key.slice("dumtools.colonnes.".length);
      cacheClient.delete(c);
      notifier(c);
    });
  }

  return () => {
    set.delete(fn);
  };
}

/** L'instantané courant. Mémorisé : `useSyncExternalStore` exige une référence
 *  stable tant que rien n'a bougé. */
function instantane(cle: string, defs: DefColonne[]): Reglages {
  let r = cacheClient.get(cle);
  if (!r) cacheClient.set(cle, (r = lire(cle, defs)));
  return r;
}

function instantaneServeur(cle: string, defs: DefColonne[]): Reglages {
  let r = cacheServeur.get(cle);
  if (!r) cacheServeur.set(cle, (r = defaut(defs)));
  return r;
}

function ecrire(cle: string, defs: DefColonne[], maj: (r: Reglages) => Reglages) {
  const suivant = maj(instantane(cle, defs));
  cacheClient.set(cle, suivant);
  try {
    // Un réglage revenu au défaut ne laisse rien derrière lui : la table
    // suivra les évolutions du code plutôt qu'un vieux réglage identique.
    if (memeReglage(suivant, defaut(defs))) window.localStorage.removeItem(cleStockage(cle));
    else window.localStorage.setItem(cleStockage(cle), JSON.stringify(suivant));
  } catch {
    /* navigation privée, quota : le réglage vaut pour la session, tant pis. */
  }
  notifier(cle);
}

export interface ApiColonnes {
  /** Toutes les colonnes, dans l'ordre retenu — masquées comprises. */
  colonnes: ColonneReglee[];
  /** Celles à rendre, dans l'ordre. */
  visibles: ColonneReglee[];
  /** À étaler sur l'élément qui porte les largeurs — la table elle-même, ou le
   *  conteneur de plusieurs tables qui partagent le réglage. */
  conteneur: { "data-colonnes": string; style: React.CSSProperties };
  setLargeur: (cle: string, px: number | null) => void;
  ecrireLargeurVive: (cle: string, px: number) => void;
  basculer: (cle: string) => void;
  deplacer: (cle: string, sens: -1 | 1) => void;
  reordonner: (source: string, cible: string) => void;
  reinitialiser: () => void;
  modifie: boolean;
}

/**
 * Le réglage d'une table. `defs` doit être une CONSTANTE de module : c'est
 * l'ordre et les largeurs par défaut, il ne se recalcule pas à chaque rendu.
 */
export function useColonnes(cle: string, defs: DefColonne[]): ApiColonnes {
  const initial = useMemo(() => defaut(defs), [defs]);

  const reglages = useSyncExternalStore(
    useCallback((fn: () => void) => abonner(cle, fn), [cle]),
    useCallback(() => instantane(cle, defs), [cle, defs]),
    useCallback(() => instantaneServeur(cle, defs), [cle, defs]),
  );

  /* --- L'ordre effectif ---------------------------------------------------
   * Les colonnes ANCRÉES (poignée, boutons) gardent leur position d'origine :
   * on ne permute que les emplacements des colonnes réglables entre eux. Une
   * poignée qui se retrouverait au milieu de la table ne rendrait service à
   * personne. */
  const colonnes = useMemo<ColonneReglee[]>(() => {
    const reglables = defs.filter((d) => !d.ancree).map((d) => d.cle);
    const voulu = [
      ...reglages.ordre.filter((c) => reglables.includes(c)),
      ...reglables.filter((c) => !reglages.ordre.includes(c)),
    ];
    const parCle = new Map(defs.map((d) => [d.cle, d]));
    let i = 0;
    return defs.map((d) => {
      const def = d.ancree ? d : parCle.get(voulu[i++])!;
      return {
        ...def,
        visible: !reglages.caches.includes(def.cle),
        largeurCourante:
          reglages.largeurs[def.cle] ?? def.largeur ?? (def.souple ? 0 : LARGEUR_DEFAUT),
      };
    });
  }, [defs, reglages]);

  const visibles = useMemo(() => colonnes.filter((c) => c.visible), [colonnes]);

  /* La largeur minimale de la table : la somme des colonnes fixes plus le
     minimum de la souple. Exprimée en `calc()` DES VARIABLES, elle suit donc le
     tirage sans repasser par React. */
  const style = useMemo<React.CSSProperties>(() => {
    const vars: Record<string, string> = {};
    const termes: string[] = [];
    for (const c of visibles) {
      if (c.souple) {
        termes.push(`${c.min ?? 160}px`);
        continue;
      }
      vars[variable(c.cle)] = `${c.largeurCourante}px`;
      termes.push(`var(${variable(c.cle)})`);
    }
    vars["--tbl-min"] = termes.length ? `calc(${termes.join(" + ")})` : "0px";
    return vars as React.CSSProperties;
  }, [visibles]);

  const conteneur = useMemo(
    () => ({ "data-colonnes": cle, style }) as ApiColonnes["conteneur"],
    [cle, style],
  );

  /** Pendant le glissement : on écrit dans le DOM, pas dans React.
   *  Le conteneur se retrouve par son attribut plutôt que par une ref — une
   *  ref rendue par un hook se lit mal à l'usage (le lint React la signale dès
   *  qu'on passe l'objet entier à un composant) et n'apporte rien ici : le
   *  tirage est un événement, pas un rendu. */
  const ecrireLargeurVive = useCallback(
    (c: string, px: number) => {
      for (const el of document.querySelectorAll<HTMLElement>(`[data-colonnes="${cle}"]`)) {
        el.style.setProperty(variable(c), `${Math.round(px)}px`);
      }
    },
    [cle],
  );

  const setLargeur = useCallback(
    (c: string, px: number | null) => {
      ecrire(cle, defs, (r) => {
        const largeurs = { ...r.largeurs };
        if (px === null) delete largeurs[c];
        else largeurs[c] = Math.round(px);
        return { ...r, largeurs };
      });
    },
    [cle, defs],
  );

  const basculer = useCallback(
    (c: string) => {
      ecrire(cle, defs, (r) => ({
        ...r,
        caches: r.caches.includes(c) ? r.caches.filter((x) => x !== c) : [...r.caches, c],
      }));
    },
    [cle, defs],
  );

  const ordreReglable = useCallback(
    (r: Reglages) => {
      const reglables = defs.filter((d) => !d.ancree).map((d) => d.cle);
      return [
        ...r.ordre.filter((c) => reglables.includes(c)),
        ...reglables.filter((c) => !r.ordre.includes(c)),
      ];
    },
    [defs],
  );

  const deplacer = useCallback(
    (c: string, sens: -1 | 1) => {
      ecrire(cle, defs, (r) => {
        const o = ordreReglable(r);
        const i = o.indexOf(c);
        const j = i + sens;
        if (i < 0 || j < 0 || j >= o.length) return r;
        [o[i], o[j]] = [o[j], o[i]];
        return { ...r, ordre: o };
      });
    },
    [cle, defs, ordreReglable],
  );

  const reordonner = useCallback(
    (source: string, cible: string) => {
      if (source === cible) return;
      ecrire(cle, defs, (r) => {
        const o = ordreReglable(r);
        const i = o.indexOf(source);
        if (i < 0) return r;
        o.splice(i, 1);
        const j = o.indexOf(cible);
        o.splice(j < 0 ? o.length : j, 0, source);
        return { ...r, ordre: o };
      });
    },
    [cle, defs, ordreReglable],
  );

  const reinitialiser = useCallback(() => {
    // Les variables déjà écrites dans le DOM survivraient au retour à l'état
    // par défaut : on les efface, sinon « Réinitialiser » ne rendrait que
    // l'ordre et la visibilité.
    for (const el of document.querySelectorAll<HTMLElement>(`[data-colonnes="${cle}"]`)) {
      for (const d of defs) el.style.removeProperty(variable(d.cle));
    }
    ecrire(cle, defs, () => initial);
  }, [cle, defs, initial]);

  const modifie = !memeReglage(reglages, initial);

  return {
    colonnes,
    visibles,
    conteneur,
    setLargeur,
    ecrireLargeurVive,
    basculer,
    deplacer,
    reordonner,
    reinitialiser,
    modifie,
  };
}

/* -----------------------------------------------------------------------------
 * LE RENDU DE LA TABLE
 * -------------------------------------------------------------------------- */

/** Les classes d'une cellule, déduites de la définition de sa colonne. */
export function classeCellule(c: ColonneReglee, extra?: string): string {
  return cn(
    c.align === "droite" && "cell-droite",
    c.align === "centre" && "cell-num",
    c.retourLigne && "cell-wrap",
    c.tronque && "cell-tronque",
    c.carteTitre && "cell-card-title",
    extra,
  );
}

/** Le `data-label` du repli mobile — les colonnes de service n'en ont pas. */
export function labelCellule(c: ColonneReglee): string | undefined {
  return c.muette || c.carteTitre ? undefined : c.libelle;
}

/** Les largeurs, en `<colgroup>`. La colonne souple n'en porte pas : elle prend
 *  ce qui reste. */
export function ColgroupColonnes({ colonnes }: { colonnes: ColonneReglee[] }) {
  return (
    <colgroup>
      {colonnes.map((c) => (
        <col
          key={c.cle}
          style={c.souple ? undefined : { width: `var(${variable(c.cle)})` }}
        />
      ))}
    </colgroup>
  );
}

/** L'entête : le libellé (bouton de tri s'il y a lieu), et le bord qui se tire. */
export function EnteteColonnes({
  colonnes,
  api,
  tri,
  onTri,
}: {
  colonnes: ColonneReglee[];
  api: ApiColonnes;
  tri?: EtatTri;
  onTri?: (cle: string) => void;
}) {
  return (
    <thead>
      <tr>
        {colonnes.map((c) => {
          const trieSur = tri?.cle === c.cle;
          return (
            <th
              key={c.cle}
              scope="col"
              className={classeCellule(c)}
              aria-sort={
                !c.triable || !onTri
                  ? undefined
                  : trieSur
                    ? tri!.sens === "asc"
                      ? "ascending"
                      : "descending"
                    : "none"
              }
            >
              {c.muette ? (
                <span className="sr-only">{c.libelle}</span>
              ) : c.triable && onTri ? (
                <button
                  type="button"
                  onClick={() => onTri(c.cle)}
                  className={cn(
                    "inline-flex max-w-full items-center gap-1 transition-colors hover:text-fg",
                    trieSur && "text-fg",
                  )}
                  title={`Trier par ${c.libelle.toLowerCase()}`}
                >
                  <span className="truncate">{c.libelle}</span>
                  {trieSur &&
                    (tri!.sens === "asc" ? (
                      <ChevronUp className="h-3 w-3 shrink-0" />
                    ) : (
                      <ChevronDown className="h-3 w-3 shrink-0" />
                    ))}
                </button>
              ) : (
                c.libelle
              )}
              {!c.souple && <PoigneeLargeur colonne={c} api={api} />}
            </th>
          );
        })}
      </tr>
    </thead>
  );
}

/** Bascule asc/desc, ou change de colonne. Le premier clic sur une colonne
 *  neuve part dans le sens qu'on attend d'elle (le texte de A à Z, les nombres
 *  et les dates du plus grand au plus petit). */
export function basculerTri(
  tri: EtatTri,
  cle: string,
  sensInitial: (cle: string) => "asc" | "desc" = () => "asc",
): EtatTri {
  if (tri.cle === cle) return { cle, sens: tri.sens === "asc" ? "desc" : "asc" };
  return { cle, sens: sensInitial(cle) };
}

/**
 * La poignée de largeur — le bord droit de l'entête.
 *
 * Au pointeur, on écrit la variable CSS directement (aucun rendu React) et on
 * ne fige la valeur qu'au lâcher. Au clavier, les flèches règlent par pas de
 * 16 px : un tableau qui ne se règle qu'à la souris n'est pas réglable.
 * Double-clic = retour à la largeur d'origine de CETTE colonne.
 */
function PoigneeLargeur({ colonne, api }: { colonne: ColonneReglee; api: ApiColonnes }) {
  const depart = useRef<{ x: number; w: number } | null>(null);
  const min = colonne.min ?? MIN_DEFAUT;

  return (
    <span
      role="separator"
      aria-orientation="vertical"
      aria-label={`Largeur de la colonne ${colonne.libelle}`}
      tabIndex={0}
      className="poignee-colonne"
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        e.currentTarget.setPointerCapture(e.pointerId);
        depart.current = { x: e.clientX, w: colonne.largeurCourante };
        document.documentElement.classList.add("redim-colonne");
      }}
      onPointerMove={(e) => {
        const d = depart.current;
        if (!d) return;
        api.ecrireLargeurVive(colonne.cle, Math.max(min, d.w + (e.clientX - d.x)));
      }}
      onPointerUp={(e) => {
        const d = depart.current;
        depart.current = null;
        document.documentElement.classList.remove("redim-colonne");
        if (!d) return;
        e.currentTarget.releasePointerCapture(e.pointerId);
        api.setLargeur(colonne.cle, Math.max(min, d.w + (e.clientX - d.x)));
      }}
      onPointerCancel={() => {
        depart.current = null;
        document.documentElement.classList.remove("redim-colonne");
      }}
      onDoubleClick={() => api.setLargeur(colonne.cle, null)}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
          e.preventDefault();
          const pas = e.key === "ArrowLeft" ? -16 : 16;
          api.setLargeur(colonne.cle, Math.max(min, colonne.largeurCourante + pas));
        }
        if (e.key === "Escape") api.setLargeur(colonne.cle, null);
      }}
    />
  );
}

/* -----------------------------------------------------------------------------
 * LE PANNEAU DE RÉGLAGE
 * -------------------------------------------------------------------------- */

type Coords = { top: number; left: number; maxHeight: number };

/** Le bouton « Colonnes » et son panneau — à poser dans l'entête du bloc. */
export function ReglageColonnes({
  api,
  className,
  libelle = "Colonnes",
}: {
  api: ApiColonnes;
  className?: string;
  libelle?: string;
}) {
  const [ouvert, setOuvert] = useState(false);
  const [coords, setCoords] = useState<Coords | null>(null);
  const bouton = useRef<HTMLButtonElement>(null);
  const panneau = useRef<HTMLDivElement>(null);
  const drag = useRef<string | null>(null);
  const [survol, setSurvol] = useState<string | null>(null);

  const reglables = api.colonnes.filter((c) => !c.ancree);
  const nbMasquees = reglables.filter((c) => !c.visible).length;

  // Le panneau flotte au-dessus du plan (portail + position fixe) : il vit
  // sinon dans le conteneur à défilement de la table, qui le rognerait.
  useLayoutEffect(() => {
    if (!ouvert) return;
    const place = () => {
      const el = bouton.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const largeur = 288;
      setCoords({
        top: r.bottom + 6,
        left: Math.max(8, Math.min(r.right - largeur, window.innerWidth - largeur - 8)),
        maxHeight: Math.max(200, window.innerHeight - r.bottom - 24),
      });
    };
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [ouvert]);

  useEffect(() => {
    if (!ouvert) return;
    const dehors = (e: PointerEvent) => {
      const c = e.target as Node;
      if (panneau.current?.contains(c) || bouton.current?.contains(c)) return;
      setOuvert(false);
    };
    const echap = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOuvert(false);
    };
    document.addEventListener("pointerdown", dehors);
    document.addEventListener("keydown", echap);
    return () => {
      document.removeEventListener("pointerdown", dehors);
      document.removeEventListener("keydown", echap);
    };
  }, [ouvert]);

  return (
    <>
      <button
        ref={bouton}
        type="button"
        onClick={() => setOuvert((o) => !o)}
        aria-expanded={ouvert}
        title="Choisir, ordonner et dimensionner les colonnes (réglage personnel)"
        className={cn(
          "press inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 text-sm font-medium text-muted",
          "transition-[background-color,border-color,color] duration-150 hover:border-brand/45 hover:bg-surface-2 hover:text-fg",
          ouvert && "border-brand/45 bg-surface-2 text-fg",
          className,
        )}
      >
        <Columns3 className="h-4 w-4" />
        <span className="hidden sm:inline">{libelle}</span>
        {nbMasquees > 0 && (
          <span className="rounded bg-surface-2 px-1 font-mono text-[0.68rem] tabular-nums text-muted">
            −{nbMasquees}
          </span>
        )}
      </button>

      {ouvert &&
        coords &&
        createPortal(
          <div
            ref={panneau}
            className="fixed z-[100] w-72 overflow-auto rounded-md border border-border bg-surface shadow-lg"
            style={{ top: coords.top, left: coords.left, maxHeight: coords.maxHeight }}
          >
            <div className="flex items-center gap-2 border-b border-hairline bg-surface-2 px-3 py-2">
              <span className="stamp flex-1">Colonnes</span>
              {api.modifie && (
                <button
                  type="button"
                  onClick={api.reinitialiser}
                  className="inline-flex items-center gap-1 text-xs text-muted transition-colors hover:text-fg"
                >
                  <RotateCcw className="h-3 w-3" /> Réinitialiser
                </button>
              )}
            </div>

            <ul className="py-1">
              {reglables.map((c, i) => (
                <li
                  key={c.cle}
                  draggable
                  onDragStart={() => (drag.current = c.cle)}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setSurvol(c.cle);
                  }}
                  onDragLeave={() => setSurvol((s) => (s === c.cle ? null : s))}
                  onDrop={() => {
                    if (drag.current) api.reordonner(drag.current, c.cle);
                    drag.current = null;
                    setSurvol(null);
                  }}
                  onDragEnd={() => {
                    drag.current = null;
                    setSurvol(null);
                  }}
                  className={cn(
                    "flex items-center gap-1 px-2 py-1 text-sm",
                    survol === c.cle && "bg-brand-soft",
                    !c.visible && "opacity-55",
                  )}
                >
                  <GripVertical className="h-3.5 w-3.5 shrink-0 cursor-grab text-subtle active:cursor-grabbing" />
                  <span className="min-w-0 flex-1 truncate text-fg">{c.libelle}</span>

                  {/* Les flèches ne sont pas un doublon du glisser : au doigt,
                      le glisser-déposer HTML5 ne fonctionne pas. */}
                  <button
                    type="button"
                    disabled={i === 0}
                    onClick={() => api.deplacer(c.cle, -1)}
                    title="Monter"
                    className="p-1 text-subtle transition-colors hover:text-fg disabled:opacity-25"
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    disabled={i === reglables.length - 1}
                    onClick={() => api.deplacer(c.cle, 1)}
                    title="Descendre"
                    className="p-1 text-subtle transition-colors hover:text-fg disabled:opacity-25"
                  >
                    <ArrowDown className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    disabled={c.essentielle || c.souple}
                    onClick={() => api.basculer(c.cle)}
                    title={
                      c.essentielle || c.souple
                        ? "Cette colonne porte la ligne : elle reste affichée"
                        : c.visible
                          ? "Masquer"
                          : "Afficher"
                    }
                    className={cn(
                      "p-1 transition-colors disabled:opacity-25",
                      c.visible ? "text-brand hover:text-brand-strong" : "text-subtle hover:text-fg",
                    )}
                  >
                    {c.visible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                  </button>
                </li>
              ))}
            </ul>

            <p className="border-t border-hairline px-3 py-2 text-xs leading-snug text-subtle">
              Glisser pour ordonner. La largeur se tire au bord de l&apos;entête —
              double-clic pour la remettre. Réglage personnel, gardé sur ce poste.
            </p>
          </div>,
          document.body,
        )}
    </>
  );
}
