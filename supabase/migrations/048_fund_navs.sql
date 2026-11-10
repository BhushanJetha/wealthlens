-- WealthLens 048: the NAV a fund is valued at, and where it came from.
-- NAVs are taken from AMFI's official daily file (lib/amfi), matched to the
-- exact scheme — Direct or Regular plan, Growth or IDCW option each have
-- their own NAV:
--   isin        — from a CAS statement: an exact match, no guessing by name
--   nav_date    — the day the saved NAV is for
--   scheme_name — the AMFI scheme it's matched to, to check against any app
-- Run after 047. Safe to run more than once.

ALTER TABLE mutual_funds ADD COLUMN IF NOT EXISTS isin text;
ALTER TABLE mutual_funds ADD COLUMN IF NOT EXISTS nav_date date;
ALTER TABLE mutual_funds ADD COLUMN IF NOT EXISTS scheme_name text;
ALTER TABLE etf_investments ADD COLUMN IF NOT EXISTS last_updated timestamptz;
