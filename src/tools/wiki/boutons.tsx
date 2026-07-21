"use client";

import { useTransition } from "react";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/ui";
import { creerPage } from "./actions";

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
