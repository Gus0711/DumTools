import { Headset, MapPin } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  LIBELLE_NATURE,
  LIBELLE_NATURE_COURT,
  SEUIL_ALERTE_FORFAIT,
  formatDuree,
  pourcentConsomme,
  totalHorsForfaitMin,
  type CauseHorsForfait,
  type ConsommationNature,
  type NatureIntervention,
} from "./model";

/* La lecture du forfait — un seul endroit où l'on décide à quoi il ressemble,
 * pour que la liste, la fiche et le récapitulatif ne puissent pas diverger.
 *
 * ⚠️ La couleur ne porte jamais l'information seule : chaque barre est doublée
 * du chiffre en clair (« 6 h 30 / 10 h ») et d'un mot (« reste 3 h 30 »,
 * « dépassement 2 h »). Un forfait épuisé doit se lire en noir et blanc.
 * ========================================================================== */

export const ICONE_NATURE: Record<
  NatureIntervention,
  typeof Headset
> = {
  TELEASSISTANCE: Headset,
  PRESENTIEL: MapPin,
};

/** L'étiquette d'une nature — icône + mot, jamais l'un sans l'autre. */
export function PastilleNature({
  nature,
  court = false,
  className,
}: {
  nature: NatureIntervention;
  court?: boolean;
  className?: string;
}) {
  const Icone = ICONE_NATURE[nature];
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap", className)}>
      <Icone className="h-3.5 w-3.5 shrink-0 text-muted" aria-hidden />
      {court ? LIBELLE_NATURE_COURT[nature] : LIBELLE_NATURE[nature]}
    </span>
  );
}

/** Le ton d'un forfait : vert tant qu'il respire, ambre quand il se tend,
 *  rouge quand il est dépassé. */
function tonDe(c: ConsommationNature): "vide" | "ok" | "tendu" | "depasse" {
  if (c.depassementMin > 0) return "depasse";
  if (c.quotaMin <= 0) return "vide";
  return pourcentConsomme(c) >= SEUIL_ALERTE_FORFAIT ? "tendu" : "ok";
}

const REMPLISSAGE: Record<string, string> = {
  ok: "bg-success",
  tendu: "bg-warning",
  depasse: "bg-danger",
  vide: "bg-border",
};

/**
 * La barre d'un forfait.
 *
 * Un quota à ZÉRO n'affiche pas « 0 / 0 » ni une barre vide à 100 % : il dit
 * « aucune heure incluse ». Beaucoup de contrats n'ont pas d'heures de
 * présentiel — c'est une clause, pas un oubli de saisie, et l'écran doit faire
 * la différence.
 */
export function BarreForfait({
  c,
  compact = false,
  className,
}: {
  c: ConsommationNature;
  compact?: boolean;
  className?: string;
}) {
  const ton = tonDe(c);
  const pc = pourcentConsomme(c);
  const hors = totalHorsForfaitMin(c);

  return (
    <div className={cn("min-w-0", className)}>
      <div
        className={cn(
          "flex items-baseline gap-2",
          compact ? "text-xs" : "text-sm",
        )}
      >
        {!compact && (
          <PastilleNature nature={c.nature} className="font-medium text-fg" />
        )}
        <span className="font-mono tabular-nums text-fg">
          {c.quotaMin > 0 ? (
            <>
              {formatDuree(c.consommeMin)}
              <span className="text-subtle"> / {formatDuree(c.quotaMin)}</span>
            </>
          ) : (
            <span className="font-sans text-muted">aucune heure incluse</span>
          )}
        </span>
        <span className="ml-auto shrink-0 text-xs text-muted">
          {ton === "depasse" ? (
            <span className="font-medium text-danger">
              dépassement {formatDuree(c.depassementMin)}
            </span>
          ) : c.quotaMin > 0 ? (
            <>reste {formatDuree(c.restantMin)}</>
          ) : hors > 0 ? (
            <span className="font-medium text-danger">{formatDuree(hors)} hors forfait</span>
          ) : null}
        </span>
      </div>

      <div
        className={cn(
          "mt-1 w-full overflow-hidden rounded-full bg-surface-2",
          compact ? "h-1" : "h-1.5",
        )}
        /* La barre double le chiffre ci-dessus : elle n'apporte aucune
           information à un lecteur d'écran, elle l'encombrerait. */
        aria-hidden
      >
        <div
          className={cn("h-full transition-[width] duration-500", REMPLISSAGE[ton])}
          style={{ width: `${c.quotaMin > 0 ? pc : hors > 0 ? 100 : 0}%` }}
        />
      </div>

      {c.horsContratMin > 0 && (
        <p className="mt-1 text-xs text-muted">
          + {formatDuree(c.horsContratMin)} hors contrat (motif non couvert)
        </p>
      )}
    </div>
  );
}

