-- CreateTable
CREATE TABLE "AutomateModele" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "ordre" INTEGER NOT NULL DEFAULT 0,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "image" TEXT NOT NULL DEFAULT '',
    "alimIntegree" BOOLEAN NOT NULL DEFAULT false,
    "alimLabel" TEXT NOT NULL DEFAULT '',
    "entreeKind" TEXT NOT NULL DEFAULT 'UI',
    "entreeCount" INTEGER NOT NULL DEFAULT 0,
    "sortieKind" TEXT NOT NULL DEFAULT 'UO',
    "sortieCount" INTEGER NOT NULL DEFAULT 0,
    "entreeCodes" JSONB NOT NULL DEFAULT '[]',
    "sortieCodes" JSONB NOT NULL DEFAULT '[]',
    "extensible" BOOLEAN NOT NULL DEFAULT false,
    "modulesCompat" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutomateModele_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModuleModele" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "ordre" INTEGER NOT NULL DEFAULT 0,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "image" TEXT NOT NULL DEFAULT '',
    "categorie" TEXT NOT NULL DEFAULT 'extension',
    "entreeKind" TEXT NOT NULL DEFAULT 'UI',
    "entreeCount" INTEGER NOT NULL DEFAULT 0,
    "sortieKind" TEXT NOT NULL DEFAULT 'UO',
    "sortieCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ModuleModele_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AutomateModele_reference_key" ON "AutomateModele"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "ModuleModele_type_key" ON "ModuleModele"("type");
