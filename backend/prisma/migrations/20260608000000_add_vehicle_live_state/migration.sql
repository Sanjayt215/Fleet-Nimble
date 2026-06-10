-- CreateEnum for TelemetrySource (use IF NOT EXISTS to handle duplicate)
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'TelemetrySource') THEN
        CREATE TYPE "TelemetrySource" AS ENUM ('SIMULATED', 'REAL');
    END IF;
END $$;

-- CreateEnum for VehicleStatus (use IF NOT EXISTS to handle duplicate)
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'VehicleStatus') THEN
        CREATE TYPE "VehicleStatus" AS ENUM ('PARKED', 'IDLING', 'MOVING', 'OFFLINE');
    END IF;
END $$;

-- CreateEnum for DeviceType
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'DeviceType') THEN
        CREATE TYPE "DeviceType" AS ENUM ('MOBILE_APP', 'OBD_GATEWAY', 'CAN_LOGGER');
    END IF;
END $$;

-- CreateEnum for DeviceStatus
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'DeviceStatus') THEN
        CREATE TYPE "DeviceStatus" AS ENUM ('PROVISIONED', 'ACTIVE', 'REVOKED');
    END IF;
END $$;

-- CreateEnum for BehaviorEventType
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'BehaviorEventType') THEN
        CREATE TYPE "BehaviorEventType" AS ENUM ('HARSH_BRAKE', 'HARSH_ACCEL', 'IDLE', 'SPEEDING', 'GEOFENCE_ENTER', 'GEOFENCE_EXIT');
    END IF;
END $$;

-- CreateEnum for DtcStatus
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'DtcStatus') THEN
        CREATE TYPE "DtcStatus" AS ENUM ('CONFIRMED', 'PENDING');
    END IF;
END $$;

-- CreateTable Company
CREATE TABLE IF NOT EXISTS "companies" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "plan" TEXT NOT NULL DEFAULT 'standard',
    "settings" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- Add company_id to users table
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "company_id" TEXT;

-- Add company_id to vehicles table
ALTER TABLE "vehicles" ADD COLUMN IF NOT EXISTS "company_id" TEXT;

-- Add missing fields to vehicles table
ALTER TABLE "vehicles" ADD COLUMN IF NOT EXISTS "mil_on" BOOLEAN;
ALTER TABLE "vehicles" ADD COLUMN IF NOT EXISTS "readiness_monitors" JSONB;
ALTER TABLE "vehicles" ADD COLUMN IF NOT EXISTS "engine_hours_obd" DOUBLE PRECISION;
ALTER TABLE "vehicles" ADD COLUMN IF NOT EXISTS "last_obd_at" TIMESTAMP(3);
ALTER TABLE "vehicles" ADD COLUMN IF NOT EXISTS "telemetry_online" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable VehicleLiveState
CREATE TABLE IF NOT EXISTS "vehicle_live_state" (
    "id" TEXT NOT NULL,
    "vehicle_id" TEXT NOT NULL,
    "telemetry_source" "TelemetrySource" NOT NULL DEFAULT 'SIMULATED',
    "last_update" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rpm" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "speed" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "coolant_temp" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "battery_voltage" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "fuel_level" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "engine_load" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "maf" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "throttle_position" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "intake_temp" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "engine_hours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "odometer" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "gps_lat" DOUBLE PRECISION,
    "gps_lng" DOUBLE PRECISION,
    "ignition_status" BOOLEAN NOT NULL DEFAULT false,
    "vehicle_status" "VehicleStatus" NOT NULL DEFAULT 'PARKED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "vehicle_live_state_pkey" PRIMARY KEY ("id")
);

-- CreateTable TelematicsDevice
CREATE TABLE IF NOT EXISTS "telematics_devices" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "vehicle_id" TEXT,
    "device_uid" TEXT NOT NULL,
    "mqtt_client_id" TEXT NOT NULL,
    "device_secret_hash" TEXT NOT NULL,
    "device_type" "DeviceType" NOT NULL DEFAULT 'MOBILE_APP',
    "status" "DeviceStatus" NOT NULL DEFAULT 'PROVISIONED',
    "firmware_version" TEXT,
    "last_seen_at" TIMESTAMP(3),
    "last_heartbeat_at" TIMESTAMP(3),
    "provisioned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "telematics_devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable MqttDeadLetter
CREATE TABLE IF NOT EXISTS "mqtt_dead_letters" (
    "id" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "error" TEXT NOT NULL,
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "max_retries" INTEGER NOT NULL DEFAULT 5,
    "next_retry_at" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "mqtt_dead_letters_pkey" PRIMARY KEY ("id")
);

-- CreateTable DriverBehaviorEvent
CREATE TABLE IF NOT EXISTS "driver_behavior_events" (
    "id" TEXT NOT NULL,
    "vehicle_id" TEXT NOT NULL,
    "event_type" "BehaviorEventType" NOT NULL,
    "severity" "AlertSeverity" NOT NULL DEFAULT 'MEDIUM',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "driver_behavior_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable Geofence
CREATE TABLE IF NOT EXISTS "geofences" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "geometry" JSONB NOT NULL,
    "alert_on_enter" BOOLEAN NOT NULL DEFAULT true,
    "alert_on_exit" BOOLEAN NOT NULL DEFAULT true,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "geofences_pkey" PRIMARY KEY ("id")
);

