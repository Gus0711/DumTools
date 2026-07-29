// Modèle de l'import magasin — PARTAGÉ client/serveur (l'écran de correspondance
// des colonnes en dépend). Le moteur lui-même vit dans import.ts (server-only).

export type GenreImport = "produits" | "stock";

export const GENRE_LABEL: Record<GenreImport, string> = {
  produits: "Produits",
  stock: "Stock initial",
};

export const GENRE_AIDE: Record<GenreImport, string> = {
  produits:
    "Le référentiel, fournisseur et prix d'achat compris — un produit = un fournisseur, donc tout tient sur une ligne.",
  stock:
    "Les quantités en place. Chaque ligne produit une RÉCEPTION datée du jour, annotée « reprise » — le stock initial n'est pas un cas particulier.",
};

export interface ChampImport {
  cle: string;
  libelle: string;
  requis: boolean;
  aide?: string;
  /** Fragments de titre de colonne qui font reconnaître le champ tout seul. */
  indices: string[];
}

export const CHAMPS: Record<GenreImport, ChampImport[]> = {
  produits: [
    {
      cle: "refInterne",
      libelle: "Référence interne",
      requis: true,
      aide: "La clé de la maison — c'est elle qui décide création ou mise à jour.",
      indices: ["ref interne", "reference interne", "ref. interne", "code article", "notre ref"],
    },
    {
      cle: "refFabricant",
      libelle: "Référence fabricant",
      requis: false,
      indices: ["ref fabricant", "reference fabricant", "ref constructeur", "ref fournisseur"],
    },
    { cle: "designation", libelle: "Désignation", requis: true, indices: ["designation", "libelle", "description", "produit", "article"] },
    { cle: "marque", libelle: "Marque", requis: false, indices: ["marque", "fabricant", "constructeur"] },
    { cle: "categorie", libelle: "Catégorie", requis: false, indices: ["categorie", "famille", "type"] },
    { cle: "unite", libelle: "Unité", requis: false, indices: ["unite", "u.", "conditionnement"] },
    { cle: "seuilMini", libelle: "Seuil mini", requis: false, indices: ["seuil", "mini", "stock mini", "alerte"] },
    { cle: "emplacement", libelle: "Emplacement", requis: false, indices: ["emplacement", "bac", "etagere", "rangement", "localisation"] },
    { cle: "note", libelle: "Note", requis: false, indices: ["note", "commentaire", "remarque"] },
    {
      cle: "fournisseur",
      libelle: "Fournisseur",
      requis: false,
      aide: "Créé s'il n'existe pas encore.",
      indices: ["fournisseur", "supplier", "vendeur"],
    },
    {
      cle: "refFournisseur",
      libelle: "Réf. chez le fournisseur",
      requis: false,
      indices: ["ref fournisseur", "code fournisseur", "reference fournisseur"],
    },
    {
      cle: "prixAchat",
      libelle: "Prix d'achat",
      requis: false,
      aide: "Sert à chiffrer tant qu'aucune réception n'a été valorisée.",
      indices: ["prix", "tarif", "pu", "cout", "achat"],
    },
    { cle: "delaiJours", libelle: "Délai (jours)", requis: false, indices: ["delai", "lead"] },
  ],
  stock: [
    {
      cle: "ref",
      libelle: "Référence produit",
      requis: true,
      aide: "Référence interne, ou à défaut référence fabricant.",
      indices: ["ref", "reference", "code article", "article"],
    },
    { cle: "quantite", libelle: "Quantité", requis: true, indices: ["quantite", "qte", "qty", "stock", "nombre"] },
    { cle: "prix", libelle: "Prix unitaire", requis: false, aide: "Valorise la reprise et amorce le prix moyen.", indices: ["prix", "pu", "cout", "tarif", "achat"] },
    { cle: "depot", libelle: "Dépôt", requis: false, aide: "Nom ou code. Vide = Atelier.", indices: ["depot", "magasin", "lieu", "site"] },
    { cle: "series", libelle: "N° de série", requis: false, aide: "Séparés par des virgules, facultatif.", indices: ["serie", "numero de serie", "sn", "n° serie"] },
  ],
};

/** Normalise un titre de colonne pour la comparaison (accents, ponctuation). */
export function normaliserTitre(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Devine la correspondance colonne → champ d'après les titres. Une devinette,
 * pas une décision : l'écran la montre et on la corrige d'un clic.
 */
export function devinerMapping(genre: GenreImport, colonnes: string[]): Record<string, number> {
  const mapping: Record<string, number> = {};
  const pris = new Set<number>();
  const titres = colonnes.map(normaliserTitre);

  for (const champ of CHAMPS[genre]) {
    let trouve = -1;
    // 1. Égalité franche avec le libellé ou un indice.
    for (let i = 0; i < titres.length && trouve < 0; i++) {
      if (pris.has(i)) continue;
      if (titres[i] === normaliserTitre(champ.libelle)) trouve = i;
      else if (champ.indices.some((ind) => titres[i] === normaliserTitre(ind))) trouve = i;
    }
    // 2. À défaut, un indice contenu dans le titre.
    for (let i = 0; i < titres.length && trouve < 0; i++) {
      if (pris.has(i) || !titres[i]) continue;
      if (champ.indices.some((ind) => titres[i].includes(normaliserTitre(ind)))) trouve = i;
    }
    if (trouve >= 0) {
      mapping[champ.cle] = trouve;
      pris.add(trouve);
    }
  }
  return mapping;
}

export interface GrilleImport {
  nomFichier: string;
  colonnes: string[];
  lignes: string[][];
  /** Nombre de lignes réellement lues (le fichier peut avoir été tronqué). */
  total: number;
  tronquee: boolean;
}

export type ActionLigne = "creation" | "maj" | "rejet";

export interface LignePreview {
  /** Index dans la grille (0 = première ligne de données, hors en-tête). */
  index: number;
  action: ActionLigne;
  libelle: string;
  detail: string;
  motif?: string;
}

export interface ResultatImport {
  lignes: LignePreview[];
  nbCreees: number;
  nbMajs: number;
  nbRejetees: number;
}
