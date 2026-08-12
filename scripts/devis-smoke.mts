/**
 * Test de bout en bout du MOTEUR de devis — sans base ni navigateur.
 *
 *   npx tsx scripts/devis-smoke.mts
 *
 * Le moteur étant fait de fonctions pures (src/tools/devis/model.ts), tout ce
 * qui décide d'un prix est vérifiable ici : la cascade du coefficient, l'arrondi
 * (et le cas précis qui dérive si on arrondit le total au lieu de la ligne), les
 * options hors total, les deux formes de remise, la TVA à 0 %, et la règle qui
 * porte le reste — une ligne sans déboursé n'est jamais comptée pour zéro.
 */

import {
  DUREE_PARTAGE_DEVIS_DEFAUT,
  PUBLICATION_DEFAUT,
  SOCIETE_DEFAUT,
  acompteCents,
  arrondi,
  calculerDevis,
  calculerLigne,
  chargeMainOeuvre,
  coefApplicable,
  condenserLots,
  contenuTexteSimple,
  designationClient,
  dateValidite,
  documentClient,
  documentVide,
  dureesPartageDevis,
  formatCoef,
  formatEuros,
  formatNumeroDevis,
  formatQuantite,
  libelleDevis,
  lignesDestinataire,
  mentionsLegales,
  ordreEntre,
  parseCoef,
  reecrireMediasPublicsDevis,
  parseEuros,
  parseQuantite,
  parseRemise,
  puces,
  pvDepuisDebourse,
  resumeTexteLigne,
  resoudreRemiseGlobale,
  simulerPrixCible,
  texteNu,
  type ContenuRiche,
  type GrilleCoefs,
  type LigneDevisVue,
  type LotDevisVue,
} from "../src/tools/devis/model";

let ok = 0;
let ko = 0;

function verifier(nom: string, condition: boolean, detail?: string) {
  if (condition) {
    ok += 1;
    console.log(`  ✔ ${nom}`);
  } else {
    ko += 1;
    console.error(`  ✘ ${nom}${detail ? ` — ${detail}` : ""}`);
  }
}

function egal(nom: string, obtenu: unknown, attendu: unknown) {
  verifier(nom, Object.is(obtenu, attendu), `obtenu ${String(obtenu)}, attendu ${String(attendu)}`);
}

/* --- Fabriques ------------------------------------------------------------- */

/** Un lot DÉTAILLÉ par défaut — le comportement historique. Un bloc forfaitaire
 *  se demande explicitement : `lot({ rendu: "CONDENSE" })`. */
function lot(p: Partial<LotDevisVue> & Pick<LotDevisVue, "id" | "titre" | "ordre">): LotDevisVue {
  return { note: "", rendu: "DETAILLE", libelleClient: "", ...p };
}

let compteur = 0;
function ligne(p: Partial<LigneDevisVue> = {}): LigneDevisVue {
  compteur += 1;
  return {
    id: `l${compteur}`,
    lotId: null,
    ordre: compteur * 1000,
    genre: "PRODUIT",
    produitId: `p${compteur}`,
    prestationId: null,
    designation: `Article ${compteur}`,
    // Champs du document riche d'une ligne TEXTE : le moteur ne s'en sert pas
    // (il ne calcule que des montants), mais la fabrique doit produire une
    // LigneDevisVue complète.
    contenu: null,
    version: 0,
    majLe: "2026-01-01T00:00:00.000Z",
    refInterne: `REF-${compteur}`,
    unite: "U",
    quantiteMillieme: 1000,
    debourseCents: 1000,
    coefMillieme: 1350,
    origineCoef: "devis",
    pvUnitaireCents: 1350,
    remisePourMille: 0,
    option: false,
    note: "",
    debourseActuelCents: null,
    ...p,
  };
}

const ENTETE_NU = {
  tauxTvaCentieme: 2000,
  remiseGlobalePourMille: null,
  remiseGlobaleCents: null,
};

/* =============================================================================
 * 1. LA CASCADE DU COEFFICIENT
 * ========================================================================== */
console.log("\n1. Cascade du coefficient");

const grille: GrilleCoefs = {
  globalMillieme: 1300,
  parCategorie: { "cat-automate": 1250 },
  parProduit: { "prod-special": 1100 },
};

{
  const r = coefApplicable(grille, 1350, { produitId: "prod-x", categorieId: null });
  egal("aucune règle → défaut du devis", r.coefMillieme, 1350);
  egal("… et l'origine le dit", r.origine, "devis");
}
{
  const r = coefApplicable(grille, 1350, { produitId: "prod-x", categorieId: "cat-automate" });
  egal("catégorie réglée → elle gagne sur le défaut", r.coefMillieme, 1250);
  egal("… origine « categorie »", r.origine, "categorie");
}
{
  const r = coefApplicable(grille, 1350, {
    produitId: "prod-special",
    categorieId: "cat-automate",
  });
  egal("produit réglé → il gagne sur la catégorie", r.coefMillieme, 1100);
  egal("… origine « produit »", r.origine, "produit");
}
{
  const r = coefApplicable(
    grille,
    1350,
    { produitId: "prod-special", categorieId: "cat-automate" },
    1500,
  );
  egal("forçage de ligne → il gagne sur tout", r.coefMillieme, 1500);
  egal("… origine « ligne »", r.origine, "ligne");
}
{
  // Le coefficient GLOBAL de la grille ne s'applique pas directement : il sert à
  // INITIALISER le défaut du devis, qui est ensuite figé. Sans quoi réviser la
  // politique de la maison modifierait tous les devis déjà chiffrés.
  const r = coefApplicable(grille, 1350, { produitId: null, categorieId: null });
  egal("le global de la grille ne court-circuite pas le défaut figé", r.coefMillieme, 1350);
}
{
  const r = coefApplicable(grille, 1350, { produitId: "prod-x", categorieId: "cat-inconnue" });
  egal("catégorie sans règle → on retombe sur le défaut", r.coefMillieme, 1350);
}

