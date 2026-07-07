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
