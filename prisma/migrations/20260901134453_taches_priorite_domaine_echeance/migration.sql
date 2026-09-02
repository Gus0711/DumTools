-- ⚠️ Deux instructions ont été RETIRÉES de ce fichier après génération :
--     DROP INDEX "WikiPage_recherche_idx";
--     ALTER TABLE "WikiPage" ALTER COLUMN "recherche" DROP DEFAULT;
-- La colonne `recherche` du wiki est une colonne GÉNÉRÉE (tsvector), posée en
-- SQL brut et indescriptible par Prisma : le diff veut la « réparer » à chaque
-- migration. Postgres refuse le DROP DEFAULT, la migration échoue À MOITIÉ
-- APPLIQUÉE, et l'index GIN est réellement détruit au passage.
-- Voir CLAUDE.md § Prisma 7.

-- CreateEnum
CREATE TYPE "PrioriteTache" AS ENUM ('BASSE', 'NORMALE', 'HAUTE');

-- AlterTable
ALTER TABLE "TacheAffaire" ADD COLUMN     "domaineId" TEXT,
ADD COLUMN     "echeance" TIMESTAMP(3),
ADD COLUMN     "priorite" "PrioriteTache" NOT NULL DEFAULT 'NORMALE',
ALTER COLUMN "chantierId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "DomaineTache" (
    "id" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "ordre" INTEGER NOT NULL DEFAULT 0,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DomaineTache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DomaineTache_nom_key" ON "DomaineTache"("nom");

-- CreateIndex
CREATE INDEX "TacheAffaire_domaineId_idx" ON "TacheAffaire"("domaineId");

-- CreateIndex
CREATE INDEX "TacheAffaire_echeance_idx" ON "TacheAffaire"("echeance");

-- AddForeignKey
ALTER TABLE "TacheAffaire" ADD CONSTRAINT "TacheAffaire_domaineId_fkey" FOREIGN KEY ("domaineId") REFERENCES "DomaineTache"("id") ON DELETE SET NULL ON UPDATE CASCADE;
