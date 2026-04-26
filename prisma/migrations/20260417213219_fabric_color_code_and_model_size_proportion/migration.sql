-- Переименование: pantoneCode больше не используется, команде нужен артикул цвета у поставщика ткани
ALTER TABLE "ProductVariant" RENAME COLUMN "pantoneCode" TO "fabricColorCode";

-- Пропорция размеров по умолчанию теперь на фасоне (одна для всех цветов),
-- на варианте остаётся как опциональный override.
ALTER TABLE "ProductModel" ADD COLUMN "defaultSizeProportion" JSONB;
