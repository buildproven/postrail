-- =============================================================================
-- Billing System Migration
-- =============================================================================
-- Adds columns to support Stripe billing integration
-- =============================================================================

-- Add billing-related columns to user_profiles
ALTER TABLE user_profiles
ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT,
ADD COLUMN IF NOT EXISTS subscription_tier TEXT DEFAULT 'trial',
ADD COLUMN IF NOT EXISTS subscription_current_period_end TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS subscription_cancel_at_period_end BOOLEAN DEFAULT false;

-- Index for Stripe customer lookups
CREATE INDEX IF NOT EXISTS idx_user_profiles_stripe_customer
ON user_profiles(stripe_customer_id)
WHERE stripe_customer_id IS NOT NULL;

-- Index for subscription tier filtering
CREATE INDEX IF NOT EXISTS idx_user_profiles_tier
ON user_profiles(subscription_tier);

-- Add subscription tier limits to system_limits
INSERT INTO system_limits (name, value, description) VALUES
  ('standard_daily_limit', 50, 'Max generations per day for Standard tier'),
  ('growth_daily_limit', 200, 'Max generations per day for Growth tier'),
  ('standard_platforms', 4, 'Max connected platforms for Standard tier'),
  ('growth_platforms', 99, 'Max connected platforms for Growth tier')
ON CONFLICT (name) DO NOTHING;

-- Comment updates
COMMENT ON COLUMN user_profiles.stripe_customer_id IS 'Stripe customer ID for billing';
COMMENT ON COLUMN user_profiles.subscription_tier IS 'Current subscription tier: trial, standard, growth';
COMMENT ON COLUMN user_profiles.subscription_current_period_end IS 'End date of current billing period';
COMMENT ON COLUMN user_profiles.subscription_cancel_at_period_end IS 'Whether subscription will cancel at period end';
