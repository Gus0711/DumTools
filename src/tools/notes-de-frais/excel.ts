import "server-only";
import { join } from "node:path";
import ExcelJS from "exceljs";
import {
  LIGNES_PAR_FEUILLE,
  titrePeriode,
  type CategorieFrais,
  type DepenseVue,
  type Periode,
  type ProfilNdf,
} from "./model";

/* Remplissage des DEUX gabarits Excel historiques (docs/ndf/*.xls, convertis en
 * .xlsx dans ./modeles). Objectif : la compta reçoit exactement le fichier
 * qu'elle connaît — même mise en page, même logo, mêmes formules, même zone
 * d'impression. On n'écrit QUE dans les cellules de données.
 *
 * ⚠️ PIÈGE VÉRIFIÉ (spike) : les cellules de total sont des formules dont la
 * VALEUR EN CACHE vaut 0 dans le gabarit. Excel recalcule à l'ouverture grâce à
 * `fullCalcOnLoad`, mais LibreOffice ne recalcule pas par défaut : le fichier
 * s'ouvre alors avec des totaux à « 0,00 € » sous des lignes bien remplies.
 * On écrit donc la formule ET son résultat (`{ formula, result }`) — le lecteur
 * affiche le bon montant immédiatement, et la formule reste vivante si la
 * compta modifie une ligne. */

/** Société unique du groupe pour l'en-tête (docs/NDF.md §3). */
export const SOCIETE = "DUMORTIER";

function cheminGabarit(profil: ProfilNdf): string {
  const fichier = profil === "TECHNICIEN" ? "technicien.xlsx" : "direction-ra.xlsx";
  return join(process.cwd(), "src/tools/notes-de-frais/modeles", fichier);
}

/** Centimes → nombre à 2 décimales. Sans l'arrondi, 12,40 + 78,90 + 19,50 donne
 *  110.80000000000001 dans la cellule. */
function euros(cents: number): number {
  return Math.round(cents) / 100;
}

function dateFr(iso: string): string {
  const [a, m, j] = iso.split("-");
  return `${j}/${m}/${a}`;
}

/**
 * Descriptif tel qu'il part dans l'Excel. Une dépense reportée porte la mention
 * de son mois d'origine : la compta doit pouvoir comprendre pourquoi un ticket
 * de juin apparaît sur la note de juillet, sans avoir à demander.
 */
function descriptifExport(d: DepenseVue): string {
  const base = d.descriptif.trim();
  if (!d.periodeOrigine) return base;
  const mention = `dépense de ${titrePeriode(d.periodeOrigine).toLowerCase()}`;
  return base ? `${base} (${mention})` : mention;
}

/**
 * Découpe le prénom du nom : les gabarits ont deux cases séparées alors que la
 * plateforme ne stocke qu'un libellé. Convention « Prénom Nom » (celle de la
 * base utilisateurs) : premier mot = prénom, le reste = nom. Si le libellé est
 * d'un seul mot, tout va dans NOM — jamais d'invention.
 */
function couperNom(complet: string): { nom: string; prenom: string } {
  const mots = complet.trim().split(/\s+/);
  if (mots.length < 2) return { nom: complet.trim(), prenom: "" };
  return { prenom: mots[0], nom: mots.slice(1).join(" ") };
}

export interface OptionsExport {
  profil: ProfilNdf;
  /** Libellé complet de la personne (User.nom). */
  nomComplet: string;
  periode: Periode;
  /** Uniquement les dépenses COMPLÈTES, déjà triées par date. */
  depenses: DepenseVue[];
}

/** Somme des dépenses d'une rubrique donnée, en centimes. */
function sommeCat(depenses: DepenseVue[], c: CategorieFrais): number {
  return depenses
    .filter((d) => d.categorie === c)
    .reduce((s, d) => s + d.montantCents, 0);
}

/**
 * Duplique la feuille du gabarit pour absorber un débordement (> 31 lignes).
 * Le gabarit ne peut pas s'étirer sans casser sa zone d'impression : au-delà,
 * on ajoute une feuille identique plutôt que de tronquer en silence.
 */
function dupliquerFeuille(
  wb: ExcelJS.Workbook,
  source: ExcelJS.Worksheet,
  nom: string,
): ExcelJS.Worksheet {
  const cible = wb.addWorksheet(nom);
  cible.model = {
    ...source.model,
    name: nom,
    // `id` doit rester celui attribué par addWorksheet, sinon les deux feuilles
    // se marchent dessus à l'écriture.
    id: cible.id,
  } as ExcelJS.Worksheet["model"];
  cible.name = nom;
  return cible;
}

