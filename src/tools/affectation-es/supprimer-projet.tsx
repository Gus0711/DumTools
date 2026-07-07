"use client";

import { Trash2 } from "lucide-react";
import { supprimerProjet } from "./actions";

export function SupprimerProjet({ id }: { id: string }) {
  return (
    <button
      type="button"
      aria-label="Supprimer le projet"
      onClick={async () => {
        if (confirm("Supprimer définitivement ce projet ?")) {
          await supprimerProjet(id);
        }
      }}
      className="inline-flex h-8 w-8 items-center justify-center rounded-md text-subtle transition-colors hover:bg-danger/12 hover:text-danger"
    >
      <Trash2 className="h-4 w-4" />
    </button>
  );
}
