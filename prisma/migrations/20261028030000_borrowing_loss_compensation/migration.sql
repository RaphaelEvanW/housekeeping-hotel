BEGIN;

ALTER TYPE "BorrowingResolutionMethod" ADD VALUE 'COMPENSATION';

CREATE TYPE "BorrowingLossSettlementStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

CREATE TABLE "borrowing_loss_settlement" (
    "id" TEXT NOT NULL,
    "lossReportId" TEXT NOT NULL,
    "status" "BorrowingLossSettlementStatus" NOT NULL DEFAULT 'PENDING',
    "amount" DECIMAL(19,4) NOT NULL,
    "currencyCode" CHAR(3) NOT NULL,
    "notes" TEXT NOT NULL,
    "requestHash" CHAR(64) NOT NULL,
    "proposedById" TEXT NOT NULL,
    "proposedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMPTZ(3),
    "decisionNotes" TEXT,

    CONSTRAINT "borrowing_loss_settlement_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "borrowing_loss_settlement_amount_valid" CHECK ("amount" > 0),
    CONSTRAINT "borrowing_loss_settlement_currency_valid" CHECK ("currencyCode" ~ '^[A-Z]{3}$'),
    CONSTRAINT "borrowing_loss_settlement_notes_valid" CHECK (length(btrim("notes")) BETWEEN 1 AND 2000),
    CONSTRAINT "borrowing_loss_settlement_hash_valid" CHECK ("requestHash" ~ '^[0-9a-f]{64}$'),
    CONSTRAINT "borrowing_loss_settlement_decision_notes_valid"
        CHECK ("decisionNotes" IS NULL OR length(btrim("decisionNotes")) BETWEEN 1 AND 2000),
    CONSTRAINT "borrowing_loss_settlement_decision_state_valid"
        CHECK (
            ("status" = 'PENDING' AND "decidedById" IS NULL AND "decidedAt" IS NULL AND "decisionNotes" IS NULL)
            OR ("status" <> 'PENDING' AND "decidedById" IS NOT NULL AND "decidedAt" IS NOT NULL)
        ),
    CONSTRAINT "borrowing_loss_settlement_lossReportId_fkey"
        FOREIGN KEY ("lossReportId") REFERENCES "borrowing_loss_report" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "borrowing_loss_settlement_proposedById_fkey"
        FOREIGN KEY ("proposedById") REFERENCES "user" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "borrowing_loss_settlement_decidedById_fkey"
        FOREIGN KEY ("decidedById") REFERENCES "user" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE INDEX "borrowing_loss_settlement_lossReportId_proposedAt_idx"
    ON "borrowing_loss_settlement" ("lossReportId", "proposedAt");
CREATE INDEX "borrowing_loss_settlement_status_proposedAt_idx"
    ON "borrowing_loss_settlement" ("status", "proposedAt");
CREATE INDEX "borrowing_loss_settlement_proposedById_idx" ON "borrowing_loss_settlement" ("proposedById");
CREATE INDEX "borrowing_loss_settlement_decidedById_idx" ON "borrowing_loss_settlement" ("decidedById");
CREATE UNIQUE INDEX "borrowing_loss_settlement_one_pending_per_report"
    ON "borrowing_loss_settlement" ("lossReportId") WHERE "status" = 'PENDING';
CREATE UNIQUE INDEX "borrowing_loss_settlement_one_approved_per_report"
    ON "borrowing_loss_settlement" ("lossReportId") WHERE "status" = 'APPROVED';

COMMIT;
