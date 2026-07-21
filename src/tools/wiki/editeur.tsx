"use client";

import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";
import type { WikiContenu } from "./model";

/* BlockNote ne se rend que côté client (ProseMirror manipule le DOM) : on
 * charge l'éditeur en dynamic import SANS SSR — la page serveur ne livre qu'un
 * squelette, l'éditeur s'hydrate ensuite. Même moteur que l'outil Notes. */

export interface WikiEditeurProps {
  page: {
    id: string;
    titre: string;
    resume: string;
    contenu: WikiContenu;
    version: number;
    rubriqueId: string;
    rubriqueSlug: string;
    rubriqueNom: string;
    parentId: string | null;
    /** Ancêtres (racine → parent direct) pour le fil d'Ariane. */
    ancetres: { id: string; titre: string }[];
    tags: string[];
    auteur: string | null;
    /** ISO — date de dernière modification (affichée sous le titre). */
    updatedAt: string;
  };
  /** Rubriques (pour déplacer la page). */
  rubriques: { id: string; slug: string; nom: string }[];
  /** Tags existants (suggestions à la saisie). */
  tousLesTags: { nom: string; couleur: string }[];
  /** Seuls les administrateurs peuvent supprimer une page. */
  estAdmin: boolean;
}

const Impl = dynamic(() => import("./editeur-impl").then((m) => m.WikiEditeurImpl), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center gap-2 py-24 text-muted">
      <Loader2 className="h-5 w-5 animate-spin" /> Chargement de la page…
    </div>
  ),
});

export function WikiEditeur(props: WikiEditeurProps) {
  return <Impl {...props} />;
}
