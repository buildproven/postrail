-- =============================================================================
-- PostRail Initial Database Schema
-- =============================================================================
-- Run this first before any other migrations
-- =============================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================================================
-- CORE TABLES
-- =============================================================================

-- User profiles (extends Supabase auth.users)
CREATE TABLE IF NOT EXISTS user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  full_name TEXT,
  avatar_url TEXT,

  -- Trial tracking
  trial_started_at TIMESTAMPTZ DEFAULT now(),
  trial_ends_at TIMESTAMPTZ DEFAULT (now() + interval '14 days'),
  subscription_status TEXT DEFAULT 'trial', -- trial, active, cancelled, expired
  subscription_id TEXT, -- Stripe subscription ID

  -- Usage tracking
  generations_today INTEGER DEFAULT 0,
  generations_total INTEGER DEFAULT 0,
  last_generation_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- User roles for RBAC
CREATE TABLE IF NOT EXISTS user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'user', -- user, admin, super_admin
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, role)
);

-- System limits configuration
CREATE TABLE IF NOT EXISTS system_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  value INTEGER NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Insert default system limits
INSERT INTO system_limits (name, value, description) VALUES
  ('trial_daily_limit', 3, 'Max generations per day during trial'),
  ('trial_total_limit', 10, 'Max total generations during trial'),
  ('trial_duration_days', 14, 'Trial period duration in days'),
  ('paid_daily_limit', 50, 'Max generations per day for paid users'),
  ('rate_limit_per_minute', 10, 'API rate limit per minute')
ON CONFLICT (name) DO NOTHING;

-- =============================================================================
-- NEWSLETTER & POSTS
-- =============================================================================

-- Newsletters (source content)
CREATE TABLE IF NOT EXISTS newsletters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  source_url TEXT,
  status TEXT DEFAULT 'draft', -- draft, published, archived
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Social posts (generated from newsletters)
CREATE TABLE IF NOT EXISTS social_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  newsletter_id UUID REFERENCES newsletters(id) ON DELETE CASCADE,

  -- Post content
  platform TEXT NOT NULL, -- linkedin, threads, x, facebook
  post_type TEXT DEFAULT 'post_cta', -- pre_cta, post_cta
  content TEXT NOT NULL,
  character_count INTEGER,

  -- Scheduling
  status TEXT DEFAULT 'draft', -- draft, scheduled, published, failed
  scheduled_time TIMESTAMPTZ,
  published_at TIMESTAMPTZ,

  -- Platform response
  platform_post_id TEXT, -- ID from the social platform
  platform_response JSONB,
  error_message TEXT,

  -- Growth Autopilot (VBL integration)
  client_id UUID, -- Links to growth_autopilot_clients

  -- Engagement metrics
  impressions INTEGER DEFAULT 0,
  engagements INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0,

  -- Metadata
  metadata JSONB,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- =============================================================================
-- PLATFORM CONNECTIONS (OAuth tokens)
-- =============================================================================

CREATE TABLE IF NOT EXISTS platform_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform TEXT NOT NULL, -- twitter, linkedin, facebook, threads

  -- OAuth tokens (encrypted at application layer)
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  token_expires_at TIMESTAMPTZ,

  -- Platform user info
  platform_user_id TEXT,
  platform_username TEXT,
  platform_display_name TEXT,
  platform_avatar_url TEXT,

  -- For LinkedIn/Facebook pages
  page_id TEXT,
  page_name TEXT,

  -- Status
  is_active BOOLEAN DEFAULT true,
  last_used_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(user_id, platform)
);

-- =============================================================================
-- GENERATION TRACKING
-- =============================================================================

-- Generation events (for rate limiting and analytics)
CREATE TABLE IF NOT EXISTS generation_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  newsletter_id UUID REFERENCES newsletters(id) ON DELETE SET NULL,

  -- Event details
  event_type TEXT DEFAULT 'generation', -- generation, regeneration
  posts_count INTEGER DEFAULT 0,
  tokens_used INTEGER DEFAULT 0,

  -- Rate limiting
  ip_address TEXT,
  user_agent TEXT,

  created_at TIMESTAMPTZ DEFAULT now()
);

-- Generation jobs (for async processing via QStash)
CREATE TABLE IF NOT EXISTS generation_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Job details
  title TEXT,
  content TEXT NOT NULL,
  content_hash TEXT, -- For deduplication

  -- Status
  status TEXT DEFAULT 'pending', -- pending, processing, completed, failed
  error_message TEXT,

  -- Result
  newsletter_id UUID REFERENCES newsletters(id) ON DELETE SET NULL,

  -- Timing
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- =============================================================================
-- SECURITY
-- =============================================================================

