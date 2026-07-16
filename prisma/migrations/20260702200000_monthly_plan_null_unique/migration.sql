-- Дубли MonthlyPlan при двойном клике (аудит блок ④).
-- Составной @@unique([yearMonth, ownerId, category]) не блокирует NULL:
-- Postgres считает NULL ≠ NULL, поэтому «общий план месяца» (ownerId=NULL,
-- category=NULL) и частичные NULL-комбинации можно было создать дважды.
-- Добавляем ЧАСТИЧНЫЕ уникальные индексы на три NULL-случая, чтобы БД сама
-- блокировала дубль (P2002 → код повторяет как update).

-- Сначала схлопнем уже накопившиеся дубли: оставляем самую свежую запись
-- (max updatedAt, при равенстве — max id), остальные удаляем.
DELETE FROM "MonthlyPlan" a
USING "MonthlyPlan" b
WHERE a."yearMonth" = b."yearMonth"
  AND a."ownerId" IS NOT DISTINCT FROM b."ownerId"
  AND a."category" IS NOT DISTINCT FROM b."category"
  AND (a."updatedAt" < b."updatedAt"
       OR (a."updatedAt" = b."updatedAt" AND a."id" < b."id"));

-- ownerId=NULL, category задан
CREATE UNIQUE INDEX "MonthlyPlan_ym_cat_nullowner_key"
  ON "MonthlyPlan" ("yearMonth", "category")
  WHERE "ownerId" IS NULL AND "category" IS NOT NULL;

-- ownerId задан, category=NULL
CREATE UNIQUE INDEX "MonthlyPlan_ym_owner_nullcat_key"
  ON "MonthlyPlan" ("yearMonth", "ownerId")
  WHERE "ownerId" IS NOT NULL AND "category" IS NULL;

-- ownerId=NULL и category=NULL (общий план месяца)
CREATE UNIQUE INDEX "MonthlyPlan_ym_nullowner_nullcat_key"
  ON "MonthlyPlan" ("yearMonth")
  WHERE "ownerId" IS NULL AND "category" IS NULL;
