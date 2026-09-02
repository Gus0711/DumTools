-- ⚠️ Deux instructions RETIRÉES après génération (colonne tsvector générée du
-- wiki, que le diff Prisma veut « réparer » à chaque fois — voir CLAUDE.md) :
--     DROP INDEX "WikiPage_recherche_idx";
--     ALTER TABLE "WikiPage" ALTER COLUMN "recherche" DROP DEFAULT;

-- AlterTable
ALTER TABLE "TacheAffaire" ADD COLUMN     "clientId" TEXT;

-- CreateIndex
CREATE INDEX "TacheAffaire_clientId_idx" ON "TacheAffaire"("clientId");

-- AddForeignKey
ALTER TABLE "TacheAffaire" ADD CONSTRAINT "TacheAffaire_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
