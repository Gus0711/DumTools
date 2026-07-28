import { cn } from "@/lib/cn";

/** Bloc de chargement — remplace l'écran blanc pendant une navigation. */
export function Skeleton({ className }: { className?: string }) {
  return <span aria-hidden className={cn("skeleton block", className)} />;
}

/** Squelette de liste : n lignes de hauteur constante. */
export function SkeletonListe({ lignes = 5 }: { lignes?: number }) {
  return (
    <div className="space-y-2" aria-hidden>
      {Array.from({ length: lignes }, (_, i) => (
        <Skeleton key={i} className="h-11 w-full rounded-lg" />
      ))}
    </div>
  );
}
