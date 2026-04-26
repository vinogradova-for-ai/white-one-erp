-- CreateEnum
CREATE TYPE "PackagingItemStatus" AS ENUM ('IDEA', 'DESIGN', 'SAMPLE', 'APPROVED', 'ACTIVE', 'ARCHIVED');

-- AlterTable
ALTER TABLE "PackagingItem" ADD COLUMN     "cnyRubRate" DECIMAL(10,4),
ADD COLUMN     "decisionDate" TIMESTAMP(3),
ADD COLUMN     "designReadyDate" TIMESTAMP(3),
ADD COLUMN     "ownerId" TEXT,
ADD COLUMN     "priceCurrency" "Currency",
ADD COLUMN     "productionStartDate" TIMESTAMP(3),
ADD COLUMN     "sampleApprovedDate" TIMESTAMP(3),
ADD COLUMN     "sampleRequestedDate" TIMESTAMP(3),
ADD COLUMN     "status" "PackagingItemStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "unitPriceCny" DECIMAL(12,2),
ADD COLUMN     "unitPriceRub" DECIMAL(12,2);

-- CreateTable
CREATE TABLE "PackagingItemStatusLog" (
    "id" TEXT NOT NULL,
    "packagingItemId" TEXT NOT NULL,
    "fromStatus" "PackagingItemStatus",
    "toStatus" "PackagingItemStatus" NOT NULL,
    "comment" TEXT,
    "changedById" TEXT NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PackagingItemStatusLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PackagingItemStatusLog_packagingItemId_changedAt_idx" ON "PackagingItemStatusLog"("packagingItemId", "changedAt");

-- CreateIndex
CREATE INDEX "PackagingItem_status_idx" ON "PackagingItem"("status");

-- CreateIndex
CREATE INDEX "PackagingItem_ownerId_idx" ON "PackagingItem"("ownerId");

-- AddForeignKey
ALTER TABLE "PackagingItem" ADD CONSTRAINT "PackagingItem_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackagingItemStatusLog" ADD CONSTRAINT "PackagingItemStatusLog_packagingItemId_fkey" FOREIGN KEY ("packagingItemId") REFERENCES "PackagingItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackagingItemStatusLog" ADD CONSTRAINT "PackagingItemStatusLog_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
