-- « Suivi par » : qui s'occupe de l'affaire chez nous.
--
-- ⚠️ Le diff généré par Prisma contenait aussi un `DROP INDEX
-- "WikiPage_recherche_idx"` et un `ALTER TABLE "WikiPage" ALTER COLUMN
-- "recherche" DROP DEFAULT` : la colonne tsvector générée du wiki est posée en
-- SQL brut et Prisma ne sait pas la décrire, donc il propose de la « corriger »
-- à chaque migration. Postgres refuse le DROP DEFAULT → la migration échoue à
-- moitié appliquée APRÈS avoir réellement détruit l'index GIN. Les deux lignes
-- ont été retirées à la main (voir CLAUDE.md).

-- AlterTable
ALTER TABLE "Chantier" ADD COLUMN     "suiviParId" TEXT;

-- CreateIndex
CREATE INDEX "Chantier_suiviParId_idx" ON "Chantier"("suiviParId");

-- AddForeignKey
ALTER TABLE "Chantier" ADD CONSTRAINT "Chantier_suiviParId_fkey" FOREIGN KEY ("suiviParId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
