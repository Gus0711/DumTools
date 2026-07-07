-- AlterTable
ALTER TABLE "AutomateModele" ADD COLUMN     "docUrl" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "maxModules" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "maxPoints" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "ModuleModele" ADD COLUMN     "docUrl" TEXT NOT NULL DEFAULT '';
