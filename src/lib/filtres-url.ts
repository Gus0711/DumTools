"use client";

import { useEffect } from "react";

/* =============================================================================
 * LES FILTRES VIVENT DANS L'URL
 *
 * Un écran de liste garde sa recherche et ses filtres dans un `useState`. Quand
 * on ouvre une fiche puis qu'on revient, le composant est REMONTÉ : l'état est
 * neuf, donc revenu à son défaut. On croit avoir perdu sa sélection ; en fait
 * elle n'a jamais été retenue.
 *
 * Le remède est de ranger ces filtres là où le navigateur sait les garder :
 * l'adresse. En prime, l'adresse se met en favori et se colle dans un message.
 *
 * ⚠️ `history.replaceState` et NON `router.replace` :
 *   · pas d'aller-retour serveur à chaque frappe (chaque rendu coûte ~100 ms et
 *     Next repréchargerait au passage tous les liens visibles) ;
 *   · pas une entrée d'historique par caractère tapé — sinon le bouton
 *     « retour » défait des lettres au lieu de changer d'écran.
 * Next accepte officiellement cette écriture directe depuis la v15.
 * ========================================================================== */

/**
 * Reporte les filtres dans l'adresse. Les valeurs vides (chaîne vide, `null`,
 * `undefined`, `false`) ne sont pas écrites : le cas courant garde une URL
 * propre, et ce qui apparaît dans l'adresse est exactement ce qui s'écarte du
 * réglage par défaut.
 *
 * À n'appeler QU'UNE FOIS par écran, avec tous ses filtres : deux appels
 * concurrents s'écraseraient l'un l'autre.
 *
 * Retourne la chaîne de requête — de quoi fabriquer « reviens ICI » sur les
 * liens sortants (`avecRetour`, lib/retour). L'adresse du navigateur suffit
 * tant qu'on revient par la flèche ; elle ne suffit plus dès qu'on revient par
 * le lien « ← Affaires » de la fiche, qui, lui, doit savoir où était la liste.
 */
export function useSyncUrl(
  filtres: Record<string, string | boolean | null | undefined>,
): string {
  // La chaîne est calculée pendant le rendu : c'est une dépendance stable, donc
  // l'effet ne se déclenche que quand un filtre change réellement.
  const p = new URLSearchParams();
  for (const [cle, valeur] of Object.entries(filtres)) {
    if (valeur === true) p.set(cle, "1");
    else if (typeof valeur === "string" && valeur.trim()) p.set(cle, valeur.trim());
  }
  const qs = p.toString();

  useEffect(() => {
    window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
  }, [qs]);

  return qs;
}

/** L'adresse de l'écran courant, filtres compris — à donner à `avecRetour`. */
export function iciAvecFiltres(chemin: string, qs: string): string {
  return qs ? `${chemin}?${qs}` : chemin;
}

/** Lecture d'un booléen posé par `useSyncUrl` (« 1 » = vrai). */
export function boolUrl(valeur: string | null): boolean {
  return valeur === "1";
}
