-- Outil « Magasin » : référentiel produit (le « mini CRM ») + gestion de stock.
-- Cadrage : docs/MAGASIN.md. Le stock n'est jamais stocké — il est la SOMME des
-- mouvements (source décrémente, destination incrémente, quantité positive).
--
-- NOTE : `prisma migrate dev` a de nouveau généré ici un
-- `DROP INDEX "WikiPage_recherche_idx"` + un `ALTER ... "recherche" DROP DEFAULT`.
-- C'est la DÉRIVE connue (cf. migrations scan_photos, outil_formulaires…) : la
-- colonne tsvector générée et son index GIN sont posés en SQL brut par la
-- migration `outil_wiki`, que le schéma Prisma ne sait pas décrire. Ces deux
-- lignes ont été RETIRÉES — les appliquer casse la recherche plein-texte du wiki.
-- (C'est d'ailleurs ce qui a fait échouer la première application : Postgres
-- refuse un DROP DEFAULT sur une colonne générée.)

-- CreateEnum
CREATE TYPE "CategorieProduit" AS ENUM ('AUTOMATE', 'MODULE', 'SONDE', 'VANNE', 'SERVOMOTEUR', 'RESEAU', 'ACCESSOIRE', 'AUTRE');

-- CreateEnum
CREATE TYPE "TypeDepot" AS ENUM ('ATELIER', 'VEHICULE', 'CHANTIER');

-- CreateEnum
CREATE TYPE "TypeMouvement" AS ENUM ('RECEPTION', 'SORTIE', 'RETOUR', 'TRANSFERT', 'REBUT', 'ECART');

-- CreateEnum
CREATE TYPE "EtatExemplaire" AS ENUM ('EN_STOCK', 'SORTI', 'REBUT');

-- CreateEnum
CREATE TYPE "EtatInventaire" AS ENUM ('OUVERT', 'VALIDE', 'ANNULE');

-- CreateEnum
CREATE TYPE "EtatReservation" AS ENUM ('RESERVEE', 'SERVIE', 'ANNULEE');

-- AlterEnum
-- `IF NOT EXISTS` : une valeur d'enum ne se retire pas en Postgres. Sans lui, un
-- rejeu de cette migration (reprise après échec) achoppe ici pour toujours.
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'ACHATS';

-- AlterTable
ALTER TABLE "AutomateModele" ADD COLUMN     "produitId" TEXT;

-- AlterTable
ALTER TABLE "ModuleModele" ADD COLUMN     "produitId" TEXT;

