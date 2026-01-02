-- Account lockout policy: 5 failed attempts = 15min lockout
-- Security measure to prevent brute force attacks

-- Table to track failed login attempts
CREATE TABLE IF NOT EXISTS failed_login_attempts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT NOT NULL,
  ip_address INET,
  user_agent TEXT,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for efficient lookups (check recent attempts for email)
CREATE INDEX IF NOT EXISTS idx_failed_login_email_time
ON failed_login_attempts(email, attempted_at DESC);

-- Index for cleanup queries (delete old attempts)
CREATE INDEX IF NOT EXISTS idx_failed_login_attempted_at
ON failed_login_attempts(attempted_at DESC);

-- RLS: Only service role can access (called from API routes)
ALTER TABLE failed_login_attempts ENABLE ROW LEVEL SECURITY;

-- Function to check if account is locked
CREATE OR REPLACE FUNCTION is_account_locked(p_email TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_attempts_count INT;
  v_lockout_until TIMESTAMPTZ;
  v_latest_attempt TIMESTAMPTZ;
BEGIN
  -- Count failed attempts in last 15 minutes
  SELECT COUNT(*), MAX(attempted_at)
  INTO v_attempts_count, v_latest_attempt
  FROM failed_login_attempts
  WHERE email = p_email
    AND attempted_at > NOW() - INTERVAL '15 minutes';

  -- If 5+ attempts in last 15 min, account is locked
  IF v_attempts_count >= 5 THEN
    v_lockout_until := v_latest_attempt + INTERVAL '15 minutes';

    RETURN json_build_object(
      'locked', true,
      'attempts', v_attempts_count,
      'lockout_until', v_lockout_until,
      'minutes_remaining', EXTRACT(EPOCH FROM (v_lockout_until - NOW())) / 60
    );
  END IF;

  -- Not locked
  RETURN json_build_object(
    'locked', false,
    'attempts', v_attempts_count,
    'lockout_until', null,
    'minutes_remaining', 0
  );
END;
$$;

-- Function to record failed login attempt
CREATE OR REPLACE FUNCTION record_failed_login(
  p_email TEXT,
  p_ip_address TEXT DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_attempts_count INT;
  v_should_notify BOOLEAN := false;
BEGIN
  -- Insert failed attempt
  INSERT INTO failed_login_attempts (email, ip_address, user_agent, attempted_at)
  VALUES (p_email, p_ip_address::INET, p_user_agent, NOW());

  -- Count recent attempts
  SELECT COUNT(*)
  INTO v_attempts_count
  FROM failed_login_attempts
  WHERE email = p_email
    AND attempted_at > NOW() - INTERVAL '15 minutes';

  -- Trigger notification if just hit lockout threshold
  v_should_notify := (v_attempts_count = 5);

  RETURN json_build_object(
    'attempts', v_attempts_count,
    'locked', v_attempts_count >= 5,
    'should_notify', v_should_notify
  );
END;
$$;

-- Function to clear failed attempts (successful login)
CREATE OR REPLACE FUNCTION clear_failed_logins(p_email TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM failed_login_attempts
  WHERE email = p_email
    AND attempted_at > NOW() - INTERVAL '15 minutes';
END;
$$;

-- Cleanup job: delete attempts older than 24 hours (keep for audit)
CREATE OR REPLACE FUNCTION cleanup_old_failed_logins()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM failed_login_attempts
  WHERE attempted_at < NOW() - INTERVAL '24 hours';
END;
$$;

-- Comments
COMMENT ON TABLE failed_login_attempts IS
  'Tracks failed login attempts for account lockout policy (5 attempts = 15min lockout)';

COMMENT ON FUNCTION is_account_locked(TEXT) IS
  'Checks if account is locked due to too many failed login attempts';

COMMENT ON FUNCTION record_failed_login(TEXT, TEXT, TEXT) IS
  'Records a failed login attempt and returns lockout status';

COMMENT ON FUNCTION clear_failed_logins(TEXT) IS
  'Clears failed login attempts after successful login';
