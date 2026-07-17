-- Партии заказов упаковки (Алёна 17.07): упаковка едет ЧАСТЯМИ разными карго,
-- как OrderBatch у одежды. Существующие привязки PackagingOrder.shipmentId
-- переносятся в «партию 1» со всеми позициями заказа; легаси-поля на
-- PackagingOrder остаются как архив данных (код их больше не читает).

CREATE TABLE "PackagingOrderBatch" (
    "id" TEXT NOT NULL,
    "packagingOrderId" TEXT NOT NULL,
    "index" INTEGER NOT NULL,
    "shipmentId" TEXT,
    "weightKgOverride" DECIMAL(10,1),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PackagingOrderBatch_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PackagingOrderBatch_packagingOrderId_index_key" ON "PackagingOrderBatch"("packagingOrderId", "index");
CREATE INDEX "PackagingOrderBatch_packagingOrderId_idx" ON "PackagingOrderBatch"("packagingOrderId");
CREATE INDEX "PackagingOrderBatch_shipmentId_idx" ON "PackagingOrderBatch"("shipmentId");
ALTER TABLE "PackagingOrderBatch" ADD CONSTRAINT "PackagingOrderBatch_packagingOrderId_fkey" FOREIGN KEY ("packagingOrderId") REFERENCES "PackagingOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PackagingOrderBatch" ADD CONSTRAINT "PackagingOrderBatch_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "PackagingOrderBatchItem" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "packagingItemId" TEXT NOT NULL,
    "plannedQty" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PackagingOrderBatchItem_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PackagingOrderBatchItem_batchId_idx" ON "PackagingOrderBatchItem"("batchId");
CREATE INDEX "PackagingOrderBatchItem_packagingItemId_idx" ON "PackagingOrderBatchItem"("packagingItemId");
ALTER TABLE "PackagingOrderBatchItem" ADD CONSTRAINT "PackagingOrderBatchItem_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "PackagingOrderBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PackagingOrderBatchItem" ADD CONSTRAINT "PackagingOrderBatchItem_packagingItemId_fkey" FOREIGN KEY ("packagingItemId") REFERENCES "PackagingItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Перенос данных: заказ упаковки, уже привязанный к карго, получает партию 1
-- с той же привязкой, весовой поправкой и всеми позициями заказа.
INSERT INTO "PackagingOrderBatch" ("id", "packagingOrderId", "index", "shipmentId", "weightKgOverride", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, po."id", 1, po."shipmentId", po."weightKgOverride", NOW(), NOW()
FROM "PackagingOrder" po
WHERE po."shipmentId" IS NOT NULL;

INSERT INTO "PackagingOrderBatchItem" ("id", "batchId", "packagingItemId", "plannedQty", "createdAt")
SELECT gen_random_uuid()::text, b."id", l."packagingItemId", l."quantity", NOW()
FROM "PackagingOrderBatch" b
JOIN "PackagingOrderLine" l ON l."packagingOrderId" = b."packagingOrderId";
