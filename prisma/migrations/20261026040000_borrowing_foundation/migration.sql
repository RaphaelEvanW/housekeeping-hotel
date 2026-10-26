BEGIN;

CREATE TYPE "BorrowingLineStatus" AS ENUM (
    'OUTSTANDING',
    'RETURNED',
    'SETTLED'
);

CREATE TABLE "borrowing" (
    "id" TEXT NOT NULL,
    "guestVisitId" TEXT NOT NULL,
    "requestHash" CHAR(64) NOT NULL,
    "primaryGuestNameSnapshot" TEXT NOT NULL,
    "roomNumberSnapshot" TEXT NOT NULL,
    "issuedById" TEXT NOT NULL,
    "issuedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "borrowing_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "borrowing_hash_valid"
        CHECK ("requestHash" ~ '^[0-9a-f]{64}$'),
    CONSTRAINT "borrowing_snapshots_nonblank"
        CHECK (
            "primaryGuestNameSnapshot" ~ '[^[:space:]]'
            AND "roomNumberSnapshot" ~ '[^[:space:]]'
        ),
    CONSTRAINT "borrowing_guestVisitId_fkey"
        FOREIGN KEY ("guestVisitId") REFERENCES "guest_visit" ("id")
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "borrowing_issuedById_fkey"
        FOREIGN KEY ("issuedById") REFERENCES "user" ("id")
        ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE INDEX "borrowing_guestVisitId_issuedAt_idx"
    ON "borrowing" ("guestVisitId", "issuedAt");

CREATE INDEX "borrowing_issuedById_idx"
    ON "borrowing" ("issuedById");

CREATE TABLE "borrowing_line" (
    "id" TEXT NOT NULL,
    "borrowingId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "conditionAtIssue" "UnitCondition" NOT NULL,
    "status" "BorrowingLineStatus" NOT NULL DEFAULT 'OUTSTANDING',
    "resolvedAt" TIMESTAMPTZ(3),

    CONSTRAINT "borrowing_line_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "borrowing_line_resolution_consistent"
        CHECK (
            ("status" = 'OUTSTANDING' AND "resolvedAt" IS NULL)
            OR
            (
                "status" IN ('RETURNED', 'SETTLED')
                AND "resolvedAt" IS NOT NULL
            )
        ),
    CONSTRAINT "borrowing_line_borrowingId_fkey"
        FOREIGN KEY ("borrowingId") REFERENCES "borrowing" ("id")
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "borrowing_line_unitId_fkey"
        FOREIGN KEY ("unitId") REFERENCES "item_unit" ("id")
        ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE UNIQUE INDEX "borrowing_line_borrowingId_unitId_key"
    ON "borrowing_line" ("borrowingId", "unitId");

CREATE UNIQUE INDEX "borrowing_line_id_unitId_key"
    ON "borrowing_line" ("id", "unitId");

CREATE INDEX "borrowing_line_unitId_idx"
    ON "borrowing_line" ("unitId");

CREATE UNIQUE INDEX "borrowing_line_one_outstanding_per_unit"
    ON "borrowing_line" ("unitId")
    WHERE "status" = 'OUTSTANDING';

ALTER TABLE "item_unit_photo"
    ADD COLUMN "borrowingLineId" TEXT;

CREATE INDEX "item_unit_photo_borrowingLineId_idx"
    ON "item_unit_photo" ("borrowingLineId");

ALTER TABLE "item_unit_photo"
    ADD CONSTRAINT "item_unit_photo_borrowingLineId_unitId_fkey"
    FOREIGN KEY ("borrowingLineId", "unitId")
    REFERENCES "borrowing_line" ("id", "unitId")
    ON DELETE RESTRICT ON UPDATE RESTRICT;

COMMIT;