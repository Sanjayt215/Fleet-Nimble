-- CreateEnum for TelemetrySource
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'TelemetrySource') THEN
        CREATE TYPE "TelemetrySource" AS ENUM ('SIMULATED', 'REAL');
    END IF;
END $$;

-- CreateEnum for VehicleStatus
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'VehicleStatus') THEN
        CREATE TYPE "VehicleStatus" AS ENUM ('PARKED', 'IDLING', 'MOVING', 'OFFLINE');
    END IF;
END $$;

-- CreateTable
CREATE TABLE "vehicle_live_state" (
    "id" TEXT NOT NULL,
    "vehicle_id" TEXT NOT NULL,
    "telemetry_source" "TelemetrySource" NOT NULL DEFAULT 'SIMULATED',
    "last_update" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- Core OBD telemetry
    "rpm" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "speed" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "coolant_temp" DOUBLE PRECISION NOT NULL DEFAULT 32,
    "battery_voltage" DOUBLE PRECISION NOT NULL DEFAULT 12.5,
    "fuel_level" DOUBLE PRECISION NOT NULL DEFAULT 80,
    "engine_load" DOUBLE PRECISION NOT NULL DEFAULT 12,
    "maf" DOUBLE PRECISION NOT NULL DEFAULT 3.1,
    "throttle_position" DOUBLE PRECISION NOT NULL DEFAULT 4,
    "intake_temp" DOUBLE PRECISION NOT NULL DEFAULT 30,

    -- Lifetime metrics
    "engine_hours" DOUBLE PRECISION NOT NULL DEFAULT 1000,
    "odometer" DOUBLE PRECISION NOT NULL DEFAULT 50000,

    -- GPS
    "gps_lat" DOUBLE PRECISION,
    "gps_lng" DOUBLE PRECISION,

    -- Status
    "ignition_status" BOOLEAN NOT NULL DEFAULT false,
    "vehicle_status" "VehicleStatus" NOT NULL DEFAULT 'PARKED',

    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vehicle_live_state_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_live_state_vehicle_id_key" ON "vehicle_live_state"("vehicle_id");

-- CreateIndex
CREATE INDEX "vehicle_live_state_vehicle_id_idx" ON "vehicle_live_state"("vehicle_id");

-- CreateIndex
CREATE INDEX "vehicle_live_state_last_update_idx" ON "vehicle_live_state"("last_update");

-- CreateIndex
CREATE INDEX "vehicle_live_state_vehicle_status_idx" ON "vehicle_live_state"("vehicle_status");

-- AddForeignKey
ALTER TABLE "vehicle_live_state" ADD CONSTRAINT "vehicle_live_state_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: driver_behavior_events already exists, add sim_generated column
ALTER TABLE "driver_behavior_events" ADD COLUMN IF NOT EXISTS "sim_generated" BOOLEAN NOT NULL DEFAULT false;
