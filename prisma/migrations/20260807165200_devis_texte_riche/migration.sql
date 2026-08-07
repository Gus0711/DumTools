-- ⚠️ Retiré à la main (dérive connue, cf. CLAUDE.md) : Prisma régénère à chaque
-- diff un « DROP INDEX WikiPage_recherche_idx » + un « ALTER TABLE WikiPage
-- ALTER COLUMN recherche DROP DEFAULT » sur la colonne tsvector GÉNÉRÉE du
-- wiki, qu'il ne sait pas décrire. Postgres refuse le DROP DEFAULT → la
-- migration échoue à moitié appliquée, et l'index GIN est détruit au passage.

-- AlterTable : le document riche d'une ligne TEXTE + son verrou optimiste.
ALTER TABLE "LigneDevis" ADD COLUMN     "contenu" JSONB,
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "DevisMedia" (
    "id" TEXT NOT NULL,
    "devisId" TEXT NOT NULL,
    "nom" TEXT NOT NULL DEFAULT '',
    "mimeType" TEXT NOT NULL DEFAULT 'application/octet-stream',
    "taille" INTEGER NOT NULL DEFAULT 0,
    "fichier" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DevisMedia_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DevisMedia_devisId_idx" ON "DevisMedia"("devisId");

-- AddForeignKey
ALTER TABLE "DevisMedia" ADD CONSTRAINT "DevisMedia_devisId_fkey" FOREIGN KEY ("devisId") REFERENCES "Devis"("id") ON DELETE CASCADE ON UPDATE CASCADE;
