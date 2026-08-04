"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Ban, Check, Clock, Copy, ExternalLink, Globe, Loader2, Share2 } from "lucide-react";
import { Button } from "@/ui";
import {
  dateEcheance,
  libelleEcheance,
  partageActif,
  type DureePartage,
} from "./model";

/**
 * Panneau de partage public d'un document — commun aux Notes et au Wiki.
 *
 * L'outil fournit ses trois actions et ses durées ; le panneau ne connaît ni
 * l'un ni l'autre modèle. C'est volontaire : les règles (échéance obligatoire
 * ou non, durées offertes) sont tenues côté serveur, où elles ne peuvent pas
 * être contournées — ici on ne fait qu'offrir les bons boutons.
 *
 * La révocation se confirme en deux temps, dans le même volet : c'est la seule
 * action irréversible du lot (le lien distribué meurt pour tout le monde).
 */

export interface ActionsPartage {
  /** Pose un jeton pour la durée choisie. */
  generer(dureeId: string): Promise<{ jeton: string; expireLe: string | null }>;
  /** Repousse l'échéance sans changer le jeton (le lien distribué survit). */
  prolonger(dureeId: string): Promise<{ expireLe: string | null }>;
  /** Coupe le lien immédiatement. */
  revoquer(): Promise<void>;
}

export interface PanneauPartageProps {
  /** Racine de l'URL publique, sans le jeton : "/n/" ou "/w/". */
  baseUrl: string;
  jetonInitial: string | null;
  /** ISO, ou null pour « sans échéance ». */
  expireLeInitial: string | null;
  durees: DureePartage[];
  /** Durée présélectionnée à l'ouverture (id d'une entrée de `durees`). */
  dureeParDefaut: string;
  actions: ActionsPartage;
  /** Le mot juste dans les phrases : « cette note », « cette page ». */
  libelleDocument: string;
  /** Phrase d'accroche quand rien n'est encore partagé. */
  accroche: string;
}

