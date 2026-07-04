-- Карго-накладная на поставке (перенос листа «КАРГО» из Excel-матрицы, 04.07.2026)
ALTER TABLE "Shipment" ADD COLUMN "cargoNumber" TEXT;
ALTER TABLE "Shipment" ADD COLUMN "placesCount" INTEGER;
ALTER TABLE "Shipment" ADD COLUMN "weightKg" DECIMAL(10,1);
ALTER TABLE "Shipment" ADD COLUMN "amountUsdt" DECIMAL(12,2);
ALTER TABLE "Shipment" ADD COLUMN "cargoPaidAt" TIMESTAMP(3);
ALTER TABLE "Shipment" ADD COLUMN "arrivalActualDate" TIMESTAMP(3);
CREATE UNIQUE INDEX "Shipment_cargoNumber_key" ON "Shipment"("cargoNumber");

-- Упаковка едет тем же карго, что и одежда
ALTER TABLE "PackagingOrder" ADD COLUMN "shipmentId" TEXT;
ALTER TABLE "PackagingOrder" ADD CONSTRAINT "PackagingOrder_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "PackagingOrder_shipmentId_idx" ON "PackagingOrder"("shipmentId");
