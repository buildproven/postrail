-- Migration: Make scheduled_time nullable for draft posts
-- Date: 2025-11-16
-- Reason: Draft posts don't have a scheduled time yet, only scheduled/published posts do

-- Make scheduled_time nullable
ALTER TABLE public.social_posts
ALTER COLUMN scheduled_time DROP NOT NULL;

-- Verify the change
SELECT
  column_name,
  is_nullable,
  data_type
FROM information_schema.columns
WHERE table_name = 'social_posts'
AND column_name = 'scheduled_time';
