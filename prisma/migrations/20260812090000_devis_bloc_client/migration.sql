-- LE BLOC DU CLIENT (docs/DEVIS-DETAIL.md)
--
-- Un lot cesse d'être un chapitre pour devenir un BLOC : ce qu'on chiffre d'un
-- côté, ce que le client lit de l'autre. Deux colonnes suffisent — le sous-total
-- qui sert de prix à la ligne de synthèse est déjà calculé par le moteur.
--
--   rendu         DETAILLE (défaut, comportement actuel) | CONDENSE
--   libelleClient la désignation lue par le client ; vide = le titre du lot
--
-- Le défaut préserve exactement ce que font les 8 lots existants.
--
-- ⚠️ Migration écrite À LA MAIN : `migrate diff` régénère à chaque fois un
-- `DROP INDEX "WikiPage_recherche_idx"` et un `ALTER … "recherche" DROP DEFAULT`
-- sur la colonne tsvector générée du wiki (posée en SQL brut, indescriptible par
-- Prisma). Postgres refuse le DROP DEFAULT : la migration échouerait à moitié
-- appliquée EN DÉTRUISANT l'index GIN au passage. Ces deux lignes sont donc
-- volontairement absentes. (CLAUDE.md, « Notes techniques ».)

-- AlterTable
ALTER TABLE "LotDevis" ADD COLUMN     "libelleClient" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "rendu" TEXT NOT NULL DEFAULT 'DETAILLE';
