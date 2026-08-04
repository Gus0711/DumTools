"use client";

import { useEffect, useRef, useState } from "react";

/* Sauvegarde automatique d'un document riche (Notes, Wiki).
 *
 * Trois choses délicates vivent ici, et une seule fois :
 *
 *  1. LA COURSE. Une seule sauvegarde en vol à la fois. Deux saves concurrents
 *     partis sur la même version de base feraient conclure à tort au conflit —
 *     le second perd la course et croit qu'un collègue est passé. Une frappe
 *     arrivée pendant l'envoi arme une relance immédiate au retour.
 *
 *  2. LE CONFLIT EST TERMINAL. Dès qu'un save est refusé, on cesse d'écrire
 *     jusqu'au rechargement. Continuer reviendrait à réessayer en boucle sur
 *     une version périmée, en écrasant potentiellement le travail de l'autre.
 *
 *  3. LES FILETS ANTI-PERTE. Ctrl+S force l'écriture, un onglet qui passe en
 *     arrière-plan vide le debounce en cours (sur téléphone, « arrière-plan »
 *     veut souvent dire « bientôt tué »), et fermer avec des modifications non
 *     écrites déclenche l'avertissement natif du navigateur.
 */

export type EtatSauvegarde = "sauve" | "encours" | "erreur" | "conflit";

export type ResultatSauvegarde =
  | { ok: true; version: number; updatedAt: string }
  /** Refus : quelqu'un a sauvé entre-temps. `version` = celle en base. */
  | { ok: false; conflit: true; version: number; updatedAt: string };

export interface OptionsSauvegarde {
  /** Version du document au chargement (verrou optimiste). */
  versionInitiale: number;
  /** Date de dernière modification au chargement (ISO). */
  dateInitiale: string;
  /**
   * Écrit le document. Reçoit la version de base à faire valoir ; doit passer
   * `versionBase` à la server action, telle quelle.
   *
   * ⚠️ Appelée depuis un timer : elle doit lire l'état courant de l'éditeur au
   * moment de l'appel (refs, `editor.document`), jamais une valeur capturée au
   * rendu — sinon on sauvegarde ce que l'utilisateur avait tapé il y a 700 ms.
   */
  ecrire(versionBase: number): Promise<ResultatSauvegarde>;
  /** Délai du debounce, en ms. */
  delaiMs?: number;
}

export interface Sauvegarde {
  etat: EtatSauvegarde;
  /** ISO — dernière écriture réussie. */
  dateModif: string;
  /** À appeler à chaque changement : (re)arme le debounce. */
  planifier(): void;
  /** Écrit tout de suite (Ctrl+S, bouton « Réessayer »). */
  forcer(): void;
}

export function useSauvegardeDocument(options: OptionsSauvegarde): Sauvegarde {
  const { versionInitiale, dateInitiale, delaiMs = 700 } = options;

  const [etat, setEtat] = useState<EtatSauvegarde>("sauve");
  const [dateModif, setDateModif] = useState(dateInitiale);

  // Tout ce que le timer doit lire passe par des refs : il capture une closure,
  // et une valeur d'état y serait figée à l'instant du rendu.
  const versionRef = useRef(versionInitiale);
  const conflitRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const enVolRef = useRef(false);
  const relanceRef = useRef(false);

  const etatRef = useRef<EtatSauvegarde>("sauve");
  useEffect(() => {
    etatRef.current = etat;
  }, [etat]);

  // `ecrire` change à chaque rendu (closure sur l'éditeur) : on garde la
  // dernière version sous ref pour que le timer appelle toujours la bonne.
  const ecrireRef = useRef(options.ecrire);
  useEffect(() => {
    ecrireRef.current = options.ecrire;
  });

  const sauverRef = useRef<() => Promise<void>>(async () => {});
  useEffect(() => {
    sauverRef.current = async function sauver(): Promise<void> {
      if (conflitRef.current) return;
      if (enVolRef.current) {
        relanceRef.current = true;
        return;
      }
      enVolRef.current = true;
      setEtat("encours");
      try {
        const res = await ecrireRef.current(versionRef.current);
        if (res.ok) {
          versionRef.current = res.version;
          setDateModif(res.updatedAt);
          setEtat("sauve");
        } else {
          conflitRef.current = true;
          setEtat("conflit");
        }
      } catch {
        setEtat("erreur");
      } finally {
        enVolRef.current = false;
        if (relanceRef.current) {
          relanceRef.current = false;
          void sauverRef.current();
        }
      }
    };
  });

  const planifierRef = useRef<() => void>(() => {});
  const forcerRef = useRef<() => void>(() => {});
  useEffect(() => {
    planifierRef.current = () => {
      if (conflitRef.current) return;
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        void sauverRef.current();
      }, delaiMs);
    };
    forcerRef.current = () => {
      if (conflitRef.current) return;
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      void sauverRef.current();
    };
  });

  // Filets anti-perte. Montés une seule fois : ils passent par les refs, donc
  // n'ont aucune dépendance à suivre.
  useEffect(() => {
    const nonSauve = () =>
      timerRef.current !== null || etatRef.current === "encours" || etatRef.current === "erreur";

    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === "s") {
        e.preventDefault();
        forcerRef.current();
      }
    };
    const onCache = () => {
      if (document.visibilityState === "hidden" && timerRef.current) forcerRef.current();
    };
    const onAvantFermeture = (e: BeforeUnloadEvent) => {
      if (nonSauve()) {
        e.preventDefault();
        e.returnValue = ""; // navigateurs plus anciens
      }
    };

    document.addEventListener("keydown", onKey);
    document.addEventListener("visibilitychange", onCache);
    window.addEventListener("pagehide", onCache);
    window.addEventListener("beforeunload", onAvantFermeture);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("visibilitychange", onCache);
      window.removeEventListener("pagehide", onCache);
      window.removeEventListener("beforeunload", onAvantFermeture);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return {
    etat,
    dateModif,
    planifier: () => planifierRef.current(),
    forcer: () => forcerRef.current(),
  };
}
