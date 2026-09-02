"use client";

import { useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";
import { contenuTexteSimple, texteNu, type NoteContenu } from "@/tools/notes/model";

/* =============================================================================
 * LE CORPS D'UNE TÂCHE
 *
 * Une tâche n'était qu'une ligne de texte : le contexte — ce qui a été dit au
 * téléphone, les trois sous-étapes, la référence à confirmer, la photo de
 * l'armoire — vivait ailleurs ou nulle part. Il vit maintenant AVEC la chose à
 * faire, dans le même moteur que les Notes, le Wiki et le texte libre d'une
 * ligne de devis (4ᵉ consommateur, aucun moteur de plus).
 *
 * DEUX RÈGLES, héritées du texte libre du devis et vérifiées à l'usage :
 *
 *  1. LE CAS COURANT NE MONTE PAS D'ÉDITEUR. La plupart des tâches n'ont pas de
 *     corps, et beaucoup n'auront qu'une phrase : `texteNu` la rend en un `<p>`.
 *     Zéro instance ProseMirror tant qu'on n'écrit pas vraiment.
 *
 *  2. QUI N'INVALIDE PAS DOIT AFFICHER SON PROPRE ÉTAT. La sauvegarde part à
 *     chaque frappe et n'invalide aucun écran (aucun compteur ne dépend d'un
 *     corps) : la prop `contenu` reste donc celle du dernier chargement. Sans
 *     l'état local, replier réafficherait l'ancien texte — et rouvrir repartirait
 *     sur l'ANCIENNE version, donc sur un faux conflit qui perdrait la session
 *     d'écriture suivante.
 * ========================================================================== */

const Lecture = dynamic(() => import("./corps-tache-impl").then((m) => m.LectureCorpsTache), {
  ssr: false,
  loading: () => <Chargement />,
});

const Edition = dynamic(() => import("./corps-tache-impl").then((m) => m.EditionCorpsTache), {
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

export function CorpsTache({
  tacheId,
  contenu,
  version,
  majLe,
}: {
  tacheId: string;
  contenu: NoteContenu | null;
  version: number;
  /** ISO — dernière écriture connue (verrou optimiste du socle). */
  majLe: string;
}) {
  const [edition, setEdition] = useState(false);
  /** Rempli par l'éditeur : vide le debounce en cours. Replier sans ça perdrait
   *  les 700 dernières millisecondes de frappe. */
  const forcerRef = useRef<() => void>(() => {});

  const [ecrit, setEcrit] = useState<{
    contenu: NoteContenu;
    version: number;
    majLe: string;
  } | null>(null);

  // Le serveur reprend la main dès qu'il est AU MOINS AUSSI RÉCENT — comparaison
  // de VERSION, jamais d'identité de prop : un `router.refresh()` déclenché par
  // une autre action peut très bien rapporter des données d'avant notre save.
  const courant = ecrit && ecrit.version > version ? ecrit : { contenu, version, majLe };

  if (edition) {
    return (
      <div className="min-w-0">
        <Edition
          tacheId={tacheId}
          initial={courant.contenu ?? []}
          version={courant.version}
          majLe={courant.majLe}
          onEnregistre={setEcrit}
          forcerRef={forcerRef}
        />
        <div className="mt-1 px-1">
          <button
            type="button"
            onClick={() => {
              forcerRef.current();
              setEdition(false);
            }}
            className="text-xs text-muted underline-offset-2 hover:text-fg hover:underline"
          >
            Terminer
          </button>
        </div>
      </div>
    );
  }

  const nu = texteNu(courant.contenu);
  const vide = courant.contenu === null || (nu !== null && !nu.trim());

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => setEdition(true)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          setEdition(true);
        }
      }}
      title="Cliquer pour écrire — « / » ouvre les blocs (liste à cocher, titre, tableau, image…)"
      className="min-w-0 cursor-text rounded-sm px-1 py-0.5 text-left transition-colors hover:bg-surface"
    >
      {vide ? (
        <p className="text-sm italic leading-snug text-subtle">
          Rien de noté — cliquer pour écrire ce qu&apos;il faut ne pas oublier.
        </p>
      ) : nu !== null ? (
        <p className="whitespace-pre-wrap text-sm leading-snug text-muted">{nu}</p>
      ) : (
        // `key` sur la version : BlockNote ne lit `initialContent` qu'au montage.
        // Sans elle, la lecture resterait figée sur le document d'ouverture.
        <Lecture key={courant.version} contenu={courant.contenu ?? []} />
      )}
    </div>
  );
}

/** Le document porte-t-il quelque chose ? Sert à marquer la ligne d'un repère
 *  sans monter quoi que ce soit — on ne déplie pas dix tâches pour savoir
 *  laquelle a une note. */
export function corpsRempli(contenu: NoteContenu | null): boolean {
  if (contenu === null) return false;
  const nu = texteNu(contenu);
  if (nu === null) return true; // document riche
  return nu.trim().length > 0;
}

export { contenuTexteSimple };
