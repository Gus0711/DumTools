/* Modèle métier des notes de frais — CLIENT-SAFE.
 * Aucun import de Prisma ni de "server-only" : ce fichier est chargé par les
 * composants client (saisie, récap). Les types de profil et de catégorie sont
 * redéclarés en unions de chaînes IDENTIQUES aux enums Prisma : le serveur
 * caste, le client ne tire pas le client Prisma dans son bundle.
 *
 * Voir docs/NDF.md pour le cadrage complet et le mapping des colonnes Excel. */

export type ProfilNdf = "TECHNICIEN" | "DIRECTION_RA";

export type CategorieFrais =
  | "TRANSPORT"
  | "CARBURANT"
  | "ACHATS_DIVERS"
  | "REPAS_HOTEL_SEUL"
  | "REPAS_HOTEL_ACCOMPAGNE"
  | "ENTRETIEN_VEHICULE"
  | "REPAS_AFFAIRES"
  | "CONSOMMATIONS";

export const LIBELLE_PROFIL: Record<ProfilNdf, string> = {
  TECHNICIEN: "Technicien",
  DIRECTION_RA: "Direction / Responsable d'affaires",
};

/** Libellé court, celui des boutons de saisie. */
export const LIBELLE_CATEGORIE: Record<CategorieFrais, string> = {
  TRANSPORT: "Transport, péage, parking",
  CARBURANT: "Essence, gazole",
  ACHATS_DIVERS: "Achats divers",
  REPAS_HOTEL_SEUL: "Restaurant ou hôtel — seul",
  REPAS_HOTEL_ACCOMPAGNE: "Restaurant ou hôtel — accompagné",
  ENTRETIEN_VEHICULE: "Entretien du véhicule",
  REPAS_AFFAIRES: "Repas d'affaires (avec invités)",
  CONSOMMATIONS: "Consommations",
};

/** Exemple concret affiché sous le libellé : lever le doute sans lire une notice. */
export const EXEMPLE_CATEGORIE: Record<CategorieFrais, string> = {
  TRANSPORT: "péage, parking, train, taxi",
  CARBURANT: "plein du véhicule de service",
  ACHATS_DIVERS: "petit matériel, nuit d'hôtel, consommable",
  REPAS_HOTEL_SEUL: "déjeuner en déplacement, sans personne",
  REPAS_HOTEL_ACCOMPAGNE: "repas avec un collègue ou un client",
  ENTRETIEN_VEHICULE: "lavage, révision, pneus",
  REPAS_AFFAIRES: "invitation client ou fournisseur",
  CONSOMMATIONS: "café, boissons, petite réception",
};

/**
 * Chaque profil ne voit QUE ses rubriques : un technicien ne se verra jamais
 * proposer « repas d'affaires », un RA jamais « entretien véhicule ». C'est ce
 * qui permet de garder une saisie à quatre ou six boutons, lisible au pouce.
 */
export const CATEGORIES_PAR_PROFIL: Record<ProfilNdf, CategorieFrais[]> = {
  TECHNICIEN: [
    "TRANSPORT",
    "CARBURANT",
    "REPAS_HOTEL_SEUL",
    "REPAS_HOTEL_ACCOMPAGNE",
    "ENTRETIEN_VEHICULE",
    "ACHATS_DIVERS",
  ],
  DIRECTION_RA: [
    "TRANSPORT",
    "CARBURANT",
    "REPAS_AFFAIRES",
    "CONSOMMATIONS",
    "ACHATS_DIVERS",
  ],
};

/** Seule rubrique qui ouvre les champs « invités » (colonnes K et P:Q du gabarit
 *  Direction/RA). */
export function demandeInvites(c: CategorieFrais): boolean {
  return c === "REPAS_AFFAIRES";
}

export function categorieAutorisee(
  profil: ProfilNdf,
  c: CategorieFrais,
): boolean {
  return CATEGORIES_PAR_PROFIL[profil].includes(c);
}

/* ---------------------------------------------------------------- périodes */

/** Période d'imputation « YYYY-MM ». */
export type Periode = string;

const MOIS = [
  "janvier",
  "février",
  "mars",
  "avril",
  "mai",
  "juin",
  "juillet",
  "août",
  "septembre",
  "octobre",
  "novembre",
  "décembre",
];

/** « 2026-07 » à partir d'une date (en heure LOCALE : une dépense du 1er à 00h30
 *  appartient bien au mois qui commence, pas au précédent en UTC). */
export function periodeDe(d: Date): Periode {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function libellePeriode(p: Periode): string {
  const [a, m] = p.split("-");
  const i = Number(m) - 1;
  return `${MOIS[i] ?? "?"} ${a}`;
}

/** Version capitalisée, pour un titre. */
export function titrePeriode(p: Periode): string {
  const s = libellePeriode(p);
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function periodeSuivante(p: Periode): Periode {
  const [a, m] = p.split("-").map(Number);
  return m === 12
    ? `${a + 1}-01`
    : `${a}-${String(m + 1).padStart(2, "0")}`;
}

export function periodePrecedente(p: Periode): Periode {
  const [a, m] = p.split("-").map(Number);
  return m === 1
    ? `${a - 1}-12`
    : `${a}-${String(m - 1).padStart(2, "0")}`;
}

const PERIODE_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
export function periodeValide(p: string): boolean {
  return PERIODE_RE.test(p);
}

/** Les N dernières périodes, de la plus récente à la plus ancienne. */
export function dernieresPeriodes(depuis: Periode, n: number): Periode[] {
  const out: Periode[] = [];
  let p = depuis;
  for (let i = 0; i < n; i++) {
    out.push(p);
    p = periodePrecedente(p);
  }
  return out;
}

/* ---------------------------------------------------------------- montants */

/** Centimes → « 12,40 € ». Tout est stocké en centimes : jamais de flottant. */
export function formatEuros(cents: number): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
  }).format(cents / 100);
}

