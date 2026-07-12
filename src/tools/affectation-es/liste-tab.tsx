"use client";

import { Printer } from "lucide-react";
import { Button } from "@/ui";
import { RowsEditor, type CatalogItem } from "@/tools/liste-points/rows-editor";
import { Impression } from "@/tools/liste-points/impression";
import { GenererGfx } from "@/tools/liste-points/generer-gfx";
import type { ModeleDef, PointRow } from "@/tools/liste-points/model";
import { SauvegarderListeKdrive } from "./sauvegarder-liste-kdrive";
import type { KdriveMarker, Project } from "./model";

/**
 * Onglet « Liste de points » d'un projet d'affectation. Remplace les anciens
 * onglets Entrées/Sorties : la liste est la saisie unique. `setRows` répercute
 * la synchro vers project.points (géré par le parent). Impression A4 + Générer
 * GFX réutilisent l'outil Liste de points tels quels.
 */
export function ListeTab({
  project,
  nom,
  clientNom,
  chantierId,
  setRows,
  onKdriveSaved,
  cataloguePoints,
  modeles,
}: {
  project: Project;
  nom: string;
  clientNom: string;
  chantierId: string | null;
  setRows: React.Dispatch<React.SetStateAction<PointRow[]>>;
  onKdriveSaved: (m: KdriveMarker) => void;
  cataloguePoints: CatalogItem[];
  modeles: ModeleDef[];
}) {
  const rows = project.rows ?? [];
  const projectName = nom || clientNom || "Projet";
  return (
    <div>
      <RowsEditor
        rows={rows}
        setRows={setRows}
        catalogue={cataloguePoints}
        modeles={modeles}
        toolbarExtra={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              <Printer className="h-4 w-4" /> Imprimer la liste
            </Button>
            <GenererGfx
              rows={rows}
              projectName={projectName}
              chantier={project.header}
              client={clientNom}
              date={project.date}
            />
            <SauvegarderListeKdrive
              chantierId={chantierId}
              projectName={projectName}
              clientNom={clientNom}
              chantierNom={project.header}
              date={project.date || null}
              rows={rows}
              marker={project.kdrive}
              onSaved={onKdriveSaved}
            />
          </div>
        }
      />
      <Impression clientNom={clientNom} chantierNom={project.header} date={project.date || null} rows={rows} />
    </div>
  );
}
