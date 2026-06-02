-- Доска коллекции «Раскладка по цветам»: перекрашиваемый флэт-контур фасона,
-- набор выложенных цветов и порядок ряда.
ALTER TABLE "ProductModel" ADD COLUMN "flatSketchSvg" TEXT;
ALTER TABLE "ProductModel" ADD COLUMN "boardColors" TEXT[];
ALTER TABLE "ProductModel" ADD COLUMN "collectionOrder" INTEGER;
