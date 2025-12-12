-- Service Keys for external service authentication (e.g., VBL Marketer_Agent)
-- Keys are hashed, never stored in plaintext

CREATE TABLE IF NOT EXISTS service_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id TEXT UNIQUE NOT NULL,  -- e.g., 'vbl-marketer-agent'
  service_name TEXT NOT NULL,       -- Human-readable name
  key_hash TEXT UNIQUE NOT NULL,    -- SHA-256 hash of API key
  permissions TEXT[] DEFAULT '{}',  -- ['create_post', 'schedule_post', 'publish_post', 'read_metrics']
  rate_limit_per_minute INTEGER DEFAULT 30,
  rate_limit_per_hour INTEGER DEFAULT 500,
  allowed_client_ids UUID[] DEFAULT NULL,  -- NULL = all clients, array = restricted
  active BOOLEAN DEFAULT true,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Growth Autopilot clients (managed by VBL, posts via PostRail)
CREATE TABLE IF NOT EXISTS growth_autopilot_clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_name TEXT NOT NULL,
  client_slug TEXT UNIQUE NOT NULL,
  vbl_project_id TEXT,                -- Links to VBL Factory project (optional)

  -- Connected platforms (JSON: {platform: {connected: bool, username: string}})
  platforms JSONB DEFAULT '{}',

  -- Client settings
  settings JSONB DEFAULT '{
    "posting_frequency": "daily",
    "platforms": ["twitter", "linkedin"],
    "timezone": "America/New_York",
    "auto_publish": false
  }',

  -- Contact info
  contact_email TEXT,

  -- Billing
  subscription_status TEXT DEFAULT 'trial',  -- trial, active, paused, cancelled
  subscription_started_at TIMESTAMPTZ,

  -- Metadata
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Add client_id to social_posts for Growth Autopilot tracking
ALTER TABLE social_posts
ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES growth_autopilot_clients(id);

-- Add engagement metrics columns to social_posts (if not exist)
ALTER TABLE social_posts ADD COLUMN IF NOT EXISTS impressions INTEGER DEFAULT 0;
ALTER TABLE social_posts ADD COLUMN IF NOT EXISTS engagements INTEGER DEFAULT 0;
ALTER TABLE social_posts ADD COLUMN IF NOT EXISTS clicks INTEGER DEFAULT 0;
ALTER TABLE social_posts ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT NULL;
ALTER TABLE social_posts ADD COLUMN IF NOT EXISTS platform_post_id TEXT;  -- ID from Twitter/LinkedIn/etc
ALTER TABLE social_posts ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;

-- Add index for client queries
CREATE INDEX IF NOT EXISTS idx_social_posts_client_id ON social_posts(client_id);
CREATE INDEX IF NOT EXISTS idx_social_posts_client_status ON social_posts(client_id, status);
CREATE INDEX IF NOT EXISTS idx_social_posts_client_platform ON social_posts(client_id, platform);

-- Index for service key lookups
CREATE INDEX IF NOT EXISTS idx_service_keys_hash ON service_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_service_keys_service_id ON service_keys(service_id);

-- Growth client lookups
CREATE INDEX IF NOT EXISTS idx_growth_clients_slug ON growth_autopilot_clients(client_slug);
CREATE INDEX IF NOT EXISTS idx_growth_clients_vbl_project ON growth_autopilot_clients(vbl_project_id);

-- RLS Policies

-- Service keys: Only admins can manage
ALTER TABLE service_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service keys are admin only" ON service_keys
  FOR ALL USING (false);  -- Managed via service role only

-- Growth clients: Service role access only
ALTER TABLE growth_autopilot_clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Growth clients are service-managed" ON growth_autopilot_clients
  FOR ALL USING (false);  -- Managed via service role only

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_service_keys_updated_at
  BEFORE UPDATE ON service_keys
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_growth_clients_updated_at
  BEFORE UPDATE ON growth_autopilot_clients
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Comments
COMMENT ON TABLE service_keys IS 'API keys for external services (VBL agents)';
COMMENT ON TABLE growth_autopilot_clients IS 'Growth Autopilot managed clients';
COMMENT ON COLUMN social_posts.client_id IS 'Links post to Growth Autopilot client (NULL for direct users)';
