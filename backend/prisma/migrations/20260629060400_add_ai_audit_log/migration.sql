-- CreateTable
CREATE TABLE "ai_audit_logs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "chat_id" TEXT,
    "message_type" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "vehicle_id" TEXT,
    "metadata" JSONB DEFAULT '{}',
    "ip_address" TEXT,
    "user_agent" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_audit_logs_user_id_timestamp_idx" ON "ai_audit_logs"("user_id", "timestamp" DESC);

-- CreateIndex
CREATE INDEX "ai_audit_logs_chat_id_idx" ON "ai_audit_logs"("chat_id");

-- CreateIndex
CREATE INDEX "ai_audit_logs_timestamp_idx" ON "ai_audit_logs"("timestamp");

-- AddForeignKey
ALTER TABLE "ai_audit_logs" ADD CONSTRAINT "ai_audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
