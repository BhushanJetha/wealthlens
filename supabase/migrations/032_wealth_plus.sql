-- WealthLens 032: everything you own (property, vehicles, jewellery and
-- investments without their own page), your investor profile and target mix,
-- UAE gratuity, nominees, NRE / NRO accounts, and portfolio reviews.
-- Run after 031. Safe to run more than once.

-- ── Property, vehicles, jewellery, other investments ─────────────────────────
CREATE TABLE IF NOT EXISTS other_assets (
  id              uuid default uuid_generate_v4() primary key,
  user_id         uuid references profiles(id) on delete cascade not null,
  kind            text not null,            -- property, land, vehicle, jewellery, business, us_stocks, uae_broker, esop, crypto, other
  name            text not null,
  currency        text not null default 'INR' check (currency in ('AED', 'INR', 'USD')),
  current_value   numeric not null default 0, -- your estimate, as of value_as_of
  value_as_of     date default current_date,
  growth_pct      numeric,                  -- yearly rise you expect on that estimate (empty = none)
  purchase_price  numeric,
  purchase_date   date,
  units           numeric,                  -- priced holdings: units × price
  price           numeric,
  symbol          text,                     -- ticker, for a live price
  unvested_units  numeric,                  -- ESOP / RSU not yet yours
  next_vest_date  date,
  platform        text,                     -- broker, exchange or where it's kept
  loan_id         uuid references home_loans(id) on delete set null,   -- the loan that bought it
  country         text,
  holder_name     text,
  nominee         text,
  notes           text,
  is_active       boolean not null default true,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);
CREATE INDEX IF NOT EXISTS idx_other_assets_user ON other_assets(user_id);
ALTER TABLE other_assets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS other_assets_owner ON other_assets;
CREATE POLICY other_assets_owner ON other_assets
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ── Investor profile: your answers, target mix per currency, UAE gratuity ────
CREATE TABLE IF NOT EXISTS investor_profile (
  user_id     uuid primary key references profiles(id) on delete cascade,
  answers     jsonb not null default '{}'::jsonb,   -- the questionnaire
  targets     jsonb,                                -- { "INR": { "equity": 60, "debt": 30, "gold": 10 }, "AED": {…} }
  gratuity    jsonb,                                -- { "basic": 12000, "joined": "2019-04-01", "include": true }
  updated_at  timestamptz default now()
);
ALTER TABLE investor_profile ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS investor_profile_owner ON investor_profile;
CREATE POLICY investor_profile_owner ON investor_profile
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ── Portfolio reviews: quarterly, half-yearly, yearly, or any time ───────────
CREATE TABLE IF NOT EXISTS portfolio_reviews (
  id            uuid default uuid_generate_v4() primary key,
  user_id       uuid references profiles(id) on delete cascade not null,
  kind          text not null check (kind in ('quarter', 'half', 'year', 'now')),
  label         text not null,              -- "Q2 2026-27", "H1 2026-27", "FY 2026-27", "28 Oct 2026"
  period_start  date,
  period_end    date not null,
  data          jsonb not null,             -- the report
  market_view   jsonb,                      -- AI market view, when a key is set
  seen_at       timestamptz,
  created_at    timestamptz default now()
);
CREATE INDEX IF NOT EXISTS idx_portfolio_reviews_user ON portfolio_reviews(user_id, period_end DESC);
CREATE UNIQUE INDEX IF NOT EXISTS portfolio_reviews_period_key ON portfolio_reviews(user_id, kind, period_end) WHERE kind <> 'now';
ALTER TABLE portfolio_reviews ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS portfolio_reviews_owner ON portfolio_reviews;
CREATE POLICY portfolio_reviews_owner ON portfolio_reviews
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ── Nominees: who gets each account, investment and policy ───────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['accounts', 'stocks', 'mutual_funds', 'etf_investments', 'fixed_deposits', 'recurring_deposits',
    'nps_accounts', 'ppf_epf_accounts', 'gold_investments', 'bond_investments', 'lic_policies', 'insurance_policies'] LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS nominee text', t);
    END IF;
  END LOOP;
END $$;

-- ── Indian bank accounts: NRE, NRO, FCNR or resident ─────────────────────────
-- Existing accounts are guessed from their name; change it on Bank accounts
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS nri_kind text;
UPDATE accounts SET nri_kind = CASE
    WHEN name ~* '\mNRE\M' THEN 'nre'
    WHEN name ~* '\mNRO\M' THEN 'nro'
    WHEN name ~* 'FCNR' THEN 'fcnr'
  END
  WHERE nri_kind IS NULL AND currency = 'INR' AND account_type <> 'credit_card';
