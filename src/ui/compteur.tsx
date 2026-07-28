"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

/* =============================================================================
 * LE COMPTEUR
 * Un chiffre qui arrive déjà posé, on le lit sans le voir. Un chiffre qui monte
 * de zéro, on le regarde — c'est l'aiguille d'un instrument qui se cale au
 * moment de la mise sous tension. Court (600 ms), une seule fois, jamais rejoué
 * au défilement.
 *
 * Le serveur rend la valeur finale : sans JS, ou avec `prefers-reduced-motion`,
 * le chiffre est simplement là. La remise à zéro se fait AVANT le premier
 * peint (layout effect), donc on ne voit jamais le chiffre sauter.
 * ========================================================================== */

const DUREE = 600;

// Le layout effect n'existe pas au rendu serveur — y appeler useLayoutEffect
// déclencherait un avertissement React à chaque compteur de la page.
const useAvantPeint = typeof window === "undefined" ? useEffect : useLayoutEffect;

export function Compteur({ valeur }: { valeur: number }) {
  const [n, setN] = useState(valeur);
  const monte = useRef(false);

  // Une seule course, au montage : `cible` est la valeur de ce moment-là. Un
  // compteur qui se rejoue à chaque revalidation serait un tic nerveux, pas une
  // mise sous tension.
  const [cible] = useState(valeur);

  useAvantPeint(() => {
    if (
      typeof window === "undefined" ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
      cible === 0
    ) {
      return;
    }

    const depart = performance.now();
    let frame = 0;
    setN(0);

    const pas = (t: number) => {
      const avance = Math.min(1, (t - depart) / DUREE);
      // Même courbe que le reste de l'appli : départ franc, arrivée amortie.
      const eased = 1 - Math.pow(1 - avance, 3);
      setN(Math.round(cible * eased));
      if (avance < 1) frame = requestAnimationFrame(pas);
    };
    frame = requestAnimationFrame(pas);
    return () => cancelAnimationFrame(frame);
  }, [cible]);

  // La valeur peut changer après coup (revalidation, filtre) : on la suit sans
  // rejouer l'animation. Au montage on ne fait rien — sinon ce passage
  // écraserait le zéro que le layout effect vient de poser, et la course
  // n'aurait jamais lieu.
  useEffect(() => {
    if (!monte.current) {
      monte.current = true;
      return;
    }
    setN(valeur);
  }, [valeur]);

  return <>{n}</>;
}
