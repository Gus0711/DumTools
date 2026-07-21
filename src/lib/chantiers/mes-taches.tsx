"use client";

import { useState } from "react";
import Link from "next/link";
import { Circle, CircleCheck, CircleDot, ListTodo, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/cn";
import type { EtatTache } from "@/generated/prisma/enums";
import type { MaTacheRow } from "./taches";
import { changerEtatTacheEnFin } from "./taches-actions";

/** Cycle d'état au clic sur la pastille : À faire → En cours → Terminé → À faire
 *  (le retour permet d'annuler un « terminé » cliqué par erreur). */
const SUIVANT: Record<EtatTache, EtatTache> = {
  A_FAIRE: "EN_COURS",
  EN_COURS: "TERMINEE",
  TERMINEE: "A_FAIRE",
};

const PASTILLE: Record<EtatTache, { icone: typeof Circle; cls: string; titre: string }> = {
  A_FAIRE: {
    icone: Circle,
    cls: "text-subtle hover:text-accent",
    titre: "À faire — cliquer pour passer « En cours »",
  },
  EN_COURS: {
    icone: CircleDot,
    cls: "text-accent hover:text-success",
    titre: "En cours — cliquer pour terminer",
  },
  TERMINEE: {
    icone: CircleCheck,
    cls: "text-success",
    titre: "Terminée — cliquer pour repasser « À faire »",
  },
};

/**
 * « Mes tâches » : les tâches ouvertes assignées à l'utilisateur courant, toutes
 * affaires confondues, groupées par affaire. Une tâche terminée ici reste
 * affichée barrée jusqu'au prochain chargement (feedback + annulation possible).
 */
export function MesTaches({ taches: tachesInitiales }: { taches: MaTacheRow[] }) {
  const [taches, setTaches] = useState(tachesInitiales);
  const [erreur, setErreur] = useState("");

  const restantes = taches.filter((t) => t.etat !== "TERMINEE").length;

  // Groupes par affaire, dans l'ordre du serveur (affaires actives d'abord).
  const groupes: { affaireId: string; affaireNom: string; clientNom: string; taches: MaTacheRow[] }[] =
    [];
  for (const t of taches) {
    const g = groupes.find((x) => x.affaireId === t.affaireId);
    if (g) g.taches.push(t);
    else
      groupes.push({
        affaireId: t.affaireId,
        affaireNom: t.affaireNom,
        clientNom: t.clientNom,
        taches: [t],
      });
  }

  function cycler(id: string) {
    const tache = taches.find((t) => t.id === id);
    if (!tache) return;
    const etat = SUIVANT[tache.etat];
    const avant = taches;
    setTaches((cur) => cur.map((t) => (t.id === id ? { ...t, etat } : t)));
    setErreur("");
    changerEtatTacheEnFin(id, etat).catch((e) => {
      setTaches(avant);
      setErreur(e instanceof Error ? e.message : "Erreur — modification annulée");
    });
  }

  return (
    <section className="mb-6 rounded-lg border border-border bg-surface">
      <div className="flex items-center gap-2 border-b border-border-soft px-4 py-2.5">
        <ListTodo className="h-4 w-4 text-brand" />
        <h2 className="text-sm font-semibold text-fg">Mes tâches</h2>
        <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs tabular-nums text-muted">
          {restantes}
        </span>
        {erreur && (
          <span className="ml-2 flex items-center gap-1.5 text-sm text-danger">
            <TriangleAlert className="h-4 w-4" /> {erreur}
          </span>
        )}
      </div>

      <div className="divide-y divide-border-soft">
        {groupes.map((g) => (
          <div key={g.affaireId} className="px-4 py-2.5">
            <Link
              href={`/affaires/${g.affaireId}`}
              className="text-xs font-medium text-muted hover:text-brand"
            >
              {g.affaireNom} <span className="font-normal text-subtle">· {g.clientNom}</span>
            </Link>
            <ul className="mt-1">
              {g.taches.map((t) => {
                const p = PASTILLE[t.etat];
                const Icone = p.icone;
                return (
                  <li key={t.id} className="flex items-center gap-2 py-0.5">
                    <button
                      type="button"
                      onClick={() => cycler(t.id)}
                      title={p.titre}
                      className={cn("shrink-0 rounded-full transition-colors", p.cls)}
                    >
                      <Icone className="h-4 w-4" />
                    </button>
                    <span
                      className={cn(
                        "min-w-0 break-words text-sm text-fg",
                        t.etat === "TERMINEE" && "text-muted line-through",
                      )}
                    >
                      {t.titre}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
