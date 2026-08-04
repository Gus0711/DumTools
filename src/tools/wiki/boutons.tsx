"use client";

import { useTransition } from "react";
import { Loader2, Plus, StickyNote } from "lucide-react";
import { Button } from "@/ui";
import { creerNoteRapide, creerPage } from "./actions";

/** Crée une page vierge dans la rubrique et ouvre l'éditeur. */
export function NouvellePage({ rubriqueId }: { rubriqueId: string }) {
  const [pending, start] = useTransition();
  return (
    <Button
      type="button"
      disabled={pending}
      onClick={() => start(async () => { await creerPage(rubriqueId); })}
    >
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
      Nouvelle page
    </Button>
  );
}

/**
 * Note à la volée : un clic, et on écrit. Aucune rubrique à choisir, aucun
 * titre à trouver — la page atterrit dans « Notes rapides », titrée de la date
 * du jour, curseur prêt. C'est le geste qui remplace le post-it.
 */
export function NoteRapide({ variant = "outline" }: { variant?: "outline" | "primary" }) {
  const [pending, start] = useTransition();
  return (
    <Button
      type="button"
      variant={variant}
      disabled={pending}
      title="Créer une note rapide (rubrique « Notes rapides »)"
      onClick={() => start(async () => { await creerNoteRapide(); })}
    >
      {pending ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <StickyNote className="h-4 w-4" />
      )}
      Note rapide
    </Button>
  );
}
