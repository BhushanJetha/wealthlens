-- WealthLens 049: "Verified with your app" on funds and shares. A snapshot of
-- what you checked against your broker / fund app — { units, invested, at,
-- price } — so the holding stays verified until something changes (lib/verify).
-- Run after 048. Safe to run more than once.

ALTER TABLE mutual_funds    ADD COLUMN IF NOT EXISTS verified jsonb;
ALTER TABLE stocks          ADD COLUMN IF NOT EXISTS verified jsonb;
ALTER TABLE etf_investments ADD COLUMN IF NOT EXISTS verified jsonb;
