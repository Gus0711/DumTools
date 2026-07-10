// Test de fumée hors-MCP : exerce la couche data de bout en bout.
//   Lancer depuis la racine du repo : npx tsx mcp/smoke.mts
import "dotenv/config";
import {
  buildRows,
  createProject,
  deleteProject,
  getMateriel,
  getProject,
  listCatalogPoints,
  listClients,
  listModeles,
  listProjects,
  recommendForProject,
  setProjectController,
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

  const del = await deleteProject(id);
  assert(del, "delete → ok");
  const gone = await getProject(id);
  assert(gone === null, "get_project après delete → null");

  console.log("\nTOUS LES TESTS PASSENT ✅");
  process.exit(0);
}

main().catch((e) => {
  console.error("\nÉCHEC:", e);
  process.exit(1);
});
