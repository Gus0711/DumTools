"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Briefcase,
  Check,
  Hash,
  Loader2,
  MoreHorizontal,
  Printer,
  RefreshCw,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { filterSuggestionItems } from "@blocknote/core";
import { SuggestionMenuController, useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import "@blocknote/mantine/style.css";
import "./notes.css";
import { Button } from "@/ui";
import { sauverNote, supprimerNote } from "./actions";
import { urlMediaNote, type NoteContenu } from "./model";
import { useThemeNote } from "./theme";
import { NotesContexte, type DocumentGedOption } from "./blocs/contexte";
import { dictionnaireNotes, itemsMenuSlash, schemaNotes } from "./blocs/schema";
import { PartageNote } from "./partage";
import { SommaireNote, extraireTitres, signatureTitres, type TitreSommaire } from "./sommaire";
import type { NoteEditeurProps } from "./editeur";

type EtatSave = "sauve" | "encours" | "erreur" | "conflit";

function fmtHeure(iso: string): string {
  return new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

function fmtDateHeure(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString("fr-FR")} à ${fmtHeure(iso)}`;
}

export function NoteEditeurImpl({ note, documents }: NoteEditeurProps) {
  const router = useRouter();
  const theme = useThemeNote();
  const [titre, setTitre] = useState(note.titre);
  const [etat, setEtat] = useState<EtatSave>("sauve");
  const [dateModif, setDateModif] = useState(note.updatedAt);
  const [titres, setTitres] = useState<TitreSommaire[]>([]);

  // La sauvegarde lit via des refs (le timer du debounce capture une closure).
  const titreRef = useRef(note.titre);
  const versionRef = useRef(note.version);
  const conflitRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const etatRef = useRef<EtatSave>("sauve");
  useEffect(() => {
    etatRef.current = etat;
  }, [etat]);
  // Une seule sauvegarde en vol : deux saves concurrents sur la même version
  // de base feraient conclure à tort à un conflit (le 2e perd la course).
  const enVolRef = useRef(false);
  const relanceRef = useRef(false);

  const champTitreRef = useRef<HTMLTextAreaElement>(null);
  const titresSigRef = useRef("");

  const editor = useCreateBlockNote({
    schema: schemaNotes,
    dictionary: dictionnaireNotes,
    // BlockNote refuse un tableau vide : une note vierge démarre sans contenu.
    initialContent: note.contenu.length ? (note.contenu as unknown as never[]) : undefined,
    tables: { splitCells: true, cellBackgroundColor: true, cellTextColor: true, headers: true },
    uploadFile: async (file: File) => {
      const mediaId = crypto.randomUUID();
      const fd = new FormData();
      fd.set("mediaId", mediaId);
      fd.set("noteId", note.id);
      fd.set("file", file, file.name);
      const res = await fetch("/api/notes/media", { method: "POST", body: fd });
      if (!res.ok) {
        const corps = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(corps?.error ?? "Téléversement impossible");
      }
      return urlMediaNote(mediaId);
    },
  });

  async function sauver() {
    if (conflitRef.current) return;
    if (enVolRef.current) {
      relanceRef.current = true;
      return;
    }
    enVolRef.current = true;
    setEtat("encours");
    try {
      const res = await sauverNote(note.id, {
        titre: titreRef.current,
        contenu: editor.document as unknown as NoteContenu,
        versionBase: versionRef.current,
      });
      if (res.ok) {
        versionRef.current = res.version;
        setDateModif(res.updatedAt);
        setEtat("sauve");
      } else {
        // Quelqu'un a sauvé entre-temps : on cesse d'écrire jusqu'au rechargement.
        conflitRef.current = true;
        setEtat("conflit");
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
  }

  const planifierSave = () => {
    if (conflitRef.current) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      void sauver();
    }, 700);
  };

  /** Sauvegarde immédiate (Ctrl+S, changement d'onglet, bouton Réessayer).
   *  Réaffectée après chaque rendu pour capturer le `sauver` courant. */
  const flushRef = useRef<() => void>(() => {});
  useEffect(() => {
    flushRef.current = () => {
      if (conflitRef.current) return;
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      void sauver();
    };
  });

  const nonSauve = () =>
    timerRef.current !== null || etatRef.current === "encours" || etatRef.current === "erreur";

  // Filets anti-perte : Ctrl+S force le save, un onglet qui passe en arrière-
  // plan vide le debounce en cours, et fermer avec des modifs non écrites
  // déclenche l'avertissement natif du navigateur.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === "s") {
        e.preventDefault();
        flushRef.current();
      }
    };
    const onCache = () => {
      if (document.visibilityState === "hidden" && timerRef.current) flushRef.current();
    };
    const onAvantFermeture = (e: BeforeUnloadEvent) => {
      if (nonSauve()) {
        e.preventDefault();
        e.returnValue = ""; // navigateurs plus anciens
      }
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("visibilitychange", onCache);
    window.addEventListener("pagehide", onCache);
    window.addEventListener("beforeunload", onAvantFermeture);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("visibilitychange", onCache);
      window.removeEventListener("pagehide", onCache);
      window.removeEventListener("beforeunload", onAvantFermeture);
    };
  }, []);

  // Sommaire : recalculé au fil de l'eau, mais l'état ne bouge que si les
  // titres changent vraiment (pas de re-rendu à chaque frappe).
  const majTitres = () => {
    const t = extraireTitres(editor.document as unknown[]);
    const sig = signatureTitres(t);
    if (sig !== titresSigRef.current) {
      titresSigRef.current = sig;
      setTitres(t);
    }
  };
  // État initial du sommaire (les mises à jour suivantes passent par onChange).
  useEffect(majTitres, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Le titre est un textarea auto-dimensionné (un titre long passe à la ligne
  // au lieu d'être tronqué, comme dans Notion).
  useEffect(() => {
    const el = champTitreRef.current;
    if (!el) return;
    el.style.height = "0";
    el.style.height = `${el.scrollHeight}px`;
  }, [titre]);

  // Note fraîchement créée : le titre par défaut est présélectionné — taper
  // remplace « Nouvelle note » directement.
  useEffect(() => {
    if (note.titre === "Nouvelle note" && note.contenu.length === 0) {
      champTitreRef.current?.focus();
      champTitreRef.current?.select();
    }
  }, [note.titre, note.contenu.length]);

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
        await supprimerNote(note.id);
        router.push(`/affaires/${note.chantierId}`);
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
    <div className="relative">
      {/* ---- Barre de chrome (sticky) ---------------------------------------- */}
      <div className="sticky top-0 z-30 border-b border-border-soft bg-page/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-4xl items-center gap-2 px-4 py-2 md:px-8">
          <Link
            href={`/affaires/${note.chantierId}`}
            className="group inline-flex min-w-0 items-center gap-1.5 text-sm text-muted transition-colors hover:text-fg"
            title={`Retour à l'affaire ${note.affaireNom}`}
          >
            <ArrowLeft className="h-4 w-4 shrink-0 transition-transform group-hover:-translate-x-0.5" />
            <Briefcase className="h-3.5 w-3.5 shrink-0" />
            <span className="min-w-0 truncate">{note.affaireNom}</span>
          </Link>
          <span className="hidden text-subtle sm:inline">·</span>
          <span className="hidden min-w-0 truncate text-sm text-muted sm:inline">
            {note.clientNom}
          </span>
          {note.numeroWhy && (
            <span className="hidden shrink-0 items-center gap-1 rounded bg-surface-2 px-1.5 py-0.5 text-xs font-medium text-fg md:inline-flex">
              <Hash className="h-3 w-3 text-subtle" />
              {note.numeroWhy}
            </span>
          )}

          <span className="ml-auto flex shrink-0 items-center gap-2">
            <EtatSauvegarde etat={etat} dateModif={dateModif} onReessayer={() => flushRef.current()} />
            <PartageNote noteId={note.id} jetonInitial={note.jetonPartage} />
            <Link href={`/outils/notes/${note.id}/apercu`}>
              <Button type="button" variant="outline" size="sm">
                <Printer className="h-4 w-4" />
                <span className="hidden sm:inline">Aperçu</span>
              </Button>
            </Link>
            <MenuNote titre={titre} deleting={deleting} onSupprimer={handleDelete} />
          </span>
        </div>
      </div>

      {/* ---- Document --------------------------------------------------------- */}
      <div className="mx-auto max-w-4xl px-4 pb-10 pt-8 md:px-8">
        <textarea
          ref={champTitreRef}
          value={titre}
          rows={1}
          onChange={(e) => {
            const v = e.target.value.replace(/\n/g, " ");
            setTitre(v);
            titreRef.current = v;
            planifierSave();
          }}
          onKeyDown={(e) => {
            // Entrée ou ↓ : on descend dans le document (le titre reste une ligne logique).
            if (e.key === "Enter" || e.key === "ArrowDown") {
              e.preventDefault();
              versLeDocument();
            }
          }}
          placeholder="Sans titre"
          aria-label="Titre de la note"
          className="w-full resize-none overflow-hidden bg-transparent px-0 font-display text-3xl font-bold tracking-tight text-fg outline-none placeholder:text-subtle md:text-4xl"
        />
        <p className="mb-4 mt-1.5 text-xs text-subtle">
          {note.auteur ? `Par ${note.auteur} · ` : ""}modifiée le {fmtDateHeure(dateModif)}
        </p>

        {erreurSuppression && (
          <div className="anim-note-pop mb-4 flex items-center gap-2 rounded-lg border border-danger/45 bg-danger/10 px-4 py-2.5 text-sm text-danger">
            <TriangleAlert className="h-4 w-4 shrink-0" />
            La suppression a échoué — réessayez, ou vérifiez votre connexion.
          </div>
        )}

        {etat === "conflit" && (
          <div className="anim-note-pop mb-4 flex items-center gap-2 rounded-lg border border-danger/45 bg-danger/10 px-4 py-2.5 text-sm text-danger">
            <TriangleAlert className="h-4 w-4 shrink-0" />
            <span className="flex-1">
              Cette note a été modifiée par quelqu&apos;un d&apos;autre pendant votre édition. Vos
              dernières modifications ne sont <strong>pas enregistrées</strong> — rechargez pour
              repartir de la version à jour.
            </span>
            <Button type="button" size="sm" variant="outline" onClick={() => window.location.reload()}>
              Recharger
            </Button>
          </div>
        )}

        <div className="note-doc -mx-4 md:-mx-8">
          <NotesContexte.Provider value={{ documents }}>
            <BlockNoteView
              editor={editor}
              theme={theme}
              slashMenu={false}
              onChange={() => {
                planifierSave();
                majTitres();
              }}
            >
              <SuggestionMenuController
                triggerCharacter="/"
                getItems={async (query) => filterSuggestionItems(itemsMenuSlash(editor), query)}
              />
            </BlockNoteView>
          </NotesContexte.Provider>
        </div>
      </div>

      <SommaireNote titres={titres} onNaviguer={naviguerVersBloc} />
    </div>
  );
}

