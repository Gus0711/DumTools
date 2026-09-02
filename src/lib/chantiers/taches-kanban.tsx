"use client";

import { Fragment, useRef, useState } from "react";
import {
  CalendarClock,
  Check,
  ChevronLeft,
  ChevronRight,
  ListTodo,
  Plus,
  Trash2,
  TriangleAlert,
  UserPlus,
  X,
} from "lucide-react";
import { cn } from "@/lib/cn";
import type { EtatTache } from "@/generated/prisma/enums";
import {
  COLONNES_TACHES,
  PRIORITES,
  initialesNom,
  tonAvatar,
  type AssignableUser,
  type TacheRow,
} from "./taches";
import {
  assignerTache,
  creerTache,
  deplacerTache,
  renommerTache,
  supprimerTache,
} from "./taches-actions";

/** Écart en jours de CALENDRIER entre une échéance `AAAA-MM-JJ` et aujourd'hui.
 *  Jamais en tranches de 24 h : « hier » ne veut pas dire « il y a moins de 24
 *  heures » (même piège que mes-taches-ecran.tsx). */
function ecartJours(jour: string): number {
  const [a, m, j] = jour.split("-").map(Number);
  const n = new Date();
  return Math.round(
    (new Date(a!, m! - 1, j!).getTime() -
      new Date(n.getFullYear(), n.getMonth(), n.getDate()).getTime()) /
      86400000,
  );
}

function tonEcheance(jour: string): string {
  const d = ecartJours(jour);
  if (d < 0) return "text-danger font-semibold";
  if (d === 0) return "text-danger";
  if (d <= 7) return "text-accent-strong";
  return "text-subtle";
}

function libelleCourtEcheance(jour: string): string {
  const d = ecartJours(jour);
  if (d < 0) return d === -1 ? "en retard d'un jour" : `en retard de ${-d} jours`;
  if (d === 0) return "aujourd'hui";
  if (d === 1) return "demain";
  if (d <= 7) return `dans ${d} jours`;
  return new Date(jour).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });
}

/**
 * Kanban des tâches d'une affaire : 3 colonnes À faire / En cours / Terminé.
 * Toutes les mutations sont optimistes (l'état local fait foi, rollback +
 * message si le serveur refuse) pour que l'ajout à la volée et le glisser-
 * déposer restent instantanés. Sur tactile (pas de drag natif), les chevrons
 * de chaque carte font passer la tâche d'une colonne à l'autre.
 */
