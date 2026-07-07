-- «Планирование»: направления развития бренда (BrandPlan) + привязка фасонов.

-- CreateEnum
CREATE TYPE "BrandPlanStatus" AS ENUM ('IDEA', 'APPROVED', 'IN_PROGRESS', 'DONE', 'CANCELLED');

-- CreateTable
CREATE TABLE "BrandPlan" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "BrandPlanStatus" NOT NULL DEFAULT 'IDEA',
    "season" TEXT,
    "targetDate" TIMESTAMP(3),
    "plannedModelsCount" INTEGER,
    "plannedUnitsPerModel" INTEGER,
    "targetUnitPriceCny" DECIMAL(12,2),
    "cnyRubRate" DECIMAL(10,4),
    "budgetRub" DECIMAL(14,2),
    "notes" TEXT,
    "ownerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BrandPlan_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "ProductModel" ADD COLUMN "brandPlanId" TEXT;

-- CreateIndex
CREATE INDEX "BrandPlan_status_idx" ON "BrandPlan"("status");

-- AddForeignKey
ALTER TABLE "ProductModel" ADD CONSTRAINT "ProductModel_brandPlanId_fkey" FOREIGN KEY ("brandPlanId") REFERENCES "BrandPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrandPlan" ADD CONSTRAINT "BrandPlan_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
