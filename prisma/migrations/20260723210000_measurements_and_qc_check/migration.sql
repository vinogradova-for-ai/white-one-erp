-- Замеры изделия (мерочный лист) + факт-чек сетки на ОТК. Аддитивно.
CREATE TABLE "Measurement" (
    "id" TEXT NOT NULL,
    "productModelId" TEXT NOT NULL,
    "size" TEXT NOT NULL,
    "param" TEXT NOT NULL,
    "valueCm" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Measurement_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Measurement_productModelId_size_param_key" ON "Measurement"("productModelId", "size", "param");
CREATE INDEX "Measurement_productModelId_idx" ON "Measurement"("productModelId");
ALTER TABLE "Measurement" ADD CONSTRAINT "Measurement_productModelId_fkey"
  FOREIGN KEY ("productModelId") REFERENCES "ProductModel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ChinaQc" ADD COLUMN "measureCheckOk" BOOLEAN;
ALTER TABLE "ChinaQc" ADD COLUMN "measureCheckNote" TEXT;
