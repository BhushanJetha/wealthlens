-- ================================================================
-- WealthLens — live account balances (ledger)
-- Run this in Supabase Dashboard → SQL Editor → New Query
--
-- An account's balance = its balance on `balance_as_of` + every transaction
-- tagged to it after that date (lib/ledger.ts). Statement imports and
-- "Edit balance" set a new starting point, so edits and deletes never leave a
-- balance wrong. For credit cards the balance is the outstanding amount.
--
-- counter_account_id: the other account in a move between your own accounts
--   (card bill: bank → card · ATM: bank → cash · NRE → NRO · UAE → NRE), so
--   both sides update from one entry.
-- payment_mode: how a bank payment was made (upi, netbanking, transfer,
--   debit_card, autodebit, cheque) when you choose it; otherwise the app reads
--   it from the statement description.
-- ================================================================

ALTER TABLE accounts     ADD COLUMN IF NOT EXISTS balance_as_of date;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS counter_account_id uuid references accounts(id) on delete set null;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS payment_mode text;

-- Existing accounts: their saved balance is treated as of when it was last set
UPDATE accounts SET balance_as_of = COALESCE(updated_at, created_at)::date WHERE balance_as_of IS NULL;

CREATE INDEX IF NOT EXISTS idx_txn_account_date ON transactions(account_id, txn_date);
CREATE INDEX IF NOT EXISTS idx_txn_counter ON transactions(counter_account_id);
