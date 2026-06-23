-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "VehicleStatus" ADD VALUE 'STANDBY';
ALTER TYPE "VehicleStatus" ADD VALUE 'ENGINE_OFF';
ALTER TYPE "VehicleStatus" ADD VALUE 'LOW_BATTERY';

-- AlterTable
ALTER TABLE "telemetries" ADD COLUMN     "battery_protection_mode" TEXT,
ADD COLUMN     "engine_state" TEXT,
ADD COLUMN     "ignition_status" TEXT,
ADD COLUMN     "obd_polling_active" BOOLEAN,
ADD COLUMN     "standby_heartbeat" BOOLEAN,
ADD COLUMN     "standby_reason" TEXT;

-- AlterTable
ALTER TABLE "vehicles" ADD COLUMN     "battery_protection_mode" TEXT,
ADD COLUMN     "engine_state" TEXT,
ADD COLUMN     "ignition_status" TEXT,
ADD COLUMN     "last_engine_off_at" TIMESTAMP(3),
ADD COLUMN     "last_engine_on_at" TIMESTAMP(3),
ADD COLUMN     "last_standby_at" TIMESTAMP(3),
ADD COLUMN     "obd_polling_active" BOOLEAN;

-- CreateIndex
CREATE INDEX "telemetries_engine_state_idx" ON "telemetries"("engine_state");

-- CreateIndex
CREATE INDEX "vehicles_engine_state_idx" ON "vehicles"("engine_state");
