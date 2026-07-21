-- CreateEnum
CREATE TYPE "ProfilNdf" AS ENUM ('TECHNICIEN', 'DIRECTION_RA');

-- CreateEnum
CREATE TYPE "CategorieFrais" AS ENUM ('TRANSPORT', 'CARBURANT', 'ACHATS_DIVERS', 'REPAS_HOTEL_SEUL', 'REPAS_HOTEL_ACCOMPAGNE', 'ENTRETIEN_VEHICULE', 'REPAS_AFFAIRES', 'CONSOMMATIONS');

-- NOTE : Prisma propose ici de supprimer l'index GIN « WikiPage_recherche_idx »
-- et le DEFAULT de la colonne générée « WikiPage.recherche ». C'est une FAUSSE
-- dérive : Prisma ne sait pas modéliser les colonnes générées, il croit donc
-- devoir les défaire à chaque migration. Ces deux lignes sont retirées à la
-- main (même précédent que 20260720144700_outil_formulaires) — les appliquer
-- casserait la recherche plein-texte du wiki.

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "profilNdf" "ProfilNdf";

-- CreateTable
CREATE TABLE "DepenseFrais" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "categorie" "CategorieFrais" NOT NULL,
    "montantCents" INTEGER NOT NULL,
    "tvaCents" INTEGER,
    "descriptif" TEXT NOT NULL DEFAULT '',
    "numeroAffaire" TEXT NOT NULL DEFAULT '',
    "chantierId" TEXT,
    "nbInvites" INTEGER,
    "invites" TEXT NOT NULL DEFAULT '',
    "periode" TEXT NOT NULL,
    "periodeOrigine" TEXT,
    "saisieSource" TEXT NOT NULL DEFAULT 'manuelle',
    "ocrBrut" JSONB,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DepenseFrais_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JustificatifFrais" (
    "id" TEXT NOT NULL,
    "depenseId" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL DEFAULT 'application/octet-stream',
    "taille" INTEGER NOT NULL DEFAULT 0,
    "fichier" TEXT NOT NULL,
    "nomOrigine" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JustificatifFrais_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NoteFraisMois" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "periode" TEXT NOT NULL,
    "transmiseLe" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NoteFraisMois_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DepenseFrais_createdById_periode_idx" ON "DepenseFrais"("createdById", "periode");

-- CreateIndex
CREATE INDEX "DepenseFrais_createdById_date_idx" ON "DepenseFrais"("createdById", "date");

-- CreateIndex
CREATE INDEX "DepenseFrais_chantierId_idx" ON "DepenseFrais"("chantierId");

-- CreateIndex
CREATE INDEX "JustificatifFrais_depenseId_idx" ON "JustificatifFrais"("depenseId");

-- CreateIndex
CREATE INDEX "NoteFraisMois_userId_idx" ON "NoteFraisMois"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "NoteFraisMois_userId_periode_key" ON "NoteFraisMois"("userId", "periode");

-- AddForeignKey
ALTER TABLE "DepenseFrais" ADD CONSTRAINT "DepenseFrais_chantierId_fkey" FOREIGN KEY ("chantierId") REFERENCES "Chantier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepenseFrais" ADD CONSTRAINT "DepenseFrais_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JustificatifFrais" ADD CONSTRAINT "JustificatifFrais_depenseId_fkey" FOREIGN KEY ("depenseId") REFERENCES "DepenseFrais"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NoteFraisMois" ADD CONSTRAINT "NoteFraisMois_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
