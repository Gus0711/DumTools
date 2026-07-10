// Génère (ou révoque) le jeton d'accès MCP d'un utilisateur.
//
//   npx tsx scripts/mcp-token.mts <email>            → génère un nouveau jeton
//   npx tsx scripts/mcp-token.mts <email> --revoke   → coupe l'accès
//   npx tsx scripts/mcp-token.mts --list             → qui a un jeton actif
//
// Le jeton n'est stocké que sous forme de hash SHA-256 (mcpTokenHash). Le jeton
// en clair n'est affiché qu'UNE fois, à la génération : à copier dans la config
// du poste (en-tête Authorization: Bearer …). Régénérer invalide l'ancien.
import "dotenv/config";
import { randomBytes, createHash } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

async function main() {
  const args = process.argv.slice(2);

  if (args.includes("--list")) {
    const users = await prisma.user.findMany({
      where: { mcpTokenHash: { not: null } },
      select: { email: true, nom: true, role: true, actif: true },
      orderBy: { email: "asc" },
    });
    console.log(`Jetons MCP actifs : ${users.length}`);
    for (const u of users) console.log(`  - ${u.email} (${u.nom}, ${u.role}${u.actif ? "" : ", INACTIF"})`);
    return;
  }

  const email = (args[0] || "").trim().toLowerCase();
  const revoke = args.includes("--revoke");
  if (!email) {
    console.error("Usage : npx tsx scripts/mcp-token.mts <email> [--revoke] | --list");
    process.exit(1);
  }

  const user = await prisma.user.findUnique({ where: { email }, select: { id: true, nom: true, actif: true } });
  if (!user) {
    console.error(`Aucun utilisateur avec l'email « ${email} ».`);
    process.exit(1);
  }

  if (revoke) {
    await prisma.user.update({ where: { email }, data: { mcpTokenHash: null } });
    console.log(`✓ Jeton MCP révoqué pour ${email}.`);
    return;
  }

  // Jeton : préfixe lisible + 32 octets aléatoires (256 bits d'entropie).
  const token = "dtk_" + randomBytes(32).toString("hex");
  await prisma.user.update({ where: { email }, data: { mcpTokenHash: sha256(token) } });

  console.log(`\n✓ Nouveau jeton MCP pour ${email} (${user.nom})${user.actif ? "" : "  ⚠️ compte INACTIF"}`);
  console.log("\n  " + token + "\n");
  console.log("⚠️  Affiché une seule fois — copiez-le maintenant. Il remplace tout jeton précédent.");
  console.log("   À mettre dans la config du poste (en-tête) :");
  console.log(`   "--header", "Authorization: Bearer ${token}"`);
}

main()
  .catch((e) => {
    console.error("Erreur :", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
