BEGIN;

ALTER TYPE "BorrowingResolutionMethod" ADD VALUE 'WRITE_OFF';
ALTER TYPE "BorrowingLossSettlementMethod" ADD VALUE 'WRITE_OFF';

ALTER TABLE "borrowing_loss_settlement"
    DROP CONSTRAINT "borrowing_loss_settlement_method_fields_valid",
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
        OR
        -- Text comparison allows the new enum value and this constraint in one transaction.
        ("method"::text = 'WRITE_OFF' AND "amount" IS NULL AND "currencyCode" IS NULL
         AND "replacementItemId" IS NULL AND "replacementName" IS NULL
         AND "replacementSerialNumber" IS NULL AND "replacementCondition" IS NULL
         AND "receivedAt" IS NULL AND "replacementUnitId" IS NULL)
    ),
    ADD CONSTRAINT "borrowing_loss_settlement_write_off_reason_valid" CHECK (
        "method"::text <> 'WRITE_OFF' OR "status" = 'PENDING'
        OR ("decisionNotes" IS NOT NULL AND length(btrim("decisionNotes")) BETWEEN 1 AND 2000)
    );

COMMIT;
