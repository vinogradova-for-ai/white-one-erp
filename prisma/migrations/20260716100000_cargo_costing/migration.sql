-- Карго-себестоимость (Алёна 16.07.2026): деньги накладной раздельно, файлы
-- накладной, курс фиксируется при оплате, веса строк с ручной поправкой,
-- вес штуки упаковки, история курсов ЦБ.

ALTER TABLE "Shipment" ADD COLUMN "freightUsd" DECIMAL(12,2);
ALTER TABLE "Shipment" ADD COLUMN "insuranceUsd" DECIMAL(12,2);
ALTER TABLE "Shipment" ADD COLUMN "packingFeeUsd" DECIMAL(12,2);
ALTER TABLE "Shipment" ADD COLUMN "usdRubRate" DECIMAL(10,4);
ALTER TABLE "Shipment" ADD COLUMN "waybillPhotoUrls" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "OrderBatch" ADD COLUMN "weightKgOverride" DECIMAL(10,1);
ALTER TABLE "PackagingOrder" ADD COLUMN "weightKgOverride" DECIMAL(10,1);
ALTER TABLE "PackagingItem" ADD COLUMN "weightG" INTEGER;

CREATE TABLE "CurrencyRate" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "code" TEXT NOT NULL,
    "rate" DECIMAL(12,4) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CurrencyRate_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CurrencyRate_date_code_key" ON "CurrencyRate"("date", "code");
CREATE INDEX "CurrencyRate_code_date_idx" ON "CurrencyRate"("code", "date");
