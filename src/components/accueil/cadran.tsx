import Link from "next/link";
import { ArrowRight, TriangleAlert, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import { Compteur } from "@/ui/compteur";
import { classeSignal, type Teinte } from "@/tools/registry";
import type { Cadran as DonneesCadran } from "@/lib/accueil/queries";

/* =============================================================================
 * LE CADRAN D'UNE DESTINATION
 * En tête de l'accueil, les quatre destinations de l'appli (les mêmes que le
 * rail et que la barre du bas, dans le même ordre) — mais chacune porte son
 * compteur vital plutôt qu'un simple lien. Une carte qui ne dit que son nom
 * répète la navigation ; un cadran dit AUSSI où en est la maison.
 *
 * L'alerte ne s'affiche que lorsqu'elle existe : un cadran calme reste calme,
 * sinon plus rien n'appelle. Elle double toujours un chiffre et un libellé —
 * la couleur ne porte jamais l'information seule.
 * ========================================================================== */

export function Cadran({
  href,
  nom,
  icone: Icone,
  teinte,
  donnees,
  /** Affiché à la place du compteur quand l'outil n'en a pas encore. */
  aDefaut,
}: {
  href: string;
  nom: string;
  icone: LucideIcon;
  teinte: Teinte;
  donnees?: DonneesCadran;
  aDefaut?: string;
}) {
  const { valeur, unite, detail, alerte } = donnees ?? {
    valeur: null,
    unite: "",
    detail: aDefaut ?? "",
    alerte: null,
  };

  return (
    <Link
      href={href}
      className={cn(
        "bloc group relative flex items-center gap-3 px-4 py-3 transition-colors duration-150 hover:bg-surface-2",
        classeSignal(teinte),
      )}
    >
      {/* Le filet du signal se met sous tension au survol. */}
      <span
        aria-hidden
        className="bg-signal absolute inset-x-0 top-0 h-[3px] origin-left scale-x-0 transition-transform duration-500 group-hover:scale-x-100"
      />

      <Icone className="text-signal h-6 w-6 shrink-0" />

      <span className="min-w-0 flex-1">
        <span className="font-display block text-base font-semibold tracking-tight text-fg">
          {nom}
        </span>
        {alerte ? (
          <span className="mt-0.5 flex items-center gap-1.5 text-sm font-semibold text-danger">
            <TriangleAlert className="h-3.5 w-3.5 shrink-0" />
            {alerte}
          </span>
        ) : (
          <span className="mt-0.5 block truncate text-sm text-muted">{detail}</span>
        )}
      </span>

      {valeur !== null && (
        <span className="flex shrink-0 items-baseline gap-1.5">
          <span className="chiffre chiffre-sm">
            <Compteur valeur={valeur} />
          </span>
          <span className="hidden text-xs text-muted sm:block">{unite}</span>
        </span>
      )}

      <ArrowRight className="text-signal h-4 w-4 shrink-0 transition-transform duration-200 group-hover:translate-x-1" />
    </Link>
  );
}
