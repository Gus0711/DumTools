"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Briefcase, Hash, Printer } from "lucide-react";
import { filterSuggestionItems } from "@blocknote/core";
import { SuggestionMenuController, useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import "@blocknote/mantine/style.css";
import "./notes.css";
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
import { sauverNote, supprimerNote } from "./actions";
import { urlMediaNote, type NoteContenu } from "./model";
import { useThemeNote } from "./theme";
import { NotesContexte, type DocumentGedOption } from "./blocs/contexte";
import { dictionnaireNotes, itemsMenuSlash, schemaNotes } from "./blocs/schema";
import { PartageNote } from "./partage";
import { SommaireNote, extraireTitres, signatureTitres, type TitreSommaire } from "./sommaire";
import type { NoteEditeurProps } from "./editeur";

export function NoteEditeurImpl({ note, documents }: NoteEditeurProps) {
  const router = useRouter();
  const theme = useThemeNote();
  const [titre, setTitre] = useState(note.titre);
  const [titres, setTitres] = useState<TitreSommaire[]>([]);

  // La sauvegarde part d'un timer : elle lit le titre par une ref, jamais par
  // l'état (le debounce capture une closure — cf. use-sauvegarde-document).
  const titreRef = useRef(note.titre);
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

  const save = useSauvegardeDocument({
    versionInitiale: note.version,
    dateInitiale: note.updatedAt,
    ecrire: (versionBase) =>
      sauverNote(note.id, {
        titre: titreRef.current,
        contenu: editor.document as unknown as NoteContenu,
        versionBase,
      }),
  });

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
    <CoquilleEditeur
      classeSignal="signal-ao"
      fil={
        <>
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
        </>
      }
      actions={
        <>
          <IndicateurSauvegarde
            etat={save.etat}
            dateModif={save.dateModif}
            onReessayer={save.forcer}
          />
          <PartageNote
            noteId={note.id}
            jetonInitial={note.jetonPartage}
            expireLeInitial={note.partageExpireLe}
          />
          <Link href={`/outils/notes/${note.id}/apercu`}>
            <Button type="button" variant="outline" size="sm">
              <Printer className="h-4 w-4" />
              <span className="hidden sm:inline">Aperçu</span>
            </Button>
          </Link>
          <MenuDocument
            deleting={deleting}
            onSupprimer={handleDelete}
            libelleSupprimer="Supprimer la note"
            avertissement={
              <>
                « {titre.trim() || "Sans titre"} » et ses fichiers joints seront supprimés
                définitivement — y compris son lien public éventuel.
              </>
            }
          />
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
            {note.auteur ? `Par ${note.auteur} · ` : ""}modifiée le {fmtDateHeure(save.dateModif)}
          </p>

          {erreurSuppression && (
            <BandeauAlerte>
              La suppression a échoué — réessayez, ou vérifiez votre connexion.
            </BandeauAlerte>
          )}

          {save.etat === "conflit" && (
            <BandeauConflit phrase="Cette note a été modifiée par quelqu'un d'autre pendant votre édition." />
          )}
        </>
      }
      sommaire={<SommaireNote titres={titres} onNaviguer={naviguerVersBloc} />}
    >
      <NotesContexte.Provider value={{ documents }}>
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
            getItems={async (query) => filterSuggestionItems(itemsMenuSlash(editor), query)}
          />
        </BlockNoteView>
      </NotesContexte.Provider>
    </CoquilleEditeur>
  );
}

export type { DocumentGedOption };
