-- Тип фабрики: швейная (SEWING) или поставщик упаковки (PACKAGING) — П6 UX-аудита.
CREATE TYPE "FactoryKind" AS ENUM ('SEWING', 'PACKAGING');

ALTER TABLE "Factory" ADD COLUMN "kind" "FactoryKind" NOT NULL DEFAULT 'SEWING';

-- Разметка по истории заказов: фабрика, у которой есть заказы упаковки
-- и НЕТ швейных заказов и фасонов, — поставщик упаковки.
-- Сомнительные (есть и то и то, или ничего) остаются SEWING — правится в справочнике.
UPDATE "Factory" f
SET "kind" = 'PACKAGING'
WHERE EXISTS (
    SELECT 1 FROM "PackagingOrder" po WHERE po."factoryId" = f.id
  )
  AND NOT EXISTS (
    SELECT 1 FROM "Order" o WHERE o."factoryId" = f.id AND o."deletedAt" IS NULL
  )
  AND NOT EXISTS (
    SELECT 1 FROM "ProductModel" pm WHERE pm."preferredFactoryId" = f.id AND pm."deletedAt" IS NULL
  );

-- Разметка по названиям: явные упаковочные ключевые слова.
UPDATE "Factory"
SET "kind" = 'PACKAGING'
WHERE "kind" = 'SEWING'
  AND (
    lower("name") LIKE '%упаков%' OR
    lower("name") LIKE '%пакет%' OR
    lower("name") LIKE '%коробк%' OR
    lower("name") LIKE '%короб%' OR
    lower("name") LIKE '%бирк%' OR
    lower("name") LIKE '%этикет%' OR
    lower("name") LIKE '%зип%' OR
    lower("name") LIKE '%zip%' OR
    lower("name") LIKE '%тишью%' OR
    lower("name") LIKE '%стикер%'
  )
  -- ...но если на фабрике есть живые швейные заказы или фасоны — не трогаем.
  AND NOT EXISTS (
    SELECT 1 FROM "Order" o WHERE o."factoryId" = "Factory".id AND o."deletedAt" IS NULL
  )
  AND NOT EXISTS (
    SELECT 1 FROM "ProductModel" pm WHERE pm."preferredFactoryId" = "Factory".id AND pm."deletedAt" IS NULL
  );

CREATE INDEX "Factory_kind_idx" ON "Factory"("kind");
