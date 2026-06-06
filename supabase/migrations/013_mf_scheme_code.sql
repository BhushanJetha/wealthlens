-- Cache the matched mfapi.in scheme code on each fund so live NAV lookups are
-- exact and fast (no fuzzy name search needed after the first match).
ALTER TABLE mutual_funds
  ADD COLUMN IF NOT EXISTS scheme_code INTEGER;
