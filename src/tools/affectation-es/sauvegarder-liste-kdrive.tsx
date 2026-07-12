"use client";

import type { PointRow } from "@/tools/liste-points/model";
import { genererListePdf } from "@/tools/liste-points/pdf-liste";
import { hashListe } from "@/tools/liste-points/hash";
import { BoutonSauvegardeKdrive } from "./sauvegarder-kdrive";
import type { KdriveMarker } from "./model";

/** Sauvegarde de la LISTE DE POINTS sur kDrive (PDF vectoriel pdfmake). */
export function SauvegarderListeKdrive({
  chantierId,
  projectName,
  clientNom,
  chantierNom,
  date,
  rows,
  marker,
  onSaved,
}: {
  chantierId: string | null;
  projectName: string;
  clientNom: string;
  chantierNom: string;
  date: string | null;
  rows: PointRow[];
  marker?: KdriveMarker;
  onSaved: (m: KdriveMarker) => void;
}) {
  const jour = new Date().toISOString().slice(0, 10);
  return (
    <BoutonSauvegardeKdrive
      chantierId={chantierId}
      nomFichier={`Liste de points — ${projectName} — ${jour}.pdf`}
      currentHash={hashListe(rows, clientNom, chantierNom, date)}
      marker={marker}
      genererPdf={() => genererListePdf({ clientNom, chantierNom, date, rows })}
      onSaved={onSaved}
    />
  );
}