-- Blocked email domains (disposable emails)
CREATE TABLE IF NOT EXISTS blocked_email_domains (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain TEXT UNIQUE NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- =============================================================================
-- INDEXES
-- =============================================================================

-- User profiles
CREATE INDEX IF NOT EXISTS idx_user_profiles_email ON user_profiles(email);
CREATE INDEX IF NOT EXISTS idx_user_profiles_subscription ON user_profiles(subscription_status);

-- User roles
CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_role ON user_roles(role);

-- Newsletters
CREATE INDEX IF NOT EXISTS idx_newsletters_user_id ON newsletters(user_id);
CREATE INDEX IF NOT EXISTS idx_newsletters_status ON newsletters(status);
CREATE INDEX IF NOT EXISTS idx_newsletters_created_at ON newsletters(created_at DESC);

-- Social posts
CREATE INDEX IF NOT EXISTS idx_social_posts_user_id ON social_posts(user_id);
CREATE INDEX IF NOT EXISTS idx_social_posts_newsletter_id ON social_posts(newsletter_id);
CREATE INDEX IF NOT EXISTS idx_social_posts_platform ON social_posts(platform);
CREATE INDEX IF NOT EXISTS idx_social_posts_status ON social_posts(status);
CREATE INDEX IF NOT EXISTS idx_social_posts_scheduled ON social_posts(scheduled_time) WHERE status = 'scheduled';
CREATE INDEX IF NOT EXISTS idx_social_posts_client_id ON social_posts(client_id);

-- Platform connections
CREATE INDEX IF NOT EXISTS idx_platform_connections_user_id ON platform_connections(user_id);
CREATE INDEX IF NOT EXISTS idx_platform_connections_platform ON platform_connections(platform);

-- Generation events
CREATE INDEX IF NOT EXISTS idx_generation_events_user_id ON generation_events(user_id);
CREATE INDEX IF NOT EXISTS idx_generation_events_created_at ON generation_events(created_at DESC);

-- Generation jobs
CREATE INDEX IF NOT EXISTS idx_generation_jobs_user_id ON generation_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_generation_jobs_status ON generation_jobs(status);
CREATE INDEX IF NOT EXISTS idx_generation_jobs_content_hash ON generation_jobs(content_hash);

-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================

-- Enable RLS on all tables
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE newsletters ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE generation_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE generation_jobs ENABLE ROW LEVEL SECURITY;

-- User profiles: users can read/update their own profile
CREATE POLICY "Users can view own profile" ON user_profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON user_profiles
  FOR UPDATE USING (auth.uid() = id);

-- User roles: users can view their own roles
CREATE POLICY "Users can view own roles" ON user_roles
  FOR SELECT USING (auth.uid() = user_id);

-- Newsletters: users can CRUD their own newsletters
CREATE POLICY "Users can manage own newsletters" ON newsletters
  FOR ALL USING (auth.uid() = user_id);

-- Social posts: users can CRUD their own posts
CREATE POLICY "Users can manage own posts" ON social_posts
  FOR ALL USING (auth.uid() = user_id);

-- Platform connections: users can CRUD their own connections
CREATE POLICY "Users can manage own connections" ON platform_connections
  FOR ALL USING (auth.uid() = user_id);

-- Generation events: users can view their own events
CREATE POLICY "Users can view own generation events" ON generation_events
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own generation events" ON generation_events
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Generation jobs: users can manage their own jobs
CREATE POLICY "Users can manage own jobs" ON generation_jobs
  FOR ALL USING (auth.uid() = user_id);

-- =============================================================================
-- TRIGGERS
-- =============================================================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply trigger to all tables with updated_at
DO $$
DECLARE
  t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'user_profiles', 'user_roles', 'system_limits', 'newsletters',
    'social_posts', 'platform_connections', 'generation_jobs'
  ])
  LOOP
    EXECUTE format('
      DROP TRIGGER IF EXISTS update_%s_updated_at ON %s;
      CREATE TRIGGER update_%s_updated_at
        BEFORE UPDATE ON %s
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    ', t, t, t, t);
  END LOOP;
END;
$$;

-- Auto-create user profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO user_profiles (id, email, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'),
    NEW.raw_user_meta_data->>'avatar_url'
  );

  -- Add default user role
  INSERT INTO user_roles (user_id, role)
  VALUES (NEW.id, 'user');

  RETURN NEW;
END;
$$ language 'plpgsql' SECURITY DEFINER;

-- Trigger on auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- =============================================================================
-- COMMENTS
-- =============================================================================

COMMENT ON TABLE user_profiles IS 'Extended user data beyond auth.users';
COMMENT ON TABLE user_roles IS 'Role-based access control';
COMMENT ON TABLE newsletters IS 'Source newsletter content';
COMMENT ON TABLE social_posts IS 'Generated social media posts';
COMMENT ON TABLE platform_connections IS 'OAuth connections to social platforms';
COMMENT ON TABLE generation_events IS 'AI generation events for rate limiting';
COMMENT ON TABLE generation_jobs IS 'Async generation job queue';
COMMENT ON TABLE blocked_email_domains IS 'Disposable email domains to block';
