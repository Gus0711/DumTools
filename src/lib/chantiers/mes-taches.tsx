"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  ChevronDown,
  Circle,
  CircleCheck,
  CircleDot,
  ListTodo,
  TriangleAlert,
} from "lucide-react";
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

/** Ce qui est commencé passe devant ce qui n'est pas commencé ; ce qui vient
 *  d'être terminé descend en bas sans disparaître (annulation possible). */
const RANG: Record<EtatTache, number> = { EN_COURS: 0, A_FAIRE: 1, TERMINEE: 2 };

/**
 * « Mes tâches » : les tâches ouvertes assignées à l'utilisateur courant, toutes
 * affaires confondues.
 *
 * Volontairement BORNÉ : l'accueil doit répondre à « qu'est-ce que je fais
 * maintenant », pas dérouler tout l'arriéré. On affiche les premières, le reste
 * se déplie sur demande. Une ligne par tâche, l'affaire en suffixe — regrouper
 * par affaire coûtait une ligne d'entête par groupe, soit presque autant de
 * lignes que de tâches.
 */
export function MesTaches({
  taches: tachesInitiales,
  limite = 5,
  colonne = false,
}: {
  taches: MaTacheRow[];
  /** Nombre de tâches visibles avant dépliage. */
  limite?: number;
  /**
   * Rendu en COLONNE étroite (accueil) : l'affaire passe sous le titre au lieu
   * de se caler à droite. Les points de rupture de Tailwind regardent la
   * fenêtre, pas le bloc — dans une colonne d'un tiers d'écran, la mise en
   * ligne « titre … affaire » se retrouve à l'étroit alors que la fenêtre, elle,
   * est large.
   */
  colonne?: boolean;
}) {
  const [taches, setTaches] = useState(tachesInitiales);
  const [erreur, setErreur] = useState("");
  const [tout, setTout] = useState(false);

  const enCours = taches.filter((t) => t.etat === "EN_COURS").length;
  const aFaire = taches.filter((t) => t.etat === "A_FAIRE").length;
  const restantes = enCours + aFaire;

  // Le tri est figé à l'affichage : une tâche qu'on vient de cocher ne doit pas
  // sauter sous le curseur. (L'ordre se recalcule au prochain chargement.)
  const [ordre] = useState(() =>
    [...tachesInitiales]
      .sort((a, b) => RANG[a.etat] - RANG[b.etat])
      .map((t) => t.id),
  );
  const triees = ordre
    .map((id) => taches.find((t) => t.id === id))
    .filter((t): t is MaTacheRow => Boolean(t));

  const visibles = tout ? triees : triees.slice(0, limite);
  const masquees = triees.length - visibles.length;

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
    <section className="bloc">
      <div className="bloc-entete">
        <ListTodo className="h-4 w-4 shrink-0 text-brand" />
        <h2 className="font-display text-sm font-semibold text-fg">Mes tâches</h2>
        <span className="rounded bg-surface px-1.5 py-0.5 font-mono text-xs tabular-nums text-muted">
          {restantes}
        </span>
        {/* La répartition dit d'un coup d'œil ce qui est déjà lancé. */}
        {restantes > 0 && (
          <span className="stamp hidden sm:block">
            {enCours > 0 && `${enCours} en cours`}
            {enCours > 0 && aFaire > 0 && " · "}
            {aFaire > 0 && `${aFaire} à faire`}
          </span>
        )}
        {erreur ? (
          <span className="ml-auto flex items-center gap-1.5 text-sm text-danger">
            <TriangleAlert className="h-4 w-4 shrink-0" /> {erreur}
          </span>
        ) : (
          /* Le bloc reste BORNÉ (voir plus haut) : il répond à « maintenant ».
             Le reste — les terminées, le filtre par client, le tri — vit sur
             l'écran dédié, qu'il faut donc pouvoir atteindre d'ici. */
          <Link
            href="/mes-taches"
            className="ml-auto inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-brand transition-colors hover:text-brand-strong"
          >
            Tout voir
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        )}
      </div>

      {triees.length === 0 && (
        // Le bloc reste en place quand il est vide : sur l'accueil il ouvre la
        // colonne de droite, et un bloc qui disparaît fait sauter la mise en
        // page d'un jour à l'autre.
        <p className="px-4 py-3 text-sm text-muted">
          Rien ne vous est assigné. Les tâches se créent sur la fiche d&apos;une affaire.
        </p>
      )}

      <ul className="divide-y divide-hairline">
        {visibles.map((t) => {
          const p = PASTILLE[t.etat];
          const Icone = p.icone;
          return (
            <li key={t.id} className="flex items-start gap-2.5 px-3 py-2 sm:px-4">
              <button
                type="button"
                onClick={() => cycler(t.id)}
                title={p.titre}
                aria-label={p.titre}
                className={cn(
                  "-m-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full p-1 transition-colors sm:h-7 sm:w-7",
                  p.cls,
                )}
              >
                <Icone className="h-4 w-4" />
              </button>

              <span
                className={cn(
                  "flex min-w-0 flex-1 flex-col gap-0.5 pt-1",
                  !colonne && "sm:flex-row sm:items-baseline sm:gap-3",
                )}
              >
                <span
                  className={cn(
                    "min-w-0 flex-1 break-words text-sm text-fg",
                    t.etat === "TERMINEE" && "text-muted line-through",
                  )}
                >
                  {t.titre}
                </span>
                {/* Une tâche INTERNE n'a pas d'affaire : elle affiche son
                    domaine, sans lien — sinon on pointait « /affaires/null ». */}
                {t.affaireId ? (
                  <Link
                    href={`/affaires/${t.affaireId}`}
                    title={`${t.affaireNom} · ${t.clientNom}`}
                    className={cn(
                      "shrink-0 truncate text-xs text-subtle transition-colors hover:text-brand",
                      !colonne && "sm:max-w-[14rem] sm:text-right",
                    )}
                  >
                    {t.affaireNom}
                  </Link>
                ) : (
                  <span
                    title="Tâche interne, hors affaire"
                    className={cn(
                      "shrink-0 truncate text-xs text-subtle",
                      !colonne && "sm:max-w-[14rem] sm:text-right",
                    )}
                  >
                    {t.domaineNom ?? "interne"}
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ul>

      {(masquees > 0 || tout) && (
        <button
          type="button"
          onClick={() => setTout((v) => !v)}
          aria-expanded={tout}
          className="flex min-h-[2.75rem] w-full items-center justify-center gap-1.5 border-t border-hairline text-xs font-semibold text-muted transition-colors hover:bg-surface-2 hover:text-brand sm:min-h-[2.25rem]"
        >
          {tout ? "Réduire" : `Afficher les ${masquees} autres`}
          <ChevronDown
            className={cn("h-3.5 w-3.5 transition-transform duration-200", tout && "rotate-180")}
          />
        </button>
      )}
    </section>
  );
}
