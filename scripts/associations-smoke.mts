/**
 * Contrôles du rangement et du calcul de quantité des ASSOCIATIONS de produits.
 *
 *   npx tsx scripts/associations-smoke.mts
 *
 * Fonctions pures (src/tools/magasin/model.ts) : c'est ici que se vérifie la
 * seule chose qui décide vraiment de l'aide apportée — qu'un accessoire à
 * l'unité suive la quantité et qu'un article mutualisé ne la suive pas.
 */

import {
  quantiteProposee,
  rangerAssociations,
  type AssociationVue,
} from "../src/tools/magasin/model";

let ok = 0;
let ko = 0;
const v = (nom: string, cond: boolean, d?: string) => {
  if (cond) { ok += 1; console.log(`  ✔ ${nom}`); }
  else { ko += 1; console.error(`  ✘ ${nom}${d ? ` — ${d}` : ""}`); }
};
const eg = (nom: string, obtenu: unknown, attendu: unknown) =>
  v(nom, Object.is(obtenu, attendu), `obtenu ${String(obtenu)}, attendu ${String(attendu)}`);

let n = 0;
function assoc(p: Partial<AssociationVue> = {}): AssociationVue {
  n += 1;
  return {
    id: `a${n}`,
    associeId: `p${n}`,
    refInterne: `REF-${n}`,
    designation: `Associé ${n}`,
    unite: "U",
    debourseCents: 1000,
    actif: true,
    type: "ACCESSOIRE",
    groupe: null,
    quantite: 1,
    parUnite: true,
    parDefaut: true,
    note: "",
    ordre: n,
    ...p,
  };
}

console.log("\n1. Quantité proposée");
eg("1 par unité × 3 automates", quantiteProposee({ quantite: 1, parUnite: true }, 3), 3);
eg("2 par unité × 6 sondes", quantiteProposee({ quantite: 2, parUnite: true }, 6), 12);
eg("mutualisé : la quantité ne suit pas", quantiteProposee({ quantite: 1, parUnite: false }, 3), 1);
eg("mutualisé à 2 reste 2", quantiteProposee({ quantite: 2, parUnite: false }, 9), 2);
eg("déclencheur à 1", quantiteProposee({ quantite: 1, parUnite: true }, 1), 1);
// Un déclencheur à 0 ou fractionnaire ne doit pas proposer 0 accessoire : la
// ligne serait créée à zéro et passerait inaperçue.
eg("déclencheur à 0 → au moins 1", quantiteProposee({ quantite: 1, parUnite: true }, 0), 1);
eg("déclencheur fractionnaire → arrondi, plancher 1", quantiteProposee({ quantite: 1, parUnite: true }, 2.4), 2);
eg("quantité d'association à 0 → plancher 1", quantiteProposee({ quantite: 0, parUnite: false }, 5), 1);

console.log("\n2. Rangement accessoires / variantes");
{
  const r = rangerAssociations([
    assoc({ id: "acc1", designation: "Alimentation", ordre: 1 }),
    assoc({ id: "acc2", designation: "Coffret", ordre: 2, parUnite: false }),
    assoc({ id: "v1", type: "VARIANTE", groupe: "Type de bus", designation: "8UI", ordre: 1, parDefaut: true }),
    assoc({ id: "v2", type: "VARIANTE", groupe: "Type de bus", designation: "4UI4UO", ordre: 2, parDefaut: false }),
  ]);
  eg("deux accessoires", r.accessoires.length, 2);
  eg("un groupe de variantes", r.groupes.length, 1);
  eg("… nommé", r.groupes[0].nom, "Type de bus");
  eg("… avec ses deux options", r.groupes[0].options.length, 2);
  eg("… et l'option par défaut retenue", r.groupes[0].choisiParDefaut, "v1");
  eg("les accessoires suivent leur ordre", r.accessoires[0].designation, "Alimentation");
}
{
  // Aucune option marquée par défaut : on ne force AUCUNE fourniture. « Rien »
  // est un choix légitime — sinon on vend un article que personne n'a demandé.
  const r = rangerAssociations([
    assoc({ type: "VARIANTE", groupe: "Coffret", parDefaut: false }),
    assoc({ type: "VARIANTE", groupe: "Coffret", parDefaut: false }),
  ]);
  eg("aucun défaut → rien de coché", r.groupes[0].choisiParDefaut, null);
}
{
  // Un article archivé au magasin ne doit plus être proposé : on le vendrait
  // sans pouvoir l'acheter.
  const r = rangerAssociations([
    assoc({ designation: "Vivant" }),
    assoc({ designation: "Archivé", actif: false }),
  ]);
  eg("l'associé archivé n'est pas proposé", r.accessoires.length, 1);
  eg("… c'est bien le vivant qui reste", r.accessoires[0].designation, "Vivant");
}
{
  // Filet : une VARIANTE sans groupe est exclusive avec rien du tout. Elle
  // retombe en accessoire au lieu d'ouvrir un groupe fantôme.
  const r = rangerAssociations([assoc({ type: "VARIANTE", groupe: null })]);
  eg("variante sans groupe → traitée en accessoire", r.accessoires.length, 1);
  eg("… et aucun groupe fantôme", r.groupes.length, 0);
}
{
  const r = rangerAssociations([
    assoc({ type: "VARIANTE", groupe: "Zebre" }),
    assoc({ type: "VARIANTE", groupe: "Alpha" }),
  ]);
  eg("les groupes sortent par ordre alphabétique", r.groupes[0].nom, "Alpha");
}
eg("aucune association → rien à proposer", rangerAssociations([]).accessoires.length, 0);

console.log(`\n${ok + ko} contrôles — ${ok} ✔  ${ko} ✘`);
if (ko > 0) process.exit(1);
console.log("Le rangement des associations tient.\n");