/* =============================================================================
 * 2. L'ARRONDI — sur la ligne, jamais sur le total
 * ========================================================================== */
console.log("\n2. Arrondi");

egal("pv = déboursé × coef, arrondi", pvDepuisDebourse(4250, 1350), 5738);
egal("arrondi commercial : 0,5 s'éloigne de zéro", arrondi(2.5), 3);
egal("… y compris négatif", arrondi(-2.5), -3);

{
  // LE cas qui dérive. Trois lignes à 3,335 € l'unité : arrondir chaque ligne
  // donne 3,34 × 3 = 10,02 ; arrondir le total donnerait 10,005 → 10,01.
  // L'écart est d'un centime, il suffit à faire perdre une heure à quelqu'un.
  const lignes = [
    ligne({ pvUnitaireCents: 3335, quantiteMillieme: 1000 }),
    ligne({ pvUnitaireCents: 3335, quantiteMillieme: 1000 }),
    ligne({ pvUnitaireCents: 3335, quantiteMillieme: 1000 }),
  ];
  const t = calculerDevis(ENTETE_NU, [], lignes);
  egal("Σ de lignes arrondies (et non total arrondi)", t.totalHtCents, 3335 * 3);
  const sommeDesLignes = t.lots[0].lignes.reduce((s, l) => s + l.totalCents, 0);
  egal("invariant : total HT = Σ des lignes", t.totalHtCents, sommeDesLignes);
}

{
  // Quantité fractionnaire : 2,5 h × 74,40 € = 186,00 €.
  const l = calculerLigne(ligne({ pvUnitaireCents: 7440, quantiteMillieme: 2500 }));
  egal("quantité en millièmes (2,5 × 74,40)", l.brutCents, 18600);
}

/* =============================================================================
 * 3. LES OPTIONS — chiffrées, affichées, HORS TOTAL
 * ========================================================================== */
console.log("\n3. Options");

{
  const lignes = [
    ligne({ pvUnitaireCents: 10000 }),
    ligne({ pvUnitaireCents: 420000, option: true, debourseCents: 300000 }),
  ];
  const t = calculerDevis(ENTETE_NU, [], lignes);
  egal("l'option ne compte pas dans le total HT", t.totalHtCents, 10000);
  egal("… mais elle est chiffrée à part", t.optionsCents, 420000);
  egal("… et comptée", t.nbOptions, 1);
  egal("l'option sort aussi de la marge", t.debourseCents, 1000);
}

/* =============================================================================
 * 4. LES REMISES
 * ========================================================================== */
console.log("\n4. Remises");

{
  const l = calculerLigne(ligne({ pvUnitaireCents: 10000, remisePourMille: 100 }));
  egal("remise de ligne 10 %", l.remiseCents, 1000);
  egal("… total net de la ligne", l.totalCents, 9000);
}
{
  const t = calculerDevis(
    { ...ENTETE_NU, remiseGlobalePourMille: 30 },
    [],
    [ligne({ pvUnitaireCents: 6330000 })],
  );
  egal("remise globale 3 %", t.remiseGlobaleCents, 189900);
  egal("… net HT", t.netHtCents, 6330000 - 189900);
}
{
  const t = calculerDevis(
    { ...ENTETE_NU, remiseGlobalePourMille: 30, remiseGlobaleCents: 50000 },
    [],
    [ligne({ pvUnitaireCents: 100000 })],
  );
  egal("les deux remises posées → le montant fixe gagne", t.remiseGlobaleCents, 50000);
}
{
  const r = resoudreRemiseGlobale(
    { remiseGlobalePourMille: null, remiseGlobaleCents: 999999 },
    10000,
  );
  egal("une remise fixe ne peut pas dépasser le total", r, 10000);
}

/* =============================================================================
 * 5. LA TVA
 * ========================================================================== */
console.log("\n5. TVA");

{
  const t = calculerDevis(ENTETE_NU, [], [ligne({ pvUnitaireCents: 100000 })]);
  egal("TVA 20 %", t.tvaCents, 20000);
  egal("TTC", t.totalTtcCents, 120000);
}
{
  const t = calculerDevis(
    { ...ENTETE_NU, tauxTvaCentieme: 0 },
    [],
    [ligne({ pvUnitaireCents: 100000 })],
  );
  egal("autoliquidation (0 %) → aucune TVA", t.tvaCents, 0);
  egal("… TTC = HT", t.totalTtcCents, 100000);
}
{
  const t = calculerDevis(
    { ...ENTETE_NU, tauxTvaCentieme: 550 },
    [],
    [ligne({ pvUnitaireCents: 100000 })],
  );
  egal("taux 5,5 %", t.tvaCents, 5500);
}
{
  // La TVA porte sur le NET, pas sur le brut : une remise globale la réduit.
  const t = calculerDevis(
    { ...ENTETE_NU, remiseGlobalePourMille: 100 },
    [],
    [ligne({ pvUnitaireCents: 100000 })],
  );
  egal("la TVA porte sur le net (après remise globale)", t.tvaCents, 18000);
}

/* =============================================================================
 * 6. LE PRINCIPE N°3 — ce qu'on ne sait pas chiffrer est DIT
 * ========================================================================== */
console.log("\n6. Lignes sans prix");

