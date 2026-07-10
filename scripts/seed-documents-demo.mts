/**
 * Démo « de A à Z » : dépose des documents fictifs (lignes DB uniquement, sans
 * push kDrive réel) sur quelques affaires, répartis dans plusieurs dossiers
 * kDrive (catégories) et avec des statuts de synchro variés — pour illustrer le
 * tableau « Fichiers kDrive » de la fiche affaire.
 *
 * Non destructif entre exécutions ? Non : il vide d'abord les documents de démo
 * des affaires ciblées puis les recrée (idempotent par table rase ciblée).
 *
 *   npx tsx scripts/seed-documents-demo.mts
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import type { StatutSync } from "../src/tools/documents/model";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

interface Fichier {
  nom: string;
  categorie: string;
  mimeType: string;
  taille: number;
  statut: StatutSync;
  erreur?: string;
}

// Fichiers par affaire (clé = nom de l'affaire / chantier).
const PAR_AFFAIRE: Record<string, Fichier[]> = {
  "Piscine municipale — Traitement d'eau": [
    { nom: "traitement-eau-v3.gfx", categorie: "Prog", mimeType: "application/octet-stream", taille: 1_260_000, statut: "SYNC" },
    { nom: "ventilation-halls-v2.gfx", categorie: "Prog", mimeType: "application/octet-stream", taille: 980_000, statut: "SYNC" },
    { nom: "schema-armoire-TGBT.pdf", categorie: "Armoire", mimeType: "application/pdf", taille: 3_450_000, statut: "SYNC" },
    { nom: "folio-puissance.pdf", categorie: "Armoire", mimeType: "application/pdf", taille: 2_100_000, statut: "SYNC" },
    { nom: "notice-mise-en-service.pdf", categorie: "Documentation", mimeType: "application/pdf", taille: 1_800_000, statut: "SYNC" },
    { nom: "synoptique-supervision.png", categorie: "Public", mimeType: "image/png", taille: 640_000, statut: "SYNC" },
    { nom: "PV-reception.pdf", categorie: "Administratif", mimeType: "application/pdf", taille: 420_000, statut: "SYNC" },
  ],
  "Lycée Jean Moulin — Rénovation CVC": [
    { nom: "CTA-toiture-v5.gfx", categorie: "Prog", mimeType: "application/octet-stream", taille: 1_120_000, statut: "SYNC" },
    { nom: "chaufferie-v4.gfx", categorie: "Prog", mimeType: "application/octet-stream", taille: 890_000, statut: "EN_COURS" },
    { nom: "schema-elec-chaufferie.pdf", categorie: "Armoire", mimeType: "application/pdf", taille: 4_200_000, statut: "SYNC" },
    { nom: "devis-materiel-Distech.pdf", categorie: "Vente", mimeType: "application/pdf", taille: 310_000, statut: "SYNC" },
    { nom: "bon-commande-modules.pdf", categorie: "Achat", mimeType: "application/pdf", taille: 180_000, statut: "ERREUR", erreur: "kDrive : quota dossier dépassé (409)" },
  ],
  "Collège Pasteur — Extension": [
    { nom: "batiment-C-v2.gfx", categorie: "Prog", mimeType: "application/octet-stream", taille: 760_000, statut: "SYNC" },
    { nom: "guide-utilisateur-GTB.pdf", categorie: "Public", mimeType: "application/pdf", taille: 1_500_000, statut: "SYNC" },
  ],
  "Clinique Saint-Roch — Chaufferie": [
    { nom: "devis-chaufferie-gaz.pdf", categorie: "Vente", mimeType: "application/pdf", taille: 260_000, statut: "SYNC" },
    { nom: "chiffrage-automate.xlsx", categorie: "Vente", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", taille: 95_000, statut: "EN_ATTENTE" },
  ],
};

/** Chemin logique kDrive reconstitué (info d'affichage). */
function kdrivePath(annee: string, client: string, ref: string, cat: string, nom: string) {
  return `chantier/${annee}/${client}/${ref}/${cat}/${nom}`;
}

async function main() {
  let total = 0;
  for (const [affaireNom, fichiers] of Object.entries(PAR_AFFAIRE)) {
    const ch = await prisma.chantier.findFirst({
      where: { nom: affaireNom },
      select: { id: true, clientId: true, numeroWhy: true, client: { select: { nom: true } } },
    });
    if (!ch) {
      console.log(`• affaire introuvable, ignorée : ${affaireNom}`);
      continue;
    }
    // Table rase ciblée : on ne recrée que les documents de cette affaire.
    await prisma.document.deleteMany({ where: { chantierId: ch.id } });

    for (const f of fichiers) {
      const sync = f.statut === "SYNC";
      await prisma.document.create({
        data: {
          nom: f.nom,
          categorie: f.categorie,
          mimeType: f.mimeType,
          taille: f.taille,
          chantierId: ch.id,
          clientId: ch.clientId,
          numeroWhy: ch.numeroWhy,
          statutSync: f.statut,
          kdriveFileId: sync ? `demo-${Math.random().toString(36).slice(2, 10)}` : null,
          spoolPath: sync ? null : `/var/spool/dumtools/${ch.id}/${f.nom}`,
          kdrivePath: kdrivePath("2026", ch.client?.nom ?? "Client", ch.numeroWhy ?? "REF", f.categorie, f.nom),
          syncError: f.erreur ?? null,
        },
      });
      total += 1;
    }
    console.log(`✔ ${affaireNom.padEnd(42)} ${fichiers.length} fichier(s)`);
  }
  console.log(`\n✔ ${total} documents de démo créés.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
