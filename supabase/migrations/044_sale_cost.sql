-- Sell / redeem: each sale keeps what the units it sold cost (first in, first
-- out), so realised gains and the capital gains report stay exact after later
-- edits. Older rows (imports) leave it empty and are worked out from purchases.
ALTER TABLE investment_transactions ADD COLUMN IF NOT EXISTS cost_amount NUMERIC(16,2);

-- ETFs keep their buys and sales here too
ALTER TABLE investment_transactions DROP CONSTRAINT IF EXISTS investment_transactions_asset_type_check;
ALTER TABLE investment_transactions ADD CONSTRAINT investment_transactions_asset_type_check CHECK (asset_type IN ('mutual_fund', 'stock', 'etf'));
