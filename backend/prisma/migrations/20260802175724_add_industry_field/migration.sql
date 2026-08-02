-- DropIndex
DROP INDEX "ai_receptionist_audit_logs_event_type_idx";

-- AlterTable
ALTER TABLE "ai_receptionist_appointments" ADD COLUMN     "industry" TEXT,
ADD COLUMN     "timezone" TEXT DEFAULT 'UTC';

-- AlterTable
ALTER TABLE "receptionist_customers" ADD COLUMN     "industry" TEXT;

-- CreateTable
CREATE TABLE "conversation_timeline_events" (
    "id" TEXT NOT NULL,
    "call_id" TEXT NOT NULL,
    "call_sid" TEXT,
    "user_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "data" JSONB NOT NULL DEFAULT '{}',
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversation_timeline_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversation_summaries" (
    "id" TEXT NOT NULL,
    "call_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "customer_id" TEXT,
    "executive_summary" TEXT NOT NULL DEFAULT '',
    "sales_summary" TEXT NOT NULL DEFAULT '',
    "support_summary" TEXT NOT NULL DEFAULT '',
    "sentiment" TEXT NOT NULL DEFAULT 'neutral',
    "customer_intent" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "next_best_action" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversation_summaries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversation_analytics" (
    "id" TEXT NOT NULL,
    "call_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "talk_ratio" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "avg_response_latency_ms" INTEGER NOT NULL DEFAULT 0,
    "interruptions" INTEGER NOT NULL DEFAULT 0,
    "silence_duration_ms" INTEGER NOT NULL DEFAULT 0,
    "knowledge_hits" INTEGER NOT NULL DEFAULT 0,
    "tool_uses" INTEGER NOT NULL DEFAULT 0,
    "conversation_score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "sales_score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "support_score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "breakdown" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversation_analytics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "follow_up_reminders" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "customer_id" TEXT,
    "appointment_id" TEXT,
    "call_id" TEXT,
    "channel" TEXT NOT NULL,
    "subject" TEXT,
    "content" TEXT NOT NULL DEFAULT '',
    "due_at" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "follow_up_reminders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fleet_brain_memory_items" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "company_id" TEXT,
    "customer_id" TEXT,
    "scope" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL DEFAULT '{}',
    "ttl_sec" INTEGER,
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fleet_brain_memory_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fleet_brain_workflow_runs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "company_id" TEXT,
    "workflow_type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "trigger" TEXT NOT NULL DEFAULT 'manual',
    "call_id" TEXT,
    "steps" JSONB NOT NULL DEFAULT '[]',
    "current_step" TEXT,
    "result" JSONB NOT NULL DEFAULT '{}',
    "error" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),

    CONSTRAINT "fleet_brain_workflow_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fleet_brain_learnings" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "company_id" TEXT,
    "call_id" TEXT,
    "learning_type" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "data" JSONB NOT NULL DEFAULT '{}',
    "recommendation" TEXT,
    "applied" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fleet_brain_learnings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fleet_brain_insights" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "company_id" TEXT,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "data" JSONB NOT NULL DEFAULT '{}',
    "period" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fleet_brain_insights_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_runs" (
    "id" TEXT NOT NULL,
    "call_id" TEXT,
    "call_sid" TEXT,
    "user_id" TEXT,
    "run_id" TEXT NOT NULL,
    "utterance" TEXT,
    "intent" TEXT,
    "fsm_state" TEXT,
    "mode" TEXT NOT NULL DEFAULT 'rules',
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "outcome" JSONB,
    "error" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),

    CONSTRAINT "agent_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_task_logs" (
    "id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "call_id" TEXT,
    "user_id" TEXT,
    "agent" TEXT NOT NULL,
    "task_type" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION,
    "cost_ms" INTEGER,
    "llm_tokens" INTEGER,
    "db_queries" INTEGER,
    "cache_hits" INTEGER,
    "retries" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_task_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "conversation_timeline_events_call_id_at_idx" ON "conversation_timeline_events"("call_id", "at");

-- CreateIndex
CREATE INDEX "conversation_timeline_events_user_id_at_idx" ON "conversation_timeline_events"("user_id", "at");

-- CreateIndex
CREATE UNIQUE INDEX "conversation_summaries_call_id_key" ON "conversation_summaries"("call_id");

-- CreateIndex
CREATE INDEX "conversation_summaries_user_id_created_at_idx" ON "conversation_summaries"("user_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "conversation_analytics_call_id_key" ON "conversation_analytics"("call_id");

-- CreateIndex
CREATE INDEX "conversation_analytics_user_id_idx" ON "conversation_analytics"("user_id");

-- CreateIndex
CREATE INDEX "follow_up_reminders_user_id_status_idx" ON "follow_up_reminders"("user_id", "status");

-- CreateIndex
CREATE INDEX "follow_up_reminders_customer_id_idx" ON "follow_up_reminders"("customer_id");

-- CreateIndex
CREATE INDEX "follow_up_reminders_due_at_idx" ON "follow_up_reminders"("due_at");

-- CreateIndex
CREATE INDEX "fleet_brain_memory_items_user_id_scope_idx" ON "fleet_brain_memory_items"("user_id", "scope");

-- CreateIndex
CREATE INDEX "fleet_brain_memory_items_expires_at_idx" ON "fleet_brain_memory_items"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "fleet_brain_memory_items_user_id_scope_key_key" ON "fleet_brain_memory_items"("user_id", "scope", "key");

-- CreateIndex
CREATE INDEX "fleet_brain_workflow_runs_user_id_started_at_idx" ON "fleet_brain_workflow_runs"("user_id", "started_at" DESC);

-- CreateIndex
CREATE INDEX "fleet_brain_workflow_runs_status_started_at_idx" ON "fleet_brain_workflow_runs"("status", "started_at");

-- CreateIndex
CREATE INDEX "fleet_brain_learnings_user_id_created_at_idx" ON "fleet_brain_learnings"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "fleet_brain_learnings_learning_type_idx" ON "fleet_brain_learnings"("learning_type");

-- CreateIndex
CREATE INDEX "fleet_brain_insights_user_id_type_created_at_idx" ON "fleet_brain_insights"("user_id", "type", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "agent_runs_run_id_key" ON "agent_runs"("run_id");

-- CreateIndex
CREATE INDEX "agent_runs_call_id_started_at_idx" ON "agent_runs"("call_id", "started_at");

-- CreateIndex
CREATE INDEX "agent_runs_status_started_at_idx" ON "agent_runs"("status", "started_at");

-- CreateIndex
CREATE INDEX "agent_runs_user_id_idx" ON "agent_runs"("user_id");

-- CreateIndex
CREATE INDEX "agent_task_logs_call_id_idx" ON "agent_task_logs"("call_id");

-- CreateIndex
CREATE INDEX "agent_task_logs_agent_at_idx" ON "agent_task_logs"("agent", "at");

-- CreateIndex
CREATE INDEX "agent_task_logs_run_id_idx" ON "agent_task_logs"("run_id");

-- CreateIndex
CREATE INDEX "ai_receptionist_audit_logs_event_type_idx" ON "ai_receptionist_audit_logs"("event_type");

-- AddForeignKey
ALTER TABLE "conversation_timeline_events" ADD CONSTRAINT "conversation_timeline_events_call_id_fkey" FOREIGN KEY ("call_id") REFERENCES "ai_receptionist_calls"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_timeline_events" ADD CONSTRAINT "conversation_timeline_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_summaries" ADD CONSTRAINT "conversation_summaries_call_id_fkey" FOREIGN KEY ("call_id") REFERENCES "ai_receptionist_calls"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_summaries" ADD CONSTRAINT "conversation_summaries_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "receptionist_customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_summaries" ADD CONSTRAINT "conversation_summaries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_analytics" ADD CONSTRAINT "conversation_analytics_call_id_fkey" FOREIGN KEY ("call_id") REFERENCES "ai_receptionist_calls"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_analytics" ADD CONSTRAINT "conversation_analytics_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "follow_up_reminders" ADD CONSTRAINT "follow_up_reminders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "follow_up_reminders" ADD CONSTRAINT "follow_up_reminders_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "receptionist_customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "follow_up_reminders" ADD CONSTRAINT "follow_up_reminders_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "ai_receptionist_appointments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "follow_up_reminders" ADD CONSTRAINT "follow_up_reminders_call_id_fkey" FOREIGN KEY ("call_id") REFERENCES "ai_receptionist_calls"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fleet_brain_memory_items" ADD CONSTRAINT "fleet_brain_memory_items_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fleet_brain_memory_items" ADD CONSTRAINT "fleet_brain_memory_items_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "receptionist_customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fleet_brain_workflow_runs" ADD CONSTRAINT "fleet_brain_workflow_runs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fleet_brain_learnings" ADD CONSTRAINT "fleet_brain_learnings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fleet_brain_insights" ADD CONSTRAINT "fleet_brain_insights_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_task_logs" ADD CONSTRAINT "agent_task_logs_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "agent_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
