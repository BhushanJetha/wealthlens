-- WealthLens 035: does a credit card's balance include its card loans?
-- Banks differ: some show a loan on the card (or a purchase turned into EMIs)
-- inside the card's outstanding, others show it separately. When it's inside,
-- WealthLens takes it out of the card's balance once and counts it under
-- Loans only — so card usage, net worth and what's owed don't count it twice.
-- NULL = not asked yet. Run after 034. Safe to run more than once.

ALTER TABLE accounts ADD COLUMN IF NOT EXISTS balance_includes_loans boolean;
