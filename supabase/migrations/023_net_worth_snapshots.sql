-- ================================================================
-- WealthLens — daily net-worth snapshots (real net-worth history)
-- Run this in Supabase Dashboard → SQL Editor → New Query
-- One row per user per day, written when Home is opened. Values are stored
-- per currency so every view (UAE / India / All) can be charted:
--   UAE view   = uae_*            (AED)
--   India view = india_*          (INR)
--   All view   = india_* + uae_* × fx  (INR, at that day's rate)
-- ================================================================

CREATE TABLE IF NOT EXISTS net_worth_snapshots (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  snap_date     DATE NOT NULL,
  fx            NUMERIC(10,4) NOT NULL,          -- AED → INR used that day
  uae_assets    NUMERIC(20,2) NOT NULL DEFAULT 0, -- AED
  uae_liab      NUMERIC(20,2) NOT NULL DEFAULT 0, -- AED
  india_assets  NUMERIC(20,2) NOT NULL DEFAULT 0, -- INR
  india_liab    NUMERIC(20,2) NOT NULL DEFAULT 0, -- INR
  breakdown     JSONB,                           -- consolidated INR by asset class
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, snap_date)
);

CREATE INDEX IF NOT EXISTS idx_nw_snap_user_date ON net_worth_snapshots(user_id, snap_date DESC);

ALTER TABLE net_worth_snapshots ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'net_worth_snapshots' AND policyname = 'Users manage own net worth snapshots') THEN
    CREATE POLICY "Users manage own net worth snapshots" ON net_worth_snapshots
      FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;
