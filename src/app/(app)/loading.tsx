import { Skeleton } from "@/ui";

/**
 * Écran d'attente pendant qu'une page se prépare côté serveur. Il reprend la
 * silhouette d'un écran type — cartouche puis liste — pour que l'œil trouve
 * déjà ses repères au moment où le contenu arrive.
 */
export default function Chargement() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-8 md:px-10">
      <div className="cartouche mb-6">
        <span aria-hidden className="rule-signal absolute inset-x-0 top-0 z-10 h-[3px] opacity-40" />
        <div className="space-y-3 px-5 pt-5 pb-5 md:px-6">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-7 w-64" />
          <Skeleton className="h-4 w-full max-w-lg" />
        </div>
        <div className="cartouche-champs">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="min-w-24 space-y-1.5">
              <Skeleton className="h-2.5 w-16" />
              <Skeleton className="h-4 w-10" />
            </div>
          ))}
        </div>
      </div>

      <div className="data-card p-3">
        <div className="space-y-2">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-10 w-full rounded-md" />
          ))}
        </div>
      </div>
    </div>
  );
}
