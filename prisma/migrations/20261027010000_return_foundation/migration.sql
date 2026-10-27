BEGIN;

CREATE TABLE "return_batch" (
    "id" TEXT NOT NULL,
    "guestVisitId" TEXT NOT NULL,
    "requestHash" CHAR(64) NOT NULL,
    "defaultLocationId" TEXT NOT NULL,
    "receivedById" TEXT NOT NULL,
    "receivedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "return_batch_pkey" PRIMARY KEY ("id"),

    CONSTRAINT "return_batch_hash_valid"
        CHECK ("requestHash" ~ '^[0-9a-f]{64}$'),

    CONSTRAINT "return_batch_guestVisitId_fkey"
        FOREIGN KEY ("guestVisitId") REFERENCES "guest_visit" ("id")
        ON DELETE RESTRICT ON UPDATE RESTRICT,

    CONSTRAINT "return_batch_defaultLocationId_fkey"
        FOREIGN KEY ("defaultLocationId") REFERENCES "location" ("id")
        ON DELETE RESTRICT ON UPDATE RESTRICT,

    CONSTRAINT "return_batch_receivedById_fkey"
        FOREIGN KEY ("receivedById") REFERENCES "user" ("id")
        ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE INDEX "return_batch_guestVisitId_receivedAt_idx"
    ON "return_batch" ("guestVisitId", "receivedAt");

CREATE INDEX "return_batch_defaultLocationId_idx"
    ON "return_batch" ("defaultLocationId");

CREATE INDEX "return_batch_receivedById_idx"
    ON "return_batch" ("receivedById");

CREATE TABLE "return_line" (
    "id" TEXT NOT NULL,
    "returnBatchId" TEXT NOT NULL,
    "borrowingLineId" TEXT NOT NULL,
    "condition" "UnitCondition" NOT NULL DEFAULT 'GOOD',
    "locationId" TEXT NOT NULL,

    CONSTRAINT "return_line_pkey" PRIMARY KEY ("id"),

    CONSTRAINT "return_line_returnBatchId_fkey"
        FOREIGN KEY ("returnBatchId") REFERENCES "return_batch" ("id")
        ON DELETE RESTRICT ON UPDATE RESTRICT,

    CONSTRAINT "return_line_borrowingLineId_fkey"
        FOREIGN KEY ("borrowingLineId") REFERENCES "borrowing_line" ("id")
        ON DELETE RESTRICT ON UPDATE RESTRICT,

    CONSTRAINT "return_line_locationId_fkey"
        FOREIGN KEY ("locationId") REFERENCES "location" ("id")
        ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE UNIQUE INDEX "return_line_borrowingLineId_key"
    ON "return_line" ("borrowingLineId");

CREATE UNIQUE INDEX "return_line_id_borrowingLineId_key"
    ON "return_line" ("id", "borrowingLineId");

CREATE INDEX "return_line_returnBatchId_idx"
    ON "return_line" ("returnBatchId");

CREATE INDEX "return_line_locationId_idx"
    ON "return_line" ("locationId");

ALTER TABLE "item_unit_photo"
    ADD COLUMN "returnLineId" TEXT;

CREATE INDEX "item_unit_photo_returnLineId_borrowingLineId_idx"
    ON "item_unit_photo" ("returnLineId", "borrowingLineId");

ALTER TABLE "item_unit_photo"
    ADD CONSTRAINT "item_unit_photo_return_requires_borrowing"
    CHECK (
        "returnLineId" IS NULL
        OR "borrowingLineId" IS NOT NULL
    );

ALTER TABLE "item_unit_photo"
    ADD CONSTRAINT "item_unit_photo_returnLineId_borrowingLineId_fkey"
    FOREIGN KEY ("returnLineId", "borrowingLineId")
    REFERENCES "return_line" ("id", "borrowingLineId")
    ON DELETE RESTRICT ON UPDATE RESTRICT;

COMMIT;