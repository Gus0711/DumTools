"use client";

// Renderer PARTAGÉ d'un formulaire : rend chaque champ avec son widget, à partir
// d'un schéma (ChampDef[]) + un dictionnaire de valeurs. Utilisé à l'identique
// par l'APERÇU du builder et par le REMPLISSAGE terrain → « ce que tu construis
// est exactement ce qui sera rempli ». Aucune dépendance au builder ni au
// serveur : juste (schema, valeurs, onChange).

import { useState } from "react";
import {
  Asterisk,
  LocateFixed,
  Loader2,
  Camera,
  PenLine,
  Paperclip,
  Minus,
  Plus,
  Mic,
  PenTool,
  ScanLine,
  Briefcase,
  Calculator,
  MapPin,
  Navigation,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { Input } from "@/ui";
import { PhotoWidget, SignatureWidget, PieceJointeWidget } from "./media-widgets";
import type { RendererMedia } from "./media-widgets";
import {
  AudioWidget,
  DessinWidget,
  ScanCodeWidget,
  ReferenceWidget,
} from "./terrain-widgets";
import {
  champVisible,
  estPresentation,
  lienGoogleMaps,
  lienWaze,
  valeurVide,
} from "./model";
import type {
  ChampDef,
  PositionGps,
  RefOption,
  RefValue,
  SchemaFormulaire,
  ValeurChamp,
} from "./model";

const CHAMP_CTRL =
  "w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-fg " +
  "shadow-sm transition-[border-color,box-shadow] duration-150 " +
  "hover:border-brand/40 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20 " +
  "placeholder:text-subtle disabled:opacity-60";

export interface RendererProps {
  schema: SchemaFormulaire;
  valeurs: Record<string, ValeurChamp>;
  onChange: (champId: string, valeur: ValeurChamp) => void;
  /** Ids des champs requis non renseignés, à signaler en rouge. */
  manquants?: Set<string>;
  /** Couche média (remplissage terrain). Absente = aperçu → placeholder. */
  media?: RendererMedia;
  /** Affaires proposées aux champs « référence » (remplissage). */
  refAffaires?: RefOption[];
}

export function Renderer({
  schema,
  valeurs,
  onChange,
  manquants,
  media,
  refAffaires,
}: RendererProps) {
  return (
    <div className="space-y-6">
      {schema
        .filter((champ) => champVisible(champ, valeurs))
        .map((champ) => (
          <ChampBloc
            key={champ.id}
            champ={champ}
            valeur={valeurs[champ.id] ?? null}
            onChange={(v) => onChange(champ.id, v)}
            manquant={manquants?.has(champ.id) ?? false}
            media={media}
            refAffaires={refAffaires}
          />
        ))}
    </div>
  );
}

function ChampBloc({
  champ,
  valeur,
  onChange,
  manquant,
  media,
  refAffaires,
}: {
  champ: ChampDef;
  valeur: ValeurChamp;
  onChange: (v: ValeurChamp) => void;
  manquant: boolean;
  media?: RendererMedia;
  refAffaires?: RefOption[];
}) {
  if (estPresentation(champ.type)) return <Presentation champ={champ} />;
  return (
    <div id={`champ-${champ.id}`} className="scroll-mt-20">
      <div className="mb-1.5 flex items-baseline gap-1">
        <span className="text-sm font-medium text-fg">
          {champ.libelle || <span className="text-subtle">Sans libellé</span>}
        </span>
        {champ.requis && (
          <Asterisk className="h-3 w-3 text-danger" aria-label="obligatoire" />
        )}
      </div>
      {champ.aide && (
        <p className="mb-2 text-xs text-muted">{champ.aide}</p>
      )}

      <Controle
        champ={champ}
        valeur={valeur}
        onChange={onChange}
        media={media}
        refAffaires={refAffaires}
      />

      {manquant && (
        <p className="mt-1.5 text-xs font-medium text-danger">
          Ce champ est obligatoire.
        </p>
      )}
    </div>
  );
}

function Presentation({ champ }: { champ: ChampDef }) {
  switch (champ.type) {
    case "separateur":
      return champ.libelle ? (
        <div className="flex items-center gap-3 pt-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-subtle">
            {champ.libelle}
          </span>
          <span className="h-px flex-1 bg-border" />
        </div>
      ) : (
        <hr className="border-border" />
      );

    case "texteFixe":
      return (
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted">
          {champ.contenuFixe}
        </p>
      );

    case "imageFixe":
      return champ.imageData ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={champ.imageData}
          alt={champ.libelle || "Image"}
          className="max-h-64 rounded-md border border-border"
        />
      ) : (
        <div className="rounded-md border border-dashed border-border bg-surface-2 px-4 py-6 text-center text-sm text-subtle">
          Aucune image
        </div>
      );

    default:
      return null;
  }
}

