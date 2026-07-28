"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, MoreHorizontal, X, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import { ThemeToggle } from "@/components/theme-toggle";
import { DensityToggle } from "@/components/density-toggle";
import { classeSignal } from "@/tools/registry";
import { entreesNav, type EntreeNav } from "./nav";

/* =============================================================================
 * BARRE DU BAS (téléphone)
 * Sur un écran de 390px, un rail vertical mange 15% de la largeur et se trouve
 * hors de portée du pouce. Au téléphone, la navigation descend donc en bas :
 * quatre destinations au pouce, le reste dans une feuille « Plus ».
 * Le rail latéral reprend la main à partir de 768px.
 * ========================================================================== */

export function BarreMobile({
  isAdmin = false,
  nbTaches = 0,
  onDeconnexion,
}: {
  isAdmin?: boolean;
  nbTaches?: number;
  onDeconnexion: () => void;
}) {
  const pathname = usePathname();
  const { principal, config } = entreesNav({ isAdmin, nbTaches });

  // La feuille retient la route où elle a été ouverte : dès qu'on navigue,
  // elle se referme d'elle-même. C'est une dérivation, pas un effet — rien à
  // resynchroniser, donc rien qui puisse se désynchroniser.
  const [ouverteA, setOuverteA] = useState<string | null>(null);
  const plusOuvert = ouverteA === pathname;
  const setPlusOuvert = (v: boolean) => setOuverteA(v ? pathname : null);

  // Fond figé pendant que la feuille est ouverte (sinon on scrolle dessous).
  useEffect(() => {
    if (!plusOuvert) return;
    const avant = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = avant;
    };
  }, [plusOuvert]);

  const onglets = principal.slice(0, 4);
  const reste = [...principal.slice(4), ...config];

  return (
    <>
      {plusOuvert && (
        <FeuillePlus
          entrees={reste}
          pathname={pathname}
          onFermer={() => setPlusOuvert(false)}
          onDeconnexion={onDeconnexion}
        />
      )}

      <nav
        aria-label="Navigation"
        className={cn(
          "bg-chrome fixed inset-x-0 bottom-0 z-40 flex border-t border-chrome-border md:hidden",
          // Marge de sécurité iPhone (barre d'accueil).
          "pb-[env(safe-area-inset-bottom)]",
        )}
      >
        {onglets.map((e) => (
          <Onglet key={e.href} {...e} pathname={pathname} />
        ))}
        <button
          type="button"
          onClick={() => setPlusOuvert(true)}
          aria-expanded={plusOuvert}
          className="flex flex-1 flex-col items-center justify-center gap-1 py-2 text-chrome-muted transition-colors active:bg-chrome-hover"
        >
          <MoreHorizontal className="h-5 w-5" />
          <span className="text-[10px] font-medium leading-none">Plus</span>
        </button>
      </nav>
    </>
  );
}

function Onglet({
  href,
  nom,
  icon: Icon,
  aussi = [],
  pastille = 0,
  teinte,
  pathname,
}: EntreeNav & { pathname: string }) {
  const actif =
    href === "/"
      ? pathname === "/"
      : pathname.startsWith(href) || aussi.some((p) => pathname.startsWith(p));

  return (
    <Link
      href={href}
      aria-current={actif ? "page" : undefined}
      className={cn(
        "relative flex flex-1 flex-col items-center justify-center gap-1 py-2 transition-colors",
        classeSignal(teinte),
        actif ? "text-signal-lift" : "text-chrome-muted active:bg-chrome-hover",
      )}
    >
      {actif && (
        <span aria-hidden className="absolute inset-x-4 top-0 h-[3px] rounded-b bg-signal-lift" />
      )}
      <span className="relative">
        <Icon className="h-5 w-5" />
        {pastille > 0 && (
          <span
            aria-hidden
            className="bg-chrome-accent text-chrome absolute -right-2 -top-1 inline-flex min-w-4 items-center justify-center rounded-full px-1 font-mono text-[10px] font-bold leading-4"
          >
            {pastille > 9 ? "9+" : pastille}
          </span>
        )}
      </span>
      <span className="max-w-full truncate px-1 text-[10px] font-medium leading-none">{nom}</span>
    </Link>
  );
}

/** Feuille « Plus » : le reste de la navigation + les réglages + la session. */
function FeuillePlus({
  entrees,
  pathname,
  onFermer,
  onDeconnexion,
}: {
  entrees: EntreeNav[];
  pathname: string;
  onFermer: () => void;
  onDeconnexion: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Plus"
      className="fixed inset-0 z-50 flex flex-col justify-end md:hidden"
    >
      <button
        type="button"
        aria-label="Fermer"
        onClick={onFermer}
        className="anim-fade absolute inset-0 bg-black/55 backdrop-blur-sm"
      />

      <div className="anim-rise bg-surface relative max-h-[80vh] overflow-y-auto border-t border-border pb-[env(safe-area-inset-bottom)]">
        <div className="bloc-entete sticky top-0 z-10">
          <span className="font-display text-sm font-semibold text-fg">Tout le reste</span>
          <button
            type="button"
            onClick={onFermer}
            aria-label="Fermer"
            className="ml-auto inline-flex h-9 w-9 items-center justify-center rounded text-muted transition-colors active:bg-surface-2"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <ul className="divide-y divide-hairline">
          {entrees.map((e) => {
            const actif = pathname.startsWith(e.href);
            const Icone: LucideIcon = e.icon;
            return (
              <li key={e.href}>
                <Link
                  href={e.href}
                  className={cn(
                    "flex min-h-[3.25rem] items-center gap-3 px-4 text-sm transition-colors active:bg-surface-2",
                    actif ? "font-semibold text-brand" : "text-fg",
                  )}
                >
                  <Icone className={cn("h-5 w-5 shrink-0", actif ? "text-brand" : "text-subtle")} />
                  {e.nom}
                </Link>
              </li>
            );
          })}
        </ul>

        <div className="flex items-center gap-3 border-t border-hairline px-4 py-3">
          <span className="stamp">Affichage</span>
          <DensityToggle />
          <ThemeToggle className="ml-auto" />
        </div>

        <form action={onDeconnexion} className="border-t border-hairline">
          <button
            type="submit"
            className="flex min-h-[3.25rem] w-full items-center gap-3 px-4 text-sm text-danger transition-colors active:bg-surface-2"
          >
            <LogOut className="h-5 w-5 shrink-0" />
            Se déconnecter
          </button>
        </form>
      </div>
    </div>
  );
}
