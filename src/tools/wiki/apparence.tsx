import { createElement } from "react";
import type { LucideIcon } from "lucide-react";
import {
  BadgeEuro,
  BookText,
  Building2,
  CircuitBoard,
  Cpu,
  HardHat,
  Library,
  Server,
  Wrench,
} from "lucide-react";

/* Apparence des rubriques du wiki. `icon` et `couleur` sont des CLÉS stockées en
 * base (seed) : on les résout ici en composant lucide et en classes utilitaires
 * du design system — jamais de #hex ni de nom de classe dynamique (les chaînes
 * ci-dessous sont littérales pour que Tailwind v4 les génère). */

const ICONES: Record<string, LucideIcon> = {
  Building2,
  BadgeEuro,
  CircuitBoard,
  HardHat,
  Server,
  Wrench,
  Cpu,
  Library,
  BookText,
};

/** Icône d'une rubrique (résolue depuis la clé stockée en base). Composant
 *  stable — `createElement` évite la « création de composant pendant le rendu ». */
export function IconeRubrique({ nom, className }: { nom: string; className?: string }) {
  return createElement(ICONES[nom] ?? BookText, { className });
}

export interface TeinteRubrique {
  /** Pastille d'icône (fond teinté + texte coloré). */
  chip: string;
  /** Liseré/barre d'accent. */
  bar: string;
  /** Bordure au survol de la carte. */
  ring: string;
}

const TEINTES: Record<string, TeinteRubrique> = {
  brand: { chip: "bg-brand-soft text-brand", bar: "bg-brand", ring: "group-hover:border-brand/40" },
  accent: { chip: "bg-accent-soft text-accent", bar: "bg-accent", ring: "group-hover:border-accent/40" },
  ai: { chip: "bg-io-ai/12 text-io-ai", bar: "bg-io-ai", ring: "group-hover:border-io-ai/40" },
  ao: { chip: "bg-io-ao/12 text-io-ao", bar: "bg-io-ao", ring: "group-hover:border-io-ao/40" },
  do: { chip: "bg-io-do/12 text-io-do", bar: "bg-io-do", ring: "group-hover:border-io-do/40" },
  com: { chip: "bg-io-com/12 text-io-com", bar: "bg-io-com", ring: "group-hover:border-io-com/40" },
  di: { chip: "bg-io-di/12 text-io-di", bar: "bg-io-di", ring: "group-hover:border-io-di/40" },
};

export function teinteRubrique(couleur: string): TeinteRubrique {
  return TEINTES[couleur] ?? TEINTES.brand;
}
