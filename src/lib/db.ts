import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

/* Singleton PrismaClient : évite d'ouvrir un pool par rechargement à chaud en
 * développement (le module est ré-évalué à chaque HMR).
 * Prisma 7 se connecte via un adaptateur de driver (ici node-postgres). */
const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

function createPrisma() {
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL,
  });
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createPrisma();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
