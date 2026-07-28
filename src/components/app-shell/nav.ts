import {
  BookOpen,
  Briefcase,
  Building2,
  Home,
  SlidersHorizontal,
  Tags,
  Users,
  type LucideIcon,
} from "lucide-react";
import { TOOLS_AFFAIRE, TOOLS_NAV } from "@/tools/registry";

/** Une entrée de navigation, partagée par le rail (bureau) et la barre du bas
 *  (téléphone) — pour que les deux ne divergent jamais. */
export type EntreeNav = {
  href: string;
  nom: string;
  icon: LucideIcon;
  /** Préfixes de route qui allument aussi cette entrée. */
  aussi?: string[];
  /** Compteur affiché en pastille (masqué si 0). */
  pastille?: number;
};

export function entreesNav({
  isAdmin = false,
  nbTaches = 0,
}: {
  isAdmin?: boolean;
  nbTaches?: number;
}): { principal: EntreeNav[]; config: EntreeNav[] } {
  return {
    // Projet GTB, Notes et Documents n'y figurent pas : ce sont des outils
    // « d'affaire » (portee: "affaire"), on y entre par la fiche Affaire.
    principal: [
      { href: "/", nom: "Accueil", icon: Home },
      {
        href: "/affaires",
        nom: "Affaires",
        icon: Briefcase,
        // On reste sur « Affaires » dans les outils d'affaire : c'est par là
        // qu'on y est entré.
        aussi: TOOLS_AFFAIRE.map((t) => t.href),
        pastille: nbTaches,
      },
      ...TOOLS_NAV.map((t) => ({ href: t.href, nom: t.nom, icon: t.icon })),
    ],
    config: [
      { href: "/clients", nom: "Clients", icon: Building2 },
      { href: "/configuration/points", nom: "Points & modèles", icon: Tags },
      { href: "/configuration/materiel", nom: "Base matériel", icon: SlidersHorizontal },
      { href: "/documentation", nom: "Documentation", icon: BookOpen },
      // Gestion des comptes : réservée aux administrateurs.
      ...(isAdmin
        ? [{ href: "/configuration/utilisateurs", nom: "Utilisateurs", icon: Users }]
        : []),
    ],
  };
}
