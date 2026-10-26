BEGIN;

CREATE TABLE "item_photo" (
  "id" TEXT NOT NULL,
  "itemId" TEXT NOT NULL,
  "photoKey" TEXT NOT NULL,
  "position" INTEGER NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "item_photo_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "item_photo_position_check" CHECK ("position" >= 0),
  CONSTRAINT "item_photo_key_check" CHECK (length(trim("photoKey")) > 0),
  CONSTRAINT "item_photo_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "item"("id") ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE UNIQUE INDEX "item_photo_photoKey_key" ON "item_photo"("photoKey");
CREATE UNIQUE INDEX "item_photo_itemId_position_key" ON "item_photo"("itemId", "position");

-- Preserve existing files and cover URLs; no file copy or deletion is needed.
INSERT INTO "item_photo" ("id", "itemId", "photoKey", "position", "createdAt")
SELECT gen_random_uuid()::text, "id", "photoKey", 0, "createdAt"
FROM "item"
WHERE "photoKey" IS NOT NULL;

COMMIT;
