// Test du serveur via le protocole MCP réel (stdio) : spawn du serveur, handshake,
// tools/list, puis quelques appels d'outils. Lancer depuis la racine :
//   npx tsx mcp/test-client.mts
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

async function main() {
  const transport = new StdioClientTransport({
    command: "npx",
    args: ["tsx", "mcp/server.mts"],
    cwd: process.cwd(),
  });
  const client = new Client({ name: "smoke-client", version: "1.0.0" });
  await client.connect(transport);
  console.log("✓ connecté (handshake OK)");

  const { tools } = await client.listTools();
  console.log(`✓ tools/list → ${tools.length} outils :`);
  for (const t of tools) console.log(`    - ${t.name}: ${t.title ?? ""}`);

  const r1 = await client.callTool({ name: "dumtools_list_projects", arguments: {} });
  const c1 = (r1.structuredContent ?? {}) as { count?: number };
  console.log(`✓ dumtools_list_projects → count=${c1.count}`);

  const r2 = await client.callTool({
    name: "dumtools_recommend_controller",
    arguments: { entreesAna: 10, entreesTor: 4, sortiesAna: 2, sortiesTor: 6 },
  });
  const c2 = (r2.structuredContent ?? {}) as { propositions?: { reference: string }[] };
  console.log(`✓ dumtools_recommend_controller → 1ère proposition = ${c2.propositions?.[0]?.reference}`);

  // Vérifie une erreur actionnable sur id inconnu.
  const r3 = await client.callTool({ name: "dumtools_get_project", arguments: { id: "inexistant" } });
  console.log(`✓ get_project(id inconnu) → isError=${r3.isError}, message="${(r3.content as any)?.[0]?.text?.slice(0, 60)}…"`);

  const r4 = await client.callTool({ name: "dumtools_list_visites", arguments: { limit: 5 } });
  const c4 = (r4.structuredContent ?? {}) as { count?: number; visites?: { titre: string }[] };
  console.log(`✓ dumtools_list_visites → count=${c4.count}, 1ère = ${c4.visites?.[0]?.titre ?? "—"}`);

  const r5 = await client.callTool({ name: "dumtools_list_reserves", arguments: {} });
  const c5 = (r5.structuredContent ?? {}) as { count?: number; affaires?: unknown[] };
  console.log(`✓ dumtools_list_reserves → ${c5.count} réserve(s) ouverte(s) sur ${c5.affaires?.length} affaire(s)`);

  if (c4.visites?.length) {
    const r6 = await client.callTool({
      name: "dumtools_get_visite",
      arguments: { id: (c4.visites as unknown as { id: string }[])[0]!.id },
    });
    const texte = (r6.content as { text?: string }[])?.[0]?.text ?? "";
    const c6 = (r6.structuredContent ?? {}) as { visite?: { stats?: { total?: number } } };
    console.log(
      `✓ dumtools_get_visite → ${c6.visite?.stats?.total} points de checklist, réponse ${texte.length} caractères`,
    );
  }

  const noms = new Set(tools.map((t) => t.name));
  for (const attendu of ["dumtools_list_devis", "dumtools_add_devis_lignes", "dumtools_create_produit"]) {
    if (!noms.has(attendu)) throw new Error(`outil manquant au manifeste : ${attendu}`);
  }
  console.log("✓ outils devis présents au manifeste");

  const r7 = await client.callTool({ name: "dumtools_list_devis", arguments: { limit: 5 } });
  const c7 = (r7.structuredContent ?? {}) as { total?: number; devis?: { id: string; libelle: string }[] };
  console.log(`✓ dumtools_list_devis → ${c7.total} devis, 1er = ${c7.devis?.[0]?.libelle ?? "—"}`);

  if (c7.devis?.length) {
    const r8 = await client.callTool({ name: "dumtools_get_devis", arguments: { id: c7.devis[0]!.id } });
    const c8 = (r8.structuredContent ?? {}) as { devis?: { lots?: unknown[]; totaux?: { netHt?: number } } };
    console.log(`✓ dumtools_get_devis → ${c8.devis?.lots?.length} lot(s), net HT ${c8.devis?.totaux?.netHt} €`);
  }

  const r9 = await client.callTool({ name: "dumtools_search_articles_devis", arguments: { query: "ECY" } });
  const c9 = (r9.structuredContent ?? {}) as { articles?: unknown[]; prestations?: unknown[] };
  console.log(`✓ dumtools_search_articles_devis("ECY") → ${c9.articles?.length} article(s), ${c9.prestations?.length} prestation(s)`);

  // La garde de la demande explicite est dans le SCHÉMA : `false` ne passe pas.
  const r10 = await client.callTool({
    name: "dumtools_create_produit",
    arguments: { demandeExplicite: false, refInterne: "ZZ-NE-DOIT-PAS-EXISTER", designation: "x" },
  });
  if (!r10.isError) throw new Error("create_produit sans demande explicite aurait dû être refusé");
  console.log("✓ dumtools_create_produit(demandeExplicite: false) → refusé");

  await client.close();
  console.log("\nPROTOCOLE MCP OK ✅");
  process.exit(0);
}

main().catch((e) => {
  console.error("ÉCHEC client MCP:", e);
  process.exit(1);
});
