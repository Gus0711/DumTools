// Automates supportés pour la génération de squelette GFX.
// Chaque entrée correspond à un gabarit dans public/gfx-templates/<ref>.gfx
// (produit par scripts/build-gfx-templates.py) et à des métadonnées dans
// prototypes.generated.ts. La capacité E/S reprend le catalogue Distech
// (cf. src/tools/affectation-es/catalog.ts, MODULE_TYPE_DEFS).

export interface ControllerConfig {
  /** Clé catalogue = nom de fichier du gabarit (sans extension). */
  ref: string;
  label: string;
  /** Voies d'entrée universelles par module (AI et DI partagent les UI). */
  inPerModule: number;
  /** Voies de sortie par module (AO et DO partagent les sorties). */
  outPerModule: number;
  /** L'automate accepte-t-il l'ajout de modules d'extension identiques ? */
  expandable: boolean;
  /** Nombre total de modules max (modules d'extension compris). */
  maxModules: number;
  /** Note affichée dans le sélecteur. */
  note?: string;
}

export const CONTROLLERS: ControllerConfig[] = [
  {
    ref: "ECY-PTU-207", label: "ECLYPSE PTU-207",
    inPerModule: 6, outPerModule: 10, expandable: false, maxModules: 1,
    note: "6 UI / 10 sorties intégrées",
  },
  {
    ref: "ECY-303", label: "ECLYPSE ECY-303",
    inPerModule: 8, outPerModule: 8, expandable: false, maxModules: 1,
    note: "8 UI / 8 sorties intégrées",
  },
  {
    ref: "ECY-400", label: "ECLYPSE ECY-400",
    inPerModule: 12, outPerModule: 12, expandable: false, maxModules: 1,
    note: "12 UI / 12 sorties intégrées",
  },
  {
    ref: "ECY-600", label: "ECLYPSE ECY-600",
    inPerModule: 16, outPerModule: 14, expandable: false, maxModules: 1,
    note: "16 UI / 14 sorties intégrées",
  },
  {
    ref: "ECY-S1000E", label: "ECLYPSE S1000E (modules 8UI/6UO)",
    inPerModule: 8, outPerModule: 6, expandable: true, maxModules: 16,
    note: "Pile de modules 8 UI / 6 UO — ajoutés automatiquement",
  },
];

export function getController(ref: string): ControllerConfig | undefined {
  return CONTROLLERS.find((c) => c.ref === ref);
}