-- CreateTable GeofenceEvent
CREATE TABLE IF NOT EXISTS "geofence_events" (
    "id" TEXT NOT NULL,
    "geofence_id" TEXT NOT NULL,
    "vehicle_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "geofence_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable TelemetryDedup
CREATE TABLE IF NOT EXISTS "telemetry_dedup" (
    "message_id" TEXT NOT NULL,
    "vehicle_id" TEXT NOT NULL,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "telemetry_dedup_pkey" PRIMARY KEY ("message_id")
);

-- CreateTable ObdRawBackup
CREATE TABLE IF NOT EXISTS "obd_raw_backup" (
    "id" TEXT NOT NULL,
    "vehicle_id" TEXT NOT NULL,
    "raw_payload" JSONB NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'android',
    "processed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "obd_raw_backup_pkey" PRIMARY KEY ("id")
);

-- CreateTable GpsLocation
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

-- CreateTable FuelHistory
CREATE TABLE IF NOT EXISTS "fuel_history" (
    "id" TEXT NOT NULL,
    "vehicle_id" TEXT NOT NULL,
    "fuel_before" DOUBLE PRECISION NOT NULL,
    "fuel_after" DOUBLE PRECISION NOT NULL,
    "liters_added" DOUBLE PRECISION,
    "event_type" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'SYSTEM',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "fuel_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "companies_slug_key" ON "companies"("slug");

CREATE UNIQUE INDEX IF NOT EXISTS "vehicle_live_state_vehicle_id_key" ON "vehicle_live_state"("vehicle_id");
CREATE INDEX IF NOT EXISTS "vehicle_live_state_telemetry_source_idx" ON "vehicle_live_state"("telemetry_source");
CREATE INDEX IF NOT EXISTS "vehicle_live_state_vehicle_status_idx" ON "vehicle_live_state"("vehicle_status");

CREATE UNIQUE INDEX IF NOT EXISTS "telematics_devices_device_uid_key" ON "telematics_devices"("device_uid");
CREATE UNIQUE INDEX IF NOT EXISTS "telematics_devices_mqtt_client_id_key" ON "telematics_devices"("mqtt_client_id");
CREATE UNIQUE INDEX IF NOT EXISTS "telematics_devices_vehicle_id_key" ON "telematics_devices"("vehicle_id");
CREATE INDEX IF NOT EXISTS "telematics_devices_company_id_status_idx" ON "telematics_devices"("company_id", "status");
CREATE INDEX IF NOT EXISTS "telematics_devices_last_heartbeat_at_idx" ON "telematics_devices"("last_heartbeat_at");

CREATE INDEX IF NOT EXISTS "mqtt_dead_letters_status_next_retry_at_idx" ON "mqtt_dead_letters"("status", "next_retry_at");

CREATE INDEX IF NOT EXISTS "driver_behavior_events_vehicle_id_recorded_at_idx" ON "driver_behavior_events"("vehicle_id", "recorded_at" DESC);

CREATE INDEX IF NOT EXISTS "geofences_company_id_active_idx" ON "geofences"("company_id", "active");
CREATE INDEX IF NOT EXISTS "geofence_events_vehicle_id_recorded_at_idx" ON "geofence_events"("vehicle_id", "recorded_at" DESC);

CREATE INDEX IF NOT EXISTS "telemetry_dedup_expires_at_idx" ON "telemetry_dedup"("expires_at");

CREATE INDEX IF NOT EXISTS "obd_raw_backup_vehicle_id_created_at_idx" ON "obd_raw_backup"("vehicle_id", "created_at");

CREATE INDEX IF NOT EXISTS "fuel_history_vehicle_id_timestamp_idx" ON "fuel_history"("vehicle_id", "timestamp" DESC);
CREATE INDEX IF NOT EXISTS "fuel_history_event_type_idx" ON "fuel_history"("event_type");
CREATE INDEX IF NOT EXISTS "fuel_history_timestamp_idx" ON "fuel_history"("timestamp");

CREATE INDEX IF NOT EXISTS "users_company_id_idx" ON "users"("company_id");
CREATE INDEX IF NOT EXISTS "vehicles_company_id_idx" ON "vehicles"("company_id");
CREATE INDEX IF NOT EXISTS "vehicles_telemetry_online_last_obd_at_idx" ON "vehicles"("telemetry_online", "last_obd_at");

-- AddForeignKey
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'users_company_id_fkey'
    ) THEN
        ALTER TABLE "users" ADD CONSTRAINT "users_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'vehicles_company_id_fkey'
    ) THEN
        ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'vehicle_live_state_vehicle_id_fkey'
    ) THEN
        ALTER TABLE "vehicle_live_state" ADD CONSTRAINT "vehicle_live_state_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'telematics_devices_company_id_fkey'
    ) THEN
        ALTER TABLE "telematics_devices" ADD CONSTRAINT "telematics_devices_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'telematics_devices_vehicle_id_fkey'
    ) THEN
        ALTER TABLE "telematics_devices" ADD CONSTRAINT "telematics_devices_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'driver_behavior_events_vehicle_id_fkey'
    ) THEN
        ALTER TABLE "driver_behavior_events" ADD CONSTRAINT "driver_behavior_events_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'geofences_company_id_fkey'
    ) THEN
        ALTER TABLE "geofences" ADD CONSTRAINT "geofences_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'geofence_events_geofence_id_fkey'
    ) THEN
        ALTER TABLE "geofence_events" ADD CONSTRAINT "geofence_events_geofence_id_fkey" FOREIGN KEY ("geofence_id") REFERENCES "geofences"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'geofence_events_vehicle_id_fkey'
    ) THEN
        ALTER TABLE "geofence_events" ADD CONSTRAINT "geofence_events_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'obd_raw_backup_vehicle_id_fkey'
    ) THEN
        ALTER TABLE "obd_raw_backup" ADD CONSTRAINT "obd_raw_backup_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'gps_locations_vehicle_id_fkey'
    ) THEN
        ALTER TABLE "gps_locations" ADD CONSTRAINT "gps_locations_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fuel_history_vehicle_id_fkey'
    ) THEN
        ALTER TABLE "fuel_history" ADD CONSTRAINT "fuel_history_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
