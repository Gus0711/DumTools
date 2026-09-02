-- ⚠️ RETIRÉ après génération : DROP INDEX "WikiPage_recherche_idx" et
-- ALTER COLUMN "recherche" DROP DEFAULT. Colonne tsvector GÉNÉRÉE que le diff
-- Prisma veut « réparer » à chaque migration ; Postgres refuse et la migration
-- échoue À MOITIÉ APPLIQUÉE (vécu deux heures plus tôt). Voir CLAUDE.md.

-- CreateTable
CREATE TABLE "TacheMedia" (
    "id" TEXT NOT NULL,
    "tacheId" TEXT NOT NULL,
    "nom" TEXT NOT NULL DEFAULT '',
    "mimeType" TEXT NOT NULL DEFAULT 'application/octet-stream',
    "taille" INTEGER NOT NULL DEFAULT 0,
    "fichier" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TacheMedia_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TacheMedia_tacheId_idx" ON "TacheMedia"("tacheId");

-- AddForeignKey
ALTER TABLE "TacheMedia" ADD CONSTRAINT "TacheMedia_tacheId_fkey" FOREIGN KEY ("tacheId") REFERENCES "TacheAffaire"("id") ON DELETE CASCADE ON UPDATE CASCADE;
