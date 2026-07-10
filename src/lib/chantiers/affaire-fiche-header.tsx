"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Check, Hash, Loader2, TriangleAlert } from "lucide-react";
import { Button, Combobox, Input, Label, type ComboOption } from "@/ui";
import { cn } from "@/lib/cn";
import type { EtatAffaire } from "@/generated/prisma/enums";
import { ETATS_AFFAIRE } from "./etats";
import { changerEtatAffaire, modifierAffaire } from "./actions";

export function AffaireFicheHeader({
  id,
  nom,
  etat,
  clientNom,
  numeroWhy,
  clients,
}: {
  id: string;
  nom: string;
  etat: EtatAffaire;
  clientNom: string;
  numeroWhy: string | null;
  clients: string[];
}) {
  const router = useRouter();
  const [valNom, setValNom] = useState(nom);
  const [valClient, setValClient] = useState(clientNom);
  const [valWhy, setValWhy] = useState(numeroWhy ?? "");
  const [erreur, setErreur] = useState("");
  const [pending, start] = useTransition();

  const options = useMemo<ComboOption[]>(() => clients.map((c) => ({ value: c })), [clients]);
  const modifie =
    valNom.trim() !== nom || valClient.trim() !== clientNom || valWhy.trim() !== (numeroWhy ?? "");
  const valide = valNom.trim().length > 0 && valClient.trim().length > 0;

  function enregistrer() {
    setErreur("");
    start(async () => {
      try {
        await modifierAffaire(id, { nom: valNom, clientNom: valClient, numeroWhy: valWhy });
        router.refresh();
      } catch (e) {
        setErreur(e instanceof Error ? e.message : "Erreur");
      }
    });
  }

  function changerEtat(nouvel: EtatAffaire) {
    setErreur("");
    start(async () => {
      try {
        await changerEtatAffaire(id, nouvel);
        router.refresh();
      } catch (e) {
        setErreur(e instanceof Error ? e.message : "Erreur");
      }
    });
  }

  return (
    <div className="mb-6">
      <Link
        href="/affaires"
        className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg"
      >
        <ArrowLeft className="h-4 w-4" /> Affaires
      </Link>

      <div className="rounded-lg border border-border bg-surface p-4">
        <div className="grid gap-3 sm:grid-cols-4">
          <div className="sm:col-span-2">
            <Label>Nom de l&apos;affaire</Label>
            <Input
              value={valNom}
              onChange={(e) => setValNom(e.target.value)}
              className="mt-1 font-semibold"
            />
          </div>
          <div>
            <Label>Client</Label>
            <div className="mt-1">
              <Combobox
                value={valClient}
                onInput={setValClient}
                onPick={(o) => setValClient(o.value)}
                options={options}
                placeholder="Client…"
              />
            </div>
          </div>
          <div>
            <Label className="inline-flex items-center gap-1">
              <Hash className="h-3.5 w-3.5 text-subtle" /> N° Why
            </Label>
            <Input
              value={valWhy}
              onChange={(e) => setValWhy(e.target.value)}
              placeholder="W-2026-0203"
              className="mt-1"
            />
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
          <label className="space-y-1">
            <span className="text-xs font-medium text-muted">État</span>
            <select
              value={etat}
              onChange={(e) => changerEtat(e.target.value as EtatAffaire)}
              disabled={pending}
              className={cn(
                "block h-9 w-40 rounded-md border border-border bg-surface px-2.5 text-sm text-fg",
                "focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20",
              )}
            >
              {ETATS_AFFAIRE.map((e) => (
                <option key={e.value} value={e.value}>
                  {e.label}
                </option>
              ))}
            </select>
          </label>

          {modifie && (
            <Button size="sm" onClick={enregistrer} disabled={pending || !valide}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Enregistrer
            </Button>
          )}
        </div>

        {erreur && (
          <p className="mt-2 flex items-center gap-1.5 text-sm text-danger">
            <TriangleAlert className="h-4 w-4" /> {erreur}
          </p>
        )}
      </div>
    </div>
  );
}
