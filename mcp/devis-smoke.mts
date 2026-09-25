// L'OUTIL DEVIS À TRAVERS LE MCP — contrôles de bout en bout, sur la VRAIE base.
//   Lancer depuis la racine du repo : npx tsx mcp/devis-smoke.mts
//
// Ce que ce script cherche d'abord, c'est ce qui se ferait EN SILENCE : un
// produit créé au Magasin parce qu'une IA a cité une référence inconnue, une
// ligne posée à 0 € sans que personne ne le dise, une affaire fantôme née d'un
// n° Why mal tapé, un vrai numéro DT consommé par un test. Aucun de ces défauts
// ne lève d'erreur — ils se constatent, d'où les témoins négatifs.
//
// Tout ce qui est posé est retiré à la fin, y compris le compteur de l'année
// fictive 2099 et le produit créé par le test « demande explicite ».
import "dotenv/config";
import "./sans-server-only.mts";
import { prisma } from "../src/lib/db";
import {
  addDevisLignes,
  addDevisLot,
  createAffaire,
  createDevis,
  createProduit,
  deleteDevis,
  deleteDevisLigne,
  duplicateDevis,
  getAffaire,
  getClient,
  getDevisMcp,
  listDevis,
  refreshDevisPrix,
  reprendreBomDevis,
  reviseDevis,
  searchArticlesDevis,
  updateDevis,
  updateDevisLigne,
  updateDevisLot,
  type LigneDevisAjoutMcp,
} from "./data.mts";

/** Compteur fictif : les numéros DT de l'année réelle ne sont pas touchés. */
const ANNEE_TEST = 2099;
const WHY_TEST = "TEST-DEVIS-000";
const REF_INCONNUE = "ZZ-INCONNU-MCP-0001";
const REF_PRODUIT_TEST = "ZZ-SMOKE-MCP-PRODUIT";

let nbOk = 0;
function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error("ASSERT: " + msg);
  nbOk += 1;
  console.log("  ✓ " + msg);
}

async function rejete(fn: () => Promise<unknown>, motif: RegExp, msg: string): Promise<void> {
  try {
    await fn();
  } catch (e) {
    const texte = e instanceof Error ? e.message : String(e);
    if (!motif.test(texte)) throw new Error(`ASSERT: ${msg} — rejeté, mais pour une autre raison : ${texte}`);
    nbOk += 1;
    console.log(`  ✓ ${msg}`);
    return;
  }
  throw new Error(`ASSERT: ${msg} — aurait dû être rejeté`);
}

/** Tout ce qu'une écriture de devis ne doit JAMAIS faire grossir. */
async function referentiels() {
  const [produits, prestations, categories, fabricants, fournisseurs] = await Promise.all([
    prisma.produit.count(),
    prisma.prestation.count(),
    prisma.categorieProduit.count(),
    prisma.fabricant.count(),
    prisma.fournisseur.count(),
  ]);
  return { produits, prestations, categories, fabricants, fournisseurs };
}

const memes = (a: object, b: object) => JSON.stringify(a) === JSON.stringify(b);
const cents = (euros: number | null | undefined) => Math.round((euros ?? 0) * 100);

