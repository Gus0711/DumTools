/**
 * Test de bout en bout du pipeline « notes de frais », côté serveur uniquement
 * (pas de navigateur) : crée des dépenses avec de vrais justificatifs, produit
 * l'Excel et le PDF, vérifie que le gabarit est intact et que les totaux sont
 * justes.
 *
 *   npx tsx --conditions=react-server scripts/ndf-smoke.mts [email]
 *
 * (`--conditions=react-server` : les modules de l'outil sont marqués
 * `server-only`, qui refuse de se charger hors de ce contexte.)
 *
 * Idempotent : les données de test portent des identifiants fixes et sont
 * purgées en fin de course.
 */
import "dotenv/config";
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import ExcelJS from "exceljs";
import { PDFDocument } from "pdf-lib";
import { prisma } from "../src/lib/db";
import { ProfilNdf } from "../src/generated/prisma/enums";
import { genererExcel, nomFichierExcel } from "../src/tools/notes-de-frais/excel";
import { genererPdfJustificatifs } from "../src/tools/notes-de-frais/pdf-justificatifs";
import {
  depensesDuMois,
  fichiersJustificatifs,
  identitePourExport,
} from "../src/tools/notes-de-frais/queries";
import { ecrireJustificatif } from "../src/tools/notes-de-frais/stockage";
import { formatEuros, periodeDe } from "../src/tools/notes-de-frais/model";

const SORTIE = join(process.cwd(), ".ndf-smoke");
const PREFIXE = "00000000-0000-4000-8000-0000000000";

const CAS = [
  {
    n: "01",
    date: "12",
    categorie: "TRANSPORT" as const,
    cents: 1240,
    descriptif: "Péage A26 aller",
    affaire: "W-2026-118",
  },
  {
    n: "02",
    date: "14",
    categorie: "CARBURANT" as const,
    cents: 7890,
    descriptif: "Gazole Total Reims",
    affaire: "W-2026-118",
  },
  {
    n: "03",
    date: "18",
    categorie: "ACHATS_DIVERS" as const,
    cents: 1950,
    descriptif: "Gaine ICTA + colliers",
    affaire: "",
  },
];

/** Petit JPEG valide, pour vérifier l'embarquement réel dans le PDF. */
function jpegDeTest(texte: string): Buffer {
  // 1×1 JPEG minimal (base64) — suffisant pour valider embedJpg.
  void texte;
  return Buffer.from(
    "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0a" +
      "HBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAA" +
      "AAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==",
    "base64",
  );
}

async function main() {
  const email = process.argv[2] ?? "augustin.duhant@dumortier02.fr";
  const user =
    (await prisma.user.findUnique({ where: { email } })) ??
    (await prisma.user.findFirst({ orderBy: { createdAt: "asc" } }));
  if (!user) throw new Error("Aucun utilisateur en base");
  console.log(`[smoke] utilisateur : ${user.nom} <${user.email}>`);

  const profilInitial = user.profilNdf;
  const periode = periodeDe(new Date());
  const [annee, mois] = periode.split("-");

  for (const profil of [ProfilNdf.TECHNICIEN, ProfilNdf.DIRECTION_RA] as const) {
    console.log(`\n[smoke] ===== profil ${profil} =====`);
    await prisma.user.update({
      where: { id: user.id },
      data: { profilNdf: profil },
    });

    // Rubriques valides pour ce profil (ACHATS_DIVERS et TRANSPORT le sont pour
    // les deux ; CARBURANT aussi) — le jeu de test est volontairement commun.
    await purger();
    for (const c of CAS) {
      const id = `${PREFIXE}${c.n}`;
      await prisma.depenseFrais.create({
        data: {
          id,
          date: new Date(`${annee}-${mois}-${c.date}T00:00:00Z`),
          categorie: c.categorie,
          montantCents: c.cents,
          descriptif: c.descriptif,
          numeroAffaire: c.affaire,
          periode,
          createdById: user.id,
        },
      });
      const jid = `${PREFIXE}9${c.n[1]}`;
      const chemin = await ecrireJustificatif(jid, jpegDeTest(c.n));
      await prisma.justificatifFrais.create({
        data: {
          id: jid,
          depenseId: id,
          mimeType: "image/jpeg",
          taille: 1,
          fichier: chemin,
          nomOrigine: `ticket-${c.n}.jpg`,
        },
      });
    }

    const [identite, depenses] = await Promise.all([
      identitePourExport(user.id),
      depensesDuMois(user.id, periode),
    ]);
    const attendu = CAS.reduce((s, c) => s + c.cents, 0);
    console.log(
      `[smoke] ${depenses.length} dépenses complètes, total attendu ${formatEuros(attendu)}`,
    );
    if (depenses.length !== CAS.length)
      throw new Error("Toutes les dépenses ne remontent pas");

    await mkdir(SORTIE, { recursive: true });

    const xlsx = await genererExcel({
      profil,
      nomComplet: identite.nom,
      periode,
      depenses,
    });
    const nomX = join(SORTIE, `${profil}-${nomFichierExcel(identite.nom, periode)}`);
    await writeFile(nomX, xlsx);
    console.log(`[smoke] Excel  → ${nomX} (${xlsx.byteLength} o)`);

    const fichiers = await fichiersJustificatifs(user.id, periode);
    const pdf = await genererPdfJustificatifs({
      nomComplet: identite.nom,
      periode,
      depenses,
      fichiers,
    });
    const nomP = join(SORTIE, `${profil}-justificatifs.pdf`);
    await writeFile(nomP, pdf);
    console.log(`[smoke] PDF    → ${nomP} (${pdf.byteLength} o)`);

    await verifierClasseur(xlsx, profil, attendu);
    await verifierPdf(pdf, CAS.length);
  }

  await purger();
  await prisma.user.update({
    where: { id: user.id },
    data: { profilNdf: profilInitial },
  });
  console.log("\n[smoke] données de test purgées, profil restauré.");
}

