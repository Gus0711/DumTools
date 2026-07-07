"use client";

import { RowsEditor, type CatalogItem } from "@/tools/liste-points/rows-editor";
import { Impression } from "@/tools/liste-points/impression";
import { GenererGfx } from "@/tools/liste-points/generer-gfx";
import type { ModeleDef, PointRow } from "@/tools/liste-points/model";
import type { Project } from "./model";

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
  setRows,
  cataloguePoints,
  modeles,
}: {
  project: Project;
  nom: string;
  clientNom: string;
  setRows: React.Dispatch<React.SetStateAction<PointRow[]>>;
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
          <GenererGfx
            rows={rows}
            projectName={projectName}
            chantier={project.header}
            client={clientNom}
            date={project.date}
          />
        }
      />
      <Impression clientNom={clientNom} chantierNom={project.header} date={project.date || null} rows={rows} />
    </div>
  );
}
