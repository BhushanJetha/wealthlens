-- WealthLens 027: Money overview + automation.
-- Safe to run more than once.

-- Which bank account pays a loan's EMI or a credit card's bill. Used for
-- low-balance warnings on Money › Overview ("NRO is short for the EMI on the
-- 5th"). Empty = worked out from the last payment.
ALTER TABLE home_loans ADD COLUMN IF NOT EXISTS pay_from_account_id uuid REFERENCES accounts(id) ON DELETE SET NULL;
ALTER TABLE accounts   ADD COLUMN IF NOT EXISTS pay_from_account_id uuid REFERENCES accounts(id) ON DELETE SET NULL;

-- Warn when a bank account is (or is about to go) below this amount
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS low_balance_alert numeric;
