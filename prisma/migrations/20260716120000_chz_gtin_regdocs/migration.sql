-- Честный знак: GTIN на цветомодель×размер + разрешительные документы
-- (декларации/сертификаты) для генератора IMPORT_K3 / IMPORT_RD (Алёна 16.07).

CREATE TABLE "VariantGtin" (
    "id" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "size" TEXT NOT NULL,
    "gtin" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "VariantGtin_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "VariantGtin_gtin_key" ON "VariantGtin"("gtin");
CREATE UNIQUE INDEX "VariantGtin_variantId_size_key" ON "VariantGtin"("variantId", "size");
CREATE INDEX "VariantGtin_variantId_idx" ON "VariantGtin"("variantId");
ALTER TABLE "VariantGtin" ADD CONSTRAINT "VariantGtin_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "RegulatoryDoc" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'DECLARATION',
    "number" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "RegulatoryDoc_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "_ModelRegulatoryDocs" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,
    CONSTRAINT "_ModelRegulatoryDocs_AB_pkey" PRIMARY KEY ("A","B")
);
CREATE INDEX "_ModelRegulatoryDocs_B_index" ON "_ModelRegulatoryDocs"("B");
ALTER TABLE "_ModelRegulatoryDocs" ADD CONSTRAINT "_ModelRegulatoryDocs_A_fkey" FOREIGN KEY ("A") REFERENCES "ProductModel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "_ModelRegulatoryDocs" ADD CONSTRAINT "_ModelRegulatoryDocs_B_fkey" FOREIGN KEY ("B") REFERENCES "RegulatoryDoc"("id") ON DELETE CASCADE ON UPDATE CASCADE;
