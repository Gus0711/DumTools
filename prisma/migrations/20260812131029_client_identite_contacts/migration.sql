-- ⚠️ Deux lignes RETIRÉES de ce diff, comme à chaque migration de ce dépôt
-- (CLAUDE.md, « pièges des versions récentes ») : `DROP INDEX
-- "WikiPage_recherche_idx"` et `ALTER TABLE "WikiPage" ALTER COLUMN "recherche"
-- DROP DEFAULT`. La colonne tsvector du wiki est GÉNÉRÉE, posée en SQL brut et
-- indescriptible par Prisma : il la re-diffe à chaque fois, Postgres refuse le
-- DROP DEFAULT, la migration échoue à MOITIÉ appliquée — et l'index GIN est
-- réellement détruit au passage.

-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "adresse" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "codePostal" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "email" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "telephone" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "ville" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "Devis" ADD COLUMN     "contactEmail" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "contactFonction" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "contactId" TEXT,
ADD COLUMN     "contactNom" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "contactTel" TEXT NOT NULL DEFAULT '';

-- CreateTable
CREATE TABLE "ContactClient" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "civilite" TEXT NOT NULL DEFAULT '',
    "nom" TEXT NOT NULL,
    "fonction" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "telephone" TEXT NOT NULL DEFAULT '',
    "mobile" TEXT NOT NULL DEFAULT '',
    "note" TEXT NOT NULL DEFAULT '',
    "principal" BOOLEAN NOT NULL DEFAULT false,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,

    CONSTRAINT "ContactClient_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContactClient_clientId_idx" ON "ContactClient"("clientId");

-- CreateIndex
CREATE INDEX "Devis_contactId_idx" ON "Devis"("contactId");

-- AddForeignKey
ALTER TABLE "ContactClient" ADD CONSTRAINT "ContactClient_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactClient" ADD CONSTRAINT "ContactClient_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Devis" ADD CONSTRAINT "Devis_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "ContactClient"("id") ON DELETE SET NULL ON UPDATE CASCADE;
