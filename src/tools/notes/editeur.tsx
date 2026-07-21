"use client";

import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";
import type { NoteContenu } from "./model";
import type { DocumentGedOption } from "./blocs/contexte";

/* BlockNote ne se rend que côté client (ProseMirror manipule le DOM) : on
 * charge l'éditeur en dynamic import SANS SSR — la page serveur ne livre
 * qu'un squelette, l'éditeur s'hydrate ensuite. */

export interface NoteEditeurProps {
  note: {
    id: string;
    titre: string;
    contenu: NoteContenu;
    version: number;
    jetonPartage: string | null;
    chantierId: string;
    affaireNom: string;
    clientNom: string;
    numeroWhy: string | null;
    auteur: string | null;
    /** ISO — date de dernière modification (affichée sous le titre). */
    updatedAt: string;
  };
  documents: DocumentGedOption[];
}

const Impl = dynamic(() => import("./editeur-impl").then((m) => m.NoteEditeurImpl), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center gap-2 py-24 text-muted">
      <Loader2 className="h-5 w-5 animate-spin" /> Chargement de la note…
    </div>
  ),
});

export function NoteEditeur(props: NoteEditeurProps) {
  return <Impl {...props} />;
}
