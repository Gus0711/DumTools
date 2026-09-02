/* Les tâches : rattachement, priorité, échéance — contre la VRAIE base.
 *
 *   npx tsx --conditions=react-server scripts/taches-smoke.mts
 *
 * NON DESTRUCTIF : tout vit sous des ids préfixés `zz-`, supprimés en fin
 * (bloc finally), y compris en cas d'échec.
 */
import "dotenv/config";
import { createRequire } from "node:module";

const requireCjs = createRequire(import.meta.url);
const cheminServerOnly = requireCjs.resolve("server-only");
requireCjs.cache[cheminServerOnly] = {
  id: cheminServerOnly, filename: cheminServerOnly, loaded: true, exports: {},
} as unknown as NodeJS.Module;

const { prisma } = await import("../src/lib/db");
const { listerTachesCompletes, listerMesTaches, compterMesTaches } = await import(
  "../src/lib/chantiers/queries"
);

let ko = 0;
const v = (nom: string, ok: boolean, d = "") => {
  console.log(`${ok ? "  ok  " : "  KO  "} ${nom}${d ? " — " + d : ""}`);
  if (!ok) ko += 1;
};

const u = await prisma.user.findFirst({ where: { actif: true }, select: { id: true } });
if (!u) throw new Error("aucun utilisateur actif");

