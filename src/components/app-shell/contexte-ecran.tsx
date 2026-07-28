"use client";

import { createContext, useContext, useEffect, useState } from "react";

/* =============================================================================
 * CONTEXTE D'ÉCRAN
 * La barre de chrome (sombre, en haut) annonce en permanence OÙ on se trouve :
 * « AFFAIRE ▸ UEHC BETHUNE ▮ En cours ». Cette information n'existe que dans la
 * page — d'où ce petit canal : chaque page dépose son identité au montage, la
 * barre l'affiche, et la page la retire en partant.
 * ========================================================================== */

export type EtatEcran = {
  label: string;
  /** Teinte de la pastille d'état, dans le vocabulaire du design system. */
  ton?: "neutre" | "brand" | "accent" | "success" | "danger";
};

export type Ecran = {
  /** Famille d'écran, en petites capitales : « Affaire », « Référentiel »… */
  estampille?: string;
  titre: string;
  etat?: EtatEcran;
};

type ContexteEcranState = {
  ecran: Ecran | null;
  setEcran: (e: Ecran | null) => void;
};

const Ctx = createContext<ContexteEcranState | null>(null);

export function FournisseurEcran({ children }: { children: React.ReactNode }) {
  const [ecran, setEcran] = useState<Ecran | null>(null);
  return <Ctx.Provider value={{ ecran, setEcran }}>{children}</Ctx.Provider>;
}

export function useEcran(): ContexteEcranState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useEcran doit être utilisé dans <FournisseurEcran>");
  return ctx;
}

/**
 * Déposé par une page pour nommer l'écran courant dans la barre de chrome.
 * Ne rend rien. Les props doivent rester sérialisables : la plupart des pages
 * qui l'utilisent sont des composants serveur.
 */
export function TitreEcran({ estampille, titre, etat }: Ecran) {
  const { setEcran } = useEcran();
  // La dépendance porte sur les champs, pas sur l'objet : une page serveur
  // recrée un objet littéral à chaque rendu, ce qui rebouclerait sans fin.
  const tonEtat = etat?.ton;
  const labelEtat = etat?.label;
  useEffect(() => {
    setEcran({
      estampille,
      titre,
      etat: labelEtat ? { label: labelEtat, ton: tonEtat } : undefined,
    });
    return () => setEcran(null);
  }, [estampille, titre, labelEtat, tonEtat, setEcran]);
  return null;
}
