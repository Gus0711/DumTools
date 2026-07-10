/**
 * Démo : vide les affaires (et les automates rattachés) puis recrée un jeu
 * d'affaires dans différentes situations (états variés, mono/multi/zéro
 * automate, avec/sans n° Why, plusieurs clients).
 *
 *   npx tsx scripts/seed-affaires-demo.mts
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, Prisma } from "../src/generated/prisma/client";
import type { EtatAffaire } from "../src/generated/prisma/enums";
import { defaultProject } from "../src/tools/affectation-es/model";
import { catalogueParDefaut } from "../src/tools/affectation-es/catalogue";
import { moduleIntegre } from "../src/tools/affectation-es/affectation-auto";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });
const cat = catalogueParDefaut();
const dateLabel = "juillet 2026";

async function clientId(nom: string): Promise<string> {
  const c = await prisma.client.upsert({ where: { nom }, update: {}, create: { nom }, select: { id: true } });
  return c.id;
}

async function automate(
  chantierId: string,
  clId: string,
  clientNom: string,
  numeroWhy: string | null,
  affaireNom: string,
  nomAutomate: string,
  controller: string,
) {
  const p = defaultProject(dateLabel);
  p.name = nomAutomate;
  p.controller = controller;
  p.header = [clientNom, affaireNom].filter((v) => v && v.trim()).join(" - ");
  const integ = controller ? moduleIntegre(cat, controller) : null;
  if (integ) p.modules = [integ];
  await prisma.affectationProjet.create({
    data: {
      nom: nomAutomate,
      clientNom,
      clientId: clId,
      numeroWhy,
      chantierId,
      data: p as unknown as Prisma.InputJsonValue,
    },
  });
}

async function affaire(a: {
  nom: string;
  clientNom: string;
  numeroWhy: string | null;
  etat: EtatAffaire;
  automates: { nom: string; controller: string }[];
}) {
  const clId = await clientId(a.clientNom);
  const ch = await prisma.chantier.create({
    data: { nom: a.nom, numeroWhy: a.numeroWhy, etat: a.etat, clientId: clId },
    select: { id: true },
  });
  for (const auto of a.automates) {
    await automate(ch.id, clId, a.clientNom, a.numeroWhy, a.nom, auto.nom, auto.controller);
  }
  console.log(`✔ ${a.etat.padEnd(9)} ${a.nom}  (${a.automates.length} automate·s)`);
}

async function main() {
  // Table rase pour un jeu de démo cohérent (affaires + automates rattachés).
  const delP = await prisma.affectationProjet.deleteMany({});
  const delC = await prisma.chantier.deleteMany({});
  console.log(`Vidé : ${delC.count} affaire(s), ${delP.count} projet(s).\n`);

  // Multi-automate, chantier en cours.
  await affaire({
    nom: "Lycée Jean Moulin — Rénovation CVC",
    clientNom: "Région Hauts-de-France",
    numeroWhy: "W-2026-0210",
    etat: "EN_COURS",
    automates: [
      { nom: "CTA Toiture", controller: "ECY-400" },
      { nom: "Chaufferie", controller: "ECY-303" },
      { nom: "VMC Sous-sol", controller: "ECY-300" },
    ],
  });

  // Multi-automate, commande signée.
  await affaire({
    nom: "Mairie de Laon — GTB neuve",
    clientNom: "Ville de Laon",
    numeroWhy: "W-2026-0211",
    etat: "COMMANDE",
    automates: [
      { nom: "Production ECS", controller: "ECY-303" },
      { nom: "Éclairage & CVC", controller: "ECY-600" },
    ],
  });

  // Mono-automate, au stade devis.
  await affaire({
    nom: "Clinique Saint-Roch — Chaufferie",
    clientNom: "DALKIA France",
    numeroWhy: "W-2026-0212",
    etat: "DEVIS",
    automates: [{ nom: "Chaufferie gaz", controller: "ECY-450" }],
  });

  // Mono-automate, livrée.
  await affaire({
    nom: "Collège Pasteur — Extension",
    clientNom: "Département de l'Aisne",
    numeroWhy: "W-2026-0213",
    etat: "LIVRE",
    automates: [{ nom: "Bâtiment C", controller: "ECY-PTU-207" }],
  });

  // Multi-automate, clôturée.
  await affaire({
    nom: "Piscine municipale — Traitement d'eau",
    clientNom: "Ville de Soissons",
    numeroWhy: "W-2026-0214",
    etat: "CLOTURE",
    automates: [
      { nom: "Traitement d'eau", controller: "ECY-600" },
      { nom: "Ventilation halls", controller: "ECY-400" },
    ],
  });

  // Affaire vide, sans n° Why (créée dans DumTools avant l'ouverture WhySoft).
  await affaire({
    nom: "Bureaux Fareneït — Pilote interne",
    clientNom: "Groupe Fareneït",
    numeroWhy: null,
    etat: "DEVIS",
    automates: [],
  });

  const n = await prisma.chantier.count();
  const m = await prisma.affectationProjet.count();
  console.log(`\n✔ ${n} affaires · ${m} automates créés.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
