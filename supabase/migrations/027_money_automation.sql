-- WealthLens 027: Money overview + automation.
-- Safe to run more than once.

-- Which bank account pays a loan's EMI or a credit card's bill. Used for
-- low-balance warnings on Money › Overview ("NRO is short for the EMI on the
-- 5th"). Empty = worked out from the last payment.
ALTER TABLE home_loans ADD COLUMN IF NOT EXISTS pay_from_account_id uuid REFERENCES accounts(id) ON DELETE SET NULL;
ALTER TABLE accounts   ADD COLUMN IF NOT EXISTS pay_from_account_id uuid REFERENCES accounts(id) ON DELETE SET NULL;

-- Warn when a bank account is (or is about to go) below this amount
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS low_balance_alert numeric;

-- Review inbox (Money › Review): a transaction you've checked leaves the inbox
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;

-- "Always do this": when a merchant name contains match_text (lower case,
-- letters and digits only), set its category and/or the account it was paid
-- from. Applied to new transactions and statement imports.
CREATE TABLE IF NOT EXISTS txn_rules (
  id              uuid default uuid_generate_v4() primary key,
  user_id         uuid references profiles(id) on delete cascade not null,
  match_text      text not null,
  label           text,                         -- the merchant as you saw it
  set_category    text,
  set_account_id  uuid references accounts(id) on delete set null,
  created_at      timestamptz default now()
);
CREATE INDEX IF NOT EXISTS idx_txn_rules_user ON txn_rules(user_id);
ALTER TABLE txn_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS txn_rules_owner ON txn_rules;
CREATE POLICY txn_rules_owner ON txn_rules
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
