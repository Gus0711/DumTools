-- AlterTable
ALTER TABLE "User" ADD COLUMN "mcpTokenHash" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_mcpTokenHash_key" ON "User"("mcpTokenHash");
