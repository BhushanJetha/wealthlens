-- Add 'loan' as a valid txn_type (used for EMI/loan-on-card transactions from bank statement parser)
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_txn_type_check;
ALTER TABLE transactions ADD CONSTRAINT transactions_txn_type_check
  CHECK (txn_type IN ('expense','income','transfer','emi','loan'));
