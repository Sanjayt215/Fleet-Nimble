-- AlterTable
ALTER TABLE "vehicles" ADD COLUMN IF NOT EXISTS "last_obd_at" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "telemetry_online" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "vehicles_telemetry_online_last_obd_at_idx" ON "vehicles"("telemetry_online", "last_obd_at");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "obd_live_data_recorded_at_idx" ON "obd_live_data"("recorded_at");
