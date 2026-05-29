-- ================================================================
-- WealthLens Goals & Goal-Investment Linking
-- Run in Supabase Dashboard → SQL Editor → New Query
-- ================================================================

CREATE TABLE IF NOT EXISTS goals (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  name          TEXT NOT NULL,
  description   TEXT,
  target_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
  currency      TEXT NOT NULL DEFAULT 'INR' CHECK (currency IN ('INR','AED')),
  target_date   DATE NOT NULL,
  category      TEXT NOT NULL DEFAULT 'general'
                  CHECK (category IN ('equity','mutual_fund','fixed_income','gold','real_estate','retirement','emergency','general')),
  status        TEXT NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active','achieved','paused','cancelled')),
  icon          TEXT DEFAULT '🎯',
  color         TEXT DEFAULT '#16A34A',
  notes         TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS goal_investments (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  goal_id          UUID REFERENCES goals(id) ON DELETE CASCADE NOT NULL,
  user_id          UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  investment_type  TEXT NOT NULL,
  investment_id    UUID NOT NULL,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (goal_id, investment_type, investment_id)
);

-- RLS
ALTER TABLE goals            ENABLE ROW LEVEL SECURITY;
ALTER TABLE goal_investments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "goals_owner"   ON goals            FOR ALL USING (user_id = auth.uid());
CREATE POLICY "gi_owner"      ON goal_investments FOR ALL USING (user_id = auth.uid());
