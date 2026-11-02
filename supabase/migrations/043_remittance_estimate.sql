-- WealthLens 043: a transfer's rupees stay put. An estimate is worked out once, at
-- the rate of the day, and kept, so an India balance doesn't move with the exchange
-- rate. counter_estimated says it's the app's estimate, not what you told it.
-- Includes 042, so it's fine to run this alone. Safe to run more than once.

ALTER TABLE transactions ADD COLUMN IF NOT EXISTS counter_amount numeric;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS counter_estimated boolean;
