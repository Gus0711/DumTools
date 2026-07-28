// Découpage temporel des scans : jour / semaine ISO / mois / année.
// Client-safe : pur TypeScript, aucune dépendance serveur ni Prisma.
//
// Trois partis pris, qui évitent tous les faux comptes classiques :
//
//  1. TOUT est calculé en HEURE LOCALE. Jamais `toISOString()`, qui ferait
//     basculer un scan de 23h30 (CEST) au lendemain en UTC — le technicien
//     retrouverait son scan du lundi soir classé mardi.
//
//  2. La semaine est la semaine ISO-8601 : lundi → dimanche, et l'ANNÉE ISO
//     n'est pas l'année civile (le 31/12/2025 appartient à la semaine 1 de
//     2026). C'est la convention des semaines de chantier en France.
//
//  3. L'arbre est construit BOTTOM-UP à partir des jours réellement présents.
//     Une semaine à cheval sur deux mois (S31 = 27 juil. → 2 août) est donc
//     DÉCOUPÉE entre juillet et août, et le total d'un nœud est toujours,
//     exactement, la somme de ses enfants. Un arbre dont les compteurs ne
//     tombent pas juste ne sert à rien.
//
// Rien de tout ça n'est stocké en base : ce sont des vues sur `scanneLe`.
// Les figer en colonnes les ferait rancir au premier changement de fuseau.

/** Granularité de découpage, de la plus fine à la plus large. */
export type Granularite = "jour" | "semaine" | "mois" | "annee";

const p2 = (n: number) => String(n).padStart(2, "0");

/* --------------------------------------------------------------------------
 * Clés de période — triables lexicographiquement, stables, lisibles en debug.
 * ------------------------------------------------------------------------ */

/** Jour local, `2026-07-28`. Clé pivot : tout l'arbre se construit dessus. */
export function cleJour(d: Date): string {
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
}

/** Mois local, `2026-07`. */
export function cleMois(d: Date): string {
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}`;
}

/** Année civile locale, `2026`. */
export function cleAnnee(d: Date): string {
  return String(d.getFullYear());
}

/** Semaine ISO-8601 : numéro + **année ISO** (≠ année civile en fin d'année). */
export function infosSemaineIso(d: Date): { annee: number; semaine: number } {
  // Minuit local : on ne raisonne qu'en jours, l'heure ne doit pas interférer.
  const jeudi = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  // Lundi = 0 … dimanche = 6 (getDay() met dimanche à 0, d'où le décalage).
  const jourSemaine = (jeudi.getDay() + 6) % 7;
  // Le jeudi de la semaine porte, par définition ISO, l'année de la semaine.
  jeudi.setDate(jeudi.getDate() - jourSemaine + 3);
  const annee = jeudi.getFullYear();

  // La semaine 1 est celle qui contient le 4 janvier : on prend son jeudi.
  const jeudiS1 = new Date(annee, 0, 4);
  jeudiS1.setDate(jeudiS1.getDate() - ((jeudiS1.getDay() + 6) % 7) + 3);

  // `round` (et pas `floor`) absorbe l'heure décalée par un changement d'heure :
  // entre deux jeudis, l'écart peut valoir 7j ± 1h.
  const semaine =
    1 + Math.round((jeudi.getTime() - jeudiS1.getTime()) / (7 * 86_400_000));
  return { annee, semaine };
}

/** Semaine ISO, `2026-S31`. */
export function cleSemaine(d: Date): string {
  const { annee, semaine } = infosSemaineIso(d);
  return `${annee}-S${p2(semaine)}`;
}

/** Clé de la granularité demandée. */
export function clePeriode(d: Date, g: Granularite): string {
  if (g === "jour") return cleJour(d);
  if (g === "semaine") return cleSemaine(d);
  if (g === "mois") return cleMois(d);
  return cleAnnee(d);
}

/** Date locale (minuit) reconstruite depuis une clé jour `2026-07-28`. */
export function dateDepuisCleJour(cle: string): Date {
  const [a, m, j] = cle.split("-").map(Number);
  return new Date(a, m - 1, j);
}

/** Lundi (minuit local) de la semaine ISO contenant `d`. */
export function lundiDeLaSemaine(d: Date): Date {
  const lundi = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  lundi.setDate(lundi.getDate() - ((lundi.getDay() + 6) % 7));
  return lundi;
}

/* --------------------------------------------------------------------------
 * Libellés français.
 * ------------------------------------------------------------------------ */

const fmtMoisLong = new Intl.DateTimeFormat("fr-FR", { month: "long" });
const fmtJourLong = new Intl.DateTimeFormat("fr-FR", {
  weekday: "long",
  day: "numeric",
  month: "long",
});
const fmtJourCourt = new Intl.DateTimeFormat("fr-FR", {
  weekday: "short",
  day: "numeric",
});
const fmtJourMoisCourt = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "short",
});
const fmtJourSeul = new Intl.DateTimeFormat("fr-FR", { day: "numeric" });
const fmtJourSemaine = new Intl.DateTimeFormat("fr-FR", { weekday: "long" });

/** Majuscule initiale — `Intl` rend « juillet », on veut « Juillet ». */
function capitaliser(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Nom du jour de la semaine en clair (`lundi`) — colonne d'export pivotable. */
export function nomJourSemaine(d: Date): string {
  return fmtJourSemaine.format(d);
}

/** Décalage en jours entre `d` et aujourd'hui (0 = aujourd'hui, 1 = hier). */
function joursDepuisAujourdhui(d: Date, maintenant = new Date()): number {
  const a = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const b = new Date(
    maintenant.getFullYear(),
    maintenant.getMonth(),
    maintenant.getDate(),
  ).getTime();
  return Math.round((b - a) / 86_400_000);
}

/**
 * Libellé d'un jour. `« Aujourd'hui »` / `« Hier »` priment sur la date, c'est
 * ce que l'utilisateur cherche en premier après une journée de scan.
 */
