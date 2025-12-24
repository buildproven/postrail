-- Add timezone support and retry tracking for scheduling
-- Phase 5: Scheduling & Automation

-- Add timezone preference to user_profiles
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'America/New_York';

COMMENT ON COLUMN user_profiles.timezone IS 'User timezone in IANA format (e.g., America/New_York)';

-- Add retry tracking to social_posts
ALTER TABLE social_posts
  ADD COLUMN IF NOT EXISTS retry_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_retry_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS max_retries INTEGER DEFAULT 3,
  ADD COLUMN IF NOT EXISTS qstash_message_id TEXT;

COMMENT ON COLUMN social_posts.retry_count IS 'Number of publish attempts';
COMMENT ON COLUMN social_posts.last_retry_at IS 'Timestamp of last retry attempt';
COMMENT ON COLUMN social_posts.max_retries IS 'Maximum retry attempts before permanent failure';
COMMENT ON COLUMN social_posts.qstash_message_id IS 'QStash message ID for cancellation';

-- Index for efficient retry queries (find failed posts eligible for retry)
CREATE INDEX IF NOT EXISTS idx_social_posts_failed_retries
  ON social_posts (status, retry_count)
  WHERE status = 'failed' AND retry_count < 3;

-- Index for finding posts by QStash message ID
CREATE INDEX IF NOT EXISTS idx_social_posts_qstash_message
  ON social_posts (qstash_message_id)
  WHERE qstash_message_id IS NOT NULL;