-- CreateTable
CREATE TABLE "Depot" (
    "id" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "type" "TypeDepot" NOT NULL DEFAULT 'ATELIER',
    "detenteurId" TEXT,
    "dortoir" BOOLEAN NOT NULL DEFAULT false,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "ordre" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Depot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Produit" (
    "id" TEXT NOT NULL,
    "refInterne" TEXT NOT NULL,
    "refFabricant" TEXT,
    "designation" TEXT NOT NULL,
    "marque" TEXT,
    "categorie" "CategorieProduit" NOT NULL DEFAULT 'AUTRE',
    "unite" TEXT NOT NULL DEFAULT 'U',
    "serialisable" BOOLEAN NOT NULL DEFAULT false,
    "seuilMini" INTEGER NOT NULL DEFAULT 0,
    "emplacement" TEXT,
    "image" TEXT NOT NULL DEFAULT '',
    "docUrl" TEXT NOT NULL DEFAULT '',
    "remplaceParId" TEXT,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT NOT NULL DEFAULT '',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Produit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CodeBarreProduit" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "format" TEXT,
    "produitId" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CodeBarreProduit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Fournisseur" (
    "id" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "contact" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "tel" TEXT NOT NULL DEFAULT '',
    "delaiJours" INTEGER,
    "note" TEXT NOT NULL DEFAULT '',
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Fournisseur_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TarifFournisseur" (
    "id" TEXT NOT NULL,
    "produitId" TEXT NOT NULL,
    "fournisseurId" TEXT NOT NULL,
    "refFournisseur" TEXT,
    "prixCents" INTEGER NOT NULL,
    "conditionnement" INTEGER NOT NULL DEFAULT 1,
    "delaiJours" INTEGER,
    "prefere" BOOLEAN NOT NULL DEFAULT false,
    "majLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TarifFournisseur_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MouvementStock" (
    "id" TEXT NOT NULL,
    "type" "TypeMouvement" NOT NULL,
    "produitId" TEXT NOT NULL,
    "quantite" INTEGER NOT NULL,
    "depotSourceId" TEXT,
    "depotDestId" TEXT,
    "prixUnitaireCents" INTEGER,
    "numeroAchat" TEXT,
    "chantierId" TEXT,
    "inventaireId" TEXT,
    "note" TEXT NOT NULL DEFAULT '',
    "faitLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MouvementStock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Exemplaire" (
    "id" TEXT NOT NULL,
    "produitId" TEXT NOT NULL,
    "numeroSerie" TEXT NOT NULL,
    "etat" "EtatExemplaire" NOT NULL DEFAULT 'EN_STOCK',
    "depotId" TEXT,
    "chantierId" TEXT,
    "receptionId" TEXT,
    "sortieId" TEXT,
    "modemScanId" TEXT,
    "note" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Exemplaire_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Inventaire" (
    "id" TEXT NOT NULL,
    "depotId" TEXT NOT NULL,
    "etat" "EtatInventaire" NOT NULL DEFAULT 'OUVERT',
    "libelle" TEXT NOT NULL DEFAULT '',
    "note" TEXT NOT NULL DEFAULT '',
    "ouvertLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "valideLe" TIMESTAMP(3),
    "ouvertParId" TEXT,

    CONSTRAINT "Inventaire_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LigneInventaire" (
    "id" TEXT NOT NULL,
    "inventaireId" TEXT NOT NULL,
    "produitId" TEXT NOT NULL,
    "theorique" INTEGER NOT NULL,
    "compte" INTEGER,

    CONSTRAINT "LigneInventaire_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NomenclaturePoint" (
    "id" TEXT NOT NULL,
    "pointCatalogId" TEXT NOT NULL,
    "produitId" TEXT NOT NULL,
    "quantite" INTEGER NOT NULL DEFAULT 1,
    "optionnel" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "NomenclaturePoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LigneMaterielAffaire" (
    "id" TEXT NOT NULL,
    "chantierId" TEXT NOT NULL,
    "produitId" TEXT NOT NULL,
    "quantite" INTEGER NOT NULL DEFAULT 1,
    "note" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LigneMaterielAffaire_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReservationStock" (
    "id" TEXT NOT NULL,
    "produitId" TEXT NOT NULL,
    "chantierId" TEXT NOT NULL,
    "quantite" INTEGER NOT NULL,
    "etat" "EtatReservation" NOT NULL DEFAULT 'RESERVEE',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReservationStock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportMagasin" (
    "id" TEXT NOT NULL,
    "genre" TEXT NOT NULL,
    "nomFichier" TEXT NOT NULL DEFAULT '',
    "nbLignes" INTEGER NOT NULL DEFAULT 0,
    "nbCreees" INTEGER NOT NULL DEFAULT 0,
    "nbMajs" INTEGER NOT NULL DEFAULT 0,
    "nbRejetees" INTEGER NOT NULL DEFAULT 0,
    "rejets" JSONB NOT NULL DEFAULT '[]',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportMagasin_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Depot_nom_key" ON "Depot"("nom");

-- CreateIndex
CREATE UNIQUE INDEX "Depot_code_key" ON "Depot"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Produit_refInterne_key" ON "Produit"("refInterne");

-- CreateIndex
CREATE INDEX "Produit_categorie_idx" ON "Produit"("categorie");

-- CreateIndex
CREATE INDEX "Produit_refFabricant_idx" ON "Produit"("refFabricant");

-- CreateIndex
CREATE UNIQUE INDEX "CodeBarreProduit_code_key" ON "CodeBarreProduit"("code");

-- CreateIndex
CREATE INDEX "CodeBarreProduit_produitId_idx" ON "CodeBarreProduit"("produitId");

-- CreateIndex
CREATE UNIQUE INDEX "Fournisseur_nom_key" ON "Fournisseur"("nom");

-- CreateIndex
CREATE INDEX "TarifFournisseur_fournisseurId_idx" ON "TarifFournisseur"("fournisseurId");

-- CreateIndex
CREATE UNIQUE INDEX "TarifFournisseur_produitId_fournisseurId_key" ON "TarifFournisseur"("produitId", "fournisseurId");

-- CreateIndex
CREATE INDEX "MouvementStock_produitId_faitLe_idx" ON "MouvementStock"("produitId", "faitLe");

-- CreateIndex
CREATE INDEX "MouvementStock_produitId_depotDestId_idx" ON "MouvementStock"("produitId", "depotDestId");

-- CreateIndex
CREATE INDEX "MouvementStock_produitId_depotSourceId_idx" ON "MouvementStock"("produitId", "depotSourceId");

-- CreateIndex
CREATE INDEX "MouvementStock_chantierId_idx" ON "MouvementStock"("chantierId");

-- CreateIndex
CREATE INDEX "MouvementStock_inventaireId_idx" ON "MouvementStock"("inventaireId");

-- CreateIndex
CREATE INDEX "MouvementStock_faitLe_idx" ON "MouvementStock"("faitLe");

-- CreateIndex
CREATE INDEX "Exemplaire_chantierId_idx" ON "Exemplaire"("chantierId");

-- CreateIndex
CREATE INDEX "Exemplaire_depotId_idx" ON "Exemplaire"("depotId");

-- CreateIndex
CREATE INDEX "Exemplaire_numeroSerie_idx" ON "Exemplaire"("numeroSerie");

-- CreateIndex
CREATE UNIQUE INDEX "Exemplaire_produitId_numeroSerie_key" ON "Exemplaire"("produitId", "numeroSerie");

-- CreateIndex
CREATE INDEX "Inventaire_depotId_idx" ON "Inventaire"("depotId");

-- CreateIndex
CREATE INDEX "LigneInventaire_produitId_idx" ON "LigneInventaire"("produitId");

-- CreateIndex
CREATE UNIQUE INDEX "LigneInventaire_inventaireId_produitId_key" ON "LigneInventaire"("inventaireId", "produitId");

-- CreateIndex
CREATE INDEX "NomenclaturePoint_produitId_idx" ON "NomenclaturePoint"("produitId");

-- CreateIndex
CREATE UNIQUE INDEX "NomenclaturePoint_pointCatalogId_produitId_key" ON "NomenclaturePoint"("pointCatalogId", "produitId");

-- CreateIndex
CREATE INDEX "LigneMaterielAffaire_produitId_idx" ON "LigneMaterielAffaire"("produitId");

-- CreateIndex
CREATE UNIQUE INDEX "LigneMaterielAffaire_chantierId_produitId_key" ON "LigneMaterielAffaire"("chantierId", "produitId");

-- CreateIndex
CREATE INDEX "ReservationStock_produitId_idx" ON "ReservationStock"("produitId");

-- CreateIndex
CREATE INDEX "ReservationStock_chantierId_idx" ON "ReservationStock"("chantierId");

-- CreateIndex
CREATE INDEX "ImportMagasin_createdAt_idx" ON "ImportMagasin"("createdAt");

-- CreateIndex
CREATE INDEX "AutomateModele_produitId_idx" ON "AutomateModele"("produitId");

-- CreateIndex
CREATE INDEX "ModuleModele_produitId_idx" ON "ModuleModele"("produitId");

-- AddForeignKey
ALTER TABLE "AutomateModele" ADD CONSTRAINT "AutomateModele_produitId_fkey" FOREIGN KEY ("produitId") REFERENCES "Produit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModuleModele" ADD CONSTRAINT "ModuleModele_produitId_fkey" FOREIGN KEY ("produitId") REFERENCES "Produit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Depot" ADD CONSTRAINT "Depot_detenteurId_fkey" FOREIGN KEY ("detenteurId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Produit" ADD CONSTRAINT "Produit_remplaceParId_fkey" FOREIGN KEY ("remplaceParId") REFERENCES "Produit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Produit" ADD CONSTRAINT "Produit_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Produit" ADD CONSTRAINT "Produit_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CodeBarreProduit" ADD CONSTRAINT "CodeBarreProduit_produitId_fkey" FOREIGN KEY ("produitId") REFERENCES "Produit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CodeBarreProduit" ADD CONSTRAINT "CodeBarreProduit_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TarifFournisseur" ADD CONSTRAINT "TarifFournisseur_produitId_fkey" FOREIGN KEY ("produitId") REFERENCES "Produit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TarifFournisseur" ADD CONSTRAINT "TarifFournisseur_fournisseurId_fkey" FOREIGN KEY ("fournisseurId") REFERENCES "Fournisseur"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MouvementStock" ADD CONSTRAINT "MouvementStock_produitId_fkey" FOREIGN KEY ("produitId") REFERENCES "Produit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MouvementStock" ADD CONSTRAINT "MouvementStock_depotSourceId_fkey" FOREIGN KEY ("depotSourceId") REFERENCES "Depot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MouvementStock" ADD CONSTRAINT "MouvementStock_depotDestId_fkey" FOREIGN KEY ("depotDestId") REFERENCES "Depot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MouvementStock" ADD CONSTRAINT "MouvementStock_chantierId_fkey" FOREIGN KEY ("chantierId") REFERENCES "Chantier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MouvementStock" ADD CONSTRAINT "MouvementStock_inventaireId_fkey" FOREIGN KEY ("inventaireId") REFERENCES "Inventaire"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MouvementStock" ADD CONSTRAINT "MouvementStock_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Exemplaire" ADD CONSTRAINT "Exemplaire_produitId_fkey" FOREIGN KEY ("produitId") REFERENCES "Produit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Exemplaire" ADD CONSTRAINT "Exemplaire_depotId_fkey" FOREIGN KEY ("depotId") REFERENCES "Depot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Exemplaire" ADD CONSTRAINT "Exemplaire_chantierId_fkey" FOREIGN KEY ("chantierId") REFERENCES "Chantier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Exemplaire" ADD CONSTRAINT "Exemplaire_receptionId_fkey" FOREIGN KEY ("receptionId") REFERENCES "MouvementStock"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Exemplaire" ADD CONSTRAINT "Exemplaire_sortieId_fkey" FOREIGN KEY ("sortieId") REFERENCES "MouvementStock"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Exemplaire" ADD CONSTRAINT "Exemplaire_modemScanId_fkey" FOREIGN KEY ("modemScanId") REFERENCES "ModemScan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inventaire" ADD CONSTRAINT "Inventaire_depotId_fkey" FOREIGN KEY ("depotId") REFERENCES "Depot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inventaire" ADD CONSTRAINT "Inventaire_ouvertParId_fkey" FOREIGN KEY ("ouvertParId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LigneInventaire" ADD CONSTRAINT "LigneInventaire_inventaireId_fkey" FOREIGN KEY ("inventaireId") REFERENCES "Inventaire"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LigneInventaire" ADD CONSTRAINT "LigneInventaire_produitId_fkey" FOREIGN KEY ("produitId") REFERENCES "Produit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NomenclaturePoint" ADD CONSTRAINT "NomenclaturePoint_pointCatalogId_fkey" FOREIGN KEY ("pointCatalogId") REFERENCES "PointCatalog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NomenclaturePoint" ADD CONSTRAINT "NomenclaturePoint_produitId_fkey" FOREIGN KEY ("produitId") REFERENCES "Produit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LigneMaterielAffaire" ADD CONSTRAINT "LigneMaterielAffaire_chantierId_fkey" FOREIGN KEY ("chantierId") REFERENCES "Chantier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LigneMaterielAffaire" ADD CONSTRAINT "LigneMaterielAffaire_produitId_fkey" FOREIGN KEY ("produitId") REFERENCES "Produit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReservationStock" ADD CONSTRAINT "ReservationStock_produitId_fkey" FOREIGN KEY ("produitId") REFERENCES "Produit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReservationStock" ADD CONSTRAINT "ReservationStock_chantierId_fkey" FOREIGN KEY ("chantierId") REFERENCES "Chantier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReservationStock" ADD CONSTRAINT "ReservationStock_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportMagasin" ADD CONSTRAINT "ImportMagasin_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Dépôt par défaut. Sans lui aucun mouvement n'est saisissable, donc il est posé
-- par la migration (et non par le seed) : la prod l'a dès `migrate deploy`.
-- « Atelier » n'est PAS un dortoir — c'est le seul endroit où l'on tient un vrai
-- stock. Les véhicules se créeront avec dortoir = true (décision de cadrage).
INSERT INTO "Depot" ("id", "nom", "code", "type", "dortoir", "actif", "ordre", "createdAt", "updatedAt")
VALUES ('depot_atelier', 'Atelier', 'ATL', 'ATELIER', false, true, 0, NOW(), NOW())
ON CONFLICT ("id") DO NOTHING;
