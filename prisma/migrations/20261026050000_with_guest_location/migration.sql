BEGIN;

INSERT INTO "location" (
    "id",
    "code",
    "name",
    "isActive",
    "createdAt",
    "updatedAt"
)
VALUES (
    gen_random_uuid()::text,
    'WITH_GUEST',
    'Bersama tamu',
    true,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
)
ON CONFLICT ("code") DO NOTHING;

COMMIT;