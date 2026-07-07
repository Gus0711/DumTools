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
        "group flex h-full flex-col rounded-lg border border-border bg-surface p-5 shadow-sm transition-all",
        ouvrable
          ? "hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-md"
          : "opacity-70",
      )}
    >
      <div className="mb-4 flex items-start justify-between">
        <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-brand-soft text-brand">
          <Icon className="h-5.5 w-5.5" />
        </div>
        <Badge tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Badge>
      </div>

      <h3 className="text-base font-semibold text-fg">{nom}</h3>
      <p className="mt-1.5 flex-1 text-sm leading-relaxed text-muted">
        {description}
      </p>

      {ouvrable ? (
        <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-brand">
          Ouvrir
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
        </span>
      ) : (
        <span className="mt-4 text-sm text-subtle">Bientôt disponible</span>
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
