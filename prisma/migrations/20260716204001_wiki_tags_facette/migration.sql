-- Facette structurée des tags (Étape 1 de docs/RECHERCHE-WIKI.md) : sortir les
-- tags du texte libre. `tagSlugs` dénormalise les tags d'une page en slugs
-- normalisés (minuscule + dé-accentué + canonique) → filtres d'ensemble ET/OU/SANS
-- (@> / && / NOT) au lieu de « tag = mot dans le texte ». Index GIN pour ces
-- opérateurs sur text[].
--
-- NB : Prisma proposait aussi de DROP l'index GIN `WikiPage_recherche_idx` et de
-- « DROP DEFAULT » sur la colonne GÉNÉRÉE `recherche` (fausse dérive : il ne gère
-- pas les colonnes générées — cf. migration wiki_page_resume). On ne garde QUE
-- l'ajout de colonne + son index : `recherche` et son index GIN restent intacts.

-- AlterTable
ALTER TABLE "WikiPage" ADD COLUMN     "tagSlugs" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateIndex
CREATE INDEX "WikiPage_tagSlugs_idx" ON "WikiPage" USING GIN ("tagSlugs");

-- Backfill : dériver tagSlugs des tags existants (WikiPageTag → WikiTag.nom),
-- avec la MÊME normalisation que slugTag (src/tools/wiki/model.ts) : lower +
-- dé-accentuation (translate sur les diacritiques français, équivalent au
-- NFD/strip de JS) + tout ce qui n'est pas [a-z0-9] → tiret + tirets de bord
-- rognés. Les pages sans tag gardent le tableau vide par défaut. Les slugs se
-- recalculent de toute façon au prochain save (sauverPage / MCP).
UPDATE "WikiPage" p
SET "tagSlugs" = sub.slugs
FROM (
  SELECT pt."pageId",
         array_agg(DISTINCT
           regexp_replace(
             regexp_replace(
               translate(
                 lower(trim(t."nom")),
                 'àáâãäåçèéêëìíîïñòóôõöùúûüýÿ',
                 'aaaaaaceeeeiiiinooooouuuuyy'
               ),
               '[^a-z0-9]+', '-', 'g'
             ),
             '(^-+|-+$)', '', 'g'
           )
         ) FILTER (WHERE trim(t."nom") <> '') AS slugs
  FROM "WikiPageTag" pt
  JOIN "WikiTag" t ON t.id = pt."tagId"
  GROUP BY pt."pageId"
) sub
WHERE sub."pageId" = p.id
  AND sub.slugs IS NOT NULL;
