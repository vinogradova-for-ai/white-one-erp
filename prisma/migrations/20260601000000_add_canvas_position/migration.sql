-- Координаты карточки фасона на бесконечной доске (/models/board).
ALTER TABLE "ProductModel" ADD COLUMN "canvasX" DOUBLE PRECISION;
ALTER TABLE "ProductModel" ADD COLUMN "canvasY" DOUBLE PRECISION;
