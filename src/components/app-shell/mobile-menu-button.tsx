"use client";

import { Menu } from "lucide-react";
import { useShell } from "./shell-context";

/** Ouvre le tiroir de navigation. Visible uniquement sous 768px. */
export function MobileMenuButton() {
  const { toggleNav } = useShell();
  return (
    <button
      type="button"
      onClick={toggleNav}
      aria-label="Ouvrir le menu"
      className="mr-auto inline-flex h-9 w-9 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-2 hover:text-fg md:hidden"
    >
      <Menu className="h-5 w-5" />
    </button>
  );
}
