"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/cn";
import { ARRET_LABEL, ARRET_POINT, ARRET_TON, arretInfobulle, type EtatArret } from "./arret";

/* =============================================================================
 * LE MARQUEUR D'ARRÊT
 * Un badge qui EST le bouton : un seul clic dit « c'est fait » ou « je rouvre ».
 * Deux contrôles côte à côte (une pastille qui informe + un bouton qui agit)
 * auraient doublé la largeur d'une cellule de tableau pour un seul geste.
 *
 * Ce n'est pas une case à cocher au sens strict, et c'est voulu : une case a
 * deux états, celui-ci en a trois — le troisième, « retouché », n'est jamais
 * choisi par quelqu'un, il est CONSTATÉ (voir arret.ts).
 *
 * ⚠️ POURQUOI UN COMPOSANT CLIENT, ET UN `router.refresh()`
 * La première version était un `<form action={…}>` en composant serveur. Elle
 * écrivait parfaitement — la base passait bien à « arrêté » — et l'écran ne
 * bougeait pas d'un pixel : en build de production, la réponse de l'action ne
 * suffit pas à réactualiser cet arbre-là, malgré les `revalidatePath` (le même
 * constat est écrit noir sur blanc dans `affaire-fiche-header.tsx` : « sans
 * refresh, la frise ne bouge pas »). Le défaut ne se voyait qu'en PROD, jamais
 * en `next dev`, où tout est re-rendu de toute façon.
 *
 * Et le refresh se justifie ici : l'arrêt n'est pas une valeur isolée dans son
 * coin, il alimente le jalon « Étude » de la frise, juste au-dessus.
 *
 * ⚠️ Un booléen `enCours`, et surtout PAS `useTransition` : React se réserve le
 * droit d'interrompre puis de rejouer un rendu de transition, et la réponse de
 * l'écriture s'y perd (mesuré 1 fois sur 5, voir CLAUDE.md).
 * ========================================================================== */

/** Le clic suivant. Depuis « retouché » on RÉ-ARRÊTE : on vient de regarder la
 *  retouche, on ne veut pas rouvrir. Miroir exact de la règle du serveur. */
function suivant(etat: EtatArret): EtatArret {
  return etat === "arrete" ? "ouvert" : "arrete";
}

export function BasculeArret({
  etat,
  arreteLe,
  arretePar,
  referenceLe,
  quoi,
  basculer,
  className,
}: {
  etat: EtatArret;
  arreteLe?: Date | string | null;
  arretePar?: string | null;
  /** Dernière modification du contenu — sert à écrire « puis modifié le … ». */
  referenceLe?: Date | string | null;
  /** Ce dont on parle, en toutes lettres (« L'automate “Chaufferie” »). */
  quoi: string;
  /** Server action déjà liée à l'objet concerné. */
  basculer: () => Promise<void>;
  className?: string;
}) {
  const router = useRouter();
  const [enCours, setEnCours] = useState(false);
  /* L'effet est peint sans attendre le serveur — un badge qui ne réagit pas au
     clic pendant une seconde donne l'impression que le clic est passé à côté.
     Le repère `depuis` est ce qui rend l'astuce sûre : la valeur peinte ne
     s'applique que TANT QUE le serveur montre encore l'ancienne. Dès que la
     nouvelle arrive, elle cesse d'elle-même — rien à nettoyer, et aucune
     divergence possible si l'écriture échoue. */
  const [peint, setPeint] = useState<{ depuis: EtatArret; vers: EtatArret } | null>(null);
  const affiche = peint && peint.depuis === etat ? peint.vers : etat;
  const aJour = affiche === etat;

  const infobulle = aJour
    ? arretInfobulle({ etat, arreteLe, arretePar, referenceLe, quoi })
    : "Enregistrement…";

  async function cliquer() {
    if (enCours) return;
    // Le prochain état se calcule sur ce qui est AFFICHÉ, pas sur la prop du
    // serveur : entre la fin de l'écriture et l'atterrissage du `refresh`, la
    // prop est encore l'ancienne, et un second clic dans cette fenêtre
    // repeindrait l'état qu'on vient de quitter. Le serveur, lui, tranche
    // toujours sur la base — les deux restent d'accord.
    setPeint({ depuis: etat, vers: suivant(affiche) });
    setEnCours(true);
    try {
      await basculer();
      router.refresh();
    } finally {
      setEnCours(false);
    }
  }

  return (
    <button
      type="button"
      onClick={cliquer}
      disabled={enCours}
      title={infobulle}
      aria-label={infobulle}
      className={cn(
        "press inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium",
        "transition-[background-color,color,opacity] duration-150 hover:opacity-80",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/30",
        ARRET_TON[affiche],
        !aJour && "opacity-70",
        className,
      )}
    >
      <span aria-hidden className={cn("h-1.5 w-1.5 rounded-full", ARRET_POINT[affiche])} />
      {ARRET_LABEL[affiche]}
    </button>
  );
}

/**
 * La version qui ne fait que MONTRER — pour les listes où l'on balaye sans
 * agir (le tableau de bord des affaires). Cliquer pour arrêter un automate
 * depuis un écran qui ne montre pas son contenu n'aurait aucun sens : on dit
 * qu'on s'arrête après avoir regardé, pas de loin.
 */
export function PastilleArret({
  etat,
  libelle,
  titre,
  className,
}: {
  etat: EtatArret;
  /** Le texte court montré à l'écran (« GTB 2/3 », « Matériel »). */
  libelle: string;
  /** La phrase complète — infobulle ET lecteur d'écran : « GTB 2/3 » ne veut
   *  rien dire tout seul, et la couleur encore moins. */
  titre: string;
  className?: string;
}) {
  return (
    <span
      title={titre}
      className={cn(
        "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium",
        ARRET_TON[etat],
        className,
      )}
    >
      <span aria-hidden className={cn("h-1.5 w-1.5 rounded-full", ARRET_POINT[etat])} />
      <span aria-hidden>{libelle}</span>
      <span className="sr-only">{titre}</span>
    </span>
  );
}
