"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { classeSignal } from "@/tools/registry";
import { entreesNav, type EntreeNav } from "./nav";

/* =============================================================================
 * LE RAIL (bureau)
 * La navigation d'un logiciel d'atelier : une réglette d'icônes, toujours là,
 * qui ne mange pas le plan de travail. Le libellé sort au survol — on n'a pas
 * besoin de lire « Accueil » huit heures par jour, on a besoin de la place.
 * Sous 768px il s'efface au profit de la barre du bas (BarreMobile).
 * ========================================================================== */

export function Rail({
  isAdmin = false,
  nbTaches = 0,
}: {
  isAdmin?: boolean;
  nbTaches?: number;
}) {
  const pathname = usePathname();
  const { principal, config } = entreesNav({ isAdmin, nbTaches });

  return (
    <nav
      aria-label="Navigation principale"
      className="bg-chrome relative z-30 hidden w-16 shrink-0 flex-col items-center gap-1 border-r border-chrome-border py-2.5 md:flex"
    >
      <Link
        href="/"
        aria-label="Accueil DumTools"
        className="mb-1.5 flex h-10 w-10 items-center justify-center rounded bg-white/95 transition-transform duration-200 hover:scale-105"
      >
        <Image
          src="/logo_DumTools.png"
          alt=""
          width={26}
          height={35}
          className="h-7 w-auto object-contain"
          priority
        />
      </Link>

      <span aria-hidden className="mb-1 h-px w-7 bg-chrome-border" />

      {principal.map((e) => (
        <Bouton key={e.href} {...e} pathname={pathname} />
      ))}

      <span aria-hidden className="my-1.5 h-px w-7 bg-chrome-border" />

      {config.map((e) => (
        <Bouton key={e.href} {...e} pathname={pathname} />
      ))}

      {/* Filet des 5 signaux E/S, debout : la signature de la maison posée sur
          le bâti, là où elle ne gêne aucune lecture. */}
      <span aria-hidden className="rule-signal-v mt-auto h-16 w-[3px] rounded-full opacity-60" />
    </nav>
  );
}

function Bouton({
  href,
  nom,
  icon: Icon,
  pathname,
  aussi = [],
  pastille = 0,
  teinte,
}: EntreeNav & { pathname: string }) {
  const actif =
    href === "/"
      ? pathname === "/"
      : pathname.startsWith(href) || aussi.some((p) => pathname.startsWith(p));

  return (
    <Link
      href={href}
      aria-label={nom}
      aria-current={actif ? "page" : undefined}
      className={cn(
        "group relative flex h-10 w-10 items-center justify-center rounded transition-colors duration-150",
        // Le signal de l'outil, remonté en clarté : le bâti est sombre dans
        // les deux thèmes, l'ocre DI y serait illisible tel quel.
        classeSignal(teinte),
        actif
          ? "bg-white/10 text-signal-lift"
          : "text-chrome-muted hover:bg-chrome-hover hover:text-chrome-fg",
      )}
    >
      {actif && (
        <span
          aria-hidden
          className="anim-rail absolute -left-3 top-1.5 bottom-1.5 w-[3px] rounded-r bg-signal-lift"
        />
      )}
      <Icon className="h-5 w-5" />

      {pastille > 0 && (
        <span
          aria-hidden
          className="bg-chrome-accent text-chrome absolute -right-0.5 -top-0.5 inline-flex min-w-4 items-center justify-center rounded-full px-1 font-mono text-[10px] font-bold leading-4"
        >
          {pastille > 9 ? "9+" : pastille}
        </span>
      )}

      {/* Libellé au survol — la réglette reste muette tant qu'on ne demande rien. */}
      <span
        role="tooltip"
        className={cn(
          "pointer-events-none absolute left-full z-50 ml-2 whitespace-nowrap rounded bg-chrome-2 px-2 py-1",
          "text-xs font-medium text-chrome-fg opacity-0 shadow-lg ring-1 ring-chrome-border",
          "transition-opacity duration-150 group-hover:opacity-100",
        )}
      >
        {nom}
        {pastille > 0 && <span className="ml-1.5 text-chrome-accent">{pastille}</span>}
      </span>
    </Link>
  );
}
