"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, Loader2, Trash2, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { Button, Input } from "@/ui";
import { TitreEcran } from "@/components/app-shell/contexte-ecran";
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
    <div className="anim-rise mb-6">
      <TitreEcran estampille="Client" titre={nom} />
      <Link
        href="/clients"
        className="group -my-1 mb-1.5 inline-flex min-h-[2.5rem] items-center gap-1.5 py-1 text-sm text-muted transition-colors hover:text-fg sm:my-0 sm:mb-2.5 sm:min-h-0 sm:py-0"
      >
        <ArrowLeft className="h-4 w-4 transition-transform duration-150 group-hover:-translate-x-0.5" />
        Clients
      </Link>
      <div className="bloc flex flex-wrap items-end justify-between gap-3 px-4 py-4 md:px-6">
        <span aria-hidden className="rule-signal anim-sweep absolute inset-x-0 top-0 z-10 h-[3px]" />
        <label className="min-w-0 flex-1 space-y-1">
          <span className="stamp">Nom du client</span>
          <div className="flex items-center gap-2">
            <Input
              value={valeur}
              onChange={(e) => setValeur(e.target.value)}
              className="max-w-md rounded-none border-0 border-b border-transparent bg-transparent px-0 font-display text-[clamp(1.35rem,1rem+1.4vw,2.2rem)] font-bold tracking-[-0.03em] shadow-none hover:border-border focus:border-brand focus:ring-0"
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
