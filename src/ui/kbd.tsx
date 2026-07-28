import { cn } from "@/lib/cn";

/**
 * Touche de raccourci. Affichée dans l'interface plutôt que cachée dans une
 * page d'aide : invisible pour qui ne s'en sert pas, accélérateur pour les
 * autres.
 */
export function Kbd({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <kbd
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded border border-border bg-surface px-1.5",
        "font-mono text-[10px] font-medium leading-none text-muted shadow-sm",
        className,
      )}
    >
      {children}
    </kbd>
  );
}
