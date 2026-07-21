"use client";

import { createContext, useContext } from "react";

/** Un document GED de la même affaire, proposé par le bloc « lien » (carte
 *  Document). L'URL de téléchargement reste authentifiée : dans une note
 *  partagée publiquement, la carte s'affiche mais le fichier exige une session. */
export interface DocumentGedOption {
  id: string;
  nom: string;
  categorie: string;
}

/** Contexte fourni par l'éditeur aux blocs custom (les composants de bloc ne
 *  reçoivent que block/editor via BlockNote — le reste passe par ici). */
export const NotesContexte = createContext<{ documents: DocumentGedOption[] }>({
  documents: [],
});

export const useNotesContexte = () => useContext(NotesContexte);
