-- WealthLens 029: budgets — rollover, per-person budgets, yearly costs.
-- Safe to run more than once. (Includes 021's change, in case it wasn't run.)

-- Budgets are per currency: India (₹) and UAE (AED) are planned separately
ALTER TABLE budgets ALTER COLUMN currency SET DEFAULT 'INR';
UPDATE budgets SET currency = 'INR' WHERE currency IS NULL;
ALTER TABLE budgets ALTER COLUMN currency SET NOT NULL;
ALTER TABLE budgets ADD COLUMN IF NOT EXISTS is_manual boolean DEFAULT false;
ALTER TABLE budgets DROP CONSTRAINT IF EXISTS budgets_user_id_category_month_year_key;

-- Roll unspent money into next month (flexible categories)
ALTER TABLE budgets ADD COLUMN IF NOT EXISTS rollover boolean NOT NULL DEFAULT false;

-- Per-person budgets: category '__person__' with the family member's name.
-- (The "save first" target is category '__savings__'.)
ALTER TABLE budgets ADD COLUMN IF NOT EXISTS holder_name text;

-- One budget per user, category, month, currency and person
DROP INDEX IF EXISTS budgets_user_cat_month_cur_key;
CREATE UNIQUE INDEX IF NOT EXISTS budgets_user_cat_month_cur_holder_key
  ON budgets (user_id, category, month_year, currency, (coalesce(holder_name, '')));

-- Yearly costs (school fees, insurance, travel, festivals): put a share
-- aside every month so it's all there when it's due
CREATE TABLE IF NOT EXISTS budget_funds (
  id                uuid default uuid_generate_v4() primary key,
  user_id           uuid references profiles(id) on delete cascade not null,
  name              text not null,
  category          text,                 -- spending it covers in its due month
  currency          text not null default 'INR' check (currency in ('AED', 'INR')),
  target            numeric not null check (target > 0),
  due_date          date not null,
  saved             numeric not null default 0,
  last_saved_month  text,                 -- YYYY-MM of the last set-aside
  is_active         boolean not null default true,
  created_at        timestamptz default now()
);
CREATE INDEX IF NOT EXISTS idx_budget_funds_user ON budget_funds(user_id);
ALTER TABLE budget_funds ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS budget_funds_owner ON budget_funds;
CREATE POLICY budget_funds_owner ON budget_funds
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
