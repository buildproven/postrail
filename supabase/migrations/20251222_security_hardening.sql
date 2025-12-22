-- =============================================================================
-- Security Hardening Migration
-- =============================================================================
-- Fixes identified in Supabase security audit:
-- 1. Add SET search_path = '' to functions to prevent schema injection
-- 2. Enable RLS on blocked_email_domains and system_limits tables
-- =============================================================================

-- Fix 1: update_updated_at_column() - add search_path protection
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql
SET search_path = '';

-- Fix 2: handle_new_user() - add search_path protection
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_profiles (id, email, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'),
    NEW.raw_user_meta_data->>'avatar_url'
  );

  -- Add default user role
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'user');

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = '';

-- Fix 3: Enable RLS on blocked_email_domains
ALTER TABLE blocked_email_domains ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone can read (for signup validation), only admins can write
CREATE POLICY "blocked_email_domains_read" ON blocked_email_domains
  FOR SELECT USING (true);

CREATE POLICY "blocked_email_domains_admin_write" ON blocked_email_domains
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid()
      AND role IN ('admin', 'super_admin')
    )
  );

-- Fix 4: Enable RLS on system_limits
ALTER TABLE system_limits ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone can read (for limit checks), only admins can write
CREATE POLICY "system_limits_read" ON system_limits
  FOR SELECT USING (true);

CREATE POLICY "system_limits_admin_write" ON system_limits
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid()
      AND role IN ('admin', 'super_admin')
    )
  );
