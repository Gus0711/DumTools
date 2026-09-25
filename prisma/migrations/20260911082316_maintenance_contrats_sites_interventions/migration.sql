-- CreateEnum
CREATE TYPE "EtatContrat" AS ENUM ('BROUILLON', 'ACTIF', 'SUSPENDU', 'TERMINE');

-- CreateEnum
CREATE TYPE "NatureIntervention" AS ENUM ('TELEASSISTANCE', 'PRESENTIEL');

-- ⚠️ RETIRÉ À LA MAIN (voir CLAUDE.md) : le diff Prisma régénère à chaque
-- migration un DROP INDEX "WikiPage_recherche_idx" + un DROP DEFAULT sur la
-- colonne tsvector GÉNÉRÉE du wiki, posée en SQL brut et indescriptible par
-- Prisma. Postgres refuse le DROP DEFAULT → la migration échouerait à moitié
-- appliquée, l'index GIN réellement détruit au passage.

-- CreateTable
CREATE TABLE "SiteClient" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "adresse" TEXT NOT NULL DEFAULT '',
    "codePostal" TEXT NOT NULL DEFAULT '',
    "ville" TEXT NOT NULL DEFAULT '',
    "acces" TEXT NOT NULL DEFAULT '',
    "accesDistant" TEXT NOT NULL DEFAULT '',
    "note" TEXT NOT NULL DEFAULT '',
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,

    CONSTRAINT "SiteClient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContratMaintenance" (
    "id" TEXT NOT NULL,
    "reference" TEXT,
    "numeroWhy" TEXT,
    "intitule" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "etat" "EtatContrat" NOT NULL DEFAULT 'ACTIF',
    "debut" TIMESTAMP(3) NOT NULL,
    "fin" TIMESTAMP(3),
    "tacite" BOOLEAN NOT NULL DEFAULT true,
    "preavisJours" INTEGER NOT NULL DEFAULT 0,
    "quotaTeleMin" INTEGER NOT NULL DEFAULT 0,
    "quotaPresentielMin" INTEGER NOT NULL DEFAULT 0,
    "tarifHoraireCents" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,

    CONSTRAINT "ContratMaintenance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContratSite" (
    "contratId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,

    CONSTRAINT "ContratSite_pkey" PRIMARY KEY ("contratId","siteId")
);

-- CreateTable
CREATE TABLE "Intervention" (
    "id" TEXT NOT NULL,
    "contratId" TEXT NOT NULL,
    "siteId" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "nature" "NatureIntervention" NOT NULL DEFAULT 'TELEASSISTANCE',
    "dureeMin" INTEGER NOT NULL DEFAULT 0,
    "motif" TEXT NOT NULL,
    "compteRendu" TEXT NOT NULL DEFAULT '',
    "demandeur" TEXT NOT NULL DEFAULT '',
    "intervenantId" TEXT,
    "horsForfait" BOOLEAN NOT NULL DEFAULT false,
    "factureeLe" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,

    CONSTRAINT "Intervention_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SiteClient_clientId_idx" ON "SiteClient"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "SiteClient_clientId_nom_key" ON "SiteClient"("clientId", "nom");

-- CreateIndex
CREATE INDEX "ContratMaintenance_clientId_idx" ON "ContratMaintenance"("clientId");

-- CreateIndex
CREATE INDEX "ContratMaintenance_etat_idx" ON "ContratMaintenance"("etat");

-- CreateIndex
CREATE INDEX "ContratSite_siteId_idx" ON "ContratSite"("siteId");

-- CreateIndex
CREATE INDEX "Intervention_contratId_date_createdAt_idx" ON "Intervention"("contratId", "date", "createdAt");

-- CreateIndex
CREATE INDEX "Intervention_siteId_idx" ON "Intervention"("siteId");

-- CreateIndex
CREATE INDEX "Intervention_intervenantId_idx" ON "Intervention"("intervenantId");

-- AddForeignKey
ALTER TABLE "SiteClient" ADD CONSTRAINT "SiteClient_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteClient" ADD CONSTRAINT "SiteClient_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContratMaintenance" ADD CONSTRAINT "ContratMaintenance_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContratMaintenance" ADD CONSTRAINT "ContratMaintenance_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContratMaintenance" ADD CONSTRAINT "ContratMaintenance_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContratSite" ADD CONSTRAINT "ContratSite_contratId_fkey" FOREIGN KEY ("contratId") REFERENCES "ContratMaintenance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContratSite" ADD CONSTRAINT "ContratSite_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "SiteClient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Intervention" ADD CONSTRAINT "Intervention_contratId_fkey" FOREIGN KEY ("contratId") REFERENCES "ContratMaintenance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Intervention" ADD CONSTRAINT "Intervention_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "SiteClient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Intervention" ADD CONSTRAINT "Intervention_intervenantId_fkey" FOREIGN KEY ("intervenantId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Intervention" ADD CONSTRAINT "Intervention_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Intervention" ADD CONSTRAINT "Intervention_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
