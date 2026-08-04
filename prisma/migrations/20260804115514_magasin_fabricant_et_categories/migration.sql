-- LE FABRICANT ET LA CATÉGORIE DEVIENNENT DES RÉFÉRENTIELS
--
-- `Produit.marque` était un texte libre : « Siemens » un jour, « Siemnes » le
-- lendemain, deux marques distinctes que rien ne signalait. `Produit.categorie`
-- était une enum Postgres : une valeur d'enum ne se RETIRE pas, et en ajouter
-- une demandait une migration — le magasinier ne pouvait donc pas tenir ses
-- propres rayons.
--
-- ⚠️ Migration écrite À LA MAIN : le diff de Prisma se contentait de DROP les
-- deux colonnes (154 produits renseignés), et proposait au passage de détruire
-- l'index GIN du wiki et le DEFAULT de sa colonne tsvector générée (piège connu,
-- cf. CLAUDE.md). Les deux lignes ont été retirées. Ici, rien n'est perdu :
-- chaque valeur existante devient une ligne de référentiel.

-- 1. LE FABRICANT ------------------------------------------------------------

CREATE TABLE "Fabricant" (
    "id" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Fabricant_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Fabricant_nom_key" ON "Fabricant"("nom");

ALTER TABLE "Produit" ADD COLUMN "fabricantId" TEXT;

-- Une ligne par marque, à la casse et aux espaces près : « SIEMENS », « siemens »
-- et « Siemens  » étaient déjà le même fabricant. L'orthographe retenue est la
-- plus fréquente (`mode()`), pas la première rencontrée.
INSERT INTO "Fabricant" ("id", "nom", "actif", "note", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text,
       mode() WITHIN GROUP (ORDER BY trim("marque")),
       true,
       '',
       now(),
       now()
  FROM "Produit"
 WHERE "marque" IS NOT NULL AND trim("marque") <> ''
 GROUP BY lower(trim("marque"));

UPDATE "Produit" p
   SET "fabricantId" = f."id"
  FROM "Fabricant" f
 WHERE p."marque" IS NOT NULL
   AND lower(trim(p."marque")) = lower(f."nom");

ALTER TABLE "Produit" DROP COLUMN "marque";

CREATE INDEX "Produit_fabricantId_idx" ON "Produit"("fabricantId");

ALTER TABLE "Produit" ADD CONSTRAINT "Produit_fabricantId_fkey"
    FOREIGN KEY ("fabricantId") REFERENCES "Fabricant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 2. LA CATÉGORIE ------------------------------------------------------------

ALTER TABLE "Produit" ADD COLUMN "categorieId" TEXT;

-- L'ancienne valeur est mise de côté le temps de l'opération : dans Postgres un
-- TYPE et une TABLE partagent le même espace de noms, la table « CategorieProduit »
-- ne peut donc naître qu'une fois l'enum du même nom disparue.
ALTER TABLE "Produit" ADD COLUMN "_categorieLegacy" TEXT;
UPDATE "Produit" SET "_categorieLegacy" = "categorie"::text;

DROP INDEX "Produit_categorie_idx";
ALTER TABLE "Produit" DROP COLUMN "categorie";
DROP TYPE "CategorieProduit";

CREATE TABLE "CategorieProduit" (
    "id" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "ordre" INTEGER NOT NULL DEFAULT 0,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CategorieProduit_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CategorieProduit_nom_key" ON "CategorieProduit"("nom");

-- Les huit familles d'origine, dans l'ordre où l'enum les déclarait : on
-- retrouve la liste telle quelle, à ceci près qu'elle est désormais modifiable.
INSERT INTO "CategorieProduit" ("id", "nom", "ordre", "actif", "createdAt", "updatedAt") VALUES
    (gen_random_uuid()::text, 'Automate',    1, true, now(), now()),
    (gen_random_uuid()::text, 'Module',      2, true, now(), now()),
    (gen_random_uuid()::text, 'Sonde',       3, true, now(), now()),
    (gen_random_uuid()::text, 'Vanne',       4, true, now(), now()),
    (gen_random_uuid()::text, 'Servomoteur', 5, true, now(), now()),
    (gen_random_uuid()::text, 'Réseau',      6, true, now(), now()),
    (gen_random_uuid()::text, 'Accessoire',  7, true, now(), now()),
    (gen_random_uuid()::text, 'Autre',       8, true, now(), now());

UPDATE "Produit" p
   SET "categorieId" = c."id"
  FROM (VALUES
          ('AUTOMATE',    'Automate'),
          ('MODULE',      'Module'),
          ('SONDE',       'Sonde'),
          ('VANNE',       'Vanne'),
          ('SERVOMOTEUR', 'Servomoteur'),
          ('RESEAU',      'Réseau'),
          ('ACCESSOIRE',  'Accessoire'),
          ('AUTRE',       'Autre')
       ) AS m(code, nom)
       JOIN "CategorieProduit" c ON c."nom" = m.nom
 WHERE p."_categorieLegacy" = m.code;

ALTER TABLE "Produit" DROP COLUMN "_categorieLegacy";

CREATE INDEX "Produit_categorieId_idx" ON "Produit"("categorieId");

ALTER TABLE "Produit" ADD CONSTRAINT "Produit_categorieId_fkey"
    FOREIGN KEY ("categorieId") REFERENCES "CategorieProduit"("id") ON DELETE SET NULL ON UPDATE CASCADE;
