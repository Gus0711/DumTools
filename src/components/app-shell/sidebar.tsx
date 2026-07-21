"use client";

import { useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, Briefcase, Building2, Home, SlidersHorizontal, Tags, Users, X, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import { TOOLS_AFFAIRE, TOOLS_NAV } from "@/tools/registry";
import { useShell } from "./shell-context";

export function Sidebar({
  isAdmin = false,
  nbTaches = 0,
}: {
  isAdmin?: boolean;
  /** Tâches qui me sont assignées et pas terminées → pastille sur « Affaires ». */
  nbTaches?: number;
}) {
  const pathname = usePathname();
  const { navOpen, setNavOpen } = useShell();

  // Fermer le tiroir à chaque navigation (mobile). Sans effet sur desktop.
  useEffect(() => {
    setNavOpen(false);
  }, [pathname, setNavOpen]);

  // Projet GTB, Notes et Documents n'y figurent pas : ce sont des outils
  // « d'affaire » (portee: "affaire"), on y entre par la fiche Affaire.
  const items = [
    { href: "/", nom: "Accueil", icon: Home },
    // « Affaires » reste allumé dans les outils d'affaire : on y est entré par
    // une affaire, la nav doit le refléter.
    {
      href: "/affaires",
      nom: "Affaires",
      icon: Briefcase,
      aussi: TOOLS_AFFAIRE.map((t) => t.href),
      pastille: nbTaches,
    },
    ...TOOLS_NAV.map((t) => ({ href: t.href, nom: t.nom, icon: t.icon })),
  ];

  const configItems = [
    { href: "/clients", nom: "Clients", icon: Building2 },
    { href: "/configuration/points", nom: "Points & modèles", icon: Tags },
    { href: "/configuration/materiel", nom: "Base matériel", icon: SlidersHorizontal },
    { href: "/documentation", nom: "Documentation", icon: BookOpen },
    // Gestion des comptes : réservée aux administrateurs.
    ...(isAdmin
      ? [{ href: "/configuration/utilisateurs", nom: "Utilisateurs", icon: Users }]
      : []),
  ];

  return (
    <>
      {/* Voile mobile : couvre le contenu quand le tiroir est ouvert (< md). */}
      <div
        aria-hidden={!navOpen}
        onClick={() => setNavOpen(false)}
        className={cn(
          "fixed inset-0 z-40 bg-black/50 backdrop-blur-sm transition-opacity duration-300 md:hidden",
          navOpen ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      />

      <aside
        className={cn(
          "bg-brand-gradient text-sidebar-fg fixed inset-y-0 left-0 z-50 flex w-64 flex-col shadow-xl transition-transform duration-300 ease-out",
          // Desktop : statique dans le flux, toujours visible.
          "md:static md:z-auto md:shrink-0 md:translate-x-0 md:shadow-none",
          // Mobile : tiroir off-canvas, glissé hors écran quand fermé.
          navOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
      {/* Trame « plan d'architecte » — signature discrète sur le fond marine. */}
      <div aria-hidden className="blueprint-grid pointer-events-none absolute inset-0" />

      {/* Fermeture du tiroir (mobile uniquement). */}
      <button
        type="button"
        onClick={() => setNavOpen(false)}
        aria-label="Fermer le menu"
        className="absolute right-3 top-3.5 z-10 inline-flex h-8 w-8 items-center justify-center rounded-md text-sidebar-muted transition-colors hover:bg-sidebar-hover hover:text-sidebar-fg md:hidden"
      >
        <X className="h-5 w-5" />
      </button>

      <div className="relative flex items-center gap-3 border-b border-sidebar-border px-5 py-4">
        {/* Logo sur pastille blanche : le lockup contient du texte marine.
            Private joke : au survol, le logo s'affiche en TRÈS grand plein écran. */}
        <div className="group flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-xl bg-white shadow-sm">
          <Image
            src="/logo_DumTools.png"
            alt="DumoTool — Groupe Fareneït"
            width={32}
            height={43}
            className="h-8 w-auto object-contain"
            priority
          />
          {/* Overlay plein écran révélé au group-hover : le logo en très grand. */}
          <div
            aria-hidden
            className="pointer-events-none fixed inset-0 z-[100] flex items-center justify-center bg-black/70 opacity-0 backdrop-blur-sm transition-opacity duration-300 group-hover:opacity-100"
          >
            <Image
              src="/logo_DumTools.png"
              alt=""
              width={880}
              height={1189}
              className="h-[85vh] w-auto max-w-[90vw] scale-90 object-contain drop-shadow-2xl transition-transform duration-300 group-hover:scale-100"
            />
          </div>
        </div>
        <div className="leading-tight">
          <div className="font-display text-[15px] font-bold tracking-tight text-sidebar-fg">
            DumTools
          </div>
          <div className="text-xs text-sidebar-muted">Outils internes</div>
        </div>
      </div>

      <nav className="relative flex-1 space-y-0.5 p-3">
        {items.map((item) => (
          <NavLink key={item.href} {...item} pathname={pathname} />
        ))}

        <div className="mt-5 mb-1 flex items-center gap-2 px-3 text-[10px] font-semibold uppercase tracking-wider text-sidebar-muted">
          <span>Configuration</span>
          <span className="h-px flex-1 bg-sidebar-border" />
        </div>
        {configItems.map((item) => (
          <NavLink key={item.href} {...item} pathname={pathname} />
        ))}
      </nav>

      <div className="relative border-t border-sidebar-border px-5 py-3 text-xs text-sidebar-muted">
        Groupe Fareneït · Dumortier
      </div>
      </aside>
    </>
  );
}

function NavLink({
  href,
  nom,
  icon: Icon,
  pathname,
  aussi = [],
  pastille = 0,
}: {
  href: string;
  nom: string;
  icon: LucideIcon;
  pathname: string;
  /** Préfixes de route qui allument aussi cette entrée. */
  aussi?: string[];
  /** Compteur affiché à droite (masqué si 0). */
  pastille?: number;
}) {
  const active =
    href === "/"
      ? pathname === "/"
      : pathname.startsWith(href) || aussi.some((p) => pathname.startsWith(p));
  return (
    <Link
      href={href}
      className={cn(
        "relative flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
        active
          ? "bg-sidebar-active-bg text-sidebar-active-fg"
          : "text-sidebar-muted hover:bg-sidebar-hover hover:text-sidebar-fg",
      )}
    >
      {active && (
        <span className="absolute top-1.5 bottom-1.5 left-0 w-1 rounded-full bg-sidebar-accent" />
      )}
      <Icon className={cn("h-4.5 w-4.5 shrink-0", active && "text-sidebar-accent")} />
      <span className="truncate">{nom}</span>
      {pastille > 0 && (
        <span
          title={`${pastille} tâche${pastille > 1 ? "s" : ""} qui ${pastille > 1 ? "me sont assignées" : "m'est assignée"}`}
          className="ml-auto inline-flex min-w-5 shrink-0 items-center justify-center rounded-full bg-sidebar-accent px-1.5 py-0.5 text-[11px] font-semibold leading-none tabular-nums text-brand"
        >
          {pastille > 99 ? "99+" : pastille}
        </span>
      )}
    </Link>
  );
}