export function TachesKanban({
  chantierId,
  taches: tachesInitiales,
  utilisateurs,
  moiId,
}: {
  chantierId: string;
  taches: TacheRow[];
  utilisateurs: AssignableUser[];
  moiId: string | null;
}) {
  const [taches, setTaches] = useState(tachesInitiales);
  const [erreur, setErreur] = useState("");
  const [dragId, setDragId] = useState<string | null>(null);
  const [cible, setCible] = useState<{ etat: EtatTache; index: number } | null>(null);
  const tmpSeq = useRef(0);

  const ouvertes = taches.filter((t) => t.etat !== "TERMINEE").length;

  function colonne(etat: EtatTache): TacheRow[] {
    return taches.filter((t) => t.etat === etat).sort((a, b) => a.ordre - b.ordre);
  }

  /** Mutation optimiste : applique, et revient en arrière si le serveur refuse. */
  function muter(suivantes: (cur: TacheRow[]) => TacheRow[], action: () => Promise<unknown>) {
    const avant = taches;
    setTaches(suivantes);
    setErreur("");
    action().catch((e) => {
      setTaches(avant);
      setErreur(e instanceof Error ? e.message : "Erreur — modification annulée");
    });
  }

  function creer(etat: EtatTache, titre: string) {
    const t = titre.trim();
    if (!t) return;
    const tempId = `tmp-${++tmpSeq.current}`;
    const col = colonne(etat);
    const ordre = col.length ? col[col.length - 1].ordre + 1 : 1;
    setErreur("");
    // La tâche s'assigne à son auteur (creerTache) : on le peint TOUT DE SUITE,
    // sinon l'avatar apparaîtrait une seconde après coup, comme si quelqu'un
    // d'autre venait de s'en saisir. Le serveur reste la source : sa réponse
    // porte l'assignation réelle et corrige le nom si on ne l'avait pas.
    const moiNom = utilisateurs.find((u) => u.id === moiId)?.nom ?? null;
    setTaches((cur) => [
      ...cur,
      {
        id: tempId,
        titre: t,
        etat,
        ordre,
        assigneId: moiId,
        assigneNom: moiNom,
        priorite: "NORMALE" as const,
        echeance: null,
      },
    ]);
    creerTache({ chantierId, titre: t, etat, ordre })
      .then((serveur) =>
        setTaches((cur) =>
          cur.map((x) =>
            x.id === tempId
              ? {
                  ...x,
                  id: serveur.id,
                  assigneId: serveur.assigneId,
                  assigneNom: serveur.assigneNom,
                }
              : x,
          ),
        ),
      )
      .catch((e) => {
        setTaches((cur) => cur.filter((x) => x.id !== tempId));
        setErreur(e instanceof Error ? e.message : "Erreur — tâche non créée");
      });
  }

  /** Déplace une tâche vers (colonne, index) — index dans la colonne SANS elle.
   *  L'ordre inséré est le point médian des voisins : pas de renumérotation. */
  function deplacer(id: string, etat: EtatTache, index: number) {
    const tache = taches.find((x) => x.id === id);
    if (!tache) return;
    const sansMoi = colonne(etat).filter((t) => t.id !== id);
    const avant = index > 0 ? sansMoi[index - 1].ordre : undefined;
    const apres = index < sansMoi.length ? sansMoi[index].ordre : undefined;
    const ordre =
      avant === undefined && apres === undefined
        ? 1
        : avant === undefined
          ? (apres as number) - 1
          : apres === undefined
            ? avant + 1
            : (avant + apres) / 2;
    if (tache.etat === etat && tache.ordre === ordre) return;
    muter(
      (cur) => cur.map((x) => (x.id === id ? { ...x, etat, ordre } : x)),
      () => deplacerTache(id, { etat, ordre }),
    );
  }

  function renommer(id: string, titre: string) {
    const t = titre.trim();
    const tache = taches.find((x) => x.id === id);
    if (!tache || !t || t === tache.titre) return;
    muter(
      (cur) => cur.map((x) => (x.id === id ? { ...x, titre: t } : x)),
      () => renommerTache(id, t),
    );
  }

  function assigner(id: string, user: AssignableUser | null) {
    muter(
      (cur) =>
        cur.map((x) =>
          x.id === id
            ? { ...x, assigneId: user?.id ?? null, assigneNom: user?.nom ?? null }
            : x,
        ),
      () => assignerTache(id, user?.id ?? null),
    );
  }

  function supprimer(id: string) {
    muter(
      (cur) => cur.filter((x) => x.id !== id),
      () => supprimerTache(id),
    );
  }

  // ---- Glisser-déposer (HTML5 natif, souris uniquement) ---------------------

  function survol(e: React.DragEvent<HTMLDivElement>, etat: EtatTache) {
    if (!dragId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    // Point d'insertion = avant la première carte (hors carte traînée) dont le
    // milieu est sous le curseur.
    const cartes = Array.from(
      e.currentTarget.querySelectorAll<HTMLElement>("[data-tache]"),
    ).filter((el) => el.dataset.tache !== dragId);
    let index = cartes.length;
    for (let i = 0; i < cartes.length; i++) {
      const r = cartes[i].getBoundingClientRect();
      if (e.clientY < r.top + r.height / 2) {
        index = i;
        break;
      }
    }
    setCible((c) => (c && c.etat === etat && c.index === index ? c : { etat, index }));
  }

  function quitter(e: React.DragEvent<HTMLDivElement>) {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setCible(null);
  }

  function deposer(e: React.DragEvent<HTMLDivElement>, etat: EtatTache) {
    e.preventDefault();
    if (dragId && cible && cible.etat === etat) deplacer(dragId, etat, cible.index);
    setDragId(null);
    setCible(null);
  }

  return (
    /* REPLIÉ PAR DÉFAUT. Trois colonnes toujours dépliées poussaient le Projet
       GTB — le cœur de l'affaire — sous la ligne de flottaison. Le titre suffit
       à dire s'il reste du travail ; un clic ouvre le tableau.
       `open` est absent, donc non contrôlé : le navigateur tient l'état et on
       ne re-rend rien au pliage. */
    /* Le laiton : les tâches ne sont pas un outil, elles appartiennent au pivot.
       Replié, le bloc n'est qu'une barre de titre — d'où le filet du bas qu'on
       n'allume qu'à l'ouverture, sinon il doublerait la bordure du cadre. */
    <details className="bloc group signal-accent [&:not([open])>summary]:border-b-0">
      <summary className="bloc-entete cursor-pointer list-none flex-wrap gap-y-1.5 [&::-webkit-details-marker]:hidden">
        <ChevronRight className="h-4 w-4 shrink-0 text-subtle transition-transform duration-150 group-open:rotate-90" />
        <ListTodo className="text-signal h-4 w-4 shrink-0" />
        <h2 className="font-display text-sm font-semibold text-fg">Tâches</h2>

        {/* LE SIGNAL, section repliée. La .led-cur du synoptique respirait trop
            discrètement pour un bandeau fermé qu'il faut REMARQUER : on passe à
            .led-alerte (plus grosse, plus rapide, halo qui part loin), sur une
            pastille cerclée. La couleur ne porte jamais l'information seule —
            le compte et « à faire ou en cours » sont écrits à côté, et
            l'animation cède la place à un anneau fixe sous
            prefers-reduced-motion. */}
        {ouvertes > 0 ? (
          <span className="signal-accent inline-flex items-center gap-2 rounded border border-signal/50 bg-signal/15 px-2 py-1">
            <span aria-hidden className="led led-alerte" />
            <span className="font-mono text-sm font-bold tabular-nums text-signal">
              {ouvertes}
            </span>
            <span className="text-xs font-medium text-signal">à faire ou en cours</span>
          </span>
        ) : (
          <span className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-xs tabular-nums text-muted">
            0
          </span>
        )}
      </summary>

      {erreur && (
        <p className="flex items-center gap-1.5 border-b border-hairline bg-danger/8 px-4 py-2 text-sm text-danger">
          <TriangleAlert className="h-4 w-4 shrink-0" /> {erreur}
        </p>
      )}

      <div className="grid items-start gap-3 p-3 sm:grid-cols-3 md:p-4">
        {COLONNES_TACHES.map((col, colIndex) => {
          const cartes = colonne(col.etat);
          const enSurvol = dragId != null && cible?.etat === col.etat;
          // L'indicateur d'insertion se place AVANT cette carte (l'index de la
          // cible est compté hors carte traînée, qui reste affichée estompée).
          const sansDrag = cartes.filter((t) => t.id !== dragId);
          const indicAvantId = enSurvol ? (sansDrag[cible.index]?.id ?? "FIN") : null;

          return (
            <div
              key={col.etat}
              onDragOver={(e) => survol(e, col.etat)}
              onDragLeave={quitter}
              onDrop={(e) => deposer(e, col.etat)}
              className={cn(
                "flex flex-col border bg-surface-2/50 transition-colors",
                enSurvol ? "border-brand/50" : "border-border",
              )}
            >
              <div className="flex items-center gap-2 px-2.5 pb-0.5 pt-2">
                <span className={cn("h-2 w-2 shrink-0 rounded-full", col.dot)} />
                <span className="text-xs font-semibold uppercase tracking-wide text-muted">
                  {col.label}
                </span>
                <span className="text-xs tabular-nums text-subtle">{cartes.length}</span>
              </div>

              {/* Plus de plancher de hauteur : une colonne vide ne réserve que
                  la place de son bouton « Ajouter », pas un pavé de vide. */}
              <div className="flex flex-1 flex-col gap-1.5 p-1.5">
                {cartes.map((t) => (
                  <Fragment key={t.id}>
                    {indicAvantId === t.id && <Indicateur />}
                    <Carte
                      tache={t}
                      colIndex={colIndex}
                      utilisateurs={utilisateurs}
                      moiId={moiId}
                      enDrag={dragId === t.id}
                      onDragStart={() => setDragId(t.id)}
                      onDragEnd={() => {
                        setDragId(null);
                        setCible(null);
                      }}
                      onRenommer={(titre) => renommer(t.id, titre)}
                      onAssigner={(u) => assigner(t.id, u)}
                      onSupprimer={() => supprimer(t.id)}
                      onVersColonne={(etat) =>
                        deplacer(t.id, etat, colonne(etat).length)
                      }
                    />
                  </Fragment>
                ))}
                {indicAvantId === "FIN" && <Indicateur />}
                <Composer onCreer={(titre) => creer(col.etat, titre)} />
              </div>
            </div>
          );
        })}
      </div>
    </details>
  );
}

/** Trait d'insertion affiché pendant le glisser-déposer. */
function Indicateur() {
  return <div className="h-0.5 shrink-0 rounded-full bg-brand" />;
}

function Carte({
  tache,
  colIndex,
  utilisateurs,
  moiId,
  enDrag,
  onDragStart,
  onDragEnd,
  onRenommer,
  onAssigner,
  onSupprimer,
  onVersColonne,
}: {
  tache: TacheRow;
  colIndex: number;
  utilisateurs: AssignableUser[];
  moiId: string | null;
  enDrag: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onRenommer: (titre: string) => void;
  onAssigner: (user: AssignableUser | null) => void;
  onSupprimer: () => void;
  onVersColonne: (etat: EtatTache) => void;
}) {
  const [edition, setEdition] = useState(false);
  // Tant que la création n'est pas confirmée (id temporaire), pas de mutation.
  const enAttente = tache.id.startsWith("tmp-");
  const terminee = tache.etat === "TERMINEE";
  const prio = PRIORITES.find((p) => p.value === tache.priorite);
  const precedente = COLONNES_TACHES[colIndex - 1];
  const suivante = COLONNES_TACHES[colIndex + 1];

  return (
    <div
      data-tache={tache.id}
      draggable={!enAttente && !edition}
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", tache.id);
        e.dataTransfer.effectAllowed = "move";
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      className={cn(
        "group rounded-md border border-border bg-surface px-2.5 py-2 shadow-sm",
        !enAttente && !edition && "cursor-grab active:cursor-grabbing",
        (enDrag || enAttente) && "opacity-40",
      )}
    >
      {edition ? (
        <EditionTitre
          initial={tache.titre}
          onValider={(titre) => {
            setEdition(false);
            onRenommer(titre);
          }}
          onAnnuler={() => setEdition(false)}
        />
      ) : (
        <div className="flex items-start justify-between gap-1.5">
          <button
            type="button"
            onClick={() => !enAttente && setEdition(true)}
            title="Cliquer pour renommer"
            className={cn(
              "min-w-0 flex-1 cursor-text break-words text-left text-sm leading-snug text-fg",
              terminee && "text-muted line-through",
            )}
          >
            {tache.titre}
          </button>
          <button
            type="button"
            onClick={onSupprimer}
            disabled={enAttente}
            title="Supprimer la tâche"
            className={cn(
              "-mr-1 -mt-0.5 shrink-0 rounded p-1 text-subtle transition-opacity",
              "hover:bg-danger/10 hover:text-danger",
              "opacity-60 sm:opacity-0 sm:focus-visible:opacity-100 sm:group-hover:opacity-100",
            )}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Ce qui sort de l'ordinaire SEULEMENT : une priorité « Normale » et une
          absence d'échéance n'ont rien à dire, et les afficher poserait deux
          mentions grises sur chaque carte. Les deux valeurs se règlent sur
          l'écran « Mes tâches » ; les taire ici ferait mentir ce tableau-ci. */}
      {(tache.priorite !== "NORMALE" || tache.echeance) && !terminee && (
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs">
          {tache.priorite !== "NORMALE" && (
            <span className={cn("inline-flex items-center gap-1 font-medium", prio?.classe)}>
              <span className="font-mono" aria-hidden>
                {prio?.glyphe}
              </span>
              {prio?.label}
            </span>
          )}
          {tache.echeance && (
            <span className={cn("inline-flex items-center gap-1", tonEcheance(tache.echeance))}>
              <CalendarClock className="h-3 w-3 shrink-0" />
              {libelleCourtEcheance(tache.echeance)}
            </span>
          )}
        </div>
      )}

      <div className="mt-1.5 flex items-center justify-between gap-2">
        <PuceAssigne
          tache={tache}
          utilisateurs={utilisateurs}
          moiId={moiId}
          desactive={enAttente}
          onAssigner={onAssigner}
        />
        <div className="flex items-center opacity-60 sm:opacity-0 sm:group-hover:opacity-100">
          {precedente && (
            <button
              type="button"
              onClick={() => onVersColonne(precedente.etat)}
              disabled={enAttente}
              title={`Repasser « ${precedente.label} »`}
              className="rounded p-1 text-subtle hover:bg-surface-2 hover:text-fg"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
          )}
          {suivante && (
            <button
              type="button"
              onClick={() => onVersColonne(suivante.etat)}
              disabled={enAttente}
              title={`Passer « ${suivante.label} »`}
              className="rounded p-1 text-subtle hover:bg-surface-2 hover:text-fg"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function EditionTitre({
  initial,
  onValider,
  onAnnuler,
}: {
  initial: string;
  onValider: (titre: string) => void;
  onAnnuler: () => void;
}) {
  const [val, setVal] = useState(initial);
  return (
    <input
      autoFocus
      value={val}
      onChange={(e) => setVal(e.target.value)}
      onFocus={(e) => e.target.select()}
      onBlur={() => onValider(val)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          onValider(val);
        } else if (e.key === "Escape") {
          onAnnuler();
        }
      }}
      className={cn(
        "w-full rounded border border-brand bg-surface px-1.5 py-0.5 text-sm text-fg",
        "focus:outline-none focus:ring-2 focus:ring-brand/20",
      )}
    />
  );
}

/** Avatar de l'assigné (ou bouton « assigner ») + menu de choix d'utilisateur. */
function PuceAssigne({
  tache,
  utilisateurs,
  moiId,
  desactive,
  onAssigner,
}: {
  tache: TacheRow;
  utilisateurs: AssignableUser[];
  moiId: string | null;
  desactive: boolean;
  onAssigner: (user: AssignableUser | null) => void;
}) {
  const [ouvert, setOuvert] = useState(false);
  // Moi d'abord : s'assigner soi-même est le cas le plus fréquent.
  const tries = [...utilisateurs].sort((a, b) =>
    a.id === moiId ? -1 : b.id === moiId ? 1 : 0,
  );

  function choisir(user: AssignableUser | null) {
    setOuvert(false);
    if (user?.id !== tache.assigneId) onAssigner(user);
  }

  return (
    <div className="relative min-w-0">
      <button
        type="button"
        onClick={() => !desactive && setOuvert((o) => !o)}
        title={
          tache.assigneNom
            ? `Assignée à ${tache.assigneNom} — cliquer pour changer`
            : "Assigner à…"
        }
        className="flex min-w-0 items-center gap-1.5"
      >
        {tache.assigneNom ? (
          <>
            <span
              className={cn(
                "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold",
                tonAvatar(tache.assigneNom),
              )}
            >
              {initialesNom(tache.assigneNom)}
            </span>
            <span className="truncate text-xs text-muted">{tache.assigneNom}</span>
          </>
        ) : (
          <span
            className={cn(
              "flex h-5 w-5 items-center justify-center rounded-full border border-dashed border-border text-subtle",
              "transition-opacity hover:border-brand hover:text-brand",
              "opacity-60 sm:opacity-0 sm:group-hover:opacity-100",
            )}
          >
            <UserPlus className="h-3 w-3" />
          </span>
        )}
      </button>

      {ouvert && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOuvert(false)} />
          <div className="absolute left-0 top-6 z-20 w-52 overflow-hidden rounded-md border border-border bg-surface py-1 shadow-lg">
            <p className="px-3 pb-1 pt-1.5 text-[11px] font-medium uppercase tracking-wide text-subtle">
              Assigner à
            </p>
            {tries.map((u) => (
              <button
                key={u.id}
                type="button"
                onClick={() => choisir(u)}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-fg hover:bg-surface-2"
              >
                <span
                  className={cn(
                    "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold",
                    tonAvatar(u.nom),
                  )}
                >
                  {initialesNom(u.nom)}
                </span>
                <span className="truncate">
                  {u.nom}
                  {u.id === moiId && <span className="text-subtle"> (moi)</span>}
                </span>
                {u.id === tache.assigneId && (
                  <Check className="ml-auto h-3.5 w-3.5 shrink-0 text-brand" />
                )}
              </button>
            ))}
            {tache.assigneId && (
              <button
                type="button"
                onClick={() => choisir(null)}
                className="flex w-full items-center gap-2 border-t border-border-soft px-3 py-1.5 text-left text-sm text-muted hover:bg-surface-2"
              >
                <X className="h-3.5 w-3.5" /> Retirer l&apos;assignation
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/** Ajout à la volée en bas de colonne : Entrée = ajouter et enchaîner,
 *  Échap = abandonner, clic ailleurs = ajouter ce qui est saisi puis fermer. */
function Composer({ onCreer }: { onCreer: (titre: string) => void }) {
  const [ouvert, setOuvert] = useState(false);
  const [val, setVal] = useState("");

  if (!ouvert)
    return (
      <button
        type="button"
        onClick={() => setOuvert(true)}
        className={cn(
          "flex items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-sm text-subtle",
          "hover:bg-surface-2 hover:text-fg",
        )}
      >
        <Plus className="h-4 w-4" /> Ajouter une tâche
      </button>
    );

  return (
    <input
      autoFocus
      value={val}
      onChange={(e) => setVal(e.target.value)}
      placeholder="Titre, puis Entrée…"
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          onCreer(val);
          setVal("");
        } else if (e.key === "Escape") {
          setVal("");
          setOuvert(false);
        }
      }}
      onBlur={() => {
        onCreer(val);
        setVal("");
        setOuvert(false);
      }}
      className={cn(
        "w-full rounded-md border border-brand bg-surface px-2.5 py-1.5 text-sm text-fg",
        "placeholder:text-subtle focus:outline-none focus:ring-2 focus:ring-brand/20",
      )}
    />
  );
}
