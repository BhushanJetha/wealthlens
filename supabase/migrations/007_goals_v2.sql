-- ================================================================
-- WealthLens Goals Schema Fix + Allocation %
-- Run this in Supabase Dashboard → SQL Editor → New Query
-- Safe to run even if 006_goals.sql was never applied
-- ================================================================

-- Add all missing columns to goals (skips if already exist)
ALTER TABLE goals ADD COLUMN IF NOT EXISTS description   TEXT;
ALTER TABLE goals ADD COLUMN IF NOT EXISTS category      TEXT DEFAULT 'general';
ALTER TABLE goals ADD COLUMN IF NOT EXISTS status        TEXT DEFAULT 'active';
ALTER TABLE goals ADD COLUMN IF NOT EXISTS icon          TEXT DEFAULT '🎯';
ALTER TABLE goals ADD COLUMN IF NOT EXISTS color         TEXT DEFAULT '#16A34A';
ALTER TABLE goals ADD COLUMN IF NOT EXISTS notes         TEXT;
ALTER TABLE goals ADD COLUMN IF NOT EXISTS updated_at    TIMESTAMPTZ DEFAULT NOW();

-- Fill NULLs so we can add constraints safely
UPDATE goals SET category   = 'general'  WHERE category  IS NULL;
UPDATE goals SET status     = 'active'   WHERE status    IS NULL;
UPDATE goals SET icon       = '🎯'       WHERE icon      IS NULL;
UPDATE goals SET color      = '#16A34A'  WHERE color     IS NULL;
UPDATE goals SET updated_at = NOW()      WHERE updated_at IS NULL;

-- Create goal_investments (safe if already exists)
CREATE TABLE IF NOT EXISTS goal_investments (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  goal_id          UUID REFERENCES goals(id) ON DELETE CASCADE NOT NULL,
  user_id          UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  investment_type  TEXT NOT NULL,
  investment_id    UUID NOT NULL,
  allocation_pct   NUMERIC(5,2) DEFAULT 100.0,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (goal_id, investment_type, investment_id)
);

-- Add allocation_pct if this table already existed without it
ALTER TABLE goal_investments ADD COLUMN IF NOT EXISTS allocation_pct NUMERIC(5,2) DEFAULT 100.0;

-- RLS (idempotent via DO block)
ALTER TABLE goals            ENABLE ROW LEVEL SECURITY;
ALTER TABLE goal_investments ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='goals'            AND policyname='goals_owner') THEN
    CREATE POLICY "goals_owner" ON goals            FOR ALL USING (user_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='goal_investments' AND policyname='gi_owner') THEN
    CREATE POLICY "gi_owner"    ON goal_investments FOR ALL USING (user_id = auth.uid());
  END IF;
END $$;
