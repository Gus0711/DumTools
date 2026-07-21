"use client";

import { useMemo, useRef, useState, useTransition, type DragEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronRight,
  FileText,
  Folder,
  FolderOpen,
  GripVertical,
  Loader2,
  Plus,
  Search,
} from "lucide-react";
import { Input } from "@/ui";
import { creerPage, deplacerPage } from "./actions";
import type { WikiNoeudArbre, WikiTagLite } from "./queries";

/* Arborescence des pages d'une rubrique (façon Notion) : repliable, dossiers
 * (page ayant des enfants), création de sous-page en survol, et glisser-déposer
 * pour reparenter (déposer AU MILIEU d'une ligne) ou réordonner (déposer en HAUT
 * / BAS d'une ligne). Quand une recherche est saisie, on bascule sur une liste à
 * plat des correspondances (titre / résumé / auteur / tags) avec leur chemin. */

/** Zone de dépôt calculée depuis la position du curseur dans une ligne. */
type Zone = "avant" | "dans" | "apres";
interface Cible {
  id: string;
  zone: Zone;
}

function fmtRelatif(d: Date): string {
  const date = new Date(d);
  const min = Math.round((Date.now() - date.getTime()) / 60_000);
  if (min < 1) return "à l’instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `il y a ${h} h`;
  const j = Math.round(h / 24);
  if (j === 1) return "hier";
  if (j < 7) return `il y a ${j} j`;
  return date.toLocaleDateString("fr-FR");
}

function Pastille({ tag }: { tag: WikiTagLite }) {
  return (
    <span
      className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[0.65rem] font-medium text-white"
      style={{ backgroundColor: tag.couleur }}
    >
      {tag.nom}
    </span>
  );
}