export async function genererExcel(opts: OptionsExport): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(cheminGabarit(opts.profil));
  const gabarit = wb.worksheets[0];

  // Une feuille par tranche de 31 lignes.
  const tranches: DepenseVue[][] = [];
  for (let i = 0; i < Math.max(opts.depenses.length, 1); i += LIGNES_PAR_FEUILLE) {
    tranches.push(opts.depenses.slice(i, i + LIGNES_PAR_FEUILLE));
  }

  let numeroPiece = 1;
  tranches.forEach((tranche, index) => {
    const ws =
      index === 0
        ? gabarit
        : dupliquerFeuille(wb, gabarit, `Suite ${index + 1}`);
    if (opts.profil === "TECHNICIEN") {
      remplirTechnicien(ws, opts, tranche, numeroPiece);
    } else {
      remplirDirectionRa(ws, opts, tranche, numeroPiece);
    }
    numeroPiece += tranche.length;
  });

  // Ceinture et bretelles : Excel recalcule à l'ouverture (les résultats en
  // cache couvrent déjà les lecteurs qui ne recalculent pas).
  wb.calcProperties.fullCalcOnLoad = true;

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

/* ------------------------------------------------------- gabarit TECHNICIEN
 * Portrait. Lignes de saisie 6 → 36. Colonnes :
 *   A n° pièce · B affaire · C ACT · D CA (colonnes mortes, laissées vides)
 *   E transport · F repas seul · G repas accompagné · H carburant
 *   I entretien véhicule · J achats divers · K TOTAL (formule) · L descriptif
 * Sous-totaux ligne 37. */

const TECH_PREMIERE_LIGNE = 6;
const TECH_DERNIERE_LIGNE = 36;
const TECH_LIGNE_TOTAL = 37;

/** Colonne du gabarit ← rubrique. */
const TECH_COLONNE: Partial<Record<CategorieFrais, string>> = {
  TRANSPORT: "E",
  REPAS_HOTEL_SEUL: "F",
  REPAS_HOTEL_ACCOMPAGNE: "G",
  CARBURANT: "H",
  ENTRETIEN_VEHICULE: "I",
  ACHATS_DIVERS: "J",
};
const TECH_COLONNES_MONTANT = ["E", "F", "G", "H", "I", "J"] as const;

function remplirTechnicien(
  ws: ExcelJS.Worksheet,
  opts: OptionsExport,
  depenses: DepenseVue[],
  premierNumero: number,
) {
  const { nom, prenom } = couperNom(opts.nomComplet);
  ws.getCell("E1").value = `Note de frais du mois de  ${titrePeriode(opts.periode)}`;
  ws.getCell("F2").value = nom;
  ws.getCell("I2").value = prenom;
  ws.getCell("L2").value = SOCIETE;

  depenses.forEach((d, i) => {
    const r = TECH_PREMIERE_LIGNE + i;
    if (r > TECH_DERNIERE_LIGNE) return;
    ws.getCell(`A${r}`).value = premierNumero + i;
    ws.getCell(`B${r}`).value = d.numeroAffaire || null;
    const col = TECH_COLONNE[d.categorie];
    if (col) ws.getCell(`${col}${r}`).value = euros(d.montantCents);
    ws.getCell(`K${r}`).value = {
      formula: `+J${r}+I${r}+H${r}+E${r}+F${r}+G${r}`,
      result: euros(d.montantCents),
    };
    ws.getCell(`L${r}`).value = descriptifExport(d);
  });

  let total = 0;
  for (const col of TECH_COLONNES_MONTANT) {
    const cat = (Object.keys(TECH_COLONNE) as CategorieFrais[]).find(
      (c) => TECH_COLONNE[c] === col,
    );
    const somme = cat ? sommeCat(depenses, cat) : 0;
    total += somme;
    ws.getCell(`${col}${TECH_LIGNE_TOTAL}`).value = {
      formula: `SUM(${col}${TECH_PREMIERE_LIGNE}:${col}${TECH_DERNIERE_LIGNE})`,
      result: euros(somme),
    };
  }
  ws.getCell(`K${TECH_LIGNE_TOTAL}`).value = {
    formula: `+J${TECH_LIGNE_TOTAL}+I${TECH_LIGNE_TOTAL}+H${TECH_LIGNE_TOTAL}+E${TECH_LIGNE_TOTAL}+F${TECH_LIGNE_TOTAL}+G${TECH_LIGNE_TOTAL}`,
    result: euros(total),
  };
}

