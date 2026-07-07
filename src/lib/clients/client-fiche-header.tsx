"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, Loader2, Trash2, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { Button, Input } from "@/ui";
import { renommerClient, supprimerClient } from "./actions";

export function ClientFicheHeader({ id, nom }: { id: string; nom: string }) {
  const router = useRouter();
  const [valeur, setValeur] = useState(nom);
  const [erreur, setErreur] = useState("");
  const [pending, start] = useTransition();

  const modifie = valeur.trim() !== nom && valeur.trim().length > 0;

  function enregistrer() {
    setErreur("");
    start(async () => {
      const res = await renommerClient(id, valeur);
      if (!res.ok) {
        setErreur(res.error ?? "Erreur");
        return;
      }
      router.refresh();
    });
  }

  function supprimer() {
    if (
      !confirm(
        "Supprimer ce client du référentiel ? Les documents rattachés sont conservés (ils perdent leur lien client).",
      )
    )
      return;
    start(async () => {
      await supprimerClient(id);
    });
  }

  return (
    <div className="mb-6">
      <Link
        href="/clients"
        className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg"
      >
        <ArrowLeft className="h-4 w-4" /> Clients
      </Link>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <label className="space-y-1">
          <span className="text-xs font-medium text-muted">Nom du client</span>
          <div className="flex items-center gap-2">
            <Input
              value={valeur}
              onChange={(e) => setValeur(e.target.value)}
              className="h-10 w-72 text-lg font-semibold"
            />
            {modifie && (
              <Button size="sm" onClick={enregistrer} disabled={pending}>
                {pending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
                Renommer
              </Button>
            )}
          </div>
        </label>
        <Button
          variant="ghost"
          size="sm"
          onClick={supprimer}
          disabled={pending}
          className="text-danger hover:bg-danger/12"
        >
          <Trash2 className="h-4 w-4" /> Supprimer
        </Button>
      </div>
      {erreur && (
        <p className="mt-2 flex items-center gap-1.5 text-sm text-danger">
          <TriangleAlert className="h-4 w-4" /> {erreur}
        </p>
      )}
    </div>
  );
}
