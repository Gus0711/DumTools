-- La restitution client du devis (docs/DEVIS.md §21) : lien public par jeton,
-- interrupteurs de publication, journal de consultation, identité de la maison
-- et fonction du signataire.
--
-- ⚠️ SQL écrit à la main à partir de `prisma migrate diff` : le diff produit
-- aussi un `DROP INDEX "WikiPage_recherche_idx"` et un `ALTER COLUMN "recherche"
-- DROP DEFAULT` sur la colonne tsvector GÉNÉRÉE du wiki (posée en SQL brut, que
-- Prisma ne sait pas décrire). Postgres refuse le second → la migration
-- échouerait à moitié appliquée en ayant réellement détruit l'index GIN au
-- passage. Les deux lignes sont donc retirées. Voir CLAUDE.md.

-- AlterTable
ALTER TABLE "Devis" ADD COLUMN     "jetonPartage" TEXT,
ADD COLUMN     "montrerOptions" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "montrerPrixUnitaires" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "montrerSousTotauxLots" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "partageExpireLe" TIMESTAMP(3),
ADD COLUMN     "publieLe" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "fonction" TEXT NOT NULL DEFAULT '';

-- CreateTable
CREATE TABLE "DevisConsultation" (
    "id" TEXT NOT NULL,
    "devisId" TEXT NOT NULL,
    "jeton" TEXT NOT NULL,
    "vuLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip" TEXT NOT NULL DEFAULT '',
    "userAgent" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "DevisConsultation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReglageSociete" (
    "id" TEXT NOT NULL DEFAULT 'societe',
    "raisonSociale" TEXT NOT NULL DEFAULT '',
    "formeCapital" TEXT NOT NULL DEFAULT '',
    "adresse" TEXT NOT NULL DEFAULT '',
    "codePostal" TEXT NOT NULL DEFAULT '',
    "ville" TEXT NOT NULL DEFAULT '',
    "telephone" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "siteWeb" TEXT NOT NULL DEFAULT '',
    "rcs" TEXT NOT NULL DEFAULT '',
    "codeApe" TEXT NOT NULL DEFAULT '',
    "tvaIntracom" TEXT NOT NULL DEFAULT '',
    "iban" TEXT NOT NULL DEFAULT '',
    "bic" TEXT NOT NULL DEFAULT '',
    "reglement" TEXT NOT NULL DEFAULT 'Virement',
    "conditionsReglement" TEXT NOT NULL DEFAULT '30 jours NET',
    "acomptePourMille" INTEGER NOT NULL DEFAULT 500,
    "dureeRealisation" TEXT NOT NULL DEFAULT '',
    "remarques" TEXT NOT NULL DEFAULT '',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReglageSociete_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DevisConsultation_devisId_vuLe_idx" ON "DevisConsultation"("devisId", "vuLe");

-- CreateIndex
CREATE UNIQUE INDEX "Devis_jetonPartage_key" ON "Devis"("jetonPartage");

-- AddForeignKey
ALTER TABLE "DevisConsultation" ADD CONSTRAINT "DevisConsultation_devisId_fkey" FOREIGN KEY ("devisId") REFERENCES "Devis"("id") ON DELETE CASCADE ON UPDATE CASCADE;