/* ----------------------------------------------------- gabarit DIRECTION_RA
 * Paysage. Lignes de saisie 8 → 38. Colonnes :
 *   A n° pièce · B date · C:E descriptif · F somme (formule) · G transport
 *   H carburant · I achats divers · J n° affaire · K nb invités · L repas
 *   d'affaires · M ticket resto (sans objet, laissée vide) · N consommations
 *   O TVA · P:Q noms des sociétés et invités
 * Totaux ligne 39, montant à régler I41. */

const DIR_PREMIERE_LIGNE = 8;
const DIR_DERNIERE_LIGNE = 38;
const DIR_LIGNE_TOTAL = 39;

const DIR_COLONNE: Partial<Record<CategorieFrais, string>> = {
  TRANSPORT: "G",
  CARBURANT: "H",
  ACHATS_DIVERS: "I",
  REPAS_AFFAIRES: "L",
  CONSOMMATIONS: "N",
};
/** Colonnes sommées ligne 39 (J = n° d'affaire : texte, la somme y vaut 0 — on
 *  conserve tout de même la formule du gabarit pour ne rien dénaturer). */
const DIR_COLONNES_TOTAL = ["G", "H", "I", "J", "K", "L", "M", "N", "O"] as const;

function remplirDirectionRa(
  ws: ExcelJS.Worksheet,
  opts: OptionsExport,
  depenses: DepenseVue[],
  premierNumero: number,
) {
  ws.getCell("A5").value = `MOIS DE : ${titrePeriode(opts.periode)}`;
  ws.getCell("G5").value = opts.nomComplet;
  ws.getCell("Q5").value = SOCIETE;

  depenses.forEach((d, i) => {
    const r = DIR_PREMIERE_LIGNE + i;
    if (r > DIR_DERNIERE_LIGNE) return;
    ws.getCell(`A${r}`).value = premierNumero + i;
    // Date en TEXTE : le format de la cellule du gabarit n'est pas garanti être
    // un format date, une vraie Date s'y afficherait en numéro de série.
    ws.getCell(`B${r}`).value = dateFr(d.date);
    ws.getCell(`C${r}`).value = descriptifExport(d);
    const col = DIR_COLONNE[d.categorie];
    if (col) ws.getCell(`${col}${r}`).value = euros(d.montantCents);
    ws.getCell(`J${r}`).value = d.numeroAffaire || null;
    if (d.nbInvites != null) ws.getCell(`K${r}`).value = d.nbInvites;
    if (d.invites.trim()) ws.getCell(`P${r}`).value = d.invites.trim();
    if (d.tvaCents != null) ws.getCell(`O${r}`).value = euros(d.tvaCents);
    ws.getCell(`F${r}`).value = {
      formula: `G${r}+I${r}+L${r}+H${r}+N${r}`,
      result: euros(d.montantCents),
    };
  });

  /** Total d'une colonne, EN CENTIMES (0 pour les colonnes non monétaires). */
  const centsColonne = (col: string): number => {
    if (col === "O") return depenses.reduce((s, d) => s + (d.tvaCents ?? 0), 0);
    const cat = (Object.keys(DIR_COLONNE) as CategorieFrais[]).find(
      (c) => DIR_COLONNE[c] === col,
    );
    return cat ? sommeCat(depenses, cat) : 0;
  };

  for (const col of DIR_COLONNES_TOTAL) {
    // K compte des invités, pas des euros : sa somme n'a pas à être divisée.
    const resultat =
      col === "K"
        ? depenses.reduce((s, d) => s + (d.nbInvites ?? 0), 0)
        : euros(centsColonne(col));
    ws.getCell(`${col}${DIR_LIGNE_TOTAL}`).value = {
      formula: `SUM(${col}${DIR_PREMIERE_LIGNE}:${col}${DIR_DERNIERE_LIGNE})`,
      result: resultat,
    };
  }

  const total = (["G", "H", "I", "L", "N"] as const).reduce(
    (s, c) => s + centsColonne(c),
    0,
  );
  ws.getCell(`F${DIR_LIGNE_TOTAL}`).value = {
    formula: `G${DIR_LIGNE_TOTAL}+I${DIR_LIGNE_TOTAL}+L${DIR_LIGNE_TOTAL}+H${DIR_LIGNE_TOTAL}+N${DIR_LIGNE_TOTAL}`,
    result: euros(total),
  };
  // « Montant total à régler ».
  ws.getCell("I41").value = {
    formula: `+F${DIR_LIGNE_TOTAL}`,
    result: euros(total),
  };
}

/** Nom du fichier remis à la compta. */
export function nomFichierExcel(nomComplet: string, periode: Periode): string {
  const personne = nomComplet
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toUpperCase();
  return `Note-de-frais_${personne}_${periode}.xlsx`;
}
