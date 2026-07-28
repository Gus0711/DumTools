"use client";

import { createContext, useContext, useState } from "react";

/** État partagé de la coquille applicative : l'ouverture de la palette de
 *  recherche globale (⌘K), partagée entre le bouton de la barre de chrome et
 *  la palette montée dans le layout. */
type ShellState = {
  rechercheOuverte: boolean;
  setRechercheOuverte: (ouvert: boolean) => void;
};

const ShellContext = createContext<ShellState | null>(null);

export function AppShellProvider({ children }: { children: React.ReactNode }) {
  const [rechercheOuverte, setRechercheOuverte] = useState(false);
  return (
    <ShellContext.Provider value={{ rechercheOuverte, setRechercheOuverte }}>
      {children}
    </ShellContext.Provider>
  );
}

export function useShell(): ShellState {
  const ctx = useContext(ShellContext);
  if (!ctx) throw new Error("useShell doit être utilisé dans <AppShellProvider>");
  return ctx;
}
