// Remet d'équerre le vocabulaire des points : sort le local du NOM pour le
// mettre dans le TEXTE LIBRE, partout — catalogue, projets GTB, listes de
// points, modèles de saisie.
//
// Le catalogue est le vocabulaire de l'entreprise (« Cde contacteur dalle
// chauffante ») ; ce qui distingue deux points identiques (« Salle Communale
// 1 ») vit dans le texte libre de la ligne. À force de saisies et d'imports, le
// local a migré dans le nom : 342 libellés distincts pour une vingtaine de
// concepts réels, un catalogue qui enfle d'une entrée par local, et une BOM qui
// n'apparie plus rien (elle apparie sur le nom EXACT).
//
// Déroulé en DEUX TEMPS — le script ne décide jamais seul du vocabulaire :
//
//   1. npx tsx scripts/normaliser-points.mts
//      Analyse la base et écrit une table de correspondance CSV
//      (scripts/normalisation-points.csv). Aucune écriture en base.
//      → VOUS relisez et corrigez la colonne `nom_propose` / `texte_libre_propose`,
//        ou mettez `action = GARDER` pour laisser une ligne tranquille.
//
//   2. npx tsx scripts/normaliser-points.mts --appliquer
//      Relit le CSV validé et applique, dans une transaction.
//      `--dry-run` avec `--appliquer` rejoue tout sans écrire.
//
// Sauvegardez la base avant l'étape 2 : scripts/backup-db.sh
import "dotenv/config";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import {
  IO_TYPES,
  nomLocalise,
  signalCatalogueParDefaut,
  type IoType,
  type PointRow,
} from "../src/tools/liste-points/model";
import {
  canoniser,
  cle,
  FUSION,
  propre,
  REGROUPEMENTS,
  regrouper,
  scinder,
} from "../src/tools/liste-points/vocabulaire";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const CSV = "scripts/normalisation-points.csv";
const SEP = ";";

// Le moteur de vocabulaire (coupe, synonymes, regroupements) vit désormais
// dans src/tools/liste-points/vocabulaire.ts : l'IMPORT GFX/PDF s'en sert lui
// aussi, pour que la pollution s'arrête à l'entrée au lieu d'être nettoyée
// après coup par ce script.

// --- Lecture de la base ------------------------------------------------------

type Emplacement =
  | { source: "projet"; id: string; titre: string }
  | { source: "liste"; id: string; titre: string }
  | { source: "modele"; id: string; titre: string };

interface Usage {
  libelle: string;
  types: Set<string>;
  occurrences: number;
  emplacements: Emplacement[];
}

async function collecter() {
  const catalogue = await prisma.pointCatalog.findMany({
    include: { _count: { select: { nomenclature: true } } },
    orderBy: { nom: "asc" },
  });
  const projets = await prisma.affectationProjet.findMany({ select: { id: true, nom: true, data: true } });
  const listes = await prisma.pointsList.findMany({ select: { id: true, titre: true, rows: true } });
  const modeles = await prisma.modele.findMany({ select: { id: true, nom: true, points: true } });

  const usages = new Map<string, Usage>();
  const noter = (libelle: string, type: string, ou: Emplacement) => {
    const k = libelle;
    if (!usages.has(k)) usages.set(k, { libelle, types: new Set(), occurrences: 0, emplacements: [] });
    const u = usages.get(k)!;
    u.occurrences += 1;
    if (type) u.types.add(type);
    if (!u.emplacements.some((e) => e.id === ou.id)) u.emplacements.push(ou);
  };

  const typeDeRow = (r: PointRow) => IO_TYPES.find((t) => r.io?.[t]) ?? "";

  for (const p of projets) {
    const rows = ((p.data as { rows?: PointRow[] } | null)?.rows ?? []) as PointRow[];
    for (const r of rows) {
      if (r.kind !== "point") continue;
      const nom = propre(r.nom);
      if (nom) noter(nom, typeDeRow(r), { source: "projet", id: p.id, titre: p.nom });
    }
  }
  for (const l of listes) {
    const rows = (l.rows ?? []) as unknown as PointRow[];
    for (const r of rows) {
      if (r.kind !== "point") continue;
      const nom = propre(r.nom);
      if (nom) noter(nom, typeDeRow(r), { source: "liste", id: l.id, titre: l.titre ?? "(sans titre)" });
    }
  }
  for (const m of modeles) {
    const pts = (m.points ?? []) as { nom?: string; type?: string }[];
    for (const p of pts) {
      const nom = propre(p.nom);
      if (nom) noter(nom, p.type ?? "", { source: "modele", id: m.id, titre: m.nom });
    }
  }

  return { catalogue, projets, listes, modeles, usages };
}