/* --- État de sauvegarde -----------------------------------------------------
 * Discret quand tout va bien (texte gris + coche), voyant quand ça casse :
 * l'erreur réseau devient un bouton « Réessayer », le conflit reste en rouge. */

function EtatSauvegarde({
  etat,
  dateModif,
  onReessayer,
}: {
  etat: EtatSave;
  dateModif: string;
  onReessayer: () => void;
}) {
  if (etat === "conflit") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-danger/15 px-2.5 py-1 text-xs font-medium text-danger">
        <TriangleAlert className="h-3.5 w-3.5" /> Conflit
      </span>
    );
  }
  if (etat === "erreur") {
    return (
      <button
        type="button"
        onClick={onReessayer}
        className="inline-flex items-center gap-1.5 rounded-full bg-danger/15 px-2.5 py-1 text-xs font-medium text-danger transition-colors hover:bg-danger/25"
        title="La sauvegarde a échoué — cliquer pour réessayer"
      >
        <TriangleAlert className="h-3.5 w-3.5" /> Non enregistré
        <span className="inline-flex items-center gap-1 border-l border-danger/30 pl-1.5">
          <RefreshCw className="h-3 w-3" /> Réessayer
        </span>
      </button>
    );
  }
  if (etat === "encours") {
    return (
      <span className="inline-flex items-center gap-1 px-1 text-xs font-medium text-subtle">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Enregistrement…
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1 px-1 text-xs font-medium text-subtle"
      title={`Dernier enregistrement le ${fmtDateHeure(dateModif)}`}
    >
      <Check className="h-3.5 w-3.5 text-success" /> Enregistré
      <span className="hidden tabular-nums lg:inline">· {fmtHeure(dateModif)}</span>
    </span>
  );
}

