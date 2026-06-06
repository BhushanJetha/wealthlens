-- ================================================================
-- PPF & EPF accounts (India-only long-term retirement / savings)
-- Run in Supabase Dashboard → SQL Editor → New Query
-- ================================================================

CREATE TABLE IF NOT EXISTS ppf_epf_accounts (
  id                  uuid default uuid_generate_v4() primary key,
  user_id             uuid references profiles(id) on delete cascade not null,
  kind                text not null check (kind in ('ppf','epf')),
  name                text not null,
  account_number      text,
  current_balance     numeric(20,2) not null default 0,
  annual_contribution numeric(20,2) default 0,
  interest_rate       numeric(6,4) default 0,
  start_date          date,
  maturity_date       date,
  currency            text not null default 'INR',
  country             text not null default 'India',
  holder_name         text default 'Self',
  created_at          timestamptz default now()
);

-- RLS — owner-only access
ALTER TABLE ppf_epf_accounts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ppf_epf_owner ON ppf_epf_accounts;
CREATE POLICY ppf_epf_owner ON ppf_epf_accounts
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
