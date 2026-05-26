-- NPS and LIC investment tables

-- NPS Accounts
CREATE TABLE IF NOT EXISTS nps_accounts (
  id                          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id                     UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  name                        TEXT NOT NULL,
  pran_number                 TEXT,
  tier                        TEXT DEFAULT 'Tier I',         -- 'Tier I', 'Tier II'
  corpus_amount               NUMERIC(14,2) DEFAULT 0,
  invested_amount             NUMERIC(14,2) DEFAULT 0,
  equity_allocation           NUMERIC(5,2)  DEFAULT 0,       -- %
  corporate_bond_allocation   NUMERIC(5,2)  DEFAULT 0,
  govt_securities_allocation  NUMERIC(5,2)  DEFAULT 0,
  fund_manager                TEXT,
  start_date                  DATE,
  currency                    TEXT DEFAULT 'INR',
  country                     TEXT DEFAULT 'India',
  notes                       TEXT,
  created_at                  TIMESTAMPTZ DEFAULT now(),
  updated_at                  TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE nps_accounts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS nps_select ON nps_accounts;
DROP POLICY IF EXISTS nps_insert ON nps_accounts;
DROP POLICY IF EXISTS nps_update ON nps_accounts;
DROP POLICY IF EXISTS nps_delete ON nps_accounts;
CREATE POLICY nps_select ON nps_accounts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY nps_insert ON nps_accounts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY nps_update ON nps_accounts FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY nps_delete ON nps_accounts FOR DELETE USING (auth.uid() = user_id);

-- NPS contributions history
CREATE TABLE IF NOT EXISTS nps_contributions (
  id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id        UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  nps_account_id UUID REFERENCES nps_accounts(id) ON DELETE CASCADE,
  amount         NUMERIC(14,2) NOT NULL,
  contribution_date DATE NOT NULL,
  financial_year TEXT,
  notes          TEXT,
  created_at     TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE nps_contributions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS nps_contrib_select ON nps_contributions;
DROP POLICY IF EXISTS nps_contrib_insert ON nps_contributions;
DROP POLICY IF EXISTS nps_contrib_delete ON nps_contributions;
CREATE POLICY nps_contrib_select ON nps_contributions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY nps_contrib_insert ON nps_contributions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY nps_contrib_delete ON nps_contributions FOR DELETE USING (auth.uid() = user_id);

-- LIC Policies
CREATE TABLE IF NOT EXISTS lic_policies (
  id                  UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id             UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  name                TEXT NOT NULL,
  policy_number       TEXT,
  plan_name           TEXT,
  sum_assured         NUMERIC(14,2) DEFAULT 0,
  annual_premium      NUMERIC(14,2) DEFAULT 0,
  premium_frequency   TEXT DEFAULT 'Annually',  -- Monthly, Quarterly, Half-Yearly, Annually
  premium_paid_years  NUMERIC(5,1)  DEFAULT 0,
  policy_term_years   INTEGER DEFAULT 0,
  start_date          DATE,
  maturity_date       DATE,
  bonus_accrued       NUMERIC(14,2) DEFAULT 0,
  next_premium_date   DATE,
  total_paid          NUMERIC(14,2) DEFAULT 0,
  currency            TEXT DEFAULT 'INR',
  country             TEXT DEFAULT 'India',
  is_active           BOOLEAN DEFAULT true,
  notes               TEXT,
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE lic_policies ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS lic_select ON lic_policies;
DROP POLICY IF EXISTS lic_insert ON lic_policies;
DROP POLICY IF EXISTS lic_update ON lic_policies;
DROP POLICY IF EXISTS lic_delete ON lic_policies;
CREATE POLICY lic_select ON lic_policies FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY lic_insert ON lic_policies FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY lic_update ON lic_policies FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY lic_delete ON lic_policies FOR DELETE USING (auth.uid() = user_id);

-- LIC premium payments history
CREATE TABLE IF NOT EXISTS lic_payments (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id          UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  lic_policy_id    UUID REFERENCES lic_policies(id) ON DELETE CASCADE,
  amount           NUMERIC(14,2) NOT NULL,
  payment_date     DATE NOT NULL,
  financial_year   TEXT,
  receipt_number   TEXT,
  created_at       TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE lic_payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS lic_pay_select ON lic_payments;
DROP POLICY IF EXISTS lic_pay_insert ON lic_payments;
DROP POLICY IF EXISTS lic_pay_delete ON lic_payments;
CREATE POLICY lic_pay_select ON lic_payments FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY lic_pay_insert ON lic_payments FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY lic_pay_delete ON lic_payments FOR DELETE USING (auth.uid() = user_id);

-- Updated_at triggers
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS nps_updated_at ON nps_accounts;
CREATE TRIGGER nps_updated_at BEFORE UPDATE ON nps_accounts FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS lic_updated_at ON lic_policies;
CREATE TRIGGER lic_updated_at BEFORE UPDATE ON lic_policies FOR EACH ROW EXECUTE FUNCTION update_updated_at();