// --- Étape 1 : proposer -------------------------------------------------------

type Action = "SCINDER" | "RENOMMER" | "SUPPRIMER" | "GARDER";
interface Proposition {
  libelle: string;
  ou: string;
  occurrences: number;
  type: string;
  documents: string;
  action: Action;
  nom: string;
  complement: string;
  confiance: "sûr" | "à relire";
  motif: string;
}

/**
 * Une proposition par libellé, qu'il vienne des documents, du catalogue, ou des
 * deux. Le CSV est le SEUL juge : ce qu'il ne mentionne pas n'est pas touché, et
 * toute suppression du catalogue y est écrite noir sur blanc, refusable d'un
 * « GARDER ».
 */
function proposer(
  usages: Map<string, Usage>,
  catalogue: { nom: string; type: string; _count: { nomenclature: number } }[],
): Proposition[] {
  const vocabulaire = new Map(catalogue.map((c) => [cle(c.nom), c.nom]));
  const nomenclatureDe = new Map(catalogue.map((c) => [c.nom, c._count.nomenclature]));
  const out: Proposition[] = [];

  const libelles = new Set<string>([...usages.keys(), ...catalogue.map((c) => c.nom)]);
  for (const libelle of libelles) {
    const u = usages.get(libelle);
    const auCatalogue = nomenclatureDe.has(libelle);
    const type = [...(u?.types ?? [])][0] ?? catalogue.find((c) => c.nom === libelle)?.type ?? "";
    const emplacements = u?.emplacements ?? [];
    const documents =
      emplacements.map((e) => e.titre).slice(0, 3).join(" / ") +
      (emplacements.length > 3 ? ` (+${emplacements.length - 3})` : "");
    const base = {
      libelle,
      ou: auCatalogue ? (u ? "catalogue + documents" : "catalogue") : "documents",
      occurrences: u?.occurrences ?? 0,
      type,
      documents,
    };

    // a) Variante d'écriture d'un point du catalogue → simple alignement.
    //    Sauf si l'entrée de catalogue est ELLE-MÊME polluée : « Chauffage
    //    reserve » ne doit pas s'aligner sur « Chauffage_Reserve ». On laisse
    //    alors la coupe faire son travail.
    const canonique = vocabulaire.get(cle(libelle));
    if (canonique && canonique !== libelle && !nomLocalise(canonique)) {
      const { nom, complement } = regrouper(canoniser(canonique), "");
      out.push({ ...base, action: "RENOMMER", nom, complement, confiance: "sûr", motif: "variante d'écriture d'un point du catalogue" });
      continue;
    }

    // a bis) Déjà au catalogue et non localisé au sens strict : c'est du
    //   vocabulaire établi. Sans cette garde, la coupe large démonterait « Sonde
    //   départ primaire » ou « Commande Pompe primaire ECS » — où « primaire »
    //   désigne le circuit, pas l'école. Reste à l'aligner sur le vocabulaire
    //   arbitré (« Cde … » → « Commande … »), sinon l'entrée resterait orpheline.
    if (canonique === libelle && !nomLocalise(libelle)) {
      const { nom, complement } = regrouper(canoniser(libelle), "");
      if (nom === libelle && !complement) continue; // vraiment propre
      out.push({ ...base, action: "RENOMMER", nom, complement, confiance: "sûr", motif: "alignement sur le vocabulaire arbitré" });
      continue;
    }

    // b) Un local est repérable → on scinde, puis on rabat sur le regroupement.
    const coupe = scinder(libelle);
    if (coupe) {
      const { nom, complement } = regrouper(canoniser(coupe.nom), coupe.complement);
      const connu = vocabulaire.get(cle(nom));
      const regroupe = REGROUPEMENTS.some((r) => cle(r) === cle(nom));
      out.push({
        ...base,
        action: "SCINDER",
        nom: connu ?? nom,
        complement,
        confiance: connu || regroupe ? "sûr" : "à relire",
        motif: connu
          ? "générique connu du catalogue"
          : regroupe
            ? "regroupement arbitré"
            : "générique déduit — à confirmer",
      });
      continue;
    }

    // c) Entrée de catalogue localisée mais insécable (« Nouvelle_Salle ») et
    //    plus utilisée nulle part : elle ne dit rien de réutilisable.
    if (auCatalogue && !u && nomLocalise(libelle)) {
      const porteuse = (nomenclatureDe.get(libelle) ?? 0) > 0;
      out.push({
        ...base,
        action: porteuse ? "GARDER" : "SUPPRIMER",
        nom: libelle,
        complement: "",
        confiance: porteuse ? "à relire" : "sûr",
        motif: porteuse
          ? "localisé MAIS porteur d'une nomenclature — à traiter à la main"
          : "point de chantier au catalogue, inutilisé et sans nomenclature",
      });
      continue;
    }

    // d) Pas de local repéré : le libellé peut être un vrai point du vocabulaire.
    const rabat = regrouper(canoniser(libelle), "");
    const connu = vocabulaire.get(cle(rabat.nom));
    const cible = connu ?? rabat.nom;
    const change = cible !== libelle || !!rabat.complement;
    out.push({
      ...base,
      action: change ? "RENOMMER" : "GARDER",
      nom: cible,
      complement: rabat.complement,
      confiance: change ? "sûr" : "à relire",
      motif: change ? "synonyme ou regroupement du vocabulaire" : "aucun local repéré — vocabulaire à valider",
    });
  }
  return out.sort((a, b) => b.occurrences - a.occurrences || a.libelle.localeCompare(b.libelle));
}

