-- AlterTable
ALTER TABLE "item_unit" ADD COLUMN     "stockBatchId" TEXT;

-- CreateTable
CREATE TABLE "stock_batch" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "requestHash" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_batch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "stock_batch_itemId_createdAt_idx" ON "stock_batch"("itemId", "createdAt");

-- CreateIndex
CREATE INDEX "stock_batch_createdById_idx" ON "stock_batch"("createdById");

-- CreateIndex
CREATE INDEX "item_unit_stockBatchId_idx" ON "item_unit"("stockBatchId");

-- AddForeignKey
ALTER TABLE "item_unit" ADD CONSTRAINT "item_unit_stockBatchId_fkey" FOREIGN KEY ("stockBatchId") REFERENCES "stock_batch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_batch" ADD CONSTRAINT "stock_batch_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_batch" ADD CONSTRAINT "stock_batch_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
