-- CreateEnum
CREATE TYPE "TypeVisite" AS ENUM ('RELEVE', 'SUIVI', 'RECEPTION', 'MAINTENANCE');

-- CreateTable
CREATE TABLE "Visite" (
    "id" TEXT NOT NULL,
    "type" "TypeVisite" NOT NULL DEFAULT 'RELEVE',
    "titre" TEXT NOT NULL DEFAULT '',
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "chantierId" TEXT,
    "clientId" TEXT,
    "clientNom" TEXT NOT NULL DEFAULT '',
    "numeroWhy" TEXT,
    "data" JSONB NOT NULL DEFAULT '{}',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Visite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VisiteMedia" (
    "id" TEXT NOT NULL,
    "visiteId" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'photo',
    "mimeType" TEXT NOT NULL DEFAULT 'application/octet-stream',
    "taille" INTEGER NOT NULL DEFAULT 0,
    "fichier" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VisiteMedia_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Visite_chantierId_idx" ON "Visite"("chantierId");

-- CreateIndex
CREATE INDEX "Visite_clientId_idx" ON "Visite"("clientId");

-- CreateIndex
CREATE INDEX "VisiteMedia_visiteId_idx" ON "VisiteMedia"("visiteId");

-- AddForeignKey
ALTER TABLE "Visite" ADD CONSTRAINT "Visite_chantierId_fkey" FOREIGN KEY ("chantierId") REFERENCES "Chantier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Visite" ADD CONSTRAINT "Visite_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Visite" ADD CONSTRAINT "Visite_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisiteMedia" ADD CONSTRAINT "VisiteMedia_visiteId_fkey" FOREIGN KEY ("visiteId") REFERENCES "Visite"("id") ON DELETE CASCADE ON UPDATE CASCADE;
