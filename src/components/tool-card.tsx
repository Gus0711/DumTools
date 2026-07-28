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
        "bloc group flex h-full flex-col overflow-hidden p-5 transition-colors duration-200",
        ouvrable ? "hover:border-brand/45 hover:bg-surface-2" : "opacity-70",
      )}
    >
      {/* Liseré laiton de signature — il se met sous tension au survol. */}
      {ouvrable && (
        <span
          aria-hidden
          className="rule-accent absolute inset-x-0 top-0 h-[3px] origin-left scale-x-0 transition-transform duration-500 group-hover:scale-x-100"
        />
      )}

      <div className="mb-4 flex items-start justify-between">
        <div className="bg-brand-gradient relative flex h-12 w-12 items-center justify-center overflow-hidden">
          <Icon className="relative h-5.5 w-5.5 text-white" />
        </div>
        <Badge tone={STATUS_TONE[status]} point={status !== "planifie"}>
          {STATUS_LABEL[status]}
        </Badge>
      </div>

      <h3 className="font-display text-lg font-semibold tracking-tight text-fg">{nom}</h3>
      <p className="mt-1.5 flex-1 text-sm leading-relaxed text-muted">{description}</p>

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
 * largeur, plus généreuse.
 */
export function FeaturedToolCard({ tool }: { tool: Tool }) {
  const { icon: Icon, nom, description, href, status } = tool;
  const ouvrable = status !== "planifie";

  const inner = (
    <div
      className={cn(
        "bloc group overflow-hidden transition-colors duration-200",
        ouvrable ? "hover:border-brand/45 hover:bg-surface-2" : "opacity-70",
      )}
    >
      {ouvrable && (
        <span
          aria-hidden
          className="rule-accent absolute inset-x-0 top-0 h-[3px] origin-left scale-x-0 transition-transform duration-500 group-hover:scale-x-100"
        />
      )}

      <div className="flex flex-col gap-6 p-6 sm:flex-row sm:items-center sm:gap-7">
        <div className="bg-brand-gradient relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden">
          <Icon className="relative h-7 w-7 text-white" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <h3 className="font-display text-xl font-bold tracking-tight text-fg">{nom}</h3>
            <Badge tone={STATUS_TONE[status]} point={ouvrable}>
              {STATUS_LABEL[status]}
            </Badge>
          </div>
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted">{description}</p>
        </div>

        {ouvrable ? (
          <span className="bg-brand text-brand-fg inline-flex shrink-0 items-center gap-2 self-start px-5 py-2.5 text-sm font-semibold transition-colors group-hover:bg-brand-strong sm:self-auto">
            Ouvrir
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
