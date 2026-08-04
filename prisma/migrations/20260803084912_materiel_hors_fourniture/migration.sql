-- ⚠️ Les deux instructions générées ici par `prisma migrate dev` (DROP INDEX
-- "WikiPage_recherche_idx" + ALTER … "recherche" DROP DEFAULT) ont été RETIRÉES
-- à la main : la colonne tsvector du wiki est posée en SQL brut et Prisma la
-- redécouvre à chaque diff. Postgres refuse le DROP DEFAULT → la migration
-- échouerait à moitié appliquée, en détruisant l'index GIN au passage.
-- Voir CLAUDE.md « Notes techniques ». Ne pas les réintroduire.

-- CreateTable
CREATE TABLE "MaterielHorsFourniture" (
    "id" TEXT NOT NULL,
    "chantierId" TEXT NOT NULL,
    "produitId" TEXT NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MaterielHorsFourniture_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MaterielHorsFourniture_produitId_idx" ON "MaterielHorsFourniture"("produitId");

-- CreateIndex
CREATE UNIQUE INDEX "MaterielHorsFourniture_chantierId_produitId_key" ON "MaterielHorsFourniture"("chantierId", "produitId");

-- AddForeignKey
ALTER TABLE "MaterielHorsFourniture" ADD CONSTRAINT "MaterielHorsFourniture_chantierId_fkey" FOREIGN KEY ("chantierId") REFERENCES "Chantier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterielHorsFourniture" ADD CONSTRAINT "MaterielHorsFourniture_produitId_fkey" FOREIGN KEY ("produitId") REFERENCES "Produit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterielHorsFourniture" ADD CONSTRAINT "MaterielHorsFourniture_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
