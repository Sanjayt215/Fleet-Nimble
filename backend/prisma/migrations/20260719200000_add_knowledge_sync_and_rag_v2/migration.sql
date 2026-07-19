-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- AlterTable
ALTER TABLE "ai_receptionist_configs" ADD COLUMN     "twilio_phone_number" TEXT;

-- DropTable
DROP TABLE IF EXISTS "playing_with_neon";

-- CreateTable
CREATE TABLE "knowledge_sources" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "baseUrl" TEXT,
    "localPath" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "allowedDomains" TEXT[],
    "allowedPaths" TEXT[],
    "blockedPaths" TEXT[],
    "crawlDepth" INTEGER NOT NULL DEFAULT 2,
    "maxPages" INTEGER NOT NULL DEFAULT 50,
    "rateLimitMs" INTEGER NOT NULL DEFAULT 1000,
    "requiresApproval" BOOLEAN NOT NULL DEFAULT true,
    "defaultCategory" TEXT NOT NULL DEFAULT 'Web',
    "defaultMode" TEXT NOT NULL DEFAULT 'both',
    "priority" INTEGER NOT NULL DEFAULT 5,
    "owner" TEXT,
    "schedule" TEXT,
    "lastSyncedAt" TIMESTAMP(3),
    "lastSyncStatus" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "knowledge_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_sync_runs" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "userId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "pagesDiscovered" INTEGER NOT NULL DEFAULT 0,
    "pagesFetched" INTEGER NOT NULL DEFAULT 0,
    "pagesSkipped" INTEGER NOT NULL DEFAULT 0,
    "pagesFailed" INTEGER NOT NULL DEFAULT 0,
    "articlesNew" INTEGER NOT NULL DEFAULT 0,
    "articlesUpdated" INTEGER NOT NULL DEFAULT 0,
    "articlesUnchanged" INTEGER NOT NULL DEFAULT 0,
    "articlesConflicted" INTEGER NOT NULL DEFAULT 0,
    "articlesInvalid" INTEGER NOT NULL DEFAULT 0,
    "articlesUnsafe" INTEGER NOT NULL DEFAULT 0,
    "durationMs" INTEGER,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "knowledge_sync_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_staged_articles" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT,
    "syncRunId" TEXT,
    "userId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DISCOVERED',
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "subcategory" TEXT NOT NULL DEFAULT 'General',
    "keywords" TEXT[],
    "synonyms" TEXT[],
    "mode" TEXT NOT NULL DEFAULT 'both',
    "priority" INTEGER NOT NULL DEFAULT 5,
    "answer" TEXT NOT NULL,
    "details" TEXT,
    "relatedArticles" TEXT[],
    "proactiveSalesTip" TEXT,
    "source" TEXT NOT NULL DEFAULT 'web',
    "sourceUrl" TEXT,
    "sourceType" TEXT NOT NULL DEFAULT 'website',
    "contentHash" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "diffSummary" TEXT,
    "conflictType" TEXT,
    "conflictNotes" TEXT,
    "reviewerNotes" TEXT,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectedById" TEXT,
    "rejectedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "archivedById" TEXT,
    "archivedAt" TIMESTAMP(3),
    "archivedReason" TEXT,
    "lastVerifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "knowledge_staged_articles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_article_versions" (
    "id" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "subcategory" TEXT NOT NULL,
    "keywords" TEXT[],
    "synonyms" TEXT[],
    "mode" TEXT NOT NULL,
    "priority" INTEGER NOT NULL,
    "answer" TEXT NOT NULL,
    "details" TEXT,
    "relatedArticles" TEXT[],
    "proactiveSalesTip" TEXT,
    "source" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "contentHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,

    CONSTRAINT "knowledge_article_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_approval_events" (
    "id" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actorId" TEXT,
    "notes" TEXT,
    "previousStatus" TEXT NOT NULL,
    "newStatus" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "knowledge_approval_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vector_embeddings" (
    "id" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "chunkIndex" INTEGER NOT NULL DEFAULT 0,
    "chunkText" TEXT NOT NULL,
    "embedding" vector(768),
    "embeddingModel" TEXT NOT NULL DEFAULT 'text-embedding-ada-002',
    "embeddingVersion" INTEGER NOT NULL DEFAULT 1,
    "contentHash" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vector_embeddings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "retrieval_metrics" (
    "id" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "retrievedIds" TEXT[],
    "relevantIds" TEXT[],
    "recallAtK" DOUBLE PRECISION,
    "precisionAtK" DOUBLE PRECISION,
    "mrr" DOUBLE PRECISION,
    "latencyMs" INTEGER,
    "searchType" TEXT NOT NULL DEFAULT 'hybrid',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "retrieval_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "failed_embeddings" (
    "id" TEXT NOT NULL,
    "articleId" TEXT,
    "articleTitle" TEXT,
    "error" TEXT NOT NULL,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "lastAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "failed_embeddings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "knowledge_staged_articles_status_idx" ON "knowledge_staged_articles"("status");

-- CreateIndex
CREATE INDEX "knowledge_staged_articles_contentHash_idx" ON "knowledge_staged_articles"("contentHash");

-- CreateIndex
CREATE INDEX "knowledge_article_versions_articleId_version_idx" ON "knowledge_article_versions"("articleId", "version");

-- CreateIndex
CREATE INDEX "knowledge_approval_events_articleId_idx" ON "knowledge_approval_events"("articleId");

-- CreateIndex
CREATE INDEX "vector_embeddings_articleId_idx" ON "vector_embeddings"("articleId");

-- CreateIndex
CREATE INDEX "vector_embeddings_embeddingModel_embeddingVersion_idx" ON "vector_embeddings"("embeddingModel", "embeddingVersion");

-- CreateIndex
CREATE INDEX "retrieval_metrics_createdAt_idx" ON "retrieval_metrics"("createdAt" DESC);

-- CreateIndex
CREATE INDEX "failed_embeddings_articleId_idx" ON "failed_embeddings"("articleId");

-- CreateIndex
CREATE INDEX "failed_embeddings_retryCount_idx" ON "failed_embeddings"("retryCount");

-- CreateIndex
CREATE UNIQUE INDEX "ai_receptionist_configs_twilio_phone_number_key" ON "ai_receptionist_configs"("twilio_phone_number");

-- AddForeignKey
ALTER TABLE "knowledge_sources" ADD CONSTRAINT "knowledge_sources_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_sync_runs" ADD CONSTRAINT "knowledge_sync_runs_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "knowledge_sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_staged_articles" ADD CONSTRAINT "knowledge_staged_articles_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "knowledge_sources"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_staged_articles" ADD CONSTRAINT "knowledge_staged_articles_syncRunId_fkey" FOREIGN KEY ("syncRunId") REFERENCES "knowledge_sync_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_article_versions" ADD CONSTRAINT "knowledge_article_versions_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "knowledge_staged_articles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_approval_events" ADD CONSTRAINT "knowledge_approval_events_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "knowledge_staged_articles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vector_embeddings" ADD CONSTRAINT "vector_embeddings_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "knowledge_staged_articles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
