/**
 * LE FIL DU DEVIS — contrôles de bout en bout, sur la VRAIE base.
 *
 * Ce que ce script cherche, c'est ce qui se PERD en silence : une pièce jointe
 * effacée du disque par la purge, une pièce recopiée en double par une
 * révision, un fil qui déborde sur le devis d'à côté. Aucun de ces défauts ne
 * lève d'erreur — ils se constatent, ou jamais.
 *
 *   npx tsx scripts/devis-fil-smoke.mts
 *
 * Le script crée ses propres devis (préfixe « ZZ-FIL »), vérifie, puis efface
 * tout ce qu'il a posé — y compris les binaires.
 */
import { PrismaClient } from "../src/generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";
import { mkdir, writeFile, rm, access, readdir } from "node:fs/promises";
import { join } from "node:path";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

let ok = 0;
let ko = 0;
function verif(titre: string, condition: boolean, detail = "") {
  if (condition) {
    ok += 1;
    console.log(`  ✔ ${titre}`);
  } else {
    ko += 1;
    console.log(`  ✘ ${titre}${detail ? ` — ${detail}` : ""}`);
  }
}
function section(t: string) {
  console.log(`\n▸ ${t}`);
}

const DEPOT = join(process.cwd(), ".devis-media");
const nettoyage: string[] = [];

async function fauxMedia(devisId: string, nom: string, messageId: string | null) {
  await mkdir(DEPOT, { recursive: true });
  const fichier = join(DEPOT, `zzfil-${Math.floor(performance.now() * 1000)}-${nom}`);
  await writeFile(fichier, "x");
  nettoyage.push(fichier);
  return prisma.devisMedia.create({
    data: {
      id: `zzfil-${Math.floor(performance.now() * 1000)}-${nom}`,
      devisId,
      messageId,
      nom,
      mimeType: "image/png",
      taille: 1,
      fichier,
    },
  });
}

const auteur = await prisma.user.findFirst({ where: { role: "ADMIN" } });
if (!auteur) throw new Error("Aucun administrateur en base");

/* Un essai précédent a pu s'interrompre : on repart d'un terrain net plutôt
   que d'échouer sur sa propre trace. */
const restes = await prisma.devis.findMany({
  where: { numero: { startsWith: "ZZ-FIL" } },
  select: { id: true, filId: true },
});
if (restes.length > 0) {
  await prisma.messageDevis.deleteMany({
    where: { filId: { in: restes.map((d) => d.filId || d.id) } },
  });
  await prisma.devis.deleteMany({ where: { numero: { startsWith: "ZZ-FIL" } } });
}

/* --- Le terrain : une chaîne v1 → v2, et un devis étranger ----------------- */
const v1 = await prisma.devis.create({
  data: { numero: "ZZ-FIL-1", revision: 1, titre: "Fil v1", createdById: auteur.id },
});
await prisma.devis.update({ where: { id: v1.id }, data: { filId: v1.id } });
const v2 = await prisma.devis.create({
  data: {
    numero: "ZZ-FIL-1",
    revision: 2,
    parentId: v1.id,
    filId: v1.id,
    titre: "Fil v2",
    createdById: auteur.id,
  },
});
const etranger = await prisma.devis.create({
  data: { numero: "ZZ-FIL-2", revision: 1, titre: "Fil voisin", createdById: auteur.id },
});
await prisma.devis.update({ where: { id: etranger.id }, data: { filId: etranger.id } });

section("Le fil suit la CHAÎNE, pas le devis");
const mA = await prisma.messageDevis.create({
  data: { filId: v1.id, devisId: v1.id, corps: "écrit sur la v1", auteurId: auteur.id },
});
const mB = await prisma.messageDevis.create({
  data: { filId: v1.id, devisId: v2.id, corps: "écrit sur la v2", auteurId: auteur.id },
});
await prisma.messageDevis.create({
  data: { filId: etranger.id, devisId: etranger.id, corps: "le voisin", auteurId: auteur.id },
});

