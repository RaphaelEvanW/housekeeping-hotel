-- CreateEnum
CREATE TYPE "UnitLifecycle" AS ENUM ('ACTIVE', 'RETIRED');

-- CreateEnum
CREATE TYPE "UnitCustody" AS ENUM ('HOUSEKEEPING', 'GUEST', 'ENGINEERING', 'EXTERNAL_VENDOR');

-- CreateEnum
CREATE TYPE "UnitCondition" AS ENUM ('GOOD', 'MINOR_DAMAGE', 'DAMAGED', 'MISSING_PART');

-- CreateEnum
CREATE TYPE "UnitReadiness" AS ENUM ('CLEAR', 'ON_HOLD', 'PENDING_INSPECTION', 'PENDING_VERIFICATION');

-- CreateEnum
CREATE TYPE "UnitLossState" AS ENUM ('NONE', 'MISSING', 'LOST');

-- CreateTable
CREATE TABLE "item_unit" (
    "id" TEXT NOT NULL,
    "unitNumber" SERIAL NOT NULL,
    "itemId" TEXT NOT NULL,
    "serialNumber" TEXT,
    "notes" TEXT,
    "lifecycle" "UnitLifecycle" NOT NULL DEFAULT 'ACTIVE',
    "custody" "UnitCustody" NOT NULL DEFAULT 'HOUSEKEEPING',
    "condition" "UnitCondition" NOT NULL DEFAULT 'GOOD',
    "readiness" "UnitReadiness" NOT NULL DEFAULT 'CLEAR',
    "lossState" "UnitLossState" NOT NULL DEFAULT 'NONE',
    "locationId" TEXT,
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "item_unit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "item_unit_unitNumber_key" ON "item_unit"("unitNumber");

-- CreateIndex
CREATE INDEX "item_unit_itemId_idx" ON "item_unit"("itemId");

-- CreateIndex
CREATE INDEX "item_unit_locationId_idx" ON "item_unit"("locationId");

-- AddForeignKey
ALTER TABLE "item_unit" ADD CONSTRAINT "item_unit_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_unit" ADD CONSTRAINT "item_unit_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_unit" ADD CONSTRAINT "item_unit_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_unit" ADD CONSTRAINT "item_unit_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
