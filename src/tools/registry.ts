import type { LucideIcon } from "lucide-react";
import { CircuitBoard, ClipboardCheck, ClipboardList, FlaskConical, FolderOpen, Library, NotebookPen, ScanLine } from "lucide-react";

/* =============================================================================
 * REGISTRE D'OUTILS
 * Source de vérité unique de la plateforme. Ajouter un outil = ajouter une
 * entrée ici → il apparaît automatiquement sur l'écran d'accueil et dans la
 * navigation. Aucune autre modification nécessaire.
 * ========================================================================== */

export type ToolStatus = "disponible" | "en-cours" | "planifie";

export const STATUS_LABEL: Record<ToolStatus, string> = {
  disponible: "Disponible",
  "en-cours": "En cours",
  planifie: "Planifié",
};

export interface Tool {
  /** Identifiant stable (slug), sert aussi de segment d'URL. */
  id: string;
  nom: string;
  description: string;
  icon: LucideIcon;
  /** Route sous /outils. Par défaut `/outils/{id}`. */
  href: string;
  status: ToolStatus;
  /** Rôles autorisés ; undefined = accessible à tous les utilisateurs. */
  roles?: string[];
  /**
   * Espace perso propriétaire (slug, ex. "gus"). undefined = outil métier
   * « cœur » (accueil + nav). Défini = rangé dans l'espace perso `/perso/{slug}`
   * — hors de la grille et de la sidebar, pour ne pas polluer le reste.
   */
  proprietaire?: string;
  /**
   * "affaire" = l'outil n'a de sens que RATTACHÉ à une affaire : on y entre
   * depuis la fiche Affaire (qui porte le bouton de création), jamais « à
   * côté ». Ces outils sont donc retirés de la sidebar ET de la grille
   * d'accueil — l'affaire est le seul point d'entrée. Leur route d'index reste
   * vivante (recherche transverse, rattrapage des projets orphelins), mais
   * plus rien ne la met en avant.
   */
  portee?: "affaire";
}

export const TOOLS: Tool[] = [
  {
    id: "affectation-es",
    nom: "Projet GTB",
    description:
      "Projet chantier de bout en bout : liste de points, choix automate & modules, affectation E/S Distech (import .gfx/PDF ou génération GFX), impressions A4 et rapport de mise en service.",
    icon: CircuitBoard,
    href: "/outils/affectation-es",
    status: "disponible",
    portee: "affaire",
  },
  {
    id: "visites",
    nom: "Visites de chantier",
    description:
      "Relevés, suivis, réceptions et SAV sur le terrain : checklist guide GTB + armoire électrique, photos, notes vocales et réserves — fonctionne sans réseau, synchronisé au retour.",
    icon: ClipboardCheck,
    href: "/outils/visites",
    status: "disponible",
  },
  {
    id: "notes",
    nom: "Notes",
    description:
      "Notes riches d'affaire, façon Notion : texte, tables de données typées, images, fichiers, code, pages HTML embarquées — imprimables, exportables et partageables par lien public.",
    icon: NotebookPen,
    href: "/outils/notes",
    status: "disponible",
    portee: "affaire",
  },
  {
    id: "documents",
    nom: "Documents",
    description:
      "GED d'affaire : téléversez les pièces d'un chantier (plans, devis, PV, prog…). Elles sont miroitées sur kDrive et restent accessibles ici, rattachées à l'affaire et au client.",
    icon: FolderOpen,
    // Pas d'index : /outils/documents redirige vers /affaires. L'href sert de
    // préfixe de route (dépôts sur /outils/documents/[affaire]).
    href: "/outils/documents",
    status: "disponible",
    portee: "affaire",
  },
  {
    id: "wiki",
    nom: "Wiki",
    description:
      "Base de connaissances interne : procédures, savoir-faire GTB et méthodes, classées par thème (Administration, Commerce, Dev-Automatisme, Chantier, Armoire), taguées et cherchables en plein-texte.",
    icon: Library,
    href: "/outils/wiki",
    status: "disponible",
  },

  /* ---- Espaces perso (proprietaire défini → hors accueil/nav) ---------- */
  {
    id: "scan-modems",
    nom: "Scanner",
    description:
      "Scanne n'importe quel code (QR, codes-barres EAN/Code 128…) dans un tableau partagé exportable (CSV/Excel). Reconnaît en plus les modems Teltonika (RUT…) et en extrait les infos matériel — série, IMEI, MAC, identifiants.",
    icon: ScanLine,
    href: "/perso/gus/modems",
    status: "disponible",
    proprietaire: "gus",
  },
  {
    id: "formulaires",
    nom: "Formulaires",
    description:
      "Construis tes propres formulaires (façon Kizeo) : glisser-déposer des champs (texte, nombre, choix, date, photo, signature, GPS), puis remplis-les sur le terrain — même sans réseau. Réponses collectées, exportables et rattachables à une affaire.",
    icon: ClipboardList,
    href: "/perso/gus/formulaires",
    status: "disponible",
    proprietaire: "gus",
  },
];

export function getTool(id: string): Tool | undefined {
  return TOOLS.find((t) => t.id === id);
}

/* =============================================================================
 * ESPACES PERSO
 * Chaque personne peut avoir son espace : ses outils, rangés à l'écart des
 * outils métier mais accessibles à toute l'équipe. Un outil rejoint un espace
 * via `proprietaire: "<slug>"`. Ajouter une personne = une entrée ici.
 * ========================================================================== */

export interface EspacePerso {
  /** Slug = segment d'URL `/perso/{slug}` ET valeur de `Tool.proprietaire`. */
  slug: string;
  nom: string;
  description: string;
  icon: LucideIcon;
}

export const ESPACES_PERSO: EspacePerso[] = [
  {
    slug: "gus",
    nom: "ToolGus",
    description:
      "Les outils perso de Gus — accessibles à toute l'équipe, rangés à l'écart des outils métier.",
    icon: FlaskConical,
  },
];

export function getEspacePerso(slug: string): EspacePerso | undefined {
  return ESPACES_PERSO.find((e) => e.slug === slug);
}

/** Outils « cœur » (métier), espaces perso exclus. */
export const TOOLS_COEUR = TOOLS.filter((t) => !t.proprietaire);

/** Outils mis en avant (accueil + sidebar) : les outils « d'affaire » en sont
 *  retirés — on y accède par la fiche Affaire. */
export const TOOLS_NAV = TOOLS_COEUR.filter((t) => t.portee !== "affaire");

/** Outils dont la production est listée dans une section dédiée de la fiche
 *  Affaire — à exclure de l'agrégat « Autres réalisations » pour ne pas les
 *  afficher deux fois. */
export const TOOLS_AFFAIRE = TOOLS_COEUR.filter((t) => t.portee === "affaire");

/** Outils d'un espace perso donné. */
export function toolsDeProprietaire(slug: string): Tool[] {
  return TOOLS.filter((t) => t.proprietaire === slug);
}

/** Espaces perso ayant au moins un outil (à afficher sur l'accueil). */
export function espacesPersoActifs(): EspacePerso[] {
  return ESPACES_PERSO.filter((e) => toolsDeProprietaire(e.slug).length > 0);
}
