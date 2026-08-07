"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { contenuTexteSimple, texteNu, type ContenuRiche } from "./model";

/* =============================================================================
 * LE TEXTE LIBRE D'UNE LIGNE DE DEVIS
 *
 * Même moteur que les Notes et le Wiki (BlockNote) : « / » ouvre titres,
 * listes, tableau, image, lien. Ce qui est propre au devis, c'est le RYTHME —
 * un devis porte dix commentaires d'une ligne, pas un document. D'où trois
 * règles, dans cet ordre d'importance :
 *
 *  1. LE CAS COURANT NE MONTE PAS D'ÉDITEUR. Un texte sans mise en forme
 *     (`texteNu`) se rend en une balise `<p>` : zéro instance ProseMirror pour
 *     la ligne « Prestations incluses ». Seul un document réellement riche paie
 *     un rendu BlockNote, et seule la ligne qu'on modifie paie un éditeur.
 *
 *  2. ÉDITER SUSPEND LE GLISSER-DÉPOSER. Chrome interdit la sélection de texte
 *     sous un parent `draggable` : sans ce relâchement, on ne pourrait pas
 *     sélectionner un mot dans la rangée qu'on est en train d'écrire.
 *
 *  3. LES MENUS DE BLOCKNOTE SONT DANS DES PORTAILS. Cliquer dans le menu « / »
 *     atterrit hors de notre conteneur : le fermer sur ce clic-là refermerait
 *     l'éditeur au moment précis où l'on choisit un bloc.
 * ========================================================================== */

const Lecture = dynamic(() => import("./texte-riche-impl").then((m) => m.LectureTexteLigne), {
  ssr: false,
  loading: () => <Chargement />,
});

const Edition = dynamic(() => import("./texte-riche-impl").then((m) => m.EditionTexteLigne), {
  ssr: false,
  loading: () => <Chargement />,
});

function Chargement() {
  return (
    <span className="inline-flex items-center gap-2 py-1 text-sm text-subtle">
      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Chargement de l&apos;éditeur…
    </span>
  );
}

/** Ce qui, cliqué, ne doit PAS refermer l'éditeur : l'éditeur lui-même et toute
 *  l'interface que BlockNote rend en portail (menu « / », barre de mise en
 *  forme, sélecteur de fichier, infobulles). L'app n'utilise Mantine nulle part
 *  ailleurs — le sélecteur est donc sans effet de bord. */
const HORS_FERMETURE = ".bn-container, [class*='bn-'], [class*='mantine-']";

export interface TexteRicheProps {
  ligneId: string;
  devisId: string;
  contenu: ContenuRiche | null;
  /** Le libellé d'avant la bascule en riche : il amorce le document quand
   *  `contenu` est null (lignes créées avant cette version). */
  designation: string;
  version: number;
  /** ISO — dernière écriture connue (verrou optimiste du socle). */
  majLe: string;
  /** Ouvrir en édition dès le montage : la ligne qu'on vient de créer. */
  ouvertDefaut?: boolean;
  disabled?: boolean;
  /** Prévient la rangée qu'elle doit relâcher son glisser-déposer (règle 2). */
  onEdition?: (actif: boolean) => void;
}

export function TexteRiche({
  ligneId,
  devisId,
  contenu,
  designation,
  version,
  majLe,
  ouvertDefaut = false,
  disabled = false,
  onEdition,
}: TexteRicheProps) {
  const [edition, setEdition] = useState(ouvertDefaut);
  const boite = useRef<HTMLDivElement>(null);
  /** Rempli par l'éditeur : vide le debounce en cours. Fermer sans ça perdrait
   *  les 700 dernières millisecondes de frappe. */
  const forcerRef = useRef<() => void>(() => {});

  /* --- CE QU'ON VIENT D'ÉCRIRE ----------------------------------------------
   * L'autosave n'invalide volontairement aucun écran (il part à chaque frappe,
   * et aucun total ne dépend d'un texte) : la prop `contenu` reste donc celle
   * du dernier chargement de page. Sans cet état local, deux choses cassaient :
   *
   *  1. fermer l'éditeur réaffichait l'ANCIEN texte — il fallait recharger la
   *     page pour voir ce qu'on venait de taper ;
   *  2. pire, rouvrir repartait sur l'ANCIENNE version : la sauvegarde suivante
   *     était refusée pour conflit (« modifié ailleurs ») et le travail de cette
   *     seconde session était perdu.
   *
   * Le serveur reprend la main dès qu'il est AU MOINS AUSSI RÉCENT (comparaison
   * de version, pas d'identité de prop) : un `router.refresh()` déclenché par
   * une autre action peut très bien rapporter des données d'avant notre save. */
  const [ecrit, setEcrit] = useState<{
    contenu: ContenuRiche;
    version: number;
    majLe: string;
  } | null>(null);

  const courant = ecrit && ecrit.version > version ? ecrit : { contenu, version, majLe };

  // Le document sur lequel l'éditeur s'ouvre — figé au montage de l'édition :
  // une ligne d'avant la bascule (contenu null) part de son ancien libellé.
  const initial = courant.contenu ?? contenuTexteSimple(designation);
  const nu = courant.contenu === null ? designation : texteNu(courant.contenu);

  useEffect(() => {
    onEdition?.(edition);
  }, [edition, onEdition]);

  const fermer = useCallback(() => {
    forcerRef.current();
    setEdition(false);
  }, []);

  // Fermeture au clic ailleurs (règle 3). `pointerdown` et non `click` : un
  // clic qui commence dans l'éditeur et finit ailleurs (sélection de texte
  // relâchée hors du cadre) ne doit pas compter comme une sortie.
  useEffect(() => {
    if (!edition) return;
    const dehors = (e: PointerEvent) => {
      const cible = e.target as HTMLElement | null;
      if (!cible || boite.current?.contains(cible)) return;
      if (cible.closest(HORS_FERMETURE)) return;
      fermer();
    };
    document.addEventListener("pointerdown", dehors, true);
    return () => document.removeEventListener("pointerdown", dehors, true);
  }, [edition, fermer]);

  if (edition) {
    return (
      <div ref={boite} className="min-w-0 flex-1">
        <Edition
          ligneId={ligneId}
          devisId={devisId}
          initial={initial}
          version={courant.version}
          majLe={courant.majLe}
          onEnregistre={setEcrit}
          onFermer={fermer}
          forcerRef={forcerRef}
        />
      </div>
    );
  }

  const ouvrir = () => {
    if (!disabled) setEdition(true);
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={ouvrir}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          ouvrir();
        }
      }}
      title="Cliquer pour écrire — « / » ouvre les blocs (titre, liste, tableau, image…)"
      className={cn(
        "min-w-0 flex-1 cursor-text rounded-sm px-1 py-0.5 text-left transition-colors hover:bg-surface",
        disabled && "cursor-default",
      )}
    >
      {nu !== null ? (
        nu.trim() ? (
          <p className="whitespace-pre-wrap text-sm italic leading-snug text-muted">{nu}</p>
        ) : (
          <p className="text-sm italic leading-snug text-subtle">
            Texte libre — cliquer pour écrire
          </p>
        )
      ) : (
        // `key` sur la version : BlockNote ne lit `initialContent` qu'au
        // montage. Sans elle, le rendu de lecture resterait figé sur le
        // document d'ouverture après une modification.
        <Lecture key={courant.version} contenu={courant.contenu ?? []} />
      )}
    </div>
  );
}
