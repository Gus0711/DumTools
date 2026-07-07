import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/cn";
import { Badge } from "@/ui";
import { STATUS_LABEL, type Tool } from "@/tools/registry";

const STATUS_TONE = {
  disponible: "success",
  "en-cours": "accent",
  planifie: "neutral",
} as const;

/** Carte d'outil sur l'écran d'accueil. Générée depuis le registre. */
export function ToolCard({ tool }: { tool: Tool }) {
  const { icon: Icon, nom, description, href, status } = tool;
  const ouvrable = status !== "planifie";

  const inner = (
    <div
      className={cn(
        "group relative flex h-full flex-col overflow-hidden rounded-xl border border-border bg-surface p-5 shadow-sm transition-all duration-200",
        ouvrable
          ? "hover:-translate-y-1 hover:border-brand/40 hover:shadow-lg"
          : "opacity-70",
      )}
    >
      {/* Liseré laiton de signature — révélé au survol. */}
      {ouvrable && (
        <span
          aria-hidden
          className="rule-accent absolute inset-x-0 top-0 h-0.5 origin-left scale-x-0 transition-transform duration-300 group-hover:scale-x-100"
        />
      )}

      <div className="mb-4 flex items-start justify-between">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-brand/10 bg-brand-soft text-brand transition-colors group-hover:border-brand/25">
          <Icon className="h-6 w-6" />
        </div>
        <Badge tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Badge>
      </div>

      <h3 className="text-lg font-semibold tracking-tight text-fg">{nom}</h3>
      <p className="mt-1.5 flex-1 text-sm leading-relaxed text-muted">
        {description}
      </p>

      {ouvrable ? (
        <span className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-brand">
          Ouvrir
          <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
        </span>
      ) : (
        <span className="mt-5 text-sm text-subtle">Bientôt disponible</span>
      )}
    </div>
  );

  return ouvrable ? (
    <Link href={href} className="block h-full">
      {inner}
    </Link>
  ) : (
    <div className="h-full cursor-default">{inner}</div>
  );
}

/**
 * Carte « à la une » — utilisée quand un seul outil est disponible : au lieu
 * d'une petite carte esseulée dans la grille, une carte horizontale pleine
 * largeur, plus généreuse. La tuile d'icône reprend la signature (dégradé
 * marine + trame blueprint).
 */
export function FeaturedToolCard({ tool }: { tool: Tool }) {
  const { icon: Icon, nom, description, href, status } = tool;
  const ouvrable = status !== "planifie";

  const inner = (
    <div
      className={cn(
        "group relative overflow-hidden rounded-2xl border border-border bg-surface shadow-sm transition-all duration-200",
        ouvrable
          ? "hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-lg"
          : "opacity-70",
      )}
    >
      {ouvrable && (
        <span
          aria-hidden
          className="rule-accent absolute inset-x-0 top-0 h-0.5 origin-left scale-x-0 transition-transform duration-300 group-hover:scale-x-100"
        />
      )}

      <div className="flex flex-col gap-6 p-6 sm:flex-row sm:items-center sm:gap-7 sm:p-7">
        {/* Tuile d'icône — signature marine + trame blueprint. */}
        <div className="bg-brand-gradient relative flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl shadow-md">
          <span aria-hidden className="blueprint-grid absolute inset-0" />
          <Icon className="relative h-9 w-9 text-white" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <h3 className="font-display text-xl font-semibold tracking-tight text-fg">
              {nom}
            </h3>
            <Badge tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Badge>
          </div>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
            {description}
          </p>
        </div>

        {ouvrable ? (
          <span className="bg-brand text-brand-fg shadow-sm transition-colors group-hover:bg-brand-strong inline-flex shrink-0 items-center gap-2 self-start rounded-lg px-5 py-2.5 text-sm font-semibold sm:self-auto">
            Ouvrir le projet
            <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
          </span>
        ) : (
          <span className="shrink-0 text-sm text-subtle">Bientôt disponible</span>
        )}
      </div>
    </div>
  );

  return ouvrable ? (
    <Link href={href} className="block">
      {inner}
    </Link>
  ) : (
    <div className="cursor-default">{inner}</div>
  );
}
