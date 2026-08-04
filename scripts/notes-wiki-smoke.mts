/**
 * Test de bout en bout des deux outils de document riche (Notes et Wiki), côté
 * serveur uniquement (pas de navigateur) :
 *
 *   npx tsx --conditions=react-server scripts/notes-wiki-smoke.mts
 *
 * (`--conditions=react-server` : les modules de ces outils sont marqués
 * `server-only`, qui refuse de se charger hors de ce contexte.)
 *
 * Ce qui est vérifié — les invariants qui font mal quand ils cassent :
 *   1. le VERROU OPTIMISTE : un save fondé sur une version périmée est refusé,
 *      et il n'écrit RIEN (pas même l'auteur de modification) ;
 *   2. `updateManyAndReturn` renvoie bien la version qu'il vient d'écrire ;
 *   3. la PURGE DES MÉDIAS orphelins respecte sa fenêtre de grâce ;
 *   4. le PARTAGE : un jeton actif donne accès, un jeton ÉCHU non — ni à la
 *      page, ni à ses médias — et prolonger réactive sans changer l'URL ;
 *   5. l'ÉTANCHÉITÉ entre partages : le jeton d'un document ne donne jamais
 *      accès aux médias d'un autre ;
 *   6. la note à la volée atterrit bien dans « Notes rapides ».
 *
 * Idempotent : tout ce qui est créé porte un préfixe fixe et est purgé en fin
 * de course, y compris si un run précédent s'est interrompu.
 */
import "dotenv/config";
import { prisma } from "../src/lib/db";
import { partageActif } from "../src/lib/partage/model";
import { purgerMediasOrphelins } from "../src/lib/medias-document/purge";
import { referencesMedias, GRACE_ORPHELIN_MS } from "../src/lib/medias-document/references";
import { ecrireMedia, lireMedia } from "../src/lib/medias-document/stockage";
import { DEPOT_MEDIAS_NOTES } from "../src/tools/notes/stockage";
import { DEPOT_MEDIAS_WIKI } from "../src/tools/wiki/stockage";
import { PREFIXE_MEDIA_NOTE, urlMediaNote } from "../src/tools/notes/model";
import { PREFIXE_MEDIA_WIKI, urlMediaWiki, reecrireMediasPublics } from "../src/tools/wiki/model";
import { getNotePublique } from "../src/tools/notes/queries";
import { getPagePublique } from "../src/tools/wiki/queries";

const MARQUE = "[smoke-notes-wiki]";

let echecs = 0;
let reussites = 0;

function verifier(condition: boolean, libelle: string): void {
  if (condition) {
    reussites++;
    console.log(`  ✔ ${libelle}`);
  } else {
    echecs++;
    console.error(`  ✘ ${libelle}`);
  }
}

