"use client";

import { CloudOff, RefreshCw, Check, CircleAlert } from "lucide-react";
import { cn } from "@/lib/cn";
import type { SyncState } from "@/lib/offline/use-mise-en-service";

/**
 * Bandeau d'état de synchro pour les îlots local-first (mise en service, et
 * demain les visites). Un outil terrain doit MONTRER ce qui n'est pas encore
 * sauvé — jamais laisser croire que c'est parti alors que la file est pleine.
 */
export function SyncIndicator({
  online,
  pending,
  syncState,
  syncError,
  onSync,
}: {
  online: boolean;
  pending: number;
  syncState: SyncState;
  syncError?: string;
  onSync: () => void;
}) {
  const offline = !online;
  const tone = offline
    ? "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300"
    : pending > 0 || syncState === "error"
      ? "border-brand/40 bg-brand/10 text-brand"
      : "border-success/40 bg-success/10 text-success";

  return (
    <div
      className={cn(
        "mb-3 flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-sm",
        tone,
      )}
    >
      {offline ? (
        <>
          <CloudOff className="h-4 w-4 shrink-0" />
          <span className="font-medium">Hors-ligne</span>
          <span className="opacity-90">
            {pending > 0
              ? `— ${pending} modification${pending > 1 ? "s" : ""} en attente ⏳`
              : "— les saisies seront synchronisées au retour du réseau"}
          </span>
        </>
      ) : syncState === "syncing" ? (
        <>
          <RefreshCw className="h-4 w-4 shrink-0 animate-spin" />
          <span className="font-medium">Synchronisation…</span>
        </>
      ) : syncState === "error" ? (
        <>
          <CircleAlert className="h-4 w-4 shrink-0" />
          <span className="font-medium">Échec de synchro</span>
          <span className="opacity-90 truncate">
            {syncError ? `— ${syncError}` : "— la file est conservée, réessayez"}
          </span>
        </>
      ) : pending > 0 ? (
        <>
          <RefreshCw className="h-4 w-4 shrink-0" />
          <span className="font-medium">{pending} en attente</span>
        </>
      ) : (
        <>
          <Check className="h-4 w-4 shrink-0" />
          <span className="font-medium">À jour</span>
        </>
      )}

      {(pending > 0 || syncState === "error") && online && (
        <button
          type="button"
          onClick={onSync}
          disabled={syncState === "syncing"}
          className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-current/30 px-2.5 py-1 text-xs font-semibold transition-opacity hover:opacity-80 disabled:opacity-50"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", syncState === "syncing" && "animate-spin")} />
          Synchroniser
        </button>
      )}
    </div>
  );
}
