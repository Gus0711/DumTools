"use client";

import { useEffect, type RefObject } from "react";
import { Check, Loader2, TriangleAlert } from "lucide-react";
import { filterSuggestionItems } from "@blocknote/core";
import { SuggestionMenuController, useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import "@blocknote/mantine/style.css";
import "@/tools/notes/notes.css";
import "./corps-tache.css";
import { useSauvegardeDocument } from "@/lib/editeur-riche/use-sauvegarde-document";
import { useThemeNote } from "@/tools/notes/theme";
import { NotesContexte } from "@/tools/notes/blocs/contexte";
import { dictionnaireNotes, itemsMenuSlash, schemaNotes } from "@/tools/notes/blocs/schema";
import type { NoteContenu } from "@/tools/notes/model";
import { sauverCorpsTache } from "./taches-actions";
import { urlMediaTache } from "./taches";

/* L'implémentation BlockNote du corps d'une tâche — chargée en dynamic import
 * SANS SSR (ProseMirror manipule le DOM), donc absente du bundle de l'écran
 * tant qu'aucun corps n'est ouvert.
 *
 * Le SCHÉMA est celui des notes, sans retouche : un document se rend avec le
 * schéma qui l'a produit, et un bloc collé depuis une note doit s'afficher ici.
 * Seul le MENU « / » est allégé — ce qu'on PROPOSE n'est pas ce qu'on sait LIRE.
 */

export function LectureCorpsTache({ contenu }: { contenu: NoteContenu }) {
  const theme = useThemeNote();
  const editor = useCreateBlockNote({
    schema: schemaNotes,
    dictionary: dictionnaireNotes,
    initialContent: contenu.length ? (contenu as unknown as never[]) : undefined,
  });

  return (
    <div className="note-doc note-doc-lecture corps-tache">
      <NotesContexte.Provider value={{ documents: [] }}>
        <BlockNoteView
          editor={editor}
          editable={false}
          theme={theme}
          sideMenu={false}
          formattingToolbar={false}
          slashMenu={false}
          linkToolbar={false}
          filePanel={false}
          tableHandles={false}
        />
      </NotesContexte.Provider>
    </div>
  );
}

export interface EditionCorpsTacheProps {
  tacheId: string;
  /** Document d'ouverture, figé au montage par l'appelant. */
  initial: NoteContenu;
  version: number;
  majLe: string;
  /** Remonte CHAQUE sauvegarde acceptée : c'est elle qui tient la lecture à
   *  jour sans recharger, et la version en phase pour la prochaine ouverture. */
  onEnregistre: (etat: { contenu: NoteContenu; version: number; majLe: string }) => void;
  /** L'appelant y dépose de quoi vider le debounce avant de replier. */
  forcerRef: RefObject<() => void>;
}

export function EditionCorpsTache({
  tacheId,
  initial,
  version,
  majLe,
  onEnregistre,
  forcerRef,
}: EditionCorpsTacheProps) {
  const theme = useThemeNote();

  const editor = useCreateBlockNote({
    schema: schemaNotes,
    dictionary: dictionnaireNotes,
    // BlockNote refuse un tableau vide : un corps vierge démarre sans contenu.
    initialContent: initial.length ? (initial as unknown as never[]) : undefined,
    tables: { splitCells: true, cellBackgroundColor: true, cellTextColor: true, headers: true },
    uploadFile: async (file: File) => {
      // L'id est tiré ICI et voyage avec l'envoi : la route est idempotente par
      // UUID, re-tenter un téléversement interrompu ne duplique jamais.
      const mediaId = crypto.randomUUID();
      const fd = new FormData();
      fd.set("mediaId", mediaId);
      fd.set("tacheId", tacheId);
      fd.set("file", file, file.name);
      const res = await fetch("/api/taches/media", { method: "POST", body: fd });
      if (!res.ok) {
        const corps = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(corps?.error ?? "Téléversement impossible");
      }
      return urlMediaTache(mediaId);
    },
  });

  const save = useSauvegardeDocument({
    versionInitiale: version,
    dateInitiale: majLe,
    // Appelée depuis un timer : elle lit `editor.document` AU MOMENT DE L'APPEL,
    // jamais une valeur capturée au rendu.
    ecrire: async (versionBase) => {
      const contenu = editor.document as unknown as NoteContenu;
      const res = await sauverCorpsTache(tacheId, { contenu, versionBase });
      if (res.ok) onEnregistre({ contenu, version: res.version, majLe: res.updatedAt });
      return res;
    },
  });

  useEffect(() => {
    editor.focus();
  }, [editor]);

  // `forcer` change à chaque rendu (closure sur l'éditeur) : la ref garde la
  // dernière version, celle que le repli appellera.
  useEffect(() => {
    forcerRef.current = save.forcer;
  });

  return (
    <div className="note-doc corps-tache corps-tache-edition">
      <NotesContexte.Provider value={{ documents: [] }}>
        <BlockNoteView editor={editor} theme={theme} slashMenu={false} onChange={() => save.planifier()}>
          <SuggestionMenuController
            triggerCharacter="/"
            getItems={async (query) =>
              filterSuggestionItems(
                itemsMenuSlash(editor, { avecDocumentsGed: false, sansBlocsTechniques: true }),
                query,
              )
            }
          />
        </BlockNoteView>
      </NotesContexte.Provider>

      <div className="mt-1 flex flex-wrap items-center justify-between gap-3 px-1 text-xs text-subtle">
        <span>
          <kbd className="ref">/</kbd> pour une liste à cocher, un titre, un tableau, une image —
          ou collez une photo.
        </span>
        <Etat save={save} />
      </div>
    </div>
  );
}

function Etat({ save }: { save: { etat: string; dateModif: string } }) {
  if (save.etat === "encours")
    return (
      <span className="inline-flex items-center gap-1">
        <Loader2 className="h-3 w-3 animate-spin" /> Enregistrement…
      </span>
    );
  if (save.etat === "erreur")
    return (
      <span className="inline-flex items-center gap-1 text-danger">
        <TriangleAlert className="h-3 w-3" /> Non enregistré
      </span>
    );
  if (save.etat === "conflit")
    return (
      <span className="inline-flex items-center gap-1 text-warning">
        <TriangleAlert className="h-3 w-3" /> Modifié ailleurs — rechargez la page
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1" title={`Enregistré le ${save.dateModif}`}>
      <Check className="h-3 w-3" /> Enregistré
    </span>
  );
}
