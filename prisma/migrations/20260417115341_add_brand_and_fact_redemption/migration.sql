-- CreateEnum
CREATE TYPE "Brand" AS ENUM ('WHITE_ONE', 'SERDCEBIENIE');

-- AlterTable
ALTER TABLE "ProductModel" ADD COLUMN     "brand" "Brand" NOT NULL DEFAULT 'WHITE_ONE';

-- AlterTable
ALTER TABLE "ProductVariant" ADD COLUMN     "factRedemptionPct" DECIMAL(5,2);
