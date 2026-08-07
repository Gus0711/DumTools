-- CreateEnum
CREATE TYPE "TypeAssociation" AS ENUM ('ACCESSOIRE', 'VARIANTE');

-- ⚠️ DÉRIVE PRISMA RETIRÉE À LA MAIN (voir CLAUDE.md « pièges »).
-- Le générateur reproduit à chaque migration un DROP INDEX sur l'index GIN du
-- wiki et un DROP DEFAULT sur sa colonne tsvector générée : Postgres refuse le
-- second, la migration échoue à moitié appliquée, et l'index de recherche est
-- réellement détruit au passage.

-- CreateTable
CREATE TABLE "AssociationProduit" (
    "id" TEXT NOT NULL,
    "produitId" TEXT NOT NULL,
    "associeId" TEXT NOT NULL,
    "type" "TypeAssociation" NOT NULL DEFAULT 'ACCESSOIRE',
    "groupe" TEXT,
    "quantite" INTEGER NOT NULL DEFAULT 1,
    "parUnite" BOOLEAN NOT NULL DEFAULT true,
    "parDefaut" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT NOT NULL DEFAULT '',
    "ordre" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssociationProduit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AssociationProduit_produitId_idx" ON "AssociationProduit"("produitId");

-- CreateIndex
CREATE INDEX "AssociationProduit_associeId_idx" ON "AssociationProduit"("associeId");

-- CreateIndex
CREATE UNIQUE INDEX "AssociationProduit_produitId_associeId_key" ON "AssociationProduit"("produitId", "associeId");

-- AddForeignKey
ALTER TABLE "AssociationProduit" ADD CONSTRAINT "AssociationProduit_produitId_fkey" FOREIGN KEY ("produitId") REFERENCES "Produit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssociationProduit" ADD CONSTRAINT "AssociationProduit_associeId_fkey" FOREIGN KEY ("associeId") REFERENCES "Produit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssociationProduit" ADD CONSTRAINT "AssociationProduit_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
