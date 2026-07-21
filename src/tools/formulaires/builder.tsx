"use client";

// Builder d'un formulaire — l'atelier, refonte « premium » (charte Dumortier).
// Trois zones : PALETTE (gauche) · RAIL de modules WYSIWYG (centre) · INSPECTEUR
// contextuel (droite). Le rail rappelle les modules qui se clipsent sur un rail
// DIN — le métier de l'entreprise. Chaque carte affiche un APERÇU réel du champ
// (« ce que tu montes est exactement ce qui sera rempli »). Insertion au clavier
// (« / » = palette-commande), raccourcis ⌘D / ⌥↑↓ / ⌫ sur le champ sélectionné.
// Autosave anti-collision INCHANGÉ (refs + debounce 700 ms + single-flight +
// filets ⌘S / visibilitychange / beforeunload). Réglages regroupés dans
// l'inspecteur → cartes épurées. Sur mobile, l'inspecteur devient un tiroir.

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  ArrowLeft,
  ArrowUp,
  ArrowDown,
  Plus,
  GripVertical,
  Copy,
  Trash2,
  Asterisk,
  X,
  Eye,
  Pencil,
  Check,
  Loader2,
  TriangleAlert,
  ExternalLink,
  CircleDot,
  ImagePlus,
  Search,
  Settings2,
  CornerDownLeft,
  MousePointerClick,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { sauverFormulaire, supprimerFormulaire } from "./actions";
import {
  estPresentation,
  nouveauChamp,
  recalculer,
  OPERATION_LABEL,
  OPERATEUR_COND_LABEL,
  TYPE_CHAMP_LABEL,
  TYPES_CHAMP,
} from "./model";
import type {
  ChampDef,
  ConfigCalcul,
  Condition,
  OperateurCond,
  SchemaFormulaire,
  TypeChamp,
  TypeOperation,
  ValeurChamp,
} from "./model";
import { GROUPES_PALETTE, ICONE_CHAMP, TYPE_CHAMP_INDICE } from "./champs-ui";
import { Renderer, ApercuControle } from "./renderer";
import type { FormulaireDetail } from "./queries";

type EtatSave = "sauve" | "encours" | "erreur" | "conflit";

const datePub = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

