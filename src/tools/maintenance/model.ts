/* Modèle métier de l'outil « Maintenance » — CLIENT-SAFE.
 *
 * Aucun import de Prisma ni de "server-only" : ce fichier est chargé par les
 * écrans de saisie. Les enums sont redéclarés en unions de chaînes IDENTIQUES à
 * celles de Prisma — le serveur caste, le client ne tire pas le client Prisma
 * dans son bundle (même patron que notes-de-frais/model.ts).
 *
 * Tout le calcul du forfait vit ici, et RIEN d'autre : c'est ce qui le rend
 * vérifiable sans base (scripts/maintenance-smoke.mts).
 *
 * Voir docs/MAINTENANCE.md pour le cadrage.
 * ========================================================================== */

export type NatureIntervention = "TELEASSISTANCE" | "PRESENTIEL";
export type EtatContrat = "BROUILLON" | "ACTIF" | "SUSPENDU" | "TERMINE";

export const NATURES: NatureIntervention[] = ["TELEASSISTANCE", "PRESENTIEL"];

export const LIBELLE_NATURE: Record<NatureIntervention, string> = {
  TELEASSISTANCE: "Téléassistance",
  PRESENTIEL: "Présentiel",
};

/** Libellé court, celui des colonnes de table et des pastilles. */
export const LIBELLE_NATURE_COURT: Record<NatureIntervention, string> = {
  TELEASSISTANCE: "Télé",
  PRESENTIEL: "Sur site",
};

export const LIBELLE_ETAT: Record<EtatContrat, string> = {
  BROUILLON: "Brouillon",
  ACTIF: "Actif",
  SUSPENDU: "Suspendu",
  TERMINE: "Terminé",
};

/** Ton de badge par état — la couleur double toujours le mot, jamais seule. */
export const TON_ETAT: Record<EtatContrat, "neutral" | "success" | "warning"> = {
  BROUILLON: "neutral",
  ACTIF: "success",
  SUSPENDU: "warning",
  TERMINE: "neutral",
};

/** Les états où le contrat COURT : ceux dont la consommation veut dire quelque
 *  chose, et les seuls que les compteurs de l'index additionnent. */
export const ETATS_EN_COURS: EtatContrat[] = ["ACTIF", "SUSPENDU"];

/* ==========================================================================
 * LE TEMPS — EN MINUTES ENTIÈRES, JAMAIS EN HEURES DÉCIMALES
 *
 * 1 h 10 n'est pas 1,17 h. Un arrondi se déciderait deux fois — à la saisie et
 * au total — et les deux compteurs finiraient par diverger d'une poignée de
 * minutes que personne ne saurait expliquer devant le client. Même règle que
 * l'argent en centimes dans le Devis.
 * ========================================================================== */

/**
 * Saisie libre → minutes. Tolère « 1h30 », « 1 h 30 », « 1:30 », « 90 »,
 * « 90 min », « 1,5 h », « 0h20 ».
 *
 * ⚠️ UNE AMBIGUÏTÉ, TRANCHÉE ET AFFICHÉE : un nombre ENTIER nu vaut des
 * MINUTES (« 20 » = 20 min — c'est ce qu'on tape pour un appel), un nombre à
 * VIRGULE vaut des HEURES (« 1,5 » = 1 h 30 — personne n'écrit 1,5 minute).
 * Ce n'est pas devinable : la saisie RÉAFFICHE en clair ce qu'elle a compris
 * (« 1 h 30 »), et c'est ce retour, pas la règle, qui empêche l'erreur.
 *
 * Retourne null si ce n'est pas une durée exploitable.
 */
