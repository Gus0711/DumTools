import { cn } from "@/lib/cn";

type Tone = "neutral" | "brand" | "accent" | "success" | "warning" | "danger";

const TONE: Record<Tone, string> = {
  neutral: "bg-surface-2 text-muted border-border",
  brand: "bg-brand-soft text-brand border-transparent",
  accent: "bg-accent-soft text-accent-strong border-transparent",
  success: "bg-success/12 text-success border-transparent",
  warning: "bg-warning/14 text-warning border-transparent",
  danger: "bg-danger/12 text-danger border-transparent",
};

const POINT: Record<Tone, string> = {
  neutral: "bg-subtle",
  brand: "bg-brand",
  accent: "bg-accent",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
};

/**
 * Étiquette d'état. Coins peu marqués (on est sur un plan, pas sur un
 * autocollant) ; `point` ajoute la pastille de statut d'un synoptique.
 */
export function Badge({
  tone = "neutral",
  point = false,
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: Tone; point?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium",
        TONE[tone],
        className,
      )}
      {...props}
    >
      {point && (
        <span aria-hidden className={cn("h-1.5 w-1.5 rounded-full", POINT[tone])} />
      )}
      {children}
    </span>
  );
}

/* --- Pastille métier E/S : une couleur stable par type d'entrée/sortie ----- */
export type IoType = "AI" | "DI" | "AO" | "DO" | "COM";

const IO: Record<IoType, string> = {
  AI: "text-io-ai bg-io-ai/12",
  DI: "text-io-di bg-io-di/12",
  AO: "text-io-ao bg-io-ao/12",
  DO: "text-io-do bg-io-do/12",
  COM: "text-io-com bg-io-com/12",
};

export const IO_LABEL: Record<IoType, string> = {
  AI: "Entrée analogique",
  DI: "Entrée logique",
  AO: "Sortie analogique",
  DO: "Sortie logique",
  COM: "Communication",
};

export function IoBadge({
  type,
  count,
  className,
}: {
  type: IoType;
  count?: number;
  className?: string;
}) {
  return (
    <span
      title={IO_LABEL[type]}
      className={cn(
        "inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-xs font-semibold tabular-nums",
        IO[type],
        className,
      )}
    >
      {type}
      {count != null && <span className="opacity-70">{count}</span>}
    </span>
  );
}
