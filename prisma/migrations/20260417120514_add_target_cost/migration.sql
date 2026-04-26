-- AlterTable
ALTER TABLE "ProductModel" ADD COLUMN     "targetCostCny" DECIMAL(12,2),
ADD COLUMN     "targetCostNote" TEXT,
ADD COLUMN     "targetCostRub" DECIMAL(12,2);
