import { forwardRef } from "react";
import { cn } from "@/lib/cn";

export const Input = forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    className={cn(
      "h-[var(--control-h)] w-full rounded-md border border-border bg-surface px-3 text-sm text-fg",
      "shadow-sm transition-[border-color,box-shadow] duration-150",
      "hover:border-brand/40 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20",
      "placeholder:text-subtle disabled:opacity-50",
      className,
    )}
    {...props}
  />
));
Input.displayName = "Input";

/**
 * Libellé de champ. Volontairement plus discret que la valeur saisie : dans un
 * formulaire, c'est la donnée qu'on relit, pas son étiquette. (Les petites
 * capitales `.stamp` restent réservées aux cartouches et aux entêtes de table,
 * où les libellés tiennent en deux mots.)
 */
export function Label({
  className,
  ...props
}: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn("block text-[0.8rem] font-semibold text-muted", className)}
      {...props}
    />
  );
}
