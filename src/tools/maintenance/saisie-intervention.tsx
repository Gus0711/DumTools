"use client";

import { useRef, useState } from "react";
import { Check, Loader2, X } from "lucide-react";
import { Button, Input } from "@/ui";
import { cn } from "@/lib/cn";
import { enregistrerIntervention } from "./actions";
import {
  NATURES,
  LIBELLE_NATURE,
  formatDuree,
  isoJour,
  parseDuree,
  type InterventionVue,
  type NatureIntervention,
  type SiteVue,
} from "./model";

/* La saisie d'une intervention — le geste qu'on fait cent fois.
 *
 * Il reste OUVERT en tête du bloc plutôt que caché derrière un bouton : noter
 * vingt minutes de téléassistance doit coûter moins cher que de ne pas les
 * noter, sinon elles ne le seront pas et le forfait mentira.
 *
 * ⚠️ LA DURÉE RÉAFFICHE CE QU'ELLE A COMPRIS. « 20 » vaut 20 minutes, « 1,5 »
 * vaut 1 h 30 (voir parseDuree) : cette règle n'est pas devinable, et ce n'est
 * pas elle qui protège de l'erreur — c'est l'écho en clair sous le champ.
 * ========================================================================== */

const CLASSE_CHAMP =
  "h-[var(--control-h)] w-full rounded-md border border-border bg-surface px-2.5 text-sm text-fg hover:border-brand/40 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20";

export interface ValeursIntervention {
  id?: string;
  date: string;
  nature: NatureIntervention;
  duree: string;
  motif: string;
  compteRendu: string;
  demandeur: string;
  siteId: string;
  intervenantId: string;
  horsForfait: boolean;
}

export function valeursDepuis(v: InterventionVue): ValeursIntervention {
  return {
    id: v.id,
    date: v.date,
    nature: v.nature,
    duree: formatDuree(v.dureeMin),
    motif: v.motif,
    compteRendu: v.compteRendu,
    demandeur: v.demandeur,
    siteId: v.siteId ?? "",
    intervenantId: v.intervenantId ?? "",
    horsForfait: v.horsForfait,
  };
}

export function valeursNeuves(moiId: string): ValeursIntervention {
  return {
    date: isoJour(new Date()),
    nature: "TELEASSISTANCE",
    duree: "",
    motif: "",
    compteRendu: "",
    demandeur: "",
    siteId: "",
    // On note presque toujours SA propre intervention. Le cas contraire reste
    // à un clic — même raison qu'une tâche qui s'assigne à son auteur.
    intervenantId: moiId,
    horsForfait: false,
  };
}

