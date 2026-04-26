-- CreateTable
CREATE TABLE "ModelPackaging" (
    "id" TEXT NOT NULL,
    "productModelId" TEXT NOT NULL,
    "packagingItemId" TEXT NOT NULL,
    "quantityPerUnit" DECIMAL(6,2) NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ModelPackaging_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ModelPackaging_productModelId_idx" ON "ModelPackaging"("productModelId");

-- CreateIndex
CREATE INDEX "ModelPackaging_packagingItemId_idx" ON "ModelPackaging"("packagingItemId");

-- CreateIndex
CREATE UNIQUE INDEX "ModelPackaging_productModelId_packagingItemId_key" ON "ModelPackaging"("productModelId", "packagingItemId");

-- AddForeignKey
ALTER TABLE "ModelPackaging" ADD CONSTRAINT "ModelPackaging_productModelId_fkey" FOREIGN KEY ("productModelId") REFERENCES "ProductModel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModelPackaging" ADD CONSTRAINT "ModelPackaging_packagingItemId_fkey" FOREIGN KEY ("packagingItemId") REFERENCES "PackagingItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
