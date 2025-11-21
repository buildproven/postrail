-- Migration: Add unique constraint to prevent duplicate social posts
-- Date: 2025-11-20
-- Reason: Prevent duplicate post generation when users retry failed operations
-- Finding: AI post generation is non-idempotent and can create duplicate posts

-- Step 1: Check for existing duplicates before adding constraint
-- (This query will help identify any existing duplicates)
SELECT
  newsletter_id,
  platform,
  post_type,
  COUNT(*) as duplicate_count
FROM public.social_posts
GROUP BY newsletter_id, platform, post_type
HAVING COUNT(*) > 1
ORDER BY newsletter_id, platform, post_type;

-- Step 2: Remove duplicates if any exist (keeps the earliest created record)
-- WARNING: This will delete duplicate records. Run the query above first to review.
-- If duplicates exist, uncomment and run:
/*
DELETE FROM public.social_posts
WHERE id NOT IN (
  SELECT MIN(id)
  FROM public.social_posts
  GROUP BY newsletter_id, platform, post_type
);
*/

-- Step 3: Add unique constraint to prevent future duplicates
ALTER TABLE public.social_posts
ADD CONSTRAINT social_posts_newsletter_platform_type_unique
UNIQUE (newsletter_id, platform, post_type);

-- Step 4: Verify constraint was added successfully
SELECT
  tc.constraint_name,
  tc.table_name,
  kcu.column_name,
  tc.constraint_type
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
  AND tc.table_schema = kcu.table_schema
WHERE tc.constraint_name = 'social_posts_newsletter_platform_type_unique'
  AND tc.table_schema = 'public'
ORDER BY kcu.ordinal_position;

-- Expected result: Should show unique constraint on (newsletter_id, platform, post_type)

-- Step 5: Test the constraint (optional - run in development only)
-- This should fail with a unique constraint violation:
/*
-- Assuming you have a newsletter with ID 1, this would fail on the second insert:
INSERT INTO public.social_posts (newsletter_id, platform, post_type, content, character_count, status)
VALUES (1, 'linkedin', 'pre_cta', 'Test post', 9, 'draft');

INSERT INTO public.social_posts (newsletter_id, platform, post_type, content, character_count, status)
VALUES (1, 'linkedin', 'pre_cta', 'Duplicate post', 14, 'draft');
-- ERROR: duplicate key value violates unique constraint "social_posts_newsletter_platform_type_unique"
*/

COMMENT ON CONSTRAINT social_posts_newsletter_platform_type_unique ON public.social_posts IS 'Prevents duplicate post generation per newsletter/platform/type combination';