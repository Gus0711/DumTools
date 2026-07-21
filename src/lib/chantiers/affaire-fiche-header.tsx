"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Check, ChevronRight, Hash, Loader2, Trash2, TriangleAlert } from "lucide-react";
import { Button, Combobox, Input, Label, type ComboOption } from "@/ui";
import { cn } from "@/lib/cn";
import type { BesoinArmoire, EtatAffaire } from "@/generated/prisma/enums";
import { CYCLE_AFFAIRE } from "./etats";
import { BESOINS_ARMOIRE } from "./armoire";
import { changerBesoinArmoire, changerEtatAffaire, modifierAffaire } from "./actions";

export function AffaireFicheHeader({
  id,
  nom,
  etat,
  besoinArmoire,
  clientNom,
  numeroWhy,
  clients,
}: {
  id: string;
  nom: string;
  etat: EtatAffaire;
  besoinArmoire: BesoinArmoire | null;
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

  function changerArmoire(valeur: string) {
    setErreur("");
    start(async () => {
      try {
        await changerBesoinArmoire(id, valeur ? (valeur as BesoinArmoire) : null);
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

        {/* Cycle de vie — où en est l'affaire, et un clic pour l'avancer. */}
        <div className="mt-4 space-y-1">
          <span className="text-xs font-medium text-muted">Cycle de l&apos;affaire</span>
          <CycleAffaire etat={etat} pending={pending} onChanger={changerEtat} />
        </div>

        <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-wrap items-end gap-3">
            <label className="space-y-1">
              <span className="text-xs font-medium text-muted">Besoin armoire</span>
              <select
                value={besoinArmoire ?? ""}
                onChange={(e) => changerArmoire(e.target.value)}
                disabled={pending}
                className={cn(
                  "block h-9 w-44 rounded-md border border-border bg-surface px-2.5 text-sm text-fg",
                  "focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20",
                )}
              >
                <option value="">Non défini</option>
                {BESOINS_ARMOIRE.map((b) => (
                  <option key={b.value} value={b.value}>
                    {b.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

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

/**
 * Fil d'étapes du cycle de vie : Devis → Commande → En cours → Livrée →
 * Clôturée. Les étapes franchies sont pleines, l'étape courante est mise en
 * évidence, les suivantes restent en creux — et chacune est cliquable pour
 * avancer (ou revenir) d'un coup. La Corbeille n'est pas une étape : c'est un
 * bouton à part, en bout de fil.
 */
function CycleAffaire({
  etat,
  pending,
  onChanger,
}: {
  etat: EtatAffaire;
  pending: boolean;
  onChanger: (e: EtatAffaire) => void;
}) {
  const corbeille = etat === "CORBEILLE";
  const courant = CYCLE_AFFAIRE.findIndex((e) => e.value === etat);

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto pb-0.5">
        {CYCLE_AFFAIRE.map((e, i) => {
          const estCourant = e.value === etat;
          const franchie = !corbeille && courant >= 0 && i < courant;
          return (
            <div key={e.value} className="flex shrink-0 items-center gap-1">
              {i > 0 && (
                <ChevronRight
                  className={cn("h-3.5 w-3.5", franchie ? "text-brand/50" : "text-subtle/60")}
                />
              )}
              <button
                type="button"
                onClick={() => !estCourant && onChanger(e.value)}
                disabled={pending || estCourant}
                aria-current={estCourant ? "step" : undefined}
                title={estCourant ? `Étape actuelle : ${e.label}` : `Passer en « ${e.label} »`}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition-colors",
                  estCourant
                    ? "border-brand bg-brand text-brand-fg font-semibold shadow-sm"
                    : franchie
                      ? "border-brand/30 bg-brand/10 text-brand hover:bg-brand/15"
                      : "border-border bg-surface text-muted hover:bg-surface-2 hover:text-fg",
                  pending && "opacity-60",
                )}
              >
                {franchie && <Check className="h-3.5 w-3.5" />}
                {e.label}
              </button>
            </div>
          );
        })}
      </div>

      <button
        type="button"
        onClick={() => onChanger(corbeille ? "EN_COURS" : "CORBEILLE")}
        disabled={pending}
        title={
          corbeille
            ? "Sortir de la corbeille (repasse en « En cours »)"
            : "Mettre l'affaire à la corbeille (perdue, doublon, erreur)"
        }
        className={cn(
          "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition-colors",
          corbeille
            ? "border-danger bg-danger/12 font-semibold text-danger"
            : "border-border bg-surface text-subtle hover:bg-surface-2 hover:text-danger",
          pending && "opacity-60",
        )}
      >
        <Trash2 className="h-3.5 w-3.5" />
        Corbeille
      </button>
    </div>
  );
}
