-- WealthLens 050:
-- 1. SIP units first recorded at an estimate (the NAV on the SIP day) until you
--    confirm the day the units were allotted; then they're worked out from
--    that day's NAV (lib/allotment).
-- 2. Income that's for another month: a salary landing at the month's end that
--    pays for the next month counts in that month's income (lib/payCycle).
--    The bank still shows it on the day it arrived.
-- Run after 049. Safe to run more than once.

ALTER TABLE investment_transactions ADD COLUMN IF NOT EXISTS estimated boolean NOT NULL DEFAULT false;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS counts_for_month text;
