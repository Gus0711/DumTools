// Types & constantes de l'outil « Visites de chantier ».
// Client-safe : pas de "server-only" ni de Prisma ici — importé par l'îlot
// terrain (offline) ET par le serveur (actions/queries). La visite complète vit
// en JSON (`VisiteData`) ; la source de vérité de saisie est LOCALE (IndexedDB)
// jusqu'à la synchro (voir src/lib/offline/visites.ts).

export const TYPES_VISITE = ["RELEVE", "SUIVI", "RECEPTION", "MAINTENANCE"] as const;
export type TypeVisite = (typeof TYPES_VISITE)[number];

export const TYPE_LABEL: Record<TypeVisite, string> = {
  RELEVE: "Relevé avant chiffrage",
  SUIVI: "Suivi de chantier",
  RECEPTION: "Réception / levée de réserves",
  MAINTENANCE: "Maintenance / SAV",
};

/** Ton sémantique du badge de type (utilitaires du design system). */
export const TYPE_TON: Record<TypeVisite, string> = {
  RELEVE: "bg-io-ai/10 text-io-ai",
  SUIVI: "bg-io-di/10 text-io-di",
  RECEPTION: "bg-io-do/10 text-io-do",
  MAINTENANCE: "bg-io-com/10 text-io-com",
};

export function estTypeVisite(v: string): v is TypeVisite {
  return (TYPES_VISITE as readonly string[]).includes(v);
}

/** Statut d'un item de checklist ("" = pas encore renseigné). */
export type StatutItem = "" | "ok" | "ko" | "na";

export interface ItemChecklist {
  id: string;
  libelle: string;
  /** Pense-bête affiché sous le libellé — le « guide » du terrain. */
  aide?: string;
  statut: StatutItem;
  note: string;
  photoIds: string[];
  audioIds: string[];
}

export interface SectionChecklist {
  id: string;
  titre: string;
  items: ItemChecklist[];
}

export const GRAVITES = ["faible", "moyenne", "haute"] as const;
export type Gravite = (typeof GRAVITES)[number];

export const GRAVITE_LABEL: Record<Gravite, string> = {
  faible: "Faible",
  moyenne: "Moyenne",
  haute: "Haute",
};

/** Réserve (punch list) — colonne vertébrale du « ne rien oublier » : une réserve
 *  OUVERTE est reportée dans la visite suivante de l'affaire tant que non levée. */
export interface Reserve {
  id: string;
  libelle: string;
  localisation: string;
  gravite: Gravite;
  statut: "ouverte" | "levee";
  note: string;
  photoIds: string[];
  /** Visite d'origine si la réserve a été reportée d'une visite précédente. */
  origineVisiteId?: string;
}

export type TypeMedia = "photo" | "audio";

/** Métadonnées d'un média. Le binaire vit à part : blob IndexedDB côté terrain,
 *  fichier disque VM côté serveur (VisiteMedia). `uploaded` n'a de sens que côté
 *  client (confirmé reçu par le serveur). */
export interface MediaMeta {
  id: string;
  type: TypeMedia;
  mimeType: string;
  taille: number;
  /** Rattachement contextuel — absent = média « général » de la visite. */
  itemId?: string;
  reserveId?: string;
  note: string;
  /** Durée d'une note vocale, en secondes. */
  dureeSec?: number;
  createdTs: number;
  uploaded?: boolean;
}

/** Contenu complet d'une visite (JSON `Visite.data` côté Prisma). */
export interface VisiteData {
  participants: string;
  notes: string;
  sections: SectionChecklist[];
  reserves: Reserve[];
  medias: MediaMeta[];
  /** Horodatage terrain de la dernière modification (« dernier gagne » au sync). */
  updatedTs: number;
}

/** Une visite telle que manipulée par l'îlot terrain et poussée au serveur. */
export interface Visite {
  id: string;
  type: TypeVisite;
  titre: string;
  /** Date de la visite, ISO `yyyy-mm-dd`. */
  date: string;
  chantierId: string | null;
  /** Dénormalisés pour l'affichage hors-ligne (l'affaire fait foi côté serveur). */
  chantierNom: string;
  clientNom: string;
  numeroWhy: string | null;
  data: VisiteData;
  createdTs: number;
}

/** UUID côté client. `crypto.randomUUID` exige un contexte sécurisé (HTTPS /
 *  localhost) → repli v4 pseudo-aléatoire pour le dev en http LAN. */
export function uuid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    try {
      return crypto.randomUUID();
    } catch {
      /* contexte non sécurisé → repli */
    }
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/** Statistiques d'avancement d'une visite (bandeau + résumés). */
export function statsVisite(data: VisiteData): {
  total: number;
  renseignes: number;
  ko: number;
  reservesOuvertes: number;
  photos: number;
  audios: number;
} {
  let total = 0;
  let renseignes = 0;
  let ko = 0;
  for (const s of data.sections) {
    for (const it of s.items) {
      total++;
      if (it.statut !== "") renseignes++;
      if (it.statut === "ko") ko++;
    }
  }
  return {
    total,
    renseignes,
    ko,
    reservesOuvertes: data.reserves.filter((r) => r.statut === "ouverte").length,
    photos: data.medias.filter((m) => m.type === "photo").length,
    audios: data.medias.filter((m) => m.type === "audio").length,
  };
}

/** Résumé court pour les fiches client / affaire (« 12/34 pts · 2 KO · 3 photos »). */
export function resumeVisite(data: VisiteData): string {
  const s = statsVisite(data);
  const parts = [`${s.renseignes}/${s.total} pts`];
  if (s.ko) parts.push(`${s.ko} KO`);
  if (s.reservesOuvertes) parts.push(`${s.reservesOuvertes} réserve${s.reservesOuvertes > 1 ? "s" : ""}`);
  if (s.photos) parts.push(`${s.photos} photo${s.photos > 1 ? "s" : ""}`);
  if (s.audios) parts.push(`${s.audios} audio${s.audios > 1 ? "s" : ""}`);
  return parts.join(" · ");
}

/** Date du jour en ISO local `yyyy-mm-dd` (pas d'UTC : une visite du soir ne doit
 *  pas glisser au lendemain). */
export function dateISOLocale(d = new Date()): string {
  const mois = String(d.getMonth() + 1).padStart(2, "0");
  const jour = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mois}-${jour}`;
}
