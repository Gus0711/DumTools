-- CreateTable
CREATE TABLE "Note" (
    "id" TEXT NOT NULL,
    "titre" TEXT NOT NULL DEFAULT 'Nouvelle note',
    "contenu" JSONB NOT NULL DEFAULT '[]',
    "version" INTEGER NOT NULL DEFAULT 1,
    "jetonPartage" TEXT,
    "chantierId" TEXT NOT NULL,
    "clientId" TEXT,
    "numeroWhy" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Note_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NoteMedia" (
    "id" TEXT NOT NULL,
    "noteId" TEXT NOT NULL,
    "nom" TEXT NOT NULL DEFAULT '',
    "mimeType" TEXT NOT NULL DEFAULT 'application/octet-stream',
    "taille" INTEGER NOT NULL DEFAULT 0,
    "fichier" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NoteMedia_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Note_jetonPartage_key" ON "Note"("jetonPartage");

-- CreateIndex
CREATE INDEX "Note_chantierId_idx" ON "Note"("chantierId");

-- CreateIndex
CREATE INDEX "Note_clientId_idx" ON "Note"("clientId");

-- CreateIndex
CREATE INDEX "NoteMedia_noteId_idx" ON "NoteMedia"("noteId");

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_chantierId_fkey" FOREIGN KEY ("chantierId") REFERENCES "Chantier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NoteMedia" ADD CONSTRAINT "NoteMedia_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "Note"("id") ON DELETE CASCADE ON UPDATE CASCADE;
