BEGIN;

ALTER TYPE "BorrowingResolutionMethod" ADD VALUE 'REPLACEMENT';
CREATE TYPE "BorrowingLossSettlementMethod" AS ENUM ('COMPENSATION', 'REPLACEMENT');

ALTER TABLE "borrowing_loss_settlement"
    ADD COLUMN "method" "BorrowingLossSettlementMethod" NOT NULL DEFAULT 'COMPENSATION',
    ALTER COLUMN "amount" DROP NOT NULL,
    ALTER COLUMN "currencyCode" DROP NOT NULL,
    ADD COLUMN "replacementItemId" TEXT,
    ADD COLUMN "replacementName" TEXT,
    ADD COLUMN "replacementSerialNumber" TEXT,
    ADD COLUMN "replacementCondition" "UnitCondition",
    ADD COLUMN "receivedAt" TIMESTAMPTZ(3),
    ADD COLUMN "replacementUnitId" TEXT;

ALTER TABLE "borrowing_loss_settlement"
    ADD CONSTRAINT "borrowing_loss_settlement_method_fields_valid" CHECK (
        ("method" = 'COMPENSATION' AND "amount" IS NOT NULL AND "currencyCode" IS NOT NULL
         AND "replacementItemId" IS NULL AND "replacementName" IS NULL
         AND "replacementSerialNumber" IS NULL AND "replacementCondition" IS NULL
         AND "receivedAt" IS NULL AND "replacementUnitId" IS NULL)
        OR
        ("method" = 'REPLACEMENT' AND "amount" IS NULL AND "currencyCode" IS NULL
         AND "replacementItemId" IS NOT NULL AND "replacementCondition" IS NOT NULL
         AND "receivedAt" IS NOT NULL
         AND (("status" = 'APPROVED' AND "replacementUnitId" IS NOT NULL)
              OR ("status" <> 'APPROVED' AND "replacementUnitId" IS NULL)))
    ),
    ADD CONSTRAINT "borrowing_loss_settlement_replacementItemId_fkey"
        FOREIGN KEY ("replacementItemId") REFERENCES "item" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    ADD CONSTRAINT "borrowing_loss_settlement_replacementUnitId_fkey"
        FOREIGN KEY ("replacementUnitId") REFERENCES "item_unit" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

CREATE UNIQUE INDEX "borrowing_loss_settlement_replacementUnitId_key" ON "borrowing_loss_settlement" ("replacementUnitId");
CREATE INDEX "borrowing_loss_settlement_replacementItemId_idx" ON "borrowing_loss_settlement" ("replacementItemId");

CREATE TABLE "borrowing_loss_settlement_photo" (
    "id" TEXT NOT NULL,
    "settlementId" TEXT NOT NULL,
    "photoKey" TEXT NOT NULL,
    CONSTRAINT "borrowing_loss_settlement_photo_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "borrowing_loss_settlement_photo_settlementId_fkey"
        FOREIGN KEY ("settlementId") REFERENCES "borrowing_loss_settlement" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE UNIQUE INDEX "borrowing_loss_settlement_photo_photoKey_key" ON "borrowing_loss_settlement_photo" ("photoKey");
CREATE INDEX "borrowing_loss_settlement_photo_settlementId_idx" ON "borrowing_loss_settlement_photo" ("settlementId");

COMMIT;