/* --------------------------------------------------------------- imputation */

const LIBELLE_CAUSE: Record<CauseHorsForfait, string> = {
  decision: "Hors contrat",
  depassement: "Dépassement",
  "hors-periode": "Hors période",
};

const TON_CAUSE: Record<CauseHorsForfait, string> = {
  decision: "border-accent/40 bg-accent-soft text-accent-strong",
  depassement: "border-danger/35 bg-danger/10 text-danger",
  "hors-periode": "border-danger/35 bg-danger/10 text-danger",
};

/**
 * Comment une intervention a été imputée. Trois cas au lieu d'un booléen,
 * parce qu'une intervention peut être À CHEVAL : 30 min sur le forfait, 1 h au
 * delà. Écrire « hors forfait : oui/non » aurait obligé à trancher en faveur de
 * l'un des deux, et le client aurait eu raison de contester.
 */
export function Imputation({
  inclusMin,
  horsMin,
  cause,
}: {
  inclusMin: number;
  horsMin: number;
  cause: CauseHorsForfait | null;
}) {
  if (!cause || horsMin === 0) {
    return <span className="text-xs text-muted">Au forfait</span>;
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <span
        className={cn(
          "inline-flex items-center rounded border px-1.5 py-0.5 text-[0.68rem] font-medium",
          TON_CAUSE[cause],
        )}
      >
        {LIBELLE_CAUSE[cause]} {formatDuree(horsMin)}
      </span>
      {inclusMin > 0 && (
        <span className="text-xs text-muted">dont {formatDuree(inclusMin)} au forfait</span>
      )}
    </span>
  );
}

/* ---------------------------------------------------------------- échéance */

/**
 * Le terme d'un contrat, dit en jours plutôt qu'en date : « dans 47 j » se
 * décide, « 28/10/2026 » se calcule. Les deux se lisent côte à côte sur la
 * fiche ; en liste, seul le délai tient dans la colonne.
 *
 * ⚠️ Un terme PASSÉ ne veut pas dire « fini » : la plupart de ces contrats se
 * reconduisent tacitement et courent depuis des années. Le mot est donc
 * « échu », pas « terminé » — c'est `etat` qui dit si le contrat vit encore.
 */
export function BadgeEcheance({
  echeance,
  tacite,
}: {
  echeance: { etat: string; joursRestants: number | null };
  tacite: boolean;
}) {
  const j = echeance.joursRestants;

  if (echeance.etat === "sans-terme") {
    return <span className="text-xs text-subtle">sans terme</span>;
  }
  if (echeance.etat === "echu") {
    return (
      <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-medium text-danger">
        échu {j != null && `depuis ${Math.abs(j)} j`}
        {tacite && <span className="font-normal text-muted">· tacite</span>}
      </span>
    );
  }
  if (echeance.etat === "preavis") {
    return (
      <span className="whitespace-nowrap text-xs font-medium text-warning">
        préavis · {j} j
      </span>
    );
  }
  if (echeance.etat === "proche") {
    return <span className="whitespace-nowrap text-xs text-fg">dans {j} j</span>;
  }
  return <span className="whitespace-nowrap text-xs text-muted">dans {j} j</span>;
}
