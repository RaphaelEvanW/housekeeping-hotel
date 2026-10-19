-- CreateTable
CREATE TABLE "item" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "item_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "item_normalizedName_key" ON "item"("normalizedName");

-- CreateIndex
CREATE INDEX "item_isActive_name_idx" ON "item"("isActive", "name");

-- AddForeignKey
ALTER TABLE "item" ADD CONSTRAINT "item_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item" ADD CONSTRAINT "item_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
