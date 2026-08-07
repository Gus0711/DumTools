-- CreateEnum
CREATE TYPE "EtatDevis" AS ENUM ('BROUILLON', 'EMIS', 'ACCEPTE', 'REFUSE');

-- CreateEnum
CREATE TYPE "GenreLigne" AS ENUM ('PRODUIT', 'PRESTATION', 'LIBRE', 'TEXTE');

-- ⚠️ DÉRIVE PRISMA RETIRÉE À LA MAIN (voir CLAUDE.md « pièges »).
-- Le générateur glisse ici un `DROP INDEX "WikiPage_recherche_idx"` et un
-- `ALTER TABLE "WikiPage" ALTER COLUMN "recherche" DROP DEFAULT` : la colonne
-- tsvector générée du wiki et son index GIN sont posés en SQL brut, Prisma ne
-- sait pas les décrire et croit à chaque fois devoir les défaire. Postgres
-- refuse le DROP DEFAULT → la migration échouerait À MOITIÉ APPLIQUÉE, après
-- avoir réellement détruit l'index de recherche plein-texte.

-- CreateTable
CREATE TABLE "Devis" (
    "id" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "parentId" TEXT,
    "titre" TEXT NOT NULL DEFAULT '',
    "etat" "EtatDevis" NOT NULL DEFAULT 'BROUILLON',
    "clientNom" TEXT NOT NULL DEFAULT '',
    "clientId" TEXT,
    "numeroWhy" TEXT,
    "chantierId" TEXT,
    "coefDefautMillieme" INTEGER NOT NULL DEFAULT 1350,
    "tauxTvaCentieme" INTEGER NOT NULL DEFAULT 2000,
    "remiseGlobalePourMille" INTEGER,
    "remiseGlobaleCents" INTEGER,
    "validiteJours" INTEGER NOT NULL DEFAULT 30,
    "note" TEXT NOT NULL DEFAULT '',
    "emisLe" TIMESTAMP(3),
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Devis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LotDevis" (
    "id" TEXT NOT NULL,
    "devisId" TEXT NOT NULL,
    "titre" TEXT NOT NULL,
    "ordre" DOUBLE PRECISION NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "LotDevis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LigneDevis" (
    "id" TEXT NOT NULL,
    "devisId" TEXT NOT NULL,
    "lotId" TEXT,
    "ordre" DOUBLE PRECISION NOT NULL,
    "genre" "GenreLigne" NOT NULL,
    "produitId" TEXT,
    "prestationId" TEXT,
    "designation" TEXT NOT NULL,
    "refInterne" TEXT,
    "unite" TEXT NOT NULL DEFAULT 'U',
    "quantiteMillieme" INTEGER NOT NULL DEFAULT 1000,
    "debourseCents" INTEGER,
    "coefMillieme" INTEGER,
    "origineCoef" TEXT NOT NULL DEFAULT 'devis',
    "pvUnitaireCents" INTEGER NOT NULL DEFAULT 0,
    "remisePourMille" INTEGER NOT NULL DEFAULT 0,
    "option" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LigneDevis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Prestation" (
    "id" TEXT NOT NULL,
    "libelle" TEXT NOT NULL,
    "unite" TEXT NOT NULL DEFAULT 'h',
    "prixVenteCents" INTEGER NOT NULL DEFAULT 0,
    "famille" TEXT NOT NULL DEFAULT '',
    "ordre" INTEGER NOT NULL DEFAULT 0,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Prestation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoefVente" (
    "id" TEXT NOT NULL,
    "portee" TEXT NOT NULL,
    "cibleId" TEXT,
    "coefMillieme" INTEGER NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CoefVente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompteurDevis" (
    "annee" INTEGER NOT NULL,
    "dernier" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CompteurDevis_pkey" PRIMARY KEY ("annee")
);

-- CreateIndex
CREATE INDEX "Devis_clientId_idx" ON "Devis"("clientId");

-- CreateIndex
CREATE INDEX "Devis_chantierId_idx" ON "Devis"("chantierId");

-- CreateIndex
CREATE INDEX "Devis_etat_idx" ON "Devis"("etat");

-- CreateIndex
CREATE INDEX "Devis_parentId_idx" ON "Devis"("parentId");

-- CreateIndex
CREATE UNIQUE INDEX "Devis_numero_revision_key" ON "Devis"("numero", "revision");

-- CreateIndex
CREATE INDEX "LotDevis_devisId_ordre_idx" ON "LotDevis"("devisId", "ordre");

-- CreateIndex
CREATE INDEX "LigneDevis_devisId_ordre_idx" ON "LigneDevis"("devisId", "ordre");

-- CreateIndex
CREATE INDEX "LigneDevis_lotId_idx" ON "LigneDevis"("lotId");

-- CreateIndex
CREATE INDEX "LigneDevis_produitId_idx" ON "LigneDevis"("produitId");

-- CreateIndex
CREATE INDEX "LigneDevis_prestationId_idx" ON "LigneDevis"("prestationId");

-- CreateIndex
CREATE UNIQUE INDEX "Prestation_libelle_key" ON "Prestation"("libelle");

-- CreateIndex
CREATE UNIQUE INDEX "CoefVente_portee_cibleId_key" ON "CoefVente"("portee", "cibleId");

-- AddForeignKey
ALTER TABLE "Devis" ADD CONSTRAINT "Devis_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Devis"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Devis" ADD CONSTRAINT "Devis_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Devis" ADD CONSTRAINT "Devis_chantierId_fkey" FOREIGN KEY ("chantierId") REFERENCES "Chantier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Devis" ADD CONSTRAINT "Devis_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Devis" ADD CONSTRAINT "Devis_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LotDevis" ADD CONSTRAINT "LotDevis_devisId_fkey" FOREIGN KEY ("devisId") REFERENCES "Devis"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LigneDevis" ADD CONSTRAINT "LigneDevis_devisId_fkey" FOREIGN KEY ("devisId") REFERENCES "Devis"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LigneDevis" ADD CONSTRAINT "LigneDevis_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "LotDevis"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LigneDevis" ADD CONSTRAINT "LigneDevis_produitId_fkey" FOREIGN KEY ("produitId") REFERENCES "Produit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LigneDevis" ADD CONSTRAINT "LigneDevis_prestationId_fkey" FOREIGN KEY ("prestationId") REFERENCES "Prestation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoefVente" ADD CONSTRAINT "CoefVente_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
