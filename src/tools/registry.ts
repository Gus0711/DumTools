import type { LucideIcon } from "lucide-react";
import { CircuitBoard } from "lucide-react";

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
  },
];

export function getTool(id: string): Tool | undefined {
  return TOOLS.find((t) => t.id === id);
}
