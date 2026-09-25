// Test de fumée hors-MCP : exerce la couche data de bout en bout.
//   Lancer depuis la racine du repo : npx tsx mcp/smoke.mts
import "dotenv/config";
import "./sans-server-only.mts";
import {
  addProjectModule,
  buildRows,
  createNote,
  createProject,
  deleteNote,
  deleteProject,
  getMateriel,
  getNote,
  getProject,
  listCatalogPoints,
  listClients,
  listModeles,
  listNotes,
  listProjects,
  recommendForProject,
  removeProjectModule,
  setNotePartage,
  setProjectController,
  setProjectPower,
  updateNote,
  updateProjectMeta,
  updateProjectRows,
  createVisite,
  deleteVisite,
  getAffaire,
  getVisite,
  listReservesOuvertes,
  listVisites,
  updateVisite,
} from "./data.mts";
import { prisma } from "../src/lib/db";
import { Prisma } from "../src/generated/prisma/client";
import { dateISOLocale, normaliserData, uuid, type Reserve } from "../src/tools/visites/model";
import { nouvelleVisite } from "../src/tools/visites/modeles-defaut";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error("ASSERT: " + msg);
  console.log("  ✓ " + msg);
}

/** Pose (ou remplace) une réserve dans une visite, comme le ferait la synchro du
 *  terrain : le MCP n'écrit pas le contenu d'une visite, seul le téléphone le fait. */
async function poserReserve(visiteId: string, reserve: Reserve, ts = Date.now()) {
  const v = await prisma.visite.findUnique({ where: { id: visiteId }, select: { data: true } });
  const data = normaliserData(v!.data);
  data.reserves = [...data.reserves.filter((r) => r.id !== reserve.id), reserve];
  data.updatedTs = ts;
  await prisma.visite.update({
    where: { id: visiteId },
    data: { data: data as unknown as Prisma.InputJsonValue },
  });
}

