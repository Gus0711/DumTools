-- UN produit = UN fournisseur (décision du 2026-07-29, docs/MAGASIN.md §3).
-- Le multi-fournisseur est assez rare chez Dumortier pour ne pas mériter une
-- table de tarifs : elle imposait un import en deux passes, un aller-retour
-- pour créer le fournisseur avant de saisir un prix, et une notion de
-- « fournisseur préféré » à arbitrer. Le fournisseur, sa référence, le prix
-- d'achat et le délai remontent donc sur le produit lui-même.
--
-- `TarifFournisseur` est supprimée : elle était VIDE au moment de la migration
-- (vérifié), le changement ne perd donc aucune donnée. C'est précisément
-- pourquoi il a été fait maintenant plutôt que dans six mois.
--
-- NOTE : Prisma a de nouveau généré un `DROP INDEX "WikiPage_recherche_idx"` +
-- un `ALTER … "recherche" DROP DEFAULT` sur la colonne tsvector GÉNÉRÉE du
-- wiki. Dérive connue (voir CLAUDE.md) : ces deux lignes ont été RETIRÉES.

-- DropForeignKey
ALTER TABLE "TarifFournisseur" DROP CONSTRAINT "TarifFournisseur_fournisseurId_fkey";

-- DropForeignKey
ALTER TABLE "TarifFournisseur" DROP CONSTRAINT "TarifFournisseur_produitId_fkey";

-- AlterTable
ALTER TABLE "Produit" ADD COLUMN     "delaiJours" INTEGER,
ADD COLUMN     "fournisseurId" TEXT,
ADD COLUMN     "prixAchatCents" INTEGER,
ADD COLUMN     "refFournisseur" TEXT;

-- DropTable
DROP TABLE "TarifFournisseur";

-- AddForeignKey
ALTER TABLE "Produit" ADD CONSTRAINT "Produit_fournisseurId_fkey" FOREIGN KEY ("fournisseurId") REFERENCES "Fournisseur"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "Produit_fournisseurId_idx" ON "Produit"("fournisseurId");
