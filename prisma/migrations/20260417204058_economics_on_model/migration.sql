-- AlterTable: перенос экономики с ProductVariant на ProductModel.
-- Причина: закупочная цена, WB-цена, комиссия, ДРР, планируемый выкуп — одинаковые для всех цветов одного фасона.
-- На варианте остаётся только factRedemptionPct (реальный % выкупа отличается по цветам).
-- Данные по экономике в вариантах — демо-сид, потеря допустима.

-- Добавляем поля экономики на уровень фасона
ALTER TABLE "ProductModel"
  ADD COLUMN "purchasePriceCny"     DECIMAL(12,2),
  ADD COLUMN "purchasePriceRub"     DECIMAL(12,2),
  ADD COLUMN "cnyRubRate"           DECIMAL(10,4),
  ADD COLUMN "packagingCost"        DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN "wbLogisticsCost"      DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN "wbPrice"              DECIMAL(12,2),
  ADD COLUMN "customerPrice"        DECIMAL(12,2),
  ADD COLUMN "wbCommissionPct"      DECIMAL(5,2)  NOT NULL DEFAULT 0,
  ADD COLUMN "drrPct"               DECIMAL(5,2)  NOT NULL DEFAULT 0,
  ADD COLUMN "plannedRedemptionPct" DECIMAL(5,2),
  ADD COLUMN "fullCost"             DECIMAL(12,2),
  ADD COLUMN "marginBeforeDrr"      DECIMAL(12,2),
  ADD COLUMN "marginAfterDrrPct"    DECIMAL(6,2),
  ADD COLUMN "roi"                  DECIMAL(6,2),
  ADD COLUMN "markupPct"            DECIMAL(6,2);

-- Удаляем те же поля с варианта (factRedemptionPct остаётся — он варьируется по цветам)
ALTER TABLE "ProductVariant"
  DROP COLUMN "purchasePriceCny",
  DROP COLUMN "purchasePriceRub",
  DROP COLUMN "cnyRubRate",
  DROP COLUMN "packagingCost",
  DROP COLUMN "wbLogisticsCost",
  DROP COLUMN "wbPrice",
  DROP COLUMN "customerPrice",
  DROP COLUMN "wbCommissionPct",
  DROP COLUMN "drrPct",
  DROP COLUMN "plannedRedemptionPct",
  DROP COLUMN "fullCost",
  DROP COLUMN "marginBeforeDrr",
  DROP COLUMN "marginAfterDrrPct",
  DROP COLUMN "roi",
  DROP COLUMN "markupPct";
