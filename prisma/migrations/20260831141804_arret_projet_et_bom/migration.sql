-- AlterTable
ALTER TABLE "AffectationProjet" ADD COLUMN     "arreteLe" TIMESTAMP(3),
ADD COLUMN     "arreteParId" TEXT;

-- AlterTable
ALTER TABLE "Chantier" ADD COLUMN     "bomArreteeLe" TIMESTAMP(3),
ADD COLUMN     "bomArreteeParId" TEXT,
ADD COLUMN     "bomToucheeLe" TIMESTAMP(3);

-- AddForeignKey
ALTER TABLE "Chantier" ADD CONSTRAINT "Chantier_bomArreteeParId_fkey" FOREIGN KEY ("bomArreteeParId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffectationProjet" ADD CONSTRAINT "AffectationProjet_arreteParId_fkey" FOREIGN KEY ("arreteParId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
