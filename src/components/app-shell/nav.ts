import {
  Briefcase,
  Building2,
  Home,
  SlidersHorizontal,
  Tags,
  Users,
  type LucideIcon,
} from "lucide-react";
import { TOOLS, TOOLS_AFFAIRE, TOOLS_NAV, type Teinte } from "@/tools/registry";

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
  /** Teinte du repère quand l'entrée est active (voir `Teinte`). */
  teinte?: Teinte;
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
      { href: "/", nom: "Accueil", icon: Home, teinte: "brand" as const },
      {
        href: "/affaires",
        nom: "Affaires",
        icon: Briefcase,
        // On reste sur « Affaires » dans les outils d'affaire : c'est par là
        // qu'on y est entré.
        // …et sur « Mes tâches », qui est une vue transverse des affaires : le
        // rail ne doit pas s'éteindre parce qu'on regarde son propre reste à
        // faire. C'est d'ailleurs cette entrée qui en porte la pastille.
        aussi: [...TOOLS_AFFAIRE.map((t) => t.href), "/mes-taches"],
        pastille: nbTaches,
        // Le pivot de la plateforme porte le laiton, pas un signal E/S.
        teinte: "accent" as const,
      },
      ...TOOLS_NAV.map((t) => ({
        href: t.href,
        nom: t.nom,
        icon: t.icon,
        teinte: t.signal,
      })),
    ],
    config: [
      { href: "/clients", nom: "Clients", icon: Building2 },
      { href: "/configuration/points", nom: "Points & modèles", icon: Tags },
      { href: "/configuration/materiel", nom: "Base matériel", icon: SlidersHorizontal },
      // ⚠️ Plus d'entrée « Documentation » ici : les fiches techniques
      // appartiennent aux PRODUITS du magasin (/outils/magasin/documentation),
      // d'où la base matériel les lit et d'où les devis les annexent. L'écran
      // qui listait un dossier de PDF a été supprimé le 2026-08-12.
      // Gestion des comptes : réservée aux administrateurs.
      ...(isAdmin
        ? [{ href: "/configuration/utilisateurs", nom: "Utilisateurs", icon: Users }]
        : []),
    ],
  };
}

/* --- Le signal de la route courante --------------------------------------- *
 * La barre de chrome porte un filet à la couleur de l'outil où l'on se trouve :
 * on sait de quel outil on parle avant même d'avoir lu le titre. Le préfixe le
 * plus long gagne, sinon `/outils/notes` et `/outils/notes-de-frais` se
 * marcheraient dessus. */
const ROUTES_TEINTEES: { prefixe: string; teinte: Teinte }[] = [
  ...TOOLS.filter((t) => t.signal).map((t) => ({
    prefixe: t.href,
    teinte: t.signal as Teinte,
  })),
  { prefixe: "/affaires", teinte: "accent" },
  { prefixe: "/clients", teinte: "accent" },
];

export function teinteDeRoute(pathname: string): Teinte {
  const trouve = ROUTES_TEINTEES.filter(
    (r) => pathname === r.prefixe || pathname.startsWith(`${r.prefixe}/`),
  ).sort((a, b) => b.prefixe.length - a.prefixe.length)[0];
  // Hors outil (accueil, configuration) : le laiton de la
  // maison. Pas le marine — sur le bâti sombre il faudrait le remonter si haut
  // en clarté qu'il finirait blanc, et un filet blanc en travers de la barre
  // se lit comme une erreur d'affichage.
  return trouve?.teinte ?? "accent";
}
