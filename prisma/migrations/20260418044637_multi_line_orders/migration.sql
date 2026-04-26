/*
  Warnings:

  - You are about to drop the column `batchCost` on the `Order` table. All the data in the column will be lost.
  - You are about to drop the column `plannedMargin` on the `Order` table. All the data in the column will be lost.
  - You are about to drop the column `plannedRevenue` on the `Order` table. All the data in the column will be lost.
  - You are about to drop the column `productVariantId` on the `Order` table. All the data in the column will be lost.
  - You are about to drop the column `quantity` on the `Order` table. All the data in the column will be lost.
  - You are about to drop the column `sizeDistribution` on the `Order` table. All the data in the column will be lost.
  - You are about to drop the column `sizeDistributionActual` on the `Order` table. All the data in the column will be lost.
  - You are about to drop the column `snapshotCustomerPrice` on the `Order` table. All the data in the column will be lost.
  - You are about to drop the column `snapshotDrrPct` on the `Order` table. All the data in the column will be lost.
  - You are about to drop the column `snapshotFullCost` on the `Order` table. All the data in the column will be lost.
  - You are about to drop the column `snapshotRedemptionPct` on the `Order` table. All the data in the column will be lost.
  - You are about to drop the column `snapshotWbCommissionPct` on the `Order` table. All the data in the column will be lost.
  - You are about to drop the column `snapshotWbPrice` on the `Order` table. All the data in the column will be lost.
  - Added the required column `productModelId` to the `Order` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "Order" DROP CONSTRAINT "Order_productVariantId_fkey";

-- DropIndex
DROP INDEX "Order_productVariantId_idx";

-- AlterTable
ALTER TABLE "Order" DROP COLUMN "batchCost",
DROP COLUMN "plannedMargin",
DROP COLUMN "plannedRevenue",
DROP COLUMN "productVariantId",
DROP COLUMN "quantity",
DROP COLUMN "sizeDistribution",
DROP COLUMN "sizeDistributionActual",
DROP COLUMN "snapshotCustomerPrice",
DROP COLUMN "snapshotDrrPct",
DROP COLUMN "snapshotFullCost",
DROP COLUMN "snapshotRedemptionPct",
DROP COLUMN "snapshotWbCommissionPct",
DROP COLUMN "snapshotWbPrice",
ADD COLUMN     "productModelId" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "OrderLine" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "productVariantId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "sizeDistribution" JSONB,
    "sizeDistributionActual" JSONB,
    "snapshotFullCost" DECIMAL(12,2),
    "snapshotWbPrice" DECIMAL(12,2),
    "snapshotCustomerPrice" DECIMAL(12,2),
    "snapshotWbCommissionPct" DECIMAL(5,2),
    "snapshotDrrPct" DECIMAL(5,2),
    "snapshotRedemptionPct" DECIMAL(5,2),
    "batchCost" DECIMAL(14,2),
    "plannedRevenue" DECIMAL(14,2),
    "plannedMargin" DECIMAL(14,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrderLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OrderLine_orderId_idx" ON "OrderLine"("orderId");

-- CreateIndex
CREATE INDEX "OrderLine_productVariantId_idx" ON "OrderLine"("productVariantId");

-- CreateIndex
CREATE INDEX "Order_productModelId_idx" ON "Order"("productModelId");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_productModelId_fkey" FOREIGN KEY ("productModelId") REFERENCES "ProductModel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderLine" ADD CONSTRAINT "OrderLine_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderLine" ADD CONSTRAINT "OrderLine_productVariantId_fkey" FOREIGN KEY ("productVariantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
