"use server";

import ExcelJS from "exceljs";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import type { CategorieProduit as CategorieProduitDb } from "@/generated/prisma/enums";
import {
  CHAMPS,
  type GenreImport,
  type GrilleImport,
  type LignePreview,
  type ResultatImport,
} from "./import-model";
import { CATEGORIE_LABEL, estCategorie, peutGererReferentiel } from "./model";
import { construireCsv } from "./modele-import";

/* =============================================================================
 * LE MOTEUR D'IMPORT
 *
 * Un seul moteur pour les deux reprises (produits, stock initial), et
 * deux garde-fous non négociables :
 *
 *  - CLÉ D'UPSERT : refInterne d'abord, refFabricant en repli. Une ligne sans
 *    clé reconnue est une CRÉATION, jamais une modification silencieuse.
 *  - APERÇU AVANT ÉCRITURE : previsualiserImport() et appliquerImport() font
 *    exactement le même calcul ; la première n'écrit rien. Ce que l'écran
 *    montre est donc littéralement ce qui va se passer.
 * ========================================================================== */

/** Au-delà, on tronque : un import de magasin n'a aucune raison d'être énorme,
 *  et une grille qui traverse le réseau doit rester manipulable. */
const MAX_LIGNES = 5000;

async function acteurAchats(): Promise<string> {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) throw new Error("Non authentifié");
  if (!peutGererReferentiel(session?.user?.role)) {
    throw new Error("L'import est réservé aux profils Achats et Administrateur");
  }
  return id;
}

/* --- Lecture du fichier ---------------------------------------------------- */

/** Sépare une ligne CSV en respectant les guillemets. */
function decouperCsv(texte: string, sep: string): string[][] {
  const lignes: string[][] = [];
  let champ = "";
  let ligne: string[] = [];
  let dansGuillemets = false;

  for (let i = 0; i < texte.length; i++) {
    const c = texte[i];
    if (dansGuillemets) {
      if (c === '"') {
        if (texte[i + 1] === '"') {
          champ += '"';
          i++;
        } else dansGuillemets = false;
      } else champ += c;
      continue;
    }
    if (c === '"') dansGuillemets = true;
    else if (c === sep) {
      ligne.push(champ);
      champ = "";
    } else if (c === "\n") {
      ligne.push(champ);
      lignes.push(ligne);
      ligne = [];
      champ = "";
    } else if (c !== "\r") champ += c;
  }
  if (champ !== "" || ligne.length > 0) {
    ligne.push(champ);
    lignes.push(ligne);
  }
  return lignes;
}

/** `;` en France, `,` ailleurs, tabulation quand ça vient d'un copier-coller. */
function detecterSeparateur(texte: string): string {
  const premiere = texte.split("\n")[0] ?? "";
  const scores: [string, number][] = [
    [";", (premiere.match(/;/g) ?? []).length],
    [",", (premiere.match(/,/g) ?? []).length],
    ["\t", (premiere.match(/\t/g) ?? []).length],
  ];
  scores.sort((a, b) => b[1] - a[1]);
  return scores[0][1] > 0 ? scores[0][0] : ";";
}

/**
 * Décode en UTF-8 et retombe sur Windows-1252 si le résultat est du charabia —
 * les exports Excel français sortent encore massivement en latin-1.
 */
function decoder(buffer: Buffer): string {
  const utf8 = new TextDecoder("utf-8", { fatal: false }).decode(buffer);
  const suspect = utf8.includes("�") || /Ã[©¨¢ª«¯°]|Â[°§]/.test(utf8);
  if (!suspect) return utf8;
  return new TextDecoder("windows-1252").decode(buffer);
}

function celluleEnTexte(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (v instanceof Date) return v.toLocaleDateString("fr-FR");
  const obj = v as { text?: string; result?: unknown; richText?: { text: string }[] };
  if (typeof obj.text === "string") return obj.text.trim();
  if (Array.isArray(obj.richText)) return obj.richText.map((r) => r.text).join("").trim();
  if (obj.result !== undefined) return celluleEnTexte(obj.result);
  return String(v).trim();
}

