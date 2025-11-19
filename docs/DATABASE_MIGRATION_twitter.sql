-- Migration: Add Twitter/X platform support
-- Run this in Supabase SQL Editor

-- Step 1: Add 'twitter' to platform_connections platform enum
ALTER TABLE public.platform_connections
  DROP CONSTRAINT IF EXISTS platform_connections_platform_check;

ALTER TABLE public.platform_connections
  ADD CONSTRAINT platform_connections_platform_check
  CHECK (platform IN ('linkedin', 'threads', 'facebook', 'twitter'));

-- Step 2: Add 'twitter' to social_posts platform enum
ALTER TABLE public.social_posts
  DROP CONSTRAINT IF EXISTS social_posts_platform_check;

ALTER TABLE public.social_posts
  ADD CONSTRAINT social_posts_platform_check
  CHECK (platform IN ('linkedin', 'threads', 'facebook', 'twitter'));

-- Step 3: Add metadata column for storing Twitter-specific config
-- (For BYOK: stores encrypted API keys as JSON)
ALTER TABLE public.platform_connections
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

-- Note: For Twitter BYOK, the metadata will store:
-- {
--   "api_key": "encrypted_value",
--   "api_secret": "encrypted_value",
--   "access_token": "encrypted_value",
--   "access_token_secret": "encrypted_value"
-- }
-- The oauth_token field will store a hash for quick validation
-- The oauth_refresh_token field is not used for Twitter (v2 API uses long-lived tokens)

COMMENT ON COLUMN public.platform_connections.metadata IS 'Platform-specific metadata (e.g., BYOK credentials for Twitter)';
