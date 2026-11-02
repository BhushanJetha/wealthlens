-- WealthLens 042: the exact rupees that landed from a UAE → India transfer, when
-- you know them. Without it the transfer is estimated at the current rate.
-- Run after 041. Safe to run more than once.

ALTER TABLE transactions ADD COLUMN IF NOT EXISTS counter_amount numeric;
