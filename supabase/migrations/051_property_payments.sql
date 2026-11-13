-- 051: a property's cost and its payments (lib/property)
--   cost_breakup   {price, stamp, other} — price, stamp duty & registration, other charges
--   status         'ready' | 'construction'
--   possession_date when an under-construction home is handed over
--   schedule       the builder's payment steps: [{id, label, due, amount, payer: 'loan'|'self'|'both'}]
--                  (a property linked to a loan without one shows the loan's payment plan)
--   own_payments   your own payments for a home with no loan: [{id, date, amount, note}]
--                  (with a loan they stay on the loan as own contributions, so they're kept once)

ALTER TABLE other_assets ADD COLUMN IF NOT EXISTS cost_breakup    jsonb;
ALTER TABLE other_assets ADD COLUMN IF NOT EXISTS status          text;
ALTER TABLE other_assets ADD COLUMN IF NOT EXISTS possession_date date;
ALTER TABLE other_assets ADD COLUMN IF NOT EXISTS schedule        jsonb;
ALTER TABLE other_assets ADD COLUMN IF NOT EXISTS own_payments    jsonb;
