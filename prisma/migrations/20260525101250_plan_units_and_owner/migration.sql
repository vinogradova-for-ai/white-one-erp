-- MonthlyPlan: переход с «план выручки в рублях» на «план выпущенных продуктов».
-- Алёна явно отметила: «план/факт должен делать не в рублях и это не план продаж,
-- а план выпущенных продуктов. Планирование продуктовое должно идти от количества
-- фасонов и выпущенных штук на них предварительно закрепляя ответственных.»

-- Снимаем старый unique (yearMonth + category).
DROP INDEX IF EXISTS "MonthlyPlan_yearMonth_category_key";

-- Добавляем ответственного и количество фасонов.
ALTER TABLE "MonthlyPlan"
  ADD COLUMN IF NOT EXISTS "ownerId" TEXT,
  ADD COLUMN IF NOT EXISTS "plannedModelCount" INTEGER;

-- Категория теперь опциональна (план по ответственным первичен).
ALTER TABLE "MonthlyPlan" ALTER COLUMN "category" DROP NOT NULL;

-- plannedRevenue остаётся в схеме для исторических данных, но
-- становится опциональной (новые планы её не используют).
ALTER TABLE "MonthlyPlan" ALTER COLUMN "plannedRevenue" DROP NOT NULL;

-- FK на пользователя.
ALTER TABLE "MonthlyPlan"
  ADD CONSTRAINT "MonthlyPlan_ownerId_fkey"
  FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "MonthlyPlan_ownerId_idx" ON "MonthlyPlan"("ownerId");

-- Новый unique: один план на (месяц, ответственный, категория).
-- NULL в category допускается — это «общий план ответственного на месяц».
CREATE UNIQUE INDEX IF NOT EXISTS "MonthlyPlan_yearMonth_ownerId_category_key"
  ON "MonthlyPlan"("yearMonth", "ownerId", "category");
