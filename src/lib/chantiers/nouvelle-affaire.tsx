"use client";

import { useMemo, useState, useTransition } from "react";
import { Check, Loader2, Plus, TriangleAlert, X } from "lucide-react";
import { Button, Combobox, Input, Label, type ComboOption } from "@/ui";
import { creerAffaire } from "./actions";

export function NouvelleAffaire({ clients }: { clients: string[] }) {
  const [ouvert, setOuvert] = useState(false);
  const [nom, setNom] = useState("");
  const [clientNom, setClientNom] = useState("");
  const [numeroWhy, setNumeroWhy] = useState("");
  const [erreur, setErreur] = useState("");
  const [pending, start] = useTransition();

  const options = useMemo<ComboOption[]>(() => clients.map((c) => ({ value: c })), [clients]);

  function creer() {
    setErreur("");
    start(async () => {
      try {
        // L'action redirige vers la nouvelle affaire en cas de succès.
        await creerAffaire({ nom, clientNom, numeroWhy });
      } catch (e) {
        // NEXT_REDIRECT n'est pas une vraie erreur : on le laisse remonter.
        if (e instanceof Error && e.message === "NEXT_REDIRECT") throw e;
        setErreur(e instanceof Error ? e.message : "Erreur");
      }
    });
  }

  if (!ouvert) {
    return (
      <Button onClick={() => setOuvert(true)}>
        <Plus className="h-4 w-4" /> Nouvelle affaire
      </Button>
    );
  }

  return (
    <div className="w-full rounded-lg border border-border bg-surface-2 p-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <Label>Nom de l&apos;affaire</Label>
          <Input
            autoFocus
            value={nom}
            onChange={(e) => setNom(e.target.value)}
            placeholder="Mairie — Production ECS"
            className="mt-1"
          />
        </div>
        <div>
          <Label>Client</Label>
          <div className="mt-1">
            <Combobox
              value={clientNom}
              onInput={setClientNom}
              onPick={(o) => setClientNom(o.value)}
              options={options}
              placeholder="Rechercher / créer un client…"
            />
          </div>
        </div>
        <div>
          <Label>N° Why <span className="font-normal text-subtle">(optionnel)</span></Label>
          <Input
            value={numeroWhy}
            onChange={(e) => setNumeroWhy(e.target.value)}
            placeholder="W-2026-0203"
            className="mt-1"
          />
        </div>
      </div>
      {erreur && (
        <p className="mt-3 flex items-center gap-1.5 text-sm text-danger">
          <TriangleAlert className="h-4 w-4" /> {erreur}
        </p>
      )}
      <div className="mt-4 flex items-center justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={() => setOuvert(false)} disabled={pending}>
          <X className="h-4 w-4" /> Annuler
        </Button>
        <Button size="sm" onClick={creer} disabled={pending || !nom.trim() || !clientNom.trim()}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          Créer l&apos;affaire
        </Button>
      </div>
    </div>
  );
}
