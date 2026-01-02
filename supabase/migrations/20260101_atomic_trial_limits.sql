-- Atomic trial generation tracking to prevent race conditions
-- This RPC checks limits and records generation in a single transaction

CREATE OR REPLACE FUNCTION check_and_record_trial_generation(
  p_user_id UUID,
  p_newsletter_id UUID DEFAULT NULL,
  p_posts_count INTEGER DEFAULT 0,
  p_tokens_used INTEGER DEFAULT 0,
  p_ip_address TEXT DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_profile RECORD;
  v_daily_count INTEGER;
  v_global_count INTEGER;
  v_start_of_day TIMESTAMPTZ;
  v_trial_ends_at TIMESTAMPTZ;
  v_days_remaining INTEGER;
  v_system_limits RECORD;
BEGIN
  -- Get system limits
  SELECT
    trial_daily_limit_per_user,
    trial_total_limit_per_user,
    trial_daily_cap_global
  INTO v_system_limits
  FROM system_limits
  WHERE id = 1;

  -- Default limits if not configured
  IF v_system_limits IS NULL THEN
    v_system_limits.trial_daily_limit_per_user := 3;
    v_system_limits.trial_total_limit_per_user := 10;
    v_system_limits.trial_daily_cap_global := 200;
  END IF;

  -- Get user profile with row lock to prevent race conditions
  SELECT * INTO v_profile
  FROM user_profiles
  WHERE user_id = p_user_id
  FOR UPDATE;

  -- If not trial user, allow immediately
  IF NOT v_profile.is_trial OR v_profile.plan != 'trial' THEN
    RETURN json_build_object('allowed', true, 'reason', 'paid_user');
  END IF;

  -- Check if trial expired
  v_trial_ends_at := v_profile.trial_ends_at;
  v_days_remaining := EXTRACT(EPOCH FROM (v_trial_ends_at - NOW())) / 86400;

  IF NOW() > v_trial_ends_at THEN
    RETURN json_build_object(
      'allowed', false,
      'reason', 'trial_expired',
      'trialEnded', true
    );
  END IF;

  -- Check total trial limit
  IF v_profile.trial_total_generations >= v_system_limits.trial_total_limit_per_user THEN
    RETURN json_build_object(
      'allowed', false,
      'reason', 'total_limit_reached',
      'generationsTotal', v_profile.trial_total_generations,
      'totalLimit', v_system_limits.trial_total_limit_per_user
    );
  END IF;

  -- Check daily limit
  v_start_of_day := DATE_TRUNC('day', NOW() AT TIME ZONE 'UTC');

  SELECT COUNT(*) INTO v_daily_count
  FROM generation_events
  WHERE user_id = p_user_id
    AND event_type = 'trial'
    AND created_at >= v_start_of_day;

  IF v_daily_count >= v_system_limits.trial_daily_limit_per_user THEN
    RETURN json_build_object(
      'allowed', false,
      'reason', 'daily_limit_reached',
      'generationsToday', v_daily_count,
      'dailyLimit', v_system_limits.trial_daily_limit_per_user
    );
  END IF;

  -- Check global daily cap
  SELECT COUNT(*) INTO v_global_count
  FROM generation_events
  WHERE event_type = 'trial'
    AND created_at >= v_start_of_day;

  IF v_global_count >= v_system_limits.trial_daily_cap_global THEN
    RETURN json_build_object(
      'allowed', false,
      'reason', 'global_cap_reached'
    );
  END IF;

  -- All checks passed - record the generation atomically
  INSERT INTO generation_events (
    user_id,
    event_type,
    newsletter_id,
    posts_count,
    tokens_used,
    ip_address,
    user_agent
  ) VALUES (
    p_user_id,
    'trial',
    p_newsletter_id,
    p_posts_count,
    p_tokens_used,
    p_ip_address,
    p_user_agent
  );

  -- Increment user's total count
  UPDATE user_profiles
  SET trial_total_generations = trial_total_generations + 1
  WHERE user_id = p_user_id;

  -- Return success with updated counts
  RETURN json_build_object(
    'allowed', true,
    'generationsToday', v_daily_count + 1,
    'generationsTotal', v_profile.trial_total_generations + 1,
    'dailyLimit', v_system_limits.trial_daily_limit_per_user,
    'totalLimit', v_system_limits.trial_total_limit_per_user,
    'remainingToday', v_system_limits.trial_daily_limit_per_user - v_daily_count - 1,
    'remainingTotal', v_system_limits.trial_total_limit_per_user - v_profile.trial_total_generations - 1,
    'daysRemaining', v_days_remaining
  );
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION check_and_record_trial_generation TO authenticated;

-- Also create the simple increment function for backward compatibility
CREATE OR REPLACE FUNCTION increment_trial_generation(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE user_profiles
  SET trial_total_generations = trial_total_generations + 1
  WHERE user_id = p_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION increment_trial_generation TO authenticated;
