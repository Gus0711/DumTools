"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

/* =============================================================================
 * LES FILTRES VIVENT DANS L'URL — ET SE SOUVIENNENT DU POSTE
 *
 * Un écran de liste garde sa recherche et ses filtres dans un `useState`. Quand
 * on ouvre une fiche puis qu'on revient, le composant est REMONTÉ : l'état est
 * neuf, donc revenu à son défaut. On croit avoir perdu sa sélection ; en fait
 * elle n'a jamais été retenue.
 *
 * DEUX ÉTAGES, et il en faut bien deux :
 *
 *  1. L'ADRESSE — ce qui décrit la vue. Elle se met en favori, se colle dans un
 *     message, revient avec la flèche du navigateur et voyage dans le `?retour=`
 *     des fiches (lib/retour). C'est la vérité PARTAGEABLE.
 *
 *  2. LA MÉMOIRE DU POSTE (`localStorage`) — ce qu'on avait réglé la dernière
 *     fois. Parce que l'adresse ne couvre QUE les retours par la flèche et par
 *     le lien de la fiche : revenir par le rail, par l'accueil, par ⌘K ou par un
 *     favori amène sur `/affaires` tout nu, et tout retombait au défaut. C'est
 *     précisément l'agacement quotidien qu'on répare ici.
 *     Même convention que le thème, la densité et le réglage des colonnes
 *     (`useColonnes`) : un réglage de confort, par poste, jamais en base.
 *
 * QUI GAGNE — l'adresse, toujours, et EN BLOC. Si elle porte ne serait-ce qu'un
 * des filtres de l'écran, elle le décrit ENTIÈREMENT et la mémoire se tait. Un
 * lien reçu (« regarde les projets sans affaire ») doit montrer ce qu'il annonce,
 * pas ce qu'il annonce filtré par un souvenir invisible — c'est justement ce
 * qu'un mélange filtre par filtre produirait, et la liste paraîtrait vide sans
 * qu'on comprenne pourquoi.
 *
 * ⚠️ `history.replaceState` et NON `router.replace` :
 *   · pas d'aller-retour serveur à chaque frappe (chaque rendu coûte ~100 ms et
 *     Next repréchargerait au passage tous les liens visibles) ;
 *   · pas une entrée d'historique par caractère tapé — sinon le bouton
 *     « retour » défait des lettres au lieu de changer d'écran.
 * Next accepte officiellement cette écriture directe depuis la v15.
 * ========================================================================== */

const PREFIXE = "dumtools:filtres:";

/** Le dernier réglage retenu pour cet écran, tel quel (une query string). */
function lireMemoire(cle: string): string | null {
  try {
    return window.localStorage.getItem(PREFIXE + cle);
  } catch {
    // Navigation privée, stockage refusé : les filtres marchent quand même,
    // ils ne se souviennent juste de rien.
    return null;
  }
}

/**
 * Retient le réglage — ou EFFACE l'entrée quand il n'y a plus rien à retenir.
 * Une chaîne vide veut dire « tout est au défaut », et c'est ce que produit le
 * bouton « Réinitialiser » : on efface plutôt que d'écrire le défaut, sinon un
 * défaut qui change plus tard (Commande ajoutée à En cours, par exemple)
 * n'atteindrait jamais ceux qui ont déjà cliqué une fois.
 */
function ecrireMemoire(cle: string, qs: string) {
  try {
    if (qs) window.localStorage.setItem(PREFIXE + cle, qs);
    else window.localStorage.removeItem(PREFIXE + cle);
  } catch {
    /* idem : le stockage est un confort, jamais une condition de marche. */
  }
}

/**
 * Reporte les filtres dans l'adresse. Les valeurs vides (chaîne vide, `null`,
 * `undefined`, `false`) ne sont pas écrites : le cas courant garde une URL
 * propre, et ce qui apparaît dans l'adresse est exactement ce qui s'écarte du
 * réglage par défaut.
 *
 * `cle` (facultative) branche la mémoire du poste : le même texte que celui
 * écrit dans l'adresse y est rangé, et `useReprendreFiltres` le relit au
 * prochain passage. Deux écrans ne doivent jamais partager une clé.
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
  cle?: string,
): string {
  // La chaîne est calculée pendant le rendu : c'est une dépendance stable, donc
  // l'effet ne se déclenche que quand un filtre change réellement.
  const p = new URLSearchParams();
  for (const [nom, valeur] of Object.entries(filtres)) {
    if (valeur === true) p.set(nom, "1");
    else if (typeof valeur === "string" && valeur.trim()) p.set(nom, valeur.trim());
  }
  const qs = p.toString();

  useEffect(() => {
    window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
    if (cle) ecrireMemoire(cle, qs);
  }, [qs, cle]);

  return qs;
}

/**
 * Reprend le réglage de la dernière visite, une seule fois, au montage — quand
 * l'adresse, elle, ne dit rien.
 *
 * `noms` = les paramètres qui, présents dans l'adresse, signifient « la vue est
 * déjà décrite, ne te souviens de rien ». Ce sont les filtres de l'écran, plus
 * les éventuels paramètres d'ENTRÉE qui ouvrent la liste préfiltrée
 * (`?sans-affaire=1`) : les oublier ferait retomber un souvenir par-dessus une
 * intention explicite.
 *
 * `reprendre` reçoit un lecteur du réglage mémorisé et repose les états de
 * l'écran. Il est appelé au plus une fois, et jamais si rien n'a été mémorisé.
 *
 * ⚠️ La reprise se fait dans un EFFET, pas dans les initialiseurs de `useState` :
 * ceux-ci tournent aussi côté serveur, où `localStorage` n'existe pas — les
 * alimenter depuis la mémoire ferait diverger le premier rendu client du HTML
 * reçu. On paie donc une image au défaut avant le recalage ; c'est le même
 * compromis que le réglage des colonnes, et c'est invisible à l'usage.
 */
export function useReprendreFiltres(
  cle: string,
  noms: string[],
  reprendre: (valeur: (nom: string) => string | null) => void,
) {
  const params = useSearchParams();

  // Instantané pris au PREMIER RENDU. `useSyncUrl` part, lui, avec les valeurs
  // par défaut — donc une chaîne vide, donc un effacement de l'entrée — et rien
  // ne garantit l'ordre des deux effets. Ce qu'on a lu ici ne peut plus lui
  // échapper. La valeur ne sert qu'à l'effet : elle n'est jamais rendue, donc
  // elle ne peut pas décaler l'hydratation.
  const [memorise] = useState<string | null>(() =>
    typeof window === "undefined" ? null : lireMemoire(cle),
  );

  const urlParle = noms.some((nom) => params.get(nom) !== null);
  const fait = useRef(false);

  useEffect(() => {
    if (fait.current || urlParle || !memorise) return;
    fait.current = true;
    const memo = new URLSearchParams(memorise);
    reprendre((nom) => memo.get(nom));
    // `reprendre` est une fonction écrite en ligne : son identité change à
    // chaque rendu. Le garde-fou `fait` porte l'unicité, pas les dépendances.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memorise, urlParle]);
}

/** L'adresse de l'écran courant, filtres compris — à donner à `avecRetour`. */
export function iciAvecFiltres(chemin: string, qs: string): string {
  return qs ? `${chemin}?${qs}` : chemin;
}

/** Lecture d'un booléen posé par `useSyncUrl` (« 1 » = vrai). */
export function boolUrl(valeur: string | null): boolean {
  return valeur === "1";
}
