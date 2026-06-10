-- AlterTable: device heartbeat tracking
ALTER TABLE "telematics_devices" ADD COLUMN IF NOT EXISTS "last_heartbeat_at" TIMESTAMP(3);

-- CreateTable: MQTT dead-letter queue
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

CREATE INDEX IF NOT EXISTS "mqtt_dead_letters_status_next_retry_at_idx"
  ON "mqtt_dead_letters"("status", "next_retry_at");

CREATE INDEX IF NOT EXISTS "telematics_devices_last_heartbeat_at_idx"
  ON "telematics_devices"("last_heartbeat_at");

CREATE INDEX IF NOT EXISTS "vehicles_telemetry_online_company_id_idx"
  ON "vehicles"("telemetry_online", "company_id");
