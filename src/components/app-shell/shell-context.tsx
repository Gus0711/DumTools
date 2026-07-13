"use client";

import { createContext, useContext, useState } from "react";

/** État du tiroir de navigation mobile — partagé entre le bouton « burger »
 *  (dans le header) et la sidebar (qui devient un tiroir sous 768px).
 *  Sur desktop, la sidebar est statique et cet état n'a aucun effet. */
type ShellState = {
  navOpen: boolean;
  setNavOpen: (open: boolean) => void;
  toggleNav: () => void;
};

const ShellContext = createContext<ShellState | null>(null);

export function AppShellProvider({ children }: { children: React.ReactNode }) {
  const [navOpen, setNavOpen] = useState(false);
  return (
    <ShellContext.Provider
      value={{ navOpen, setNavOpen, toggleNav: () => setNavOpen(!navOpen) }}
    >
      {children}
    </ShellContext.Provider>
  );
}

export function useShell(): ShellState {
  const ctx = useContext(ShellContext);
  if (!ctx) throw new Error("useShell doit être utilisé dans <AppShellProvider>");
  return ctx;
}