/** Lit un CSV ou un XLSX et renvoie la grille brute (en-tête + lignes). */
export async function lireFichier(formData: FormData): Promise<GrilleImport> {
  await acteurAchats();

  const fichier = formData.get("fichier");
  if (!(fichier instanceof File)) throw new Error("Aucun fichier reçu");
  const nomFichier = fichier.name;
  const buffer = Buffer.from(await fichier.arrayBuffer());

  let grille: string[][];
  if (/\.xlsx?$/i.test(nomFichier)) {
    const wb = new ExcelJS.Workbook();
    // exceljs embarque sa propre définition de Buffer, plus ancienne que celle
    // de @types/node : le cast évite un faux conflit de types.
    await wb.xlsx.load(buffer as unknown as Parameters<typeof wb.xlsx.load>[0]);
    const ws = wb.worksheets[0];
    if (!ws) throw new Error("Le classeur ne contient aucune feuille");
    grille = [];
    ws.eachRow((row) => {
      const valeurs = Array.isArray(row.values) ? row.values.slice(1) : [];
      grille.push(valeurs.map(celluleEnTexte));
    });
  } else {
    const texte = decoder(buffer);
    grille = decouperCsv(texte, detecterSeparateur(texte));
  }

  // Lignes entièrement vides : ni en-tête ni donnée, elles ne servent à rien.
  grille = grille.filter((l) => l.some((c) => c.trim() !== ""));
  if (grille.length === 0) throw new Error("Fichier vide");

  const colonnes = grille[0].map((c, i) => c.trim() || `Colonne ${i + 1}`);
  const toutes = grille.slice(1);
  const lignes = toutes.slice(0, MAX_LIGNES);

  return {
    nomFichier,
    colonnes,
    lignes: lignes.map((l) => colonnes.map((_, i) => (l[i] ?? "").trim())),
    total: toutes.length,
    tronquee: toutes.length > MAX_LIGNES,
  };
}

/* --- Traitement ------------------------------------------------------------ */

function nombre(v: string): number | null {
  const brut = v.replace(/[\s €]/g, "");
  if (!brut) return null;
  // « 1.234,56 » (format français) vs « 1,234.56 » (anglo-saxon).
  const normalise =
    brut.includes(",") && brut.includes(".")
      ? brut.lastIndexOf(",") > brut.lastIndexOf(".")
        ? brut.replace(/\./g, "").replace(",", ".")
        : brut.replace(/,/g, "")
      : brut.replace(",", ".");
  const n = Number(normalise);
  return Number.isFinite(n) ? n : null;
}

function categorieDepuis(v: string): CategorieProduitDb | null {
  const brut = v.trim().toUpperCase();
  if (!brut) return null;
  if (estCategorie(brut)) return brut as CategorieProduitDb;
  const table: Record<string, CategorieProduitDb> = {
    AUTOMATE: "AUTOMATE",
    CONTROLEUR: "AUTOMATE",
    MODULE: "MODULE",
    EXTENSION: "MODULE",
    SONDE: "SONDE",
    CAPTEUR: "SONDE",
    VANNE: "VANNE",
    SERVOMOTEUR: "SERVOMOTEUR",
    MOTEUR: "SERVOMOTEUR",
    RESEAU: "RESEAU",
    ACCESSOIRE: "ACCESSOIRE",
  };
  const sansAccent = brut.normalize("NFD").replace(/[̀-ͯ]/g, "");
  for (const [cle, valeur] of Object.entries(table)) {
    if (sansAccent.includes(cle)) return valeur;
  }
  return null;
}

export interface ParamsImport {
  genre: GenreImport;
  /** champ → index de colonne dans la grille. */
  mapping: Record<string, number>;
  lignes: string[][];
  nomFichier?: string;
}

interface Contexte {
  produitsParRefInterne: Map<string, { id: string; refInterne: string }>;
  produitsParRefFabricant: Map<string, { id: string; refInterne: string }>;
  depotsParCle: Map<string, string>;
  depotParDefaut: string | null;
  fournisseursParNom: Map<string, string>;
}

async function chargerContexte(): Promise<Contexte> {
  const [produits, depots, fournisseurs] = await Promise.all([
    prisma.produit.findMany({ select: { id: true, refInterne: true, refFabricant: true } }),
    prisma.depot.findMany({ select: { id: true, nom: true, code: true, dortoir: true, actif: true } }),
    prisma.fournisseur.findMany({ select: { id: true, nom: true } }),
  ]);

  const produitsParRefInterne = new Map<string, { id: string; refInterne: string }>();
  const produitsParRefFabricant = new Map<string, { id: string; refInterne: string }>();
  for (const p of produits) {
    produitsParRefInterne.set(p.refInterne.toLowerCase(), p);
    if (p.refFabricant) produitsParRefFabricant.set(p.refFabricant.toLowerCase(), p);
  }

  const depotsParCle = new Map<string, string>();
  for (const d of depots) {
    depotsParCle.set(d.nom.toLowerCase(), d.id);
    depotsParCle.set(d.code.toLowerCase(), d.id);
  }
  const tenu = depots.find((d) => !d.dortoir && d.actif);

  return {
    produitsParRefInterne,
    produitsParRefFabricant,
    depotsParCle,
    depotParDefaut: tenu?.id ?? depots[0]?.id ?? null,
    fournisseursParNom: new Map(fournisseurs.map((f) => [f.nom.toLowerCase(), f.id])),
  };
}

