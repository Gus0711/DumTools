import { forwardRef } from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "accent" | "outline" | "ghost" | "danger";
type Size = "sm" | "md" | "lg" | "icon";

const VARIANT: Record<Variant, string> = {
  primary: "bg-brand text-brand-fg shadow-sm hover:bg-brand-strong hover:shadow-md",
  accent: "bg-accent text-accent-fg shadow-sm hover:bg-accent-strong hover:shadow-md",
  outline:
    "border border-border bg-surface text-fg hover:border-brand/45 hover:bg-surface-2",
  ghost: "text-muted hover:bg-surface-2 hover:text-fg",
  danger: "bg-danger text-white shadow-sm hover:brightness-110",
};

/* La hauteur des contrôles suit le réglage de densité (--control-h) : en
 * « Confort », les cibles dépassent les 44px recommandés au doigt. */
const SIZE: Record<Size, string> = {
  sm: "h-8 px-3 text-sm gap-1.5",
  md: "h-[var(--control-h)] px-4 text-sm gap-2",
  lg: "h-[var(--tap)] px-5 text-base gap-2",
  icon: "h-[var(--control-h)] w-[var(--control-h)]",
};

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

/** Bouton du design system. Toutes les couleurs passent par les tokens. */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        "press inline-flex items-center justify-center whitespace-nowrap rounded-md font-medium",
        "transition-[background-color,border-color,box-shadow,filter,opacity] duration-150",
        "disabled:pointer-events-none disabled:opacity-50",
        VARIANT[variant],
        SIZE[size],
        className,
      )}
      {...props}
    />
  ),
);
Button.displayName = "Button";
