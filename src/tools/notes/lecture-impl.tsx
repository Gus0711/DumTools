"use client";

import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import "@blocknote/mantine/style.css";
import "./notes.css";
import { useThemeNote } from "./theme";
import { dictionnaireNotes, schemaNotes } from "./blocs/schema";
import type { NoteLectureProps } from "./lecture";

/** Rendu LECTURE SEULE d'un document de note — même schéma que l'éditeur, donc
 *  rendu identique (aperçu avant impression, page publique /n/[jeton]). */
export function NoteLectureImpl({ contenu, themeForce }: NoteLectureProps) {
  const themeApp = useThemeNote();
  const editor = useCreateBlockNote({
    schema: schemaNotes,
    dictionary: dictionnaireNotes,
    initialContent: contenu.length ? (contenu as unknown as never[]) : undefined,
  });

  if (contenu.length === 0) {
    return <p className="py-8 text-center text-sm text-muted">Cette note est vide.</p>;
  }

  return (
    <div className="note-doc note-doc-lecture">
      <BlockNoteView
        editor={editor}
        editable={false}
        theme={themeForce ?? themeApp}
        sideMenu={false}
        formattingToolbar={false}
        slashMenu={false}
        linkToolbar={false}
        filePanel={false}
        tableHandles={false}
      />
    </div>
  );
}
