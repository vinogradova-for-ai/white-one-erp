-- Партии → Поставки → Приёмка.
-- OrderBatch: партия заказа (кусок, едущий отдельно). Простой заказ = 1 партия,
--   создаётся лениво при первом добавлении в поставку.
-- OrderBatchItem: позиция партии (цвет+размер+кол-во) с фактом приёмки поштучно.
-- Shipment: поставка — группа партий (возможно разных заказов), едущая на склад.

-- ── ENUM ────────────────────────────────────────────────────────────────
CREATE TYPE "ShipmentStatus" AS ENUM ('DRAFT', 'IN_TRANSIT', 'ARRIVED', 'RECEIVED');

-- ── Shipment ────────────────────────────────────────────────────────────
CREATE TABLE "Shipment" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "status" "ShipmentStatus" NOT NULL DEFAULT 'DRAFT',
    "departDate" TIMESTAMP(3),
    "arriveDate" TIMESTAMP(3),
    "carrier" TEXT,
    "comment" TEXT,
    "createdById" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Shipment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Shipment_number_key" ON "Shipment"("number");
CREATE INDEX "Shipment_status_idx" ON "Shipment"("status");
CREATE INDEX "Shipment_deletedAt_idx" ON "Shipment"("deletedAt");
CREATE INDEX "Shipment_number_idx" ON "Shipment"("number");

ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── OrderBatch ──────────────────────────────────────────────────────────
CREATE TABLE "OrderBatch" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "index" INTEGER NOT NULL,
    "shipmentId" TEXT,
    "receivedAt" TIMESTAMP(3),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "OrderBatch_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OrderBatch_orderId_index_key" ON "OrderBatch"("orderId", "index");
CREATE INDEX "OrderBatch_orderId_idx" ON "OrderBatch"("orderId");
CREATE INDEX "OrderBatch_shipmentId_idx" ON "OrderBatch"("shipmentId");
CREATE INDEX "OrderBatch_receivedAt_idx" ON "OrderBatch"("receivedAt");

ALTER TABLE "OrderBatch" ADD CONSTRAINT "OrderBatch_orderId_fkey"
    FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrderBatch" ADD CONSTRAINT "OrderBatch_shipmentId_fkey"
    FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── OrderBatchItem ──────────────────────────────────────────────────────
CREATE TABLE "OrderBatchItem" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "variantId" TEXT,
    "colorName" TEXT NOT NULL,
    "size" TEXT NOT NULL,
    "plannedQty" INTEGER NOT NULL,
    "factQty" INTEGER,
    "defectQty" INTEGER,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "OrderBatchItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OrderBatchItem_batchId_idx" ON "OrderBatchItem"("batchId");
CREATE INDEX "OrderBatchItem_variantId_idx" ON "OrderBatchItem"("variantId");

ALTER TABLE "OrderBatchItem" ADD CONSTRAINT "OrderBatchItem_batchId_fkey"
    FOREIGN KEY ("batchId") REFERENCES "OrderBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
