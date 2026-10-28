BEGIN;

CREATE TYPE "BorrowingLossStatus" AS ENUM (
    'PENDING',
    'APPROVED',
    'REJECTED',
    'CANCELLED'
);

CREATE TABLE "borrowing_loss_report" (
    "id" TEXT NOT NULL,
    "borrowingLineId" TEXT NOT NULL,
    "status" "BorrowingLossStatus" NOT NULL DEFAULT 'PENDING',
    "notes" TEXT NOT NULL,
    "requestHash" CHAR(64) NOT NULL,
    "reportedById" TEXT NOT NULL,
    "reportedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedById" TEXT,
    "closedAt" TIMESTAMPTZ(3),
    "closureNotes" TEXT,

    CONSTRAINT "borrowing_loss_report_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "borrowing_loss_report_notes_valid"
        CHECK (length(btrim("notes")) BETWEEN 1 AND 2000),
    CONSTRAINT "borrowing_loss_report_hash_valid"
        CHECK ("requestHash" ~ '^[0-9a-f]{64}$'),
    CONSTRAINT "borrowing_loss_report_closure_notes_valid"
        CHECK (
            "closureNotes" IS NULL
            OR length(btrim("closureNotes")) BETWEEN 1 AND 2000
        ),
    CONSTRAINT "borrowing_loss_report_closure_state_valid"
        CHECK (
            ("status" = 'PENDING' AND "closedById" IS NULL AND "closedAt" IS NULL AND "closureNotes" IS NULL)
            OR ("status" <> 'PENDING' AND "closedById" IS NOT NULL AND "closedAt" IS NOT NULL)
        ),
    CONSTRAINT "borrowing_loss_report_borrowingLineId_fkey"
        FOREIGN KEY ("borrowingLineId") REFERENCES "borrowing_line" ("id")
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "borrowing_loss_report_reportedById_fkey"
        FOREIGN KEY ("reportedById") REFERENCES "user" ("id")
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "borrowing_loss_report_closedById_fkey"
        FOREIGN KEY ("closedById") REFERENCES "user" ("id")
        ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE INDEX "borrowing_loss_report_borrowingLineId_reportedAt_idx"
    ON "borrowing_loss_report" ("borrowingLineId", "reportedAt");
CREATE INDEX "borrowing_loss_report_status_reportedAt_idx"
    ON "borrowing_loss_report" ("status", "reportedAt");
CREATE INDEX "borrowing_loss_report_reportedById_idx"
    ON "borrowing_loss_report" ("reportedById");
CREATE INDEX "borrowing_loss_report_closedById_idx"
    ON "borrowing_loss_report" ("closedById");
CREATE UNIQUE INDEX "borrowing_loss_report_one_active_per_line"
    ON "borrowing_loss_report" ("borrowingLineId")
    WHERE "status" IN ('PENDING', 'APPROVED');

COMMIT;
