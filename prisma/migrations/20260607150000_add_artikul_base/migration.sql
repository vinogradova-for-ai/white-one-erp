-- AlterTable
ALTER TABLE "ProductModel" ADD COLUMN "artikulBase" TEXT;

-- CreateIndex
CREATE INDEX "ProductModel_artikulBase_idx" ON "ProductModel"("artikulBase");
