-- ================================================================
-- 019: Richer loan tracking
--   * home_loans: disbursed amount, property cost, cost breakup
--   * loan_transactions: disbursements, EMI/prepayments, and (for home
--     loans) own-contribution / down-payment entries — each can occur
--     multiple times with its own date & amount.
-- ================================================================

ALTER TABLE home_loans ADD COLUMN IF NOT EXISTS disbursed_amt NUMERIC(20,2);
ALTER TABLE home_loans ADD COLUMN IF NOT EXISTS property_cost NUMERIC(20,2);
ALTER TABLE home_loans ADD COLUMN IF NOT EXISTS cost_breakup  JSONB;

CREATE TABLE IF NOT EXISTS loan_transactions (
  id         UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id    UUID REFERENCES profiles(id)   ON DELETE CASCADE NOT NULL,
  loan_id    UUID REFERENCES home_loans(id)  ON DELETE CASCADE NOT NULL,
  kind       TEXT NOT NULL CHECK (kind IN ('disbursement','emi','prepayment','own_contribution','charge')),
  txn_date   DATE NOT NULL,
  amount     NUMERIC(20,2) NOT NULL,
  principal  NUMERIC(20,2),
  interest   NUMERIC(20,2),
  note       TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE loan_transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS loan_txn_owner ON loan_transactions;
CREATE POLICY loan_txn_owner ON loan_transactions
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_loan_txn_loan ON loan_transactions(loan_id);
