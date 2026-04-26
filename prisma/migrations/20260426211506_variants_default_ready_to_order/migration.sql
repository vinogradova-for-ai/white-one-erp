/*
  Warnings:

  - You are about to drop the column `patternVersion` on the `ProductModel` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "ProductModel" DROP COLUMN "patternVersion";

-- AlterTable
ALTER TABLE "ProductVariant" ALTER COLUMN "status" SET DEFAULT 'READY_TO_ORDER';

-- Mark all existing draft variants as ready (status removed from UI).
UPDATE "ProductVariant" SET "status" = 'READY_TO_ORDER' WHERE "status" = 'DRAFT';
