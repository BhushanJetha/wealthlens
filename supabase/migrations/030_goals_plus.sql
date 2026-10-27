-- WealthLens 030: goals — type, priority, owner, inflation & return, a
-- linked savings account, emergency fund on bank & cash, money added by hand.
-- Safe to run more than once.

ALTER TABLE goals ADD COLUMN IF NOT EXISTS kind          text;                 -- emergency, retirement, education, home, car, travel, wedding, family, health, business, purchase, other
ALTER TABLE goals ADD COLUMN IF NOT EXISTS priority      smallint NOT NULL DEFAULT 2;   -- 1 must have · 2 important · 3 nice to have
ALTER TABLE goals ADD COLUMN IF NOT EXISTS holder_name   text;                 -- who it's for (family member)
ALTER TABLE goals ADD COLUMN IF NOT EXISTS inflation_pct numeric;              -- yearly price rise for the target (empty = default for the type)
ALTER TABLE goals ADD COLUMN IF NOT EXISTS return_pct    numeric;              -- expected yearly return (empty = by time left)
-- Emergency fund: count bank & cash balances (on for existing emergency goals)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'goals' AND column_name = 'track_cash') THEN
    ALTER TABLE goals ADD COLUMN track_cash boolean NOT NULL DEFAULT false;
    UPDATE goals SET track_cash = true WHERE category = 'emergency' OR name ILIKE '%emergency%';
  END IF;
END $$;
ALTER TABLE goals ADD COLUMN IF NOT EXISTS account_id    uuid REFERENCES accounts(id) ON DELETE SET NULL;  -- a savings account kept for it
ALTER TABLE goals ADD COLUMN IF NOT EXISTS achieved_at   date;

-- Money put towards a goal by hand (positive) or taken out of it (negative)
CREATE TABLE IF NOT EXISTS goal_contributions (
  id            uuid default uuid_generate_v4() primary key,
  user_id       uuid references profiles(id) on delete cascade not null,
  goal_id       uuid references goals(id) on delete cascade not null,
  amount        numeric not null,
  currency      text not null default 'INR' check (currency in ('AED', 'INR')),
  contrib_date  date not null default current_date,
  note          text,
  created_at    timestamptz default now()
);
CREATE INDEX IF NOT EXISTS idx_goal_contrib_goal ON goal_contributions(goal_id);
ALTER TABLE goal_contributions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS goal_contributions_owner ON goal_contributions;
CREATE POLICY goal_contributions_owner ON goal_contributions
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
