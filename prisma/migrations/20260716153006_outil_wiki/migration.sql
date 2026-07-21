-- CreateTable
CREATE TABLE "WikiRubrique" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "icon" TEXT NOT NULL DEFAULT 'BookText',
    "couleur" TEXT NOT NULL DEFAULT 'brand',
    "ordre" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "WikiRubrique_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WikiPage" (
    "id" TEXT NOT NULL,
    "titre" TEXT NOT NULL DEFAULT 'Nouvelle page',
    "contenu" JSONB NOT NULL DEFAULT '[]',
    "version" INTEGER NOT NULL DEFAULT 1,
    "texte" TEXT NOT NULL DEFAULT '',
    "rubriqueId" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WikiPage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WikiTag" (
    "id" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "couleur" TEXT NOT NULL DEFAULT '#a855f7',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WikiTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WikiPageTag" (
    "pageId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,

    CONSTRAINT "WikiPageTag_pkey" PRIMARY KEY ("pageId","tagId")
);

-- CreateTable
CREATE TABLE "WikiMedia" (
    "id" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "nom" TEXT NOT NULL DEFAULT '',
    "mimeType" TEXT NOT NULL DEFAULT 'application/octet-stream',
    "taille" INTEGER NOT NULL DEFAULT 0,
    "fichier" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WikiMedia_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WikiRubrique_slug_key" ON "WikiRubrique"("slug");

-- CreateIndex
CREATE INDEX "WikiRubrique_ordre_idx" ON "WikiRubrique"("ordre");

-- CreateIndex
CREATE INDEX "WikiPage_rubriqueId_idx" ON "WikiPage"("rubriqueId");

-- CreateIndex
CREATE INDEX "WikiPage_updatedAt_idx" ON "WikiPage"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "WikiTag_nom_key" ON "WikiTag"("nom");

-- CreateIndex
CREATE INDEX "WikiPageTag_tagId_idx" ON "WikiPageTag"("tagId");

-- CreateIndex
CREATE INDEX "WikiMedia_pageId_idx" ON "WikiMedia"("pageId");

-- AddForeignKey
ALTER TABLE "WikiPage" ADD CONSTRAINT "WikiPage_rubriqueId_fkey" FOREIGN KEY ("rubriqueId") REFERENCES "WikiRubrique"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WikiPage" ADD CONSTRAINT "WikiPage_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WikiPageTag" ADD CONSTRAINT "WikiPageTag_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "WikiPage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WikiPageTag" ADD CONSTRAINT "WikiPageTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "WikiTag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WikiMedia" ADD CONSTRAINT "WikiMedia_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "WikiPage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Recherche plein-texte Postgres (hors capacités de Prisma) : colonne tsvector
-- GÉNÉRÉE — titre pondéré fort (A) + texte pondéré (B), config « french » pour le
-- stemming (« armoire » trouve « armoires »). Toujours à jour (STORED), indexée
-- en GIN. Interrogée uniquement en $queryRaw (websearch_to_tsquery + ts_rank).
ALTER TABLE "WikiPage"
  ADD COLUMN "recherche" tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('french', coalesce("titre", '')), 'A') ||
    setweight(to_tsvector('french', coalesce("texte", '')), 'B')
  ) STORED;

-- CreateIndex
CREATE INDEX "WikiPage_recherche_idx" ON "WikiPage" USING GIN ("recherche");
