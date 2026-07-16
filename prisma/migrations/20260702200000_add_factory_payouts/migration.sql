-- Оплаты фабрикам (фактические переводы) + разнесение по плановым платежам.
-- Боль: платёж зафиксировали, а списать по заказам «скопом» непонятно как.
-- FactoryPayout = факт перевода; PayoutAllocation = разнесение на Payment (план).

-- CreateTable
CREATE TABLE "FactoryPayout" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currencyNote" TEXT,
    "comment" TEXT,
    "factoryId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "FactoryPayout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayoutAllocation" (
    "id" TEXT NOT NULL,
    "payoutId" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayoutAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FactoryPayout_factoryId_idx" ON "FactoryPayout"("factoryId");

-- CreateIndex
CREATE INDEX "FactoryPayout_date_idx" ON "FactoryPayout"("date");

-- CreateIndex
CREATE INDEX "FactoryPayout_deletedAt_idx" ON "FactoryPayout"("deletedAt");

-- CreateIndex
CREATE INDEX "PayoutAllocation_paymentId_idx" ON "PayoutAllocation"("paymentId");

-- CreateIndex
CREATE INDEX "PayoutAllocation_payoutId_idx" ON "PayoutAllocation"("payoutId");

-- CreateIndex
CREATE UNIQUE INDEX "PayoutAllocation_payoutId_paymentId_key" ON "PayoutAllocation"("payoutId", "paymentId");

-- AddForeignKey
ALTER TABLE "FactoryPayout" ADD CONSTRAINT "FactoryPayout_factoryId_fkey" FOREIGN KEY ("factoryId") REFERENCES "Factory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FactoryPayout" ADD CONSTRAINT "FactoryPayout_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayoutAllocation" ADD CONSTRAINT "PayoutAllocation_payoutId_fkey" FOREIGN KEY ("payoutId") REFERENCES "FactoryPayout"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayoutAllocation" ADD CONSTRAINT "PayoutAllocation_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