export function PanneauPartage({
  baseUrl,
  jetonInitial,
  expireLeInitial,
  durees,
  dureeParDefaut,
  actions,
  libelleDocument,
  accroche,
}: PanneauPartageProps) {
  const [jeton, setJeton] = useState(jetonInitial);
  const [expireLe, setExpireLe] = useState<string | null>(expireLeInitial);
  const [dureeId, setDureeId] = useState(dureeParDefaut);
  const [open, setOpen] = useState(false);
  const [copie, setCopie] = useState(false);
  const [confirmeRevocation, setConfirmeRevocation] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const fermer = () => {
      setOpen(false);
      setConfirmeRevocation(false);
      setErreur(null);
    };
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) fermer();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") fermer();
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const echeance = expireLe ? new Date(expireLe) : null;
  // Le serveur refuse déjà un jeton échu ; on refait le test ici pour ne pas
  // présenter comme « actif » un lien que le lecteur trouverait mort.
  const actif = partageActif({ jetonPartage: jeton, partageExpireLe: echeance });
  const echu = !!jeton && !actif;

  const url = jeton ? `${typeof window === "undefined" ? "" : window.location.origin}${baseUrl}${jeton}` : "";

  async function copier() {
    try {
      await navigator.clipboard.writeText(url);
      setCopie(true);
      setTimeout(() => setCopie(false), 1800);
    } catch {
      /* presse-papier indisponible : l'input reste sélectionnable à la main */
    }
  }

  /** Enrobe une action serveur : remet l'erreur à zéro, la rattrape et
   *  l'affiche dans le volet plutôt que de laisser planter la transition. */
  function lancer(travail: () => Promise<void>) {
    setErreur(null);
    start(async () => {
      try {
        await travail();
      } catch (e) {
        setErreur(e instanceof Error ? e.message : "L'opération a échoué");
      }
    });
  }

  const SelecteurDuree = (
    <label className="mb-2 flex items-center gap-2 text-xs text-muted">
      <Clock className="h-3.5 w-3.5 shrink-0 text-subtle" />
      <span className="shrink-0">Durée</span>
      <select
        value={dureeId}
        onChange={(e) => setDureeId(e.target.value)}
        aria-label="Durée du partage"
        className="min-w-0 flex-1 rounded-md border border-border bg-surface-2 px-2 py-1 text-xs text-fg outline-none"
      >
        {durees.map((d) => (
          <option key={d.id} value={d.id}>
            {d.libelle}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <div ref={ref} className="relative">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => {
          setOpen((o) => !o);
          setConfirmeRevocation(false);
          setErreur(null);
        }}
        aria-expanded={open}
      >
        {actif ? (
          <Globe className="h-4 w-4 text-success" />
        ) : echu ? (
          <Clock className="h-4 w-4 text-warning" />
        ) : (
          <Share2 className="h-4 w-4" />
        )}
        <span className="hidden sm:inline">{actif ? "Partagé" : echu ? "Expiré" : "Partager"}</span>
      </Button>

      {open && (
        <div className="anim-note-pop absolute right-0 z-40 mt-2 w-[min(24rem,calc(100vw-2rem))] rounded-lg border border-border bg-surface p-3 shadow-lg">
          <div className="mb-2 flex items-center gap-2">
            <p className="font-display text-[0.68rem] font-semibold uppercase tracking-[0.06em] text-muted">
              Partage public
            </p>
            <span
              className={`ml-auto inline-flex items-center gap-1.5 text-xs font-medium ${
                actif ? "text-success" : echu ? "text-warning" : "text-subtle"
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  actif ? "bg-success" : echu ? "bg-warning" : "bg-border"
                }`}
              />
              {actif ? "Lien actif" : echu ? "Lien expiré" : "Privé"}
            </span>
          </div>

          {erreur && (
            <p className="mb-2 rounded-md border border-danger/40 bg-danger/10 px-2 py-1.5 text-xs text-danger">
              {erreur}
            </p>
          )}

          {jeton ? (
            <>
              <p className="mb-2 text-xs text-muted">
                {actif ? (
                  <>
                    Toute personne disposant de ce lien peut <strong>lire</strong> {libelleDocument},
                    sans se connecter — y compris depuis l&apos;extérieur de l&apos;entreprise.
                  </>
                ) : (
                  <>
                    Ce lien ne fonctionne plus. Le prolonger le réactive{" "}
                    <strong>à la même adresse</strong> : personne n&apos;a besoin d&apos;en recevoir
                    une nouvelle.
                  </>
                )}
              </p>

              {echeance && (
                <p
                  className={`mb-2 flex items-center gap-1.5 text-xs ${
                    actif ? "text-subtle" : "text-warning"
                  }`}
                  title={dateEcheance(echeance)}
                >
                  <Clock className="h-3.5 w-3.5 shrink-0" />
                  {libelleEcheance(echeance)} — {dateEcheance(echeance)}
                </p>
              )}

              <div className="mb-2 flex items-center gap-1.5">
                <input
                  readOnly
                  value={url}
                  onFocus={(e) => e.target.select()}
                  aria-label="Lien public du document"
                  className="min-w-0 flex-1 rounded-md border border-border bg-surface-2 px-2 py-1.5 font-mono text-xs text-fg outline-none"
                />
                <Button type="button" variant="outline" size="sm" onClick={copier}>
                  {copie ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
                  {copie ? "Copié !" : "Copier"}
                </Button>
              </div>

              {confirmeRevocation ? (
                <div className="rounded-md border border-danger/40 bg-danger/10 p-2">
                  <p className="mb-2 text-xs text-danger">
                    Le lien cessera de fonctionner immédiatement, pour tous ceux qui l&apos;ont
                    reçu.
                  </p>
                  <div className="flex items-center justify-end gap-1.5">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setConfirmeRevocation(false)}
                    >
                      Annuler
                    </Button>
                    <Button
                      type="button"
                      variant="danger"
                      size="sm"
                      disabled={pending}
                      onClick={() =>
                        lancer(async () => {
                          await actions.revoquer();
                          setJeton(null);
                          setExpireLe(null);
                          setConfirmeRevocation(false);
                        })
                      }
                    >
                      {pending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Ban className="h-4 w-4" />
                      )}
                      Révoquer
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="mb-2 border-t border-border-soft pt-2">
                    {SelecteurDuree}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={pending}
                      onClick={() =>
                        lancer(async () => {
                          const r = await actions.prolonger(dureeId);
                          setExpireLe(r.expireLe);
                        })
                      }
                    >
                      {pending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Clock className="h-4 w-4" />
                      )}
                      {echu ? "Réactiver le lien" : "Prolonger"}
                    </Button>
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <a
                      href={url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium text-muted transition-colors hover:bg-surface-2 hover:text-fg"
                    >
                      <ExternalLink className="h-3.5 w-3.5" /> Ouvrir la vue publique
                    </a>
                    <button
                      type="button"
                      onClick={() => setConfirmeRevocation(true)}
                      className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium text-danger transition-colors hover:bg-danger/10"
                    >
                      <Ban className="h-3.5 w-3.5" /> Révoquer le lien
                    </button>
                  </div>
                </>
              )}
            </>
          ) : (
            <>
              <p className="mb-2.5 text-xs text-muted">{accroche}</p>
              {SelecteurDuree}
              <Button
                type="button"
                size="sm"
                disabled={pending}
                onClick={() =>
                  lancer(async () => {
                    const r = await actions.generer(dureeId);
                    setJeton(r.jeton);
                    setExpireLe(r.expireLe);
                  })
                }
              >
                {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Globe className="h-4 w-4" />}
                Créer le lien public
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
