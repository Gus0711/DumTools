"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Link2, Pencil, Trash2 } from "lucide-react";
import { rattacherVisiteAffaire, supprimerVisite } from "./actions";

/* Actions « bureau » de la fiche visite. Cas d'usage clé : un RELEVÉ se fait
 * souvent AVANT que l'affaire existe — de retour au bureau on crée l'affaire,
 * puis on rattache la visite ici. « Modifier » rouvre la visite dans l'éditeur
 * terrain (l'îlot importe la copie synchronisée dans son store local). */

export type AffaireOption = {
  id: string;
  nom: string;
  clientNom: string;
  numeroWhy: string | null;
};

export function FicheActionsVisite({
  visiteId,
  chantierId,
  affaires,
}: {
  visiteId: string;
  chantierId: string | null;
  affaires: AffaireOption[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [choix, setChoix] = useState("");
  const [changer, setChanger] = useState(false);
  const [erreur, setErreur] = useState("");

  const montrerSelect = !chantierId || changer;

  function rattacher() {
    if (!choix) return;
    setErreur("");
    startTransition(async () => {
      try {
        await rattacherVisiteAffaire(visiteId, choix);
        setChanger(false);
        setChoix("");
        router.refresh();
      } catch (e) {
        setErreur(e instanceof Error ? e.message : "Échec du rattachement");
      }
    });
  }

  function supprimer() {
    if (
      !window.confirm(
        "Supprimer définitivement cette visite, avec ses photos et notes vocales ?",
      )
    ) {
      return;
    }
    startTransition(async () => {
      await supprimerVisite(visiteId);
      router.push("/outils/visites");
    });
  }

  return (
    <div className="mt-3 space-y-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href={`/outils/visites/terrain?ouvrir=${visiteId}`}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-1.5 text-sm font-medium text-fg transition-colors hover:bg-surface-2"
        >
          <Pencil className="h-3.5 w-3.5" />
          Modifier
        </Link>
        {chantierId && !changer && (
          <button
            type="button"
            onClick={() => setChanger(true)}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-1.5 text-sm font-medium text-fg transition-colors hover:bg-surface-2"
          >
            <Link2 className="h-3.5 w-3.5" />
            Changer d&apos;affaire
          </button>
        )}
        <button
          type="button"
          onClick={supprimer}
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-md border border-danger/35 bg-surface px-3 py-1.5 text-sm font-medium text-danger transition-colors hover:bg-danger/10 disabled:opacity-50"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Supprimer
        </button>
      </div>

      {montrerSelect && (
        <div className="rounded-lg border border-io-di/40 bg-surface p-3">
          <p className="mb-1.5 text-sm font-semibold text-io-di">
            {chantierId ? "Changer l'affaire de la visite" : "Rattacher à une affaire"}
          </p>
          {!chantierId && (
            <p className="mb-2 text-xs text-muted">
              La visite apparaîtra sur la fiche de l&apos;affaire et de son client.
              Si l&apos;affaire n&apos;existe pas encore, créez-la d&apos;abord depuis{" "}
              <Link href="/affaires" className="font-medium text-brand hover:underline">
                Affaires
              </Link>
              , puis revenez ici.
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={choix}
              onChange={(e) => setChoix(e.target.value)}
              className="min-w-0 flex-1 rounded-md border border-border bg-surface px-3 py-2 text-sm text-fg focus:border-brand focus:outline-none"
            >
              <option value="">— choisir une affaire —</option>
              {affaires
                .filter((a) => a.id !== chantierId)
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.nom} · {a.clientNom}
                    {a.numeroWhy ? ` · ${a.numeroWhy}` : ""}
                  </option>
                ))}
            </select>
            <button
              type="button"
              onClick={rattacher}
              disabled={!choix || pending}
              className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-brand-fg transition-colors hover:bg-brand-strong disabled:opacity-50"
            >
              {pending ? "…" : "Rattacher"}
            </button>
            {chantierId && (
              <button
                type="button"
                onClick={() => setChanger(false)}
                className="text-sm text-muted hover:text-fg"
              >
                Annuler
              </button>
            )}
          </div>
          {erreur && <p className="mt-1.5 text-xs text-danger">{erreur}</p>}
        </div>
      )}
    </div>
  );
}
