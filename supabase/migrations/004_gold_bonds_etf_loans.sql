-- Gold, Bonds, ETF investment tables + loan_type support

-- ================================================================
-- GOLD INVESTMENTS
-- ================================================================
CREATE TABLE IF NOT EXISTS gold_investments (
  id                    UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id               UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  name                  TEXT NOT NULL,
  gold_type             TEXT DEFAULT 'physical' CHECK (gold_type IN ('physical','sgb','gold_etf','gold_mf')),
  quantity_grams        NUMERIC(10,3),
  buy_price_per_gram    NUMERIC(10,2),
  current_price_per_gram NUMERIC(10,2),
  invested_amount       NUMERIC(14,2) DEFAULT 0,
  current_value         NUMERIC(14,2),
  purchase_date         DATE,
  currency              TEXT DEFAULT 'INR',
  country               TEXT DEFAULT 'India',
  notes                 TEXT,
  created_at            TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE gold_investments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS gold_sel ON gold_investments;
DROP POLICY IF EXISTS gold_ins ON gold_investments;
DROP POLICY IF EXISTS gold_upd ON gold_investments;
DROP POLICY IF EXISTS gold_del ON gold_investments;
CREATE POLICY gold_sel ON gold_investments FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY gold_ins ON gold_investments FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY gold_upd ON gold_investments FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY gold_del ON gold_investments FOR DELETE USING (auth.uid() = user_id);

-- ================================================================
-- BOND INVESTMENTS
-- ================================================================
CREATE TABLE IF NOT EXISTS bond_investments (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id         UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  name            TEXT NOT NULL,
  bond_type       TEXT DEFAULT 'govt' CHECK (bond_type IN ('govt','corporate','tax_free','rbi_bonds','sgb')),
  face_value      NUMERIC(14,2) DEFAULT 0,
  quantity        INTEGER DEFAULT 1,
  coupon_rate     NUMERIC(6,4),
  maturity_date   DATE,
  invested_amount NUMERIC(14,2) DEFAULT 0,
  current_value   NUMERIC(14,2),
  purchase_date   DATE,
  currency        TEXT DEFAULT 'INR',
  country         TEXT DEFAULT 'India',
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE bond_investments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS bonds_sel ON bond_investments;
DROP POLICY IF EXISTS bonds_ins ON bond_investments;
DROP POLICY IF EXISTS bonds_upd ON bond_investments;
DROP POLICY IF EXISTS bonds_del ON bond_investments;
CREATE POLICY bonds_sel ON bond_investments FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY bonds_ins ON bond_investments FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY bonds_upd ON bond_investments FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY bonds_del ON bond_investments FOR DELETE USING (auth.uid() = user_id);

-- ================================================================
-- ETF INVESTMENTS
-- ================================================================
CREATE TABLE IF NOT EXISTS etf_investments (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id         UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  etf_name        TEXT NOT NULL,
  symbol          TEXT NOT NULL,
  exchange        TEXT DEFAULT 'NSE',
  units           NUMERIC(14,6) DEFAULT 0,
  avg_buy_price   NUMERIC(14,4) DEFAULT 0,
  current_price   NUMERIC(14,4),
  invested_amount NUMERIC(14,2) DEFAULT 0,
  current_value   NUMERIC(14,2),
  etf_type        TEXT DEFAULT 'equity' CHECK (etf_type IN ('equity','debt','gold','index','international')),
  purchase_date   DATE,
  currency        TEXT DEFAULT 'INR',
  country         TEXT DEFAULT 'India',
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE etf_investments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS etf_sel ON etf_investments;
DROP POLICY IF EXISTS etf_ins ON etf_investments;
DROP POLICY IF EXISTS etf_upd ON etf_investments;
DROP POLICY IF EXISTS etf_del ON etf_investments;
CREATE POLICY etf_sel ON etf_investments FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY etf_ins ON etf_investments FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY etf_upd ON etf_investments FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY etf_del ON etf_investments FOR DELETE USING (auth.uid() = user_id);

-- ================================================================
-- ADD LOAN TYPE TO HOME LOANS TABLE
-- ================================================================
ALTER TABLE home_loans ADD COLUMN IF NOT EXISTS loan_type TEXT DEFAULT 'home_loan'
  CHECK (loan_type IN ('home_loan','car_loan','bike_loan','gold_loan','loan_on_card','personal_loan','other_loan'));
