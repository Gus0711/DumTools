-- CreateTable
CREATE TABLE "AffectationProjet" (
    "id" TEXT NOT NULL,
    "nom" TEXT NOT NULL DEFAULT 'Nouveau projet',
    "clientNom" TEXT NOT NULL DEFAULT '',
    "data" JSONB NOT NULL DEFAULT '{}',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AffectationProjet_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AffectationProjet_createdById_idx" ON "AffectationProjet"("createdById");

-- AddForeignKey
ALTER TABLE "AffectationProjet" ADD CONSTRAINT "AffectationProjet_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