/**
 * Saisie libre → centimes. Tolère « 12,40 », « 12.40 », « 12 € », « 12,4 »,
 * les espaces fines et les séparateurs de milliers. Retourne null si ce n'est
 * pas un montant exploitable — au terrain, on tape vite et mal.
 */
export function parseMontant(saisie: string): number | null {
  const nettoye = saisie
    .replace(/[€\s  ]/g, "")
    .replace(/\.(?=\d{3}\b)/g, "")
    .replace(",", ".");
  if (!nettoye || !/^\d*\.?\d*$/.test(nettoye)) return null;
  const v = Number(nettoye);
  if (!Number.isFinite(v) || v <= 0) return null;
  return Math.round(v * 100);
}

/* ------------------------------------------------------------------- vues */

/** Une dépense telle que la voit le client (dates sérialisées en ISO court). */
export interface DepenseVue {
  id: string;
  /** « 2026-07-14 ». */
  date: string;
  categorie: CategorieFrais;
  montantCents: number;
  tvaCents: number | null;
  descriptif: string;
  numeroAffaire: string;
  nbInvites: number | null;
  invites: string;
  periode: Periode;
  /** Non nul = dépense reportée (justificatif arrivé après transmission). */
  periodeOrigine: Periode | null;
  justificatifs: { id: string; mimeType: string; nomOrigine: string }[];
}

export function estComplete(d: DepenseVue): boolean {
  return d.justificatifs.length > 0;
}

export function totalCents(depenses: DepenseVue[]): number {
  return depenses.reduce((s, d) => s + d.montantCents, 0);
}

/** Sous-totaux par rubrique, dans l'ordre du profil (pour l'affichage du récap). */
export function totauxParCategorie(
  depenses: DepenseVue[],
  profil: ProfilNdf,
): { categorie: CategorieFrais; cents: number }[] {
  return CATEGORIES_PAR_PROFIL[profil]
    .map((c) => ({
      categorie: c,
      cents: depenses
        .filter((d) => d.categorie === c)
        .reduce((s, d) => s + d.montantCents, 0),
    }))
    .filter((t) => t.cents > 0);
}

/* ----------------------------------------------------------------- alertes */

export type NiveauAlerte = "info" | "attention";

export interface Alerte {
  niveau: NiveauAlerte;
  message: string;
  /** Dépenses concernées, pour pouvoir les mettre en évidence. */
  depenseIds: string[];
}

/** Au-delà, on demande confirmation : un ticket de restaurant à 400 € est plus
 *  souvent une virgule oubliée qu'un vrai repas. */
const SEUIL_ABERRANT_CENTS: Partial<Record<CategorieFrais, number>> = {
  TRANSPORT: 15_000,
  CARBURANT: 25_000,
  REPAS_HOTEL_SEUL: 8_000,
  REPAS_HOTEL_ACCOMPAGNE: 20_000,
  CONSOMMATIONS: 15_000,
};

/**
 * Contrôles de cohérence passés avant génération. Ils SIGNALENT, ils ne bloquent
 * jamais : le seul filtre dur est l'absence de justificatif, qui écarte la
 * dépense du récap sans rien empêcher.
 */
export function alertesRecap(depenses: DepenseVue[]): Alerte[] {
  const out: Alerte[] = [];

  const sansAffaire = depenses.filter((d) => !d.numeroAffaire.trim());
  if (sansAffaire.length > 0) {
    out.push({
      niveau: "info",
      message:
        sansAffaire.length === 1
          ? "1 dépense sans numéro d'affaire."
          : `${sansAffaire.length} dépenses sans numéro d'affaire.`,
      depenseIds: sansAffaire.map((d) => d.id),
    });
  }

  // Doublon probable : même jour, même montant, même rubrique.
  const vus = new Map<string, string[]>();
  for (const d of depenses) {
    const cle = `${d.date}|${d.montantCents}|${d.categorie}`;
    vus.set(cle, [...(vus.get(cle) ?? []), d.id]);
  }
  const doublons = [...vus.values()].filter((ids) => ids.length > 1).flat();
  if (doublons.length > 0) {
    out.push({
      niveau: "attention",
      message:
        "Doublon probable : même date, même montant et même rubrique saisis plusieurs fois.",
      depenseIds: doublons,
    });
  }

  const aberrants = depenses.filter((d) => {
    const seuil = SEUIL_ABERRANT_CENTS[d.categorie];
    return seuil != null && d.montantCents > seuil;
  });
  if (aberrants.length > 0) {
    out.push({
      niveau: "attention",
      message:
        aberrants.length === 1
          ? "Un montant paraît anormalement élevé pour sa rubrique — virgule oubliée ?"
          : `${aberrants.length} montants paraissent anormalement élevés pour leur rubrique.`,
      depenseIds: aberrants.map((d) => d.id),
    });
  }

  const sansDescriptif = depenses.filter((d) => !d.descriptif.trim());
  if (sansDescriptif.length > 0) {
    out.push({
      niveau: "info",
      message:
        "Descriptif manquant : la compta ne saura pas à quoi correspond la ligne.",
      depenseIds: sansDescriptif.map((d) => d.id),
    });
  }

  return out;
}

/** Nombre de lignes par feuille dans les deux gabarits Excel. Au-delà, l'export
 *  déborde sur une feuille supplémentaire (le gabarit ne peut pas s'étirer sans
 *  casser sa zone d'impression). */
export const LIGNES_PAR_FEUILLE = 31;