export function parseDuree(saisie: string): number | null {
  const s = (saisie ?? "").trim().toLowerCase().replace(/ | /g, " ");
  if (!s) return null;

  // « 1h30 », « 1 h 30 », « 1h », « h30 » — et « 1:30 ».
  const hm = s.match(/^(\d*)\s*(?:h|:)\s*(\d{0,2})\s*(?:min|mn|m)?$/);
  if (hm) {
    const h = hm[1] ? Number(hm[1]) : 0;
    const m = hm[2] ? Number(hm[2]) : 0;
    if (m > 59) return null;
    const total = h * 60 + m;
    return total > 0 ? total : null;
  }

  // « 90 min », « 90mn », « 45 m »
  const min = s.match(/^(\d+)\s*(?:min|mn|m)$/);
  if (min) {
    const v = Number(min[1]);
    return v > 0 ? v : null;
  }

  // Nombre nu : entier → minutes, décimal → heures (voir l'avertissement).
  const nu = s.replace(",", ".").replace(/\s/g, "");
  if (!/^\d*\.?\d+$/.test(nu)) return null;
  const v = Number(nu);
  if (!Number.isFinite(v) || v <= 0) return null;
  if (Number.isInteger(v)) return v;
  return Math.round(v * 60);
}

/** Minutes → « 3 h 25 », « 45 min », « 3 h ». 0 → « 0 min ». */
export function formatDuree(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r === 0 ? `${h} h` : `${h} h ${String(r).padStart(2, "0")}`;
}

/** Variante SIGNÉE, pour un solde : « −2 h 10 » quand le forfait est dépassé. */
export function formatSolde(minutes: number): string {
  return minutes < 0 ? `−${formatDuree(-minutes)}` : formatDuree(minutes);
}

/** Minutes → heures décimales arrondies au centième. Réservé aux EXPORTS
 *  (CSV, reprise dans un devis) : à l'écran on montre toujours « 1 h 30 ». */
export function enHeuresDecimales(minutes: number): number {
  return Math.round((minutes / 60) * 100) / 100;
}

/**
 * Saisie d'un FORFAIT → minutes. Un forfait se pense en HEURES : « 10 » vaut
 * 10 h, « 10,5 » vaut 10 h 30, « 10h30 » aussi.
 *
 * ⚠️ RÈGLE DIFFÉRENTE de `parseDuree`, où un entier nu vaut des MINUTES. Ce
 * n'est pas une incohérence, c'est le contexte : personne n'écrit un forfait
 * annuel de « 600 » et personne ne chronomètre un appel en « 0,33 ». Les deux
 * champs affichent ce qu'ils ont compris, et c'est là que ça se joue.
 *
 * Vide ou « 0 » rend 0 — « aucune heure incluse » est une clause, pas une
 * saisie manquante. Null = ce n'est pas un nombre d'heures.
 */
export function parseHeures(saisie: string): number | null {
  const s = (saisie ?? "").trim();
  if (!s) return 0;
  if (/[h:]/i.test(s)) return parseDuree(s);
  const nu = s.replace(",", ".").replace(/\s/g, "").replace(/h$/i, "");
  if (!/^\d*\.?\d+$/.test(nu)) return null;
  const v = Number(nu);
  if (!Number.isFinite(v) || v < 0) return null;
  return Math.round(v * 60);
}

/**
 * Saisie d'un montant → centimes. Vide rend 0 (« non renseigné »), et c'est ce
 * zéro qui fait dire à l'écran « tarif horaire non renseigné » au lieu
 * d'afficher un prix de zéro euro.
 */
export function parseEuros(saisie: string): number | null {
  const s = (saisie ?? "").trim();
  if (!s) return 0;
  const nu = s
    .replace(/[€\s ]/g, "")
    .replace(/\.(?=\d{3}\b)/g, "")
    .replace(",", ".");
  if (!nu || !/^\d*\.?\d*$/.test(nu)) return null;
  const v = Number(nu);
  if (!Number.isFinite(v) || v < 0) return null;
  return Math.round(v * 100);
}

/* ==========================================================================
 * LES JOURS
 * Une date d'ici est un JOUR, pas un instant : elle est stockée à MIDI UTC,
 * jamais minuit — à minuit, tout fuseau à l'ouest la ramène à la veille
 * (le piège déjà payé sur `TacheAffaire.echeance`).
 * ========================================================================== */

const JOUR_RE = /^\d{4}-\d{2}-\d{2}$/;