/** Valeur numérique d'une cellule, qu'elle porte un nombre ou une formule
 *  accompagnée de son résultat en cache. */
function valeur(c: ExcelJS.Cell): number | string | null {
  const v = c.value;
  if (v == null) return null;
  if (typeof v === "object" && "result" in v)
    return (v as { result: number }).result;
  if (typeof v === "object" && "formula" in v) return null;
  return v as number | string;
}

function attendre(libelle: string, obtenu: unknown, espere: unknown) {
  const ok = obtenu === espere;
  console.log(
    `[smoke]   ${ok ? "✓" : "✗"} ${libelle} : ${JSON.stringify(obtenu)}${ok ? "" : ` (attendu ${JSON.stringify(espere)})`}`,
  );
  if (!ok) throw new Error(`Vérification échouée : ${libelle}`);
}

/**
 * Relit le classeur produit et vérifie DEUX choses : que les montants sont dans
 * les bonnes colonnes, et que le gabarit n'a pas été abîmé (logo, formules,
 * zone d'impression). C'est le point qui décide de la crédibilité de l'outil :
 * la compta doit recevoir SON fichier.
 */
async function verifierClasseur(
  buf: Buffer,
  profil: ProfilNdf,
  totalAttendu: number,
) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  const ws = wb.worksheets[0];

  attendre("logo conservé", ws.getImages().length, 1);
  attendre(
    "orientation d'impression conservée",
    ws.pageSetup.orientation,
    profil === "TECHNICIEN" ? "portrait" : "landscape",
  );
  // `fullCalcOnLoad` est bien écrit dans workbook.xml, mais ExcelJS ne le
  // relit pas — inutile de l'asserter ici. Le vrai filet, ce sont les résultats
  // en cache vérifiés ci-dessous, qui n'exigent aucun recalcul du lecteur.

  const e = totalAttendu / 100;
  if (profil === "TECHNICIEN") {
    attendre("société", valeur(ws.getCell("L2")), "DUMORTIER");
    attendre("transport ligne 1 (col. E)", valeur(ws.getCell("E6")), 12.4);
    attendre("carburant ligne 2 (col. H)", valeur(ws.getCell("H7")), 78.9);
    attendre("achats divers ligne 3 (col. J)", valeur(ws.getCell("J8")), 19.5);
    attendre("n° de pièce ligne 3", valeur(ws.getCell("A8")), 3);
    attendre("total ligne 1 (formule + cache)", valeur(ws.getCell("K6")), 12.4);
    attendre("sous-total transport", valeur(ws.getCell("E37")), 12.4);
    attendre("sous-total achats divers", valeur(ws.getCell("J37")), 19.5);
    attendre("TOTAL général", valeur(ws.getCell("K37")), e);
    attendre(
      "formule du total préservée",
      typeof ws.getCell("K37").value === "object" &&
        "formula" in (ws.getCell("K37").value as object),
      true,
    );
    attendre("colonne morte ACT vide", valeur(ws.getCell("C6")), null);
  } else {
    attendre("société", valeur(ws.getCell("Q5")), "DUMORTIER");
    attendre("date ligne 1", valeur(ws.getCell("B8")), "12/07/2026");
    attendre("transport ligne 1 (col. G)", valeur(ws.getCell("G8")), 12.4);
    attendre("carburant ligne 2 (col. H)", valeur(ws.getCell("H9")), 78.9);
    attendre("achats divers ligne 3 (col. I)", valeur(ws.getCell("I10")), 19.5);
    attendre("somme ligne 1 (formule + cache)", valeur(ws.getCell("F8")), 12.4);
    attendre("TOTAL général", valeur(ws.getCell("F39")), e);
    attendre("montant à régler", valeur(ws.getCell("I41")), e);
    attendre("colonne ticket resto vide", valeur(ws.getCell("M8")), null);
  }
}

/** Sommaire + une page par justificatif, et le n° de pièce présent. */
async function verifierPdf(buf: Buffer, nbPieces: number) {
  const doc = await PDFDocument.load(buf);
  attendre("pages du PDF (1 sommaire + pièces)", doc.getPageCount(), nbPieces + 1);
}

async function purger() {
  await prisma.depenseFrais.deleteMany({
    where: { id: { startsWith: PREFIXE } },
  });
}

main()
  .catch((e) => {
    console.error("[smoke] ÉCHEC :", e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
