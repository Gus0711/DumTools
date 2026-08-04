-- CACHE DES INTERROGATIONS D'UNE BASE DE CODES-BARRES EXTERNE
--
-- Le plan gratuit d'UPCitemdb est à 100 requêtes/jour : sans cache, une session
-- de scan un peu longue l'épuiserait, et un code introuvable serait redemandé à
-- chaque passage devant l'objectif. Une ligne par code, réponse négative
-- comprise.
--
-- ⚠️ Les deux lignes que le diff de Prisma ajoute systématiquement ici — le
-- DROP de "WikiPage_recherche_idx" et le DROP DEFAULT de sa colonne tsvector
-- générée — ont été retirées (piège documenté dans CLAUDE.md : Postgres refuse
-- le second, la migration échoue à moitié appliquée, et l'index GIN est
-- réellement détruit au passage).

CREATE TABLE "RechercheCodeExterne" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'upcitemdb',
    "trouve" BOOLEAN NOT NULL DEFAULT false,
    "titre" TEXT NOT NULL DEFAULT '',
    "marque" TEXT NOT NULL DEFAULT '',
    "refFabricant" TEXT NOT NULL DEFAULT '',
    "brut" JSONB,
    "erreur" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RechercheCodeExterne_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RechercheCodeExterne_code_key" ON "RechercheCodeExterne"("code");

CREATE INDEX "RechercheCodeExterne_createdAt_idx" ON "RechercheCodeExterne"("createdAt");
