-- Add company_id to knowledge_staged_articles
-- This was missing from the original knowledge sync migration
-- and is required for tenant scoping

ALTER TABLE "knowledge_staged_articles" ADD COLUMN IF NOT EXISTS "company_id" TEXT;

-- Add index for company_id
CREATE INDEX IF NOT EXISTS "knowledge_staged_articles_company_id_idx" ON "knowledge_staged_articles"("company_id");
