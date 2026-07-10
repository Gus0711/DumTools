// Normalisation des noms de dossiers pour matcher l'arborescence kDrive
// EXISTANTE (rangée à la main). Pur, client-safe, sans dépendance : la fonction
// de résolution (resolution.ts) l'utilise pour réutiliser un dossier existant
// plutôt que d'en créer un doublon quand le nom varie (casse, accents, tirets,
// espaces). Testé dans normalize.test.ts.

/**
 * Réduit un segment de chemin à sa forme canonique de comparaison :
 * - accents retirés (é → e), casse ignorée ;
 * - tous les tirets typographiques (– — ‑ …) ramenés au tiret ASCII ;
 * - espaces (y compris insécables) compactés, espaces autour des tirets retirés ;
 * - espaces de bord supprimés.
 * Deux noms qui ne diffèrent QUE par ces variations deviennent égaux.
 */
export function normaliserSegment(segment: string): string {
  return (segment ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // diacritiques
    .replace(/[   ]/g, " ") // espaces insécables → espace
    .replace(/[‐-―−]/g, "-") // – — ‒ ‑ − → -
    .toLowerCase()
    .replace(/\s*-\s*/g, "-") // espaces autour d'un tiret
    .replace(/\s+/g, " ") // espaces multiples
    .trim();
}

/** Vrai si deux noms de dossier désignent le même dossier après normalisation. */
export function segmentsEgaux(a: string, b: string): boolean {
  return normaliserSegment(a) === normaliserSegment(b);
}
