import { forwardRef } from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "accent" | "outline" | "ghost" | "danger";
type Size = "sm" | "md" | "lg" | "icon";

const VARIANT: Record<Variant, string> = {
  primary:
    "bg-brand text-brand-fg shadow-sm hover:bg-brand-strong active:translate-y-px",
  accent:
    "bg-accent text-accent-fg shadow-sm hover:bg-accent-strong active:translate-y-px",
  outline: "border border-border bg-surface text-fg hover:bg-surface-2 hover:border-brand/40",
  ghost: "text-fg hover:bg-surface-2",
  danger: "bg-danger text-white shadow-sm hover:opacity-90 active:translate-y-px",
};

const SIZE: Record<Size, string> = {
  sm: "h-8 px-3 text-sm gap-1.5",
  md: "h-10 px-4 text-sm gap-2",
  lg: "h-11 px-5 text-base gap-2",
  icon: "h-10 w-10",
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
        "inline-flex items-center justify-center rounded-md font-medium",
        "transition-[background-color,border-color,transform,box-shadow,opacity] duration-150",
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
