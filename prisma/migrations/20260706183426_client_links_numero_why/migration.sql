-- AlterTable
ALTER TABLE "AffectationProjet" ADD COLUMN     "clientId" TEXT,
ADD COLUMN     "numeroWhy" TEXT;

-- AlterTable
ALTER TABLE "PointsList" ADD COLUMN     "clientId" TEXT,
ADD COLUMN     "numeroWhy" TEXT;

-- CreateIndex
CREATE INDEX "AffectationProjet_clientId_idx" ON "AffectationProjet"("clientId");

-- CreateIndex
CREATE INDEX "PointsList_clientId_idx" ON "PointsList"("clientId");

-- AddForeignKey
ALTER TABLE "PointsList" ADD CONSTRAINT "PointsList_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffectationProjet" ADD CONSTRAINT "AffectationProjet_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;
