BEGIN;

CREATE TYPE "ItemDeactivationStatus" AS ENUM (
    'PENDING',
    'APPROVED',
    'REJECTED',
    'CANCELLED'
);

CREATE TABLE "item_deactivation_request" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "status" "ItemDeactivationStatus" NOT NULL DEFAULT 'PENDING',
    "reason" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "item_deactivation_request_pkey"
        PRIMARY KEY ("id"),

    CONSTRAINT "item_deactivation_request_reason_required"
        CHECK ("reason" ~ '[^[:space:]]'),

    CONSTRAINT "item_deactivation_request_decision_consistent"
        CHECK (
            (
                "status" = 'PENDING'
                AND "decidedById" IS NULL
                AND "decidedAt" IS NULL
            )
            OR
            (
                "status" <> 'PENDING'
                AND "decidedById" IS NOT NULL
                AND "decidedAt" IS NOT NULL
            )
        ),

    CONSTRAINT "item_deactivation_request_cancelled_by_requester"
        CHECK (
            "status" <> 'CANCELLED'
            OR "decidedById" = "requestedById"
        )
);

CREATE INDEX "item_deactivation_request_itemId_createdAt_idx"
    ON "item_deactivation_request" ("itemId", "createdAt");

CREATE INDEX "item_deactivation_request_status_createdAt_idx"
    ON "item_deactivation_request" ("status", "createdAt");

CREATE INDEX "item_deactivation_request_requestedById_idx"
    ON "item_deactivation_request" ("requestedById");

CREATE INDEX "item_deactivation_request_decidedById_idx"
    ON "item_deactivation_request" ("decidedById");

CREATE UNIQUE INDEX "item_deactivation_request_one_pending_per_item"
    ON "item_deactivation_request" ("itemId")
    WHERE "status" = 'PENDING';

ALTER TABLE "item_deactivation_request"
    ADD CONSTRAINT "item_deactivation_request_itemId_fkey"
    FOREIGN KEY ("itemId") REFERENCES "item" ("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "item_deactivation_request"
    ADD CONSTRAINT "item_deactivation_request_requestedById_fkey"
    FOREIGN KEY ("requestedById") REFERENCES "user" ("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "item_deactivation_request"
    ADD CONSTRAINT "item_deactivation_request_decidedById_fkey"
    FOREIGN KEY ("decidedById") REFERENCES "user" ("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

COMMIT;