function Controle({
  champ,
  valeur,
  onChange,
  media,
  refAffaires,
}: {
  champ: ChampDef;
  valeur: ValeurChamp;
  onChange: (v: ValeurChamp) => void;
  media?: RendererMedia;
  refAffaires?: RefOption[];
}) {
  const idsMedias = Array.isArray(valeur) ? (valeur as string[]) : [];
  switch (champ.type) {
    case "texte":
      return (
        <Input
          value={(valeur as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
        />
      );

    case "texteLong":
      return (
        <textarea
          rows={4}
          className={cn(CHAMP_CTRL, "resize-y leading-relaxed")}
          value={(valeur as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
        />
      );

    case "nombre":
      return (
        <Input
          type="number"
          inputMode="decimal"
          value={valeur == null ? "" : String(valeur)}
          onChange={(e) =>
            onChange(e.target.value === "" ? null : Number(e.target.value))
          }
        />
      );

    case "date":
      return (
        <Input
          type="date"
          className="w-auto"
          value={(valeur as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
        />
      );

    case "dateHeure":
      return (
        <Input
          type="datetime-local"
          className="w-auto"
          value={(valeur as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
        />
      );

    case "slider": {
      const min = champ.min ?? 0;
      const max = champ.max ?? 100;
      const pas = champ.pas ?? 1;
      const v = typeof valeur === "number" ? valeur : min;
      return (
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={min}
            max={max}
            step={pas}
            value={v}
            onChange={(e) => onChange(Number(e.target.value))}
            className="h-2 flex-1 cursor-pointer accent-brand"
          />
          <span className="w-12 text-right text-sm font-semibold tabular-nums text-fg">
            {v}
          </span>
        </div>
      );
    }

    case "compteur": {
      const min = champ.min ?? 0;
      const max = champ.max;
      const pas = champ.pas ?? 1;
      const v = typeof valeur === "number" ? valeur : min;
      const borne = (n: number) =>
        Math.max(min, max != null ? Math.min(max, n) : n);
      return (
        <div className="inline-flex items-center gap-1">
          <button
            type="button"
            onClick={() => onChange(borne(v - pas))}
            className="flex h-9 w-9 items-center justify-center rounded-md border border-border bg-surface text-fg hover:border-brand/40 disabled:opacity-40"
            disabled={v <= min}
          >
            <Minus className="h-4 w-4" />
          </button>
          <span className="w-12 text-center text-base font-semibold tabular-nums text-fg">
            {v}
          </span>
          <button
            type="button"
            onClick={() => onChange(borne(v + pas))}
            className="flex h-9 w-9 items-center justify-center rounded-md border border-border bg-surface text-fg hover:border-brand/40 disabled:opacity-40"
            disabled={max != null && v >= max}
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      );
    }

    case "liste": {
      const options = champ.options ?? [];
      return (
        <select
          className={cn(CHAMP_CTRL, "w-auto min-w-52")}
          value={(valeur as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">— Choisir —</option>
          {options.map((o, i) => (
            <option key={i} value={o}>
              {o}
            </option>
          ))}
        </select>
      );
    }

    case "case":
      return <Bascule on={valeur === true} onToggle={() => onChange(!(valeur === true))} />;

    case "choix":
      return <Choix champ={champ} valeur={valeur} onChange={onChange} />;

    case "gps":
      return <Gps valeur={valeur as PositionGps | null} onChange={onChange} />;

    case "photo":
      return media ? (
        <PhotoWidget
          champId={champ.id}
          ids={idsMedias}
          onChange={(ids) => onChange(ids)}
          media={media}
        />
      ) : (
        <CaptureAVenir
          icon={Camera}
          texte="Aperçu — la prise de photos se fait au remplissage."
        />
      );

    case "signature":
      return media ? (
        <SignatureWidget
          champId={champ.id}
          ids={idsMedias}
          onChange={(ids) => onChange(ids)}
          media={media}
        />
      ) : (
        <CaptureAVenir
          icon={PenLine}
          texte="Aperçu — la signature se fait au remplissage."
        />
      );

    case "pieceJointe":
      return media ? (
        <PieceJointeWidget
          champId={champ.id}
          ids={idsMedias}
          onChange={(ids) => onChange(ids)}
          media={media}
        />
      ) : (
        <CaptureAVenir
          icon={Paperclip}
          texte="Aperçu — les pièces jointes s'ajoutent au remplissage."
        />
      );

    case "audio":
      return media ? (
        <AudioWidget
          champId={champ.id}
          ids={idsMedias}
          onChange={(ids) => onChange(ids)}
          media={media}
        />
      ) : (
        <CaptureAVenir
          icon={Mic}
          texte="Aperçu — l'enregistrement se fait au remplissage."
        />
      );

    case "dessin":
      return media ? (
        <DessinWidget
          champId={champ.id}
          ids={idsMedias}
          onChange={(ids) => onChange(ids)}
          media={media}
        />
      ) : (
        <CaptureAVenir
          icon={PenTool}
          texte="Aperçu — le dessin se fait au remplissage."
        />
      );

    case "schema":
      return media ? (
        <DessinWidget
          champId={champ.id}
          ids={idsMedias}
          onChange={(ids) => onChange(ids)}
          media={media}
          fond={champ.imageData}
        />
      ) : (
        <CaptureAVenir
          icon={PenTool}
          texte="Aperçu — l'annotation du plan se fait au remplissage."
        />
      );

    case "codeBarre":
      return media ? (
        <ScanCodeWidget
          valeur={typeof valeur === "string" ? valeur : ""}
          onChange={(v) => onChange(v)}
        />
      ) : (
        <CaptureAVenir
          icon={ScanLine}
          texte="Aperçu — le scan se fait au remplissage."
        />
      );

    case "reference":
      return refAffaires ? (
        <ReferenceWidget
          valeur={(valeur as RefValue | null) ?? null}
          onChange={onChange}
          affaires={refAffaires}
        />
      ) : (
        <CaptureAVenir
          icon={Briefcase}
          texte="Aperçu — le lien vers une affaire se fait au remplissage."
        />
      );

    case "calcul": {
      const affiche = valeur == null || valeur === "" ? "—" : String(valeur);
      const vide = affiche === "—";
      return (
        <div
          className={cn(
            "inline-flex items-center gap-2 rounded-md border px-3 py-2",
            vide
              ? "border-border bg-surface-2"
              : "border-accent/30 bg-accent-soft/50",
          )}
        >
          <Calculator
            className={cn("h-4 w-4", vide ? "text-subtle" : "text-accent-strong")}
          />
          {/* La clé sur la valeur rejoue `anim-pop` à chaque recalcul → le
              résultat « clignote » discrètement pour signaler qu'il a changé. */}
          <span
            key={affiche}
            className={cn(
              "text-sm font-semibold tabular-nums",
              vide ? "text-fg" : "anim-pop text-accent-strong",
            )}
          >
            {affiche}
          </span>
        </div>
      );
    }

    default:
      return null; // types de présentation (traités en amont)
  }
}

function Bascule({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onToggle}
      className="inline-flex items-center gap-2.5"
    >
      <span
        className={cn(
          "inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-150",
          on ? "bg-brand" : "border border-border bg-surface-3",
        )}
      >
        <span
          className={cn(
            "h-5 w-5 rounded-full bg-surface shadow-sm transition-transform duration-150",
            on ? "translate-x-5" : "translate-x-0.5",
          )}
        />
      </span>
      <span className="text-sm text-muted">{on ? "Oui" : "Non"}</span>
    </button>
  );
}

function Choix({
  champ,
  valeur,
  onChange,
}: {
  champ: ChampDef;
  valeur: ValeurChamp;
  onChange: (v: ValeurChamp) => void;
}) {
  const options = champ.options ?? [];
  const multiple = champ.multiple === true;
  const selection = multiple
    ? new Set(Array.isArray(valeur) ? (valeur as string[]) : [])
    : null;

  function basculer(opt: string) {
    if (multiple) {
      const suivant = new Set(selection);
      if (suivant.has(opt)) suivant.delete(opt);
      else suivant.add(opt);
      onChange([...suivant]);
    } else {
      onChange(valeur === opt ? "" : opt);
    }
  }

  if (options.length === 0) {
    return <p className="text-sm text-subtle">Aucune option définie.</p>;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt, i) => {
        const actif = multiple ? selection!.has(opt) : valeur === opt;
        return (
          <button
            key={i}
            type="button"
            onClick={() => basculer(opt)}
            className={cn(
              "rounded-full border px-3.5 py-1.5 text-sm transition-colors duration-150",
              actif
                ? "border-brand bg-brand-soft font-medium text-brand"
                : "border-border bg-surface text-fg hover:border-brand/40",
            )}
          >
            {opt}
          </button>
        );
      })}
    </div>
  );
}

function Gps({
  valeur,
  onChange,
}: {
  valeur: PositionGps | null;
  onChange: (v: ValeurChamp) => void;
}) {
  const [etat, setEtat] = useState<"idle" | "charge" | "erreur">("idle");

  function capter() {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setEtat("erreur");
      return;
    }
    setEtat("charge");
    navigator.geolocation.getCurrentPosition(
      (p) => {
        onChange({
          lat: p.coords.latitude,
          lng: p.coords.longitude,
          acc: p.coords.accuracy,
        });
        setEtat("idle");
      },
      () => setEtat("erreur"),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={capter}
        disabled={etat === "charge"}
        className={cn(
          "inline-flex h-10 items-center gap-2 rounded-md border border-border bg-surface px-3.5 text-sm font-medium text-fg",
          "shadow-sm transition-colors hover:border-brand/40 disabled:opacity-60",
        )}
      >
        {etat === "charge" ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <LocateFixed className="h-4 w-4 text-brand" />
        )}
        {valeur ? "Actualiser la position" : "Récupérer ma position"}
      </button>

      {valeur && (
        <div className="space-y-1.5">
          <p className="text-sm tabular-nums text-muted">
            {valeur.lat.toFixed(5)}, {valeur.lng.toFixed(5)}
            {valeur.acc != null && (
              <span className="text-subtle"> · ±{Math.round(valeur.acc)} m</span>
            )}
          </p>
          <div className="flex flex-wrap gap-2">
            <a
              href={lienGoogleMaps(valeur.lat, valeur.lng)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-md border border-border bg-surface px-2 py-1 text-xs font-medium text-fg hover:border-brand/40"
            >
              <MapPin className="h-3.5 w-3.5 text-brand" /> Google Maps
            </a>
            <a
              href={lienWaze(valeur.lat, valeur.lng)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-md border border-border bg-surface px-2 py-1 text-xs font-medium text-fg hover:border-brand/40"
            >
              <Navigation className="h-3.5 w-3.5 text-brand" /> Waze
            </a>
          </div>
        </div>
      )}
      {etat === "erreur" && (
        <p className="text-xs text-danger">
          Position indisponible (autorisation refusée ou signal absent).
        </p>
      )}
    </div>
  );
}

/**
 * Aperçu NON interactif d'un seul champ — utilisé par les cartes du builder pour
 * un canevas vraiment WYSIWYG : « ce que tu montes est exactement ce que verra
 * la personne qui remplit ». Rendu figé (pointer-events coupés), sans média.
 */
export function ApercuControle({ champ }: { champ: ChampDef }) {
  if (estPresentation(champ.type)) return <Presentation champ={champ} />;
  return (
    <div className="pointer-events-none select-none">
      <Controle champ={champ} valeur={valeurVide(champ)} onChange={() => {}} />
    </div>
  );
}

function CaptureAVenir({
  icon: Icon,
  texte,
}: {
  icon: typeof Camera;
  texte: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-md border border-dashed border-border bg-surface-2 px-4 py-3 text-sm text-muted">
      <Icon className="h-5 w-5 shrink-0 text-subtle" />
      {texte}
    </div>
  );
}
