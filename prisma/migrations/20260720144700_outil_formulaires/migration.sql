-- Outil « Formulaires » (ToolGus — form builder façon Kizeo). Trois tables :
-- la DÉFINITION (Formulaire) + les RÉPONSES terrain (FormulaireReponse, id UUID
-- client, offline) + leurs médias (FormulaireMedia, binaire hors public/).
--
-- NB : `prisma migrate dev` proposait AUSSI de DROP l'index GIN
-- `WikiPage_recherche_idx` et de « DROP DEFAULT » sur la colonne GÉNÉRÉE
-- `recherche` (fausse dérive : Prisma ne gère pas les colonnes générées — cf.
-- migrations wiki_page_resume / wiki_tags_facette / wiki_arborescence). Ces deux
-- lignes ont été RETIRÉES à la main : `recherche` et son index GIN restent intacts.

-- CreateTable
CREATE TABLE "Formulaire" (
    "id" TEXT NOT NULL,
    "nom" TEXT NOT NULL DEFAULT 'Nouveau formulaire',
    "description" TEXT NOT NULL DEFAULT '',
    "proprietaire" TEXT NOT NULL DEFAULT 'gus',
    "schema" JSONB NOT NULL DEFAULT '[]',
    "version" INTEGER NOT NULL DEFAULT 1,
    "publie" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Formulaire_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FormulaireReponse" (
    "id" TEXT NOT NULL,
    "formulaireId" TEXT NOT NULL,
    "formulaireVersion" INTEGER NOT NULL DEFAULT 1,
    "titre" TEXT NOT NULL DEFAULT '',
    "chantierId" TEXT,
    "data" JSONB NOT NULL DEFAULT '{}',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FormulaireReponse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FormulaireMedia" (
    "id" TEXT NOT NULL,
    "reponseId" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'photo',
    "mimeType" TEXT NOT NULL DEFAULT 'application/octet-stream',
    "taille" INTEGER NOT NULL DEFAULT 0,
    "fichier" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FormulaireMedia_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Formulaire_proprietaire_idx" ON "Formulaire"("proprietaire");

-- CreateIndex
CREATE INDEX "Formulaire_createdById_idx" ON "Formulaire"("createdById");

-- CreateIndex
CREATE INDEX "Formulaire_updatedAt_idx" ON "Formulaire"("updatedAt");

-- CreateIndex
CREATE INDEX "FormulaireReponse_formulaireId_idx" ON "FormulaireReponse"("formulaireId");

-- CreateIndex
CREATE INDEX "FormulaireReponse_chantierId_idx" ON "FormulaireReponse"("chantierId");

-- CreateIndex
CREATE INDEX "FormulaireMedia_reponseId_idx" ON "FormulaireMedia"("reponseId");

-- AddForeignKey
ALTER TABLE "Formulaire" ADD CONSTRAINT "Formulaire_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormulaireReponse" ADD CONSTRAINT "FormulaireReponse_formulaireId_fkey" FOREIGN KEY ("formulaireId") REFERENCES "Formulaire"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormulaireReponse" ADD CONSTRAINT "FormulaireReponse_chantierId_fkey" FOREIGN KEY ("chantierId") REFERENCES "Chantier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormulaireReponse" ADD CONSTRAINT "FormulaireReponse_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormulaireMedia" ADD CONSTRAINT "FormulaireMedia_reponseId_fkey" FOREIGN KEY ("reponseId") REFERENCES "FormulaireReponse"("id") ON DELETE CASCADE ON UPDATE CASCADE;
