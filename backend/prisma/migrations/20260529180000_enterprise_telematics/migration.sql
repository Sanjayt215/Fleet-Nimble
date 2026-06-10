-- CreateEnum
CREATE TYPE "DeviceType" AS ENUM ('MOBILE_APP', 'OBD_GATEWAY', 'CAN_LOGGER');
CREATE TYPE "DeviceStatus" AS ENUM ('PROVISIONED', 'ACTIVE', 'REVOKED');
CREATE TYPE "BehaviorEventType" AS ENUM ('HARSH_BRAKE', 'HARSH_ACCEL', 'IDLE', 'SPEEDING', 'GEOFENCE_ENTER', 'GEOFENCE_EXIT');

-- CreateTable
CREATE TABLE "companies" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "plan" TEXT NOT NULL DEFAULT 'standard',
    "settings" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "telematics_devices" (
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
    "provisioned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "telematics_devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "driver_behavior_events" (
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

-- CreateTable
CREATE TABLE "geofences" (
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

-- CreateTable
CREATE TABLE "geofence_events" (
    "id" TEXT NOT NULL,
    "geofence_id" TEXT NOT NULL,
    "vehicle_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "geofence_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "telemetry_dedup" (
    "message_id" TEXT NOT NULL,
    "vehicle_id" TEXT NOT NULL,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "telemetry_dedup_pkey" PRIMARY KEY ("message_id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "company_id" TEXT,
    "user_id" TEXT,
    "action" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "metadata" JSONB,
    "ip_address" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "users" ADD COLUMN "company_id" TEXT;
ALTER TABLE "vehicles" ADD COLUMN "company_id" TEXT;

-- Seed default company
INSERT INTO "companies" ("id", "name", "slug", "updated_at")
VALUES ('00000000-0000-0000-0000-000000000010', 'Default Fleet', 'default', CURRENT_TIMESTAMP)
ON CONFLICT DO NOTHING;

UPDATE "users" SET "company_id" = '00000000-0000-0000-0000-000000000010' WHERE "company_id" IS NULL;
UPDATE "vehicles" SET "company_id" = '00000000-0000-0000-0000-000000000010' WHERE "company_id" IS NULL;

-- CreateIndex
CREATE UNIQUE INDEX "companies_slug_key" ON "companies"("slug");
CREATE UNIQUE INDEX "telematics_devices_vehicle_id_key" ON "telematics_devices"("vehicle_id");
CREATE UNIQUE INDEX "telematics_devices_device_uid_key" ON "telematics_devices"("device_uid");
CREATE UNIQUE INDEX "telematics_devices_mqtt_client_id_key" ON "telematics_devices"("mqtt_client_id");
CREATE INDEX "telematics_devices_company_id_status_idx" ON "telematics_devices"("company_id", "status");
CREATE INDEX "driver_behavior_events_vehicle_id_recorded_at_idx" ON "driver_behavior_events"("vehicle_id", "recorded_at" DESC);
CREATE INDEX "geofences_company_id_active_idx" ON "geofences"("company_id", "active");
CREATE INDEX "geofence_events_vehicle_id_recorded_at_idx" ON "geofence_events"("vehicle_id", "recorded_at" DESC);
CREATE INDEX "telemetry_dedup_expires_at_idx" ON "telemetry_dedup"("expires_at");
CREATE INDEX "audit_logs_company_id_created_at_idx" ON "audit_logs"("company_id", "created_at" DESC);
CREATE INDEX "users_company_id_idx" ON "users"("company_id");
CREATE INDEX "vehicles_company_id_idx" ON "vehicles"("company_id");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "telematics_devices" ADD CONSTRAINT "telematics_devices_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "telematics_devices" ADD CONSTRAINT "telematics_devices_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "driver_behavior_events" ADD CONSTRAINT "driver_behavior_events_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "geofences" ADD CONSTRAINT "geofences_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "geofence_events" ADD CONSTRAINT "geofence_events_geofence_id_fkey" FOREIGN KEY ("geofence_id") REFERENCES "geofences"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "geofence_events" ADD CONSTRAINT "geofence_events_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
