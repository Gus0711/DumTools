"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, Building2, Home, SlidersHorizontal, Tags, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import { TOOLS } from "@/tools/registry";

export function Sidebar() {
  const pathname = usePathname();

  const items = [
    { href: "/", nom: "Accueil", icon: Home },
    ...TOOLS.map((t) => ({ href: t.href, nom: t.nom, icon: t.icon })),
  ];

  const configItems = [
    { href: "/clients", nom: "Clients", icon: Building2 },
    { href: "/configuration/points", nom: "Catalogue & modèles", icon: Tags },
    { href: "/configuration/materiel", nom: "Base matériel", icon: SlidersHorizontal },
    { href: "/documentation", nom: "Documentation", icon: BookOpen },
  ];

  return (
    <aside className="bg-brand-gradient text-sidebar-fg relative flex w-64 shrink-0 flex-col">
      {/* Trame « plan d'architecte » — signature discrète sur le fond marine. */}
      <div aria-hidden className="blueprint-grid pointer-events-none absolute inset-0" />

      <div className="relative flex items-center gap-3 border-b border-sidebar-border px-5 py-4">
        {/* Logo sur pastille blanche : le lockup contient du texte marine. */}
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white shadow-sm">
          <Image
            src="/logo-dumortier.png"
            alt="Dumortier — Groupe Fareneït"
            width={32}
            height={43}
            className="h-8 w-auto object-contain"
            priority
          />
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
  );
}

function NavLink({
  href,
  nom,
  icon: Icon,
  pathname,
}: {
  href: string;
  nom: string;
  icon: LucideIcon;
  pathname: string;
}) {
  const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
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
    </Link>
  );
}
