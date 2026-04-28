-- Replace DeliveryMethod enum: CARGO/AIR/RAIL/DOMESTIC/CHINA_INTERNAL → DOMESTIC_RU / CARGO_KG / CARGO_CN / TK_CN

-- 1) Rename old enum
ALTER TYPE "DeliveryMethod" RENAME TO "DeliveryMethod_old";

-- 2) New enum
CREATE TYPE "DeliveryMethod" AS ENUM ('DOMESTIC_RU', 'CARGO_KG', 'CARGO_CN', 'TK_CN');

-- 3) Switch the column to text temporarily and remap values
ALTER TABLE "Order" ALTER COLUMN "deliveryMethod" TYPE TEXT;
UPDATE "Order"
SET "deliveryMethod" = CASE "deliveryMethod"
  WHEN 'DOMESTIC' THEN 'DOMESTIC_RU'
  WHEN 'CARGO' THEN 'CARGO_CN'
  WHEN 'RAIL' THEN 'CARGO_CN'
  WHEN 'AIR' THEN 'TK_CN'
  WHEN 'CHINA_INTERNAL' THEN 'CARGO_CN'
  ELSE NULL
END;
ALTER TABLE "Order" ALTER COLUMN "deliveryMethod" TYPE "DeliveryMethod" USING "deliveryMethod"::"DeliveryMethod";

-- Same for PackagingOrder if it has this column
ALTER TABLE "PackagingOrder" ALTER COLUMN "deliveryMethod" TYPE TEXT;
UPDATE "PackagingOrder"
SET "deliveryMethod" = CASE "deliveryMethod"
  WHEN 'DOMESTIC' THEN 'DOMESTIC_RU'
  WHEN 'CARGO' THEN 'CARGO_CN'
  WHEN 'RAIL' THEN 'CARGO_CN'
  WHEN 'AIR' THEN 'TK_CN'
  WHEN 'CHINA_INTERNAL' THEN 'CARGO_CN'
  ELSE NULL
END;
ALTER TABLE "PackagingOrder" ALTER COLUMN "deliveryMethod" TYPE "DeliveryMethod" USING "deliveryMethod"::"DeliveryMethod";

-- 4) Drop old enum
DROP TYPE "DeliveryMethod_old";