export function estJourValide(iso: string): boolean {
  if (!JOUR_RE.test(iso)) return false;
  const d = new Date(`${iso}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && isoJour(d) === iso;
}

/** « 2026-09-11 » → Date à midi UTC. */
export function jour(iso: string): Date {
  return new Date(`${iso}T12:00:00Z`);
}

/** Date → « 2026-09-11 » (composantes UTC : voir ci-dessus). */
export function isoJour(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Aujourd'hui, ramené à midi UTC — le repère de tous les calculs d'échéance. */
export function aujourdhui(maintenant: Date = new Date()): Date {
  return new Date(
    Date.UTC(
      maintenant.getUTCFullYear(),
      maintenant.getUTCMonth(),
      maintenant.getUTCDate(),
      12,
      0,
      0,
    ),
  );
}

function joursDansMois(annee: number, mois: number): number {
  return new Date(Date.UTC(annee, mois + 1, 0)).getUTCDate();
}

/**
 * Ajoute n années en RESTANT dans le mois : le 29 février + 1 an donne le
 * 28 février, jamais le 1er mars. Sans ce serrage, un contrat signé un
 * 29 février verrait sa date anniversaire dériver d'un jour tous les quatre
 * ans — et la période de consommation avec elle.
 */
export function ajouterAnnees(d: Date, n: number): Date {
  const annee = d.getUTCFullYear() + n;
  const mois = d.getUTCMonth();
  const jourDuMois = Math.min(d.getUTCDate(), joursDansMois(annee, mois));
  return new Date(Date.UTC(annee, mois, jourDuMois, 12, 0, 0));
}

export function ajouterJours(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 86_400_000);
}

/** Écart en jours de CALENDRIER (les deux dates étant à midi UTC, la division
 *  est exacte et ne dépend d'aucun fuseau). */
export function ecartJours(de: Date, a: Date): number {
  return Math.round((a.getTime() - de.getTime()) / 86_400_000);
}

export function formatJour(d: Date): string {
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeZone: "UTC" }).format(d);
}

export function formatJourCourt(d: Date): string {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    timeZone: "UTC",
  }).format(d);
}

/* ==========================================================================
 * LES PÉRIODES — DÉRIVÉES, JAMAIS STOCKÉES
 *
 * Le forfait se consomme par ANNÉE DE CONTRAT et repart à zéro à la date
 * anniversaire. On ne crée donc aucune ligne « période » en base : elles se
 * déduisent toutes de `debut`, exactement comme la frise des 7 jalons d'une
 * affaire se déduit de son contenu. Ce qui se déduit ne se saisit jamais,
 * sinon les deux finissent par se contredire et c'est la saisie qui ment.
 * ========================================================================== */

export interface PeriodeContrat {
  /** 0 = la première année du contrat. */
  index: number;
  /** Premier jour, INCLUS. */
  debut: Date;
  /** Dernier jour, INCLUS — celui qu'on affiche. */
  dernierJour: Date;
  /** Borne haute EXCLUE, celle des comparaisons. */
  fin: Date;
  /** Le contrat s'arrête au milieu de l'année : la période est écourtée. */
  tronquee: boolean;
}

/** Garde-fou : un contrat de plus d'un siècle est une faute de saisie, pas une
 *  raison de boucler sans fin. */
const MAX_PERIODES = 100;

/**
 * Les périodes d'un contrat, de la première jusqu'à celle qui contient
 * `jusqua` (ou jusqu'au terme du contrat s'il est antérieur).
 *
 * `fin` est le DERNIER JOUR du contrat, inclus ; null = sans terme convenu.
 */
export function periodesContrat(
  debut: Date,
  fin: Date | null,
  jusqua: Date,
): PeriodeContrat[] {
  const out: PeriodeContrat[] = [];
  // Borne haute exclusive du contrat : le lendemain de son dernier jour.
  const finExclue = fin ? ajouterJours(fin, 1) : null;

  for (let i = 0; i < MAX_PERIODES; i++) {
    const d = ajouterAnnees(debut, i);
    if (finExclue && d.getTime() >= finExclue.getTime()) break;

    const anniversaire = ajouterAnnees(debut, i + 1);
    const tronquee = finExclue != null && finExclue.getTime() < anniversaire.getTime();
    const f = tronquee ? finExclue! : anniversaire;

    out.push({
      index: i,
      debut: d,
      dernierJour: ajouterJours(f, -1),
      fin: f,
      tronquee,
    });

    // On s'arrête dès qu'on a couvert la date demandée.
    if (f.getTime() > jusqua.getTime()) break;
  }

  return out;
}

/** La période qui contient `date`. Null si la date est hors contrat (avant le
 *  début, ou après le terme) — et c'est une information, pas une erreur. */
export function periodeContenant(
  debut: Date,
  fin: Date | null,
  date: Date,
): PeriodeContrat | null {
  if (date.getTime() < debut.getTime()) return null;
  const periodes = periodesContrat(debut, fin, date);
  return (
    periodes.find(
      (p) => date.getTime() >= p.debut.getTime() && date.getTime() < p.fin.getTime(),
    ) ?? null
  );
}

/**
 * La période « en cours » — celle qu'on ouvre par défaut sur la fiche.
 * Un contrat pas encore commencé montre sa PREMIÈRE période, un contrat terminé
 * sa DERNIÈRE : on n'affiche jamais un écran vide en disant « hors période ».
 */
export function periodeCourante(
  debut: Date,
  fin: Date | null,
  maintenant: Date,
): PeriodeContrat {
  const p = periodeContenant(debut, fin, maintenant);
  if (p) return p;
  const toutes = periodesContrat(debut, fin, maintenant);
  if (maintenant.getTime() < debut.getTime()) return toutes[0];
  return toutes[toutes.length - 1];
}

export function libellePeriode(p: PeriodeContrat): string {
  return `${formatJourCourt(p.debut)} → ${formatJourCourt(p.dernierJour)}`;
}

/* ==========================================================================
 * LA RÉPARTITION SUR LE FORFAIT
 *
 * « Hors forfait » a DEUX natures — comme l'arrêt d'une affaire :
 *   · une DÉCISION humaine : ce motif n'est pas couvert (une extension, un
 *     dégât des eaux). Elle ne consomme aucun quota ;
 *   · un DÉPASSEMENT, qui est CONSTATÉ : le forfait de la période est épuisé.
 *
 * Le second se calcule en cumulant les interventions DANS L'ORDRE, et il n'est
 * jamais stocké. Corriger la durée d'une intervention de janvier redistribue
 * tout ce qui suit — c'est exactement ce qu'on veut, et c'est la raison pour
 * laquelle on ne fige rien.
 *
 * Une intervention peut être à CHEVAL : s'il reste 30 min au forfait et qu'on
 * passe 1 h 30, 30 min sont incluses et 1 h est en dépassement. Écrire un
 * booléen par ligne aurait obligé à arrondir en faveur de l'un ou de l'autre.
 * ========================================================================== */

/** Ce dont le calcul a besoin : rien de plus, pour rester testable sans base. */
export interface LignePourForfait {
  id: string;
  date: Date;
  nature: NatureIntervention;
  dureeMin: number;
  /** La DÉCISION humaine (`Intervention.horsForfait`). */
  horsForfait: boolean;
  /** Départage deux interventions du même jour — l'ordre doit être stable,
   *  sinon la répartition changerait d'un affichage à l'autre. */
  createdAt: Date;
}

/**
 * Pourquoi des minutes sont hors forfait.
 *   · `decision`    — un humain a dit que ce motif n'était pas couvert ;
 *   · `depassement` — le forfait de la période est épuisé (CONSTATÉ) ;
 *   · `hors-periode`— l'intervention est datée hors du contrat (avant son
 *     effet, après son terme). ⚠️ Ce cas EXISTE et ne doit pas disparaître en
 *     silence : il suffit d'écourter un contrat après coup, ou de se tromper
 *     d'année à la saisie. Sans ce troisième cas, ces minutes ne tombaient dans
 *     aucune période et s'évaporaient de tous les compteurs — le temps passé
 *     aurait été perdu sans qu'aucun écran ne s'en aperçoive.
 */
export type CauseHorsForfait = "decision" | "depassement" | "hors-periode";

export interface RepartitionLigne {
  id: string;
  /** Minutes prises sur le forfait. */
  inclusMin: number;
  /** Minutes hors forfait. */
  horsMin: number;
  /** Pourquoi — null quand tout est inclus. */
  cause: CauseHorsForfait | null;
}

export interface ConsommationNature {
  nature: NatureIntervention;
  quotaMin: number;
  /** Minutes imputées au forfait. */
  consommeMin: number;
  /** Ce qu'il reste du forfait. Jamais négatif : le dépassement a sa colonne. */
  restantMin: number;
  /** Minutes hors forfait par DÉPASSEMENT (constaté). */
  depassementMin: number;
  /** Minutes hors forfait par DÉCISION (motif non couvert). */
  horsContratMin: number;
  /** Tout le temps passé, quelle qu'en soit l'imputation. */
  totalMin: number;
  nbInterventions: number;
}

export interface Quotas {
  quotaTeleMin: number;
  quotaPresentielMin: number;
}

export interface Repartition {
  lignes: RepartitionLigne[];
  consommation: Record<NatureIntervention, ConsommationNature>;
}

export function quotaDe(q: Quotas, nature: NatureIntervention): number {
  return nature === "TELEASSISTANCE" ? q.quotaTeleMin : q.quotaPresentielMin;
}

/** Ordre de cumul : par date, puis par création. Déterministe, donc la
 *  répartition est la même à chaque calcul. */
function ordonner(lignes: LignePourForfait[]): LignePourForfait[] {
  return [...lignes].sort(
    (a, b) =>
      a.date.getTime() - b.date.getTime() ||
      a.createdAt.getTime() - b.createdAt.getTime() ||
      a.id.localeCompare(b.id),
  );
}

function consommationVide(
  nature: NatureIntervention,
  quotaMin: number,
): ConsommationNature {
  return {
    nature,
    quotaMin,
    consommeMin: 0,
    restantMin: Math.max(0, quotaMin),
    depassementMin: 0,
    horsContratMin: 0,
    totalMin: 0,
    nbInterventions: 0,
  };
}

/**
 * Répartit les interventions D'UNE PÉRIODE sur les deux forfaits.
 *
 * ⚠️ Les deux forfaits NE SE COMPENSENT PAS : une heure de téléassistance
 * épargnée ne paie pas un déplacement. Deux compteurs, jamais un total — c'est
 * ce que dit le contrat, et c'est ce que le client compte de son côté.
 */
export function repartirForfait(
  lignes: LignePourForfait[],
  quotas: Quotas,
): Repartition {
  const consommation: Record<NatureIntervention, ConsommationNature> = {
    TELEASSISTANCE: consommationVide("TELEASSISTANCE", quotas.quotaTeleMin),
    PRESENTIEL: consommationVide("PRESENTIEL", quotas.quotaPresentielMin),
  };

  const out: RepartitionLigne[] = [];

  for (const l of ordonner(lignes)) {
    const c = consommation[l.nature];
    const duree = Math.max(0, Math.round(l.dureeMin));
    c.nbInterventions += 1;
    c.totalMin += duree;

    if (l.horsForfait) {
      // Décision humaine : ne touche pas au quota.
      c.horsContratMin += duree;
      out.push({ id: l.id, inclusMin: 0, horsMin: duree, cause: "decision" });
      continue;
    }

    const place = Math.max(0, c.quotaMin - c.consommeMin);
    const inclus = Math.min(duree, place);
    const hors = duree - inclus;

    c.consommeMin += inclus;
    c.depassementMin += hors;
    c.restantMin = Math.max(0, c.quotaMin - c.consommeMin);

    out.push({
      id: l.id,
      inclusMin: inclus,
      horsMin: hors,
      cause: hors > 0 ? "depassement" : null,
    });
  }

  return { lignes: out, consommation };
}

/** Le total hors forfait d'une nature, les deux causes confondues — ce qu'on
 *  refacture. */
export function totalHorsForfaitMin(c: ConsommationNature): number {
  return c.depassementMin + c.horsContratMin;
}

/** Part du forfait consommée, en pour cent (borné à 100 pour la barre ; le
 *  dépassement se lit à côté, en clair). Un forfait à 0 rend 0. */
export function pourcentConsomme(c: ConsommationNature): number {
  if (c.quotaMin <= 0) return 0;
  return Math.min(100, Math.round((c.consommeMin / c.quotaMin) * 100));
}

/** Seuil d'alerte : au-delà, on prévient que le forfait s'épuise. 80 % parce
 *  qu'en dessous il reste de quoi traiter deux ou trois appels sans réfléchir. */
export const SEUIL_ALERTE_FORFAIT = 80;

/* ==========================================================================
 * LE CONTRAT ENTIER — toutes ses périodes d'un coup
 * ========================================================================== */

export interface PeriodeCalculee {
  periode: PeriodeContrat;
  consommation: Record<NatureIntervention, ConsommationNature>;
  lignes: RepartitionLigne[];
}

export interface CalculContrat {
  /** De la plus ANCIENNE à la plus récente. */
  periodes: PeriodeCalculee[];
  /** L'imputation de chaque intervention, par id — y compris celles qui
   *  tombent hors de toute période. */
  parLigne: Map<string, RepartitionLigne>;
  /** Les interventions datées HORS du contrat. Non vide = quelque chose est à
   *  corriger, et l'écran doit le dire (voir CauseHorsForfait). */
  horsPeriode: LignePourForfait[];
}

/**
 * Calcule TOUT le contrat : une répartition par période, plus l'imputation de
 * chaque intervention.
 *
 * On couvre les périodes jusqu'à la plus tardive des deux — aujourd'hui, ou la
 * dernière intervention saisie. Sans ce second repère, une intervention notée
 * en avance (un déplacement programmé) n'aurait aucune période où tomber.
 */
export function calculerContrat(
  debut: Date,
  fin: Date | null,
  quotas: Quotas,
  lignes: LignePourForfait[],
  maintenant: Date,
): CalculContrat {
  const derniere = lignes.reduce(
    (max, l) => (l.date.getTime() > max.getTime() ? l.date : max),
    maintenant,
  );
  const periodes = periodesContrat(debut, fin, derniere);

  const parLigne = new Map<string, RepartitionLigne>();
  const horsPeriode: LignePourForfait[] = [];
  const placees = new Set<string>();

  const calculees: PeriodeCalculee[] = periodes.map((periode) => {
    const dedans = lignes.filter(
      (l) =>
        l.date.getTime() >= periode.debut.getTime() &&
        l.date.getTime() < periode.fin.getTime(),
    );
    for (const l of dedans) placees.add(l.id);
    const r = repartirForfait(dedans, quotas);
    for (const ligne of r.lignes) parLigne.set(ligne.id, ligne);
    return { periode, consommation: r.consommation, lignes: r.lignes };
  });

  // Ce qui n'est tombé nulle part : intégralement hors forfait, et SIGNALÉ.
  for (const l of lignes) {
    if (placees.has(l.id)) continue;
    horsPeriode.push(l);
    parLigne.set(l.id, {
      id: l.id,
      inclusMin: 0,
      horsMin: Math.max(0, Math.round(l.dureeMin)),
      cause: "hors-periode",
    });
  }

  return { periodes: calculees, parLigne, horsPeriode };
}

/* ==========================================================================
 * L'ÉCHÉANCE
 * ========================================================================== */

export type EtatEcheance =
  /** Le terme est passé : le contrat court sur reconduction tacite, ou il aurait
   *  dû être renouvelé. */
  | "echu"
  /** On est entré dans le préavis de dénonciation : c'est MAINTENANT qu'on
   *  décide, après il est trop tard. */
  | "preavis"
  /** Le terme approche (moins de 90 jours) sans préavis déclaré. */
  | "proche"
  | "loin"
  /** Aucun terme convenu. */
  | "sans-terme";

/** Sans préavis déclaré, on prévient tout de même 90 jours avant : un trimestre
 *  suffit pour en reparler au client sans rien précipiter. */
export const PREAVIS_PAR_DEFAUT_JOURS = 90;

export interface Echeance {
  etat: EtatEcheance;
  /** Jours avant le terme. Négatif = terme passé. Null = sans terme. */
  joursRestants: number | null;
}

export function echeanceContrat(
  fin: Date | null,
  preavisJours: number,
  maintenant: Date,
): Echeance {
  if (!fin) return { etat: "sans-terme", joursRestants: null };

  const joursRestants = ecartJours(maintenant, fin);
  if (joursRestants < 0) return { etat: "echu", joursRestants };

  const preavis = preavisJours > 0 ? preavisJours : 0;
  if (preavis > 0 && joursRestants <= preavis) {
    return { etat: "preavis", joursRestants };
  }
  if (joursRestants <= PREAVIS_PAR_DEFAUT_JOURS) {
    return { etat: "proche", joursRestants };
  }
  return { etat: "loin", joursRestants };
}

/* ==========================================================================
 * LE PRIX DU HORS FORFAIT
 * ========================================================================== */

/**
 * Ce que représente le temps hors forfait, en centimes. Null quand le tarif
 * n'est pas renseigné : on compte alors les HEURES sans prétendre en connaître
 * le prix, plutôt que d'afficher un zéro qui passerait pour un montant.
 * (Règle « ce qu'on ne sait pas chiffrer est DIT », docs/DEVIS.md.)
 */
export function montantHorsForfaitCents(
  minutes: number,
  tarifHoraireCents: number,
): number | null {
  if (tarifHoraireCents <= 0) return null;
  return Math.round((minutes / 60) * tarifHoraireCents);
}

export function formatEuros(cents: number): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
  }).format(cents / 100);
}

/* ==========================================================================
 * VUES — ce que le serveur envoie aux écrans (dates sérialisées en jour ISO)
 * ========================================================================== */

export interface SiteVue {
  id: string;
  nom: string;
  adresse: string;
  codePostal: string;
  ville: string;
  acces: string;
  accesDistant: string;
  note: string;
  actif: boolean;
  /** Nombre de contrats qui le couvrent — un site sans contrat se repère. */
  nbContrats: number;
}

export interface InterventionVue {
  id: string;
  /** « 2026-09-11 ». */
  date: string;
  nature: NatureIntervention;
  dureeMin: number;
  motif: string;
  compteRendu: string;
  demandeur: string;
  siteId: string | null;
  siteNom: string | null;
  intervenantId: string | null;
  intervenantNom: string | null;
  horsForfait: boolean;
  /** « 2026-09-11 » ou null = reste à facturer. */
  factureeLe: string | null;
  /** Imputation calculée (voir repartirForfait) — jamais stockée. */
  inclusMin: number;
  horsMin: number;
  cause: CauseHorsForfait | null;
}

export interface ContratResume {
  id: string;
  reference: string | null;
  numeroWhy: string | null;
  intitule: string;
  clientId: string;
  clientNom: string;
  etat: EtatContrat;
  debut: string;
  fin: string | null;
  tacite: boolean;
  preavisJours: number;
  quotaTeleMin: number;
  quotaPresentielMin: number;
  tarifHoraireCents: number;
  nbSites: number;
  /** Les sites couverts, pour la colonne et la recherche. */
  sites: { id: string; nom: string }[];
  /** Consommation de la période EN COURS — c'est la seule qui se lit en liste. */
  periode: { debut: string; dernierJour: string; index: number };
  consommation: Record<NatureIntervention, ConsommationNature>;
  /** Hors forfait non encore facturé, toutes périodes confondues : c'est ce
   *  qu'on perd si personne ne le regarde. */
  aFacturerMin: number;
  echeance: Echeance;
  updatedAt: Date;
}

/* ==========================================================================
 * LES CADRANS DE L'INDEX
 * ========================================================================== */

export interface StatsMaintenance {
  nbContrats: number;
  nbEnCours: number;
  /** Forfaits consommés au-delà du seuil d'alerte sur la période en cours. */
  nbTendus: number;
  /** Contrats dont un forfait est dépassé. */
  nbDepasses: number;
  /** Contrats dont le terme réclame une décision (préavis entamé, ou échu). */
  nbEcheances: number;
  /** Hors forfait jamais facturé, tous contrats confondus. */
  aFacturerMin: number;
  /** Ce que ça représente. Null = aucun tarif connu — on ne chiffre pas. */
  aFacturerCents: number | null;
  /**
   * Contrats qui ont du hors forfait SANS tarif horaire renseigné. Tant qu'il
   * y en a, `aFacturerCents` est INCOMPLET et l'écran doit le dire : un total
   * qui tait ce qu'il ignore se lit comme un total complet, et on facture court.
   */
  nbSansTarif: number;
}

export function statsContrats(contrats: ContratResume[]): StatsMaintenance {
  let nbTendus = 0;
  let nbDepasses = 0;
  let nbEcheances = 0;
  let aFacturerMin = 0;
  let cents = 0;
  let nbAvecTarif = 0;
  let nbSansTarif = 0;

  for (const c of contrats) {
    const natures = NATURES.map((n) => c.consommation[n]);
    if (natures.some((x) => x.depassementMin > 0)) nbDepasses += 1;
    else if (natures.some((x) => x.quotaMin > 0 && pourcentConsomme(x) >= SEUIL_ALERTE_FORFAIT)) {
      nbTendus += 1;
    }

    if (c.echeance.etat === "preavis" || c.echeance.etat === "echu") nbEcheances += 1;

    aFacturerMin += c.aFacturerMin;
    if (c.aFacturerMin > 0) {
      const m = montantHorsForfaitCents(c.aFacturerMin, c.tarifHoraireCents);
      if (m == null) nbSansTarif += 1;
      else {
        cents += m;
        nbAvecTarif += 1;
      }
    }
  }

  return {
    nbContrats: contrats.length,
    nbEnCours: contrats.filter((c) => ETATS_EN_COURS.includes(c.etat)).length,
    nbTendus,
    nbDepasses,
    nbEcheances,
    aFacturerMin,
    aFacturerCents: nbAvecTarif > 0 ? cents : null,
    nbSansTarif,
  };
}

/* ==========================================================================
 * LA FICHE
 * ========================================================================== */

export interface PeriodeVue {
  index: number;
  debut: string;
  dernierJour: string;
  tronquee: boolean;
  /** Celle qui contient aujourd'hui. */
  courante: boolean;
}

export interface ContratDetail {
  id: string;
  reference: string | null;
  numeroWhy: string | null;
  intitule: string;
  clientId: string;
  clientNom: string;
  etat: EtatContrat;
  debut: string;
  fin: string | null;
  tacite: boolean;
  preavisJours: number;
  quotaTeleMin: number;
  quotaPresentielMin: number;
  tarifHoraireCents: number;
  notes: string;
  sites: SiteVue[];
  /** De la plus RÉCENTE à la plus ancienne — on ouvre sur celle d'aujourd'hui. */
  periodes: PeriodeVue[];
  /** La période affichée. */
  periodeIndex: number;
  /** Les interventions de la période affichée, de la plus récente d'abord. */
  interventions: InterventionVue[];
  /** Consommation de la période affichée. */
  consommation: Record<NatureIntervention, ConsommationNature>;
  /** Interventions datées HORS du contrat. Non vide = une date est à corriger,
   *  et la fiche le dit — sinon ce temps-là ne serait compté nulle part. */
  horsPeriode: InterventionVue[];
  /** Hors forfait jamais facturé, TOUTES périodes confondues. */
  aFacturerMin: number;
  echeance: Echeance;
  updatedAt: Date;
  majParNom: string | null;
}
