-- Бэкфилл факта прибытия (arrivalActualDate) для заказов, прибывших ДО
-- появления единой точки смены статуса: статус уже «На складе Москва» и
-- дальше, а факт прибытия пуст — из-за этого «Прибытие факт: —» в поставках
-- и ложное «опаздывает» в Ганте/списках.
--
-- Берём дату ПЕРВОГО перехода в WAREHOUSE_MSK из журнала статусов.
-- Заказы без такого лога не трогаем (лучше честное «—», чем выдуманная дата).
-- Ничего не удаляется.
UPDATE "Order" o
SET "arrivalActualDate" = sub."changedAt"
FROM (
  SELECT DISTINCT ON ("orderId") "orderId", "changedAt"
  FROM "OrderStatusLog"
  WHERE "toStatus" = 'WAREHOUSE_MSK'
  ORDER BY "orderId", "changedAt" ASC
) sub
WHERE o."id" = sub."orderId"
  AND o."arrivalActualDate" IS NULL
  AND o."status" IN ('WAREHOUSE_MSK', 'PACKING', 'SHIPPED_WB', 'ON_SALE')
  AND o."deletedAt" IS NULL;
