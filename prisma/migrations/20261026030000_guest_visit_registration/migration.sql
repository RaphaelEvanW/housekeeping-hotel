BEGIN;

ALTER TABLE "guest_visit"
    ADD COLUMN "bookingNumber" TEXT,
    ADD COLUMN "registrationRequestHash" CHAR(64),
    ADD CONSTRAINT "guest_visit_booking_number_nonblank"
        CHECK ("bookingNumber" IS NULL OR "bookingNumber" ~ '[^[:space:]]'),
    ADD CONSTRAINT "guest_visit_registration_hash_valid"
        CHECK ("registrationRequestHash" IS NULL OR "registrationRequestHash" ~ '^[0-9a-f]{64}$'),
    ADD CONSTRAINT "guest_visit_registration_booking_required"
        CHECK ("registrationRequestHash" IS NULL OR "bookingNumber" IS NOT NULL);

CREATE INDEX "guest_visit_normalizedPrimaryGuestName_status_checkInDate_idx"
    ON "guest_visit" ("normalizedPrimaryGuestName", "status", "checkInDate");

COMMIT;
