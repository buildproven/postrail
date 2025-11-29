-- Migration: Trial System for Postrail
-- Date: 2025-11-29
-- Purpose: Add trial tracking, abuse protection, and generation limits

-- ============================================================================
-- 1. USER PROFILES TABLE (Trial & Plan Tracking)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.user_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Plan & Trial Status
  plan text NOT NULL DEFAULT 'trial' CHECK (plan IN ('trial', 'standard', 'growth', 'ltd', 'cancelled')),
  is_trial boolean NOT NULL DEFAULT true,
  trial_started_at timestamptz DEFAULT now(),
  trial_ends_at timestamptz DEFAULT (now() + interval '14 days'),
  trial_total_generations integer NOT NULL DEFAULT 0,

  -- Abuse Prevention
  signup_ip inet,
  phone_verified boolean NOT NULL DEFAULT false,
  phone_number text,

  -- Stripe Integration (future)
  stripe_customer_id text,
  stripe_subscription_id text,

  -- Timestamps
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT user_profiles_user_id_unique UNIQUE (user_id)
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS user_profiles_user_id_idx ON public.user_profiles(user_id);
CREATE INDEX IF NOT EXISTS user_profiles_plan_idx ON public.user_profiles(plan);
CREATE INDEX IF NOT EXISTS user_profiles_signup_ip_idx ON public.user_profiles(signup_ip);
CREATE INDEX IF NOT EXISTS user_profiles_trial_ends_at_idx ON public.user_profiles(trial_ends_at);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_user_profiles_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS user_profiles_updated_at ON public.user_profiles;
CREATE TRIGGER user_profiles_updated_at
  BEFORE UPDATE ON public.user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_user_profiles_updated_at();

-- ============================================================================
-- 2. GENERATION EVENTS TABLE (Tracking All Generations)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.generation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Event Type
  type text NOT NULL CHECK (type IN ('trial', 'paid', 'public_demo')),

  -- Usage Tracking
  tokens_used integer DEFAULT 0,
  content_hash text,

  -- Metadata
  ip_address inet,
  user_agent text,

  -- Timestamps
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for rate limiting queries
CREATE INDEX IF NOT EXISTS generation_events_user_id_idx ON public.generation_events(user_id);
CREATE INDEX IF NOT EXISTS generation_events_type_idx ON public.generation_events(type);
CREATE INDEX IF NOT EXISTS generation_events_created_at_idx ON public.generation_events(created_at);
CREATE INDEX IF NOT EXISTS generation_events_ip_address_idx ON public.generation_events(ip_address);

-- Composite index for daily counts
CREATE INDEX IF NOT EXISTS generation_events_user_day_idx
  ON public.generation_events(user_id, type, created_at);