/**
 * Cœur commun de l'aperçu et de l'application. `ecrire = false` ne touche à
 * rien : c'est la garantie que l'aperçu dit vrai.
 */
async function traiter(
  p: ParamsImport,
  ecrire: boolean,
  acteurId: string | null,
): Promise<ResultatImport> {
  const champs = CHAMPS[p.genre];
  const manquants = champs
    .filter((c) => c.requis && p.mapping[c.cle] === undefined)
    .map((c) => c.libelle);
  if (manquants.length > 0) {
    throw new Error(`Colonne(s) obligatoire(s) non associée(s) : ${manquants.join(", ")}`);
  }

  const ctx = await chargerContexte();
  const lecture = (ligne: string[], cle: string): string => {
    const idx = p.mapping[cle];
    if (idx === undefined) return "";
    return (ligne[idx] ?? "").trim();
  };

  const resultats: LignePreview[] = [];
  let nbCreees = 0;
  let nbMajs = 0;
  let nbRejetees = 0;

  const rejeter = (index: number, libelle: string, motif: string) => {
    resultats.push({ index, action: "rejet", libelle, detail: "", motif });
    nbRejetees += 1;
  };

  for (let i = 0; i < p.lignes.length; i++) {
    const ligne = p.lignes[i];

    /* ---- Produits ------------------------------------------------------- */
    if (p.genre === "produits") {
      const refInterne = lecture(ligne, "refInterne");
      if (!refInterne) {
        rejeter(i, `Ligne ${i + 2}`, "Référence interne vide");
        continue;
      }

      const refFabricant = lecture(ligne, "refFabricant");
      const existant =
        ctx.produitsParRefInterne.get(refInterne.toLowerCase()) ??
        (refFabricant ? ctx.produitsParRefFabricant.get(refFabricant.toLowerCase()) : undefined);

      const designation = lecture(ligne, "designation");
      // La désignation n'est obligatoire qu'à la CRÉATION : un fichier de mise à
      // jour ne contient souvent que la référence et le prix.
      if (!existant && !designation) {
        rejeter(i, refInterne, "Désignation vide (obligatoire pour créer un produit)");
        continue;
      }

      /* RÈGLE DE MISE À JOUR : une colonne absente du fichier, ou une cellule
       * vide, LAISSE la valeur en place. Sans ça, un fichier « référence + prix »
       * effacerait marque, emplacement, note et fournisseur — une perte de
       * données silencieuse. Pour vider un champ, on passe par la fiche. */
      const donnees: Record<string, unknown> = {};
      const champsModifies: string[] = [];
      const poser = (cle: string, valeur: unknown, libelle: string) => {
        donnees[cle] = valeur;
        champsModifies.push(libelle);
      };

      if (designation) poser("designation", designation, "désignation");
      if (refFabricant) poser("refFabricant", refFabricant, "réf. fabricant");

      const marque = lecture(ligne, "marque");
      if (marque) poser("marque", marque, "marque");

      const categorie = categorieDepuis(lecture(ligne, "categorie"));
      if (categorie) poser("categorie", categorie, "catégorie");

      const unite = lecture(ligne, "unite");
      if (unite) poser("unite", unite, "unité");

      const seuil = nombre(lecture(ligne, "seuilMini"));
      if (seuil !== null && seuil >= 0) poser("seuilMini", Math.round(seuil), "seuil");

      const emplacement = lecture(ligne, "emplacement");
      if (emplacement) poser("emplacement", emplacement, "emplacement");

      const note = lecture(ligne, "note");
      if (note) poser("note", note, "note");

      const refFournisseur = lecture(ligne, "refFournisseur");
      if (refFournisseur) poser("refFournisseur", refFournisseur, "réf. fournisseur");

      const prixAchat = nombre(lecture(ligne, "prixAchat"));
      if (prixAchat !== null) poser("prixAchatCents", Math.round(prixAchat * 100), "prix d'achat");

      const delaiAchat = nombre(lecture(ligne, "delaiJours"));
      if (delaiAchat !== null) poser("delaiJours", Math.round(delaiAchat), "délai");

      // Fournisseur : créé au vol s'il est nouveau (un produit = un fournisseur).
      const nomFournisseur = lecture(ligne, "fournisseur");
      if (nomFournisseur) {
        let fournisseurId = ctx.fournisseursParNom.get(nomFournisseur.toLowerCase()) ?? null;
        if (!fournisseurId && ecrire) {
          const cree = await prisma.fournisseur.create({ data: { nom: nomFournisseur } });
          fournisseurId = cree.id;
          ctx.fournisseursParNom.set(nomFournisseur.toLowerCase(), cree.id);
        }
        if (fournisseurId) poser("fournisseurId", fournisseurId, "fournisseur");
        else if (!ecrire) champsModifies.push("fournisseur (à créer)");
      }

      if (existant) {
        if (champsModifies.length === 0) {
          rejeter(i, existant.refInterne, "Rien à mettre à jour sur cette ligne");
          continue;
        }
        // Rattaché par la référence fabricant : on ne touche PAS à la référence
        // interne, qui est l'identité de l'article dans la maison.
        const parFabricant =
          !ctx.produitsParRefInterne.has(refInterne.toLowerCase()) && Boolean(refFabricant);
        if (ecrire) {
          await prisma.produit.update({
            where: { id: existant.id },
            data: { ...donnees, updatedById: acteurId },
          });
        }
        resultats.push({
          index: i,
          action: "maj",
          libelle: existant.refInterne,
          detail: `${champsModifies.join(", ")}${
            parFabricant ? " — rattaché par la référence fabricant" : ""
          }`,
        });
        nbMajs += 1;
      } else {
        if (ecrire) {
          const cree = await prisma.produit.create({
            data: {
              refInterne,
              designation,
              categorie: categorie ?? "AUTRE",
              unite: unite || "U",
              ...donnees,
              createdById: acteurId,
              updatedById: acteurId,
            },
            select: { id: true, refInterne: true },
          });
          ctx.produitsParRefInterne.set(refInterne.toLowerCase(), cree);
          if (refFabricant) ctx.produitsParRefFabricant.set(refFabricant.toLowerCase(), cree);
        } else {
          // Sans écriture, on enregistre quand même la clé pour détecter les
          // doublons À L'INTÉRIEUR du fichier.
          ctx.produitsParRefInterne.set(refInterne.toLowerCase(), {
            id: `preview-${i}`,
            refInterne,
          });
        }
        resultats.push({
          index: i,
          action: "creation",
          libelle: refInterne,
          detail:
            designation +
            (nomFournisseur ? ` · ${nomFournisseur}` : "") +
            (prixAchat !== null ? ` · ${prixAchat.toFixed(2)} €` : ""),
        });
        nbCreees += 1;
      }
      continue;
    }

    /* ---- Stock initial --------------------------------------------------- */
    if (p.genre === "stock") {
      const ref = lecture(ligne, "ref");
      if (!ref) {
        rejeter(i, `Ligne ${i + 2}`, "Référence vide");
        continue;
      }
      const produit =
        ctx.produitsParRefInterne.get(ref.toLowerCase()) ??
        ctx.produitsParRefFabricant.get(ref.toLowerCase());
      if (!produit) {
        rejeter(i, ref, "Produit inconnu — importez d'abord le référentiel");
        continue;
      }
      const q = nombre(lecture(ligne, "quantite"));
      if (q === null) {
        rejeter(i, ref, "Quantité illisible");
        continue;
      }
      if (Math.round(q) <= 0) {
        rejeter(i, ref, "Quantité nulle — rien à reprendre");
        continue;
      }
      const quantite = Math.round(q);

      const nomDepot = lecture(ligne, "depot");
      const depotId = nomDepot ? ctx.depotsParCle.get(nomDepot.toLowerCase()) : ctx.depotParDefaut;
      if (!depotId) {
        rejeter(i, ref, nomDepot ? `Dépôt « ${nomDepot} » inconnu` : "Aucun dépôt disponible");
        continue;
      }

      const prixBrut = nombre(lecture(ligne, "prix"));
      const prixCents = prixBrut !== null ? Math.round(prixBrut * 100) : null;
      const series = lecture(ligne, "series")
        .split(/[,;|]+/)
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, quantite);

      if (ecrire) {
        const mouvement = await prisma.mouvementStock.create({
          data: {
            type: "RECEPTION",
            produitId: produit.id,
            quantite,
            depotDestId: depotId,
            prixUnitaireCents: prixCents,
            note: "Reprise — import du stock initial",
            createdById: acteurId,
          },
        });
        for (const numeroSerie of series) {
          await prisma.exemplaire.upsert({
            where: { produitId_numeroSerie: { produitId: produit.id, numeroSerie } },
            create: {
              produitId: produit.id,
              numeroSerie,
              etat: "EN_STOCK",
              depotId,
              receptionId: mouvement.id,
            },
            update: { etat: "EN_STOCK", depotId, receptionId: mouvement.id },
          });
        }
      }

      resultats.push({
        index: i,
        action: "creation",
        libelle: produit.refInterne,
        detail: `+${quantite}${prixCents !== null ? ` à ${(prixCents / 100).toFixed(2)} €` : ""}${
          series.length ? ` · ${series.length} n° de série` : ""
        }`,
      });
      nbCreees += 1;
      continue;
    }

    continue;
  }

  return { lignes: resultats, nbCreees, nbMajs, nbRejetees };
}

