-- CreateEnum
CREATE TYPE "TelemetryMode" AS ENUM ('DEMO', 'LIVE');

-- DropIndex
DROP INDEX "vehicle_live_state_telemetry_source_idx";

-- DropIndex
DROP INDEX "vehicles_telemetry_online_company_id_idx";

-- AlterTable
ALTER TABLE "vehicles" ADD COLUMN     "bodyClass" TEXT,
ADD COLUMN     "engineModel" TEXT,
ADD COLUMN     "fuelType" TEXT,
ADD COLUMN     "gps_last_at" TIMESTAMP(3),
ADD COLUMN     "gps_last_latitude" DOUBLE PRECISION,
ADD COLUMN     "gps_last_longitude" DOUBLE PRECISION,
ADD COLUMN     "last_telemetry_at" TIMESTAMP(3),
ADD COLUMN     "manufacturer" TEXT,
ADD COLUMN     "registration_number" TEXT,
ADD COLUMN     "status" "VehicleStatus" NOT NULL DEFAULT 'OFFLINE',
ADD COLUMN     "vehicle_name" TEXT;

-- CreateTable
CREATE TABLE "obd_devices" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "vehicle_id" TEXT,
    "deviceName" TEXT,
    "bluetoothAddress" TEXT,
    "status" "DeviceStatus" NOT NULL DEFAULT 'PROVISIONED',
    "last_connected_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "obd_devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "telemetries" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "vehicle_id" TEXT NOT NULL,
    "obd_device_id" TEXT,
    "mode" "TelemetryMode" NOT NULL DEFAULT 'LIVE',
    "rpm" DOUBLE PRECISION,
    "speed" DOUBLE PRECISION,
    "fuel_level" DOUBLE PRECISION,
    "coolant_temp" DOUBLE PRECISION,
    "battery_voltage" DOUBLE PRECISION,
    "engine_load" DOUBLE PRECISION,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "gps_accuracy" DOUBLE PRECISION,
    "gps_altitude" DOUBLE PRECISION,
    "gps_heading" DOUBLE PRECISION,
    "gps_timestamp" TIMESTAMP(3),
    "vin" TEXT,
    "odometer" DOUBLE PRECISION,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "telemetries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "obd_devices_user_id_idx" ON "obd_devices"("user_id");

-- CreateIndex
CREATE INDEX "obd_devices_vehicle_id_idx" ON "obd_devices"("vehicle_id");

-- CreateIndex
CREATE UNIQUE INDEX "obd_devices_user_id_bluetoothAddress_key" ON "obd_devices"("user_id", "bluetoothAddress");

-- CreateIndex
CREATE INDEX "telemetries_user_id_idx" ON "telemetries"("user_id");

-- CreateIndex
CREATE INDEX "telemetries_vehicle_id_idx" ON "telemetries"("vehicle_id");

-- CreateIndex
CREATE INDEX "telemetries_mode_idx" ON "telemetries"("mode");

-- CreateIndex
CREATE INDEX "telemetries_timestamp_idx" ON "telemetries"("timestamp" DESC);

-- CreateIndex
CREATE INDEX "alerts_vehicle_id_read_idx" ON "alerts"("vehicle_id", "read");

-- CreateIndex
CREATE INDEX "device_tokens_user_id_idx" ON "device_tokens"("user_id");

-- CreateIndex
CREATE INDEX "driver_scores_vehicle_id_period_start_idx" ON "driver_scores"("vehicle_id", "period_start");

-- CreateIndex
CREATE INDEX "dtc_codes_vehicle_id_active_idx" ON "dtc_codes"("vehicle_id", "active");

-- CreateIndex
CREATE INDEX "dtc_codes_code_idx" ON "dtc_codes"("code");

-- CreateIndex
CREATE INDEX "ecu_sessions_vehicle_id_started_at_idx" ON "ecu_sessions"("vehicle_id", "started_at");

-- CreateIndex
CREATE INDEX "fuel_logs_vehicle_id_created_at_idx" ON "fuel_logs"("vehicle_id", "created_at");

-- CreateIndex
CREATE INDEX "gps_history_trip_id_timestamp_idx" ON "gps_history"("trip_id", "timestamp");

-- CreateIndex
CREATE INDEX "maintenance_logs_vehicle_id_completed_idx" ON "maintenance_logs"("vehicle_id", "completed");

-- CreateIndex
CREATE INDEX "notifications_user_id_read_idx" ON "notifications"("user_id", "read");

-- CreateIndex
CREATE INDEX "obd_live_data_vehicle_id_recorded_at_idx" ON "obd_live_data"("vehicle_id", "recorded_at" DESC);

-- CreateIndex
CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens"("user_id");

-- CreateIndex
CREATE INDEX "reports_vehicle_id_report_type_idx" ON "reports"("vehicle_id", "report_type");

-- CreateIndex
CREATE INDEX "service_history_vehicle_id_performed_at_idx" ON "service_history"("vehicle_id", "performed_at");

-- CreateIndex
CREATE INDEX "trip_logs_vehicle_id_start_time_idx" ON "trip_logs"("vehicle_id", "start_time");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_role_id_idx" ON "users"("role_id");

-- CreateIndex
CREATE INDEX "vehicle_connections_vehicle_id_idx" ON "vehicle_connections"("vehicle_id");

-- CreateIndex
CREATE INDEX "vehicles_user_id_idx" ON "vehicles"("user_id");

-- CreateIndex
CREATE INDEX "vehicles_vin_idx" ON "vehicles"("vin");

-- CreateIndex
CREATE INDEX "work_orders_vehicle_id_status_idx" ON "work_orders"("vehicle_id", "status");

-- AddForeignKey
ALTER TABLE "obd_devices" ADD CONSTRAINT "obd_devices_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "obd_devices" ADD CONSTRAINT "obd_devices_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "telemetries" ADD CONSTRAINT "telemetries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "telemetries" ADD CONSTRAINT "telemetries_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "telemetries" ADD CONSTRAINT "telemetries_obd_device_id_fkey" FOREIGN KEY ("obd_device_id") REFERENCES "obd_devices"("id") ON DELETE SET NULL ON UPDATE CASCADE;
