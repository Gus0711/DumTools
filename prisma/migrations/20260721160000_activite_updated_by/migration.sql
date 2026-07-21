-- Auteur de la dernière modification HUMAINE, pour le fil d'activité de
-- l'accueil (« qui a touché à quoi »). Nullable : les lignes existantes n'ont
-- pas d'historique, et les écritures techniques (synchro kDrive, propagation de
-- dénormalisation, réordonnancement) n'y touchent volontairement pas.

-- AlterTable
ALTER TABLE "Chantier" ADD COLUMN     "updatedById" TEXT;
ALTER TABLE "AffectationProjet" ADD COLUMN     "updatedById" TEXT;
ALTER TABLE "Note" ADD COLUMN     "updatedById" TEXT;
ALTER TABLE "Visite" ADD COLUMN     "updatedById" TEXT;
ALTER TABLE "WikiPage" ADD COLUMN     "updatedById" TEXT;

-- AddForeignKey
ALTER TABLE "Chantier" ADD CONSTRAINT "Chantier_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AffectationProjet" ADD CONSTRAINT "AffectationProjet_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Note" ADD CONSTRAINT "Note_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Visite" ADD CONSTRAINT "Visite_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WikiPage" ADD CONSTRAINT "WikiPage_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
