-- ================================================================
-- Freedom Check answers + Money Mindset board pins
-- Run in Supabase Dashboard → SQL Editor → New Query
-- ================================================================

-- One row per user: the Freedom Check questionnaire answers (salary,
-- expenses, EMIs, dependents, insurance cover, …) kept as JSON so new
-- questions don't need a migration.
CREATE TABLE IF NOT EXISTS financial_profile (
  user_id     uuid primary key references profiles(id) on delete cascade,
  answers     jsonb not null default '{}'::jsonb,
  updated_at  timestamptz default now()
);

ALTER TABLE financial_profile ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS financial_profile_owner ON financial_profile;
CREATE POLICY financial_profile_owner ON financial_profile
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Images the user pins to their Money Mindset board (Pinterest links or
-- direct image URLs).
CREATE TABLE IF NOT EXISTS vision_pins (
  id          uuid default uuid_generate_v4() primary key,
  user_id     uuid references profiles(id) on delete cascade not null,
  image_url   text not null,
  source_url  text,
  title       text,
  topic       text default 'freedom',
  created_at  timestamptz default now()
);

CREATE INDEX IF NOT EXISTS vision_pins_user_idx ON vision_pins (user_id, created_at desc);

ALTER TABLE vision_pins ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS vision_pins_owner ON vision_pins;
CREATE POLICY vision_pins_owner ON vision_pins
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