/* --- Menu « ⋯ » ---------------------------------------------------------------
 * Les actions destructrices vivent ici, en deux temps (pas de confirm() natif) :
 * « Supprimer la note » → volet de confirmation explicite dans le même menu. */

function MenuNote({
  titre,
  deleting,
  onSupprimer,
}: {
  titre: string;
  deleting: boolean;
  onSupprimer: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [confirme, setConfirme] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setConfirme(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        setConfirme(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => {
          setOpen((o) => !o);
          setConfirme(false);
        }}
        aria-label="Plus d'actions"
        aria-expanded={open}
      >
        {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreHorizontal className="h-4 w-4" />}
      </Button>

      {open && (
        <div className="anim-note-pop absolute right-0 z-40 mt-2 w-64 rounded-lg border border-border bg-surface p-1.5 shadow-lg">
          {!confirme ? (
            <button
              type="button"
              onClick={() => setConfirme(true)}
              className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm text-danger transition-colors hover:bg-danger/10"
            >
              <Trash2 className="h-4 w-4 shrink-0" /> Supprimer la note
            </button>
          ) : (
            <div className="p-1.5">
              <p className="mb-2 text-xs text-muted">
                « {titre.trim() || "Sans titre"} » et ses fichiers joints seront supprimés
                définitivement — y compris son lien public éventuel.
              </p>
              <div className="flex items-center justify-end gap-1.5">
                <Button type="button" variant="outline" size="sm" onClick={() => setConfirme(false)}>
                  Annuler
                </Button>
                <Button
                  type="button"
                  variant="danger"
                  size="sm"
                  disabled={deleting}
                  onClick={() => {
                    setOpen(false);
                    setConfirme(false);
                    onSupprimer();
                  }}
                >
                  <Trash2 className="h-4 w-4" /> Supprimer
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export type { DocumentGedOption };
