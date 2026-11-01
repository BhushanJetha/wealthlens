-- WealthLens 036: splitting with friends.
-- You paid for friends too: the transaction keeps its full amount (that's what
-- left your account) and txn_splits says what each friend owes you back; only
-- your share counts as spending. A friend paid for you: a transaction with no
-- account and paid_by_friend_id — your share is spending, nothing leaves your
-- accounts, and you owe them. Money back (either way) is a transaction with
-- friend_id: it settles up and is never income or spending.
-- Run after 035. Safe to run more than once.

CREATE TABLE IF NOT EXISTS friends (
  id          uuid default uuid_generate_v4() primary key,
  user_id     uuid references profiles(id) on delete cascade not null,
  name        text not null,
  created_at  timestamptz default now()
);
CREATE INDEX IF NOT EXISTS idx_friends_user ON friends(user_id);
ALTER TABLE friends ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS friends_owner ON friends;
CREATE POLICY friends_owner ON friends
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- What each friend owes you from a transaction you paid
CREATE TABLE IF NOT EXISTS txn_splits (
  id              uuid default uuid_generate_v4() primary key,
  user_id         uuid references profiles(id) on delete cascade not null,
  transaction_id  uuid references transactions(id) on delete cascade not null,
  friend_id       uuid references friends(id) on delete cascade not null,
  amount          numeric not null check (amount > 0),
  created_at      timestamptz default now()
);
CREATE INDEX IF NOT EXISTS idx_txn_splits_txn ON txn_splits(transaction_id);
CREATE INDEX IF NOT EXISTS idx_txn_splits_friend ON txn_splits(user_id, friend_id);
ALTER TABLE txn_splits ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS txn_splits_owner ON txn_splits;
CREATE POLICY txn_splits_owner ON txn_splits
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- friend_share: the total of txn_splits for the transaction (kept on the row
-- so every total can count your share without reading the splits)
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS friend_share numeric;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS paid_by_friend_id uuid REFERENCES friends(id) ON DELETE SET NULL;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS friend_id uuid REFERENCES friends(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_transactions_friend ON transactions(user_id, friend_id) WHERE friend_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_transactions_paid_by_friend ON transactions(user_id, paid_by_friend_id) WHERE paid_by_friend_id IS NOT NULL;
