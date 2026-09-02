-- ⚠️ Le diff de Prisma régénère à chaque fois un DROP INDEX
-- "WikiPage_recherche_idx" et un ALTER … "recherche" DROP DEFAULT sur la
-- colonne tsvector GÉNÉRÉE du wiki (posée en SQL brut, indescriptible par
-- Prisma). Postgres refuse le DROP DEFAULT → la migration échouerait à moitié
-- appliquée, en détruisant l'index GIN au passage. Les deux lignes ont été
-- retirées à la main (cf. CLAUDE.md).

-- AlterTable
ALTER TABLE "Devis" ADD COLUMN     "montrerDocumentations" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "Documentation" (
    "id" TEXT NOT NULL,
    "titre" TEXT NOT NULL,
    "categorie" TEXT NOT NULL DEFAULT 'fiche',
    "fichier" TEXT,
    "nom" TEXT NOT NULL DEFAULT '',
    "mimeType" TEXT NOT NULL DEFAULT 'application/pdf',
    "taille" INTEGER NOT NULL DEFAULT 0,
    "url" TEXT,
    "note" TEXT NOT NULL DEFAULT '',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Documentation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProduitDocumentation" (
    "produitId" TEXT NOT NULL,
    "documentationId" TEXT NOT NULL,
    "ordre" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProduitDocumentation_pkey" PRIMARY KEY ("produitId","documentationId")
);

-- CreateIndex
CREATE INDEX "Documentation_categorie_idx" ON "Documentation"("categorie");

-- CreateIndex
CREATE INDEX "ProduitDocumentation_documentationId_idx" ON "ProduitDocumentation"("documentationId");

-- AddForeignKey
ALTER TABLE "Documentation" ADD CONSTRAINT "Documentation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Documentation" ADD CONSTRAINT "Documentation_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProduitDocumentation" ADD CONSTRAINT "ProduitDocumentation_produitId_fkey" FOREIGN KEY ("produitId") REFERENCES "Produit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProduitDocumentation" ADD CONSTRAINT "ProduitDocumentation_documentationId_fkey" FOREIGN KEY ("documentationId") REFERENCES "Documentation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