{
  const lignes = [
    ligne({ pvUnitaireCents: 10000, debourseCents: 6000 }),
    ligne({ pvUnitaireCents: 5000, debourseCents: null }),
  ];
  const t = calculerDevis(ENTETE_NU, [], lignes);
  egal("la ligne sans déboursé est signalée", t.nbSansPrix, 1);
  egal("… elle n'est PAS comptée zéro dans le déboursé", t.debourseCents, 6000);
  egal("… le vendu comparé est celui des seules lignes chiffrées", t.venduFournitureCents, 10000);
  egal("… donc la marge reste honnête", t.margeFournitureCents, 4000);
  egal("… mais elle compte bien dans le total vendu", t.totalHtCents, 15000);
}
{
  // Une PRESTATION n'a pas de déboursé PAR CONSTRUCTION (taux de vente direct) :
  // ce n'est pas un trou de chiffrage, on ne doit pas l'alerter.
  const lignes = [
    ligne({ pvUnitaireCents: 10000, debourseCents: 6000 }),
    ligne({ genre: "PRESTATION", produitId: null, pvUnitaireCents: 178560, debourseCents: null }),
  ];
  const t = calculerDevis(ENTETE_NU, [], lignes);
  egal("une prestation n'est pas un trou de chiffrage", t.nbSansPrix, 0);
  egal("… mais elle entre dans le total", t.totalHtCents, 188560);
  egal("… et reste hors de la marge fourniture", t.margeFournitureCents, 4000);
}

/* =============================================================================
 * 7. LES LIGNES DE TEXTE
 * ========================================================================== */
console.log("\n7. Lignes de texte");

{
  const lignes = [
    ligne({ pvUnitaireCents: 10000 }),
    ligne({ genre: "TEXTE", produitId: null, debourseCents: null, pvUnitaireCents: 0 }),
  ];
  const t = calculerDevis(ENTETE_NU, [], lignes);
  egal("un commentaire ne pèse rien", t.totalHtCents, 10000);
  egal("… et n'est pas compté comme ligne chiffrée", t.nbLignes, 1);
}

/* =============================================================================
 * 8. LES LOTS
 * ========================================================================== */
console.log("\n8. Lots & sous-totaux");

{
  const lots: LotDevisVue[] = [
    lot({ id: "lot-b", titre: "Armoire", ordre: 2000, note: "" }),
    lot({ id: "lot-a", titre: "Fourniture", ordre: 1000, note: "" }),
  ];
  const lignes = [
    ligne({ lotId: "lot-a", pvUnitaireCents: 3240000 }),
    ligne({ lotId: "lot-b", pvUnitaireCents: 1290000 }),
    ligne({ lotId: "lot-disparu", pvUnitaireCents: 1800000 }),
  ];
  const t = calculerDevis(ENTETE_NU, lots, lignes);
  egal("les lots sortent dans l'ordre", t.lots[0].lot?.titre, "Fourniture");
  egal("… puis le suivant", t.lots[1].lot?.titre, "Armoire");
  egal("sous-total du 1er lot", t.lots[0].sousTotalCents, 3240000);
  verifier("une ligne dont le lot a disparu n'est pas perdue", t.lots[2].lot === null);
  egal("… et le groupe « hors lot » vient EN DERNIER", t.lots[2].lignes.length, 1);
  egal("invariant : total HT = Σ des sous-totaux", t.totalHtCents, 3240000 + 1290000 + 1800000);
}

/* =============================================================================
 * 9. LA FRAÎCHEUR
 * ========================================================================== */
console.log("\n9. Fraîcheur du déboursé");

{
  const lignes = [
    ligne({ debourseCents: 4250, debourseActuelCents: 4600 }),
    ligne({ debourseCents: 4250, debourseActuelCents: 4250 }),
    ligne({ debourseCents: 4250, debourseActuelCents: null }),
  ];
  const t = calculerDevis(ENTETE_NU, [], lignes);
  egal("seule la ligne dont le prix a bougé est signalée", t.nbPerimees, 1);
  const l0 = calculerLigne(lignes[0]);
  egal("… le total, lui, reste celui qui a été CHIFFRÉ", l0.brutCents, 1350);
}

/* =============================================================================
 * 10. LA NUMÉROTATION
 * ========================================================================== */
console.log("\n10. Numérotation");

egal("format maison", formatNumeroDevis(2026, 52), "DT260052");
egal("… premier de l'année", formatNumeroDevis(2026, 1), "DT260001");
egal("… plafond du format", formatNumeroDevis(2026, 9999), "DT269999");
egal("… changement d'année", formatNumeroDevis(2030, 7), "DT300007");
egal("libellé v1 : pas de suffixe", libelleDevis("DT260052", 1), "DT260052");
egal("libellé v2", libelleDevis("DT260052", 2), "DT260052 v2");

/* =============================================================================
 * 11. FORMATAGE & SAISIE (aller-retour)
 * ========================================================================== */
console.log("\n11. Formatage & saisie");

egal("euros", formatEuros(41250), "412,50 €");
egal("euros, milliers", formatEuros(6330000), "63 300,00 €");
egal("euros, inconnu", formatEuros(null), "—");
egal("saisie « 412,50 € »", parseEuros("412,50 €"), 41250);
egal("saisie « 1 412.5 »", parseEuros("1 412.5"), 141250);
egal("saisie illisible", parseEuros("abc"), null);
egal("quantité entière", formatQuantite(12000), "12");
egal("quantité décimale", formatQuantite(2500), "2,5");
egal("saisie de quantité", parseQuantite("2,5"), 2500);
egal("coefficient", formatCoef(1350), "×1,35");
egal("saisie « ×1,35 »", parseCoef("×1,35"), 1350);
egal("un coefficient nul est refusé", parseCoef("0"), null);
egal("un coefficient négatif est refusé", parseCoef("-1"), null);
egal("remise « 5 % »", parseRemise("5 %"), 50);
egal("remise > 100 % refusée", parseRemise("150"), null);

/* =============================================================================
 * 12. L'ORDRE D'INSERTION
 * ========================================================================== */
console.log("\n12. Ordre");

egal("première ligne", ordreEntre(null, null), 1000);
egal("à la fin", ordreEntre(3000, null), 4000);
egal("au début", ordreEntre(null, 1000), 0);
egal("intercalation", ordreEntre(1000, 2000), 1500);

/* =============================================================================
 * 13. UN DEVIS COMPLET, DE BOUT EN BOUT
 * ========================================================================== */
console.log("\n13. Devis complet");

