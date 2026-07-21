"use client";

import { createContext, useContext, useState } from "react";

/** État partagé de la coquille applicative :
 *  - `navOpen` : tiroir de navigation mobile — entre le bouton « burger » (dans
 *    le header) et la sidebar (qui devient un tiroir sous 768px). Sur desktop,
 *    la sidebar est statique et cet état n'a aucun effet.
 *  - `rechercheOuverte` : palette de recherche globale (⌘K) — entre le bouton
 *    du header et la palette montée dans le layout. */
type ShellState = {
  navOpen: boolean;
  setNavOpen: (open: boolean) => void;
  toggleNav: () => void;
  rechercheOuverte: boolean;
  setRechercheOuverte: (ouvert: boolean) => void;
};

const ShellContext = createContext<ShellState | null>(null);

export function AppShellProvider({ children }: { children: React.ReactNode }) {
  const [navOpen, setNavOpen] = useState(false);
  const [rechercheOuverte, setRechercheOuverte] = useState(false);
  return (
    <ShellContext.Provider
      value={{
        navOpen,
        setNavOpen,
        toggleNav: () => setNavOpen(!navOpen),
        rechercheOuverte,
        setRechercheOuverte,
      }}
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
