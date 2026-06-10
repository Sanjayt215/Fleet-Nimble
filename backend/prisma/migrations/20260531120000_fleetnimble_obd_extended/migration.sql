-- FleetNimble extended OBD + DTC pending support
CREATE TYPE "DtcStatus" AS ENUM ('CONFIRMED', 'PENDING');

ALTER TABLE "vehicles" ADD COLUMN IF NOT EXISTS "mil_on" BOOLEAN;
ALTER TABLE "vehicles" ADD COLUMN IF NOT EXISTS "readiness_monitors" JSONB;
ALTER TABLE "vehicles" ADD COLUMN IF NOT EXISTS "engine_hours_obd" DOUBLE PRECISION;

ALTER TABLE "dtc_codes" ADD COLUMN IF NOT EXISTS "status" "DtcStatus" NOT NULL DEFAULT 'CONFIRMED';
