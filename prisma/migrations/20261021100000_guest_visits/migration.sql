BEGIN;

CREATE TYPE "GuestVisitStatus" AS ENUM (
    'STAYING',
    'CHECKED_OUT'
);

CREATE TABLE "guest_visit" (
    "id" TEXT NOT NULL,
    "primaryGuestName" TEXT NOT NULL,
    "normalizedPrimaryGuestName" TEXT NOT NULL,
    "roomNumber" TEXT NOT NULL,
    "checkInDate" DATE NOT NULL,
    "plannedCheckoutDate" DATE NOT NULL,
    "status" "GuestVisitStatus" NOT NULL DEFAULT 'STAYING',
    "checkedOutAt" TIMESTAMPTZ(3),
    "isDuplicate" BOOLEAN NOT NULL DEFAULT false,

    "createdById" TEXT NOT NULL,
    "updatedById" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "guest_visit_pkey"
        PRIMARY KEY ("id"),

    CONSTRAINT "guest_visit_required_text"
        CHECK (
            "primaryGuestName" ~ '[^[:space:]]'
            AND "normalizedPrimaryGuestName" ~ '[^[:space:]]'
            AND "roomNumber" ~ '[^[:space:]]'
        ),

    CONSTRAINT "guest_visit_dates_consistent"
        CHECK ("plannedCheckoutDate" >= "checkInDate"),

    CONSTRAINT "guest_visit_checkout_consistent"
        CHECK (
            (
                "status" = 'STAYING'
                AND "checkedOutAt" IS NULL
            )
            OR
            (
                "status" = 'CHECKED_OUT'
                AND "checkedOutAt" IS NOT NULL
            )
        )
);

CREATE INDEX "guest_visit_status_roomNumber_checkInDate_idx"
    ON "guest_visit" ("status", "roomNumber", "checkInDate");

CREATE INDEX "guest_visit_createdById_idx"
    ON "guest_visit" ("createdById");

CREATE INDEX "guest_visit_updatedById_idx"
    ON "guest_visit" ("updatedById");

ALTER TABLE "guest_visit"
    ADD CONSTRAINT "guest_visit_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "user" ("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "guest_visit"
    ADD CONSTRAINT "guest_visit_updatedById_fkey"
    FOREIGN KEY ("updatedById") REFERENCES "user" ("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

COMMIT;