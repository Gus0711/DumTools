-- ⚠️ Le diff de Prisma proposait ici un DROP INDEX "WikiPage_recherche_idx" et
-- un ALTER TABLE "WikiPage" ALTER COLUMN "recherche" DROP DEFAULT : la colonne
-- tsvector générée du wiki est posée en SQL brut et Prisma ne sait pas la
-- décrire. Postgres refuse le DROP DEFAULT, la migration échouerait à moitié
-- appliquée — et l'index GIN serait réellement détruit au passage. Les deux
-- lignes sont retirées à la main (voir CLAUDE.md).

-- AlterTable
ALTER TABLE "NomenclaturePoint" ADD COLUMN     "parDefaut" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "variante" TEXT;

-- CreateTable
CREATE TABLE "ChoixVarianteAffaire" (
    "id" TEXT NOT NULL,
    "chantierId" TEXT NOT NULL,
    "pointCatalogId" TEXT NOT NULL,
    "variante" TEXT NOT NULL,
    "nomenclatureId" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChoixVarianteAffaire_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChoixVarianteAffaire_nomenclatureId_idx" ON "ChoixVarianteAffaire"("nomenclatureId");

-- CreateIndex
CREATE INDEX "ChoixVarianteAffaire_pointCatalogId_idx" ON "ChoixVarianteAffaire"("pointCatalogId");

-- CreateIndex
CREATE UNIQUE INDEX "ChoixVarianteAffaire_chantierId_pointCatalogId_variante_key" ON "ChoixVarianteAffaire"("chantierId", "pointCatalogId", "variante");

-- CreateIndex
CREATE INDEX "NomenclaturePoint_pointCatalogId_variante_idx" ON "NomenclaturePoint"("pointCatalogId", "variante");

-- AddForeignKey
ALTER TABLE "ChoixVarianteAffaire" ADD CONSTRAINT "ChoixVarianteAffaire_chantierId_fkey" FOREIGN KEY ("chantierId") REFERENCES "Chantier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChoixVarianteAffaire" ADD CONSTRAINT "ChoixVarianteAffaire_pointCatalogId_fkey" FOREIGN KEY ("pointCatalogId") REFERENCES "PointCatalog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChoixVarianteAffaire" ADD CONSTRAINT "ChoixVarianteAffaire_nomenclatureId_fkey" FOREIGN KEY ("nomenclatureId") REFERENCES "NomenclaturePoint"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChoixVarianteAffaire" ADD CONSTRAINT "ChoixVarianteAffaire_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
