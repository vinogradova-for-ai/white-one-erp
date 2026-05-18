-- Добавляем «факт количества» на уровень OrderLine. Заполняется на этапе ОТК,
-- когда фабрика сдаёт партию и реальное число отличается от планового.
ALTER TABLE "OrderLine" ADD COLUMN "quantityActual" INTEGER;
