"use client";

import { useEffect, type RefObject } from "react";
import { Check, Loader2, TriangleAlert } from "lucide-react";
import { filterSuggestionItems } from "@blocknote/core";
import { SuggestionMenuController, useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import "@blocknote/mantine/style.css";
import "@/tools/notes/notes.css";
import "./devis-texte.css";
import { useSauvegardeDocument } from "@/lib/editeur-riche/use-sauvegarde-document";
import { useThemeNote } from "@/tools/notes/theme";
import { NotesContexte } from "@/tools/notes/blocs/contexte";
import { dictionnaireNotes, itemsMenuSlash, schemaNotes } from "@/tools/notes/blocs/schema";
import { sauverTexteLigne } from "./actions";
import { urlMediaDevis, type ContenuRiche } from "./model";

/* L'implémentation BlockNote du texte libre d'une ligne — chargée en dynamic
 * import SANS SSR (ProseMirror manipule le DOM), donc jamais dans le bundle de
 * l'éditeur de devis tant qu'aucune ligne de texte n'est affichée.
 *
 * Le SCHÉMA est celui des notes, sans retouche : un document se rend avec le
 * schéma qui l'a produit, et un bloc collé depuis une note doit s'afficher ici.
 * Seul le MENU « / » est allégé (`sansBlocsTechniques`) — ce qu'on propose
 * n'est pas ce qu'on sait lire. */

/* --- LECTURE ---------------------------------------------------------------- */

/** Rendu lecture seule — monté UNIQUEMENT pour un document réellement riche
 *  (un texte sans mise en forme se rend en `<p>`, cf. texte-riche.tsx). */
export function LectureTexteLigne({ contenu }: { contenu: ContenuRiche }) {
  const theme = useThemeNote();
  const editor = useCreateBlockNote({
    schema: schemaNotes,
    dictionary: dictionnaireNotes,
    initialContent: contenu.length ? (contenu as unknown as never[]) : undefined,
  });

  return (
    <div className="note-doc note-doc-lecture devis-texte">
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

/* --- ÉDITION ---------------------------------------------------------------- */

export interface EditionTexteLigneProps {
  ligneId: string;
  devisId: string;
  /** Document d'ouverture, figé au montage par l'appelant. */
  initial: ContenuRiche;
  version: number;
  majLe: string;
  /** Remonte CHAQUE sauvegarde acceptée : c'est elle qui tient le mode lecture
   *  à jour sans recharger la page, et qui garde la version en phase pour la
   *  prochaine ouverture. */
  onEnregistre: (etat: { contenu: ContenuRiche; version: number; majLe: string }) => void;
  onFermer: () => void;
  /** L'appelant y dépose de quoi vider le debounce avant de fermer. */
  forcerRef: RefObject<() => void>;
}

export function EditionTexteLigne({
  ligneId,
  devisId,
  initial,
  version,
  majLe,
  onEnregistre,
  onFermer,
  forcerRef,
}: EditionTexteLigneProps) {
  const theme = useThemeNote();

  const editor = useCreateBlockNote({
    schema: schemaNotes,
    dictionary: dictionnaireNotes,
    // BlockNote refuse un tableau vide : un texte vierge démarre sans contenu.
    initialContent: initial.length ? (initial as unknown as never[]) : undefined,
    tables: { splitCells: true, cellBackgroundColor: true, cellTextColor: true, headers: true },
    uploadFile: async (file: File) => {
      // L'id est tiré ICI et voyage avec l'envoi : la route est idempotente par
      // UUID, re-tenter un téléversement interrompu ne duplique jamais.
      const mediaId = crypto.randomUUID();
      const fd = new FormData();
      fd.set("mediaId", mediaId);
      fd.set("devisId", devisId);
      fd.set("file", file, file.name);
      const res = await fetch("/api/devis/media", { method: "POST", body: fd });
      if (!res.ok) {
        const corps = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(corps?.error ?? "Téléversement impossible");
      }
      return urlMediaDevis(mediaId);
    },
  });

  const save = useSauvegardeDocument({
    versionInitiale: version,
    dateInitiale: majLe,
    // Appelée depuis un timer : elle lit `editor.document` AU MOMENT DE L'APPEL,
    // jamais une valeur capturée au rendu.
    ecrire: async (versionBase) => {
      const contenu = editor.document as unknown as ContenuRiche;
      const res = await sauverTexteLigne(ligneId, { contenu, versionBase });
      // On rend à l'appelant ce qui est DÉSORMAIS en base — le mode lecture
      // s'affiche à jour sans rechargement, et la prochaine ouverture repart
      // sur la bonne version au lieu de se prendre un faux conflit.
      if (res.ok) onEnregistre({ contenu, version: res.version, majLe: res.updatedAt });
      return res;
    },
  });

  // On ouvre sur un clic : le curseur doit être dans le texte, pas à côté.
  useEffect(() => {
    editor.focus();
  }, [editor]);

  // `forcer` change à chaque rendu (closure sur l'éditeur) : la ref garde la
  // dernière version, celle que la fermeture appellera.
  useEffect(() => {
    forcerRef.current = save.forcer;
  });

  return (
    <div
      className="note-doc devis-texte devis-texte-edition"
      onKeyDown={(e) => {
        // Échap referme — mais pas quand un menu de BlockNote est ouvert : il
        // le consomme d'abord pour se refermer lui-même.
        if (e.key === "Escape" && !e.defaultPrevented) {
          e.stopPropagation();
          onFermer();
        }
      }}
    >
      <NotesContexte.Provider value={{ documents: [] }}>
        <BlockNoteView
          editor={editor}
          theme={theme}
          slashMenu={false}
          onChange={() => save.planifier()}
        >
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

      <div className="mt-1 flex items-center justify-between gap-3 px-1 text-xs text-subtle">
        <span>
          Tapez <kbd className="ref">/</kbd> pour un titre, une liste, un tableau, une image…
        </span>
        <span className="flex items-center gap-3">
          <Etat save={save} />
          <button
            type="button"
            onClick={onFermer}
            className="text-xs text-muted underline-offset-2 hover:text-fg hover:underline"
          >
            Terminer
          </button>
        </span>
      </div>
    </div>
  );
}

function Etat({ save }: { save: { etat: string; dateModif: string } }) {
  if (save.etat === "encours") {
    return (
      <span className="inline-flex items-center gap-1">
        <Loader2 className="h-3 w-3 animate-spin" /> Enregistrement…
      </span>
    );
  }
  if (save.etat === "erreur") {
    return (
      <span className="inline-flex items-center gap-1 text-danger">
        <TriangleAlert className="h-3 w-3" /> Non enregistré
      </span>
    );
  }
  if (save.etat === "conflit") {
    return (
      <span className="inline-flex items-center gap-1 text-warning">
        <TriangleAlert className="h-3 w-3" /> Modifié ailleurs — rechargez la page
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1" title={`Enregistré le ${save.dateModif}`}>
      <Check className="h-3 w-3" /> Enregistré
    </span>
  );
}
