-- Флаг «строка упаковки пришла из комплекта фасона» (правка Алёны №3, 03.07).
-- Синк фасон→заказ становится зеркалом: обновляет количество и убирает
-- заменённую упаковку, но не трогает ручные строки заказа.
ALTER TABLE "OrderPackaging" ADD COLUMN "syncedFromModel" BOOLEAN NOT NULL DEFAULT false;

-- Бэкфилл: строка считается «из фасона», если такая же позиция есть
-- в текущем комплекте фасона этого заказа.
UPDATE "OrderPackaging" op
SET "syncedFromModel" = true
FROM "Order" o, "ModelPackaging" mp
WHERE op."orderId" = o.id
  AND mp."productModelId" = o."productModelId"
  AND mp."packagingItemId" = op."packagingItemId";