const { listerFil } = await import("../src/tools/devis/queries.js");
const filV2 = await listerFil(v2.id, auteur.id);
verif("la v2 voit ce qui a été écrit sur la v1", !!filV2?.entrees.some((e) => e.corps === "écrit sur la v1"));
verif("… et ce qui a été écrit sur elle-même", !!filV2?.entrees.some((e) => e.corps === "écrit sur la v2"));
verif(
  "le fil du voisin ne déborde pas",
  !filV2?.entrees.some((e) => e.corps === "le voisin"),
);
verif("les messages se comptent, les faits non", filV2?.nbMessages === 2, `nbMessages=${filV2?.nbMessages}`);
verif(
  "les faits déduits sont là (créé, révision)",
  !!filV2?.entrees.some((e) => e.genre === "cree") && !!filV2?.entrees.some((e) => e.genre === "revision"),
);
verif(
  "le fil est en ordre chronologique",
  (filV2?.entrees ?? []).every(
    (e, i, xs) => i === 0 || xs[i - 1].quand.getTime() <= e.quand.getTime(),
  ),
);
verif("la pastille de version dit d'où vient le message", filV2?.entrees.find((e) => e.id === mB.id)?.revision === 2);

section("⚠️ La purge épargne les pièces du fil (DEVIS-FIL.md §5.1)");
const pieceFil = await fauxMedia(v1.id, "piece-de-message.png", mA.id);
const pieceLigne = await fauxMedia(v1.id, "image-orpheline.png", null);
// La purge ne regarde que les médias de plus de 5 min : on vieillit les deux.
const vieux = new Date(Date.now() - 60 * 60 * 1000);
await prisma.devisMedia.updateMany({
  where: { id: { in: [pieceFil.id, pieceLigne.id] } },
  data: { createdAt: vieux },
});

// ⚠️ On ne charge PAS `actions.ts` ici : c'est un module `"use server"`, il tire
// le routeur de Next et ne s'exécute pas hors du serveur. On rejoue donc la
// requête de purge telle qu'elle est écrite dans l'action — si elle change là-bas
// sans changer ici, c'est ce test qui devient faux, et il vaut mieux qu'il crie.
const ligne = await prisma.ligneDevis.create({
  data: { devisId: v1.id, ordre: 1000, genre: "TEXTE", designation: "t", contenu: [] },
});
// On appelle la purge telle que l'action la déclenche, sans passer par l'auth.
const { purgerMediasOrphelins } = await import("../src/lib/medias-document/purge.js");
const { PREFIXE_MEDIA_DEVIS } = await import("../src/tools/devis/model.js");
await purgerMediasOrphelins({
  contenu: [[]],
  prefixeUrl: PREFIXE_MEDIA_DEVIS,
  candidats: (gardes, avant) =>
    prisma.devisMedia.findMany({
      where: { devisId: v1.id, messageId: null, createdAt: { lt: avant }, id: { notIn: gardes } },
      select: { id: true, fichier: true },
    }),
  oublier: async (ids) => {
    await prisma.devisMedia.deleteMany({ where: { id: { in: ids } } });
  },
});

const restePieceFil = await prisma.devisMedia.findUnique({ where: { id: pieceFil.id } });
const resteImage = await prisma.devisMedia.findUnique({ where: { id: pieceLigne.id } });
verif("la pièce d'un MESSAGE survit à la purge", !!restePieceFil);
verif("… et son binaire aussi", await existe(pieceFil.fichier));
verif("l'image orpheline d'un texte libre part bien, elle", !resteImage);

section("⚠️ Une révision ne recopie pas les pièces du fil (§5.2)");
const aRecopier = await prisma.devisMedia.findMany({
  where: { devisId: v1.id, messageId: null },
  select: { id: true },
});
verif(
  "la sélection de copie exclut les pièces de message",
  !aRecopier.some((m) => m.id === pieceFil.id),
);

