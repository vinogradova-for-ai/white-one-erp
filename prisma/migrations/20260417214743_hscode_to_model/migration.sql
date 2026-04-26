-- ТНВЭД — это таможенный код товара, одинаковый для всех цветов одного фасона. Переносим с варианта на фасон.
ALTER TABLE "ProductModel" ADD COLUMN "hsCode" TEXT;
ALTER TABLE "ProductVariant" DROP COLUMN "hsCode";
