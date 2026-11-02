-- WealthLens 041: big bills. A bill you add is a recurring goal (migration 031),
-- so what you already set aside carries over. This adds what the last payment
-- was (for the price rise alert), and your answers: not a bill, not this month.
-- Run after 040. Safe to run more than once.

ALTER TABLE goals ADD COLUMN IF NOT EXISTS last_amount  numeric;
ALTER TABLE goals ADD COLUMN IF NOT EXISTS last_paid_on date;

CREATE TABLE IF NOT EXISTS big_bill_skips (
  user_id    uuid references profiles(id) on delete cascade not null,
  key        text not null,       -- detect:… · hide:… · month:… · soon:… · notpaid:…
  created_at timestamptz default now(),
  primary key (user_id, key)
);
ALTER TABLE big_bill_skips ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS big_bill_skips_owner ON big_bill_skips;
CREATE POLICY big_bill_skips_owner ON big_bill_skips FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
-- Same family rule as migration 038: read only, active link, and only when asked
DROP POLICY IF EXISTS family_view_read ON big_bill_skips;
CREATE POLICY family_view_read ON big_bill_skips FOR SELECT USING (user_id = (SELECT family_view_target()));
DROP POLICY IF EXISTS family_view_only ON big_bill_skips;
CREATE POLICY family_view_only ON big_bill_skips AS RESTRICTIVE FOR SELECT USING ((SELECT family_view_target()) IS NULL OR user_id = (SELECT family_view_target()));
