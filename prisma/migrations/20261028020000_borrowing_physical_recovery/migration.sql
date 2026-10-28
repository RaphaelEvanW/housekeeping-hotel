BEGIN;

CREATE TYPE "BorrowingResolutionMethod" AS ENUM (
    'PHYSICAL_RECOVERY'
);

ALTER TABLE "borrowing_line"
    ADD COLUMN "resolutionMethod" "BorrowingResolutionMethod";

ALTER TABLE "borrowing_line"
    ADD CONSTRAINT "borrowing_line_resolution_state_valid"
    CHECK (
        "resolutionMethod" IS NULL
        OR ("status" = 'SETTLED' AND "resolvedAt" IS NOT NULL)
    );

CREATE UNIQUE INDEX "audit_event_one_borrowing_loss_recovery"
    ON "audit_event" (("newValues" ->> 'lossReportId'))
    WHERE "action" = 'BORROWING_PHYSICALLY_RECOVERED'
      AND "entityType" = 'ITEM_UNIT';

COMMIT;