/**
 * Export du référentiel au FORMAT DE L'IMPORT : on ouvre dans Excel, on corrige
 * une colonne de prix ou de seuils, on réimporte. C'est le chemin normal d'une
 * mise à jour de masse — et il est sûr, puisqu'une cellule vide ne touche à rien.
 */
export async function exporterProduitsCsv(): Promise<{ nomFichier: string; contenu: string }> {
  await acteurAchats();

  const produits = await prisma.produit.findMany({
    where: { actif: true },
    orderBy: [{ categorie: "asc" }, { refInterne: "asc" }],
    include: { fournisseur: { select: { nom: true } } },
  });

  const champs = CHAMPS.produits;
  const valeur = (p: (typeof produits)[number], cle: string): string => {
    switch (cle) {
      case "refInterne":
        return p.refInterne;
      case "refFabricant":
        return p.refFabricant ?? "";
      case "designation":
        return p.designation;
      case "marque":
        return p.marque ?? "";
      case "categorie":
        return CATEGORIE_LABEL[p.categorie as keyof typeof CATEGORIE_LABEL] ?? p.categorie;
      case "unite":
        return p.unite;
      case "seuilMini":
        return String(p.seuilMini);
      case "emplacement":
        return p.emplacement ?? "";
      case "note":
        return p.note;
      case "fournisseur":
        return p.fournisseur?.nom ?? "";
      case "refFournisseur":
        return p.refFournisseur ?? "";
      case "prixAchat":
        // Virgule décimale : le fichier est destiné à Excel en français.
        return p.prixAchatCents === null ? "" : (p.prixAchatCents / 100).toFixed(2).replace(".", ",");
      case "delaiJours":
        return p.delaiJours === null ? "" : String(p.delaiJours);
      default:
        return "";
    }
  };

  return {
    nomFichier: "produits-magasin.csv",
    contenu: construireCsv(
      champs.map((c) => c.libelle),
      produits.map((p) => champs.map((c) => valeur(p, c.cle))),
    ),
  };
}

/** Aperçu : n'écrit RIEN. Le même calcul que l'application, en lecture seule. */
export async function previsualiserImport(p: ParamsImport): Promise<ResultatImport> {
  await acteurAchats();
  return traiter(p, false, null);
}

/** Application réelle + trace au journal des imports. */
export async function appliquerImport(p: ParamsImport): Promise<ResultatImport> {
  const acteurId = await acteurAchats();
  const resultat = await traiter(p, true, acteurId);

  await prisma.importMagasin.create({
    data: {
      genre: p.genre,
      nomFichier: p.nomFichier ?? "",
      nbLignes: p.lignes.length,
      nbCreees: resultat.nbCreees,
      nbMajs: resultat.nbMajs,
      nbRejetees: resultat.nbRejetees,
      rejets: resultat.lignes
        .filter((l) => l.action === "rejet")
        .map((l) => ({ ligne: l.index + 2, libelle: l.libelle, motif: l.motif ?? "" })),
      createdById: acteurId,
    },
  });

  revalidatePath("/outils/magasin");
  revalidatePath("/outils/magasin/import");
  return resultat;
}
