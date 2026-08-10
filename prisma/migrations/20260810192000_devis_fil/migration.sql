-- Le FIL DU DEVIS — la mémoire de ce qui s'est dit autour du chiffrage.
-- Cadrage : docs/DEVIS-FIL.md
--
-- ⚠️ Migration ÉCRITE À LA MAIN. Le diff de Prisma régénère à chaque fois un
-- `DROP INDEX "WikiPage_recherche_idx"` et un `ALTER … "recherche" DROP DEFAULT`
-- sur la colonne tsvector générée du wiki (posée en SQL brut, indescriptible
-- par Prisma). Postgres refuse le DROP DEFAULT → la migration échouerait à
-- moitié appliquée, l'index GIN réellement détruit au passage. Ces deux lignes
-- ont donc été retirées volontairement : ne pas les remettre (voir CLAUDE.md).

-- 1. La chaîne de révisions, dénormalisée : l'identité du fil.
ALTER TABLE "Devis" ADD COLUMN "filId" TEXT NOT NULL DEFAULT '';

-- 2. Une pièce jointe peut appartenir à un message.
ALTER TABLE "DevisMedia" ADD COLUMN "messageId" TEXT;

-- 3. Les deux tables du fil.
CREATE TABLE "MessageDevis" (
    "id" TEXT NOT NULL,
    "filId" TEXT NOT NULL,
    "devisId" TEXT,
    "corps" TEXT NOT NULL DEFAULT '',
    "auteurId" TEXT,
    "epingle" BOOLEAN NOT NULL DEFAULT false,
    "evenement" TEXT,
    "donnees" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modifieLe" TIMESTAMP(3),

    CONSTRAINT "MessageDevis_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LectureFilDevis" (
    "userId" TEXT NOT NULL,
    "filId" TEXT NOT NULL,
    "vuLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LectureFilDevis_pkey" PRIMARY KEY ("userId","filId")
);

CREATE INDEX "MessageDevis_filId_createdAt_idx" ON "MessageDevis"("filId", "createdAt");
CREATE INDEX "MessageDevis_devisId_idx" ON "MessageDevis"("devisId");
CREATE INDEX "LectureFilDevis_filId_idx" ON "LectureFilDevis"("filId");
CREATE INDEX "Devis_filId_idx" ON "Devis"("filId");
CREATE INDEX "DevisMedia_messageId_idx" ON "DevisMedia"("messageId");

ALTER TABLE "DevisMedia" ADD CONSTRAINT "DevisMedia_messageId_fkey"
  FOREIGN KEY ("messageId") REFERENCES "MessageDevis"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MessageDevis" ADD CONSTRAINT "MessageDevis_devisId_fkey"
  FOREIGN KEY ("devisId") REFERENCES "Devis"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MessageDevis" ADD CONSTRAINT "MessageDevis_auteurId_fkey"
  FOREIGN KEY ("auteurId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "LectureFilDevis" ADD CONSTRAINT "LectureFilDevis_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 4. REPRISE — la racine de chaque chaîne de révisions.
--    Une v3 doit porter le filId de la v1 : on remonte parentId une seule fois,
--    ici, plutôt qu'à chaque ouverture d'écran.
WITH RECURSIVE racine AS (
    SELECT "id", "id" AS "racineId"
      FROM "Devis"
     WHERE "parentId" IS NULL
    UNION ALL
    SELECT d."id", r."racineId"
      FROM "Devis" d
      JOIN racine r ON d."parentId" = r."id"
)
UPDATE "Devis" d
   SET "filId" = r."racineId"
  FROM racine r
 WHERE d."id" = r."id";

-- Les orphelins (parent supprimé, `parentId` remis à NULL par le SetNull, ou
-- chaîne rompue) deviennent leur propre racine plutôt que de partager le fil
-- vide de tous les autres.
UPDATE "Devis" SET "filId" = "id" WHERE "filId" = '';

-- 5. REPRISE — l'ancienne note interne devient le premier message de son fil.
--    ⚠️ DISTINCT ON : `nouvelleRevision` recopiait la note du parent, donc v1 et
--    v2 portent le même texte. Sans dédoublonnage, le fil s'ouvrirait sur le
--    même paragraphe écrit deux fois. On garde le plus ancien porteur.
INSERT INTO "MessageDevis" ("id", "filId", "devisId", "corps", "auteurId", "createdAt")
SELECT 'note-' || x."id", x."filId", x."id", x."note", x."createdById", x."createdAt"
  FROM (
      SELECT DISTINCT ON ("filId", "note")
             "id", "filId", "note", "createdById", "createdAt"
        FROM "Devis"
       WHERE "note" <> ''
       ORDER BY "filId", "note", "createdAt" ASC
  ) x;

-- 6. La note interne n'a plus lieu d'être : elle n'était affichée nulle part et
--    le fil la remplace (docs/DEVIS-FIL.md §4.3). Son texte vient d'être sauvé
--    ci-dessus, dans la même transaction.
ALTER TABLE "Devis" DROP COLUMN "note";
