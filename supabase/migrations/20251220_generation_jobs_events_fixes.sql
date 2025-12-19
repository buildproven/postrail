-- Align generation tables with async processing and public demo usage

-- Allow public demo events without a user_id
ALTER TABLE generation_events
  ALTER COLUMN user_id DROP NOT NULL;

-- Store async generation results + requested schedule date
ALTER TABLE generation_jobs
  ADD COLUMN IF NOT EXISTS newsletter_date TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS result JSONB;
