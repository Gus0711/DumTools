-- CreateEnum
CREATE TYPE "EtatTache" AS ENUM ('A_FAIRE', 'EN_COURS', 'TERMINEE');

-- CreateTable
CREATE TABLE "TacheAffaire" (
    "id" TEXT NOT NULL,
    "titre" TEXT NOT NULL,
    "etat" "EtatTache" NOT NULL DEFAULT 'A_FAIRE',
    "ordre" DOUBLE PRECISION NOT NULL,
    "chantierId" TEXT NOT NULL,
    "assigneId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TacheAffaire_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TacheAffaire_chantierId_idx" ON "TacheAffaire"("chantierId");

-- CreateIndex
CREATE INDEX "TacheAffaire_assigneId_idx" ON "TacheAffaire"("assigneId");

-- AddForeignKey
ALTER TABLE "TacheAffaire" ADD CONSTRAINT "TacheAffaire_chantierId_fkey" FOREIGN KEY ("chantierId") REFERENCES "Chantier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TacheAffaire" ADD CONSTRAINT "TacheAffaire_assigneId_fkey" FOREIGN KEY ("assigneId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
