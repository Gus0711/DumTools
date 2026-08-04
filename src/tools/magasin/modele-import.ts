// Fabrication des fichiers CSV de l'import — PARTAGÉ client/serveur.
//
// Deux usages, le même format :
//   - le MODÈLE vide, pour savoir quelles colonnes fournir ;
//   - l'EXPORT du référentiel, qu'on modifie dans Excel et qu'on réinjecte.
// C'est le cycle naturel d'une mise à jour de masse (changement de tarifs,
// nouveaux seuils) : exporter, corriger, réimporter.
//
// Les en-têtes sont exactement les libellés de CHAMPS : le fichier produit ici
// est donc reconnu tout seul par devinerMapping().

import { CHAMPS, type GenreImport } from "./import-model";

/** Séparateur `;` et BOM UTF-8 : c'est ce qu'Excel en français ouvre sans
 *  broncher (avec `,` il met tout dans une seule colonne, sans BOM il casse les
 *  accents). */
const SEP = ";";
const BOM = "﻿";

export function echapperCsv(valeur: string): string {
  if (valeur === "") return "";
  return /[";\n\r]/.test(valeur) ? `"${valeur.replace(/"/g, '""')}"` : valeur;
}

export function construireCsv(entetes: string[], lignes: string[][]): string {
  const corps = [entetes, ...lignes]
    .map((l) => l.map((c) => echapperCsv(c ?? "")).join(SEP))
    .join("\r\n");
  return BOM + corps + "\r\n";
}

/** Deux lignes d'exemple par genre : montrer vaut mieux qu'expliquer. */
const EXEMPLES: Record<GenreImport, Record<string, string>[]> = {
  produits: [
    {
      refInterne: "ECY-303",
      refFabricant: "ECY-303",
      designation: "Automate ECLYPSE 8UI/6UO",
      fabricant: "Distech Controls",
      categorie: "Automate",
      unite: "U",
      seuilMini: "2",
      emplacement: "Bac A3",
      note: "",
      fournisseur: "Distech Controls",
      refFournisseur: "DIS-ECY303",
      prixAchat: "412,50",
      delaiJours: "10",
    },
    {
      refInterne: "SONDE-GAINE-PT1000",
      refFabricant: "STP100-2",
      designation: "Sonde de gaine PT1000 100 mm",
      fabricant: "Sensortec",
      categorie: "Sonde",
      unite: "U",
      seuilMini: "10",
      emplacement: "Bac B1",
      note: "",
      fournisseur: "Belimo",
      refFournisseur: "BEL-STP100",
      prixAchat: "38,90",
      delaiJours: "5",
    },
  ],
  stock: [
    { ref: "ECY-303", quantite: "4", prix: "412,50", depot: "Atelier", series: "SN-001,SN-002" },
    { ref: "SONDE-GAINE-PT1000", quantite: "25", prix: "38,90", depot: "Atelier", series: "" },
  ],
};

/** Modèle vierge (en-têtes + deux lignes d'exemple) pour un genre d'import. */
export function genererModele(genre: GenreImport): string {
  const champs = CHAMPS[genre];
  return construireCsv(
    champs.map((c) => c.libelle),
    EXEMPLES[genre].map((ex) => champs.map((c) => ex[c.cle] ?? "")),
  );
}

export function nomFichierModele(genre: GenreImport): string {
  return `modele-import-${genre}.csv`;
}

/** Déclenche le téléchargement d'un CSV depuis le navigateur. */
export function telechargerCsv(nomFichier: string, contenu: string): void {
  const blob = new Blob([contenu], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nomFichier;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Laisser le temps au navigateur d'amorcer le téléchargement avant de libérer.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
