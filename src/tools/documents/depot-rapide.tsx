"use client";

import { useState } from "react";
import Link from "next/link";
import { ExternalLink, FolderOpen, Plus, X } from "lucide-react";
import { Button } from "@/ui";
import { Depot } from "./depot";

/**
 * En-tête « Fichiers kDrive » + dépôt inline, pour la fiche Affaire.
 * Évite le détour par l'outil Documents : un clic ouvre la zone de dépôt
 * (glisser-déposer + catégorie) directement dans l'affaire. Le `Depot`
 * rafraîchit la page au succès → le fichier apparaît dans la liste en dessous.
 * La zone reste ouverte pour enchaîner plusieurs dépôts.
 */
export function DepotRapide({
  chantierId,
  count,
}: {
  chantierId: string;
  count: number;
}) {
  const [ouvert, setOuvert] = useState(false);
  return (
    <div className="mb-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-fg">
          <FolderOpen className="h-4 w-4 text-muted" />
          Fichiers kDrive
          <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs tabular-nums text-muted">
            {count}
          </span>
        </h2>
        {/* Sur la fiche, le nom d'un fichier l'OUVRE ; la gestion (suppression,
            resynchro kDrive, miroir) reste sur la page dédiée. */}
        <Link
          href={`/outils/documents/${chantierId}`}
          className="ml-auto mr-3 inline-flex items-center gap-1.5 text-xs text-muted hover:text-fg"
        >
          Gérer les fichiers
          <ExternalLink className="h-3.5 w-3.5" />
        </Link>
        <Button size="sm" variant="outline" onClick={() => setOuvert((v) => !v)}>
          {ouvert ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          {ouvert ? "Fermer" : "Déposer un fichier"}
        </Button>
      </div>
      {ouvert && (
        <div className="mt-3">
          <Depot chantierId={chantierId} />
        </div>
      )}
    </div>
  );
}
