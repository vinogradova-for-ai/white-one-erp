-- CreateEnum
CREATE TYPE "PackagingType" AS ENUM ('LABEL', 'SIZE_LABEL', 'POLYBAG', 'MESH', 'COVER', 'BAG', 'BOX', 'CARE_LABEL', 'OTHER');

-- CreateTable
CREATE TABLE "PackagingItem" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "PackagingType" NOT NULL,
    "sku" TEXT,
    "description" TEXT,
    "photoUrl" TEXT,
    "stock" INTEGER NOT NULL DEFAULT 0,
    "inProductionQty" INTEGER NOT NULL DEFAULT 0,
    "minStock" INTEGER,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PackagingItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderPackaging" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "packagingItemId" TEXT NOT NULL,
    "quantityPerUnit" DECIMAL(6,2) NOT NULL DEFAULT 1,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderPackaging_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PackagingItem_type_idx" ON "PackagingItem"("type");

-- CreateIndex
CREATE INDEX "PackagingItem_isActive_idx" ON "PackagingItem"("isActive");

-- CreateIndex
CREATE INDEX "OrderPackaging_orderId_idx" ON "OrderPackaging"("orderId");

-- CreateIndex
CREATE INDEX "OrderPackaging_packagingItemId_idx" ON "OrderPackaging"("packagingItemId");

-- CreateIndex
CREATE UNIQUE INDEX "OrderPackaging_orderId_packagingItemId_key" ON "OrderPackaging"("orderId", "packagingItemId");

-- AddForeignKey
ALTER TABLE "OrderPackaging" ADD CONSTRAINT "OrderPackaging_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderPackaging" ADD CONSTRAINT "OrderPackaging_packagingItemId_fkey" FOREIGN KEY ("packagingItemId") REFERENCES "PackagingItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