export function FormulaireIntervention({
  contratId,
  sites,
  intervenants,
  valeurs,
  onChange,
  onFini,
  onAnnuler,
  compact = false,
}: {
  contratId: string;
  sites: SiteVue[];
  intervenants: { id: string; nom: string }[];
  valeurs: ValeursIntervention;
  onChange: (v: ValeursIntervention) => void;
  /** Appelé après un enregistrement accepté. */
  onFini: () => void;
  /** Présent = mode édition : l'annulation referme la rangée. */
  onAnnuler?: () => void;
  compact?: boolean;
}) {
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  // Le repli s'ouvre d'emblée quand la ligne porte DÉJÀ un compte rendu ou un
  // demandeur : les laisser cachés sous « + compte rendu » ferait croire qu'une
  // modification les a perdus. Décidé au premier rendu (initialiseur paresseux)
  // et non dans un effet — un effet rejouerait un rendu pour rien, et le
  // referait à chaque remontage du formulaire.
  const [detail, setDetail] = useState(
    () => !!onAnnuler && !!(valeurs.compteRendu || valeurs.demandeur),
  );
  const champMotif = useRef<HTMLInputElement>(null);

  const minutes = parseDuree(valeurs.duree);
  const modifie = (p: Partial<ValeursIntervention>) => onChange({ ...valeurs, ...p });

  async function soumettre(e: React.FormEvent) {
    e.preventDefault();
    if (enCours) return;
    setErreur(null);

    if (!minutes) {
      setErreur("Durée non comprise — essaie « 20 », « 1h30 » ou « 1,5 ».");
      return;
    }
    if (!valeurs.motif.trim()) {
      setErreur("Le motif est nécessaire : c'est lui qu'on relit un an plus tard.");
      champMotif.current?.focus();
      return;
    }

    setEnCours(true);
    const r = await enregistrerIntervention({
      id: valeurs.id,
      contratId,
      date: valeurs.date,
      nature: valeurs.nature,
      dureeMin: minutes,
      motif: valeurs.motif,
      compteRendu: valeurs.compteRendu,
      demandeur: valeurs.demandeur,
      siteId: valeurs.siteId,
      intervenantId: valeurs.intervenantId,
      horsForfait: valeurs.horsForfait,
    });
    setEnCours(false);

    if (!r.ok) {
      setErreur(r.error);
      return;
    }
    onFini();
  }

  const actifs = sites.filter((s) => s.actif || s.id === valeurs.siteId);

  return (
    <form
      onSubmit={soumettre}
      className={cn(
        "grid gap-2.5 border-border-soft",
        compact ? "border-t bg-surface-2 px-3 py-3" : "border-b px-3 py-3 sm:px-4",
      )}
    >
      <div className="grid gap-2.5 sm:grid-cols-[auto_auto_auto_1fr] sm:items-end">
        <label className="grid gap-1">
          <span className="stamp">Date</span>
          <input
            type="date"
            value={valeurs.date}
            onChange={(e) => modifie({ date: e.target.value })}
            className={cn(CLASSE_CHAMP, "sm:w-[9.5rem]")}
            required
          />
        </label>

        <label className="grid gap-1">
          <span className="stamp">Nature</span>
          <select
            value={valeurs.nature}
            onChange={(e) => modifie({ nature: e.target.value as NatureIntervention })}
            className={cn(CLASSE_CHAMP, "sm:w-[10rem]")}
          >
            {NATURES.map((n) => (
              <option key={n} value={n}>
                {LIBELLE_NATURE[n]}
              </option>
            ))}
          </select>
        </label>

        <label className="grid gap-1">
          <span className="stamp">Durée</span>
          <Input
            value={valeurs.duree}
            onChange={(e) => modifie({ duree: e.target.value })}
            placeholder="20, 1h30, 1,5…"
            inputMode="text"
            aria-describedby="echo-duree"
            className={cn(
              "sm:w-[9rem]",
              valeurs.duree && !minutes && "border-danger focus:border-danger",
            )}
          />
        </label>

        {/* L'écho : ce que l'outil a compris, en toutes lettres. C'est lui qui
            empêche « 2 » de passer pour deux heures. */}
        <p
          id="echo-duree"
          aria-live="polite"
          className={cn(
            "self-end pb-2 text-xs sm:pb-2.5",
            minutes ? "text-muted" : valeurs.duree ? "text-danger" : "text-subtle",
          )}
        >
          {minutes
            ? `soit ${formatDuree(minutes)}`
            : valeurs.duree
              ? "durée non comprise"
              : "« 20 » = 20 min · « 1,5 » = 1 h 30"}
        </p>
      </div>

      <div className="grid gap-2.5 sm:grid-cols-[1fr_auto_auto]">
        <label className="grid gap-1">
          <span className="stamp">Motif</span>
          <Input
            ref={champMotif}
            value={valeurs.motif}
            onChange={(e) => modifie({ motif: e.target.value })}
            placeholder="Redémarrage automate, défaut sonde, mise à jour planning…"
          />
        </label>

        <label className="grid gap-1">
          <span className="stamp">Site</span>
          <select
            value={valeurs.siteId}
            onChange={(e) => modifie({ siteId: e.target.value })}
            className={cn(CLASSE_CHAMP, "sm:w-[13rem]")}
          >
            <option value="">— tout le contrat —</option>
            {actifs.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nom}
              </option>
            ))}
          </select>
        </label>

        <label className="grid gap-1">
          <span className="stamp">Intervenant</span>
          <select
            value={valeurs.intervenantId}
            onChange={(e) => modifie({ intervenantId: e.target.value })}
            className={cn(CLASSE_CHAMP, "sm:w-[11rem]")}
          >
            <option value="">— non renseigné —</option>
            {intervenants.map((u) => (
              <option key={u.id} value={u.id}>
                {u.nom}
              </option>
            ))}
          </select>
        </label>
      </div>

      {detail && (
        <div className="grid gap-2.5 sm:grid-cols-[1fr_auto]">
          <label className="grid gap-1">
            <span className="stamp">Compte rendu</span>
            <textarea
              value={valeurs.compteRendu}
              onChange={(e) => modifie({ compteRendu: e.target.value })}
              rows={2}
              placeholder="Ce qui a été fait, ce qu'il reste à faire."
              className="w-full resize-y rounded-md border border-border bg-surface px-2.5 py-2 text-sm text-fg hover:border-brand/40 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
            />
          </label>
          <label className="grid gap-1">
            <span className="stamp">Demandeur</span>
            <Input
              value={valeurs.demandeur}
              onChange={(e) => modifie({ demandeur: e.target.value })}
              placeholder="Qui a appelé"
              className="sm:w-[13rem]"
            />
          </label>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {!detail && (
          <button
            type="button"
            onClick={() => setDetail(true)}
            className="text-xs text-muted underline decoration-dotted underline-offset-4 hover:text-fg"
          >
            + compte rendu, demandeur
          </button>
        )}

        <label
          className="flex cursor-pointer items-center gap-2 text-sm text-muted"
          title="Ce motif n'est pas couvert par le contrat : le temps ne consomme aucun forfait et part directement en refacturation."
        >
          <input
            type="checkbox"
            checked={valeurs.horsForfait}
            onChange={(e) => modifie({ horsForfait: e.target.checked })}
            className="h-4 w-4 accent-[var(--brand)]"
          />
          Hors contrat
        </label>

        <div className="ml-auto flex items-center gap-2">
          {onAnnuler && (
            <Button type="button" variant="ghost" size="sm" onClick={onAnnuler}>
              <X className="h-4 w-4" /> Annuler
            </Button>
          )}
          <Button type="submit" size="sm" disabled={enCours}>
            {enCours ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Check className="h-4 w-4" />
            )}
            {valeurs.id ? "Enregistrer" : "Ajouter"}
          </Button>
        </div>
      </div>

      {erreur && (
        <p role="alert" className="text-sm text-danger">
          {erreur}
        </p>
      )}
    </form>
  );
}
