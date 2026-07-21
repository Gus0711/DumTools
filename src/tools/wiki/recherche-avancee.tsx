"use client";

import { type ReactNode, useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { Check, FileText, Loader2, Minus, RotateCcw, Search, Tag, X } from "lucide-react";
import { rechercherWiki } from "./actions";
import { segmentsSurlignes, type FiltresWiki } from "./model";
import type {
  FacetteAuteur,
  FacetteRubrique,
  FacetteTag,
  OptionsRecherche,
  WikiResultatRecherche,
} from "./queries";

/* Recherche à facettes du wiki (docs/RECHERCHE-WIKI.md, Étape 1). Les tags sont
 * une DIMENSION STRUCTURÉE : chaque chip cycle neutre → inclure (ET/OU) → exclure
 * (SANS), sans syntaxe à apprendre (modèle Notion/Linear). Rubrique et auteur =
 * facettes mono-sélection. Le tout se combine à la barre plein-texte ; chaque
 * changement rejoue la recherche serveur (débouncée), qui filtre d'abord par les
 * facettes puis classe par pertinence. */

type EtatTag = "inc" | "exc";

/* --- Surlignage des extraits (identique à la barre rapide) -------------------- */
function Extrait({ texte }: { texte: string }) {
  return (
    <>
      {segmentsSurlignes(texte).map((s, i) =>
        s.fort ? (
          <mark key={i} className="rounded bg-accent-soft px-0.5 font-medium text-fg">
            {s.texte}
          </mark>
        ) : (
          <span key={i}>{s.texte}</span>
        ),
      )}
    </>
  );
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

/* --- Construit les filtres serveur depuis l'état des facettes ----------------- */
function construireFiltres(
  etats: Map<string, EtatTag>,
  modeTags: "et" | "ou",
  rubriqueSlug: string | null,
  auteurId: string | null,
): FiltresWiki {
  const inc: string[] = [];
  const exc: string[] = [];
  for (const [slug, etat] of etats) (etat === "inc" ? inc : exc).push(slug);
  return {
    tagsEt: modeTags === "et" ? inc : [],
    tagsOu: modeTags === "ou" ? inc : [],
    tagsSauf: exc,
    rubriqueSlug: rubriqueSlug ?? undefined,
    auteurId: auteurId ?? undefined,
  };
}

function aDesFacettes(f: FiltresWiki): boolean {
  return Boolean(
    f.tagsEt?.length || f.tagsOu?.length || f.tagsSauf?.length || f.rubriqueSlug || f.auteurId,
  );
}

/* --- Chip de tag tri-état ----------------------------------------------------- */
function ChipTag({
  tag,
  etat,
  onClic,
}: {
  tag: FacetteTag;
  etat: EtatTag | undefined;
  onClic: () => void;
}) {
  const base =
    "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors";
  if (etat === "inc") {
    return (
      <button
        type="button"
        onClick={onClic}
        aria-pressed
        title="Inclus — cliquer pour exclure"
        className={`${base} text-white`}
        style={{ backgroundColor: tag.couleur }}
      >
        <Check className="h-3 w-3" />
        {tag.nom}
      </button>
    );
  }
  if (etat === "exc") {
    return (
      <button
        type="button"
        onClick={onClic}
        aria-pressed
        title="Exclu — cliquer pour retirer le filtre"
        className={`${base} border border-danger/40 bg-danger/10 text-danger line-through`}
      >
        <Minus className="h-3 w-3" />
        {tag.nom}
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={onClic}
      title="Cliquer pour inclure"
      className={`${base} bg-surface-2 text-muted hover:text-fg`}
    >
      {tag.nom}
      <span className="text-[0.65rem] text-subtle">{tag.nbPages}</span>
    </button>
  );
}

/* --- Résultat ----------------------------------------------------------------- */
function LigneResultat({ r }: { r: WikiResultatRecherche }) {
  return (
    <li>
      <Link
        href={`/outils/wiki/${r.rubriqueSlug}/${r.id}`}
        className="group flex items-start gap-3 px-4 py-3 transition-colors hover:bg-surface-2"
      >
        <FileText className="mt-0.5 h-4 w-4 shrink-0 text-subtle" />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="truncate font-medium text-fg group-hover:text-brand">
              {r.titre || "Sans titre"}
            </span>
            <span className="shrink-0 rounded bg-surface-2 px-1.5 py-0.5 text-[0.7rem] font-medium text-muted">
              {r.rubriqueNom}
            </span>
          </span>
          {r.extrait ? (
            <span className="mt-0.5 block text-sm text-muted">
              <Extrait texte={r.extrait} />
            </span>
          ) : r.resume ? (
            <span className="mt-0.5 block truncate text-sm text-muted">{r.resume}</span>
          ) : null}
          {r.tags.length > 0 && (
            <span className="mt-1.5 flex flex-wrap gap-1">
              {r.tags.map((t) => (
                <span
                  key={t.id}
                  className="inline-flex items-center rounded-full px-2 py-0.5 text-[0.7rem] font-medium text-white"
                  style={{ backgroundColor: t.couleur }}
                >
                  {t.nom}
                </span>
              ))}
            </span>
          )}
        </span>
        <span className="mt-0.5 shrink-0 text-xs text-subtle" suppressHydrationWarning>
          {fmtRelatif(r.updatedAt)}
        </span>
      </Link>
    </li>
  );
}

/* --- Bloc de facette (titre + contenu) --------------------------------------- */
function Bloc({ titre, children }: { titre: ReactNode; children: ReactNode }) {
  return (
    <div className="border-b border-border-soft px-4 py-3 last:border-b-0">
      <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-subtle">
        {titre}
      </p>
      {children}
    </div>
  );
}

export function RechercheAvanceeWiki({ catalogue }: { catalogue: OptionsRecherche }) {
  const [q, setQ] = useState("");
  const [etats, setEtats] = useState<Map<string, EtatTag>>(new Map());
  const [modeTags, setModeTags] = useState<"et" | "ou">("et");
  const [rubriqueSlug, setRubriqueSlug] = useState<string | null>(null);
  const [auteurId, setAuteurId] = useState<string | null>(null);
  const [rep, setRep] = useState<{ cle: string; res: WikiResultatRecherche[] } | null>(null);
  const [pending, start] = useTransition();

  const filtres = useMemo(
    () => construireFiltres(etats, modeTags, rubriqueSlug, auteurId),
    [etats, modeTags, rubriqueSlug, auteurId],
  );

  const requete = q.trim();
  const actif = requete.length >= 2 || aDesFacettes(filtres);
  const cleCourante = JSON.stringify({ requete, filtres });

  useEffect(() => {
    if (!actif) {
      setRep(null);
      return;
    }
    const t = setTimeout(() => {
      start(async () => {
        const res = await rechercherWiki(requete, filtres);
        setRep({ cle: cleCourante, res });
      });
    }, 220);
    return () => clearTimeout(t);
    // cleCourante encode requete + filtres → dépendance unique et stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cleCourante, actif]);

  const resultats = rep && rep.cle === cleCourante ? rep.res : null;
  const nbInc = [...etats.values()].filter((e) => e === "inc").length;

  function cyclerTag(slug: string) {
    setEtats((prev) => {
      const suivant = new Map(prev);
      const etat = suivant.get(slug);
      if (etat === undefined) suivant.set(slug, "inc");
      else if (etat === "inc") suivant.set(slug, "exc");
      else suivant.delete(slug);
      return suivant;
    });
  }

  function reinitialiser() {
    setQ("");
    setEtats(new Map());
    setRubriqueSlug(null);
    setAuteurId(null);
  }

  const aQuelqueChose = requete.length > 0 || aDesFacettes(filtres);

  return (
    <div className="grid gap-6 lg:grid-cols-[17rem_1fr]">
      {/* --- Facettes --- */}
      <aside className="lg:sticky lg:top-4 lg:self-start">
        <div className="overflow-hidden rounded-xl border border-border bg-surface">
          <div className="flex items-center justify-between border-b border-border-soft px-4 py-3">
            <span className="text-sm font-semibold text-fg">Filtres</span>
            {aQuelqueChose && (
              <button
                type="button"
                onClick={reinitialiser}
                className="inline-flex items-center gap-1 text-xs font-medium text-subtle transition-colors hover:text-brand"
              >
                <RotateCcw className="h-3 w-3" />
                Réinitialiser
              </button>
            )}
          </div>

          {/* Tags */}
          <Bloc
            titre={
              <>
                <Tag className="h-3.5 w-3.5" />
                Tags
              </>
            }
          >
            {catalogue.tags.length === 0 ? (
              <p className="text-xs text-subtle">Aucun tag pour l’instant.</p>
            ) : (
              <>
                {nbInc >= 2 && (
                  <div className="mb-2 inline-flex overflow-hidden rounded-lg border border-border text-xs">
                    <button
                      type="button"
                      onClick={() => setModeTags("et")}
                      className={`px-2.5 py-1 font-medium transition-colors ${
                        modeTags === "et" ? "bg-brand text-brand-fg" : "text-muted hover:text-fg"
                      }`}
                    >
                      Tous (ET)
                    </button>
                    <button
                      type="button"
                      onClick={() => setModeTags("ou")}
                      className={`px-2.5 py-1 font-medium transition-colors ${
                        modeTags === "ou" ? "bg-brand text-brand-fg" : "text-muted hover:text-fg"
                      }`}
                    >
                      Au moins un (OU)
                    </button>
                  </div>
                )}
                <div className="flex flex-wrap gap-1.5">
                  {catalogue.tags.map((t) => (
                    <ChipTag
                      key={t.slug}
                      tag={t}
                      etat={etats.get(t.slug)}
                      onClic={() => cyclerTag(t.slug)}
                    />
                  ))}
                </div>
                <p className="mt-2 text-[0.7rem] leading-snug text-subtle">
                  Clic : inclure · 2ᵉ clic : exclure · 3ᵉ : retirer.
                </p>
              </>
            )}
          </Bloc>

          {/* Rubrique */}
          <Bloc titre="Rubrique">
            <FacetteMono
              options={catalogue.rubriques.map((r: FacetteRubrique) => ({
                cle: r.slug,
                nom: r.nom,
                nb: r.nbPages,
              }))}
              actif={rubriqueSlug}
              onToggle={(cle) => setRubriqueSlug((v) => (v === cle ? null : cle))}
            />
          </Bloc>

          {/* Auteur */}
          {catalogue.auteurs.length > 0 && (
            <Bloc titre="Auteur">
              <FacetteMono
                options={catalogue.auteurs.map((a: FacetteAuteur) => ({
                  cle: a.id,
                  nom: a.nom,
                  nb: a.nbPages,
                }))}
                actif={auteurId}
                onToggle={(cle) => setAuteurId((v) => (v === cle ? null : cle))}
              />
            </Bloc>
          )}
        </div>
      </aside>

      {/* --- Recherche + résultats --- */}
      <div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-subtle" />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Mots-clés (titre, contenu…) — ou filtrez par tags"
            aria-label="Rechercher dans le wiki"
            className="w-full rounded-xl border border-border bg-surface py-3 pl-11 pr-10 text-base text-fg shadow-sm outline-none transition-colors placeholder:text-subtle focus:border-brand"
          />
          {pending && (
            <Loader2 className="absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-subtle" />
          )}
        </div>

        <div className="mt-4">
          {!actif ? (
            <p className="rounded-lg border border-dashed border-border bg-surface px-4 py-10 text-center text-sm text-muted">
              Tapez au moins 2 caractères ou choisissez un filtre pour lancer la recherche.
            </p>
          ) : resultats === null ? (
            <p className="px-1 text-sm text-subtle">Recherche…</p>
          ) : resultats.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border bg-surface px-4 py-10 text-center text-sm text-muted">
              Aucune page ne correspond à ces critères.
            </p>
          ) : (
            <>
              <p className="mb-2 px-1 text-xs text-subtle">
                {resultats.length} résultat{resultats.length > 1 ? "s" : ""}
                {resultats.length === 40 ? " (max)" : ""}
              </p>
              <ul className="divide-y divide-border-soft overflow-hidden rounded-xl border border-border bg-surface">
                {resultats.map((r) => (
                  <LigneResultat key={r.id} r={r} />
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* --- Facette mono-sélection (rubrique, auteur) : chips « radio » -------------- */
function FacetteMono({
  options,
  actif,
  onToggle,
}: {
  options: { cle: string; nom: string; nb: number }[];
  actif: string | null;
  onToggle: (cle: string) => void;
}) {
  if (options.length === 0) return <p className="text-xs text-subtle">—</p>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const sel = actif === o.cle;
        return (
          <button
            key={o.cle}
            type="button"
            onClick={() => onToggle(o.cle)}
            aria-pressed={sel}
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
              sel ? "bg-brand text-brand-fg" : "bg-surface-2 text-muted hover:text-fg"
            }`}
          >
            {o.nom}
            {sel ? (
              <X className="h-3 w-3" />
            ) : (
              <span className="text-[0.65rem] text-subtle">{o.nb}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
