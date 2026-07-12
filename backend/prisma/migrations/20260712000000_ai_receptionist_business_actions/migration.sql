-- CreateEnum
CREATE TYPE "CallType" AS ENUM ('DEMO', 'SUPPORT', 'PRICING', 'ONBOARDING', 'COMPLAINT', 'EMERGENCY', 'GENERAL', 'OTHER');

-- CreateEnum
CREATE TYPE "CallStatus" AS ENUM ('NEW', 'IN_PROGRESS', 'COMPLETED', 'ESCALATED', 'FAILED');

-- CreateEnum
CREATE TYPE "AppointmentStatus" AS ENUM ('SCHEDULED', 'CONFIRMED', 'COMPLETED', 'CANCELLED', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "SupportTicketStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "UrgencyLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "CustomerStatus" AS ENUM ('LEAD', 'PROSPECT', 'CUSTOMER', 'PARTNER', 'ENTERPRISE', 'CHURNED');

-- CreateEnum
CREATE TYPE "SalesStage" AS ENUM ('LEAD', 'QUALIFIED', 'DEMO', 'PROPOSAL', 'NEGOTIATION', 'CLOSED_WON', 'CLOSED_LOST');

-- CreateEnum
CREATE TYPE "NoteType" AS ENUM ('GENERAL', 'CALL', 'MEETING', 'SUPPORT', 'FOLLOW_UP', 'SYSTEM');

-- CreateTable
CREATE TABLE "receptionist_customers" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "company_id" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "name" TEXT NOT NULL,
    "company_name" TEXT,
    "fleet_size" INTEGER,
    "status" "CustomerStatus" NOT NULL DEFAULT 'LEAD',
    "lead_score" INTEGER NOT NULL DEFAULT 0,
    "salesStage" "SalesStage" NOT NULL DEFAULT 'LEAD',
    "lifetime_value" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "total_calls" INTEGER NOT NULL DEFAULT 0,
    "total_appointments" INTEGER NOT NULL DEFAULT 0,
    "total_tickets" INTEGER NOT NULL DEFAULT 0,
    "last_contact_at" TIMESTAMP(3),
    "preferred_time" TEXT,
    "preferred_date" TEXT,
    "last_summary" TEXT,
    "last_intent" TEXT,
    "sentiment_history" JSONB NOT NULL DEFAULT '[]',
    "tags" JSONB NOT NULL DEFAULT '[]',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "receptionist_customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "receptionist_customer_notes" (
    "id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "type" "NoteType" NOT NULL DEFAULT 'GENERAL',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "receptionist_customer_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_receptionist_audit_logs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "ip_address" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_receptionist_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_receptionist_calls" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "company_id" TEXT,
    "customer_id" TEXT,
    "caller_name" TEXT NOT NULL,
    "caller_phone" TEXT,
    "caller_email" TEXT,
    "company_name" TEXT,
    "fleet_size" INTEGER,
    "callType" "CallType" NOT NULL DEFAULT 'OTHER',
    "callStatus" "CallStatus" NOT NULL DEFAULT 'NEW',
    "call_started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "call_ended_at" TIMESTAMP(3),
    "duration_seconds" INTEGER,
    "transcript" TEXT DEFAULT '',
    "summary" TEXT DEFAULT '',
    "sentiment" TEXT DEFAULT 'neutral',
    "actionItems" JSONB NOT NULL DEFAULT '[]',
    "extractedData" JSONB NOT NULL DEFAULT '{}',
    "appointment_id" TEXT,
    "support_ticket_id" TEXT,
    "twilio_call_sid" TEXT,
    "twilio_account_sid" TEXT,
    "twilio_from" TEXT,
    "twilio_to" TEXT,
    "recording_url" TEXT,
    "recording_duration" INTEGER,
    "escalated_at" TIMESTAMP(3),
    "handoff_reason" TEXT,
    "handoff_to" TEXT,
    "detected_language" TEXT DEFAULT 'en',
    "ai_confidence" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_receptionist_calls_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_receptionist_appointments" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "company_id" TEXT,
    "caller_name" TEXT NOT NULL,
    "caller_phone" TEXT,
    "caller_email" TEXT,
    "company_name" TEXT,
    "fleet_size" INTEGER,
    "meeting_title" TEXT NOT NULL DEFAULT 'Scheduled Meeting',
    "meeting_purpose" TEXT,
    "scheduled_date" TIMESTAMP(3) NOT NULL,
    "duration_minutes" INTEGER NOT NULL DEFAULT 30,
    "status" "AppointmentStatus" NOT NULL DEFAULT 'SCHEDULED',
    "calendar_provider" TEXT NOT NULL DEFAULT 'internal',
    "calendar_event_id" TEXT,
    "meeting_link" TEXT,
    "notes" TEXT DEFAULT '',
    "assigned_to" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_receptionist_appointments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_receptionist_support_tickets" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "company_id" TEXT,
    "caller_name" TEXT NOT NULL,
    "caller_phone" TEXT,
    "caller_email" TEXT,
    "company_name" TEXT,
    "issue_title" TEXT NOT NULL,
    "issue_description" TEXT,
    "urgency" "UrgencyLevel" NOT NULL DEFAULT 'MEDIUM',
    "status" "SupportTicketStatus" NOT NULL DEFAULT 'OPEN',
    "assigned_to" TEXT,
    "related_vehicle_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_receptionist_support_tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_receptionist_configs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "company_id" TEXT,
    "business_name" TEXT NOT NULL DEFAULT 'My Business',
    "greeting_message" TEXT NOT NULL DEFAULT 'Hello! Thank you for calling FleetNimble. How can I assist you today?',
    "working_hours" JSONB NOT NULL DEFAULT '{"monday":{"start":"09:00","end":"17:00"},"tuesday":{"start":"09:00","end":"17:00"},"wednesday":{"start":"09:00","end":"17:00"},"thursday":{"start":"09:00","end":"17:00"},"friday":{"start":"09:00","end":"17:00"},"saturday":{"start":null,"end":null},"sunday":{"start":null,"end":null}}',
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "language" TEXT NOT NULL DEFAULT 'en',
    "voice_id" TEXT DEFAULT 'alloy',
    "escalation_phone" TEXT,
    "escalation_email" TEXT,
    "appointment_duration" INTEGER NOT NULL DEFAULT 30,
    "department_routing" JSONB NOT NULL DEFAULT '{"sales":{"enabled":true},"support":{"enabled":true},"technical":{"enabled":true}}',
    "self_service_enabled" BOOLEAN NOT NULL DEFAULT true,
    "max_call_duration" INTEGER NOT NULL DEFAULT 600,
    "holiday_calendar" JSONB NOT NULL DEFAULT '[]',
    "working_days" JSONB NOT NULL DEFAULT '["monday","tuesday","wednesday","thursday","friday"]',
    "after_hours_message" TEXT DEFAULT 'Thank you for calling. Our business hours are Monday to Friday, 9 AM to 5 PM. Please leave a message and we will get back to you.',
    "sales_handoff_number" TEXT,
    "support_handoff_number" TEXT,
    "emergency_handoff_number" TEXT,
    "after_hours_behavior" TEXT NOT NULL DEFAULT 'voicemail',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_receptionist_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_conversation_contexts" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "vehicle_id" TEXT,
    "last_message" TEXT,
    "last_response" TEXT,
    "last_entities" TEXT,
    "last_vehicle_context" TEXT,
    "battery_voltage" DOUBLE PRECISION,
    "coolant_temp" DOUBLE PRECISION,
    "fuel_level" DOUBLE PRECISION,
    "odometer" DOUBLE PRECISION,
    "rpm" DOUBLE PRECISION,
    "speed" DOUBLE PRECISION,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_conversation_contexts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_conversation_summaries" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "chat_id" TEXT,
    "summary" TEXT NOT NULL,
    "key_topics" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_conversation_summaries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_user_preferences" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_user_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "receptionist_customers_phone_key" ON "receptionist_customers"("phone");

-- CreateIndex
CREATE INDEX "receptionist_customers_user_id_idx" ON "receptionist_customers"("user_id");

-- CreateIndex
CREATE INDEX "receptionist_customers_company_id_idx" ON "receptionist_customers"("company_id");

-- CreateIndex
CREATE INDEX "receptionist_customers_status_idx" ON "receptionist_customers"("status");

-- CreateIndex
CREATE INDEX "receptionist_customers_lead_score_idx" ON "receptionist_customers"("lead_score" DESC);

-- CreateIndex
CREATE INDEX "receptionist_customers_phone_idx" ON "receptionist_customers"("phone");

-- CreateIndex
CREATE INDEX "receptionist_customers_email_idx" ON "receptionist_customers"("email");

-- CreateIndex
CREATE INDEX "receptionist_customer_notes_customer_id_created_at_idx" ON "receptionist_customer_notes"("customer_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "ai_receptionist_audit_logs_event_type_idx" ON "ai_receptionist_audit_logs"("event_type");

-- CreateIndex
CREATE INDEX "ai_receptionist_audit_logs_user_id_created_at_idx" ON "ai_receptionist_audit_logs"("user_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "ai_receptionist_calls_twilio_call_sid_key" ON "ai_receptionist_calls"("twilio_call_sid");

-- CreateIndex
CREATE INDEX "ai_receptionist_calls_user_id_idx" ON "ai_receptionist_calls"("user_id");

-- CreateIndex
CREATE INDEX "ai_receptionist_calls_company_id_idx" ON "ai_receptionist_calls"("company_id");

-- CreateIndex
CREATE INDEX "ai_receptionist_calls_callStatus_idx" ON "ai_receptionist_calls"("callStatus");

-- CreateIndex
CREATE INDEX "ai_receptionist_calls_callType_idx" ON "ai_receptionist_calls"("callType");

-- CreateIndex
CREATE INDEX "ai_receptionist_calls_call_started_at_idx" ON "ai_receptionist_calls"("call_started_at" DESC);

-- CreateIndex
CREATE INDEX "ai_receptionist_calls_twilio_call_sid_idx" ON "ai_receptionist_calls"("twilio_call_sid");

-- CreateIndex
CREATE INDEX "ai_receptionist_calls_detected_language_idx" ON "ai_receptionist_calls"("detected_language");

-- CreateIndex
CREATE INDEX "ai_receptionist_calls_ai_confidence_idx" ON "ai_receptionist_calls"("ai_confidence");

-- CreateIndex
CREATE INDEX "ai_receptionist_appointments_user_id_idx" ON "ai_receptionist_appointments"("user_id");

-- CreateIndex
CREATE INDEX "ai_receptionist_appointments_company_id_idx" ON "ai_receptionist_appointments"("company_id");

-- CreateIndex
CREATE INDEX "ai_receptionist_appointments_status_idx" ON "ai_receptionist_appointments"("status");

-- CreateIndex
CREATE INDEX "ai_receptionist_appointments_scheduled_date_idx" ON "ai_receptionist_appointments"("scheduled_date");

-- CreateIndex
CREATE INDEX "ai_receptionist_support_tickets_user_id_idx" ON "ai_receptionist_support_tickets"("user_id");

-- CreateIndex
CREATE INDEX "ai_receptionist_support_tickets_company_id_idx" ON "ai_receptionist_support_tickets"("company_id");

-- CreateIndex
CREATE INDEX "ai_receptionist_support_tickets_status_idx" ON "ai_receptionist_support_tickets"("status");

-- CreateIndex
CREATE INDEX "ai_receptionist_support_tickets_urgency_idx" ON "ai_receptionist_support_tickets"("urgency");

-- CreateIndex
CREATE UNIQUE INDEX "ai_receptionist_configs_user_id_key" ON "ai_receptionist_configs"("user_id");

-- CreateIndex
CREATE INDEX "ai_receptionist_configs_company_id_idx" ON "ai_receptionist_configs"("company_id");

-- CreateIndex
CREATE INDEX "ai_conversation_contexts_user_id_idx" ON "ai_conversation_contexts"("user_id");

-- CreateIndex
CREATE INDEX "ai_conversation_contexts_vehicle_id_idx" ON "ai_conversation_contexts"("vehicle_id");

-- CreateIndex
CREATE INDEX "ai_conversation_contexts_timestamp_idx" ON "ai_conversation_contexts"("timestamp");

-- CreateIndex
CREATE INDEX "ai_conversation_summaries_user_id_idx" ON "ai_conversation_summaries"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "ai_user_preferences_user_id_key_key" ON "ai_user_preferences"("user_id", "key");

-- AddForeignKey
ALTER TABLE "receptionist_customers" ADD CONSTRAINT "receptionist_customers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receptionist_customer_notes" ADD CONSTRAINT "receptionist_customer_notes_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "receptionist_customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receptionist_customer_notes" ADD CONSTRAINT "receptionist_customer_notes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_receptionist_audit_logs" ADD CONSTRAINT "ai_receptionist_audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_receptionist_calls" ADD CONSTRAINT "ai_receptionist_calls_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_receptionist_calls" ADD CONSTRAINT "ai_receptionist_calls_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "receptionist_customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_receptionist_calls" ADD CONSTRAINT "ai_receptionist_calls_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "ai_receptionist_appointments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_receptionist_calls" ADD CONSTRAINT "ai_receptionist_calls_support_ticket_id_fkey" FOREIGN KEY ("support_ticket_id") REFERENCES "ai_receptionist_support_tickets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_receptionist_appointments" ADD CONSTRAINT "ai_receptionist_appointments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_receptionist_support_tickets" ADD CONSTRAINT "ai_receptionist_support_tickets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_receptionist_support_tickets" ADD CONSTRAINT "ai_receptionist_support_tickets_related_vehicle_id_fkey" FOREIGN KEY ("related_vehicle_id") REFERENCES "vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_receptionist_configs" ADD CONSTRAINT "ai_receptionist_configs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_conversation_contexts" ADD CONSTRAINT "ai_conversation_contexts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_conversation_summaries" ADD CONSTRAINT "ai_conversation_summaries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_user_preferences" ADD CONSTRAINT "ai_user_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
