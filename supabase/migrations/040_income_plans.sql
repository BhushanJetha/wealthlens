-- WealthLens 040: expected income and regular transfers, declared by you.
-- A plan is a forecast only: nothing reaches a balance until you add it (or a
-- statement shows it). kind: income · remit (UAE to India) · nre_nro.
-- Run after 039. Safe to run more than once.

CREATE TABLE IF NOT EXISTS income_plans (
  id                 uuid default uuid_generate_v4() primary key,
  user_id            uuid references profiles(id) on delete cascade not null,
  kind               text not null default 'income' check (kind in ('income', 'remit', 'nre_nro')),
  name               text not null,
  amount             numeric not null check (amount > 0),
  currency           text not null default 'AED' check (currency in ('AED', 'INR')),
  account_id         uuid references accounts(id) on delete set null,
  counter_account_id uuid references accounts(id) on delete set null,
  day_rule           text not null default 'fixed' check (day_rule in ('fixed', 'last_working', 'second_last_working')),
  day_of_month       int check (day_of_month between 1 and 31),
  variance_pct       numeric not null default 5 check (variance_pct >= 0 and variance_pct <= 100),
  category           text,
  is_active          boolean not null default true,
  last_done_month    text,          -- this month is settled: added, seen, or skipped
  snoozed_until      date,          -- "not yet": ask again after this day
  created_at         timestamptz default now()
);
CREATE INDEX IF NOT EXISTS idx_income_plans_user ON income_plans(user_id);
ALTER TABLE income_plans ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS income_plans_owner ON income_plans;
CREATE POLICY income_plans_owner ON income_plans FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
-- Same family rule as migration 038: read only, active link, and only when asked
DROP POLICY IF EXISTS family_view_read ON income_plans;
CREATE POLICY family_view_read ON income_plans FOR SELECT USING (user_id = (SELECT family_view_target()));
DROP POLICY IF EXISTS family_view_only ON income_plans;
CREATE POLICY family_view_only ON income_plans AS RESTRICTIVE FOR SELECT USING ((SELECT family_view_target()) IS NULL OR user_id = (SELECT family_view_target()));
