-- CreateEnum
CREATE TYPE "StatutSync" AS ENUM ('EN_ATTENTE', 'EN_COURS', 'SYNC', 'ERREUR');

-- CreateEnum
CREATE TYPE "PolitiqueConflit" AS ENUM ('VERSION', 'RENAME');

-- AlterTable
ALTER TABLE "Chantier" ADD COLUMN     "annee" INTEGER,
ADD COLUMN     "kdriveDirId" TEXT;

-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "kdriveDossier" TEXT;

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "categorie" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL DEFAULT 'application/octet-stream',
    "taille" INTEGER NOT NULL DEFAULT 0,
    "chantierId" TEXT NOT NULL,
    "clientId" TEXT,
    "numeroWhy" TEXT,
    "spoolPath" TEXT,
    "kdriveFileId" TEXT,
    "kdrivePath" TEXT NOT NULL DEFAULT '',
    "statutSync" "StatutSync" NOT NULL DEFAULT 'EN_ATTENTE',
    "politiqueConflit" "PolitiqueConflit" NOT NULL DEFAULT 'VERSION',
    "tentatives" INTEGER NOT NULL DEFAULT 0,
    "syncError" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Document_chantierId_idx" ON "Document"("chantierId");

-- CreateIndex
CREATE INDEX "Document_clientId_idx" ON "Document"("clientId");

-- CreateIndex
CREATE INDEX "Document_statutSync_idx" ON "Document"("statutSync");

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_chantierId_fkey" FOREIGN KEY ("chantierId") REFERENCES "Chantier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
