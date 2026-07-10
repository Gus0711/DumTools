-- CreateEnum
CREATE TYPE "BesoinArmoire" AS ENUM ('INTEGRATION', 'NOUVELLE');

-- AlterTable
ALTER TABLE "Chantier" ADD COLUMN     "besoinArmoire" "BesoinArmoire";