export function libelleJour(d: Date, maintenant?: Date): string {
  const ecart = joursDepuisAujourdhui(d, maintenant);
  const date = fmtJourLong.format(d);
  // En apposition, le jour reste en minuscule (« Aujourd'hui · mardi 28 ») ;
  // seul le libellé autonome prend la majuscule.
  if (ecart === 0) return `Aujourd'hui · ${date}`;
  if (ecart === 1) return `Hier · ${date}`;
  const anneeCourante = (maintenant ?? new Date()).getFullYear();
  return capitaliser(
    d.getFullYear() === anneeCourante ? date : `${date} ${d.getFullYear()}`,
  );
}

/** Libellé compact d'un jour pour l'arbre : `lun. 28`, ou `Aujourd'hui`. */
export function libelleJourCompact(d: Date, maintenant?: Date): string {
  const ecart = joursDepuisAujourdhui(d, maintenant);
  if (ecart === 0) return "Aujourd'hui";
  if (ecart === 1) return "Hier";
  return capitaliser(fmtJourCourt.format(d));
}

/** Libellé d'un mois : `Juillet 2026`. */
export function libelleMois(d: Date): string {
  return `${capitaliser(fmtMoisLong.format(d))} ${d.getFullYear()}`;
}

/**
 * Étendue réelle d'une semaine, bornée aux jours fournis. Une semaine découpée
 * par une frontière de mois affiche donc `27 → 31 juil.` et pas `27 juil. →
 * 2 août` : le libellé doit décrire ce que le nœud contient vraiment.
 */
export function libelleEtendue(jours: string[]): string {
  if (jours.length === 0) return "";
  const tries = [...jours].sort();
  const debut = dateDepuisCleJour(tries[0]);
  const fin = dateDepuisCleJour(tries[tries.length - 1]);
  if (tries[0] === tries[tries.length - 1]) return fmtJourMoisCourt.format(debut);
  // Même mois → on ne répète pas le mois : « 27 → 31 juil. ».
  const memeMois =
    debut.getFullYear() === fin.getFullYear() && debut.getMonth() === fin.getMonth();
  const g = memeMois ? fmtJourSeul.format(debut) : fmtJourMoisCourt.format(debut);
  return `${g} → ${fmtJourMoisCourt.format(fin)}`;
}

/** Libellé d'une semaine ISO : `Semaine 31`. L'étendue va dans le détail. */
export function libelleSemaine(d: Date): string {
  return `Semaine ${infosSemaineIso(d).semaine}`;
}

