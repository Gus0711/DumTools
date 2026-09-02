// « C'est bon, tu l'as déjà fait » — client-safe (ni "server-only" ni Prisma),
// partagé par les badges, la fiche Affaire, le tableau de bord et les jalons.

/* =============================================================================
 * L'ARRÊT : LA SEULE CHOSE QU'AUCUN CALCUL NE SAIT DIRE
 *
 * La frise du cycle (jalons.ts) est entièrement DÉRIVÉE, et c'est sa force :
 * « un jalon calculé ne ment jamais ». Mais elle répond à « où en est
 * l'affaire ? », pas à « est-ce que j'ai fini d'y toucher ? ». Un automate avec
 * 12 points saisis sur 40 ressemble trait pour trait à un automate terminé, et
 * un besoin en matériel vide se lit pareil qu'on n'ait rien commencé ou qu'il
 * n'y ait rien à commander. Cette réponse-là est une DÉCISION humaine.
 *
 * Alors pourquoi la case à cocher ne ment-elle pas, elle ? Parce qu'elle est
 * DATÉE et confrontée au contenu : elle ne prétend jamais que ce qu'on a arrêté
 * est encore à jour, elle dit « à cette date, j'ai dit stop ». Si quelqu'un
 * repasse derrière, l'état bascule tout seul en « retouché » — impossible de
 * laisser un vert périmé sur un contenu qui a bougé.
 *
 * ⚠️ D'où une contrainte d'écriture, côté actions : poser `arreteLe` ne doit PAS
 * bousculer le témoin de fraîcheur du contenu (`updatedAt`), sinon tout arrêt se
 * retrouverait « retouché » dans la milliseconde qui suit. Les bascules passent
 * donc par un UPDATE SQL brut, et l'horloge est celle de la base (`now()`) —
 * jamais celle du serveur Node, qui pourrait être en retard sur elle.
 * ========================================================================== */

export type EtatArret =
  /** Jamais arrêté : le travail est en cours (ou pas commencé). */
  | "ouvert"
  /** Arrêté, et rien n'a bougé depuis : c'est bon, c'est fait. */
  | "arrete"
  /** Arrêté, puis quelqu'un y est revenu : à re-valider. */
  | "retouche";

/**
 * L'état d'arrêt, déduit de deux dates.
 *
 * `referenceLe` = la dernière fois que le CONTENU a bougé (le `updatedAt` de
 * l'automate ; pour le besoin en matériel, le plus récent de ses ingrédients).
 * `null` = rien n'a jamais bougé, donc rien ne peut périmer l'arrêt.
 */
export function etatArret(
  arreteLe: Date | string | null | undefined,
  referenceLe: Date | string | null | undefined,
): EtatArret {
  if (!arreteLe) return "ouvert";
  if (!referenceLe) return "arrete";
  return new Date(referenceLe) > new Date(arreteLe) ? "retouche" : "arrete";
}

/** La plus récente de plusieurs dates — le contenu d'une BOM a N ingrédients. */
export function plusRecente(...dates: (Date | null | undefined)[]): Date | null {
  let max: Date | null = null;
  for (const d of dates) {
    if (!d) continue;
    if (!max || d > max) max = d;
  }
  return max;
}

export const ARRET_LABEL: Record<EtatArret, string> = {
  ouvert: "En cours",
  arrete: "Arrêté",
  retouche: "Retouché",
};

/** Fond + texte. Le vert dit « fait », l'ambre « à re-regarder », le gris rien. */
export const ARRET_TON: Record<EtatArret, string> = {
  ouvert: "bg-surface-2 text-muted",
  arrete: "bg-success/12 text-success",
  retouche: "bg-warning/14 text-warning",
};

/** La pastille : la couleur ne porte jamais l'information toute seule, mais un
 *  point coloré aide à balayer une colonne du regard. */
export const ARRET_POINT: Record<EtatArret, string> = {
  ouvert: "bg-subtle",
  arrete: "bg-success",
  retouche: "bg-warning",
};

function jour(d: Date | string): string {
  return new Date(d).toLocaleDateString("fr-FR");
}

/**
 * La phrase complète, celle qui dit POURQUOI l'état est celui-là et ce que fait
 * le clic. Un badge qui affiche « Retouché » sans dire « arrêté le 12, modifié
 * le 20 » oblige à aller chercher l'information ailleurs.
 */
export function arretInfobulle(p: {
  etat: EtatArret;
  arreteLe?: Date | string | null;
  arretePar?: string | null;
  referenceLe?: Date | string | null;
  quoi: string;
}): string {
  const par = p.arretePar ? ` par ${p.arretePar}` : "";
  if (p.etat === "ouvert") {
    return `${p.quoi} : jamais arrêté. Cliquer pour dire « c'est fait, je n'y touche plus ».`;
  }
  if (p.etat === "arrete") {
    return `${p.quoi} : arrêté le ${jour(p.arreteLe!)}${par}, et rien n'a bougé depuis. Cliquer pour rouvrir.`;
  }
  return `${p.quoi} : arrêté le ${jour(p.arreteLe!)}${par}, puis modifié le ${jour(p.referenceLe!)}. À revoir — cliquer pour l'arrêter de nouveau.`;
}
