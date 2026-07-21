-- AlterTable
ALTER TABLE "ModemScan" ADD COLUMN     "chantierId" TEXT,
ADD COLUMN     "groupe" TEXT;

-- CreateIndex
CREATE INDEX "ModemScan_chantierId_idx" ON "ModemScan"("chantierId");

-- AddForeignKey
ALTER TABLE "ModemScan" ADD CONSTRAINT "ModemScan_chantierId_fkey" FOREIGN KEY ("chantierId") REFERENCES "Chantier"("id") ON DELETE SET NULL ON UPDATE CASCADE;
