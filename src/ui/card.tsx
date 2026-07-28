import { cn } from "@/lib/cn";

/** Conteneur de surface standard. Angles droits et trait fin, comme tout ce
 *  qui structure la planche : ce qui « flotte » est réservé aux menus. */
export function Card({
  interactif = false,
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  /** Carte cliquable : se soulève au survol et allume son filet laiton. */
  interactif?: boolean;
}) {
  return (
    <div
      className={cn(
        "border border-hairline bg-surface",
        interactif &&
          "group relative overflow-hidden transition-[border-color,background-color] duration-200 hover:border-brand/45 hover:bg-surface-2",
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-5 pb-3", className)} {...props} />;
}

export function CardTitle({
  className,
  ...props
}: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={cn("font-display text-base font-semibold text-fg", className)}
      {...props}
    />
  );
}

export function CardBody({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-5 pt-0", className)} {...props} />;
}
