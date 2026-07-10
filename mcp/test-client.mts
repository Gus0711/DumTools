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

  await client.close();
  console.log("\nPROTOCOLE MCP OK ✅");
  process.exit(0);
}

main().catch((e) => {
  console.error("ÉCHEC client MCP:", e);
  process.exit(1);
});
