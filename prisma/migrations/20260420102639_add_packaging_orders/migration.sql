-- CreateEnum
CREATE TYPE "PackagingOrderStatus" AS ENUM ('ORDERED', 'IN_PRODUCTION', 'IN_TRANSIT', 'ARRIVED', 'CANCELLED');

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "packagingOrderId" TEXT;

-- CreateTable
CREATE TABLE "PackagingOrder" (
    "id" TEXT NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "packagingItemId" TEXT NOT NULL,
    "factoryId" TEXT,
    "supplierName" TEXT,
    "quantity" INTEGER NOT NULL,
    "unitPriceRub" DECIMAL(12,2),
    "unitPriceCny" DECIMAL(12,2),
    "priceCurrency" "Currency",
    "cnyRubRate" DECIMAL(10,4),
    "status" "PackagingOrderStatus" NOT NULL DEFAULT 'ORDERED',
    "orderedDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expectedDate" TIMESTAMP(3),
    "arrivedDate" TIMESTAMP(3),
    "ownerId" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PackagingOrder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PackagingOrder_orderNumber_key" ON "PackagingOrder"("orderNumber");

-- CreateIndex
CREATE INDEX "PackagingOrder_packagingItemId_idx" ON "PackagingOrder"("packagingItemId");

-- CreateIndex
CREATE INDEX "PackagingOrder_status_idx" ON "PackagingOrder"("status");

-- CreateIndex
CREATE INDEX "PackagingOrder_factoryId_idx" ON "PackagingOrder"("factoryId");

-- CreateIndex
CREATE INDEX "Payment_packagingOrderId_idx" ON "Payment"("packagingOrderId");

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_packagingOrderId_fkey" FOREIGN KEY ("packagingOrderId") REFERENCES "PackagingOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackagingOrder" ADD CONSTRAINT "PackagingOrder_packagingItemId_fkey" FOREIGN KEY ("packagingItemId") REFERENCES "PackagingItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackagingOrder" ADD CONSTRAINT "PackagingOrder_factoryId_fkey" FOREIGN KEY ("factoryId") REFERENCES "Factory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackagingOrder" ADD CONSTRAINT "PackagingOrder_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