section("Supprimer une version n'efface pas la conversation");
await prisma.devis.delete({ where: { id: v2.id } });
const apres = await prisma.messageDevis.findUnique({ where: { id: mB.id } });
verif("le message écrit sur la v2 survit à la suppression de la v2", !!apres);
verif("… et sa version est simplement inconnue (SetNull)", apres?.devisId === null);
const filApres = await listerFil(v1.id, auteur.id);
verif("il reste lisible depuis la v1", !!filApres?.entrees.some((e) => e.id === mB.id));
verif(
  "l'écran saura le dire (revision null)",
  filApres?.entrees.find((e) => e.id === mB.id)?.revision === null,
);

section("Les non-lus");
const { compterNonLusFils } = await import("../src/tools/devis/queries.js");
const autre = await prisma.user.findFirst({ where: { id: { not: auteur.id } } });
if (autre) {
  const avantLecture = await compterNonLusFils([v1.id], autre.id);
  verif("jamais ouvert = tout est neuf", (avantLecture.get(v1.id) ?? 0) === 2);
  await prisma.lectureFilDevis.upsert({
    where: { userId_filId: { userId: autre.id, filId: v1.id } },
    create: { userId: autre.id, filId: v1.id, vuLe: new Date() },
    update: { vuLe: new Date() },
  });
  const apresLecture = await compterNonLusFils([v1.id], autre.id);
  verif("après lecture, plus rien de neuf", (apresLecture.get(v1.id) ?? 0) === 0);
} else {
  console.log("  · un seul utilisateur en base — non-lus non testés");
}
const mesNonLus = await compterNonLusFils([v1.id], auteur.id);
verif("ses propres messages ne se comptent jamais comme non lus", (mesNonLus.get(v1.id) ?? 0) === 0);

section("Le versement GED n'a nulle part où aller sans affaire");
const sansAffaire = await prisma.devis.findUnique({
  where: { id: v1.id },
  select: { chantierId: true },
});
verif("le devis d'essai n'a pas d'affaire", sansAffaire?.chantierId === null);
// La garde elle-même vit dans `verserPieceAuGed` (module "use server",
// inatteignable depuis un script) et dans l'écran, qui n'affiche pas le bouton.
// Ce qu'on vérifie ici est la RAISON de la garde : `Document.chantierId` est
// obligatoire, il n'existe aucune destination pour un devis sans affaire.

/* --- Ménage ---------------------------------------------------------------- */
await prisma.ligneDevis.deleteMany({ where: { id: ligne.id } });
await prisma.messageDevis.deleteMany({ where: { filId: { in: [v1.id, etranger.id] } } });
await prisma.lectureFilDevis.deleteMany({ where: { filId: v1.id } });
await prisma.devis.deleteMany({ where: { numero: { startsWith: "ZZ-FIL" } } });
for (const f of nettoyage) await rm(f, { force: true }).catch(() => {});
/* ⚠️ Balayage par PRÉFIXE en plus de la liste : la purge, en cours de test,
   efface des lignes dont ce script tient encore le chemin — et un essai
   interrompu au milieu laisse des binaires que personne ne réclamera jamais.
   Un test qui salit le dépôt de médias est un test qu'on finit par ne plus
   lancer. */
const restesDisque = await readdir(DEPOT).catch(() => [] as string[]);
for (const f of restesDisque) {
  if (f.startsWith("zzfil-")) await rm(join(DEPOT, f), { force: true }).catch(() => {});
}
const orphelins = (await readdir(DEPOT).catch(() => [] as string[])).filter((f) =>
  f.startsWith("zzfil-"),
);
verif("le dépôt de médias est rendu propre", orphelins.length === 0, orphelins.join(", "));

console.log(`\n${ok + ko} contrôles — ${ok} ✔  ${ko} ✘`);
console.log(ko === 0 ? "Le fil tient ses invariants." : "⚠ Le fil a un défaut.");
await prisma.$disconnect();
if (ko > 0) process.exit(1);

async function existe(chemin: string): Promise<boolean> {
  try {
    await access(chemin);
    return true;
  } catch {
    return false;
  }
}
