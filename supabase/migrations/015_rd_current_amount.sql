-- Recurring deposits had no place to store the accrued "Current Principal Amount"
-- from a bank RD statement (the client referenced months_paid, which only existed
-- on home_loans). Add both so imported RDs show the real paid-in amount & progress.
ALTER TABLE recurring_deposits ADD COLUMN IF NOT EXISTS months_paid    INTEGER DEFAULT 0;
ALTER TABLE recurring_deposits ADD COLUMN IF NOT EXISTS current_amount NUMERIC(20,2);
