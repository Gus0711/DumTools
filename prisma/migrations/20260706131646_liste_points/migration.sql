-- CreateTable
CREATE TABLE "PointsList" (
    "id" TEXT NOT NULL,
    "titre" TEXT,
    "clientNom" TEXT NOT NULL DEFAULT '',
    "chantierNom" TEXT NOT NULL DEFAULT '',
    "date" TIMESTAMP(3),
    "rows" JSONB NOT NULL DEFAULT '[]',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PointsList_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PointCatalog" (
    "id" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PointCatalog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PointsList_createdById_idx" ON "PointsList"("createdById");

-- CreateIndex
CREATE UNIQUE INDEX "PointCatalog_nom_key" ON "PointCatalog"("nom");

-- AddForeignKey
ALTER TABLE "PointsList" ADD CONSTRAINT "PointsList_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
