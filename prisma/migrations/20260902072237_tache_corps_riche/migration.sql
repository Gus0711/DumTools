-- ⚠️ Instructions RETIRÉES après génération (colonne tsvector générée du wiki,
-- que le diff Prisma veut « réparer » à chaque fois — voir CLAUDE.md).

-- AlterTable
ALTER TABLE "TacheAffaire" ADD COLUMN     "contenu" JSONB,
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 0;
