/* =============================================================================
 * D'OÙ L'ON VIENT
 *
 * Une fiche s'ouvre depuis plusieurs écrans : un produit depuis le rayon ou
 * depuis le besoin matériel d'une affaire, une visite depuis l'outil ou depuis
 * l'affaire. Un lien de retour écrit en dur renvoie tout le monde au même
 * endroit — on cliquait un article depuis une affaire et on se retrouvait dans
 * le magasin, l'affaire perdue.
 *
 * L'écran d'origine emporte donc son chemin dans `?retour=`, et la fiche le
 * relit. Ce n'est PAS le bouton du navigateur : c'est le lien de retour du
 * cartouche, qui doit dire la vérité même quand on arrive par un favori.
 *
 * ⚠️ Un chemin qui vient de l'URL est une porte de sortie potentielle : il est
 * validé (interne, absolu, jamais `//` qui serait une adresse protocol-relative
 * déguisée en chemin). Le libellé, lui, se DÉDUIT du chemin — le faire porter
 * par l'URL laisserait n'importe qui écrire n'importe quoi dans notre interface.
 * ========================================================================== */

/** Libellé du retour selon le chemin — du plus précis au plus général. */
const LIBELLES: [prefixe: string, label: string][] = [
  ["/outils/magasin/affaires/", "Le matériel de l'affaire"],
  ["/outils/magasin/nomenclature", "La nomenclature"],
  ["/outils/magasin/inventaires", "Les inventaires"],
  ["/outils/magasin/fournisseurs", "Les fournisseurs"],
  ["/outils/magasin", "Le rayon"],
  ["/outils/visites", "Toutes les visites"],
  ["/outils/affectation-es", "Les projets GTB"],
  ["/outils/notes", "Les notes"],
  ["/outils/wiki", "Le wiki"],
  ["/affaires/", "L'affaire"],
  ["/affaires", "Affaires"],
  // Les libellés reprennent MOT POUR MOT celui que l'écran affiche déjà quand
  // on arrive sans origine : un retour ne doit pas changer de nom selon le
  // chemin emprunté.
  ["/clients", "Clients"],
  ["/", "L'accueil"],
];

/**
 * Le lien de retour d'un cartouche : celui demandé par `?retour=` s'il est
 * acceptable, sinon celui de l'écran par défaut.
 */
export function lienRetour(
  brut: string | undefined | null,
  defaut: { href: string; label: string },
): { href: string; label: string } {
  if (!brut || !brut.startsWith("/") || brut.startsWith("//")) return defaut;
  const trouve = LIBELLES.find(([prefixe]) => brut.startsWith(prefixe));
  return { href: brut, label: trouve?.[1] ?? "Retour" };
}

/**
 * Ajoute `?retour=<origine>` à un lien sortant, en respectant une éventuelle
 * chaîne de requête déjà présente.
 */
export function avecRetour(href: string, origine: string): string {
  return `${href}${href.includes("?") ? "&" : "?"}retour=${encodeURIComponent(origine)}`;
}