async function main() {
  const admin = await prisma.user.findFirst({
    where: { actif: true, role: "ADMIN" },
    select: { id: true },
  });
  if (!admin) throw new Error("Aucun compte ADMIN actif : le contrôle a besoin d'un auteur.");
  const auteur = admin.id;
  const posesDevis: string[] = [];
  const posesProduits: string[] = [];

  try {
    console.log("— Préparation —");
    const { id: affaireId } = await createAffaire({
      nom: "SMOKE DEVIS MCP (à supprimer)",
      clientNom: "SMOKE CLIENT DEVIS MCP",
      numeroWhy: WHY_TEST,
    });
    const article = await prisma.produit.findFirst({
      where: { actif: true, prixAchatCents: { not: null } },
      orderBy: { refInterne: "asc" },
      select: { id: true, refInterne: true, designation: true },
    });
    const prestation = await prisma.prestation.findFirst({
      where: { actif: true },
      orderBy: { ordre: "asc" },
      select: { id: true, libelle: true, prixVenteCents: true },
    });
    console.log(`  article témoin : ${article?.refInterne ?? "(aucun)"} · prestation : ${prestation?.libelle ?? "(aucune)"}`);
    const avant = await referentiels();

    console.log("— Création —");
    await rejete(
      () => createDevis({ numeroWhy: WHY_TEST }, null, { annee: ANNEE_TEST }),
      /aucun utilisateur identifié/,
      "écriture anonyme refusée (un devis est signé de son auteur)",
    );
    await rejete(
      () => createDevis({ numeroWhy: "N-EXISTE-PAS-999" }, auteur, { annee: ANNEE_TEST }),
      /Affaire introuvable/,
      "n° Why inconnu → refusé",
    );
    assert(
      (await prisma.chantier.count({ where: { numeroWhy: "N-EXISTE-PAS-999" } })) === 0,
      "… et aucune affaire fantôme créée",
    );

    const cree = await createDevis({ numeroWhy: WHY_TEST, titre: "SMOKE DEVIS MCP" }, auteur, {
      annee: ANNEE_TEST,
    });
    posesDevis.push(cree.id);
    assert(cree.numero?.startsWith("DT99"), `numéro pris sur le compteur fictif (${cree.numero})`);
    assert(cree.clientNom === "SMOKE CLIENT DEVIS MCP", "client repris de l'affaire");
    assert(cree.numeroWhy === WHY_TEST, "n° Why repris de l'affaire");

    console.log("— Lignes : la règle du Divers —");
    const lignes: LigneDevisAjoutMcp[] = [];
    if (article) {
      lignes.push({
        type: "article",
        ref: article.refInterne.toLowerCase(),
        designation: "LIBELLÉ QUI NE DOIT PAS SERVIR",
        quantite: 2,
        prixVente: 999,
      });
    }
    lignes.push(
      { type: "article", ref: REF_INCONNUE, designation: "Sonde radio exotique", quantite: 3 },
      { type: "article", designation: "Article cité sans référence" },
      { type: "prestation", ref: "99.99.99", designation: "Prestation absente du référentiel", prixVente: 120 },
    );
    if (prestation) {
      lignes.push({ type: "prestation", prestationId: prestation.id, quantite: 1.5, lotTitre: "SMOKE Main d'œuvre" });
    }
    lignes.push(
      { type: "divers", designation: "Coffret spécifique", debourse: 100, coef: 1.5 },
      { type: "divers", designation: "Déplacement lointain", prixVente: 250.5, unite: "forfait" },
      { type: "texte", texte: "Commentaire posé par le smoke" },
    );

    const ajout = (await addDevisLignes(cree.id, { lotTitre: "SMOKE Fourniture", lignes }, auteur))!;
    assert(ajout.ajoutees === lignes.length, `${ajout.ajoutees} lignes posées`);
    assert(memes(await referentiels(), avant), "TÉMOIN : aucun produit, prestation, catégorie, fabricant ni fournisseur créé");

    const parDesignation = (d: string) => ajout.lignes.find((l) => l.designation === d);
    if (article) {
      const l = ajout.lignes[0]!;
      assert(l.genre === "PRODUIT", "référence connue (casse ignorée) → ligne ARTICLE");
      assert(l.designation === article.designation, "… désignation reprise du MAGASIN, pas de la saisie");
      assert(l.prixIgnore === true && l.prixVenteUnitaire !== 999, "… prix fourni ignoré, et signalé");
    }
    const inconnue = parDesignation("Sonde radio exotique");
    assert(inconnue?.genre === "LIBRE", "référence inconnue → ligne DIVERS");
    assert(/absente du magasin/.test(String(inconnue?.passeeEnDivers)), "… avec la raison");
    assert(inconnue?.aChiffrer === true, "… et signalée à chiffrer (0 €)");
    const sansRef = parDesignation("Article cité sans référence");
    assert(sansRef?.genre === "LIBRE" && /désignation/.test(String(sansRef.passeeEnDivers)), "article sans référence → Divers (jamais d'appariement sur le libellé)");
    const prestaAbsente = parDesignation("Prestation absente du référentiel");
    assert(prestaAbsente?.genre === "LIBRE" && prestaAbsente.prixVenteUnitaire === 120, "prestation absente → Divers, au prix donné");
    if (prestation) {
      const p = ajout.lignes.find((l) => l.genre === "PRESTATION");
      assert(p?.prixVenteUnitaire === prestation.prixVenteCents / 100, "prestation trouvée → taux de vente du référentiel");
    }
    const coffret = parDesignation("Coffret spécifique");
    assert(coffret?.prixVenteUnitaire === 150, "Divers au déboursé : 100 € × 1,5 = 150 € (même chemin qu'un article)");
    assert(parDesignation("Déplacement lointain")?.prixVenteUnitaire === 250.5, "Divers au prix de vente direct (250,50 €)");
    assert(ajout.lignes.some((l) => l.genre === "TEXTE"), "commentaire posé");
    assert(ajout.passeesEnDivers?.length === 3, `3 lignes passées en Divers, listées à part (${ajout.passeesEnDivers?.length})`);
    assert(ajout.aChiffrer?.length === 2, "2 lignes à chiffrer, listées à part");
    assert(ajout.consignes.some((c) => /ANNONCER/.test(c)), "la consigne demande de l'annoncer à l'utilisateur");
    assert((ajout.lotsCrees?.length ?? 0) === (prestation ? 2 : 1), "lots créés par titre");

    const nbLignesAvantRejets = await prisma.ligneDevis.count({ where: { devisId: cree.id } });
    await rejete(
      () =>
        addDevisLignes(
          cree.id,
          {
            lignes: [
              { type: "divers", designation: "Ligne valide qui ne doit PAS être posée", prixVente: 10 },
              { type: "divers", designation: "Ligne fautive", prixVente: 10, coef: 1.2 },
            ],
          },
          auteur,
        ),
      /s'excluent/,
      "prixVente + coef → refusé",
    );
    await rejete(
      () => addDevisLignes(cree.id, { lignes: [{ type: "article", ref: REF_INCONNUE }] }, auteur),
      /aucune "designation"/,
      "article introuvable sans désignation de repli → refusé",
    );
    await rejete(
      () => addDevisLignes(cree.id, { lignes: [{ type: "divers", designation: "x", debourse: 10, coef: 135 }] }, auteur),
      /MULTIPLICATEUR/,
      "coef 135 (un pourcentage mal compris) → refusé",
    );
    assert(
      (await prisma.ligneDevis.count({ where: { devisId: cree.id } })) === nbLignesAvantRejets,
      "tout est validé AVANT d'écrire : aucune ligne posée par un appel refusé",
    );

    console.log("— Lecture —");
    const d1 = (await getDevisMcp(cree.id))!;
    assert(d1.totaux.nbDiversAChiffrer === 2, "get_devis → nbDiversAChiffrer = 2");
    assert(d1.alertes.some((a) => /Divers à 0 €/.test(a)), "… et l'alerte le dit");
    const toutes = d1.lots.flatMap((g) => g.lignes ?? []);
    const somme = toutes.reduce((n, l) => n + ("totalHt" in l && !("option" in l) ? cents(l.totalHt as number) : 0), 0);
    assert(somme === cents(d1.totaux.netHt), `Σ des lignes = net HT (${d1.totaux.netHt} €)`);
    const ligneInconnue = toutes.find((l) => "ref" in l && l.ref === REF_INCONNUE) as Record<string, unknown> | undefined;
    assert(!!ligneInconnue, "la référence citée reste sur la ligne Divers");
    assert(/Passée en Divers/.test(String(ligneInconnue?.note)), "… et la raison dans sa note interne");
    assert(d1.totaux.margeSurFourniture !== undefined, "la marge sur la fourniture existe (déboursé connu)");

    const liste = await listDevis({ numeroWhy: WHY_TEST });
    assert(liste.devis.some((x) => x.id === cree.id), "list_devis(numeroWhy) → trouvé");
    const affaire = (await getAffaire(affaireId))!;
    assert(affaire.devis.some((x) => x.id === cree.id), "get_affaire → le devis est rattaché");
    const client = (await getClient(affaire.clientId))!;
    assert(client.realisations.some((x) => x.id === cree.id), "get_client → le devis est une réalisation du client");

    if (article) {
      const recherche = await searchArticlesDevis(article.refInterne, { devisId: cree.id });
      const trouve = recherche.articles.find((a) => a.produitId === article.id);
      assert(!!trouve && typeof trouve.prixVenteEstime === "number", "search_articles → prix de vente estimé au coef du devis");
    }
    await rejete(() => searchArticlesDevis("x"), /2 caractères/, "recherche d'un caractère → refusée");

    console.log("— Modifications —");
    const majInconnue = (await updateDevisLigne(String(ligneInconnue!.id), { prixVente: 80 }, auteur))!;
    assert(majInconnue.ligne.prixVenteUnitaire === 80 && !majInconnue.ligne.aChiffrer, "Divers chiffré : 80 €, plus « à chiffrer »");
    assert(majInconnue.totaux.nbDiversAChiffrer === 1, "… il n'en reste qu'un");
    await rejete(
      () => updateDevisLigne(String(ligneInconnue!.id), { prixVente: 80, coef: 1.2 }, auteur),
      /s'excluent/,
      "update : prixVente + coef → refusé",
    );
    const majCoffret = (await updateDevisLigne(coffret!.id as string, { coef: 2 }, auteur))!;
    assert(majCoffret.ligne.prixVenteUnitaire === 200, "coef 2 sur un déboursé de 100 € → 200 €");
    const texte = ajout.lignes.find((l) => l.genre === "TEXTE")!;
    await rejete(() => updateDevisLigne(texte.id as string, { quantite: 2 }, auteur), /sans objet/, "quantité sur un commentaire → refusée");
    const majTexte = (await updateDevisLigne(texte.id as string, { texte: "Commentaire corrigé" }, auteur))!;
    assert(majTexte.ligne.texte === "Commentaire corrigé", "commentaire réécrit");

    await rejete(
      () => updateDevis(cree.id, { remiseGlobalePourcent: 5, remiseGlobaleMontant: 100 }, auteur),
      /EXCLUSIVE/,
      "remise en % ET en € → refusée",
    );
    const entete = (await updateDevis(cree.id, { remiseGlobalePourcent: 10, etat: "EMIS", coefDefaut: 1.4 }, auteur))!;
    assert(!!entete.emisLe, "EMIS pose la date d'émission");
    const t = entete.totaux as { totalHt: number; remiseGlobale: number };
    assert(Math.abs(cents(t.remiseGlobale) - Math.round(cents(t.totalHt) / 10)) <= 1, "remise globale 10 % du total HT");
    assert((await getDevisMcp(cree.id))!.coefDefaut === 1.4, "coefficient par défaut 1,4");

    const lot = (await addDevisLot(cree.id, { titre: "SMOKE Forfait", rendu: "CONDENSE", libelleClient: "ENSEMBLE GTB" }, auteur))!;
    const lotMaj = (await updateDevisLot(lot.id, { rendu: "DETAILLE" }, auteur))!;
    assert(lotMaj.rendu === "DETAILLE" && lotMaj.libelleClient === "ENSEMBLE GTB", "lot forfait → détaillé, phrase client gardée");

    const suppr = (await deleteDevisLigne(texte.id as string, auteur))!;
    assert(suppr.deleted, "ligne supprimée");

    const rafraichi = (await refreshDevisPrix(cree.id, undefined, auteur))!;
    assert(typeof rafraichi.misesAJour === "number", `rafraîchissement des prix (${rafraichi.misesAJour} mise(s) à jour)`);

    console.log("— Révision, copie, reprise de BOM —");
    const v2 = (await reviseDevis(cree.id, auteur))!;
    posesDevis.push(v2.id);
    assert(v2.numero === cree.numero && v2.revision === 2, `révision : même numéro, v2 (${v2.libelle})`);
    const copie = (await duplicateDevis(cree.id, auteur, { annee: ANNEE_TEST }))!;
    posesDevis.push(copie.id);
    assert(copie.numero !== cree.numero && copie.numero.startsWith("DT99"), `copie : numéro neuf (${copie.numero})`);

    const reprise = (await reprendreBomDevis(cree.id, {}, auteur))!;
    assert(reprise.articlesAjoutes === 0 && !reprise.passeesEnDivers, "affaire sans projet GTB : rien versé");
    const sansAffaire = await createDevis({ clientNom: "SMOKE CLIENT DEVIS MCP" }, auteur, { annee: ANNEE_TEST });
    posesDevis.push(sansAffaire.id!);
    await rejete(() => reprendreBomDevis(sansAffaire.id!, {}, auteur), /aucune affaire/, "reprise sur un devis sans affaire → refusée");

    console.log("— Créer un produit : sur demande explicite seulement —");
    await rejete(
      () => createProduit({ demandeExplicite: false, refInterne: REF_PRODUIT_TEST, designation: "x" }, auteur),
      /DEMANDE EXPLICITE/,
      "sans demande explicite → refusé",
    );
    await rejete(
      () => createProduit({ demandeExplicite: true, refInterne: REF_PRODUIT_TEST, designation: "x" }, "compte-inexistant"),
      /inconnu ou inactif/,
      "compte inconnu → refusé",
    );
    if (article) {
      await rejete(
        () => createProduit({ demandeExplicite: true, refInterne: article.refInterne, designation: "doublon" }, auteur),
        /existe déjà/,
        "référence interne déjà prise → refusé (l'id existant est rendu)",
      );
    }
    await rejete(
      () =>
        createProduit(
          { demandeExplicite: true, refInterne: REF_PRODUIT_TEST, designation: "x", categorie: "Catégorie Qui N'Existe Pas" },
          auteur,
        ),
      /inconnu\(e\) du référentiel/,
      "catégorie inconnue → refusé, rien créé",
    );
    assert(memes(await referentiels(), avant), "TÉMOIN : toujours aucun produit créé après les refus");

    const produit = await createProduit(
      { demandeExplicite: true, refInterne: REF_PRODUIT_TEST, designation: "SMOKE produit créé sur demande", prixAchat: 12.34 },
      auteur,
    );
    posesProduits.push(produit.produitId);
    assert(!!produit.produitId, "demande explicite + profil Admin → produit créé");
    const ajoutProduit = (await addDevisLignes(
      cree.id,
      { lignes: [{ type: "article", ref: REF_PRODUIT_TEST, designation: "repli" }] },
      auteur,
    ))!;
    const lp = ajoutProduit.lignes[0]!;
    assert(lp.genre === "PRODUIT" && lp.designation === "SMOKE produit créé sur demande", "… et désormais retrouvé comme ARTICLE");

    console.log("— Suppression —");
    await rejete(() => deleteDevis(cree.id, null), /aucun utilisateur identifié/, "suppression anonyme refusée");
    for (const id of [...posesDevis]) {
      assert(await deleteDevis(id, auteur), `devis ${id.slice(0, 8)}… supprimé`);
      posesDevis.splice(posesDevis.indexOf(id), 1);
    }
    assert((await getDevisMcp(cree.id)) === null, "get_devis après suppression → null");
  } finally {
    // --- Ménage : même en cas d'échec ------------------------------------------
    for (const id of posesDevis) await prisma.devis.delete({ where: { id } }).catch(() => {});
    for (const id of posesProduits) await prisma.produit.delete({ where: { id } }).catch(() => {});
    await prisma.compteurDevis.deleteMany({ where: { annee: ANNEE_TEST } });
    await prisma.chantier.deleteMany({ where: { numeroWhy: WHY_TEST } });
    const clients = await prisma.client.findMany({
      where: { nom: "SMOKE CLIENT DEVIS MCP" },
      select: { id: true, _count: { select: { chantiers: true, devis: true, affectations: true, notes: true, visites: true } } },
    });
    for (const c of clients) {
      if (Object.values(c._count).every((n) => n === 0)) await prisma.client.delete({ where: { id: c.id } });
    }
  }

  const restants = await prisma.devis.count({ where: { numero: { startsWith: "DT99" } } });
  assert(restants === 0, "base propre : plus aucun devis de test, compteur fictif retiré");

  console.log(`\n${nbOk} CONTRÔLES PASSENT ✅`);
  process.exit(0);
}

main().catch((e) => {
  console.error("\nÉCHEC:", e);
  process.exit(1);
});