async function main() {
  console.log("— Lecture —");
  const projets = await listProjects();
  console.log(`  projets: ${projets.length}`);
  const clients = await listClients();
  console.log(`  clients: ${clients.length}`);
  const cat = await getMateriel();
  assert(cat.automates.length > 0, `catalogue matériel non vide (${cat.automates.length} automates, ${cat.modules.length} modules)`);
  const catPts = await listCatalogPoints();
  const modeles = await listModeles();
  console.log(`  catalogue points: ${catPts.length}, modèles: ${modeles.length}`);

  console.log("— Cycle d'écriture —");
  const { id } = await createProject(
    { nom: "SMOKE MCP (à supprimer)", clientNom: "SMOKE CLIENT MCP", numeroWhy: "TEST-000" },
    null,
  );
  assert(!!id, `create → id ${id}`);

  await updateProjectMeta(id, { version: "9.9", header: "SMOKE - TEST" });

  const rows = buildRows([
    { kind: "section", nom: "Chaufferie" },
    { nom: "Sonde départ", type: "AI", signal: "PT1000" },
    { nom: "Contact défaut", type: "DI" },
    { nom: "Vanne 3 voies", type: "AO" },
    { nom: "Commande pompe", type: "DO" },
    { nom: "Compteur Modbus", type: "COM" },
  ]);
  const upd = await updateProjectRows(id, rows);
  assert(upd?.nbPoints === 4, `update_rows → ${upd?.nbPoints} points physiques (COM et section exclus)`);

  const ctrl = await setProjectController(id, "ECY-600");
  assert((ctrl?.modules ?? 0) >= 1, `set_controller ECY-600 → ${ctrl?.modules} module(s) (intégré n°0)`);

  const full = await getProject(id);
  assert(full?.project.controller === "ECY-600", "get_project → controller = ECY-600");
  const affectes = full!.project.points.filter((p) => p.module != null).length;
  assert(affectes === 4, `${affectes}/4 points affectés à une borne`);

  const reco = await recommendForProject(id);
  assert((reco?.propositions.length ?? 0) > 0, `recommend → ${reco?.propositions.length} proposition(s), 1ère = ${reco?.propositions[0]?.reference}`);

  const modAvant = ctrl?.modules ?? 0;
  const addMod = await addProjectModule(id, "16DI");
  assert(addMod?.modules === modAvant + 1, `add_module 16DI → ${addMod?.modules} modules (était ${modAvant})`);
  assert(addMod?.module.type === "16DI" && addMod.module.number >= 1, `nouveau module n°${addMod?.module.number} = 16DI`);
  const apresMod = await getProject(id);
  assert(
    apresMod!.project.modules.some((m) => m.type === "16DI" && m.number === addMod!.module.number),
    "get_project → le module 16DI est présent",
  );
  let refuse = false;
  try {
    await addProjectModule(id, "PAS-UN-MODULE");
  } catch {
    refuse = true;
  }
  assert(refuse, "add_module type inconnu → rejeté");

  const rem = await removeProjectModule(id, addMod!.module.number);
  assert(rem?.modules === modAvant, `remove_module n°${addMod?.module.number} → ${rem?.modules} modules (retour à ${modAvant})`);
  assert(rem?.removed.type === "16DI", "remove_module → renvoie le module retiré (16DI)");
  const apresRem = await getProject(id);
  assert(
    !apresRem!.project.modules.some((m) => m.number === addMod!.module.number),
    "get_project → le module 16DI a disparu",
  );
  assert(apresRem!.project.points.filter((p) => p.module != null).length === 4, "4/4 points toujours affectés après retrait");
  let refuseIntegre = false;
  try {
    await removeProjectModule(id, 0); // module intégré de l'automate
  } catch {
    refuseIntegre = true;
  }
  assert(refuseIntegre, "remove_module du module intégré n°0 → rejeté");

  const pow = await setProjectPower(id, "integrated");
  assert(pow?.power_supply === "integrated", "set_power integrated → ok");
  const apresPow = await getProject(id);
  assert(apresPow!.project.power_supply === "integrated", "get_project → power_supply = integrated");

  const del = await deleteProject(id);
  assert(del, "delete → ok");
  const gone = await getProject(id);
  assert(gone === null, "get_project après delete → null");

  console.log("— Notes (markdown ⇄ blocs) —");
  const md = [
    "# Compte rendu",
    "",
    "Texte **gras** et une liste :",
    "",
    "- premier item",
    "- second item",
    "",
    "| Repère | État |",
    "| --- | --- |",
    "| V1 | OK |",
  ].join("\n");
  const { id: noteId } = await createNote(
    { numeroWhy: "TEST-000", titre: "SMOKE NOTE (à supprimer)", markdown: md },
    null,
  );
  assert(!!noteId, `create_note → id ${noteId}`);

  const note = await getNote(noteId);
  assert(note !== null, "get_note → trouvée");
  assert(note!.markdown.includes("premier item"), "markdown aller-retour : liste conservée");
  assert(note!.markdown.includes("V1"), "markdown aller-retour : table conservée");
  assert(note!.version === 1, "version initiale = 1");

  const notesAffaire = await listNotes(note!.chantierId);
  assert(notesAffaire.some((n) => n.id === noteId), "list_notes(chantierId) → contient la note");

  const maj = await updateNote(noteId, { markdown: "Contenu remplacé." });
  assert(maj?.version === 2, "update_note → version 2 (anti-collision)");

  const partage = await setNotePartage(noteId, true);
  assert(!!partage?.urlPublique?.includes("/n/"), `share → ${partage?.urlPublique}`);
  const partageBis = await setNotePartage(noteId, true);
  assert(partageBis?.urlPublique === partage?.urlPublique, "share idempotent (même lien)");
  const revoque = await setNotePartage(noteId, false);
  assert(revoque?.urlPublique === null, "révocation → lien null");

  const delNote = await deleteNote(noteId);
  assert(delNote, "delete_note → ok");
  assert((await getNote(noteId)) === null, "get_note après delete → null");

  console.log("— Visites de chantier —");
  const jour = dateISOLocale();
  const creation = await createVisite(
    { numeroWhy: "TEST-000", type: "RECEPTION", titre: "SMOKE VISITE 1 (à supprimer)" },
    null,
  );
  assert(!!creation.id, `create_visite → id ${creation.id}`);
  assert(creation.nbItems > 0, `checklist du modèle RECEPTION instanciée (${creation.nbItems} points)`);
  assert(creation.nbReservesReportees === 0, "aucune réserve reportée (affaire neuve)");

  const v1 = await getVisite(creation.id);
  assert(v1 !== null, "get_visite → trouvée");
  assert(v1!.type === "RECEPTION" && v1!.typeLibelle.length > 0, `type = ${v1!.type} (${v1!.typeLibelle})`);
  assert(v1!.stats.total === creation.nbItems, `stats.total = nbItems (${v1!.stats.total})`);
  assert(v1!.stats.renseignes === 0, "checklist vierge : 0 point renseigné");
  assert(v1!.numeroWhy === "TEST-000" && !!v1!.chantierId, "identification reprise de l'affaire");
  assert(v1!.date === jour, `date du jour (${v1!.date})`);
  assert(v1!.sections.length > 0 && v1!.sections[0]!.items.length > 0, "sections + items présents");
  assert(v1!.sections[0]!.items[0]!.note === undefined, "champ vide OMIS de la réponse (note absente)");

  const listeAffaire = await listVisites({ numeroWhy: "TEST-000" });
  assert(listeAffaire.some((v) => v.id === creation.id), "list_visites(numeroWhy) → contient la visite");
  const listeType = await listVisites({ numeroWhy: "TEST-000", type: "MAINTENANCE" });
  assert(!listeType.some((v) => v.id === creation.id), "filtre type → une RECEPTION n'est pas une MAINTENANCE");
  const listeJour = await listVisites({ numeroWhy: "TEST-000", depuis: jour, jusqua: jour });
  assert(listeJour.some((v) => v.id === creation.id), "filtre depuis/jusqua sur le jour même → trouvée");
  const veille = dateISOLocale(new Date(Date.now() - 86_400_000));
  const listeVeille = await listVisites({ numeroWhy: "TEST-000", jusqua: veille });
  assert(!listeVeille.some((v) => v.id === creation.id), "filtre jusqua = veille → exclue");
  let dateRefusee = false;
  try {
    await listVisites({ depuis: "01/09/2026" });
  } catch {
    dateRefusee = true;
  }
  assert(dateRefusee, "date au mauvais format → rejetée (pas de Invalid Date silencieux)");

  // Réserve posée comme le ferait la synchro du terrain (le MCP n'écrit pas le
  // contenu d'une visite : voir dumtools_update_visite).
  const reserveId = uuid();
  await poserReserve(creation.id, {
    id: reserveId,
    libelle: "SMOKE réserve — presse-étoupe manquant",
    localisation: "Armoire TGBT",
    gravite: "haute",
    statut: "ouverte",
    note: "",
    photoIds: [],
  });
  const ouvertes = await listReservesOuvertes({ numeroWhy: "TEST-000" });
  assert(ouvertes.length === 1, `list_reserves(affaire) → 1 groupe (${ouvertes.length})`);
  assert(ouvertes[0]!.reserves.some((r) => r.id === reserveId), "la réserve ouverte est listée");
  assert(ouvertes[0]!.reserves[0]!.visiteId === creation.id, "la réserve pointe la visite qui l'a déclarée");
  assert(ouvertes[0]!.reserves[0]!.visiteTitre.includes("SMOKE VISITE 1"), "…avec son titre lisible");

  const creation2 = await createVisite(
    { numeroWhy: "TEST-000", type: "SUIVI", titre: "SMOKE VISITE 2 (à supprimer)" },
    null,
  );
  assert(creation2.nbReservesReportees === 1, "report inter-visites : la réserve ouverte suit la visite suivante");

  // Levée dans la visite 2 (horodatage plus récent → c'est elle qui fait foi).
  await poserReserve(
    creation2.id,
    {
      id: reserveId,
      libelle: "SMOKE réserve — presse-étoupe manquant",
      localisation: "Armoire TGBT",
      gravite: "haute",
      statut: "levee",
      note: "Posé le jour même",
      photoIds: [],
    },
    Date.now() + 1000,
  );
  const apresLevee = await listReservesOuvertes({ numeroWhy: "TEST-000" });
  assert(apresLevee.length === 0, "réserve levée dans la visite suivante → disparaît des réserves ouvertes");

  const affaireMcp = await getAffaire(v1!.chantierId!);
  assert(
    affaireMcp!.visites.some((v) => v.id === creation.id),
    `get_affaire → les visites de l'affaire sont visibles (${affaireMcp!.visites.length})`,
  );

  // Visite ORPHELINE (le relevé fait avant que l'affaire existe) → rattachement.
  const orpheline = nouvelleVisite("RELEVE", {
    chantierId: null,
    chantierNom: "",
    clientNom: "",
    numeroWhy: null,
  });
  await prisma.visite.create({
    data: {
      id: orpheline.id,
      type: orpheline.type,
      titre: "SMOKE VISITE ORPHELINE (à supprimer)",
      date: new Date(`${orpheline.date}T12:00:00`),
      data: orpheline.data as unknown as Prisma.InputJsonValue,
    },
  });
  const sansAffaire = await listVisites({ sansAffaire: true });
  assert(sansAffaire.some((v) => v.id === orpheline.id), "list_visites(sansAffaire) → trouve l'orpheline");
  assert(!sansAffaire.some((v) => v.id === creation.id), "…et ignore les visites rattachées");

  const reserveOrpheline = uuid();
  await poserReserve(orpheline.id, {
    id: reserveOrpheline,
    libelle: "SMOKE réserve orpheline",
    localisation: "",
    gravite: "moyenne",
    statut: "ouverte",
    note: "",
    photoIds: [],
  });
  const tousGroupes = await listReservesOuvertes();
  const groupeOrphelin = tousGroupes.find((g) => g.reserves.some((r) => r.id === reserveOrpheline));
  assert(
    groupeOrphelin?.chantierId === null,
    "une visite orpheline forme SON PROPRE groupe de réserves (chantierId null)",
  );

  const rattachee = await updateVisite(orpheline.id, { numeroWhy: "TEST-000", titre: "SMOKE VISITE 3" });
  assert(rattachee?.chantierId === v1!.chantierId, "update_visite → rattachement à l'affaire");
  const v3 = await getVisite(orpheline.id);
  assert(v3!.numeroWhy === "TEST-000" && v3!.clientNom.length > 0, "client / n° Why REPRIS de l'affaire");
  assert(v3!.titre === "SMOKE VISITE 3", "titre modifié");
  const avantVide = (await getVisite(orpheline.id))!.updatedAt;
  const inchangee = await updateVisite(orpheline.id, {});
  assert(
    inchangee?.updatedAt === avantVide,
    "update_visite sans changement → n'écrit RIEN (updatedAt intact, pas de fausse activité)",
  );

  let affaireRefusee = false;
  try {
    await updateVisite(orpheline.id, { numeroWhy: "N-EXISTE-PAS-000" });
  } catch {
    affaireRefusee = true;
  }
  assert(affaireRefusee, "rattachement à une affaire inconnue → rejeté");

  for (const id of [creation.id, creation2.id, orpheline.id]) {
    assert(await deleteVisite(id), `delete_visite ${id.slice(0, 8)}… → ok`);
  }
  assert((await getVisite(creation.id)) === null, "get_visite après delete → null");

  // --- Ménage ---------------------------------------------------------------
  // `createProject` crée l'affaire au vol (resolveChantierId) et `createNote`
  // s'y rattache : sans ce ménage, chaque passage laissait une affaire
  // « SMOKE MCP » en tête du tableau de bord de tout le monde.
  console.log("— Ménage —");
  const affairesSmoke = await prisma.chantier.findMany({
    where: { OR: [{ nom: { contains: "SMOKE" } }, { numeroWhy: "TEST-000" }] },
    select: { id: true },
  });
  for (const a of affairesSmoke) await prisma.chantier.delete({ where: { id: a.id } });
  assert(affairesSmoke.length > 0, `${affairesSmoke.length} affaire(s) de test supprimée(s)`);

  // Le client n'est supprimé que s'il ne sert plus à rien d'autre.
  const clientsSmoke = await prisma.client.findMany({
    where: { nom: { contains: "SMOKE" } },
    select: {
      id: true,
      _count: {
        select: {
          chantiers: true, pointsLists: true, affectations: true, documents: true,
          visites: true, notes: true, devis: true, contacts: true, taches: true,
        },
      },
    },
  });
  for (const c of clientsSmoke) {
    if (Object.values(c._count).every((n) => n === 0)) {
      await prisma.client.delete({ where: { id: c.id } });
    }
  }
  const restants = await prisma.chantier.count({
    where: { OR: [{ nom: { contains: "SMOKE" } }, { numeroWhy: "TEST-000" }] },
  });
  assert(restants === 0, "base propre : plus rien de « SMOKE » en base");

  console.log("\nTOUS LES TESTS PASSENT ✅");
  process.exit(0);
}

main().catch((e) => {
  console.error("\nÉCHEC:", e);
  process.exit(1);
});