{
  const lots: LotDevisVue[] = [
    lot({ id: "L1", titre: "Fourniture GTB", ordre: 1000, note: "" }),
    lot({ id: "L2", titre: "Main d'œuvre", ordre: 2000, note: "" }),
  ];
  const lignes = [
    // 2 automates : déboursé 1 276,00 € ×1,25 = 1 595,00 € l'unité
    ligne({
      lotId: "L1",
      debourseCents: 127600,
      coefMillieme: 1250,
      pvUnitaireCents: pvDepuisDebourse(127600, 1250),
      quantiteMillieme: 2000,
    }),
    // 12 sondes : déboursé 42,50 € ×1,35 = 57,38 €
    ligne({
      lotId: "L1",
      debourseCents: 4250,
      coefMillieme: 1350,
      pvUnitaireCents: pvDepuisDebourse(4250, 1350),
      quantiteMillieme: 12000,
    }),
    // 24 h de programmation à 74,40 € (taux de vente, pas de déboursé)
    ligne({
      lotId: "L2",
      genre: "PRESTATION",
      produitId: null,
      debourseCents: null,
      coefMillieme: null,
      pvUnitaireCents: 7440,
      quantiteMillieme: 24000,
      unite: "h",
    }),
    // une option qui ne doit compter nulle part
    ligne({ lotId: "L1", debourseCents: 300000, pvUnitaireCents: 420000, option: true }),
  ];
  const t = calculerDevis({ ...ENTETE_NU, remiseGlobalePourMille: 30 }, lots, lignes);

  const fourniture = 159500 * 2 + 5738 * 12;
  const mo = arrondi((7440 * 24000) / 1000);
  egal("sous-total Fourniture", t.lots[0].sousTotalCents, fourniture);
  egal("sous-total Main d'œuvre", t.lots[1].sousTotalCents, mo);
  egal("total HT", t.totalHtCents, fourniture + mo);
  egal("option à part", t.optionsCents, 420000);
  egal("remise 3 %", t.remiseGlobaleCents, arrondi(((fourniture + mo) * 30) / 1000));
  egal("net HT", t.netHtCents, t.totalHtCents - t.remiseGlobaleCents);
  egal("TVA 20 % du net", t.tvaCents, arrondi((t.netHtCents * 2000) / 10000));
  egal("TTC", t.totalTtcCents, t.netHtCents + t.tvaCents);

  // La marge ne porte QUE sur la fourniture (la MO est au taux de vente).
  egal("déboursé de la fourniture", t.debourseCents, 127600 * 2 + 4250 * 12);
  egal("vendu de la fourniture", t.venduFournitureCents, fourniture);
  egal("marge sur la fourniture", t.margeFournitureCents, fourniture - (127600 * 2 + 4250 * 12));
  verifier(
    "la marge ne compare pas un déboursé partiel à un vendu total",
    t.venduFournitureCents < t.totalHtCents,
  );
  egal("aucun trou de chiffrage", t.nbSansPrix, 0);
  egal("lignes chiffrées", t.nbLignes, 4);

  const sommeSousTotaux = t.lots.reduce((s, l) => s + l.sousTotalCents, 0);
  egal("invariant final : HT = Σ sous-totaux", t.totalHtCents, sommeSousTotaux);
}

/* --- 14. Le texte riche d'une ligne TEXTE ----------------------------------- */

{
  console.log("\n14. Texte riche (ligne TEXTE)");

  // L'amorce : une phrase devient un paragraphe, rien de plus.
  const amorce = contenuTexteSimple("Prestations incluses");
  egal("amorce : un seul bloc", amorce.length, 1);
  egal("amorce : aller-retour par texteNu", texteNu(amorce), "Prestations incluses");
  egal("amorce d'une chaîne vide : document vide", contenuTexteSimple("   ").length, 0);
  egal("document vide : texte nu vide (et non « riche »)", texteNu([]), "");

  // texteNu décide si l'écran monte un éditeur : il doit rendre `null` DÈS
  // qu'il y a autre chose que du texte, sinon on afficherait une mise en forme
  // en la perdant.
  egal("null pour un contenu absent", texteNu(null), null);
  const titre: ContenuRiche = [{ type: "heading", content: [{ type: "text", text: "T", styles: {} }] }];
  egal("un titre n'est pas du texte nu", texteNu(titre), null);
  const gras: ContenuRiche = [
    { type: "paragraph", content: [{ type: "text", text: "gras", styles: { bold: true } }] },
  ];
  egal("un mot en gras n'est pas du texte nu", texteNu(gras), null);
  const lien: ContenuRiche = [
    {
      type: "paragraph",
      content: [{ type: "link", href: "https://x", content: [{ type: "text", text: "x" }] }],
    },
  ];
  egal("un lien n'est pas du texte nu", texteNu(lien), null);
  const deux: ContenuRiche = [...contenuTexteSimple("a"), ...contenuTexteSimple("b")];
  egal("deux paragraphes ne sont pas du texte nu", texteNu(deux), null);
  const colore: ContenuRiche = [
    { type: "paragraph", props: { backgroundColor: "red" }, content: [] },
  ];
  egal("un paragraphe surligné n'est pas du texte nu", texteNu(colore), null);
  const neutre: ContenuRiche = [
    {
      type: "paragraph",
      props: { textColor: "default", backgroundColor: "default", textAlignment: "left" },
      content: [{ type: "text", text: "brut", styles: {} }],
    },
  ];
  egal("les props par défaut de BlockNote restent du texte nu", texteNu(neutre), "brut");

  // Le résumé : c'est lui qui part dans `designation` — donc dans l'index,
  // l'export et le futur PDF. Il ne doit JAMAIS être vide.
  egal("résumé d'un texte simple", resumeTexteLigne(amorce), "Prestations incluses");
  egal("résumé d'un document vide → repli", resumeTexteLigne([]), "Commentaire");
  egal("résumé : le repli est paramétrable", resumeTexteLigne([], "Note"), "Note");
  const riche: ContenuRiche = [
    { type: "heading", content: [{ type: "text", text: "Mise en service", styles: {} }] },
    { type: "bulletListItem", content: [{ type: "text", text: "Paramétrage", styles: {} }] },
  ];
  egal("résumé d'un document riche : le texte de tous les blocs", resumeTexteLigne(riche), "Mise en service Paramétrage");
  verifier(
    "résumé borné (une désignation n'est pas un roman)",
    resumeTexteLigne(contenuTexteSimple("x".repeat(400))).length <= 160,
  );
}

