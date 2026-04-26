-- Превращаем PackagingOrder в мульти-позиционный (как обычный заказ).
-- Добавляем PackagingOrderLine, бэкфилим данные, удаляем старые одиночные поля.

-- 1. Создаём таблицу линий
CREATE TABLE "PackagingOrderLine" (
    "id" TEXT NOT NULL,
    "packagingOrderId" TEXT NOT NULL,
    "packagingItemId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPriceRub" DECIMAL(12,2),
    "unitPriceCny" DECIMAL(12,2),
    "priceCurrency" "Currency",
    "cnyRubRate" DECIMAL(10,4),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PackagingOrderLine_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PackagingOrderLine_packagingOrderId_idx" ON "PackagingOrderLine"("packagingOrderId");
CREATE INDEX "PackagingOrderLine_packagingItemId_idx" ON "PackagingOrderLine"("packagingItemId");

ALTER TABLE "PackagingOrderLine"
  ADD CONSTRAINT "PackagingOrderLine_packagingOrderId_fkey"
  FOREIGN KEY ("packagingOrderId") REFERENCES "PackagingOrder"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PackagingOrderLine"
  ADD CONSTRAINT "PackagingOrderLine_packagingItemId_fkey"
  FOREIGN KEY ("packagingItemId") REFERENCES "PackagingItem"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- 2. Бэкфил: из каждого PackagingOrder создаём одну линию со старыми полями
INSERT INTO "PackagingOrderLine" (
  "id", "packagingOrderId", "packagingItemId", "quantity",
  "unitPriceRub", "unitPriceCny", "priceCurrency", "cnyRubRate", "createdAt"
)
SELECT
  'pol_' || substr(md5(random()::text || po.id), 1, 20),
  po.id,
  po."packagingItemId",
  po.quantity,
  po."unitPriceRub",
  po."unitPriceCny",
  po."priceCurrency",
  po."cnyRubRate",
  po."createdAt"
FROM "PackagingOrder" po;

-- 3. Сносим старые одиночные поля с PackagingOrder
ALTER TABLE "PackagingOrder" DROP CONSTRAINT IF EXISTS "PackagingOrder_packagingItemId_fkey";
DROP INDEX IF EXISTS "PackagingOrder_packagingItemId_idx";
ALTER TABLE "PackagingOrder" DROP COLUMN "packagingItemId";
ALTER TABLE "PackagingOrder" DROP COLUMN "quantity";
ALTER TABLE "PackagingOrder" DROP COLUMN "unitPriceRub";
ALTER TABLE "PackagingOrder" DROP COLUMN "unitPriceCny";
ALTER TABLE "PackagingOrder" DROP COLUMN "priceCurrency";
ALTER TABLE "PackagingOrder" DROP COLUMN "cnyRubRate";

-- 4. Убираем inProductionQty из PackagingItem — считается динамически
ALTER TABLE "PackagingItem" DROP COLUMN "inProductionQty";
