-- Order.hasFactoryQc — фабрика проводит ОТК. Если false, у заказа 3 фазы вместо 4
-- (Разработка → Производство → Доставка, без ОТК). Дефолт true для всех существующих.

ALTER TABLE "Order"
  ADD COLUMN "hasFactoryQc" BOOLEAN NOT NULL DEFAULT true;