/* =============================================================================
 * 14. LA MARGE APRÈS REMISE GLOBALE
 * La remise globale porte sur le TOTAL, pas sur les lignes : l'ignorer
 * surestimerait la marge exactement au moment où l'on vient de lâcher du prix.
 * ========================================================================== */
console.log("\n14. Marge nette de la remise globale");

{
  // Fourniture 10 000 (déboursé 6 000) + une prestation à 10 000 : la
  // fourniture pèse la moitié du vendu, elle encaisse donc la moitié de la
  // remise.
  const lignes = [
    ligne({ pvUnitaireCents: 1000000, debourseCents: 600000 }),
    ligne({ genre: "PRESTATION", produitId: null, debourseCents: null, pvUnitaireCents: 1000000 }),
  ];
  const t = calculerDevis({ ...ENTETE_NU, remiseGlobalePourMille: 100 }, [], lignes);
  egal("total HT", t.totalHtCents, 2000000);
  egal("remise globale 10 %", t.remiseGlobaleCents, 200000);
  egal("marge BRUTE (avant remise)", t.margeFournitureCents, 400000);
  egal("… la fourniture n'encaisse que SA part de remise", t.venduFournitureNetCents, 900000);
  egal("marge NETTE", t.margeFournitureNetteCents, 300000);
  verifier(
    "la marge nette est bien inférieure à la brute",
    t.margeFournitureNetteCents < t.margeFournitureCents,
  );
}
{
  // Sans remise globale, net et brut coïncident : rien ne change à l'écran
  // pour l'immense majorité des devis.
  const t = calculerDevis(ENTETE_NU, [], [ligne({ pvUnitaireCents: 10000, debourseCents: 6000 })]);
  egal("sans remise, net = brut", t.margeFournitureNetteCents, t.margeFournitureCents);
}

/* =============================================================================
 * 15. LE PRIX CIBLE — l'inverse du chiffrage
 * ========================================================================== */
console.log("\n15. Prix cible");

{
  const base = { totalHtCents: 2000000, venduFournitureCents: 1000000, debourseCents: 600000 };
  const s1 = simulerPrixCible(base, 1800000);
  egal("remise nécessaire pour viser 18 000", s1.remiseCents, 200000);
  egal("… soit 10 %", s1.remisePourMille, 100);
  egal("… marge restante, remise encaissée au prorata", s1.margeNetteCents, 300000);
  verifier("… et ce n'est pas à perte", !s1.aPerte);

  // Le cas qui doit crier : viser si bas qu'on vend la fourniture à perte.
  const s2 = simulerPrixCible(base, 1100000);
  verifier("viser trop bas est signalé à perte", s2.aPerte);
  verifier("… avec une marge négative", (s2.margeNetteCents ?? 0) < 0);

  // Une cible AU-DESSUS du total ne doit pas produire une remise négative :
  // un devis ne se gonfle pas par une remise, on remonte les prix.
  const s3 = simulerPrixCible(base, 2500000);
  verifier("cible au-dessus du total : signalée", s3.cibleAuDessus);
  egal("… et aucune remise proposée", s3.remiseCents, 0);

  // Sans aucun déboursé connu, on ne prétend pas simuler une marge.
  const s4 = simulerPrixCible({ ...base, debourseCents: 0 }, 1800000);
  egal("aucun déboursé → pas de marge simulée", s4.margeNetteCents, null);
  egal("… mais la remise reste calculable", s4.remiseCents, 200000);
}
{
  // La cohérence qui compte : appliquer la remise simulée doit donner
  // exactement la marge annoncée.
  const lignes = [
    ligne({ pvUnitaireCents: 1000000, debourseCents: 600000 }),
    ligne({ genre: "PRESTATION", produitId: null, debourseCents: null, pvUnitaireCents: 1000000 }),
  ];
  const t0 = calculerDevis(ENTETE_NU, [], lignes);
  const sim = simulerPrixCible(t0, 1700000);
  const t1 = calculerDevis(
    { ...ENTETE_NU, remiseGlobaleCents: sim.remiseCents },
    [],
    lignes,
  );
  egal("la cible est atteinte au centime", t1.netHtCents, 1700000);
  egal("la marge annoncée est celle obtenue", t1.margeFournitureNetteCents, sim.margeNetteCents);
}

/* --- La charge en main d'œuvre --------------------------------------------- *
 * « 58 000 € » ne dit pas si l'on part pour trois jours ou pour trois semaines.
 * L'information est dans les lignes ; ce qui compte, c'est ce qu'on N'Y MET PAS.
 * -------------------------------------------------------------------------- */
console.log("\n▸ La charge en main d'œuvre");
{
  const p = (unite: string, q: number, extra: Partial<LigneDevisVue> = {}) =>
    ligne({
      genre: "PRESTATION",
      produitId: null,
      debourseCents: null,
      unite,
      quantiteMillieme: q,
      ...extra,
    });

  const c = chargeMainOeuvre([
    p("h", 7500),
    p("h", 2500),
    p("j", 3000),
    p("forfait", 1000),
    // Ni les articles ni les textes ne sont du travail.
    ligne({ pvUnitaireCents: 10000, unite: "U", quantiteMillieme: 12000 }),
    ligne({ genre: "TEXTE", produitId: null, unite: "U", quantiteMillieme: 5000 }),
    // Une option n'est pas engagée tant que le client ne l'a pas prise.
    p("h", 40000, { option: true }),
  ]);

  egal("les heures sont totalisées", c.find((x) => x.unite === "h")?.quantiteMillieme, 10000);
  egal("les jours restent des jours (aucune conversion)", c.find((x) => x.unite === "j")?.quantiteMillieme, 3000);
  egal("les articles n'entrent pas dans la charge", c.some((x) => x.unite === "U"), false);
  egal("les options non plus", c.find((x) => x.unite === "h")?.quantiteMillieme !== 50000, true);
  egal("les unités de temps passent devant", c[0]?.unite, "j");
  egal("un devis sans prestation ne montre rien", chargeMainOeuvre([ligne({})]).length, 0);
  egal(
    "une prestation à quantité nulle ne fait pas une ligne vide",
    chargeMainOeuvre([p("h", 0)]).length,
    0,
  );
}

