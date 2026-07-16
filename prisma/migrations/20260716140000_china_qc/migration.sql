-- ОТК Китай: проверка качества на фабрике, стоимость ложится в себестоимость
-- (Алёна 16.07). Курс валюты фиксируется на дату ОТК.

CREATE TABLE "ChinaQc" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'CNY',
    "rubRate" DECIMAL(12,4),
    "comment" TEXT,
    "createdById" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ChinaQc_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ChinaQc_orderId_idx" ON "ChinaQc"("orderId");
CREATE INDEX "ChinaQc_deletedAt_idx" ON "ChinaQc"("deletedAt");
ALTER TABLE "ChinaQc" ADD CONSTRAINT "ChinaQc_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChinaQc" ADD CONSTRAINT "ChinaQc_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