/** Libellé de la granularité demandée (en-tête de groupe du tableau). */
export function libellePeriode(d: Date, g: Granularite, maintenant?: Date): string {
  if (g === "jour") return libelleJour(d, maintenant);
  if (g === "semaine") {
    const lundi = lundiDeLaSemaine(d);
    const dimanche = new Date(lundi);
    dimanche.setDate(dimanche.getDate() + 6);
    return `${libelleSemaine(d)} · ${fmtJourMoisCourt.format(lundi)} → ${fmtJourMoisCourt.format(dimanche)} ${dimanche.getFullYear()}`;
  }
  if (g === "mois") return libelleMois(d);
  return cleAnnee(d);
}

/* --------------------------------------------------------------------------
 * Arbre Année ▸ Mois ▸ Semaine ▸ Jour.
 * ------------------------------------------------------------------------ */

export interface NoeudPeriode {
  /** Clé unique dans tout l'arbre (préfixée par celle du parent). */
  cle: string;
  granularite: Granularite | "racine";
  libelle: string;
  /** Précision secondaire affichée en gris (étendue d'une semaine…). */
  detail?: string;
  /** Nombre de scans sous ce nœud — toujours la somme des enfants. */
  total: number;
  /** Clés jour couvertes : c'est ce que le nœud sélectionne comme filtre. */
  jours: string[];
  enfants: NoeudPeriode[];
}

/**
 * Construit l'arbre des périodes à partir des dates de scan, du plus récent au
 * plus ancien. Bottom-up depuis les jours : les compteurs sont exacts à chaque
 * étage, y compris pour une semaine coupée par une frontière de mois.
 */
export function construireArbrePeriodes(
  dates: Date[],
  maintenant?: Date,
): NoeudPeriode[] {
  // 1. Comptage par jour.
  const parJour = new Map<string, number>();
  for (const d of dates) {
    const k = cleJour(d);
    parJour.set(k, (parJour.get(k) ?? 0) + 1);
  }

  // 2. Regroupement jour → semaine → mois → année (clés composées : une semaine
  //    coupée par un mois donne DEUX nœuds distincts, un par mois).
  const annees = new Map<string, Map<string, Map<string, string[]>>>();
  for (const cle of parJour.keys()) {
    const d = dateDepuisCleJour(cle);
    const ka = cleAnnee(d);
    const km = cleMois(d);
    const ks = cleSemaine(d);
    const mois = annees.get(ka) ?? new Map<string, Map<string, string[]>>();
    annees.set(ka, mois);
    const semaines = mois.get(km) ?? new Map<string, string[]>();
    mois.set(km, semaines);
    semaines.set(ks, [...(semaines.get(ks) ?? []), cle]);
  }

  const somme = (jours: string[]) =>
    jours.reduce((n, j) => n + (parJour.get(j) ?? 0), 0);
  // Tri anté-chronologique partout : le travail récent est en haut.
  const desc = (a: string, b: string) => b.localeCompare(a);

  return [...annees.keys()].sort(desc).map((ka) => {
    const noeudsMois = [...annees.get(ka)!.keys()].sort(desc).map((km) => {
      const semaines = annees.get(ka)!.get(km)!;
      const noeudsSemaine = [...semaines.keys()].sort(desc).map((ks) => {
        const jours = [...semaines.get(ks)!].sort(desc);
        return {
          cle: `${km}/${ks}`,
          granularite: "semaine" as const,
          libelle: libelleSemaine(dateDepuisCleJour(jours[0])),
          detail: libelleEtendue(jours),
          total: somme(jours),
          jours,
          enfants: jours.map((j) => ({
            cle: `${km}/${ks}/${j}`,
            granularite: "jour" as const,
            libelle: libelleJourCompact(dateDepuisCleJour(j), maintenant),
            total: parJour.get(j) ?? 0,
            jours: [j],
            enfants: [],
          })),
        };
      });
      const joursMois = noeudsSemaine.flatMap((s) => s.jours);
      return {
        cle: km,
        granularite: "mois" as const,
        libelle: capitaliser(fmtMoisLong.format(dateDepuisCleJour(joursMois[0]))),
        total: somme(joursMois),
        jours: joursMois,
        enfants: noeudsSemaine,
      };
    });
    const joursAnnee = noeudsMois.flatMap((m) => m.jours);
    return {
      cle: ka,
      granularite: "annee" as const,
      libelle: ka,
      total: somme(joursAnnee),
      jours: joursAnnee,
      enfants: noeudsMois,
    };
  });
}
