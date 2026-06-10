-- OBD BACKUP — GPS fields on live data, raw backup table, GPS locations

ALTER TABLE "obd_live_data" ADD COLUMN IF NOT EXISTS "latitude" DOUBLE PRECISION;
ALTER TABLE "obd_live_data" ADD COLUMN IF NOT EXISTS "longitude" DOUBLE PRECISION;
ALTER TABLE "obd_live_data" ADD COLUMN IF NOT EXISTS "altitude" DOUBLE PRECISION;
ALTER TABLE "obd_live_data" ADD COLUMN IF NOT EXISTS "gps_accuracy" DOUBLE PRECISION;
ALTER TABLE "obd_live_data" ADD COLUMN IF NOT EXISTS "heading" DOUBLE PRECISION;
ALTER TABLE "obd_live_data" ADD COLUMN IF NOT EXISTS "gps_speed" DOUBLE PRECISION;
ALTER TABLE "obd_live_data" ADD COLUMN IF NOT EXISTS "device_id" TEXT;
ALTER TABLE "obd_live_data" ADD COLUMN IF NOT EXISTS "app_version" TEXT;
ALTER TABLE "obd_live_data" ADD COLUMN IF NOT EXISTS "signal_strength" INTEGER;

CREATE TABLE IF NOT EXISTS "obd_raw_backup" (
    "id" TEXT NOT NULL,
    "vehicle_id" TEXT NOT NULL,
    "raw_payload" JSONB NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'android',
    "processed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "obd_raw_backup_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "gps_locations" (
    "vehicle_id" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "altitude" DOUBLE PRECISION,
    "accuracy" DOUBLE PRECISION,
    "heading" DOUBLE PRECISION,
    "speed" DOUBLE PRECISION,
    "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "gps_locations_pkey" PRIMARY KEY ("vehicle_id")
);

CREATE INDEX IF NOT EXISTS "obd_raw_backup_vehicle_id_created_at_idx" ON "obd_raw_backup"("vehicle_id", "created_at");

ALTER TABLE "obd_raw_backup" DROP CONSTRAINT IF EXISTS "obd_raw_backup_vehicle_id_fkey";
ALTER TABLE "obd_raw_backup" ADD CONSTRAINT "obd_raw_backup_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "gps_locations" DROP CONSTRAINT IF EXISTS "gps_locations_vehicle_id_fkey";
ALTER TABLE "gps_locations" ADD CONSTRAINT "gps_locations_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
