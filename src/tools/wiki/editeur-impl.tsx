"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  CornerDownRight,
  FolderTree,
  Loader2,
  Plus,
  Printer,
  Tag as TagIcon,
  X,
} from "lucide-react";
import { filterSuggestionItems } from "@blocknote/core";
import { SuggestionMenuController, useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import "@blocknote/mantine/style.css";
import "../notes/notes.css";
import { Button } from "@/ui";
import {
  BandeauAlerte,
  BandeauConflit,
  CoquilleEditeur,
  IndicateurSauvegarde,
  MenuDocument,
  fmtDateHeure,
} from "@/lib/editeur-riche/coquille-editeur";
import { useSauvegardeDocument } from "@/lib/editeur-riche/use-sauvegarde-document";
import { useThemeNote } from "@/tools/notes/theme";
import { NotesContexte } from "@/tools/notes/blocs/contexte";
import { dictionnaireNotes, itemsMenuSlash, schemaNotes } from "@/tools/notes/blocs/schema";
import {
  SommaireNote,
  extraireTitres,
  signatureTitres,
  type TitreSommaire,
} from "@/tools/notes/sommaire";
import { chargerCandidatsParent, deplacerPage, sauverPage, supprimerPage } from "./actions";
import { titreGenere, urlMediaWiki, type WikiContenu } from "./model";
import { PartagePage } from "./partage";
import type { CandidatParent } from "./queries";
import type { WikiEditeurProps } from "./editeur";

const BASE = "/outils/wiki";

export function WikiEditeurImpl({ page, rubriques, tousLesTags, estAdmin }: WikiEditeurProps) {
  const router = useRouter();
  const theme = useThemeNote();
  const [titre, setTitre] = useState(page.titre);
  const [resume, setResume] = useState(page.resume);
  const [rubriqueId, setRubriqueId] = useState(page.rubriqueId);
  const [tags, setTags] = useState<string[]>(page.tags);
  const [titres, setTitres] = useState<TitreSommaire[]>([]);

  // La sauvegarde part d'un timer : elle lit ces champs par des refs, jamais
  // par l'état (le debounce capture une closure — cf. use-sauvegarde-document).
  const titreRef = useRef(page.titre);
  const resumeRef = useRef(page.resume);
  const rubriqueRef = useRef(page.rubriqueId);
  const tagsRef = useRef<string[]>(page.tags);
  const champTitreRef = useRef<HTMLTextAreaElement>(null);
  const titresSigRef = useRef("");

  const editor = useCreateBlockNote({
    schema: schemaNotes,
    dictionary: dictionnaireNotes,
    initialContent: page.contenu.length ? (page.contenu as unknown as never[]) : undefined,
    tables: { splitCells: true, cellBackgroundColor: true, cellTextColor: true, headers: true },
    uploadFile: async (file: File) => {
      const mediaId = crypto.randomUUID();
      const fd = new FormData();
      fd.set("mediaId", mediaId);
      fd.set("pageId", page.id);
      fd.set("file", file, file.name);
      const res = await fetch("/api/wiki/media", { method: "POST", body: fd });
      if (!res.ok) {
        const corps = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(corps?.error ?? "Téléversement impossible");
      }
      return urlMediaWiki(mediaId);
    },
  });

  const save = useSauvegardeDocument({
    versionInitiale: page.version,
    dateInitiale: page.updatedAt,
    ecrire: (versionBase) =>
      sauverPage(page.id, {
        titre: titreRef.current,
        resume: resumeRef.current,
        contenu: editor.document as unknown as WikiContenu,
        rubriqueId: rubriqueRef.current,
        tags: tagsRef.current,
        versionBase,
      }),
  });

  // Changement de rubrique / de tags : on met à jour les refs et on planifie.
  const changerRubrique = (id: string) => {
    setRubriqueId(id);
    rubriqueRef.current = id;
    save.planifier();
  };
  const changerTags = (t: string[]) => {
    setTags(t);
    tagsRef.current = t;
    save.planifier();
  };

  // Sommaire : recalculé au fil de l'eau, l'état ne bouge que si les titres
  // changent vraiment (pas de re-rendu à chaque frappe).
  const majTitres = () => {
    const t = extraireTitres(editor.document as unknown[]);
    const sig = signatureTitres(t);
    if (sig !== titresSigRef.current) {
      titresSigRef.current = sig;
      setTitres(t);
    }
  };
  useEffect(majTitres, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Titre = textarea auto-dimensionné (titre long → retour à la ligne).
  useEffect(() => {
    const el = champTitreRef.current;
    if (!el) return;
    el.style.height = "0";
    el.style.height = `${el.scrollHeight}px`;
  }, [titre]);

  // Page fraîchement créée : le titre généré est présélectionné, donc taper le
  // remplace. Vaut aussi pour une note rapide (titre daté) — c'est justement ce
  // qui permet de cliquer « Note rapide » et d'écrire sans rien effacer.
  useEffect(() => {
    if (titreGenere(page.titre) && page.contenu.length === 0) {
      champTitreRef.current?.focus();
      champTitreRef.current?.select();
    }
  }, [page.titre, page.contenu.length]);

  const versLeDocument = () => {
    const premier = editor.document[0];
    if (premier) editor.setTextCursorPosition(premier, "start");
    editor.focus();
  };

  const [deleting, startDelete] = useTransition();
  const [erreurSuppression, setErreurSuppression] = useState(false);
  function handleDelete() {
    setErreurSuppression(false);
    startDelete(async () => {
      try {
        await supprimerPage(page.id);
        router.push(`${BASE}/${page.rubriqueSlug}`);
      } catch {
        setErreurSuppression(true);
      }
    });
  }

  const naviguerVersBloc = (id: string) => {
    document
      .querySelector(`.bn-block-outer[data-id="${id}"]`)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <CoquilleEditeur
      classeSignal="signal-com"
      fil={
        <>
          <Link
            href={BASE}
            className="group inline-flex shrink-0 items-center gap-1.5 text-sm text-muted transition-colors hover:text-fg"
            title="Retour au wiki"
          >
            <ArrowLeft className="h-4 w-4 shrink-0 transition-transform group-hover:-translate-x-0.5" />
            <span className="hidden sm:inline">Wiki</span>
          </Link>
          <span className="hidden text-subtle sm:inline">/</span>
          <SelecteurRubrique
            rubriques={rubriques}
            valeur={rubriqueId}
            onChoisir={changerRubrique}
          />

          {/* Fil d'Ariane des pages parentes (masqué sur mobile). */}
          {page.ancetres.length > 0 && (
            <span className="hidden min-w-0 items-center gap-1 md:flex">
              {page.ancetres.map((a) => (
                <span key={a.id} className="flex min-w-0 items-center gap-1">
                  <span className="text-subtle">›</span>
                  <Link
                    href={`${BASE}/${page.rubriqueSlug}/${a.id}`}
                    className="max-w-[10rem] truncate text-sm text-muted transition-colors hover:text-fg"
                  >
                    {a.titre || "Sans titre"}
                  </Link>
                </span>
              ))}
            </span>
          )}

          <SelecteurParent pageId={page.id} parentNom={page.ancetres.at(-1)?.titre ?? null} />
        </>
      }
      actions={
        <>
          <IndicateurSauvegarde
            etat={save.etat}
            dateModif={save.dateModif}
            onReessayer={save.forcer}
          />
          <PartagePage
            pageId={page.id}
            jetonInitial={page.jetonPartage}
            expireLeInitial={page.partageExpireLe}
          />
          <Link href={`${BASE}/${page.rubriqueSlug}/${page.id}/apercu`}>
            <Button type="button" variant="outline" size="sm">
              <Printer className="h-4 w-4" />
              <span className="hidden sm:inline">Aperçu</span>
            </Button>
          </Link>
          {estAdmin && (
            <MenuDocument
              deleting={deleting}
              onSupprimer={handleDelete}
              libelleSupprimer="Supprimer la page"
              avertissement={
                <>
                  « {titre.trim() || "Sans titre"} » et ses fichiers joints seront supprimés
                  définitivement. Ses sous-pages éventuelles remontent d&apos;un cran plutôt que
                  d&apos;être perdues.
                </>
              }
            />
          )}
        </>
      }
      entete={
        <>
          <textarea
            ref={champTitreRef}
            value={titre}
            rows={1}
            onChange={(e) => {
              const v = e.target.value.replace(/\n/g, " ");
              setTitre(v);
              titreRef.current = v;
              save.planifier();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === "ArrowDown") {
                e.preventDefault();
                versLeDocument();
              }
            }}
            placeholder="Sans titre"
            aria-label="Titre de la page"
            className="w-full resize-none overflow-hidden bg-transparent px-0 font-display text-3xl font-bold tracking-tight text-fg outline-none placeholder:text-subtle md:text-4xl"
          />

          <input
            value={resume}
            onChange={(e) => {
              const v = e.target.value;
              setResume(v);
              resumeRef.current = v;
              save.planifier();
            }}
            placeholder="Ajouter une description courte (résumé affiché sur les listes et la recherche)…"
            aria-label="Description de la page"
            className="mt-2 w-full bg-transparent px-0 text-base text-muted outline-none placeholder:text-subtle"
          />

          <EditeurTags tags={tags} suggestions={tousLesTags} onChange={changerTags} />

          <p className="mb-4 mt-2 text-xs text-subtle">
            {page.auteur ? `Par ${page.auteur} · ` : ""}modifiée le {fmtDateHeure(save.dateModif)}
          </p>

          {erreurSuppression && (
            <BandeauAlerte>
              La suppression a échoué — réessayez, ou vérifiez votre connexion.
            </BandeauAlerte>
          )}

          {save.etat === "conflit" && (
            <BandeauConflit phrase="Cette page a été modifiée par quelqu'un d'autre pendant votre édition." />
          )}
        </>
      }
      sommaire={<SommaireNote titres={titres} onNaviguer={naviguerVersBloc} />}
    >
      {/* Pas de documents GED dans le wiki (hors affaire) : le bloc « carte
          lien » n'offre que « Lien web » — cf. NotesContexte, qui adapte le
          sous-titre du menu « / » en conséquence. */}
      <NotesContexte.Provider value={{ documents: [] }}>
        <BlockNoteView
          editor={editor}
          theme={theme}
          slashMenu={false}
          onChange={() => {
            save.planifier();
            majTitres();
          }}
        >
          <SuggestionMenuController
            triggerCharacter="/"
            getItems={async (query) =>
              filterSuggestionItems(itemsMenuSlash(editor, { avecDocumentsGed: false }), query)
            }
          />
        </BlockNoteView>
      </NotesContexte.Provider>
    </CoquilleEditeur>
  );
}

/* --- Sélecteur de rubrique (déplacer la page) -------------------------------- */

function SelecteurRubrique({
  rubriques,
  valeur,
  onChoisir,
}: {
  rubriques: { id: string; slug: string; nom: string }[];
  valeur: string;
  onChoisir: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const courant = rubriques.find((r) => r.id === valeur);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div ref={ref} className="relative min-w-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex min-w-0 items-center gap-1 rounded-md px-1.5 py-1 text-sm font-medium text-fg transition-colors hover:bg-surface-2"
        aria-haspopup="listbox"
        aria-expanded={open}
        title="Changer de rubrique"
      >
        <span className="min-w-0 truncate">{courant?.nom ?? "Rubrique"}</span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-subtle" />
      </button>
      {open && (
        <div
          role="listbox"
          className="anim-note-pop absolute left-0 z-40 mt-1 w-56 rounded-lg border border-border bg-surface p-1 shadow-lg"
        >
          {rubriques.map((r) => (
            <button
              key={r.id}
              type="button"
              role="option"
              aria-selected={r.id === valeur}
              onClick={() => {
                setOpen(false);
                if (r.id !== valeur) onChoisir(r.id);
              }}
              className={`flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left text-sm transition-colors ${
                r.id === valeur ? "bg-brand-soft font-medium text-brand" : "text-fg hover:bg-surface-2"
              }`}
            >
              <span className="min-w-0 truncate">{r.nom}</span>
              {r.id === valeur && <Check className="h-3.5 w-3.5 shrink-0" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* --- Sélecteur de parent (déplacer dans l'arborescence) ---------------------- */

function SelecteurParent({ pageId, parentNom }: { pageId: string; parentNom: string | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [candidats, setCandidats] = useState<CandidatParent[] | null>(null);
  const [chargement, setChargement] = useState(false);
  const [pending, start] = useTransition();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const basculer = async () => {
    const prochain = !open;
    setOpen(prochain);
    if (prochain && candidats === null) {
      setChargement(true);
      try {
        setCandidats(await chargerCandidatsParent(pageId));
      } finally {
        setChargement(false);
      }
    }
  };

  const choisir = (parentId: string | null) => {
    setOpen(false);
    start(async () => {
      await deplacerPage(pageId, parentId, []);
      setCandidats(null); // rechargé à la prochaine ouverture (l'arbre a changé)
      router.refresh();
    });
  };

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={basculer}
        className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-sm text-muted transition-colors hover:bg-surface-2 hover:text-fg"
        title="Ranger cette page dans une autre (arborescence)"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {pending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <FolderTree className="h-3.5 w-3.5" />
        )}
        <span className="hidden lg:inline">Déplacer</span>
      </button>
      {open && (
        <div
          role="listbox"
          className="anim-note-pop absolute left-0 z-40 mt-1 max-h-80 w-64 overflow-y-auto rounded-lg border border-border bg-surface p-1 shadow-lg"
        >
          <p className="px-2.5 py-1 text-[0.7rem] font-medium uppercase tracking-wide text-subtle">
            Ranger sous…
          </p>
          <button
            type="button"
            onClick={() => choisir(null)}
            className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm transition-colors ${
              parentNom === null ? "bg-brand-soft font-medium text-brand" : "text-fg hover:bg-surface-2"
            }`}
          >
            <span className="min-w-0 truncate">— Racine de la rubrique —</span>
            {parentNom === null && <Check className="ml-auto h-3.5 w-3.5 shrink-0" />}
          </button>

          {chargement ? (
            <p className="flex items-center gap-2 px-2.5 py-2 text-sm text-subtle">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Chargement…
            </p>
          ) : candidats && candidats.length > 0 ? (
            candidats.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => choisir(c.id)}
                className="flex w-full items-center gap-1 rounded-md py-1.5 pr-2.5 text-left text-sm text-fg transition-colors hover:bg-surface-2"
                style={{ paddingLeft: `${c.profondeur * 0.85 + 0.625}rem` }}
              >
                {c.profondeur > 0 && <CornerDownRight className="h-3 w-3 shrink-0 text-subtle" />}
                <span className="min-w-0 truncate">{c.titre || "Sans titre"}</span>
              </button>
            ))
          ) : (
            candidats && <p className="px-2.5 py-2 text-sm text-subtle">Aucune autre page.</p>
          )}
        </div>
      )}
    </div>
  );
}

/* --- Éditeur de tags --------------------------------------------------------- */

function EditeurTags({
  tags,
  suggestions,
  onChange,
}: {
  tags: string[];
  suggestions: { nom: string; couleur: string }[];
  onChange: (tags: string[]) => void;
}) {
  const [saisie, setSaisie] = useState("");
  const [ouvert, setOuvert] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ouvert) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOuvert(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [ouvert]);

  const couleurDe = (nom: string) =>
    suggestions.find((s) => s.nom.toLowerCase() === nom.toLowerCase())?.couleur ?? "#a855f7";

  const ajouter = (nomBrut: string) => {
    const nom = nomBrut.trim();
    if (!nom) return;
    if (tags.some((t) => t.toLowerCase() === nom.toLowerCase())) {
      setSaisie("");
      return;
    }
    onChange([...tags, nom]);
    setSaisie("");
  };
  const retirer = (nom: string) => onChange(tags.filter((t) => t !== nom));

  const q = saisie.trim().toLowerCase();
  const proposees = suggestions
    .filter((s) => !tags.some((t) => t.toLowerCase() === s.nom.toLowerCase()))
    .filter((s) => (q ? s.nom.toLowerCase().includes(q) : true))
    .slice(0, 8);

  return (
    <div ref={ref} className="relative mt-2 flex flex-wrap items-center gap-1.5">
      {tags.map((t) => (
        <span
          key={t}
          className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium text-white"
          style={{ backgroundColor: couleurDe(t) }}
        >
          {t}
          <button
            type="button"
            onClick={() => retirer(t)}
            className="opacity-80 hover:opacity-100"
            aria-label={`Retirer le tag ${t}`}
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}

      <div className="relative">
        <button
          type="button"
          onClick={() => setOuvert((o) => !o)}
          className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-2 py-0.5 text-xs font-medium text-muted transition-colors hover:border-brand hover:text-brand"
        >
          <Plus className="h-3 w-3" /> Tag
        </button>

        {ouvert && (
          <div className="anim-note-pop absolute left-0 top-full z-40 mt-1 w-60 rounded-lg border border-border bg-surface p-2 shadow-lg">
            <div className="flex items-center gap-1.5 rounded-md border border-border bg-page px-2 py-1">
              <TagIcon className="h-3.5 w-3.5 text-subtle" />
              <input
                autoFocus
                value={saisie}
                onChange={(e) => setSaisie(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    ajouter(saisie);
                  } else if (e.key === "Escape") {
                    setOuvert(false);
                  }
                }}
                placeholder="Ajouter / créer un tag…"
                className="w-full bg-transparent text-sm text-fg outline-none placeholder:text-subtle"
              />
            </div>

            {proposees.length > 0 && (
              <div className="mt-1 max-h-48 space-y-0.5 overflow-y-auto">
                {proposees.map((s) => (
                  <button
                    key={s.nom}
                    type="button"
                    onClick={() => ajouter(s.nom)}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-fg hover:bg-surface-2"
                  >
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: s.couleur }}
                    />
                    <span className="min-w-0 truncate">{s.nom}</span>
                  </button>
                ))}
              </div>
            )}

            {q && !suggestions.some((s) => s.nom.toLowerCase() === q) && (
              <button
                type="button"
                onClick={() => ajouter(saisie)}
                className="mt-1 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-brand hover:bg-brand-soft"
              >
                <Plus className="h-3.5 w-3.5 shrink-0" /> Créer « {saisie.trim()} »
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
