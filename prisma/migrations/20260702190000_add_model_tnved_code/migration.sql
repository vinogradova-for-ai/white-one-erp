-- Маркировка «Честный знак»: код ТНВЭД ЕАЭС на уровне фасона.
-- Общий для всех цветов; состав уже хранится в fabricComposition.
ALTER TABLE "ProductModel" ADD COLUMN "tnvedCode" TEXT;
