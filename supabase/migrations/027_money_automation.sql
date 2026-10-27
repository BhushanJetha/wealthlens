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

-- Repeating entries (Money › Bills): rent, SIPs, family support… added on
-- their day each month — automatically, or after you confirm. last_done_month
-- (YYYY-MM) is the latest month added or skipped, so nothing is added twice.
CREATE TABLE IF NOT EXISTS recurring_txns (
  id                  uuid default uuid_generate_v4() primary key,
  user_id             uuid references profiles(id) on delete cascade not null,
  merchant            text not null,
  description         text,
  category            text not null,
  sub_category        text,
  txn_type            text not null default 'expense',
  amount              numeric not null check (amount > 0),
  currency            text not null default 'INR',
  account_id          uuid references accounts(id) on delete set null,
  counter_account_id  uuid references accounts(id) on delete set null,
  day_of_month        smallint not null check (day_of_month between 1 and 31),
  every_months        smallint not null default 1 check (every_months between 1 and 12),
  start_month         text not null,
  last_done_month     text,
  auto_add            boolean not null default false,
  is_active           boolean not null default true,
  created_at          timestamptz default now()
);
CREATE INDEX IF NOT EXISTS idx_recurring_user ON recurring_txns(user_id);
ALTER TABLE recurring_txns ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS recurring_txns_owner ON recurring_txns;
CREATE POLICY recurring_txns_owner ON recurring_txns
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- The repeating entry a transaction was added from
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS recurring_id uuid REFERENCES recurring_txns(id) ON DELETE SET NULL;
