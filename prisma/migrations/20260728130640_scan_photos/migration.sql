-- Photos rattachées à un scan. Le binaire vit sur le disque de la VM
-- (SCANS_MEDIA_DIR) ; ici on ne garde que la métadonnée + le chemin.
-- `id` = UUID généré côté client = nom du fichier sur disque.
--
-- NOTE : `prisma migrate dev --create-only` a de nouveau généré ici un
-- `DROP INDEX "WikiPage_recherche_idx"` + un `ALTER ... "recherche" DROP DEFAULT`.
-- C'est la DÉRIVE connue (cf. migration scan_horodatage_appareil) : la colonne
-- tsvector générée et son index GIN sont posés en SQL brut par la migration
-- `outil_wiki`, que le schéma Prisma ne sait pas décrire. Ces deux lignes ont
-- été RETIRÉES — les appliquer casse la recherche plein-texte du wiki.

-- CreateTable
CREATE TABLE "ScanPhoto" (
    "id" TEXT NOT NULL,
    "scanId" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL DEFAULT 'image/jpeg',
    "taille" INTEGER NOT NULL DEFAULT 0,
    "fichier" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScanPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ScanPhoto_scanId_idx" ON "ScanPhoto"("scanId");

-- AddForeignKey
ALTER TABLE "ScanPhoto" ADD CONSTRAINT "ScanPhoto_scanId_fkey" FOREIGN KEY ("scanId") REFERENCES "ModemScan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