const echapper = (v: string) => (/[";\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

async function etapeProposer() {
  const { catalogue, usages } = await collecter();

  const props = proposer(usages, catalogue);
  const entete = [
    "libelle_actuel",
    "ou",
    "occurrences",
    "type",
    "documents",
    "action",
    "nom_propose",
    "texte_libre_propose",
    "confiance",
    "motif",
  ].join(SEP);
  const lignes = props.map((p) =>
    [p.libelle, p.ou, String(p.occurrences), p.type, p.documents, p.action, p.nom, p.complement, p.confiance, p.motif]
      .map(echapper)
      .join(SEP),
  );
  writeFileSync(CSV, "﻿" + [entete, ...lignes].join("\n") + "\n", "utf8");

  const parAction = (a: Action) => props.filter((p) => p.action === a).length;
  console.log(`\n📄 ${CSV} — ${props.length} libellés à arbitrer.`);
  console.log(`   SCINDER   ${String(parAction("SCINDER")).padStart(4)}  (nom générique + local en texte libre)`);
  console.log(`   RENOMMER  ${String(parAction("RENOMMER")).padStart(4)}  (variante d'écriture / synonyme)`);
  console.log(`   SUPPRIMER ${String(parAction("SUPPRIMER")).padStart(4)}  (entrée de catalogue à jeter)`);
  console.log(`   GARDER    ${String(parAction("GARDER")).padStart(4)}  (proposés au vocabulaire — rien ne bouge)`);
  console.log(`\n   ${props.filter((p) => p.confiance === "à relire").length} lignes marquées « à relire ».`);
  console.log(`\n🗂  Catalogue actuel : ${catalogue.length} points.`);

  const sansMaterielDouteux = catalogue.filter((c) => c.sansMateriel && !nomLocalise(c.nom));
  if (sansMaterielDouteux.length)
    console.log(
      `\n⚠️  Marqués « aucun matériel » (donc absents de la BOM) alors qu'ils semblent génériques — à trancher vous-même dans /configuration/points :\n   ${sansMaterielDouteux.map((c) => `${c.nom} [${c.type}]`).join("\n   ")}`,
    );

  console.log(`\n→ Relisez ${CSV} (Excel, séparateur « ; ») : corrigez nom_propose / texte_libre_propose,`);
  console.log(`  passez une ligne à GARDER pour n'y pas toucher, puis :`);
  console.log(`     npx tsx scripts/normaliser-points.mts --appliquer --dry-run   (répétition à blanc)`);
  console.log(`     npx tsx scripts/normaliser-points.mts --appliquer\n`);
}

// --- Étape 2 : appliquer ------------------------------------------------------

function lireCsv(): Map<string, { action: Action; nom: string; complement: string }> {
  if (!existsSync(CSV)) throw new Error(`${CSV} introuvable — lancez d'abord le script sans --appliquer.`);
  const texte = readFileSync(CSV, "utf8").replace(/^﻿/, "");
  const lignes = texte.split(/\r?\n/).filter((l) => l.trim());
  const champs = (ligne: string) => {
    const out: string[] = [];
    let cur = "";
    let quote = false;
    for (let i = 0; i < ligne.length; i++) {
      const ch = ligne[i];
      if (quote) {
        if (ch === '"' && ligne[i + 1] === '"') { cur += '"'; i++; }
        else if (ch === '"') quote = false;
        else cur += ch;
      } else if (ch === '"') quote = true;
      else if (ch === SEP) { out.push(cur); cur = ""; }
      else cur += ch;
    }
    out.push(cur);
    return out;
  };
  const entete = champs(lignes[0]);
  const iLib = entete.indexOf("libelle_actuel");
  const iAct = entete.indexOf("action");
  const iNom = entete.indexOf("nom_propose");
  const iTxt = entete.indexOf("texte_libre_propose");
  if (iLib < 0 || iAct < 0 || iNom < 0 || iTxt < 0)
    throw new Error(`Colonnes manquantes dans ${CSV} (attendu : libelle_actuel, action, nom_propose, texte_libre_propose).`);

  const table = new Map<string, { action: Action; nom: string; complement: string }>();
  for (const ligne of lignes.slice(1)) {
    const c = champs(ligne);
    const libelle = propre(c[iLib]);
    if (!libelle) continue;
    const action = propre(c[iAct]).toUpperCase() as Action;
    if (action === "GARDER") continue;
    if (action !== "SCINDER" && action !== "RENOMMER" && action !== "SUPPRIMER")
      throw new Error(
        `Action inconnue « ${c[iAct]} » pour « ${libelle} » (attendu SCINDER, RENOMMER, SUPPRIMER ou GARDER).`,
      );
    const nom = propre(c[iNom]);
    if (action !== "SUPPRIMER" && !nom) throw new Error(`nom_propose vide pour « ${libelle} ».`);
    table.set(libelle, { action, nom, complement: propre(c[iTxt]) });
  }
  return table;
}

/** Applique la table à une ligne : nom ← générique, note ← complément + note existante. */
function corriger(r: PointRow, table: Map<string, { action: Action; nom: string; complement: string }>) {
  const regle = table.get(propre(r.nom));
  if (!regle || regle.action === "SUPPRIMER") return null;
  const noteExistante = propre(r.note);
  const note =
    regle.complement && noteExistante
      ? noteExistante.includes(regle.complement)
        ? noteExistante
        : `${regle.complement}${FUSION}${noteExistante}`
      : regle.complement || noteExistante;
  if (propre(r.nom) === regle.nom && note === noteExistante) return null;
  return { ...r, nom: regle.nom, note };
}

async function etapeAppliquer(dryRun: boolean) {
  const table = lireCsv();
  const { catalogue, projets, listes, modeles, usages } = await collecter();
  console.log(`Table de correspondance : ${table.size} libellés à corriger.`);

  // Libellés du CSV qui n'existent plus ni en base ni au catalogue : CSV périmé.
  const auCatalogue = new Set(catalogue.map((c) => c.nom));
  const absents = [...table.keys()].filter((l) => !usages.has(l) && !auCatalogue.has(l));
  if (absents.length)
    console.log(`⚠️  ${absents.length} libellé(s) du CSV absent(s) de la base (déjà corrigés ?) : ${absents.slice(0, 5).join(", ")}${absents.length > 5 ? "…" : ""}`);

  // Vocabulaire cible = catalogue existant + les génériques introduits par la table.
  const parCle = new Map(catalogue.map((c) => [cle(c.nom), c]));
  const aCreer = new Map<string, IoType>();
  for (const [libelle, regle] of table) {
    if (regle.action === "SUPPRIMER") continue;
    if (parCle.has(cle(regle.nom))) continue;
    const type = ([...(usages.get(libelle)?.types ?? [])][0] ??
      catalogue.find((c) => c.nom === libelle)?.type ??
      "") as IoType;
    if (!type) {
      console.log(`   ⚠️  « ${regle.nom} » : type d'E/S introuvable (libellé « ${libelle} ») — point non créé au catalogue.`);
      continue;
    }
    if (!aCreer.has(regle.nom)) aCreer.set(regle.nom, type);
  }

  // Purge du catalogue : UNIQUEMENT ce que le CSV désigne — soit explicitement
  // (SUPPRIMER), soit parce que son libellé est corrigé et n'existera plus
  // (SCINDER / RENOMMER). Jamais une entrée porteuse de nomenclature : celle-là
  // vaut quelque chose au magasin, on la laisse et on le dit.
  const cibles = catalogue.filter((c) => {
    const regle = table.get(c.nom);
    if (!regle) return false;
    return regle.action === "SUPPRIMER" || regle.nom !== c.nom;
  });
  const aSupprimer = cibles.filter((c) => c._count.nomenclature === 0 && !aCreer.has(c.nom));
  const epargnes = cibles.filter((c) => c._count.nomenclature > 0);
  if (epargnes.length)
    console.log(
      `⚠️  ${epargnes.length} entrée(s) conservée(s) car porteuse(s) d'une nomenclature matériel : ${epargnes.map((c) => c.nom).join(", ")}`,
    );

  let lignesProjets = 0;
  let lignesListes = 0;
  let lignesModeles = 0;
  const apercu: string[] = [];

  await prisma.$transaction(async (tx) => {
    for (const p of projets) {
      const data = (p.data ?? {}) as { rows?: PointRow[] };
      const rows = (data.rows ?? []) as PointRow[];
      let touche = false;
      const nouvelles = rows.map((r) => {
        if (r.kind !== "point") return r;
        const c = corriger(r, table);
        if (!c) return r;
        touche = true;
        lignesProjets += 1;
        if (apercu.length < 12)
          apercu.push(
            `   « ${propre(r.nom)} »${propre(r.note) ? ` [${propre(r.note)}]` : ""}\n     → nom « ${c.nom} »  ·  texte libre « ${c.note ?? ""} »`,
          );
        return c;
      });
      if (!touche) continue;
      if (!dryRun)
        await tx.affectationProjet.update({
          where: { id: p.id },
          // Les points (bornes) sont réappariés par id : intacts. Écriture
          // technique → on ne touche PAS à updatedById (fil d'activité).
          data: { data: { ...data, rows: nouvelles } as object },
        });
    }

    for (const l of listes) {
      const rows = (l.rows ?? []) as unknown as PointRow[];
      let touche = false;
      const nouvelles = rows.map((r) => {
        if (r.kind !== "point") return r;
        const c = corriger(r, table);
        if (!c) return r;
        touche = true;
        lignesListes += 1;
        return c;
      });
      if (!touche) continue;
      if (!dryRun) await tx.pointsList.update({ where: { id: l.id }, data: { rows: nouvelles as object } });
    }

    for (const m of modeles) {
      const pts = (m.points ?? []) as { nom?: string; type?: string; signal?: string }[];
      let touche = false;
      const nouveaux = pts.map((p) => {
        const regle = table.get(propre(p.nom));
        if (!regle) return p;
        touche = true;
        lignesModeles += 1;
        return { ...p, nom: regle.nom };
      });
      if (!touche) continue;
      if (!dryRun) await tx.modele.update({ where: { id: m.id }, data: { points: nouveaux as object } });
    }

    // Catalogue : d'abord créer les génériques manquants, ensuite purger les localisés.
    for (const [nom, type] of aCreer) {
      if (!dryRun)
        await tx.pointCatalog.upsert({
          where: { nom },
          create: { nom, type, signal: signalCatalogueParDefaut(nom, type) },
          update: {},
        });
    }
    for (const c of aSupprimer) {
      if (!dryRun) await tx.pointCatalog.delete({ where: { id: c.id } });
    }
  });

  if (apercu.length) {
    console.log(`\nAperçu des premières corrections (l'id de ligne est conservé — affectation aux bornes et suivi de mise en service intacts) :`);
    console.log(apercu.join("\n"));
  }
  console.log(`\n${dryRun ? "[dry-run] " : ""}Lignes corrigées : ${lignesProjets} (projets GTB) · ${lignesListes} (listes) · ${lignesModeles} (modèles)`);
  console.log(`${dryRun ? "[dry-run] " : ""}Catalogue : +${aCreer.size} générique(s) créé(s), −${aSupprimer.length} localisé(s) supprimé(s)`);
  if (aCreer.size) console.log(`   créés : ${[...aCreer.keys()].join(", ")}`);
  if (dryRun) console.log(`\nRien n'a été écrit. Relancez sans --dry-run pour appliquer.`);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--appliquer")) await etapeAppliquer(args.includes("--dry-run"));
  else await etapeProposer();
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
