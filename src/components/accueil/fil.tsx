import Link from "next/link";
import {
  Briefcase,
  CircuitBoard,
  ClipboardCheck,
  FolderOpen,
  Library,
  NotebookPen,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { EtatVide, type NomDessin } from "@/ui";
import { classeSignal, type Teinte } from "@/tools/registry";
import { LIBELLE_ACTIVITE, type EvenementActivite, type TypeActivite } from "@/lib/activite/queries";
import { fmtRelatif } from "@/lib/dates";

/* =============================================================================
 * LE FIL
 * Deux emplois du même agrégat (activite/queries.ts), côte à côte dans la
 * colonne de droite :
 *   · « Reprendre » — ce que MOI j'ai touché en dernier. C'est le geste du
 *     matin : retomber dans le document d'hier soir sans le chercher.
 *   · « Activité » — ce que toute l'équipe a bougé. L'appli est partagée, mais
 *     rien ne le montrait.
 * Chaque ligne porte le signal de son outil : on reconnaît une page de wiki au
 * turquoise avant d'avoir lu « Wiki ».
 * ========================================================================== */

const ICONE: Record<TypeActivite, LucideIcon> = {
  affaire: Briefcase,
  projet: CircuitBoard,
  note: NotebookPen,
  document: FolderOpen,
  visite: ClipboardCheck,
  wiki: Library,
};

/** Le signal de l'outil dont vient l'événement (voir SignalOutil du registre).
 *  L'affaire n'est pas un outil : c'est le pivot, elle porte le laiton. */
const TEINTE: Record<TypeActivite, Teinte> = {
  affaire: "accent",
  projet: "ai",
  note: "ao",
  document: "do",
  visite: "di",
  wiki: "com",
};

export function Fil({
  titre,
  icone: Icone,
  mention,
  evenements,
  montrerAuteur = false,
  vide,
}: {
  titre: string;
  icone: LucideIcon;
  mention: string;
  evenements: EvenementActivite[];
  /** « Activité » crédite l'auteur ; « Reprendre » ne parle que de moi. */
  montrerAuteur?: boolean;
  vide: { dessin: NomDessin; titre: string; texte: string };
}) {
  return (
    <section className="bloc">
      <div className="bloc-entete">
        <Icone className="h-4 w-4 text-brand" />
        <span className="font-display text-sm font-semibold text-fg">{titre}</span>
        <span className="stamp ml-auto">{mention}</span>
      </div>

      {evenements.length === 0 ? (
        <EtatVide dessin={vide.dessin} titre={vide.titre} texte={vide.texte} />
      ) : (
        <ul className="stagger divide-y divide-hairline">
          {evenements.map((e) => {
            const Icone = ICONE[e.type];
            return (
              <li key={`${e.type}:${e.id}`} className={classeSignal(TEINTE[e.type])}>
                <Link
                  href={e.href}
                  className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-surface-2 sm:py-2.5"
                >
                  <Icone className="text-signal mt-0.5 h-4 w-4 shrink-0" />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline gap-3">
                      <span className="min-w-0 flex-1 truncate text-sm font-medium text-fg">
                        {e.titre}
                      </span>
                      <span
                        suppressHydrationWarning
                        className="shrink-0 text-xs tabular-nums text-subtle"
                      >
                        {fmtRelatif(e.date)}
                      </span>
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-muted">
                      {LIBELLE_ACTIVITE[e.type]}
                      {e.contexte ? ` · ${e.contexte}` : ""}
                      {montrerAuteur && e.auteur ? ` · ${e.auteur}` : ""}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/** Bandeau des espaces perso, en pied d'accueil : une ligne, pas une section.
 *  Ce sont les outils de chacun — présents, mais pas au premier plan. */
export function BandeauPerso({
  espaces,
}: {
  espaces: { slug: string; nom: string; icone: LucideIcon; outils: string[] }[];
}) {
  return (
    <div className={cn("bloc flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-3")}>
      {espaces.map((e) => (
        <div key={e.slug} className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="inline-flex items-center gap-2">
            <e.icone className="h-4 w-4 text-subtle" />
            <span className="font-display text-sm font-semibold text-fg">{e.nom}</span>
          </span>
          {e.outils.map((o) => (
            <span key={o} className="text-sm text-muted">
              {o}
            </span>
          ))}
          <Link
            href={`/perso/${e.slug}`}
            className="text-sm font-semibold text-brand transition-colors hover:text-brand-strong"
          >
            Ouvrir →
          </Link>
        </div>
      ))}
    </div>
  );
}
