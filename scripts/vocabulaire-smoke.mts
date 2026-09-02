// Contrôles du vocabulaire des points : ce que l'IMPORT GFX/PDF fait d'une
// désignation venue du programme client.
//
//   npx tsx scripts/vocabulaire-smoke.mts
//
// Aucune base : le catalogue est posé ici, les cas sont ceux qu'on a réellement
// lus dans les programmes (voir scripts/normalisation-points-relecture1.csv).
import { normaliserPourImport, type EntreeVocabulaire } from "../src/tools/liste-points/vocabulaire";
import { nommeurImport } from "../src/tools/affectation-es/derivation";
import type { IoType } from "../src/tools/liste-points/model";

const CATALOGUE: EntreeVocabulaire[] = [
  { nom: "Commande", type: "DO" },
  { nom: "Commande Chauffage", type: "DO" },
  { nom: "Commande contacteur", type: "DO" },
  { nom: "Commande pompe 1", type: "DO" },
  { nom: "Pilotage", type: "AO" },
  { nom: "Defaut", type: "DI" },
  { nom: "Sonde ambiance", type: "AI" },
  { nom: "Sonde ambiance Ss Fil", type: "COM" },
  { nom: "Sonde départ", type: "AI" },
  { nom: "Sonde retour", type: "AI" },
  { nom: "Sonde extérieur", type: "AI" },
  // Entrée elle-même polluée : elle ne doit JAMAIS servir de cible.
  { nom: "Chauffage_Reserve", type: "DO" },
];

let ok = 0;
const echecs: string[] = [];
function verifier(intitule: string, obtenu: unknown, attendu: unknown) {
  const a = JSON.stringify(attendu);
  const o = JSON.stringify(obtenu);
  if (a === o) ok++;
  else echecs.push(`  ✗ ${intitule}\n      attendu ${a}\n      obtenu  ${o}`);
}

function cas(libelle: string, type: IoType | null, attendu: [string, string, string] | null) {
  const n = normaliserPourImport(libelle, type, CATALOGUE);
  verifier(
    `« ${libelle} » [${type ?? "—"}]`,
    n ? [n.nom, n.complement, n.par] : null,
    attendu,
  );
}

// 1. Variante d'écriture d'un point du catalogue : on adopte SON orthographe —
//    la BOM apparie sur le nom exact.
cas("SONDE_RETOUR", "AI", ["Sonde retour", "", "catalogue"]);
cas("sonde exterieur", "AI", ["Sonde extérieur", "", "catalogue"]);

// 2. Coupe au local : le générique reste au nom, le lieu part au texte libre.
cas("Cde contacteur dalle chauffante Salle Communale 1", "DO", [
  "Commande contacteur",
  "dalle chauffante — Salle Communale 1",
  "coupe",
]);
cas("Amb_Salle_Conseil", "AI", ["Sonde ambiance", "Salle Conseil", "coupe"]);
// Les synonymes se rejoignent : M/A, ODM, Cde disent tous « Commande ».
cas("ODM_Dalles_Secretariat", "DO", ["Commande", "Dalles — Secretariat", "coupe"]);
cas("Chauffage laverie", "DO", ["Commande Chauffage", "laverie", "coupe"]);

// 3. Le catalogue sert de préfixe (aucune coupe possible, aucun local).
cas("Defaut Bruleur CHD", "DI", ["Defaut", "Bruleur CHD", "coupe"]);
cas("Commande pompe 3", "DO", ["Commande", "pompe 3", "coupe"]);

// 4. Le type d'E/S nomme le point, le libellé brut devient le distinctif.
cas("Extracteur GV", "DO", ["Commande", "Extracteur GV", "type"]);
cas("Signal TRIAC CTA", "AO", ["Pilotage", "Signal TRIAC CTA", "type"]);

// Un type qui CONTREDIT le point disqualifie la cible : « Commande » est une
// sortie TOR du catalogue, la coller sur une sortie ANALOGIQUE ferait entrer sa
// nomenclature (un relais) dans la BOM. On repart sur le générique du type.
cas("Commande V6V Z1", "AO", ["Pilotage", "Commande V6V Z1", "type"]);
// … la même sur une sortie TOR, elle, est parfaitement légitime.
cas("Commande V6V Z1", "DO", ["Commande", "V6V — Z1", "coupe"]);
// L'exigence ne vaut que s'il existe un repli : sur une ENTRÉE, mieux vaut un
// appariement au type discutable que pas d'appariement du tout.
cas("Defaut Bruleur", "AI", ["Defaut", "Bruleur", "coupe"]);

// Ce qu'on NE fait PAS.
// Une ENTRÉE ne se laisse pas nommer par son type : défaut, retour de marche et
// comptage sont trois DI différents — le libellé porte la seule information.
cas("Pressostat air CTA", "DI", null);
cas("Alarme technique générale", "DI", null);
// … mais une tête connue suffit à conclure, sans jamais inventer la suite :
// « CHD » (chaudière) reste au texte libre, il n'est pas au vocabulaire.
cas("Tp depart CHD", "AI", ["Sonde départ", "Chd", "coupe"]);
// « Sonde ambiance Ss Fil » est un produit distinct : elle n'est pas absorbée
// par « Sonde ambiance » (elle est plus longue, donc reconnue d'abord).
cas("Sonde ambiance Ss Fil — Bar", "COM", ["Sonde ambiance Ss Fil", "Bar", "coupe"]);
// Une entrée de catalogue polluée n'est pas une cible : on ne remplace pas un
// local par un autre.
cas("Chauffage_Reserve", "DO", ["Commande Chauffage", "Reserve", "coupe"]);
// « extérieur » qualifie le point, pas l'endroit : jamais coupé.
cas("Sonde extérieur", "AI", ["Sonde extérieur", "", "catalogue"]);
// Sans catalogue, l'import n'invente rien.
verifier("aucun catalogue", normaliserPourImport("ODM_Dalles_Secretariat", "DO", []), null);
cas("", "DO", null);

// Le nommeur : ce que l'import écrit vraiment dans le point.
const noms = nommeurImport(CATALOGUE);
verifier(
  "le local passe DEVANT le repère de câblage",
  noms.nommer("ODM_Dalles_Secretariat", "output", "D", "Import GFX - Module 2 / UO3"),
  { designation: "Commande", source: "Dalles — Secretariat — Import GFX - Module 2 / UO3" },
);
verifier(
  "sans complément, le texte libre n'est que le câblage",
  noms.nommer("SONDE_RETOUR", "input", "PT1000", "Import GFX - Module 1 / UI4"),
  { designation: "Sonde retour", source: "Import GFX - Module 1 / UI4" },
);
verifier(
  "libellé non reconnu : on n'y touche pas",
  noms.nommer("Pressostat air CTA", "input", "D", "Import GFX - Module 1 / UI7"),
  { designation: "Pressostat air CTA", source: "Import GFX - Module 1 / UI7" },
);
verifier("comptage des libellés ramenés", noms.normalises, 2);

console.log(echecs.length ? `\n${echecs.join("\n")}\n` : "");
console.log(`${ok} contrôle(s) au vert${echecs.length ? `, ${echecs.length} en échec` : ""}.`);
process.exit(echecs.length ? 1 : 0);