-- ============================================================================
-- 3. SYSTEM LIMITS TABLE (Global Configuration)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.system_limits (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1), -- Singleton row

  -- Trial Limits
  trial_daily_limit_per_user integer NOT NULL DEFAULT 3,
  trial_total_limit_per_user integer NOT NULL DEFAULT 10,
  trial_daily_cap_global integer NOT NULL DEFAULT 200,
  trial_duration_days integer NOT NULL DEFAULT 14,

  -- Public Demo Limits
  public_demo_monthly_limit_per_ip integer NOT NULL DEFAULT 3,
  public_demo_daily_cap_global integer NOT NULL DEFAULT 100,

  -- Feature Flags
  sms_verification_enabled boolean NOT NULL DEFAULT false,
  disposable_email_blocking_enabled boolean NOT NULL DEFAULT true,

  -- Timestamps
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Insert default limits (singleton)
INSERT INTO public.system_limits (id) VALUES (1)
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- 4. DISPOSABLE EMAIL DOMAINS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.blocked_email_domains (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  domain text NOT NULL UNIQUE,
  reason text DEFAULT 'disposable',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Seed common disposable email domains
INSERT INTO public.blocked_email_domains (domain, reason) VALUES
  ('mailinator.com', 'disposable'),
  ('tempmail.com', 'disposable'),
  ('10minutemail.com', 'disposable'),
  ('guerrillamail.com', 'disposable'),
  ('throwaway.email', 'disposable'),
  ('temp-mail.org', 'disposable'),
  ('fakeinbox.com', 'disposable'),
  ('trashmail.com', 'disposable'),
  ('yopmail.com', 'disposable'),
  ('mailnesia.com', 'disposable'),
  ('maildrop.cc', 'disposable'),
  ('dispostable.com', 'disposable'),
  ('getairmail.com', 'disposable'),
  ('mohmal.com', 'disposable'),
  ('tempail.com', 'disposable'),
  ('sharklasers.com', 'disposable'),
  ('spam4.me', 'disposable'),
  ('grr.la', 'disposable'),
  ('guerrillamail.info', 'disposable'),
  ('pokemail.net', 'disposable')
ON CONFLICT (domain) DO NOTHING;

CREATE INDEX IF NOT EXISTS blocked_email_domains_domain_idx ON public.blocked_email_domains(domain);

-- ============================================================================
-- 5. ROW LEVEL SECURITY POLICIES
-- ============================================================================

-- Enable RLS
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.generation_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blocked_email_domains ENABLE ROW LEVEL SECURITY;

-- User Profiles: Users can read/update their own profile
CREATE POLICY "Users can view own profile"
  ON public.user_profiles FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own profile"
  ON public.user_profiles FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Service role can do everything (for background workers)
CREATE POLICY "Service role full access to user_profiles"
  ON public.user_profiles FOR ALL
  USING (auth.role() = 'service_role');

-- Generation Events: Users can view their own, service role can insert/view all
CREATE POLICY "Users can view own generation events"
  ON public.generation_events FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role full access to generation_events"
  ON public.generation_events FOR ALL
  USING (auth.role() = 'service_role');

-- System Limits: Read-only for all authenticated, service role can update
CREATE POLICY "Authenticated users can view system limits"
  ON public.system_limits FOR SELECT
  USING (auth.role() = 'authenticated' OR auth.role() = 'anon');

CREATE POLICY "Service role can update system limits"
  ON public.system_limits FOR ALL
  USING (auth.role() = 'service_role');

-- Blocked Email Domains: Read-only for service role
CREATE POLICY "Service role can manage blocked domains"
  ON public.blocked_email_domains FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "All can read blocked domains"
  ON public.blocked_email_domains FOR SELECT
  USING (true);

-- ============================================================================
-- 6. HELPER FUNCTIONS
-- ============================================================================

-- Check if email domain is blocked
CREATE OR REPLACE FUNCTION is_email_blocked(email text)
RETURNS boolean AS $$
DECLARE
  email_domain text;
BEGIN
  email_domain := split_part(email, '@', 2);
  RETURN EXISTS (
    SELECT 1 FROM public.blocked_email_domains
    WHERE domain = email_domain
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get user's trial status
CREATE OR REPLACE FUNCTION get_trial_status(p_user_id uuid)
RETURNS TABLE (
  is_trial boolean,
  trial_ended boolean,
  trial_days_remaining integer,
  generations_today integer,
  generations_total integer,
  daily_limit integer,
  total_limit integer
) AS $$
DECLARE
  v_profile user_profiles%ROWTYPE;
  v_limits system_limits%ROWTYPE;
  v_today_count integer;
BEGIN
  -- Get user profile
  SELECT * INTO v_profile FROM public.user_profiles WHERE user_id = p_user_id;

  -- Get system limits
  SELECT * INTO v_limits FROM public.system_limits WHERE id = 1;

  -- Count today's generations
  SELECT COUNT(*) INTO v_today_count
  FROM public.generation_events
  WHERE generation_events.user_id = p_user_id
    AND type = 'trial'
    AND created_at >= date_trunc('day', now());

  RETURN QUERY SELECT
    v_profile.is_trial,
    (v_profile.trial_ends_at < now()) AS trial_ended,
    GREATEST(0, EXTRACT(DAY FROM v_profile.trial_ends_at - now())::integer) AS trial_days_remaining,
    v_today_count,
    v_profile.trial_total_generations,
    v_limits.trial_daily_limit_per_user,
    v_limits.trial_total_limit_per_user;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Increment trial generation count
CREATE OR REPLACE FUNCTION increment_trial_generation(p_user_id uuid)
RETURNS void AS $$
BEGIN
  UPDATE public.user_profiles
  SET trial_total_generations = trial_total_generations + 1
  WHERE user_id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get global trial count for today
CREATE OR REPLACE FUNCTION get_global_trial_count_today()
RETURNS integer AS $$
BEGIN
  RETURN (
    SELECT COUNT(*)::integer
    FROM public.generation_events
    WHERE type = 'trial'
      AND created_at >= date_trunc('day', now())
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get public demo count for IP this month
CREATE OR REPLACE FUNCTION get_public_demo_count_month(p_ip inet)
RETURNS integer AS $$
BEGIN
  RETURN (
    SELECT COUNT(*)::integer
    FROM public.generation_events
    WHERE type = 'public_demo'
      AND ip_address = p_ip
      AND created_at >= date_trunc('month', now())
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Auto-create user profile on signup (trigger)
CREATE OR REPLACE FUNCTION create_user_profile_on_signup()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_profiles (user_id, signup_ip)
  VALUES (
    NEW.id,
    NULLIF(NEW.raw_user_meta_data->>'signup_ip', '')::inet
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Attach trigger to auth.users (if not exists)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION create_user_profile_on_signup();

-- ============================================================================
-- 7. GRANT PERMISSIONS
-- ============================================================================

GRANT SELECT, INSERT, UPDATE ON public.user_profiles TO authenticated;
GRANT SELECT ON public.generation_events TO authenticated;
GRANT SELECT ON public.system_limits TO authenticated, anon;
GRANT SELECT ON public.blocked_email_domains TO authenticated, anon;

GRANT ALL ON public.user_profiles TO service_role;
GRANT ALL ON public.generation_events TO service_role;
GRANT ALL ON public.system_limits TO service_role;
GRANT ALL ON public.blocked_email_domains TO service_role;