/* =============================================================================
 * 16. LE DOCUMENT CLIENT (docs/DEVIS.md §21)
 *
 * Ce qu'un client verra est décidé par des fonctions pures : c'est donc ici,
 * sans base ni navigateur, qu'on vérifie qu'un déboursé ne peut pas sortir, que
 * les options ne s'additionnent jamais et qu'un lot vidé ne laisse pas un titre
 * orphelin.
 * ========================================================================== */
console.log("\n16. Le document client");

{
  const lots: LotDevisVue[] = [
    lot({ id: "L1", titre: "Fourniture", ordre: 1000, note: "Matériel Distech" }),
    lot({ id: "L2", titre: "Main d'œuvre", ordre: 2000, note: "" }),
    lot({ id: "L3", titre: "Rien que des options", ordre: 3000, note: "" }),
  ];
  const lignes = [
    ligne({ lotId: "L1", pvUnitaireCents: 100000, quantiteMillieme: 2000 }),
    ligne({ lotId: "L1", genre: "TEXTE", produitId: null, designation: "Suivant schéma joint" }),
    ligne({ lotId: "L2", genre: "PRESTATION", produitId: null, pvUnitaireCents: 60000, debourseCents: null }),
    // Une option dans un lot qui porte AUSSI du ferme.
    ligne({ lotId: "L2", pvUnitaireCents: 50000, option: true }),
    // Un lot qui ne porte QUE des options.
    ligne({ lotId: "L3", pvUnitaireCents: 30000, option: true }),
  ];
  const t = calculerDevis(ENTETE_NU, lots, lignes);

  const doc = documentClient(t, PUBLICATION_DEFAUT);
  egal("les lots vides d'ordinaire disparaissent", doc.lots.length, 2);
  egal("… celui qui n'avait que des options n'est plus là", doc.lots.some((l) => l.titre === "Rien que des options"), false);
  egal("les options sont ramassées en fin de document", doc.options.length, 2);
  egal("… avec le lot d'où elles viennent", doc.options[0]?.lot, "Main d'œuvre");
  egal("… et leur total reste À PART", doc.optionsCents, 80000);
  egal("le total du devis les ignore", t.totalHtCents, 260000);
  egal("le texte libre reste dans le lot, à sa place", doc.lots[0]?.lignes.length, 2);
  egal("les sous-totaux s'affichent (plusieurs lots)", doc.avecSousTotaux, true);

  // Taire les options les retire du document — sans jamais toucher au total.
  const sansOptions = documentClient(t, { ...PUBLICATION_DEFAUT, montrerOptions: false });
  egal("options tues → aucune n'est listée", sansOptions.options.length, 0);
  egal("… leur montant reste connu de l'appelant", sansOptions.optionsCents, 80000);
  egal("… et le total n'a pas bougé d'un centime", t.totalHtCents, 260000);

  // Le repli « prix par lot seulement ».
  const sansPu = documentClient(t, { ...PUBLICATION_DEFAUT, montrerPrixUnitaires: false });
  egal("prix unitaires masqués", sansPu.avecPrixLigne, false);
  egal("… les lignes restent listées", sansPu.lots[0]?.lignes.length, 2);
  egal("… et le sous-total de lot reste, lui", sansPu.lots[0]?.sousTotalCents, 200000);
}

{
  // Un sous-total de lot sur un devis d'UN SEUL lot répéterait le total HT juste
  // au-dessus de lui : il ne s'affiche pas, même demandé.
  const lots: LotDevisVue[] = [lot({ id: "L1", titre: "Tout", ordre: 1000, note: "" })];
  const t = calculerDevis(ENTETE_NU, lots, [ligne({ lotId: "L1", pvUnitaireCents: 10000 })]);
  egal("un seul lot → pas de sous-total", documentClient(t, PUBLICATION_DEFAUT).avecSousTotaux, false);
}

{
  // Le devis vide : rien à publier, et il faut pouvoir le dire.
  const t = calculerDevis(ENTETE_NU, [], []);
  egal("un devis sans ligne est un document vide", documentVide(documentClient(t, PUBLICATION_DEFAUT)), true);

  const tTexte = calculerDevis(ENTETE_NU, [], [ligne({ genre: "TEXTE", produitId: null })]);
  egal(
    "un devis qui ne porte qu'un commentaire est vide lui aussi",
    documentVide(documentClient(tTexte, PUBLICATION_DEFAUT)),
    true,
  );
}

