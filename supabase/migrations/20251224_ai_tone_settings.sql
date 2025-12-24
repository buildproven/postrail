-- Add AI tone/voice settings to user_profiles
-- This allows users to customize how Claude generates their social posts

-- Add tone column with JSONB for flexible settings
ALTER TABLE user_profiles
ADD COLUMN IF NOT EXISTS ai_tone JSONB DEFAULT '{
  "voice": "professional",
  "formality": "balanced",
  "emoji_level": "moderate",
  "hashtag_style": "relevant",
  "custom_instructions": null
}'::jsonb;

-- Add comment for documentation
COMMENT ON COLUMN user_profiles.ai_tone IS 'AI writing preferences: voice (professional/casual/witty/inspirational), formality (formal/balanced/casual), emoji_level (none/minimal/moderate/liberal), hashtag_style (none/minimal/relevant/trending), custom_instructions (free text)';

-- Create index for querying by voice type (if needed for analytics)
CREATE INDEX IF NOT EXISTS idx_user_profiles_ai_tone_voice
ON user_profiles ((ai_tone->>'voice'));
