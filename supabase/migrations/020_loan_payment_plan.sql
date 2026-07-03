-- ================================================================
-- 020: Builder payment plan (slab-wise) for construction-linked loans
-- Run in Supabase Dashboard → SQL Editor.
-- ================================================================

CREATE TABLE IF NOT EXISTS loan_payment_plan (
  id          uuid default uuid_generate_v4() primary key,
  user_id     uuid references profiles(id) on delete cascade not null,
  loan_id     uuid references home_loans(id) on delete cascade not null,
  slab_no     int  not null default 0,          -- order of the milestone
  milestone   text not null,                    -- e.g. "On Booking", "Plinth", "3rd Slab"
  percentage  numeric(6,2),                     -- % of property value (optional)
  amount      numeric(20,2) not null default 0, -- slab amount (₹)
  due_date    date,                             -- expected/actual demand date (optional)
  created_at  timestamptz default now()
);

CREATE INDEX IF NOT EXISTS loan_payment_plan_loan_idx ON loan_payment_plan(loan_id);

ALTER TABLE loan_payment_plan ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS loan_plan_owner ON loan_payment_plan;
CREATE POLICY loan_plan_owner ON loan_payment_plan
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
