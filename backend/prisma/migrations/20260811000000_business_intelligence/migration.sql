-- CreateTable
CREATE TABLE "business_profiles" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "company_id" TEXT,
    "business_name" TEXT NOT NULL,
    "website" TEXT,
    "industry" TEXT,
    "description" TEXT,
    "products" JSONB NOT NULL DEFAULT '[]',
    "services" JSONB NOT NULL DEFAULT '[]',
    "locations" JSONB NOT NULL DEFAULT '[]',
    "businessHours" JSONB NOT NULL DEFAULT '{}',
    "contact" JSONB NOT NULL DEFAULT '{}',
    "pricing" JSONB NOT NULL DEFAULT '{}',
    "faqs" JSONB NOT NULL DEFAULT '[]',
    "policies" JSONB NOT NULL DEFAULT '{}',
    "bookingRules" JSONB NOT NULL DEFAULT '{}',
    "leadQualificationRules" JSONB NOT NULL DEFAULT '{}',
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "business_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_configs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "company_id" TEXT,
    "agent_name" TEXT NOT NULL DEFAULT 'FleetNimble AI Receptionist',
    "voice_id" TEXT DEFAULT 'Puck',
    "language" TEXT NOT NULL DEFAULT 'en',
    "tone" TEXT NOT NULL DEFAULT 'professional',
    "personality" TEXT NOT NULL DEFAULT 'Warm, professional, concise and helpful',
    "greeting_message" TEXT NOT NULL,
    "business_context" TEXT,
    "knowledge_source_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "primary_goal" TEXT NOT NULL DEFAULT 'Answer caller questions accurately and book qualified demos',
    "secondary_goals" JSONB NOT NULL DEFAULT '[]',
    "qualification_questions" JSONB NOT NULL DEFAULT '[]',
    "booking_rules" JSONB NOT NULL DEFAULT '{}',
    "transfer_rules" JSONB NOT NULL DEFAULT '{}',
    "fallback_behavior" JSONB NOT NULL DEFAULT '{}',
    "working_hours" JSONB NOT NULL DEFAULT '{}',
    "phone_number" TEXT,
    "greeting_protected" BOOLEAN NOT NULL DEFAULT true,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "business_knowledge_documents" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "company_id" TEXT,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'General',
    "source_type" TEXT NOT NULL DEFAULT 'manual',
    "source_url" TEXT,
    "content" TEXT NOT NULL,
    "keywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "summary" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.8,
    "version" INTEGER NOT NULL DEFAULT 1,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "business_knowledge_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "business_knowledge_chunks" (
    "id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "chunk_index" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "keywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "business_knowledge_chunks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_interaction_logs" (
    "id" TEXT NOT NULL,
    "call_id" TEXT,
    "call_sid" TEXT,
    "user_id" TEXT,
    "company_id" TEXT,
    "agent_id" TEXT,
    "intent" TEXT,
    "question" TEXT,
    "answer" TEXT,
    "knowledge_sources_used" JSONB NOT NULL DEFAULT '[]',
    "tool_calls" JSONB NOT NULL DEFAULT '[]',
    "tool_results" JSONB NOT NULL DEFAULT '[]',
    "latency_ms" INTEGER,
    "success" BOOLEAN NOT NULL DEFAULT true,
    "handoff" BOOLEAN NOT NULL DEFAULT false,
    "booking" BOOLEAN NOT NULL DEFAULT false,
    "lead_creation" BOOLEAN NOT NULL DEFAULT false,
    "channel" TEXT NOT NULL DEFAULT 'voice',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_interaction_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "business_profiles_user_id_idx" ON "business_profiles"("user_id");

-- CreateIndex
CREATE INDEX "business_profiles_industry_idx" ON "business_profiles"("industry");

-- CreateIndex
CREATE UNIQUE INDEX "business_profiles_company_id_key" ON "business_profiles"("company_id");

-- CreateIndex
CREATE INDEX "agent_configs_user_id_idx" ON "agent_configs"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "agent_configs_company_id_key" ON "agent_configs"("company_id");

-- CreateIndex
CREATE INDEX "business_knowledge_documents_company_id_status_idx" ON "business_knowledge_documents"("company_id", "status");

-- CreateIndex
CREATE INDEX "business_knowledge_documents_category_idx" ON "business_knowledge_documents"("category");

-- CreateIndex
CREATE INDEX "business_knowledge_documents_source_type_idx" ON "business_knowledge_documents"("source_type");

-- CreateIndex
CREATE INDEX "business_knowledge_chunks_document_id_chunk_index_idx" ON "business_knowledge_chunks"("document_id", "chunk_index");

-- CreateIndex
CREATE INDEX "ai_interaction_logs_company_id_created_at_idx" ON "ai_interaction_logs"("company_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "ai_interaction_logs_user_id_created_at_idx" ON "ai_interaction_logs"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "ai_interaction_logs_call_id_idx" ON "ai_interaction_logs"("call_id");

-- CreateIndex
CREATE INDEX "ai_interaction_logs_intent_idx" ON "ai_interaction_logs"("intent");

-- AddForeignKey
ALTER TABLE "business_profiles" ADD CONSTRAINT "business_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_profiles" ADD CONSTRAINT "business_profiles_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_configs" ADD CONSTRAINT "agent_configs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_configs" ADD CONSTRAINT "agent_configs_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_knowledge_documents" ADD CONSTRAINT "business_knowledge_documents_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_knowledge_documents" ADD CONSTRAINT "business_knowledge_documents_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_knowledge_chunks" ADD CONSTRAINT "business_knowledge_chunks_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "business_knowledge_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_interaction_logs" ADD CONSTRAINT "ai_interaction_logs_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_interaction_logs" ADD CONSTRAINT "ai_interaction_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

