"use client";

import { usePathname } from "next/navigation";

/**
 * Entrée de page : à chaque changement de route, le contenu se remonte et
 * rejoue l'animation « mise sous tension » (montée d'un cran + fondu).
 * La clé sur le chemin est ce qui force le rejeu — sans elle, React réutilise
 * le conteneur et l'animation ne repart pas.
 */
export function TransitionPage({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div key={pathname} className="anim-page">
      {children}
    </div>
  );
}
