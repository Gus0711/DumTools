-- Horodatage du scan SUR L'APPAREIL, distinct de `createdAt` (= écriture en
-- base). Les deux divergent quand l'enregistrement échoue puis est relancé, ou
-- lors d'une saisie hors-ligne synchronisée plus tard. C'est `scanneLe` qui fait
-- foi pour le classement par jour / semaine / mois / année.
--
-- NOTE : `prisma migrate dev --create-only` a aussi généré ici un
-- `DROP INDEX "WikiPage_recherche_idx"` + un `ALTER ... "recherche" DROP DEFAULT`.
-- C'est de la DÉRIVE : la colonne tsvector générée et son index GIN sont posés
-- par la migration `outil_wiki` en SQL brut, que le schéma Prisma ne sait pas
-- décrire. Ces deux lignes ont été RETIRÉES — les appliquer casserait la
-- recherche plein-texte du wiki.

-- AlterTable
ALTER TABLE "ModemScan" ADD COLUMN     "scanneLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Backfill : pour les scans existants, la date d'écriture EST la date de scan.
UPDATE "ModemScan" SET "scanneLe" = "createdAt";

-- CreateIndex
CREATE INDEX "ModemScan_scanneLe_idx" ON "ModemScan"("scanneLe");

-- CreateIndex
CREATE INDEX "ModemScan_chantierId_scanneLe_idx" ON "ModemScan"("chantierId", "scanneLe");
