-- CreateTable
CREATE TABLE "ModemScan" (
    "id" TEXT NOT NULL,
    "raw" TEXT NOT NULL,
    "ssid" TEXT,
    "serie" TEXT,
    "imei" TEXT,
    "mac" TEXT,
    "wifiPass" TEXT,
    "adminUser" TEXT,
    "adminPass" TEXT,
    "lot" TEXT,
    "wifiType" TEXT,
    "note" TEXT NOT NULL DEFAULT '',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ModemScan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ModemScan_createdAt_idx" ON "ModemScan"("createdAt");

-- AddForeignKey
ALTER TABLE "ModemScan" ADD CONSTRAINT "ModemScan_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
