-- WealthLens 037: fixed payments enter themselves.
-- On its day a repeating expense, EMI, SIP or RD instalment is added to your
-- transactions and counted straight away. auto_status 'pending' = you haven't
-- approved it yet (NULL = approved or a normal entry). auto_ref says what made
-- it, so "Not paid" can undo it and a statement's real row can replace it.
-- Run after 036. Safe to run more than once.

ALTER TABLE transactions ADD COLUMN IF NOT EXISTS auto_status text;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS auto_ref jsonb;
CREATE INDEX IF NOT EXISTS idx_transactions_auto_pending ON transactions(user_id) WHERE auto_status = 'pending';

-- RD instalments: last month entered, entered without review?, and the account paying it
ALTER TABLE recurring_deposits ADD COLUMN IF NOT EXISTS rd_last_month text;
ALTER TABLE recurring_deposits ADD COLUMN IF NOT EXISTS rd_auto boolean DEFAULT false;
ALTER TABLE recurring_deposits ADD COLUMN IF NOT EXISTS rd_account_id uuid REFERENCES accounts(id) ON DELETE SET NULL;
