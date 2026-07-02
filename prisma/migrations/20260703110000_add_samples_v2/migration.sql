-- Образцы, вторая (лёгкая) версия. Первую таблицу Sample удалили 26.04.2026
-- (20260426183322_cleanup_remove_samples_qc_customs) вместе с типом SampleStatus,
-- поэтому создаём заново с нуля. Значения enum новые (без QC-этапов).

-- CreateEnum
CREATE TYPE "SampleStatus" AS ENUM ('ORDERED', 'IN_TRANSIT', 'RECEIVED', 'APPROVED', 'REWORK');

-- CreateTable
CREATE TABLE "Sample" (
    "id" TEXT NOT NULL,
    "productModelId" TEXT NOT NULL,
    "factoryId" TEXT,
    "label" TEXT,
    "status" "SampleStatus" NOT NULL DEFAULT 'ORDERED',
    "orderedDate" TIMESTAMP(3),
    "receivedDate" TIMESTAMP(3),
    "verdictDate" TIMESTAMP(3),
    "verdictNote" TEXT,
    "photoUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Sample_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Sample_productModelId_idx" ON "Sample"("productModelId");
CREATE INDEX "Sample_status_idx" ON "Sample"("status");
CREATE INDEX "Sample_deletedAt_idx" ON "Sample"("deletedAt");

-- AddForeignKey
ALTER TABLE "Sample" ADD CONSTRAINT "Sample_productModelId_fkey" FOREIGN KEY ("productModelId") REFERENCES "ProductModel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Sample" ADD CONSTRAINT "Sample_factoryId_fkey" FOREIGN KEY ("factoryId") REFERENCES "Factory"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Sample" ADD CONSTRAINT "Sample_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
