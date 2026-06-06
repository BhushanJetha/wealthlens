-- Unified investment transaction history for Mutual Funds and Stocks.
-- Powers month-on-month / year-on-year investment & returns analytics.
-- Populated from CAMS CAS imports (with real historical dates) and from
-- in-app buy actions.

CREATE TABLE IF NOT EXISTS investment_transactions (
  id            UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id       UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  asset_type    TEXT NOT NULL CHECK (asset_type IN ('mutual_fund','stock')),
  asset_id      UUID,                       -- mutual_funds.id or stocks.id (soft link)
  asset_name    TEXT NOT NULL,              -- fund name / stock symbol (display + matching)
  folio_number  TEXT,
  txn_date      DATE NOT NULL,
  txn_type      TEXT NOT NULL DEFAULT 'purchase'
                  CHECK (txn_type IN ('purchase','sip','switch_in','redemption','switch_out','dividend','charge','other')),
  amount        NUMERIC(20,2) NOT NULL DEFAULT 0,
  units         NUMERIC(20,6),
  nav           NUMERIC(20,6),
  currency      TEXT NOT NULL DEFAULT 'INR',
  source        TEXT NOT NULL DEFAULT 'cas_import',  -- cas_import | manual | buy_action
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inv_txn_user  ON investment_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_inv_txn_asset ON investment_transactions(asset_id);
CREATE INDEX IF NOT EXISTS idx_inv_txn_date  ON investment_transactions(txn_date);

ALTER TABLE investment_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own investment transactions" ON investment_transactions;
CREATE POLICY "Users manage own investment transactions" ON investment_transactions
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
