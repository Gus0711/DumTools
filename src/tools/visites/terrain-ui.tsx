"use client";

/**
 * Briques UI partagées de l'îlot terrain (accueil, éditeur, mode « Dérouler »).
 * Pensées « une main, gros doigts, plein soleil ou fond de chaufferie » :
 * cibles larges, retour haptique, état de synchro toujours lisible d'un œil.
 */

import { Check, CloudOff, RefreshCw, TriangleAlert } from "lucide-react";
import {
  ClipboardCheck,
  HardHat,
  Ruler,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/cn";
import type { SyncState } from "@/lib/offline/use-mise-en-service";
import type { TypeVisite } from "./model";

/** Petit retour haptique (no-op si non supporté — iOS Safari notamment). */
export function vibrer(pattern: number | number[] = 10): void {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* non supporté */
  }
}

export type AddMediaInput = {
  type: "photo" | "audio";
  mimeType: string;
  blob: Blob;
  itemId?: string;
  reserveId?: string;
  dureeSec?: number;
};

/* --- Identité visuelle des types de visite ---------------------------------- *
 * Chaque type garde SA couleur (les tons E/S du design system) partout :
 * carte de création, rail des cartes de visite, chip de l'éditeur. */

export const TYPE_META: Record<
  TypeVisite,
  { icon: LucideIcon; court: string; hint: string; rail: string; bordureActive: string }
> = {
  RELEVE: {
    icon: Ruler,
    court: "Relevé",
    hint: "Avant chiffrage — existant, alims, place dispo",
    rail: "border-l-io-ai",
    bordureActive: "border-io-ai bg-io-ai/10",
  },
  SUIVI: {
    icon: HardHat,
    court: "Suivi",
    hint: "Pendant travaux — avancement, blocages",
    rail: "border-l-io-di",
    bordureActive: "border-io-di bg-io-di/10",
  },
  RECEPTION: {
    icon: ClipboardCheck,
    court: "Réception",
    hint: "Livraison — essais, levée de réserves",
    rail: "border-l-io-do",
    bordureActive: "border-io-do bg-io-do/10",
  },
  MAINTENANCE: {
    icon: Wrench,
    court: "Maintenance",
    hint: "SAV — contrôles, dérives constatées",
    rail: "border-l-io-com",
    bordureActive: "border-io-com bg-io-com/10",
  },
};

export function formatDateFr(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("fr-FR");
}

/* --- Barre de progression ------------------------------------------------------ */

export function BarreProgression({
  fait,
  total,
  className,
  hauteur = "h-1",
}: {
  fait: number;
  total: number;
  className?: string;
  hauteur?: string;
}) {
  const pct = total > 0 ? Math.round((fait / total) * 100) : 0;
  const complet = total > 0 && fait >= total;
  return (
    <div className={cn("w-full overflow-hidden rounded-full bg-surface-3", hauteur, className)}>
      <div
        className={cn(
          "h-full rounded-full transition-[width] duration-300 ease-out",
          complet ? "bg-success" : "bg-brand",
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

/* --- Pastille de synchro compacte ------------------------------------------------ *
 * Toujours visible dans l'en-tête : un coup d'œil suffit pour savoir si tout est
 * à l'abri. Hors-ligne n'est PAS une erreur — le message rassure. */

export function SyncPill({
  online,
  pending,
  syncState,
  onSync,
}: {
  online: boolean;
  pending: number;
  syncState: SyncState;
  onSync: () => void;
}) {
  if (!online) {
    return (
      <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-io-di/10 px-2.5 py-1 text-xs font-semibold text-io-di">
        <CloudOff className="h-3.5 w-3.5" />
        Hors ligne
        {pending > 0 && <span className="tabular-nums">· {pending} ⏳</span>}
      </span>
    );
  }
  if (syncState === "syncing") {
    return (
      <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-brand/10 px-2.5 py-1 text-xs font-semibold text-brand">
        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
        Envoi…
      </span>
    );
  }
  if (syncState === "error") {
    return (
      <button
        type="button"
        onClick={onSync}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-danger/10 px-2.5 py-1 text-xs font-semibold text-danger"
      >
        <TriangleAlert className="h-3.5 w-3.5" />
        Échec — réessayer
      </button>
    );
  }
  if (pending > 0) {
    return (
      <button
        type="button"
        onClick={onSync}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-brand/10 px-2.5 py-1 text-xs font-semibold text-brand"
      >
        <RefreshCw className="h-3.5 w-3.5" />
        <span className="tabular-nums">{pending} à envoyer</span>
      </button>
    );
  }
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-success/10 px-2.5 py-1 text-xs font-semibold text-success">
      <Check className="h-3.5 w-3.5" />À jour
    </span>
  );
}

export type SyncProps = {
  online: boolean;
  pending: number;
  syncState: SyncState;
  syncError?: string;
  onSync: () => void;
};
