"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2 } from "lucide-react";
import { supprimerProjet } from "./actions";

export function SupprimerProjet({ id }: { id: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function onDelete() {
    if (!confirm("Supprimer définitivement ce projet ?")) return;
    startTransition(async () => {
      try {
        await supprimerProjet(id);
        router.refresh();
      } catch {
        alert("La suppression a échoué.");
      }
    });
  }

  return (
    <button
      type="button"
      aria-label="Supprimer le projet"
      disabled={pending}
      onClick={onDelete}
      className="inline-flex h-8 w-8 items-center justify-center rounded-md text-subtle transition-colors hover:bg-danger/12 hover:text-danger disabled:opacity-50"
    >
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
    </button>
  );
}