try {
  await prisma.client.upsert({
    where: { id: "zz-cli-tk" },
    create: { id: "zz-cli-tk", nom: "ZZ Vérif tâches" },
    update: {},
  });
  await prisma.chantier.upsert({
    where: { id: "zz-aff-tk" },
    create: { id: "zz-aff-tk", nom: "ZZ Vérif tâches", clientId: "zz-cli-tk", etat: "EN_COURS" },
    update: { etat: "EN_COURS" },
  });
  const domaine = await prisma.domaineTache.upsert({
    where: { nom: "ZZ Domaine" },
    create: { nom: "ZZ Domaine", ordre: 999 },
    update: {},
  });

  const hier = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

  /* --- 1. Une tâche peut n'appartenir à AUCUNE affaire ------------------- */

  const interne = await prisma.tacheAffaire.create({
    data: {
      id: "zz-t-interne",
      titre: "ZZ tâche interne",
      ordre: 1,
      domaineId: domaine.id,
      assigneId: u.id,
      priorite: "HAUTE",
      echeance: new Date(`${hier}T12:00:00.000Z`),
    },
    select: { id: true, chantierId: true, domaineId: true },
  });
  v("une tâche sans affaire s'enregistre", interne.chantierId === null && !!interne.domaineId);

  const surAffaire = await prisma.tacheAffaire.create({
    data: {
      id: "zz-t-affaire",
      titre: "ZZ tâche d'affaire",
      ordre: 2,
      chantierId: "zz-aff-tk",
      assigneId: u.id,
      priorite: "BASSE",
    },
    select: { id: true },
  });

  /* --- 2. Ce que voit l'écran ------------------------------------------- */

  const toutes = await listerTachesCompletes();
  const vueInterne = toutes.find((t) => t.id === interne.id);
  const vueAffaire = toutes.find((t) => t.id === surAffaire.id);

  v("l'écran voit la tâche interne", !!vueInterne);
  v("elle porte son domaine et pas d'affaire",
    vueInterne?.domaineNom === "ZZ Domaine" && vueInterne?.affaireId === null);
  v("elle porte sa priorité", vueInterne?.priorite === "HAUTE");
  v("l'échéance est un JOUR, pas un instant", vueInterne?.echeance === hier,
    `${vueInterne?.echeance} vs ${hier}`);
  v("la tâche d'affaire porte son affaire et pas de domaine",
    vueAffaire?.affaireId === "zz-aff-tk" && vueAffaire?.domaineId === null);
  v("le client remonte avec l'affaire", vueAffaire?.clientNom === "ZZ Vérif tâches");

  /* --- 2 bis. Rattachée au CLIENT, sans affaire -------------------------- */

  const surClient = await prisma.tacheAffaire.create({
    data: {
      id: "zz-t-client",
      titre: "ZZ tâche de client",
      ordre: 3,
      clientId: "zz-cli-tk",
      assigneId: u.id,
    },
    select: { id: true, chantierId: true, clientId: true },
  });
  v("une tâche se pose sur un CLIENT sans affaire",
    surClient.chantierId === null && surClient.clientId === "zz-cli-tk");

  const vueClient = (await listerTachesCompletes()).find((t) => t.id === surClient.id);
  v("son client est lisible et marqué comme direct",
    vueClient?.clientNom === "ZZ Vérif tâches" && vueClient?.clientDirect === true);
  v("…et elle n'a pas d'affaire", vueClient?.affaireId === null);
  // Le client d'une tâche d'AFFAIRE vient de l'affaire, jamais d'une copie.
  v("une tâche d'affaire porte son client sans être « directe »",
    vueAffaire?.clientNom === "ZZ Vérif tâches" && vueAffaire?.clientDirect === false);

  /* --- 3. ⚠️ Le BLOC ne doit pas perdre les tâches internes -------------- *
   * C'est le piège qui se rejoue : une tâche invisible partout où l'on va voir
   * ce qu'on a à faire est une tâche perdue. */

  const bloc = await listerMesTaches(u.id);
  v("le bloc « Mes tâches » liste aussi les internes",
    bloc.some((t) => t.id === interne.id),
    `${bloc.length} tâche(s)`);
  v("l'interne y porte son domaine, sans affaire",
    bloc.find((t) => t.id === interne.id)?.domaineNom === "ZZ Domaine" &&
      bloc.find((t) => t.id === interne.id)?.affaireId === null);

  const compte = await compterMesTaches(u.id);
  v("la pastille du rail les compte aussi", compte >= 3, `${compte}`);

  /* --- 3 bis. Supprimer un client emporte ses tâches directes ------------ */

  /* --- 4. Une affaire en corbeille masque SES tâches, pas les internes --- */

  await prisma.chantier.update({ where: { id: "zz-aff-tk" }, data: { etat: "CORBEILLE" } });
  const apres = await listerTachesCompletes();
  v("une affaire en corbeille retire ses tâches",
    !apres.some((t) => t.id === surAffaire.id));
  v("…et laisse les tâches internes tranquilles",
    apres.some((t) => t.id === interne.id));
  await prisma.chantier.update({ where: { id: "zz-aff-tk" }, data: { etat: "EN_COURS" } });

  /* --- 4 bis. Les obligations DÉDUITES : elles s'éteignent seules -------- *
   * La propriété qui porte tout le mécanisme. Une obligation ne se coche pas :
   * si elle survivait à la disparition de sa cause, il faudrait la cocher, et
   * on aurait réinventé une saisie qui finit par contredire le calcul. */

  const { obligations } = await import("../src/lib/chantiers/obligations");

  await prisma.chantier.update({ where: { id: "zz-aff-tk" }, data: { etat: "EN_COURS" } });
  const projet = await prisma.affectationProjet.create({
    data: {
      id: "zz-prj-tk",
      nom: "ZZ automate",
      clientNom: "ZZ Vérif tâches",
      chantierId: "zz-aff-tk",
      data: { controller: "ECY-300", rows: [], points: [] },
    },
    select: { id: true },
  });

  const avant = await obligations();
  const mienne = (genre: string) =>
    avant.filter((o) => o.genre === genre && o.affaireId === "zz-aff-tk").length;
  v("une affaire EN COURS sans arrêt produit son obligation", mienne("bom-ouverte") === 1);
  v("…et une par automate jamais arrêté", mienne("automate-ouvert") === 1);

  // On pose l'arrêt comme le fait l'application : UPDATE brut avec l'horloge de
  // la BASE (un prisma.update bousculerait updatedAt — voir arret.ts).
  await prisma.$executeRaw`UPDATE "Chantier" SET "bomArreteeLe" = now() WHERE id = 'zz-aff-tk'`;
  await prisma.$executeRaw`UPDATE "AffectationProjet" SET "arreteLe" = now() WHERE id = 'zz-prj-tk'`;

  const apresArret = await obligations();
  const restante = (genre: string) =>
    apresArret.filter((o) => o.genre === genre && o.affaireId === "zz-aff-tk").length;
  v("l'arrêt ÉTEINT l'obligation, sans la cocher", restante("bom-ouverte") === 0);
  v("…et celle de l'automate aussi", restante("automate-ouvert") === 0);

  // Toucher le besoin APRÈS l'arrêt le périme : « retouché » est constaté.
  await new Promise((r) => setTimeout(r, 1100));
  await prisma.$executeRaw`UPDATE "Chantier" SET "bomToucheeLe" = now() WHERE id = 'zz-aff-tk'`;
  const apresRetouche = await obligations();
  const retouchee = apresRetouche.find(
    (o) => o.genre === "bom-retouchee" && o.affaireId === "zz-aff-tk",
  );
  v("ce qui bouge après l'arrêt revient en ALERTE", !!retouchee && retouchee.gravite === "alerte");

  await prisma.affectationProjet.delete({ where: { id: projet.id } });

  /* --- 4 ter. Le CORPS de la tâche, et son verrou ------------------------ */

  /* On n'appelle pas `sauverCorpsTache` : l'action importe `@/auth`, qui tire
   * next-auth et ses modules CLIENT dans un script Node. On éprouve donc la
   * requête GARDÉE elle-même — `updateManyAndReturn` avec la version dans le
   * `where` — qui EST le mécanisme du verrou ; l'action n'est qu'une enveloppe
   * autour d'elle (sérialisation JSON, purge des médias). */

  const doc = [
    { type: "paragraph", content: [{ type: "text", text: "Confirmer la référence", styles: {} }] },
  ];

  const [ecrite] = await prisma.tacheAffaire.updateManyAndReturn({
    where: { id: interne.id, version: 0 },
    data: { contenu: doc, version: 1 },
    select: { version: true },
  });
  v("le corps s'enregistre et fait avancer la version", ecrite?.version === 1);

  const relue = (await listerTachesCompletes()).find((t) => t.id === interne.id);
  v("le corps revient avec la liste", Array.isArray(relue?.contenu) && relue!.version === 1);

  // ⚠️ Le verrou : une seconde écriture qui fait valoir la version 0 ne doit
  // RIEN écrire. Sans lui, deux onglets ouverts s'écrasent en silence.
  const [perimee] = await prisma.tacheAffaire.updateManyAndReturn({
    where: { id: interne.id, version: 0 },
    data: { contenu: [], version: 1 },
    select: { version: true },
  });
  v("une écriture sur une version périmée est refusée", perimee === undefined);

  const apresConflit = await prisma.tacheAffaire.findUnique({
    where: { id: interne.id },
    select: { version: true, contenu: true },
  });
  v(
    "…et n'a rien écrasé",
    apresConflit?.version === 1 && Array.isArray(apresConflit.contenu) &&
      (apresConflit.contenu as unknown[]).length === 1,
  );

  // Un média suit sa tâche dans la tombe (cascade) : un binaire orphelin en
  // base serait invisible et éternel.
  await prisma.tacheMedia.create({
    data: { id: "zz-med-1", tacheId: interne.id, fichier: "/tmp/zz", nom: "photo.png" },
  });
  const provisoire = await prisma.tacheAffaire.create({
    data: { id: "zz-t-jetable", titre: "ZZ jetable", ordre: 9 },
    select: { id: true },
  });
  await prisma.tacheMedia.create({
    data: { id: "zz-med-2", tacheId: provisoire.id, fichier: "/tmp/zz2" },
  });
  await prisma.tacheAffaire.delete({ where: { id: provisoire.id } });
  v(
    "supprimer une tâche emporte ses médias (cascade)",
    (await prisma.tacheMedia.count({ where: { id: "zz-med-2" } })) === 0 &&
      (await prisma.tacheMedia.count({ where: { id: "zz-med-1" } })) === 1,
  );

  /* --- 5. Supprimer une affaire emporte ses tâches, pas les internes ----- */

  await prisma.chantier.delete({ where: { id: "zz-aff-tk" } });
  v("supprimer l'affaire supprime sa tâche (cascade)",
    (await prisma.tacheAffaire.count({ where: { id: surAffaire.id } })) === 0);
  v("la tâche interne survit",
    (await prisma.tacheAffaire.count({ where: { id: interne.id } })) === 1);

  /* --- 6. Supprimer un domaine ne supprime pas ses tâches ---------------- */

  await prisma.domaineTache.delete({ where: { id: domaine.id } });
  const orpheline = await prisma.tacheAffaire.findUnique({
    where: { id: interne.id },
    select: { domaineId: true },
  });
  v("supprimer un domaine détache ses tâches sans les perdre (SetNull)",
    orpheline !== null && orpheline.domaineId === null);
} finally {
  await prisma.tacheMedia.deleteMany({ where: { id: { startsWith: "zz-med-" } } });
  await prisma.affectationProjet.deleteMany({ where: { id: "zz-prj-tk" } });
  await prisma.tacheAffaire.deleteMany({ where: { id: { startsWith: "zz-t-" } } });
  await prisma.chantier.deleteMany({ where: { id: "zz-aff-tk" } });
  await prisma.client.deleteMany({ where: { id: "zz-cli-tk" } });
  await prisma.domaineTache.deleteMany({ where: { nom: "ZZ Domaine" } });
  await prisma.$disconnect();
}

console.log(ko === 0 ? "\n✔ tout est vert" : `\n✘ ${ko} contrôle(s) en échec`);
process.exit(ko === 0 ? 0 : 1);
