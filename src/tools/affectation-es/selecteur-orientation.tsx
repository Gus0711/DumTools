"use client";

/* Sélecteur segmenté paysage / portrait, partagé par les deux aperçus
 * imprimables de l'outil (document final « Aperçu » et tableau récapitulatif
 * de l'onglet « Affectation »). L'orientation pilote l'aperçu écran ET le PDF
 * (même DOM → WYSIWYG). */

import type { ReactNode } from "react";
import { RectangleHorizontal, RectangleVertical } from "lucide-react";
import { cn } from "@/lib/cn";
import type { OrientationApercu } from "./apercu-pdf";

function Segment({
  actif,
  onClick,
  icon,
  label,
}: {
  actif: boolean;
  onClick: () => void;
  icon: ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={actif}
      className={cn(
        "inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium transition",
        actif
          ? "bg-brand text-brand-fg"
          : "bg-surface text-muted hover:bg-surface-2 hover:text-fg",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

export function SelecteurOrientation({
  orientation,
  onChange,
}: {
  orientation: OrientationApercu;
  onChange: (o: OrientationApercu) => void;
}) {
  return (
    <div
      className="inline-flex overflow-hidden rounded-lg border border-border"
      role="group"
      aria-label="Orientation du document"
    >
      <Segment
        actif={orientation === "landscape"}
        onClick={() => onChange("landscape")}
        icon={<RectangleHorizontal className="h-4 w-4" />}
        label="Paysage"
      />
      <Segment
        actif={orientation === "portrait"}
        onClick={() => onChange("portrait")}
        icon={<RectangleVertical className="h-4 w-4" />}
        label="Portrait"
      />
    </div>
  );
}
