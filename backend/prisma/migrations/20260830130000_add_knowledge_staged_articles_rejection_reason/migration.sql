-- Add rejectionReason column to knowledge_staged_articles
-- This column was missing from the original knowledge sync migration

ALTER TABLE "knowledge_staged_articles" ADD COLUMN IF NOT EXISTS "rejection_reason" TEXT;
