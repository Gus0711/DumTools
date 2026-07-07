import { cn } from "@/lib/cn";

type Tone = "neutral" | "brand" | "accent" | "success" | "danger";

const TONE: Record<Tone, string> = {
  neutral: "bg-surface-2 text-muted border-border",
  brand: "bg-brand-soft text-brand border-transparent",
  accent: "bg-accent-soft text-accent-strong border-transparent",
  success: "bg-success/12 text-success border-transparent",
  danger: "bg-danger/12 text-danger border-transparent",
};

export function Badge({
  tone = "neutral",
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
        TONE[tone],
        className,
      )}
      {...props}
    />
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
        "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-semibold tabular-nums",
        IO[type],
        className,
      )}
    >
      {type}
      {count != null && <span className="opacity-70">{count}</span>}
    </span>
  );
}
