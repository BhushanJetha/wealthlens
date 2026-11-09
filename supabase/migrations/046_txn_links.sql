-- WealthLens 046: a payment linked to what it paid for. An investment payment
-- to the fund, share, RD… it bought; an EMI to its loan. Saved once (no more
-- matching by name and amount), with what linking recorded on the other side
-- so it can be taken back if the payment is deleted (lib/linkTxn):
--   { type, id, name, recorded, inv_txn_id?, loan_txn_id?, units?, month?, prev_month? }
-- Run after 045. Safe to run more than once.

ALTER TABLE transactions ADD COLUMN IF NOT EXISTS link_ref jsonb;

-- Finding the payments linked to one holding or loan
CREATE INDEX IF NOT EXISTS transactions_link_id ON transactions ((link_ref->>'id')) WHERE link_ref IS NOT NULL;
