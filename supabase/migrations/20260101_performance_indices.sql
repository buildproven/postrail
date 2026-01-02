-- Performance indices for hot query paths
-- Based on deep review findings: N+1 queries and missing indices

-- Index for user_profiles lookups by user_id (used in auth, billing, trial tracking)
CREATE INDEX IF NOT EXISTS idx_user_profiles_user_id
ON user_profiles(user_id);

-- Index for trial generation tracking (daily limit checks)
CREATE INDEX IF NOT EXISTS idx_generation_events_user_date
ON generation_events(user_id, event_type, created_at DESC);

-- Index for global trial cap checks
CREATE INDEX IF NOT EXISTS idx_generation_events_type_date
ON generation_events(event_type, created_at DESC);

-- Index for scheduled posts queries
CREATE INDEX IF NOT EXISTS idx_social_posts_status_scheduled
ON social_posts(status, scheduled_time)
WHERE status = 'scheduled';

-- Index for newsletter queries by user
CREATE INDEX IF NOT EXISTS idx_newsletters_user_created
ON newsletters(user_id, created_at DESC);

-- Index for social posts by newsletter (common join)
CREATE INDEX IF NOT EXISTS idx_social_posts_newsletter
ON social_posts(newsletter_id, created_at DESC);

-- Index for platform connections by user
CREATE INDEX IF NOT EXISTS idx_platform_connections_user
ON platform_connections(user_id, platform);

-- Composite index for billing queries
CREATE INDEX IF NOT EXISTS idx_user_profiles_subscription
ON user_profiles(subscription_status, subscription_tier, trial_ends_at);

-- Comment explaining index strategy
COMMENT ON INDEX idx_generation_events_user_date IS
  'Optimizes trial limit checks (SELECT COUNT WHERE user_id AND event_type AND created_at >= today)';

COMMENT ON INDEX idx_social_posts_status_scheduled IS
  'Optimizes scheduled post queries (SELECT WHERE status = scheduled ORDER BY scheduled_time)';
