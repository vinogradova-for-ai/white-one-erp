-- Чистка после удаления Sample/QC/customs из UI.
-- Алёна решила убить эти сущности целиком, схема приводится в соответствие.

-- 1) Drop foreign keys / tables связанные с Sample
DROP TABLE IF EXISTS "SampleStatusLog";
DROP TABLE IF EXISTS "Sample";

-- 2) Drop QC и customs полей с Order
ALTER TABLE "Order" DROP COLUMN IF EXISTS "specReady";
ALTER TABLE "Order" DROP COLUMN IF EXISTS "specUrl";
ALTER TABLE "Order" DROP COLUMN IF EXISTS "declarationReady";
ALTER TABLE "Order" DROP COLUMN IF EXISTS "declarationUrl";
ALTER TABLE "Order" DROP COLUMN IF EXISTS "qcDate";
ALTER TABLE "Order" DROP COLUMN IF EXISTS "qcQuantityOk";
ALTER TABLE "Order" DROP COLUMN IF EXISTS "qcQuantityDefects";
ALTER TABLE "Order" DROP COLUMN IF EXISTS "qcDefectsPhotoUrl";
ALTER TABLE "Order" DROP COLUMN IF EXISTS "qcDefectCategory";
ALTER TABLE "Order" DROP COLUMN IF EXISTS "qcReplacedByFactory";
ALTER TABLE "Order" DROP COLUMN IF EXISTS "qcResolutionNote";

-- 3) Drop ТНВЭД и техпакета на фасоне
ALTER TABLE "ProductModel" DROP COLUMN IF EXISTS "hsCode";
ALTER TABLE "ProductModel" DROP COLUMN IF EXISTS "techPackUrl";
ALTER TABLE "ProductModel" DROP COLUMN IF EXISTS "sampleApprovalUrl";

-- 4) Drop связанных enum-типов
DROP TYPE IF EXISTS "SampleStatus";
DROP TYPE IF EXISTS "QcDefectCategory";