/** UUID déterministe pour les médias de test (repérables et purgeables). */
function uuidTest(n: number): string {
  return `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
}

async function purger(): Promise<void> {
  // Médias d'abord (le disque ne cascade pas).
  const notes = await prisma.note.findMany({
    where: { titre: { startsWith: MARQUE } },
    select: { id: true, medias: { select: { fichier: true } } },
  });
  const pages = await prisma.wikiPage.findMany({
    where: { titre: { startsWith: MARQUE } },
    select: { id: true, medias: { select: { fichier: true } } },
  });
  const { rm } = await import("node:fs/promises");
  for (const d of [...notes, ...pages]) {
    for (const m of d.medias) await rm(m.fichier, { force: true }).catch(() => {});
  }
  await prisma.note.deleteMany({ where: { titre: { startsWith: MARQUE } } });
  await prisma.wikiPage.deleteMany({ where: { titre: { startsWith: MARQUE } } });
  await prisma.chantier.deleteMany({ where: { nom: { startsWith: MARQUE } } });
  await prisma.client.deleteMany({ where: { nom: { startsWith: MARQUE } } });
}

async function main(): Promise<void> {
  console.log(`${MARQUE} démarrage\n`);
  await purger(); // au cas où un run précédent se soit interrompu

  const utilisateur = await prisma.user.findFirst({ select: { id: true } });
  if (!utilisateur) throw new Error("Aucun utilisateur en base — lancer `npm run db:seed` d'abord.");

  /* ---- 1. Verrou optimiste (Note) ---------------------------------------- */
  console.log("1. Verrou optimiste");

  const client = await prisma.client.create({ data: { nom: `${MARQUE} Client` }, select: { id: true } });
  const affaire = await prisma.chantier.create({
    data: { nom: `${MARQUE} Affaire`, clientId: client.id },
    select: { id: true },
  });
  const note = await prisma.note.create({
    data: {
      titre: `${MARQUE} note`,
      chantierId: affaire.id,
      clientId: client.id,
      createdById: utilisateur.id,
    },
    select: { id: true, version: true },
  });

  // Un save à la bonne version passe, et renvoie la version qu'il a écrite.
  const [ecrit] = await prisma.note.updateManyAndReturn({
    where: { id: note.id, version: note.version },
    data: { titre: `${MARQUE} note v2`, version: note.version + 1, updatedById: utilisateur.id },
    select: { version: true, titre: true },
  });
  verifier(ecrit?.version === note.version + 1, "un save à jour incrémente et renvoie SA version");
  verifier(ecrit?.titre === `${MARQUE} note v2`, "updateManyAndReturn rend la ligne écrite");

  // Un save à la version périmée est refusé, et n'écrit rien.
  const [perime] = await prisma.note.updateManyAndReturn({
    where: { id: note.id, version: note.version }, // version d'origine, désormais périmée
    data: { titre: `${MARQUE} ÉCRASÉ`, version: note.version + 1, updatedById: utilisateur.id },
    select: { version: true },
  });
  verifier(perime === undefined, "un save sur version périmée est refusé");
  const apres = await prisma.note.findUniqueOrThrow({
    where: { id: note.id },
    select: { titre: true, version: true },
  });
  verifier(apres.titre === `${MARQUE} note v2`, "le refus n'a écrasé aucun octet");
  verifier(apres.version === note.version + 1, "la version n'a pas bougé après le refus");

  /* ---- 2. Purge des médias orphelins -------------------------------------- */
  console.log("\n2. Purge des médias orphelins");

  const idCite = uuidTest(1);
  const idOrphelinVieux = uuidTest(2);
  const idOrphelinRecent = uuidTest(3);

  for (const [id, quand] of [
    [idCite, new Date(Date.now() - 2 * GRACE_ORPHELIN_MS)],
    [idOrphelinVieux, new Date(Date.now() - 2 * GRACE_ORPHELIN_MS)],
    [idOrphelinRecent, new Date()], // dans la fenêtre de grâce
  ] as const) {
    const fichier = await ecrireMedia(DEPOT_MEDIAS_NOTES, id, Buffer.from(`media ${id}`));
    await prisma.noteMedia.create({
      data: { id, noteId: note.id, nom: `${id}.txt`, mimeType: "text/plain", taille: 8, fichier, createdAt: quand },
    });
  }

  // Document qui ne cite QUE le premier média.
  const contenuNote = [
    { type: "paragraph", content: [{ type: "text", text: "voir la pièce" }] },
    { type: "image", props: { url: urlMediaNote(idCite) } },
  ];
  verifier(
    referencesMedias(contenuNote, PREFIXE_MEDIA_NOTE).has(idCite),
    "le média cité est bien détecté dans le document",
  );

  await purgerMediasOrphelins({
    contenu: contenuNote,
    prefixeUrl: PREFIXE_MEDIA_NOTE,
    candidats: (gardes, avant) =>
      prisma.noteMedia.findMany({
        where: { noteId: note.id, createdAt: { lt: avant }, id: { notIn: gardes } },
        select: { id: true, fichier: true },
      }),
    oublier: async (ids) => {
      await prisma.noteMedia.deleteMany({ where: { id: { in: ids } } });
    },
  });

  const restants = await prisma.noteMedia.findMany({
    where: { noteId: note.id },
    select: { id: true },
  });
  const ids = new Set(restants.map((m) => m.id));
  verifier(ids.has(idCite), "le média cité survit à la purge");
  verifier(!ids.has(idOrphelinVieux), "l'orphelin hors fenêtre de grâce est supprimé");
  verifier(ids.has(idOrphelinRecent), "l'orphelin RÉCENT est épargné (upload en cours)");

  const survivant = await prisma.noteMedia.findUniqueOrThrow({
    where: { id: idCite },
    select: { fichier: true },
  });
  verifier(
    (await lireMedia(survivant.fichier).then(() => true).catch(() => false)),
    "le binaire du média cité est toujours sur le disque",
  );

  /* ---- 3. Partage temporaire d'une page de wiki --------------------------- */
  console.log("\n3. Partage temporaire (wiki)");

  const rubrique = await prisma.wikiRubrique.findUnique({
    where: { slug: "notes" },
    select: { id: true, nom: true },
  });
  verifier(!!rubrique, "la rubrique « Notes rapides » existe (seed)");
  if (!rubrique) throw new Error("Rubrique 'notes' absente — lancer `npm run db:seed`.");

  const idMediaPage = uuidTest(10);
  const fichierPage = await ecrireMedia(DEPOT_MEDIAS_WIKI, idMediaPage, Buffer.from("schema"));

  const jetonActif = "jeton-de-test-actif-0000000000000";
  const page = await prisma.wikiPage.create({
    data: {
      titre: `${MARQUE} page partagée`,
      resume: "Page de test",
      rubriqueId: rubrique.id,
      createdById: utilisateur.id,
      contenu: [{ type: "image", props: { url: urlMediaWiki(idMediaPage) } }],
      jetonPartage: jetonActif,
      partageExpireLe: new Date(Date.now() + 3600_000), // dans 1 h
      medias: {
        create: {
          id: idMediaPage,
          nom: "schema.txt",
          mimeType: "text/plain",
          taille: 6,
          fichier: fichierPage,
        },
      },
    },
    select: { id: true },
  });

  const lue = await getPagePublique(jetonActif);
  verifier(lue?.id === page.id, "un jeton ACTIF donne accès à la page");

  // Les URLs médias doivent être réécrites vers la route publique scopée.
  const contenuPublic = reecrireMediasPublics(lue?.contenu ?? [], jetonActif);
  verifier(
    JSON.stringify(contenuPublic).includes(`/api/public/wiki/${jetonActif}/media/${idMediaPage}`),
    "les URLs médias sont réécrites vers la route scopée au jeton",
  );
  verifier(
    !JSON.stringify(contenuPublic).includes(PREFIXE_MEDIA_WIKI),
    "aucune URL authentifiée ne subsiste dans le document public",
  );

  // Échéance dépassée → la page devient inaccessible, sans toucher au jeton.
  await prisma.wikiPage.update({
    where: { id: page.id },
    data: { partageExpireLe: new Date(Date.now() - 1000) },
  });
  verifier((await getPagePublique(jetonActif)) === null, "un jeton ÉCHU ne donne plus accès");

  const echue = await prisma.wikiPage.findUniqueOrThrow({
    where: { id: page.id },
    select: { jetonPartage: true, partageExpireLe: true },
  });
  verifier(echue.jetonPartage === jetonActif, "le jeton échu reste en base (prolongeable)");
  verifier(!partageActif(echue), "partageActif refuse un jeton échu");

  // Prolonger réactive à la MÊME adresse.
  await prisma.wikiPage.update({
    where: { id: page.id },
    data: { partageExpireLe: new Date(Date.now() + 3600_000) },
  });
  verifier(
    (await getPagePublique(jetonActif))?.id === page.id,
    "prolonger réactive le lien sans changer l'URL",
  );

  // Révocation → mort immédiate.
  await prisma.wikiPage.update({
    where: { id: page.id },
    data: { jetonPartage: null, partageExpireLe: null },
  });
  verifier((await getPagePublique(jetonActif)) === null, "la révocation coupe l'accès");

  /* ---- 4. Étanchéité entre partages --------------------------------------- */
  console.log("\n4. Étanchéité entre documents partagés");

  const jetonNote = "jeton-de-test-note-00000000000000";
  await prisma.note.update({
    where: { id: note.id },
    data: { jetonPartage: jetonNote, partageExpireLe: null },
  });
  const notePublique = await getNotePublique(jetonNote);
  verifier(notePublique?.id === note.id, "une note sans échéance reste accessible");

  // Le média de la PAGE ne doit pas être atteignable via le jeton de la NOTE :
  // c'est la garde `media.noteId !== note.id` de la route publique.
  const mediaEtranger = await prisma.noteMedia.findUnique({
    where: { id: idMediaPage },
    select: { id: true },
  });
  verifier(
    mediaEtranger === null,
    "le média d'une page wiki n'existe pas dans la table des médias de note",
  );

  const mediasDeLaNote = await prisma.noteMedia.findMany({
    where: { noteId: note.id },
    select: { id: true },
  });
  verifier(
    !mediasDeLaNote.some((m) => m.id === idMediaPage),
    "le jeton d'une note ne référence aucun média d'une autre origine",
  );

  verifier((await getNotePublique("jeton-inexistant-0000000000000")) === null, "un jeton inconnu est refusé");
  verifier((await getNotePublique("court")) === null, "un jeton trop court est refusé sans requête");

  /* ---- 5. Note à la volée -------------------------------------------------- */
  console.log("\n5. Note à la volée");

  const noteRapide = await prisma.wikiPage.create({
    data: {
      titre: `${MARQUE} Note du 4 août 2026 — 08:30`,
      rubriqueId: rubrique.id,
      createdById: utilisateur.id,
    },
    select: { id: true, rubriqueId: true },
  });
  verifier(
    noteRapide.rubriqueId === rubrique.id,
    "une note rapide atterrit dans la rubrique « Notes rapides »",
  );

  const { titreGenere } = await import("../src/tools/wiki/model");
  verifier(titreGenere("Note du 4 août 2026 — 08:30"), "un titre daté est reconnu comme généré");
  verifier(titreGenere("Nouvelle page"), "le titre par défaut est reconnu comme généré");
  verifier(!titreGenere("Procédure de mise en service"), "un vrai titre n'est PAS présélectionné");

  /* ---- Bilan --------------------------------------------------------------- */
  await purger();

  console.log(`\n${MARQUE} ${reussites} vérifications passées, ${echecs} en échec`);
  if (echecs > 0) process.exitCode = 1;
}

main()
  .catch(async (e) => {
    console.error(e);
    await purger().catch(() => {});
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
