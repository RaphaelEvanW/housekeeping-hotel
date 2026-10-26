CREATE TABLE "item_unit_photo" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "auditEventId" TEXT NOT NULL,
    "photoKey" TEXT NOT NULL,

    CONSTRAINT "item_unit_photo_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "item_unit_photo_photoKey_key"
ON "item_unit_photo"("photoKey");

CREATE INDEX "item_unit_photo_unitId_idx"
ON "item_unit_photo"("unitId");

CREATE INDEX "item_unit_photo_auditEventId_idx"
ON "item_unit_photo"("auditEventId");

ALTER TABLE "item_unit_photo"
ADD CONSTRAINT "item_unit_photo_unitId_fkey"
FOREIGN KEY ("unitId") REFERENCES "item_unit"("id")
ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "item_unit_photo"
ADD CONSTRAINT "item_unit_photo_auditEventId_fkey"
FOREIGN KEY ("auditEventId") REFERENCES "audit_event"("id")
ON DELETE RESTRICT ON UPDATE RESTRICT;