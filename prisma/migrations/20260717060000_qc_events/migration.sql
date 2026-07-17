-- ОТК Китай = мероприятие с партиями и фактом завершения (прожарка 17.07).
ALTER TABLE "ChinaQc" ADD COLUMN "finishedAt" DATE;

CREATE TABLE "_QcBatches" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,
    CONSTRAINT "_QcBatches_AB_pkey" PRIMARY KEY ("A","B")
);
CREATE INDEX "_QcBatches_B_index" ON "_QcBatches"("B");
ALTER TABLE "_QcBatches" ADD CONSTRAINT "_QcBatches_A_fkey" FOREIGN KEY ("A") REFERENCES "ChinaQc"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "_QcBatches" ADD CONSTRAINT "_QcBatches_B_fkey" FOREIGN KEY ("B") REFERENCES "OrderBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
