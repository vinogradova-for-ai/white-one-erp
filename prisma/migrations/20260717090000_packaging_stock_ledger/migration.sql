-- Мини-товарный учёт упаковки (Алёна 17.07): движения по складам Китай/Москва
-- + флаг «в комплекте с товаром» на партии упаковки в карго.

CREATE TABLE "PackagingMovement" (
    "id" TEXT NOT NULL,
    "packagingItemId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "kind" TEXT NOT NULL,
    "deltaCn" INTEGER NOT NULL DEFAULT 0,
    "deltaMsk" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT,
    "refType" TEXT,
    "refId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PackagingMovement_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PackagingMovement_packagingItemId_date_idx" ON "PackagingMovement"("packagingItemId", "date");
CREATE INDEX "PackagingMovement_refType_refId_idx" ON "PackagingMovement"("refType", "refId");
-- Идемпотентность автособытий: одно движение на (позиция, вид, источник)
CREATE UNIQUE INDEX "PackagingMovement_auto_unique" ON "PackagingMovement"("packagingItemId", "kind", "refType", "refId") WHERE "refId" IS NOT NULL;
ALTER TABLE "PackagingMovement" ADD CONSTRAINT "PackagingMovement_packagingItemId_fkey" FOREIGN KEY ("packagingItemId") REFERENCES "PackagingItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PackagingOrderBatch" ADD COLUMN "inKit" BOOLEAN NOT NULL DEFAULT false;

-- Перенос старого учёта: текущий PackagingItem.stock становится стартовым
-- остатком Москвы (инвентаризация-перенос).
INSERT INTO "PackagingMovement" ("id", "packagingItemId", "date", "kind", "deltaMsk", "note")
SELECT 'seed-' || "id", "id", CURRENT_DATE, 'ADJUST_MSK', "stock", 'перенос старого остатка (запуск учёта 17.07)'
FROM "PackagingItem" WHERE "stock" <> 0;
