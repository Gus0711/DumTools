"use client";

// Îlot de REMPLISSAGE (offline-first), refonte « terrain » — même langage que le
// builder, calibré pour le doigt : en-tête compact + pastille de synchro, RAIL de
// PROGRESSION à gauche des champs (le rail DIN devient une jauge qui se remplit),
// et barre d'action COLLÉE en bas (X/Y remplis + CTA). Réutilise le <Renderer/>
// partagé + la couche média. La réponse est figée en local (UUID client) puis
// synchronisée au retour réseau (hook useRemplissage). La page s'auto-met en
// cache (CACHE_PAGES) pour rouvrir hors-ligne. HTTPS requis pour le SW.

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  CloudOff,
  CloudUpload,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  TriangleAlert,
} from "lucide-react";
import { Button, Card } from "@/ui";
import { cn } from "@/lib/cn";
import { Renderer } from "./renderer";
import { champManquant, champVisible } from "./model";
import type { RefOption } from "./model";
import type { FormulaireDetail } from "./queries";
import { useRemplissage } from "@/lib/offline/use-formulaires";

export function Remplir({
  qui,
  formulaire,
  refAffaires,
}: {
  qui: string;
  formulaire: FormulaireDetail;
  refAffaires?: RefOption[];
}) {
  const {
    ready,
    online,
    pending,
    syncEtat,
    syncNow,
    valeurs,
    setValeur,
    media,
    aDesSaisies,
    repris,
    brouillonEnregistre,
    soumettre,
    viderBrouillon,
  } = useRemplissage({
    formulaireId: formulaire.id,
    formulaireVersion: formulaire.version,
    schema: formulaire.schema,
  });

  const [manquants, setManquants] = useState<Set<string>>(new Set());
  const [envoi, setEnvoi] = useState(false);
  const [envoye, setEnvoye] = useState(false);
  const [confirmVider, setConfirmVider] = useState(false);

  // --- progression (champs obligatoires VISIBLES renseignés) ---
  const requis = formulaire.schema.filter(
    (c) => c.requis && champVisible(c, valeurs),
  );
  const total = requis.length;
  const fait = requis.filter(
    (c) => !champManquant(c, valeurs[c.id] ?? null),
  ).length;
  const pct = total > 0 ? Math.round((fait / total) * 100) : aDesSaisies ? 100 : 0;
  const complet = total > 0 && fait === total;

  // Met la page en cache pour l'ouvrir hors-ligne (le SW ne l'intercepte
  // qu'après activation → on la lui demande explicitement).
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.ready
      .then((reg) =>
        reg.active?.postMessage({
          type: "CACHE_PAGES",
          urls: [window.location.pathname],
        }),
      )
      .catch(() => {});
  }, []);

  // Garde anti-perte : prévient avant de quitter avec une saisie en cours.
  useEffect(() => {
    const onAvant = (e: BeforeUnloadEvent) => {
      if (aDesSaisies) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", onAvant);
    return () => window.removeEventListener("beforeunload", onAvant);
  }, [aDesSaisies]);

  async function envoyer() {
    const manque = new Set(
      formulaire.schema
        .filter(
          (c) =>
            champVisible(c, valeurs) && champManquant(c, valeurs[c.id] ?? null),
        )
        .map((c) => c.id),
    );
    if (manque.size > 0) {
      setManquants(manque);
      // Amène le premier champ manquant à l'écran.
      const premier = formulaire.schema.find((c) => manque.has(c.id));
      if (premier)
        document
          .getElementById(`champ-${premier.id}`)
          ?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    setManquants(new Set());
    setEnvoi(true);
    try {
      await soumettre();
      setEnvoye(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } finally {
      setEnvoi(false);
    }
  }

  if (envoye) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-16 md:px-10">
        <Card className="flex flex-col items-center gap-4 p-10 text-center">
          <div className="anim-pop flex h-14 w-14 items-center justify-center rounded-full bg-success/12 text-success">
            <Check className="h-7 w-7" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-fg">Réponse enregistrée</h1>
            <p className="mt-1 text-sm text-muted">
              {online
                ? "Synchronisée avec le serveur."
                : "Conservée sur l'appareil — elle partira au retour du réseau."}
            </p>
          </div>
          <div className="mt-2 flex flex-wrap justify-center gap-2">
            <Button onClick={() => setEnvoye(false)}>
              <Plus className="h-4 w-4" /> Nouvelle réponse
            </Button>
            <Link
              href={`/perso/${qui}/formulaires`}
              className="inline-flex h-10 items-center gap-1.5 rounded-md border border-border bg-surface px-4 text-sm font-medium text-fg hover:bg-surface-2"
            >
              Mes formulaires
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  const aDesChamps = formulaire.schema.length > 0;

  return (
    <div className="pb-28">
      {/* ---- en-tête compact collant ---- */}
      <div className="sticky top-0 z-20 border-b border-border bg-page/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-5 py-2.5 md:px-10">
          <Link
            href={`/perso/${qui}/formulaires`}
            className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Mes formulaires</span>
          </Link>
          <BarreSync
            online={online}
            pending={pending}
            etat={syncEtat}
            onSync={syncNow}
          />
        </div>
      </div>

      <div className="mx-auto max-w-2xl px-5 py-6 md:px-10">
        <header className="mb-5">
          <h1 className="font-display text-2xl font-bold tracking-tight text-fg">
            {formulaire.nom}
          </h1>
          {formulaire.description && (
            <p className="mt-1 text-muted">{formulaire.description}</p>
          )}
        </header>

        {!formulaire.publie && (
          <div className="mb-4 flex items-center gap-2 rounded-md border border-border bg-surface-2 px-3 py-2 text-xs text-muted">
            <Pencil className="h-3.5 w-3.5" /> Brouillon — pense à le publier
            depuis l&apos;éditeur avant de le diffuser.
          </div>
        )}

        {(repris || (aDesSaisies && brouillonEnregistre)) && (
          <div className="mb-4 flex flex-wrap items-center gap-2 rounded-md border border-accent/30 bg-accent-soft/40 px-3 py-2 text-xs text-muted">
            <RotateCcw className="h-3.5 w-3.5 shrink-0 text-accent-strong" />
            <span>
              {repris
                ? "Brouillon repris — tu continues là où tu t'étais arrêté."
                : "Brouillon enregistré — tu peux fermer et revenir plus tard."}
            </span>
            {confirmVider ? (
              <span className="ml-auto flex items-center gap-1">
                <button
                  onClick={() => {
                    viderBrouillon();
                    setConfirmVider(false);
                    setManquants(new Set());
                  }}
                  className="rounded px-2 py-1 font-medium text-danger hover:bg-danger/10"
                >
                  Tout effacer
                </button>
                <button
                  onClick={() => setConfirmVider(false)}
                  className="rounded px-2 py-1 text-muted hover:bg-surface-2"
                >
                  Annuler
                </button>
              </span>
            ) : (
              <button
                onClick={() => setConfirmVider(true)}
                className="ml-auto rounded px-2 py-1 font-medium text-muted hover:bg-surface-2 hover:text-fg"
              >
                Recommencer à zéro
              </button>
            )}
          </div>
        )}

        {!aDesChamps ? (
          <Card className="flex flex-col items-center gap-3 border-dashed p-12 text-center">
            <p className="text-muted">
              Ce formulaire n&apos;a pas encore de champs.
            </p>
            <Link
              href={`/perso/${qui}/formulaires/${formulaire.id}/edit`}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-brand hover:underline"
            >
              <Pencil className="h-3.5 w-3.5" /> Ouvrir l&apos;éditeur
            </Link>
          </Card>
        ) : !ready ? (
          <Card className="flex items-center justify-center gap-2 p-12 text-sm text-muted">
            <Loader2 className="h-5 w-5 animate-spin" /> Chargement…
          </Card>
        ) : (
          <>
            {/* Carte des champs avec RAIL de progression à gauche. */}
            <Card className="relative overflow-hidden p-5 pl-6 md:p-6 md:pl-7">
              <div
                aria-hidden
                className="absolute inset-y-4 left-2.5 w-1 overflow-hidden rounded-full bg-surface-3"
              >
                <div
                  className={cn(
                    "w-full rounded-full transition-[height] duration-500",
                    complet ? "bg-success" : "bg-accent",
                  )}
                  style={{ height: `${pct}%` }}
                />
              </div>
              <Renderer
                schema={formulaire.schema}
                valeurs={valeurs}
                onChange={setValeur}
                manquants={manquants}
                media={media}
                refAffaires={refAffaires}
              />
            </Card>

            {manquants.size > 0 && (
              <p className="mt-3 flex items-center gap-1.5 text-sm text-danger">
                <TriangleAlert className="h-4 w-4" /> Complète les champs
                obligatoires signalés.
              </p>
            )}
          </>
        )}
      </div>

      {/* ---- barre d'action collée (progression + CTA) ---- */}
      {aDesChamps && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-page/90 backdrop-blur-md">
          <div className="mx-auto flex max-w-2xl items-center gap-4 px-5 py-3 md:px-10">
            <div className="min-w-0 flex-1">
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className="font-medium text-muted">
                  {total > 0 ? (
                    <>
                      <span className="tabular-nums text-fg">{fait}</span>/
                      <span className="tabular-nums">{total}</span> obligatoire
                      {total > 1 ? "s" : ""}
                    </>
                  ) : (
                    "Aucun champ obligatoire"
                  )}
                </span>
                {complet && (
                  <span className="inline-flex items-center gap-1 font-medium text-success">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Complet
                  </span>
                )}
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-surface-3">
                <div
                  className={cn(
                    "h-full rounded-full transition-[width] duration-500",
                    complet ? "bg-success" : "bg-accent",
                  )}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
            <Button onClick={envoyer} disabled={envoi || !ready} size="lg">
              {envoi ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Enregistrement…
                </>
              ) : (
                <>
                  <Check className="h-4 w-4" /> Enregistrer
                </>
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function BarreSync({
  online,
  pending,
  etat,
  onSync,
}: {
  online: boolean;
  pending: number;
  etat: "idle" | "syncing" | "synced" | "error";
  onSync: () => void;
}) {
  if (!online) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-2 px-2.5 py-1 text-xs font-medium text-muted">
        <CloudOff className="h-3.5 w-3.5" /> Hors-ligne
        {pending > 0 && <span className="text-subtle">· {pending} en attente</span>}
      </span>
    );
  }
  if (etat === "syncing") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-subtle">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Synchronisation…
      </span>
    );
  }
  if (pending > 0) {
    return (
      <button
        onClick={onSync}
        className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-1 text-xs font-medium text-fg hover:border-brand/40"
      >
        <CloudUpload className="h-3.5 w-3.5 text-brand" /> {pending} à envoyer
        <RefreshCw className="h-3 w-3 text-subtle" />
      </button>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-subtle">
      <CheckCircle2 className="h-3.5 w-3.5 text-success" /> À jour
    </span>
  );
}