console.log("\n▸ L'acompte, la validité, les mentions");
{
  egal("acompte 50 % d'un TTC de 2 136,00 €", acompteCents(213600, 500), 106800);
  egal("acompte 33,3 % — arrondi à la ligne comme le reste", acompteCents(100000, 333), 33300);
  egal("aucun acompte réglé → aucune ligne sur le document", acompteCents(213600, 0), 0);
  egal("un devis à zéro n'affiche pas d'acompte", acompteCents(0, 500), 0);

  const etabli = new Date("2026-06-26T10:00:00.000Z");
  egal("validité 30 jours", dateValidite(etabli, 30).toISOString().slice(0, 10), "2026-07-26");
  egal("validité 0 jour = le jour même", dateValidite(etabli, 0).toISOString().slice(0, 10), "2026-06-26");

  const durees = dureesPartageDevis(45);
  egal("la première durée offerte suit la validité de l'offre", durees[0].heures, 45 * 24);
  egal("… et c'est le défaut", durees[0].id, DUREE_PARTAGE_DEVIS_DEFAUT);
  verifier(
    "aucune durée illimitée : un lien ne survit pas à l'offre qu'il porte",
    durees.every((d) => d.heures !== null),
  );

  const m = mentionsLegales(SOCIETE_DEFAUT);
  egal("le pied de page tient en trois lignes", m.length, 3);
  verifier("… la première nomme la maison", m[0].startsWith("DUMORTIER"));
  verifier("… la dernière porte le RCS et la TVA", m[2].includes("RCS") && m[2].includes("TVA"));

  // Une maison à moitié renseignée ne doit pas produire de séparateurs orphelins.
  const partielle = { ...SOCIETE_DEFAUT, formeCapital: "", telephone: "", codeApe: "", siteWeb: "" };
  const mp = mentionsLegales(partielle);
  verifier("aucune mention vide ne laisse de « · » perdu", mp.every((l) => !l.includes("· ·") && !l.trim().endsWith("·")));
  egal("le nom seul reste le nom seul", mp[0], "DUMORTIER");
}

console.log("\n▸ Le pavé destinataire");
{
  egal(
    "les lignes saisies sont reprises telles quelles",
    lignesDestinataire("BETON AERO CLIM\n30 RUE DE LA GARE\n02350 CHIVRES", "Autre").length,
    3,
  );
  egal(
    "les lignes vides sautent",
    lignesDestinataire("BETON AERO CLIM\n\n  \n30 RUE DE LA GARE", "x").length,
    2,
  );
  egal(
    "pavé vide → le nom du client",
    lignesDestinataire("   ", "SOCIÉTÉ NOUVELLE HENRI CONRAUX")[0],
    "SOCIÉTÉ NOUVELLE HENRI CONRAUX",
  );
  egal("ni pavé ni client → rien plutôt qu'une ligne blanche", lignesDestinataire("", "").length, 0);
}

console.log("\n▸ Les médias d'un texte libre passent par le jeton");
{
  const contenu = [
    { type: "paragraph", content: [{ type: "text", text: "Photo :", styles: {} }] },
    { type: "image", props: { url: "/api/devis/media/abc-123", caption: "" } },
  ] as ContenuRiche;
  const reecrit = JSON.stringify(reecrireMediasPublicsDevis(contenu, "JETON-DE-TEST-0123456789"));
  verifier(
    "l'URL interne est remplacée par la route publique scopée",
    reecrit.includes("/api/public/devis/JETON-DE-TEST-0123456789/media/abc-123"),
  );
  verifier(
    "… et plus aucune URL interne ne subsiste (garde Achats)",
    !reecrit.includes("/api/devis/media/"),
  );
}

/* =============================================================================
 * LE BLOC FORFAITAIRE — condenserLots() (docs/DEVIS-DETAIL.md)
 *
 * Un lot « CONDENSE » ne montre au client qu'une ligne de synthèse à son
 * sous-total. Ce qui se vérifie ici n'est pas l'affichage — c'est que le PRIX ne
 * bouge pas d'un centime, et que le détail ne traverse pas.
 * ========================================================================== */
console.log("\n12. Le bloc forfaitaire");

{
  const lots = [
    lot({
      id: "L1",
      titre: "Matériel Distech + MO",
      ordre: 1000,
      rendu: "CONDENSE",
      libelleClient: "DÉPOSE DE L'ANCIENNE RÉGULATION, POSE ET RACCORDEMENT",
      note: "2× départ pour pompe\n4× pilotage V3V",
    }),
    lot({ id: "L2", titre: "Équipements de terrain", ordre: 2000 }),
  ];
  const lignes = [
    ligne({ lotId: "L1", designation: "ECY-S1000-C50", pvUnitaireCents: 186750, ordre: 1000 }),
    ligne({ lotId: "L1", designation: "EXTENSION 4UI4UO", pvUnitaireCents: 30375, ordre: 2000 }),
    // Une remise de ligne DANS le bloc : elle doit être encaissée dans la
    // synthèse, pas reportée sur elle (sinon elle s'appliquerait deux fois).
    ligne({
      lotId: "L1",
      designation: "Programmation",
      pvUnitaireCents: 222000,
      remisePourMille: 100,
      ordre: 3000,
    }),
    ligne({ lotId: "L1", genre: "TEXTE", designation: "note interne", ordre: 3500 }),
    ligne({
      lotId: "L1",
      designation: "Écran ECY-DISPLAY-15",
      pvUnitaireCents: 178050,
      option: true,
      ordre: 4000,
    }),
    ligne({ lotId: "L2", designation: "Sonde extérieure", pvUnitaireCents: 5625, ordre: 5000 }),
  ];

  const avant = calculerDevis(ENTETE_NU, lots, lignes);
  const condensees = condenserLots(ENTETE_NU, lots, lignes);
  const apres = calculerDevis(ENTETE_NU, lots, condensees);

  // ── L'INVARIANT. Si celui-ci tient, le client reçoit le bon prix ; tout le
  //    reste n'est que mise en page.
  egal("le total HT est conservé au centime", apres.totalHtCents, avant.totalHtCents);
  egal("… et les options aussi", apres.optionsCents, avant.optionsCents);

  const synthese = condensees.filter((l) => l.lotId === "L1" && !l.option);
  egal("un bloc forfaitaire ne rend qu'UNE ligne", synthese.length, 1);
  egal(
    "… au sous-total du lot",
    synthese[0].pvUnitaireCents,
    avant.lots.find((g) => g.lot?.id === "L1")?.sousTotalCents,
  );
  egal("… portant la phrase du client", synthese[0].designation, lots[0].libelleClient);
  egal("… en forfait, quantité 1", synthese[0].unite, "forfait");
  egal("… sans remise reportée (elle est déjà dans le sous-total)", synthese[0].remisePourMille, 0);
  egal("… et CHIFFRÉE, donc le document n'est pas vide", synthese[0].genre, "LIBRE");

  const texte = JSON.stringify(condensees);
  verifier("aucune désignation du bloc ne traverse", !texte.includes("ECY-S1000-C50"));
  verifier("… ni la programmation", !texte.includes("Programmation"));
  verifier("les lignes TEXTE du bloc sont absorbées", !texte.includes("note interne"));
  // Témoin négatif : un test de fuite qui passe sur une charge vide ne vaut rien.
  verifier("… mais le bloc DÉTAILLÉ voisin est intact", texte.includes("Sonde extérieure"));
  verifier("… et l'option ressort nommément (elle perce le bloc, c'est voulu)", texte.includes("ECY-DISPLAY-15"));

  // Idempotence : la garde s'applique DANS la requête publique ET dans le
  // document. Il faut donc pouvoir condenser deux fois sans rien changer.
  const deuxFois = condenserLots(ENTETE_NU, lots, condensees);
  egal("condenser deux fois ne change plus rien", JSON.stringify(deuxFois), texte);

  const doc = documentClient(apres, PUBLICATION_DEFAUT);
  const blocDoc = doc.lots.find((l) => l.lignes.some((x) => x.ligne.lotId === "L1"));
  egal("le document sait que le bloc est condensé", blocDoc?.condense, true);
  egal("… et n'imprime PAS son titre en plus de la phrase", blocDoc?.titre, null);
  egal("un bloc détaillé garde le sien", doc.lots.find((l) => l.titre)?.titre, "Équipements de terrain");
}

