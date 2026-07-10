-- AlterTable
ALTER TABLE "Chantier" ADD COLUMN     "reseau1" TEXT NOT NULL DEFAULT 'RJ45 - BACnet/IP',
ADD COLUMN     "reseau2" TEXT NOT NULL DEFAULT 'RJ45 - supervision';

