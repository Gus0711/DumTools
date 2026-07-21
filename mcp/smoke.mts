// Test de fumée hors-MCP : exerce la couche data de bout en bout.
//   Lancer depuis la racine du repo : npx tsx mcp/smoke.mts
import "dotenv/config";
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
} from "./data.mts";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error("ASSERT: " + msg);
  console.log("  ✓ " + msg);
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

  console.log("\nTOUS LES TESTS PASSENT ✅");
  process.exit(0);
}

main().catch((e) => {
  console.error("\nÉCHEC:", e);
  process.exit(1);
});