export function ArbrePagesRubrique({
  rubriqueId,
  rubriqueSlug,
  noeuds,
}: {
  rubriqueId: string;
  rubriqueSlug: string;
  noeuds: WikiNoeudArbre[];
}) {
  const router = useRouter();
  const [recherche, setRecherche] = useState("");
  // Tout déplié par défaut : on découvre mieux une base de connaissances ouverte.
  const [ouverts, setOuverts] = useState<Set<string>>(() => new Set(noeuds.map((n) => n.id)));
  const [pending, start] = useTransition();

  // Glisser-déposer.
  const [drague, setDrague] = useState<string | null>(null);
  const [cible, setCible] = useState<Cible | null>(null);

  // Index : nœud par id, enfants triés par parent (ordre serveur préservé).
  const { parId, enfantsDe, racines } = useMemo(() => {
    const parId = new Map<string, WikiNoeudArbre>();
    const enfantsDe = new Map<string | null, WikiNoeudArbre[]>();
    for (const n of noeuds) {
      parId.set(n.id, n);
      const liste = enfantsDe.get(n.parentId) ?? [];
      liste.push(n);
      enfantsDe.set(n.parentId, liste);
    }
    return { parId, enfantsDe, racines: enfantsDe.get(null) ?? [] };
  }, [noeuds]);

  const descendants = (id: string): Set<string> => {
    const out = new Set<string>();
    const pile = [id];
    while (pile.length) {
      for (const e of enfantsDe.get(pile.pop()!) ?? []) {
        out.add(e.id);
        pile.push(e.id);
      }
    }
    return out;
  };

  const cheminDe = (id: string): string => {
    const parts: string[] = [];
    let cur = parId.get(id)?.parentId ?? null;
    let garde = 0;
    while (cur && garde++ < 50) {
      parts.unshift(parId.get(cur)?.titre || "Sans titre");
      cur = parId.get(cur)?.parentId ?? null;
    }
    return parts.join(" › ");
  };

  const basculer = (id: string) =>
    setOuverts((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const creerSousPage = (parentId: string) => {
    setOuverts((s) => new Set(s).add(parentId));
    start(async () => {
      await creerPage(rubriqueId, parentId);
    });
  };

  /** Applique un dépôt : calcule (parent, ordre des frères) et persiste. */
  const deposer = (surId: string, zone: Zone) => {
    const src = drague;
    setDrague(null);
    setCible(null);
    if (!src || src === surId) return;
    // Interdit : se déposer dans son propre sous-arbre.
    if (descendants(src).has(surId)) return;

    let parentCible: string | null;
    let freres: WikiNoeudArbre[];
    let indexInsertion: number;

    if (zone === "dans") {
      parentCible = surId;
      freres = (enfantsDe.get(surId) ?? []).filter((n) => n.id !== src);
      indexInsertion = freres.length; // append en fin
    } else {
      const surNoeud = parId.get(surId);
      if (!surNoeud) return;
      parentCible = surNoeud.parentId;
      freres = (enfantsDe.get(parentCible) ?? []).filter((n) => n.id !== src);
      const iSur = freres.findIndex((n) => n.id === surId);
      indexInsertion = zone === "avant" ? iSur : iSur + 1;
    }

    const ordreIds = [
      ...freres.slice(0, indexInsertion).map((n) => n.id),
      src,
      ...freres.slice(indexInsertion).map((n) => n.id),
    ];
    start(async () => {
      await deplacerPage(src, parentCible, ordreIds);
      router.refresh();
    });
  };

  /* --- Recherche à plat ------------------------------------------------------ */
  const q = recherche.trim().toLowerCase();
  const resultats = useMemo(() => {
    if (!q) return null;
    return noeuds.filter((n) => {
      const foin = `${n.titre} ${n.resume} ${n.auteur ?? ""} ${n.tags.map((t) => t.nom).join(" ")}`;
      return foin.toLowerCase().includes(q);
    });
  }, [noeuds, q]);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" />
          <Input
            type="search"
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            placeholder="Filtrer dans cette rubrique…"
            className="pl-9"
          />
        </div>
        {noeuds.length > 0 && (
          <p className="text-sm text-subtle">
            {resultats
              ? `${resultats.length} / ${noeuds.length} page${noeuds.length > 1 ? "s" : ""}`
              : `${noeuds.length} page${noeuds.length > 1 ? "s" : ""}`}
          </p>
        )}
        {pending && <Loader2 className="h-4 w-4 animate-spin text-subtle" />}
      </div>

      {noeuds.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-surface p-12 text-center">
          <FileText className="mx-auto h-8 w-8 text-subtle" />
          <p className="mt-3 text-muted">
            Aucune page dans cette rubrique. Créez la première avec « Nouvelle page ».
          </p>
        </div>
      ) : resultats ? (
        /* --- Vue liste (recherche active) ------------------------------------ */
        resultats.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-surface p-12 text-center">
            <p className="text-muted">Aucune page ne correspond au filtre.</p>
          </div>
        ) : (
          <ul className="overflow-hidden rounded-lg border border-border bg-surface">
            {resultats.map((n) => (
              <li key={n.id} className="border-b border-border-soft last:border-0">
                <Link
                  href={`/outils/wiki/${rubriqueSlug}/${n.id}`}
                  className="group flex items-start gap-2 px-3 py-2.5 hover:bg-surface-2"
                >
                  <FileText className="mt-0.5 h-4 w-4 shrink-0 text-subtle" />
                  <span className="min-w-0 flex-1">
                    {cheminDe(n.id) && (
                      <span className="block truncate text-[0.7rem] text-subtle">{cheminDe(n.id)}</span>
                    )}
                    <span className="block truncate font-medium text-fg group-hover:text-brand">
                      {n.titre || "Sans titre"}
                    </span>
                    {n.resume && (
                      <span className="mt-0.5 block truncate text-xs text-subtle">{n.resume}</span>
                    )}
                  </span>
                  {n.tags.length > 0 && (
                    <span className="hidden shrink-0 flex-wrap justify-end gap-1 sm:flex">
                      {n.tags.slice(0, 3).map((t) => (
                        <Pastille key={t.id} tag={t} />
                      ))}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )
      ) : (
        /* --- Vue arbre ------------------------------------------------------- */
        <div
          className="overflow-hidden rounded-lg border border-border bg-surface"
          onDragOver={(e) => {
            // Zone « racine » : survol sous les lignes → déplacer à la fin des racines.
            if (drague && e.target === e.currentTarget) {
              e.preventDefault();
              setCible(null);
            }
          }}
          onDrop={(e) => {
            if (drague && e.target === e.currentTarget) {
              const dernier = racines.filter((n) => n.id !== drague).at(-1);
              deposer(dernier ? dernier.id : drague, dernier ? "apres" : "dans");
            }
          }}
        >
          {racines.map((n) => (
            <Rangee
              key={n.id}
              noeud={n}
              profondeur={0}
              enfantsDe={enfantsDe}
              ouverts={ouverts}
              rubriqueSlug={rubriqueSlug}
              drague={drague}
              cible={cible}
              interdits={drague ? descendants(drague) : null}
              onBasculer={basculer}
              onCreerSousPage={creerSousPage}
              onDragStart={setDrague}
              onDragEndGlobal={() => {
                setDrague(null);
                setCible(null);
              }}
              onSurvol={setCible}
              onDeposer={deposer}
            />
          ))}
        </div>
      )}

      {!resultats && noeuds.length > 0 && (
        <p className="mt-3 px-1 text-xs text-subtle">
          Glissez une page sur une autre pour la ranger dedans, ou entre deux pour la réordonner.
        </p>
      )}
    </>
  );
}

/* --- Rangée récursive -------------------------------------------------------- */

function Rangee({
  noeud,
  profondeur,
  enfantsDe,
  ouverts,
  rubriqueSlug,
  drague,
  cible,
  interdits,
  onBasculer,
  onCreerSousPage,
  onDragStart,
  onDragEndGlobal,
  onSurvol,
  onDeposer,
}: {
  noeud: WikiNoeudArbre;
  profondeur: number;
  enfantsDe: Map<string | null, WikiNoeudArbre[]>;
  ouverts: Set<string>;
  rubriqueSlug: string;
  drague: string | null;
  cible: Cible | null;
  interdits: Set<string> | null;
  onBasculer: (id: string) => void;
  onCreerSousPage: (parentId: string) => void;
  onDragStart: (id: string) => void;
  onDragEndGlobal: () => void;
  onSurvol: (c: Cible | null) => void;
  onDeposer: (surId: string, zone: Zone) => void;
}) {
  const ligneRef = useRef<HTMLDivElement>(null);
  const enfants = enfantsDe.get(noeud.id) ?? [];
  const aEnfants = enfants.length > 0;
  const ouvert = ouverts.has(noeud.id);
  const estDrague = drague === noeud.id;
  const interdit = interdits?.has(noeud.id) ?? false;
  const montreCible = cible?.id === noeud.id && !interdit && drague !== noeud.id;

  const calcZone = (e: DragEvent): Zone => {
    const r = ligneRef.current?.getBoundingClientRect();
    if (!r) return "dans";
    const y = e.clientY - r.top;
    if (y < r.height * 0.3) return "avant";
    if (y > r.height * 0.7) return "apres";
    return "dans";
  };

  return (
    <div>
      <div
        ref={ligneRef}
        draggable
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = "move";
          onDragStart(noeud.id);
        }}
        onDragEnd={onDragEndGlobal}
        onDragOver={(e) => {
          if (!drague || interdit || drague === noeud.id) return;
          e.preventDefault();
          e.stopPropagation();
          onSurvol({ id: noeud.id, zone: calcZone(e) });
        }}
        onDragLeave={(e) => {
          e.stopPropagation();
        }}
        onDrop={(e) => {
          if (!drague || interdit || drague === noeud.id) return;
          e.preventDefault();
          e.stopPropagation();
          onDeposer(noeud.id, calcZone(e));
        }}
        style={{ paddingLeft: `${profondeur * 1.25 + 0.5}rem` }}
        className={`group relative flex items-center gap-1.5 border-b border-border-soft pr-2 transition-colors last:border-0 ${
          estDrague ? "opacity-40" : ""
        } ${montreCible && cible?.zone === "dans" ? "bg-brand-soft" : "hover:bg-surface-2"}`}
      >
        {/* Repères de dépôt avant / après. */}
        {montreCible && cible?.zone === "avant" && (
          <span className="pointer-events-none absolute inset-x-0 top-0 h-0.5 bg-brand" />
        )}
        {montreCible && cible?.zone === "apres" && (
          <span className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 bg-brand" />
        )}

        <GripVertical className="h-3.5 w-3.5 shrink-0 cursor-grab text-transparent group-hover:text-subtle" />

        {aEnfants ? (
          <button
            type="button"
            onClick={() => onBasculer(noeud.id)}
            className="shrink-0 rounded p-0.5 text-subtle hover:bg-surface-3 hover:text-fg"
            aria-label={ouvert ? "Replier" : "Déplier"}
          >
            <ChevronRight className={`h-4 w-4 transition-transform ${ouvert ? "rotate-90" : ""}`} />
          </button>
        ) : (
          <span className="w-5 shrink-0" />
        )}

        <span className="shrink-0 text-subtle">
          {aEnfants ? (
            ouvert ? (
              <FolderOpen className="h-4 w-4" />
            ) : (
              <Folder className="h-4 w-4" />
            )
          ) : (
            <FileText className="h-4 w-4" />
          )}
        </span>

        <Link
          href={`/outils/wiki/${rubriqueSlug}/${noeud.id}`}
          className="min-w-0 flex-1 py-2"
          title={noeud.resume || undefined}
        >
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate font-medium text-fg group-hover:text-brand">
              {noeud.titre || "Sans titre"}
            </span>
            {aEnfants && (
              <span className="shrink-0 rounded-full bg-surface-3 px-1.5 text-[0.65rem] font-medium text-subtle">
                {enfants.length}
              </span>
            )}
            {noeud.tags.slice(0, 2).map((t) => (
              <span key={t.id} className="hidden shrink-0 md:inline">
                <Pastille tag={t} />
              </span>
            ))}
          </span>
          {noeud.resume && (
            <span className="mt-0.5 block truncate text-xs text-subtle">{noeud.resume}</span>
          )}
        </Link>

        <span className="hidden shrink-0 items-center gap-2 text-xs text-subtle sm:flex">
          <span suppressHydrationWarning>{fmtRelatif(noeud.updatedAt)}</span>
          <button
            type="button"
            onClick={() => onCreerSousPage(noeud.id)}
            className="rounded p-1 text-subtle opacity-0 transition-opacity hover:bg-surface-3 hover:text-brand group-hover:opacity-100"
            title="Nouvelle sous-page ici"
            aria-label="Nouvelle sous-page"
          >
            <Plus className="h-4 w-4" />
          </button>
        </span>
      </div>

      {aEnfants && ouvert && (
        <div>
          {enfants.map((e) => (
            <Rangee
              key={e.id}
              noeud={e}
              profondeur={profondeur + 1}
              enfantsDe={enfantsDe}
              ouverts={ouverts}
              rubriqueSlug={rubriqueSlug}
              drague={drague}
              cible={cible}
              interdits={interdits}
              onBasculer={onBasculer}
              onCreerSousPage={onCreerSousPage}
              onDragStart={onDragStart}
              onDragEndGlobal={onDragEndGlobal}
              onSurvol={onSurvol}
              onDeposer={onDeposer}
            />
          ))}
        </div>
      )}
    </div>
  );
}