export function Builder({
  qui,
  formulaire,
}: {
  qui: string;
  formulaire: FormulaireDetail;
}) {
  const router = useRouter();

  const [nom, setNom] = useState(formulaire.nom);
  const [description, setDescription] = useState(formulaire.description);
  const [publie, setPublie] = useState(formulaire.publie);
  const [publieLe, setPublieLe] = useState<Date | null>(formulaire.publieLe);
  const [schema, setSchema] = useState<SchemaFormulaire>(formulaire.schema);
  const [mode, setMode] = useState<"composer" | "apercu">("composer");
  const [apercuValeurs, setApercuValeurs] = useState<
    Record<string, ValeurChamp>
  >(() => recalculer({}, formulaire.schema));
  const [selId, setSelId] = useState<string | null>(null);
  const [nouvId, setNouvId] = useState<string | null>(null);
  const [inspMobile, setInspMobile] = useState(false);
  const [paletteOuverte, setPaletteOuverte] = useState(false);
  const [etat, setEtat] = useState<EtatSave>("sauve");
  const [confirmSuppr, setConfirmSuppr] = useState(false);

  // --- drag & drop (HTML5 natif, patron kanban des tâches) ---
  const [dragId, setDragId] = useState<string | null>(null);
  const [cible, setCible] = useState<number | null>(null);
  const [pretId, setPretId] = useState<string | null>(null);
  const listeRef = useRef<HTMLDivElement | null>(null);

  // --- refs autosave (le timer capture une closure figée → tout passe par refs) ---
  const nomRef = useRef(nom);
  const descRef = useRef(description);
  const publieRef = useRef(publie);
  const schemaRef = useRef(schema);
  const versionRef = useRef(formulaire.version);
  const conflitRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const etatRef = useRef<EtatSave>("sauve");
  const enVolRef = useRef(false);
  const relanceRef = useRef(false);
  // Refs des états lus par le gestionnaire clavier global (lié une seule fois).
  const selIdRef = useRef<string | null>(null);
  const paletteRef = useRef(false);

  useEffect(() => {
    nomRef.current = nom;
    descRef.current = description;
    publieRef.current = publie;
    schemaRef.current = schema;
    etatRef.current = etat;
    selIdRef.current = selId;
    paletteRef.current = paletteOuverte;
  });

  const sauver = useCallback(async () => {
    if (conflitRef.current) return;
    if (enVolRef.current) {
      relanceRef.current = true;
      return;
    }
    enVolRef.current = true;
    setEtat("encours");
    try {
      const res = await sauverFormulaire(formulaire.id, {
        nom: nomRef.current,
        description: descRef.current,
        schema: schemaRef.current,
        publie: publieRef.current,
        versionBase: versionRef.current,
      });
      if (res.ok) {
        versionRef.current = res.version;
        setPublieLe(res.publieLe);
        setEtat("sauve");
      } else if ("conflit" in res) {
        conflitRef.current = true;
        setEtat("conflit");
      } else {
        setEtat("erreur");
      }
    } catch {
      setEtat("erreur");
    } finally {
      enVolRef.current = false;
      if (relanceRef.current) {
        relanceRef.current = false;
        void sauver();
      }
    }
  }, [formulaire.id]);

  const planifierSave = useCallback(() => {
    if (conflitRef.current) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      void sauver();
    }, 700);
  }, [sauver]);

  // `sauver` ne dépend que de formulaire.id (tout le reste passe par des refs) →
  // `flush` est stable, pas besoin de l'astuce « ref réassignée à chaque rendu ».
  const flush = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    void sauver();
  }, [sauver]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === "s") {
        e.preventDefault();
        flush();
      }
    };
    const onCache = () => {
      if (document.visibilityState === "hidden" && timerRef.current) flush();
    };
    const onAvant = (e: BeforeUnloadEvent) => {
      const nonSauve =
        timerRef.current !== null ||
        etatRef.current === "encours" ||
        etatRef.current === "erreur";
      if (nonSauve) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("visibilitychange", onCache);
    window.addEventListener("pagehide", onCache);
    window.addEventListener("beforeunload", onAvant);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("visibilitychange", onCache);
      window.removeEventListener("pagehide", onCache);
      window.removeEventListener("beforeunload", onAvant);
    };
  }, [flush]);

  // --- mutations ---
  const majSchema = useCallback(
    (next: SchemaFormulaire) => {
      setSchema(next);
      schemaRef.current = next;
      planifierSave();
    },
    [planifierSave],
  );

  const selectionner = useCallback((id: string | null) => {
    setSelId(id);
    setInspMobile(id != null);
  }, []);

  const ajouter = useCallback(
    (type: TypeChamp) => {
      const champ = nouveauChamp(type);
      const arr = schemaRef.current.slice();
      const idx = selIdRef.current
        ? arr.findIndex((c) => c.id === selIdRef.current)
        : -1;
      if (idx >= 0) arr.splice(idx + 1, 0, champ);
      else arr.push(champ);
      majSchema(arr);
      selectionner(champ.id);
      setNouvId(champ.id);
      setPaletteOuverte(false);
      setMode("composer");
    },
    [majSchema, selectionner],
  );

  const majChamp = useCallback(
    (id: string, patch: Partial<ChampDef>) => {
      majSchema(
        schemaRef.current.map((c) => (c.id === id ? { ...c, ...patch } : c)),
      );
    },
    [majSchema],
  );

  const supprimerChamp = useCallback(
    (id: string) => {
      majSchema(schemaRef.current.filter((c) => c.id !== id));
      if (selIdRef.current === id) selectionner(null);
    },
    [majSchema, selectionner],
  );

  const dupliquer = useCallback(
    (id: string) => {
      const src = schemaRef.current.find((c) => c.id === id);
      if (!src) return;
      const copie: ChampDef = {
        ...src,
        id: crypto.randomUUID(),
        options: src.options ? [...src.options] : undefined,
      };
      const arr = schemaRef.current.slice();
      arr.splice(arr.findIndex((c) => c.id === id) + 1, 0, copie);
      majSchema(arr);
      selectionner(copie.id);
      setNouvId(copie.id);
    },
    [majSchema, selectionner],
  );

  const bouger = useCallback(
    (id: string, delta: number) => {
      const arr = schemaRef.current.slice();
      const i = arr.findIndex((c) => c.id === id);
      const j = i + delta;
      if (i < 0 || j < 0 || j >= arr.length) return;
      [arr[i], arr[j]] = [arr[j], arr[i]];
      majSchema(arr);
    },
    [majSchema],
  );

  // --- raccourcis clavier de l'atelier (liés une fois ; lisent les refs) ---
  useEffect(() => {
    const dansChamp = (t: EventTarget | null) => {
      const el = t as HTMLElement | null;
      const tag = el?.tagName;
      return (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        el?.isContentEditable === true
      );
    };
    const onKey = (e: KeyboardEvent) => {
      if (paletteRef.current) return; // la palette-commande gère ses touches
      const sel = selIdRef.current;
      if (e.key === "/" && !dansChamp(e.target)) {
        e.preventDefault();
        setPaletteOuverte(true);
        return;
      }
      if (dansChamp(e.target)) return;
      if (e.key === "Escape") {
        selectionner(null);
        return;
      }
      if (!sel) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "d") {
        e.preventDefault();
        dupliquer(sel);
      } else if (e.altKey && e.key === "ArrowUp") {
        e.preventDefault();
        bouger(sel, -1);
      } else if (e.altKey && e.key === "ArrowDown") {
        e.preventDefault();
        bouger(sel, 1);
      } else if (e.key === "Backspace" || e.key === "Delete") {
        e.preventDefault();
        supprimerChamp(sel);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [bouger, dupliquer, supprimerChamp, selectionner]);

  // --- drag handlers ---
  function survol(e: React.DragEvent) {
    if (dragId == null) return;
    e.preventDefault();
    const cont = listeRef.current;
    if (!cont) return;
    const cartes = [...cont.querySelectorAll<HTMLElement>("[data-champ]")];
    let idx = cartes.length;
    for (let i = 0; i < cartes.length; i++) {
      const r = cartes[i].getBoundingClientRect();
      if (e.clientY < r.top + r.height / 2) {
        idx = i;
        break;
      }
    }
    setCible(idx);
  }
  function quitter(e: React.DragEvent) {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) setCible(null);
  }
  function deposer(e: React.DragEvent) {
    e.preventDefault();
    const id = dragId;
    const insert = cible;
    setDragId(null);
    setCible(null);
    setPretId(null);
    if (id == null || insert == null) return;
    const arr = schemaRef.current.slice();
    const from = arr.findIndex((c) => c.id === id);
    if (from < 0) return;
    const [item] = arr.splice(from, 1);
    arr.splice(from < insert ? insert - 1 : insert, 0, item);
    majSchema(arr);
  }

  async function supprimerTout() {
    await supprimerFormulaire(formulaire.id);
    router.push(`/perso/${qui}/formulaires`);
  }

  const selIndex = schema.findIndex((c) => c.id === selId);
  const champSel = selIndex >= 0 ? schema[selIndex] : null;
  const champsPrecedents = selIndex >= 0 ? schema.slice(0, selIndex) : [];

  return (
    <div className="min-h-screen">
      {/* ---- barre supérieure (collante) ---- */}
      <div className="sticky top-0 z-30 border-b border-border bg-page/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-[84rem] items-center gap-2 px-3 py-2.5 md:px-5">
          <Link
            href={`/perso/${qui}/formulaires`}
            className="inline-flex shrink-0 items-center gap-1.5 text-sm text-muted hover:text-fg"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden lg:inline">Formulaires</span>
          </Link>
          <span className="hidden h-5 w-px shrink-0 bg-border sm:block" />

          <input
            value={nom}
            onChange={(e) => {
              setNom(e.target.value);
              planifierSave();
            }}
            placeholder="Nom du formulaire"
            aria-label="Nom du formulaire"
            className="min-w-0 flex-1 bg-transparent font-display text-base font-bold tracking-tight text-fg placeholder:text-subtle focus:outline-none sm:text-lg"
          />

          <StatutSave etat={etat} onReessayer={flush} />

          <div className="flex shrink-0 items-center gap-2">
            <Segmente
              value={mode}
              onChange={setMode}
              options={[
                { v: "composer", label: "Éditer", icon: Pencil },
                { v: "apercu", label: "Aperçu", icon: Eye },
              ]}
            />
            <Segmente
              value={publie ? "pub" : "brou"}
              onChange={(v) => {
                setPublie(v === "pub");
                planifierSave();
              }}
              options={[
                { v: "brou", label: "Brouillon" },
                { v: "pub", label: "Publié" },
              ]}
            />
            {publie && publieLe && (
              <span
                className="hidden items-center text-xs text-subtle lg:inline-flex"
                title={`Mis à disposition le ${datePub.format(new Date(publieLe))}`}
              >
                le {datePub.format(new Date(publieLe))}
              </span>
            )}
            {confirmSuppr ? (
              <span className="flex items-center gap-1 text-xs">
                <button
                  onClick={supprimerTout}
                  className="rounded px-2 py-1 font-medium text-danger hover:bg-danger/10"
                >
                  Supprimer
                </button>
                <button
                  onClick={() => setConfirmSuppr(false)}
                  className="rounded px-2 py-1 text-muted hover:bg-surface-2"
                >
                  Annuler
                </button>
              </span>
            ) : (
              <button
                onClick={() => setConfirmSuppr(true)}
                title="Supprimer le formulaire"
                className="rounded-md p-2 text-subtle hover:bg-danger/10 hover:text-danger"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      {mode === "apercu" ? (
        <section className="mx-auto max-w-[84rem] px-4 py-8">
          <div className="mb-5 flex flex-wrap items-center gap-2 rounded-md border border-border bg-surface-2 px-3 py-2 text-xs text-muted">
            <Eye className="h-3.5 w-3.5" />
            Aperçu tel que sur le téléphone — rien n&apos;est enregistré ici.
            <Link
              href={`/perso/${qui}/formulaires/${formulaire.id}/terrain`}
              className="ml-auto inline-flex items-center gap-1 font-medium text-brand hover:underline"
            >
              Ouvrir le remplissage <ExternalLink className="h-3 w-3" />
            </Link>
          </div>
          {schema.length === 0 ? (
            <p className="py-10 text-center text-sm text-subtle">
              Ajoute des champs pour voir l&apos;aperçu.
            </p>
          ) : (
            <div className="mx-auto w-full max-w-[26rem] rounded-2xl border border-border bg-surface p-5 shadow-lg md:p-6">
              <Renderer
                schema={schema}
                valeurs={apercuValeurs}
                onChange={(id, v) =>
                  setApercuValeurs((s) => recalculer({ ...s, [id]: v }, schema))
                }
              />
            </div>
          )}
        </section>
      ) : (
        <div className="mx-auto max-w-[84rem] px-3 py-5 md:px-5">
          <div className="lg:grid lg:grid-cols-[13rem_minmax(0,1fr)_20rem] lg:gap-5">
            {/* ---- PALETTE (desktop) ---- */}
            <Palette onAjouter={ajouter} className="hidden lg:block" />

            {/* ---- RAIL / CANEVAS ---- */}
            <div className="min-w-0">
              <div className="mb-3 flex items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-subtle">
                  Structure
                  <span className="ml-1.5 font-normal normal-case tracking-normal text-subtle/80">
                    · {schema.length} champ{schema.length > 1 ? "s" : ""}
                  </span>
                </p>
                <button
                  onClick={() => setPaletteOuverte(true)}
                  className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs font-medium text-fg shadow-sm transition-colors hover:border-brand/40"
                >
                  <Plus className="h-3.5 w-3.5" /> Ajouter
                  <kbd className="rounded border border-border bg-surface-2 px-1 font-sans text-[10px] text-subtle">
                    /
                  </kbd>
                </button>
              </div>

              <div
                ref={listeRef}
                onDragOver={survol}
                onDragLeave={quitter}
                onDrop={deposer}
                className="relative"
              >
                {schema.length === 0 ? (
                  <VideCanvas onAjouter={() => setPaletteOuverte(true)} />
                ) : (
                  <>
                    {/* rail continu (signature « rail DIN ») */}
                    <span
                      aria-hidden
                      className="pointer-events-none absolute bottom-5 left-[7px] top-5 w-px bg-border"
                    />
                    <div className="space-y-2 pl-7">
                      {schema.map((champ, i) => (
                        <div key={champ.id} className="relative">
                          {dragId && cible === i && <Indicateur />}
                          <span
                            aria-hidden
                            className={cn(
                              "absolute -left-[27px] top-[18px] z-10 h-3 w-3 rounded-full border-2 border-page transition-colors",
                              selId === champ.id
                                ? "bg-accent"
                                : dragId === champ.id
                                  ? "bg-brand"
                                  : "bg-brand/40",
                            )}
                          />
                          <ChampCarte
                            champ={champ}
                            selectionne={selId === champ.id}
                            nouv={nouvId === champ.id}
                            estDrag={dragId === champ.id}
                            draggable={pretId === champ.id}
                            premier={i === 0}
                            dernier={i === schema.length - 1}
                            onSelect={() => selectionner(champ.id)}
                            onArmer={() => setPretId(champ.id)}
                            onDragStart={(e) => {
                              setDragId(champ.id);
                              e.dataTransfer.effectAllowed = "move";
                              e.dataTransfer.setData("text/plain", champ.id);
                            }}
                            onDragEnd={() => {
                              setDragId(null);
                              setCible(null);
                              setPretId(null);
                            }}
                            onMajLibelle={(libelle) =>
                              majChamp(champ.id, { libelle })
                            }
                            onAjouterDessous={() => {
                              selectionner(champ.id);
                              setPaletteOuverte(true);
                            }}
                            onDupliquer={() => dupliquer(champ.id)}
                            onSupprimer={() => supprimerChamp(champ.id)}
                            onMonter={() => bouger(champ.id, -1)}
                            onDescendre={() => bouger(champ.id, 1)}
                          />
                        </div>
                      ))}
                      {dragId && cible === schema.length && <Indicateur />}
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* ---- INSPECTEUR contextuel ---- */}
            <Inspecteur
              champ={champSel}
              champsPrecedents={champsPrecedents}
              ouvertMobile={inspMobile}
              onFermer={() => setInspMobile(false)}
              onMaj={(patch) => champSel && majChamp(champSel.id, patch)}
              onDupliquer={() => champSel && dupliquer(champSel.id)}
              onSupprimer={() => champSel && supprimerChamp(champSel.id)}
              description={description}
              onDescription={(v) => {
                setDescription(v);
                planifierSave();
              }}
              nbChamps={schema.length}
              onAjouter={() => setPaletteOuverte(true)}
              qui={qui}
              formulaireId={formulaire.id}
            />
          </div>
        </div>
      )}

      {/* ---- bouton flottant d'ajout (mobile) ---- */}
      {mode === "composer" && (
        <button
          onClick={() => setPaletteOuverte(true)}
          aria-label="Ajouter un champ"
          className="fixed bottom-5 right-5 z-20 inline-flex items-center justify-center rounded-full bg-brand p-4 text-brand-fg shadow-lg transition-transform hover:scale-105 active:scale-95 lg:hidden"
        >
          <Plus className="h-5 w-5" />
        </button>
      )}

      {/* ---- palette-commande (overlay clavier) ---- */}
      {paletteOuverte && (
        <PaletteCommande
          onChoisir={ajouter}
          onFermer={() => setPaletteOuverte(false)}
        />
      )}
    </div>
  );
}

/* ============================ palette (desktop) ====================== */

function Palette({
  onAjouter,
  className,
}: {
  onAjouter: (t: TypeChamp) => void;
  className?: string;
}) {
  return (
    <aside className={cn("lg:sticky lg:top-[4.2rem] lg:self-start", className)}>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-subtle">
        Champs
      </p>
      <div className="space-y-3.5">
        {GROUPES_PALETTE.map((groupe) => (
          <div key={groupe.titre}>
            <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-subtle/80">
              {groupe.titre}
            </p>
            <div className="flex flex-col gap-1">
              {groupe.types.map((type) => {
                const Icon = ICONE_CHAMP[type];
                return (
                  <button
                    key={type}
                    onClick={() => onAjouter(type)}
                    title={TYPE_CHAMP_INDICE[type]}
                    className="group inline-flex w-full items-center gap-2 rounded-lg border border-transparent px-2 py-1.5 text-left transition-colors hover:border-border hover:bg-surface"
                  >
                    <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-brand-soft text-brand">
                      <Icon className="h-3.5 w-3.5" />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm text-fg">
                      {TYPE_CHAMP_LABEL[type]}
                    </span>
                    <Plus className="h-3.5 w-3.5 shrink-0 text-subtle opacity-0 transition-opacity group-hover:opacity-100" />
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
}

/* ======================= palette-commande (overlay) ================= */

function PaletteCommande({
  onChoisir,
  onFermer,
}: {
  onChoisir: (t: TypeChamp) => void;
  onFermer: () => void;
}) {
  const [q, setQ] = useState("");
  const [i, setI] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listeRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const requete = q.trim().toLowerCase();
  const resultats = TYPES_CHAMP.filter((t) => {
    if (!requete) return true;
    return (
      TYPE_CHAMP_LABEL[t].toLowerCase().includes(requete) ||
      TYPE_CHAMP_INDICE[t].toLowerCase().includes(requete)
    );
  });
  // Garde l'index surligné dans les bornes quand la liste rétrécit.
  const idx = Math.min(i, Math.max(0, resultats.length - 1));

  function onKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setI((v) => Math.min(v + 1, resultats.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setI((v) => Math.max(v - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const t = resultats[idx];
      if (t) onChoisir(t);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onFermer();
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 px-4 pt-[12vh] backdrop-blur-sm"
      onClick={onFermer}
    >
      <div
        role="dialog"
        aria-label="Ajouter un champ"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg overflow-hidden rounded-xl border border-border bg-surface shadow-lg"
      >
        <div className="flex items-center gap-2 border-b border-border px-3">
          <Search className="h-4 w-4 shrink-0 text-subtle" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setI(0);
            }}
            onKeyDown={onKey}
            placeholder="Rechercher un type de champ…"
            className="h-12 flex-1 bg-transparent text-sm text-fg placeholder:text-subtle focus:outline-none"
          />
          <kbd className="hidden rounded border border-border bg-surface-2 px-1.5 py-0.5 text-[10px] text-subtle sm:block">
            Échap
          </kbd>
        </div>

        <div ref={listeRef} className="max-h-[46vh] overflow-y-auto p-1.5">
          {resultats.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-subtle">
              Aucun type ne correspond à « {q} ».
            </p>
          ) : (
            resultats.map((t, n) => {
              const Icon = ICONE_CHAMP[t];
              const actif = n === idx;
              return (
                <button
                  key={t}
                  onMouseEnter={() => setI(n)}
                  onClick={() => onChoisir(t)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors",
                    actif ? "bg-brand-soft" : "hover:bg-surface-2",
                  )}
                >
                  <span
                    className={cn(
                      "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md",
                      actif
                        ? "bg-brand text-brand-fg"
                        : "bg-surface-2 text-muted",
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-fg">
                      {TYPE_CHAMP_LABEL[t]}
                    </span>
                    <span className="block truncate text-xs text-subtle">
                      {TYPE_CHAMP_INDICE[t]}
                    </span>
                  </span>
                  {actif && (
                    <CornerDownLeft className="h-4 w-4 shrink-0 text-brand" />
                  )}
                </button>
              );
            })
          )}
        </div>

        <div className="flex items-center gap-3 border-t border-border bg-surface-2 px-3 py-2 text-[11px] text-subtle">
          <span className="inline-flex items-center gap-1">
            <kbd className="rounded border border-border bg-surface px-1">↑</kbd>
            <kbd className="rounded border border-border bg-surface px-1">↓</kbd>
            naviguer
          </span>
          <span className="inline-flex items-center gap-1">
            <kbd className="rounded border border-border bg-surface px-1">↵</kbd>
            insérer
          </span>
        </div>
      </div>
    </div>
  );
}

/* ============================ carte de champ ========================= */

function ChampCarte({
  champ,
  selectionne,
  nouv,
  estDrag,
  draggable,
  premier,
  dernier,
  onSelect,
  onArmer,
  onDragStart,
  onDragEnd,
  onMajLibelle,
  onAjouterDessous,
  onDupliquer,
  onSupprimer,
  onMonter,
  onDescendre,
}: {
  champ: ChampDef;
  selectionne: boolean;
  nouv: boolean;
  estDrag: boolean;
  draggable: boolean;
  premier: boolean;
  dernier: boolean;
  onSelect: () => void;
  onArmer: () => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  onMajLibelle: (v: string) => void;
  onAjouterDessous: () => void;
  onDupliquer: () => void;
  onSupprimer: () => void;
  onMonter: () => void;
  onDescendre: () => void;
}) {
  const libelleRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (nouv) libelleRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const Icon = ICONE_CHAMP[champ.type];
  const presentation = estPresentation(champ.type);

  return (
    <div
      data-champ
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onSelect}
      className={cn(
        "anim-item-in group/carte cursor-pointer rounded-xl border bg-surface transition-all",
        estDrag
          ? "border-brand opacity-40"
          : selectionne
            ? "border-brand/60 shadow-md ring-1 ring-brand/20"
            : "border-border shadow-sm hover:border-brand/30 hover:shadow-md",
      )}
    >
      <div className="flex items-center gap-2 px-3 pt-2.5">
        <button
          type="button"
          onPointerDown={onArmer}
          onClick={(e) => e.stopPropagation()}
          title="Glisser pour réordonner"
          className="cursor-grab touch-none rounded p-0.5 text-subtle hover:text-muted active:cursor-grabbing"
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <span className="inline-flex items-center gap-1.5 rounded-md bg-surface-2 px-2 py-0.5 text-xs font-medium text-muted">
          <Icon className="h-3.5 w-3.5" />
          {TYPE_CHAMP_LABEL[champ.type]}
        </span>
        {champ.requis && (
          <Asterisk
            className="h-3 w-3 text-danger"
            aria-label="obligatoire"
          />
        )}
        {champ.condition && (
          <span className="inline-flex items-center gap-1 rounded bg-brand-soft px-1.5 py-0.5 text-[11px] font-medium text-brand">
            <Eye className="h-3 w-3" /> Conditionnel
          </span>
        )}

        <div className="ml-auto flex items-center gap-0.5 opacity-100 transition-opacity sm:opacity-0 sm:group-hover/carte:opacity-100 sm:group-focus-within/carte:opacity-100">
          <IconeBtn onClick={onMonter} disabled={premier} title="Monter" icon={ArrowUp} />
          <IconeBtn
            onClick={onDescendre}
            disabled={dernier}
            title="Descendre"
            icon={ArrowDown}
          />
          <IconeBtn
            onClick={onAjouterDessous}
            title="Ajouter dessous"
            icon={Plus}
          />
          <IconeBtn onClick={onDupliquer} title="Dupliquer" icon={Copy} />
          <IconeBtn onClick={onSupprimer} title="Supprimer" icon={Trash2} danger />
        </div>
      </div>

      <div className="px-3 pb-3 pt-1.5">
        <input
          ref={libelleRef}
          value={champ.libelle}
          onChange={(e) => onMajLibelle(e.target.value)}
          onClick={(e) => e.stopPropagation()}
          placeholder={presentation ? "Titre (facultatif)" : "Libellé du champ"}
          className="w-full bg-transparent text-sm font-semibold text-fg placeholder:font-normal placeholder:text-subtle focus:outline-none"
        />
        {champ.aide && (
          <p className="mt-0.5 line-clamp-1 text-xs text-muted">{champ.aide}</p>
        )}
        {/* Aperçu figé : le canevas EST le formulaire (WYSIWYG). */}
        <div className="mt-2">
          <ApercuControle champ={champ} />
        </div>
      </div>
    </div>
  );
}

/* ============================ inspecteur ============================ */

function Inspecteur({
  champ,
  champsPrecedents,
  ouvertMobile,
  onFermer,
  onMaj,
  onDupliquer,
  onSupprimer,
  description,
  onDescription,
  nbChamps,
  onAjouter,
  qui,
  formulaireId,
}: {
  champ: ChampDef | null;
  champsPrecedents: ChampDef[];
  ouvertMobile: boolean;
  onFermer: () => void;
  onMaj: (patch: Partial<ChampDef>) => void;
  onDupliquer: () => void;
  onSupprimer: () => void;
  description: string;
  onDescription: (v: string) => void;
  nbChamps: number;
  onAjouter: () => void;
  qui: string;
  formulaireId: string;
}) {
  const Icon = champ ? ICONE_CHAMP[champ.type] : Settings2;
  return (
    <>
      {ouvertMobile && (
        <div
          onClick={onFermer}
          className="fixed inset-0 z-30 bg-black/30 lg:hidden"
          aria-hidden
        />
      )}
      <aside
        className={cn(
          "fixed inset-y-0 right-0 z-40 w-[min(22rem,92vw)] border-l border-border bg-surface shadow-lg transition-transform duration-200",
          "lg:static lg:z-auto lg:w-auto lg:translate-x-0 lg:border-0 lg:bg-transparent lg:shadow-none",
          ouvertMobile ? "translate-x-0" : "translate-x-full lg:translate-x-0",
        )}
      >
        <div className="flex h-full flex-col lg:sticky lg:top-[4.2rem] lg:max-h-[calc(100vh-5rem)] lg:rounded-xl lg:border lg:border-border lg:bg-surface lg:shadow-sm">
          <div className="flex items-center gap-2 border-b border-border px-4 py-3">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-brand-soft text-brand">
              <Icon className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-fg">
                {champ ? TYPE_CHAMP_LABEL[champ.type] : "Formulaire"}
              </span>
              <span className="block text-xs text-subtle">
                {champ ? "Réglages du champ" : "Réglages généraux"}
              </span>
            </span>
            <button
              onClick={onFermer}
              className="rounded-md p-1.5 text-subtle hover:bg-surface-2 hover:text-fg lg:hidden"
              aria-label="Fermer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
            {champ ? (
              <ReglagesChampComplet
                champ={champ}
                champsPrecedents={champsPrecedents}
                onMaj={onMaj}
                onDupliquer={onDupliquer}
                onSupprimer={onSupprimer}
              />
            ) : (
              <ReglagesFormulaire
                description={description}
                onDescription={onDescription}
                nbChamps={nbChamps}
                onAjouter={onAjouter}
                qui={qui}
                formulaireId={formulaireId}
              />
            )}
          </div>
        </div>
      </aside>
    </>
  );
}

function ReglagesFormulaire({
  description,
  onDescription,
  nbChamps,
  onAjouter,
  qui,
  formulaireId,
}: {
  description: string;
  onDescription: (v: string) => void;
  nbChamps: number;
  onAjouter: () => void;
  qui: string;
  formulaireId: string;
}) {
  return (
    <div className="space-y-4">
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-muted">
          Description
        </span>
        <textarea
          rows={3}
          value={description}
          onChange={(e) => onDescription(e.target.value)}
          placeholder="Une courte description (facultatif)"
          className="w-full resize-y rounded-md border border-border bg-surface px-2.5 py-2 text-sm text-fg placeholder:text-subtle hover:border-brand/40 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
        />
      </label>

      {nbChamps === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border bg-surface-2 px-4 py-6 text-center">
          <MousePointerClick className="h-5 w-5 text-subtle" />
          <p className="text-xs text-muted">
            Ajoute un premier champ, puis sélectionne-le pour le régler ici.
          </p>
          <button
            onClick={onAjouter}
            className="mt-1 inline-flex items-center gap-1.5 rounded-md bg-brand px-2.5 py-1.5 text-xs font-medium text-brand-fg hover:bg-brand-strong"
          >
            <Plus className="h-3.5 w-3.5" /> Ajouter un champ
          </button>
        </div>
      ) : (
        <div className="flex items-start gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-xs text-muted">
          <MousePointerClick className="mt-0.5 h-4 w-4 shrink-0 text-subtle" />
          <span>
            Sélectionne un champ dans le rail pour le configurer, ou tape{" "}
            <kbd className="rounded border border-border bg-surface px-1 text-[10px]">
              /
            </kbd>{" "}
            pour en ajouter un.
          </span>
        </div>
      )}

      <div className="border-t border-border-soft pt-3">
        <Link
          href={`/perso/${qui}/formulaires/${formulaireId}/reponses`}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-brand hover:underline"
        >
          Voir les réponses collectées{" "}
          <ExternalLink className="h-3 w-3" />
        </Link>
      </div>
    </div>
  );
}

function ReglagesChampComplet({
  champ,
  champsPrecedents,
  onMaj,
  onDupliquer,
  onSupprimer,
}: {
  champ: ChampDef;
  champsPrecedents: ChampDef[];
  onMaj: (patch: Partial<ChampDef>) => void;
  onDupliquer: () => void;
  onSupprimer: () => void;
}) {
  const presentation = estPresentation(champ.type);
  return (
    <div className="space-y-4">
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-muted">
          {presentation ? "Titre (facultatif)" : "Libellé"}
        </span>
        <input
          value={champ.libelle}
          onChange={(e) => onMaj({ libelle: e.target.value })}
          placeholder={presentation ? "Titre" : "Libellé du champ"}
          className={INPUT_MD}
        />
      </label>

      {!presentation && (
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted">
            Aide / précision
          </span>
          <input
            value={champ.aide ?? ""}
            onChange={(e) => onMaj({ aide: e.target.value })}
            placeholder="Facultatif"
            className={INPUT_MD}
          />
        </label>
      )}

      {!presentation && champ.type !== "calcul" && (
        <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-border bg-surface-2 px-3 py-2.5">
          <span className="flex items-center gap-2 text-sm text-fg">
            <Asterisk className="h-4 w-4 text-danger" />
            Obligatoire
          </span>
          <BasculeMini
            on={champ.requis === true}
            onToggle={() => onMaj({ requis: !champ.requis })}
          />
        </label>
      )}

      <ReglagesChamp
        champ={champ}
        champsPrecedents={champsPrecedents}
        onMaj={onMaj}
      />

      <EditeurCondition
        champ={champ}
        champsPrecedents={champsPrecedents}
        onMaj={onMaj}
      />

      <div className="flex items-center gap-2 border-t border-border-soft pt-3">
        <button
          onClick={onDupliquer}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs font-medium text-fg hover:bg-surface-2"
        >
          <Copy className="h-3.5 w-3.5" /> Dupliquer
        </button>
        <button
          onClick={onSupprimer}
          className="ml-auto inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-danger hover:bg-danger/10"
        >
          <Trash2 className="h-3.5 w-3.5" /> Supprimer
        </button>
      </div>
    </div>
  );
}

function BasculeMini({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onToggle}
      className={cn(
        "inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors",
        on ? "bg-brand" : "border border-border bg-surface-3",
      )}
    >
      <span
        className={cn(
          "h-4 w-4 rounded-full bg-surface shadow-sm transition-transform",
          on ? "translate-x-4" : "translate-x-0.5",
        )}
      />
    </button>
  );
}

/* ==================== éditeurs de réglages par type ================= */

function OptionsEditeur({
  champ,
  onMaj,
}: {
  champ: ChampDef;
  onMaj: (patch: Partial<ChampDef>) => void;
}) {
  const options = champ.options ?? [];
  const refs = useRef<Array<HTMLInputElement | null>>([]);
  return (
    <div className="space-y-1.5">
      <span className="block text-xs font-medium text-muted">Options</span>
      {options.map((opt, i) => (
        <div key={i} className="flex items-center gap-2">
          <CircleDot className="h-3.5 w-3.5 shrink-0 text-subtle" />
          <input
            ref={(el) => {
              refs.current[i] = el;
            }}
            value={opt}
            onChange={(e) => {
              const suivant = options.slice();
              suivant[i] = e.target.value;
              onMaj({ options: suivant });
            }}
            onKeyDown={(e) => {
              // Entrée → crée l'option suivante (saisie « en liste »).
              if (e.key === "Enter") {
                e.preventDefault();
                onMaj({ options: [...options, ""] });
                requestAnimationFrame(() => refs.current[i + 1]?.focus());
              }
            }}
            placeholder={`Option ${i + 1}`}
            className="h-8 flex-1 rounded-md border border-border bg-surface px-2.5 text-sm text-fg hover:border-brand/40 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
          />
          <IconeBtn
            onClick={() => onMaj({ options: options.filter((_, j) => j !== i) })}
            title="Retirer"
            icon={X}
          />
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-0.5">
        <button
          type="button"
          onClick={() => onMaj({ options: [...options, ""] })}
          className="inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline"
        >
          <Plus className="h-3.5 w-3.5" /> Ajouter une option
        </button>
        {champ.type === "choix" && (
          <label className="ml-auto inline-flex cursor-pointer items-center gap-1.5 text-xs text-muted">
            <input
              type="checkbox"
              checked={champ.multiple === true}
              onChange={(e) => onMaj({ multiple: e.target.checked })}
              className="accent-brand"
            />
            Plusieurs réponses
          </label>
        )}
      </div>
    </div>
  );
}

/** Réglages spécifiques d'un champ, selon son type. */
function ReglagesChamp({
  champ,
  champsPrecedents,
  onMaj,
}: {
  champ: ChampDef;
  champsPrecedents: ChampDef[];
  onMaj: (patch: Partial<ChampDef>) => void;
}) {
  switch (champ.type) {
    case "choix":
    case "liste":
      return <OptionsEditeur champ={champ} onMaj={onMaj} />;
    case "slider":
    case "compteur":
      return <ReglagesBornes champ={champ} onMaj={onMaj} />;
    case "calcul":
      return (
        <EditeurCalcul
          champ={champ}
          champsPrecedents={champsPrecedents}
          onMaj={onMaj}
        />
      );
    case "texteFixe":
      return (
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted">
            Texte affiché
          </span>
          <textarea
            rows={4}
            value={champ.contenuFixe ?? ""}
            onChange={(e) => onMaj({ contenuFixe: e.target.value })}
            placeholder="Texte affiché dans le formulaire…"
            className="w-full resize-y rounded-md border border-border bg-surface px-2.5 py-2 text-sm text-fg hover:border-brand/40 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
          />
        </label>
      );
    case "imageFixe":
    case "schema":
      return <ChoixImage champ={champ} onMaj={onMaj} />;
    default:
      return null;
  }
}

function ReglagesBornes({
  champ,
  onMaj,
}: {
  champ: ChampDef;
  onMaj: (patch: Partial<ChampDef>) => void;
}) {
  const bornes: { cle: "min" | "max" | "pas"; label: string }[] = [
    { cle: "min", label: "Min" },
    { cle: "max", label: "Max" },
    { cle: "pas", label: "Pas" },
  ];
  return (
    <div className="flex flex-wrap gap-3">
      {bornes.map(({ cle, label }) => (
        <label
          key={cle}
          className="inline-flex items-center gap-1.5 text-xs text-muted"
        >
          {label}
          <input
            type="number"
            value={champ[cle] ?? ""}
            onChange={(e) =>
              onMaj({
                [cle]:
                  e.target.value === "" ? undefined : Number(e.target.value),
              } as Partial<ChampDef>)
            }
            className="h-8 w-20 rounded-md border border-border bg-surface px-2 text-sm text-fg hover:border-brand/40 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
          />
        </label>
      ))}
    </div>
  );
}

async function imageEnDataUrl(file: File): Promise<string> {
  try {
    const bitmap = await createImageBitmap(file, {
      imageOrientation: "from-image",
    });
    const scale = Math.min(1, 1000 / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return "";
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();
    return canvas.toDataURL("image/jpeg", 0.82);
  } catch {
    return "";
  }
}

function ChoixImage({
  champ,
  onMaj,
}: {
  champ: ChampDef;
  onMaj: (patch: Partial<ChampDef>) => void;
}) {
  const [occupe, setOccupe] = useState(false);
  async function choisir(file: File | undefined) {
    if (!file) return;
    setOccupe(true);
    try {
      const dataUrl = await imageEnDataUrl(file);
      if (dataUrl) onMaj({ imageData: dataUrl });
    } finally {
      setOccupe(false);
    }
  }
  return (
    <div className="space-y-2">
      <span className="block text-xs font-medium text-muted">
        {champ.type === "schema" ? "Plan de fond" : "Image"}
      </span>
      {champ.imageData && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={champ.imageData}
          alt=""
          className="max-h-40 rounded-md border border-border"
        />
      )}
      <div className="flex items-center gap-3">
        <label
          className={cn(
            "inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 text-xs font-medium text-fg hover:border-brand/40",
            occupe && "pointer-events-none opacity-60",
          )}
        >
          {occupe ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <ImagePlus className="h-3.5 w-3.5" />
          )}
          {champ.imageData ? "Changer l'image" : "Choisir une image"}
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => choisir(e.target.files?.[0])}
          />
        </label>
        {champ.imageData && (
          <button
            type="button"
            onClick={() => onMaj({ imageData: undefined })}
            className="text-xs text-muted hover:text-danger"
          >
            Retirer
          </button>
        )}
      </div>
    </div>
  );
}

const INPUT_SM =
  "h-8 rounded-md border border-border bg-surface px-2 text-sm text-fg hover:border-brand/40 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20";
const INPUT_MD =
  "w-full h-9 rounded-md border border-border bg-surface px-2.5 text-sm text-fg placeholder:text-subtle hover:border-brand/40 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20";

/** Opérandes candidats d'un calcul selon l'opération (parmi les champs précédents). */
function candidatsOperande(
  operation: TypeOperation,
  precedents: ChampDef[],
): ChampDef[] {
  const NUM: TypeChamp[] = ["nombre", "slider", "compteur", "calcul"];
  const TEXTE: TypeChamp[] = [
    "texte",
    "texteLong",
    "nombre",
    "slider",
    "compteur",
    "choix",
    "liste",
    "date",
    "dateHeure",
    "codeBarre",
    "calcul",
  ];
  if (operation === "nbCoches")
    return precedents.filter((c) => c.type === "case");
  if (operation === "concat")
    return precedents.filter((c) => TEXTE.includes(c.type));
  return precedents.filter((c) => NUM.includes(c.type));
}

function EditeurCalcul({
  champ,
  champsPrecedents,
  onMaj,
}: {
  champ: ChampDef;
  champsPrecedents: ChampDef[];
  onMaj: (patch: Partial<ChampDef>) => void;
}) {
  const config: ConfigCalcul = champ.calcul ?? {
    operation: "somme",
    operandes: [],
  };
  const set = (patch: Partial<ConfigCalcul>) =>
    onMaj({ calcul: { ...config, ...patch } });
  const candidats = candidatsOperande(config.operation, champsPrecedents);

  return (
    <div className="space-y-2">
      <label className="flex items-center gap-2 text-xs text-muted">
        Opération
        <select
          value={config.operation}
          onChange={(e) => set({ operation: e.target.value as TypeOperation })}
          className={cn(INPUT_SM, "px-1.5")}
        >
          {(Object.keys(OPERATION_LABEL) as TypeOperation[]).map((op) => (
            <option key={op} value={op}>
              {OPERATION_LABEL[op]}
            </option>
          ))}
        </select>
      </label>

      {config.operation === "concat" && (
        <label className="flex items-center gap-2 text-xs text-muted">
          Séparateur
          <input
            value={config.separateur ?? ""}
            onChange={(e) => set({ separateur: e.target.value })}
            placeholder="espace"
            className={cn(INPUT_SM, "w-24")}
          />
        </label>
      )}

      <div>
        <p className="mb-1 text-xs text-subtle">Champs utilisés :</p>
        {candidats.length === 0 ? (
          <p className="text-xs italic text-subtle">
            Ajoute d&apos;abord des champs compatibles avant celui-ci.
          </p>
        ) : (
          <div className="space-y-1">
            {candidats.map((c) => (
              <label
                key={c.id}
                className="flex items-center gap-2 text-sm text-fg"
              >
                <input
                  type="checkbox"
                  checked={config.operandes.includes(c.id)}
                  onChange={(e) => {
                    const s = new Set(config.operandes);
                    if (e.target.checked) s.add(c.id);
                    else s.delete(c.id);
                    // Conserver l'ordre du schéma (compte pour « différence »).
                    set({
                      operandes: champsPrecedents
                        .filter((p) => s.has(p.id))
                        .map((p) => p.id),
                    });
                  }}
                  className="accent-brand"
                />
                {c.libelle || TYPE_CHAMP_LABEL[c.type]}
              </label>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function EditeurCondition({
  champ,
  champsPrecedents,
  onMaj,
}: {
  champ: ChampDef;
  champsPrecedents: ChampDef[];
  onMaj: (patch: Partial<ChampDef>) => void;
}) {
  const sources = champsPrecedents.filter((c) => !estPresentation(c.type));
  if (sources.length === 0) return null;

  const cond = champ.condition;
  if (!cond) {
    return (
      <button
        type="button"
        onClick={() =>
          onMaj({
            condition: {
              champId: sources[sources.length - 1].id,
              operateur: "rempli",
            },
          })
        }
        className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-border px-2.5 py-1.5 text-xs font-medium text-muted hover:border-brand/40 hover:text-fg"
      >
        <Eye className="h-3.5 w-3.5" /> Afficher sous condition…
      </button>
    );
  }

  const set = (patch: Partial<Condition>) =>
    onMaj({ condition: { ...cond, ...patch } });
  const besoinValeur = cond.operateur === "egal" || cond.operateur === "different";

  return (
    <div className="space-y-2 rounded-lg border border-brand/25 bg-brand-soft/40 p-2.5">
      <div className="flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand">
          <Eye className="h-3.5 w-3.5" /> Affiché sous condition
        </span>
        <button
          type="button"
          onClick={() => onMaj({ condition: undefined })}
          title="Retirer la condition"
          className="rounded p-1 text-subtle hover:text-danger"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
        <span>Afficher si</span>
        <select
          value={cond.champId}
          onChange={(e) => set({ champId: e.target.value })}
          className={cn(INPUT_SM, "max-w-[9.5rem]")}
        >
          {sources.map((c) => (
            <option key={c.id} value={c.id}>
              {c.libelle || TYPE_CHAMP_LABEL[c.type]}
            </option>
          ))}
        </select>
        <select
          value={cond.operateur}
          onChange={(e) => set({ operateur: e.target.value as OperateurCond })}
          className={INPUT_SM}
        >
          {(Object.keys(OPERATEUR_COND_LABEL) as OperateurCond[]).map((op) => (
            <option key={op} value={op}>
              {OPERATEUR_COND_LABEL[op]}
            </option>
          ))}
        </select>
        {besoinValeur && (
          <input
            value={cond.valeur ?? ""}
            onChange={(e) => set({ valeur: e.target.value })}
            placeholder="valeur"
            className={cn(INPUT_SM, "w-24")}
          />
        )}
      </div>
    </div>
  );
}

/* ============================ pièces UI ============================== */

function IconeBtn({
  onClick,
  title,
  icon: Icon,
  disabled,
  danger,
}: {
  onClick: () => void;
  title: string;
  icon: LucideIcon;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      disabled={disabled}
      title={title}
      className={cn(
        "rounded p-1.5 text-subtle transition-colors disabled:opacity-30",
        danger
          ? "hover:bg-danger/10 hover:text-danger"
          : "hover:bg-surface-2 hover:text-muted",
      )}
    >
      <Icon className="h-3.5 w-3.5" />
    </button>
  );
}

function Segmente<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { v: T; label: string; icon?: LucideIcon }[];
}) {
  return (
    <div className="inline-flex rounded-md border border-border bg-surface p-0.5">
      {options.map((o) => {
        const actif = value === o.v;
        return (
          <button
            key={o.v}
            onClick={() => onChange(o.v)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors",
              actif
                ? "bg-brand text-brand-fg shadow-sm"
                : "text-muted hover:text-fg",
            )}
          >
            {o.icon && <o.icon className="h-3.5 w-3.5" />}
            <span className="hidden sm:inline">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function StatutSave({
  etat,
  onReessayer,
}: {
  etat: EtatSave;
  onReessayer: () => void;
}) {
  if (etat === "encours")
    return (
      <span className="inline-flex shrink-0 items-center gap-1.5 text-xs text-subtle">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        <span className="hidden sm:inline">Enregistrement…</span>
      </span>
    );
  if (etat === "erreur")
    return (
      <span className="inline-flex shrink-0 items-center gap-1.5 text-xs text-danger">
        <TriangleAlert className="h-3.5 w-3.5" /> Échec
        <button onClick={onReessayer} className="font-medium underline">
          Réessayer
        </button>
      </span>
    );
  if (etat === "conflit")
    return (
      <span className="inline-flex shrink-0 items-center gap-1.5 text-xs text-danger">
        <TriangleAlert className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Modifié ailleurs</span>
        <button
          onClick={() => window.location.reload()}
          className="font-medium underline"
        >
          Recharger
        </button>
      </span>
    );
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 text-xs text-subtle">
      <Check className="h-3.5 w-3.5 text-success" />
      <span className="hidden sm:inline">Enregistré</span>
    </span>
  );
}

function Indicateur() {
  return <div className="my-1 h-0.5 rounded-full bg-accent" />;
}

function VideCanvas({ onAjouter }: { onAjouter: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-surface px-6 py-16 text-center">
      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-soft text-brand">
        <Plus className="h-5 w-5" />
      </div>
      <p className="max-w-xs text-sm text-muted">
        Ton formulaire est vide. Ajoute un premier champ pour commencer — tu
        pourras le régler, le rendre obligatoire et le réordonner.
      </p>
      <button
        onClick={onAjouter}
        className="inline-flex items-center gap-1.5 rounded-md bg-brand px-3 py-2 text-sm font-medium text-brand-fg shadow-sm hover:bg-brand-strong"
      >
        <Plus className="h-4 w-4" /> Ajouter un champ
        <kbd className="rounded border border-brand-fg/30 px-1 text-[10px]">
          /
        </kbd>
      </button>
    </div>
  );
}
