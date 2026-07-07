"use client";

import { Trash2 } from "lucide-react";
import { supprimerDocument } from "./actions";

export function SupprimerListe({ id }: { id: string }) {
  return (
    <button
      type="button"
      aria-label="Supprimer la liste"
      onClick={async () => {
        if (confirm("Supprimer définitivement cette liste ?")) {
          await supprimerDocument(id);
        }
      }}
      className="inline-flex h-8 w-8 items-center justify-center rounded-md text-subtle transition-colors hover:bg-danger/12 hover:text-danger"
    >
      <Trash2 className="h-4 w-4" />
    </button>
  );
}
