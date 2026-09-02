// Types partagés du référentiel client (client-safe : pas de "server-only" ici,
// les modules d'outils importent ClientArtefact pour typer leur provider).

/** Une réalisation d'un outil rattachée à un client (ligne de la fiche client). */
export interface ClientArtefact {
  /** Identifiant du document dans son outil. */
  id: string;
  /** Libellé affiché (titre du document / nom du projet). */
  titre: string;
  /** Lien direct vers le document dans l'outil. */
  href: string;
  /** Référence WhySoft de l'affaire / du chantier (null si non saisie). */
  numeroWhy: string | null;
  /** Dernière modification (tri chronologique de la fiche client). */
  updatedAt: Date;
  /** Résumé court propre à l'outil (ex. « 33 points », « 5 modules · 40 E/S »). */
  resume: string;
}

/** ClientArtefact enrichi de l'outil d'origine (produit par l'agrégateur). */
export interface ClientRealisation extends ClientArtefact {
  toolId: string;
  toolNom: string;
}

/**
 * Une personne chez le client (docs/DEVIS.md §24).
 *
 * Ici et pas dans `queries.ts` : la pastille « Client » de l'éditeur de devis
 * est un composant CLIENT, et `queries.ts` est `server-only` — même règle que
 * les types de la palette de recherche.
 *
 * ⚠️ Ce que porte un DEVIS n'est pas ce type : c'est une COPIE figée
 * (`contactNom`/`contactFonction`/…). Ce référentiel-ci vit.
 */
export interface ContactClientVue {
  id: string;
  civilite: string;
  nom: string;
  fonction: string;
  email: string;
  telephone: string;
  mobile: string;
  note: string;
  /** Celui qu'on propose d'office sur un nouveau devis de ce client. */
  principal: boolean;
  /** A quitté la maison : retiré des propositions, jamais des devis. */
  actif: boolean;
}

/** La fiche d'un client : son identité postale et ses personnes. Client-safe
 *  pour la même raison que ci-dessus (les deux blocs de la fiche sont des
 *  composants client). */
export interface ClientDetail {
  id: string;
  nom: string;
  adresse: string;
  codePostal: string;
  ville: string;
  telephone: string;
  email: string;
  contacts: ContactClientVue[];
}
