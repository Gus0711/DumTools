-- CreateEnum
CREATE TYPE "EtatAffaire" AS ENUM ('PROSPECT', 'DEVIS', 'GAGNE', 'EN_COURS', 'LIVRE', 'CLOTURE');

-- AlterTable
ALTER TABLE "AffectationProjet" ADD COLUMN     "chantierId" TEXT;

-- AlterTable
ALTER TABLE "Chantier" ADD COLUMN     "etat" "EtatAffaire" NOT NULL DEFAULT 'PROSPECT',
ADD COLUMN     "numeroWhy" TEXT;

-- CreateIndex
CREATE INDEX "AffectationProjet_chantierId_idx" ON "AffectationProjet"("chantierId");

-- CreateIndex
CREATE UNIQUE INDEX "Chantier_numeroWhy_key" ON "Chantier"("numeroWhy");

-- AddForeignKey
ALTER TABLE "AffectationProjet" ADD CONSTRAINT "AffectationProjet_chantierId_fkey" FOREIGN KEY ("chantierId") REFERENCES "Chantier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

