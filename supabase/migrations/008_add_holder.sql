-- ================================================================
-- WealthLens: Family Members + holder_name for investments & loans
-- Run in Supabase Dashboard → SQL Editor → New Query
-- ================================================================

-- Family members table
CREATE TABLE IF NOT EXISTS family_members (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id      UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  name         TEXT NOT NULL,
  relationship TEXT NOT NULL DEFAULT 'other',  -- self, spouse, parent, child, sibling, other
  is_active    BOOLEAN DEFAULT true,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE family_members ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='family_members' AND policyname='fm_owner') THEN
    CREATE POLICY "fm_owner" ON family_members FOR ALL USING (user_id = auth.uid());
  END IF;
END $$;

-- Add holder_name to all investment tables (NULL-safe default 'Self')
ALTER TABLE stocks              ADD COLUMN IF NOT EXISTS holder_name TEXT DEFAULT 'Self';
ALTER TABLE mutual_funds        ADD COLUMN IF NOT EXISTS holder_name TEXT DEFAULT 'Self';
ALTER TABLE fixed_deposits      ADD COLUMN IF NOT EXISTS holder_name TEXT DEFAULT 'Self';
ALTER TABLE recurring_deposits  ADD COLUMN IF NOT EXISTS holder_name TEXT DEFAULT 'Self';
ALTER TABLE nps_accounts        ADD COLUMN IF NOT EXISTS holder_name TEXT DEFAULT 'Self';
ALTER TABLE lic_policies        ADD COLUMN IF NOT EXISTS holder_name TEXT DEFAULT 'Self';
ALTER TABLE gold_investments    ADD COLUMN IF NOT EXISTS holder_name TEXT DEFAULT 'Self';
ALTER TABLE bond_investments    ADD COLUMN IF NOT EXISTS holder_name TEXT DEFAULT 'Self';
ALTER TABLE etf_investments     ADD COLUMN IF NOT EXISTS holder_name TEXT DEFAULT 'Self';

-- Add holder_name to loans table
ALTER TABLE home_loans          ADD COLUMN IF NOT EXISTS holder_name TEXT DEFAULT 'Self';

-- Back-fill NULLs
UPDATE stocks             SET holder_name = 'Self' WHERE holder_name IS NULL;
UPDATE mutual_funds       SET holder_name = 'Self' WHERE holder_name IS NULL;
UPDATE fixed_deposits     SET holder_name = 'Self' WHERE holder_name IS NULL;
UPDATE recurring_deposits SET holder_name = 'Self' WHERE holder_name IS NULL;
UPDATE nps_accounts       SET holder_name = 'Self' WHERE holder_name IS NULL;
UPDATE lic_policies       SET holder_name = 'Self' WHERE holder_name IS NULL;
UPDATE gold_investments   SET holder_name = 'Self' WHERE holder_name IS NULL;
UPDATE bond_investments   SET holder_name = 'Self' WHERE holder_name IS NULL;
UPDATE etf_investments    SET holder_name = 'Self' WHERE holder_name IS NULL;
UPDATE home_loans         SET holder_name = 'Self' WHERE holder_name IS NULL;