{
  // Sans aucun bloc forfaitaire, la fonction ne doit RIEN faire — c'est le cas
  // de tous les devis existants.
  const lots = [lot({ id: "L1", titre: "Tout", ordre: 1000 })];
  const lignes = [ligne({ lotId: "L1", pvUnitaireCents: 10000 })];
  egal(
    "un devis sans forfait traverse inchangé",
    JSON.stringify(condenserLots(ENTETE_NU, lots, lignes)),
    JSON.stringify(lignes),
  );
}

{
  // Un bloc forfaitaire qui ne porte QUE du texte : sa synthèse vaudrait 0 €.
  // « Ensemble … 0,00 € » est pire que rien — le document le fait disparaître.
  const lots = [lot({ id: "L1", titre: "Vide", ordre: 1000, rendu: "CONDENSE" })];
  const lignes = [ligne({ lotId: "L1", genre: "TEXTE", designation: "juste un mot" })];
  const t = calculerDevis(ENTETE_NU, lots, condenserLots(ENTETE_NU, lots, lignes));
  egal("un bloc forfaitaire sans rien à chiffrer disparaît", documentClient(t, PUBLICATION_DEFAUT).lots.length, 0);
}

{
  // ⚠️ LE PIÈGE : prix unitaires décochés + bloc forfaitaire. Sans la règle, le
  // client reçoit une phrase et AUCUN chiffre.
  const lots = [
    lot({ id: "L1", titre: "Forfait", ordre: 1000, rendu: "CONDENSE", libelleClient: "TRAVAUX" }),
  ];
  const lignes = [ligne({ lotId: "L1", pvUnitaireCents: 1240000 })];
  const t = calculerDevis(ENTETE_NU, lots, condenserLots(ENTETE_NU, lots, lignes));
  const doc = documentClient(t, { ...PUBLICATION_DEFAUT, montrerPrixUnitaires: false });
  egal("prix masqués : le bloc reste marqué condensé", doc.lots[0].condense, true);
  egal("… et c'est LUI qui décide d'afficher son montant", doc.avecPrixLigne || doc.lots[0].condense, true);
  egal(
    "… sans sous-total en double dessous (un seul lot de toute façon)",
    doc.avecSousTotaux,
    false,
  );
}

{
  // La VUE INTERNE (le bordereau) : même devis, rien de caché.
  const lots = [
    lot({ id: "L1", titre: "Matériel", ordre: 1000, rendu: "CONDENSE", libelleClient: "TRAVAUX" }),
  ];
  const lignes = [ligne({ lotId: "L1", designation: "ECY-S1000", pvUnitaireCents: 186750 })];
  const t = calculerDevis(ENTETE_NU, lots, lignes);
  const doc = documentClient(t, PUBLICATION_DEFAUT, true);
  egal("vue interne : le bloc n'est pas traité en condensé", doc.lots[0].condense, false);
  egal("… son titre revient", doc.lots[0].titre, "Matériel");
  verifier(
    "… et le détail est là",
    doc.lots[0].lignes.some((l) => l.ligne.designation === "ECY-S1000"),
  );
}

console.log("\n▸ Les puces : une ligne saisie = une puce");
{
  egal("les lignes vides sautent", puces("a\n\n  \nb").length, 2);
  egal("un tiret déjà tapé n'est pas doublé", puces("- 2× départ")[0], "2× départ");
  egal("une puce déjà tapée non plus", puces("• 4× V3V")[0], "4× V3V");
  egal("rien à dire → rien", puces("   ").length, 0);
}

console.log("\n▸ La désignation du client");
{
  const l = lot({ id: "x", titre: "Interne", ordre: 0, libelleClient: "  CE QUE LE CLIENT LIT  " });
  egal("la phrase du client gagne", designationClient(l), "CE QUE LE CLIENT LIT");
  egal(
    "… et à défaut, le titre du bloc sert de repli",
    designationClient(lot({ id: "y", titre: "Interne", ordre: 0 })),
    "Interne",
  );
}

/* --- Verdict --------------------------------------------------------------- */

console.log(`\n${ok + ko} contrôles — ${ok} ✔  ${ko} ✘`);
if (ko > 0) process.exit(1);
console.log("Le moteur de devis tient ses invariants.\n");
