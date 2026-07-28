import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/cn";

type Ton = "neutre" | "brand" | "accent" | "success" | "danger";

const TON_VALEUR: Record<Ton, string> = {
  neutre: "text-fg",
  brand: "text-brand",
  accent: "text-accent-strong",
  success: "text-success",
  danger: "text-danger",
};

const TON_RAIL: Record<Ton, string> = {
  neutre: "bg-border",
  brand: "bg-brand",
  accent: "bg-accent",
  success: "bg-success",
  danger: "bg-danger",
};

/**
 * Compteur d'écran : un chiffre qu'on lit de loin, son libellé estampillé, et
 * un rail de couleur qui le rattache à sa famille. Cliquable quand le chiffre
 * mène quelque part — un compteur qui ne fait rien est un chiffre mort.
 */
export function Stat({
  label,
  valeur,
  detail,
  icone: Icone,
  ton = "neutre",
  href,
  className,
}: {
  label: string;
  valeur: React.ReactNode;
  detail?: React.ReactNode;
  icone?: LucideIcon;
  ton?: Ton;
  href?: string;
  className?: string;
}) {
  const contenu = (
    <>
      <span aria-hidden className={cn("absolute inset-y-0 left-0 w-[3px]", TON_RAIL[ton])} />
      <div className="flex items-start justify-between gap-3">
        <span className="stamp">{label}</span>
        {Icone && <Icone className="h-4 w-4 shrink-0 text-subtle" />}
      </div>
      <div
        className={cn(
          "mt-1.5 font-display text-2xl font-bold leading-none tabular-nums",
          TON_VALEUR[ton],
        )}
      >
        {valeur}
      </div>
      {detail && <div className="mt-1 text-xs text-muted">{detail}</div>}
    </>
  );

  const classes = cn(
    "relative overflow-hidden border border-hairline bg-surface py-3 pl-4 pr-3.5",
    href &&
      "transition-colors duration-200 hover:border-brand/45 hover:bg-surface-2",
    className,
  );

  return href ? (
    <Link href={href} className={cn("block", classes)}>
      {contenu}
    </Link>
  ) : (
    <div className={classes}>{contenu}</div>
  );
}
