-- WealthLens 033: credit cards — a payment due DAY (the month rolls on by
-- itself), and loans taken on a card (cash on card, a purchase turned into
-- EMIs) linked to that card. Run after 032. Safe to run more than once.

-- Due day of the month (1–31); the next due date is worked out from it.
-- Existing cards take the day from their saved due date.
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS due_day smallint CHECK (due_day BETWEEN 1 AND 31);
UPDATE accounts SET due_day = EXTRACT(DAY FROM due_date)::smallint
  WHERE due_day IS NULL AND due_date IS NOT NULL AND account_type = 'credit_card';

-- Loans on a card: the card is the loan's pay_from_account_id (EMIs are billed
-- to it, and what's still owed blocks that much of its limit).
ALTER TABLE home_loans ADD COLUMN IF NOT EXISTS flat_rate      numeric;   -- the rate as the bank quotes it, when it's a flat rate
ALTER TABLE home_loans ADD COLUMN IF NOT EXISTS card_loan_kind text;      -- cash (money to your bank) · purchase (a card purchase turned into EMIs)
