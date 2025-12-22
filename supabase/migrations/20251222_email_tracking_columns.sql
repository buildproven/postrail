-- Add email tracking columns to user_profiles
-- Used to prevent duplicate trial notification emails

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS trial_warning_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS trial_expired_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS welcome_email_sent_at TIMESTAMPTZ;

-- Index for efficient cron queries
CREATE INDEX IF NOT EXISTS idx_user_profiles_trial_status
  ON user_profiles (subscription_status, trial_ends_at)
  WHERE subscription_status = 'trial';
