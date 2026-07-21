-- Arborescence de pages du Wiki (façon Notion / Confluence). Chaque page peut
-- avoir un parent DANS LA MÊME RUBRIQUE (invariant appliqué côté action) : une
-- page qui a des enfants devient un « dossier » — pas de type distinct. `ordre`
-- = tri manuel entre frères (glisser-déposer). La FK auto-référente est
-- `ON DELETE RESTRICT` : on refuse de supprimer un parent tant qu'il a des
-- enfants → `supprimerPage` remonte d'abord les enfants d'un cran.
--
-- NB (même précaution que wiki_page_resume / wiki_tags_facette) : on ne touche
-- NI à la colonne GÉNÉRÉE `recherche` (tsvector) NI à son index GIN
-- `WikiPage_recherche_idx` — Prisma ne gère pas les colonnes générées et propose
-- à tort de les DROP (fausse dérive). Uniquement l'ajout des colonnes + FK + index.

-- AlterTable
ALTER TABLE "WikiPage" ADD COLUMN     "parentId" TEXT;
ALTER TABLE "WikiPage" ADD COLUMN     "ordre" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "WikiPage_parentId_idx" ON "WikiPage"("parentId");

-- AddForeignKey (auto-référente : parent → page, refus de suppression si enfants)
ALTER TABLE "WikiPage" ADD CONSTRAINT "WikiPage_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "WikiPage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
