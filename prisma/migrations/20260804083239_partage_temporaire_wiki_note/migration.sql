-- Partage public TEMPORAIRE : échéance sur les notes, jeton + échéance sur les
-- pages de wiki (lecture seule via /n/[jeton] et /w/[jeton], sans session).
--
-- ⚠️ Le diff Prisma proposait ici deux instructions RETIRÉES À LA MAIN (cf.
-- CLAUDE.md) : `DROP INDEX "WikiPage_recherche_idx"` et `ALTER COLUMN
-- "recherche" DROP DEFAULT`. La colonne `recherche` est un tsvector GÉNÉRÉ posé
-- en SQL brut, que Prisma ne sait pas décrire : il la voit dériver à chaque
-- diff. Les rejouer détruirait l'index GIN du wiki et échouerait à mi-course.

-- AlterTable
ALTER TABLE "Note" ADD COLUMN     "partageExpireLe" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "WikiPage" ADD COLUMN     "jetonPartage" TEXT,
ADD COLUMN     "partageExpireLe" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "WikiPage_jetonPartage_key" ON "WikiPage"("jetonPartage");
