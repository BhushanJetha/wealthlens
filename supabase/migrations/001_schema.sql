-- ================================================================
-- WealthLens Complete Database Schema
-- Run in Supabase Dashboard → SQL Editor → New Query
-- ================================================================

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ================================================================
-- PROFILES — extends auth.users
-- ================================================================
CREATE TABLE IF NOT EXISTS profiles (
  id            UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email         TEXT NOT NULL,
  full_name     TEXT,
  avatar_url    TEXT,
  phone         TEXT,
  default_view  TEXT DEFAULT 'consolidated'
                  CHECK (default_view IN ('uae','india','consolidated')),
  aed_to_inr    NUMERIC(10,4) DEFAULT 22.80,
  onboarded     BOOLEAN DEFAULT FALSE,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ================================================================
-- ACCOUNTS — bank accounts & credit cards (sensitive fields encrypted)
-- ================================================================
CREATE TABLE IF NOT EXISTS accounts (
  id               UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id          UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  name             TEXT NOT NULL,
  bank_name        TEXT NOT NULL,
  account_type     TEXT NOT NULL
                     CHECK (account_type IN ('savings','current','credit_card','wallet','nol')),
  currency         TEXT NOT NULL CHECK (currency IN ('AED','INR')),
  country          TEXT NOT NULL CHECK (country IN ('UAE','India')),
  last_four        TEXT,                         -- encrypted at app layer
  credit_limit     NUMERIC(20,2),
  current_balance  NUMERIC(20,2) DEFAULT 0,
  outstanding_bal  NUMERIC(20,2) DEFAULT 0,
  minimum_due      NUMERIC(20,2),
  due_date         DATE,
  color            TEXT DEFAULT '#00C9A7',
  is_active        BOOLEAN DEFAULT TRUE,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ================================================================
-- TRANSACTIONS — all income/expense records
-- ================================================================
CREATE TABLE IF NOT EXISTS transactions (
  id               UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id          UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  account_id       UUID REFERENCES accounts(id) ON DELETE SET NULL,
  txn_date         DATE NOT NULL,
  merchant         TEXT NOT NULL,
  description      TEXT,
  category         TEXT NOT NULL,
  sub_category     TEXT,
  amount           NUMERIC(20,2) NOT NULL,
  currency         TEXT NOT NULL CHECK (currency IN ('AED','INR')),
  country          TEXT NOT NULL CHECK (country IN ('UAE','India')),
  txn_type         TEXT NOT NULL DEFAULT 'expense'
                     CHECK (txn_type IN ('expense','income','transfer','emi')),
  source           TEXT DEFAULT 'manual'
                     CHECK (source IN ('manual','statement_upload','sms_parse','email_parse')),
  raw_text         TEXT,
  is_verified      BOOLEAN DEFAULT FALSE,
  upload_id        UUID,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_txn_user_date     ON transactions(user_id, txn_date DESC);
CREATE INDEX IF NOT EXISTS idx_txn_category      ON transactions(user_id, category);
CREATE INDEX IF NOT EXISTS idx_txn_account       ON transactions(account_id);
CREATE INDEX IF NOT EXISTS idx_txn_country       ON transactions(user_id, country);

-- ================================================================
-- STOCKS
-- ================================================================
CREATE TABLE IF NOT EXISTS stocks (
  id            UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id       UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  symbol        TEXT NOT NULL,
  name          TEXT NOT NULL,
  exchange      TEXT NOT NULL,
  currency      TEXT NOT NULL CHECK (currency IN ('AED','INR')),
  country       TEXT NOT NULL CHECK (country IN ('UAE','India')),
  quantity      NUMERIC(20,6) NOT NULL DEFAULT 0,
  avg_buy_price NUMERIC(20,4) NOT NULL,
  current_price NUMERIC(20,4),
  sector        TEXT,
  last_updated  TIMESTAMPTZ DEFAULT NOW(),
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ================================================================
-- MUTUAL FUNDS
-- ================================================================
CREATE TABLE IF NOT EXISTS mutual_funds (
  id              UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id         UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  fund_name       TEXT NOT NULL,
  fund_type       TEXT NOT NULL
                    CHECK (fund_type IN ('equity','debt','hybrid','elss','index','liquid')),
  folio_number    TEXT,
  units           NUMERIC(20,6) NOT NULL DEFAULT 0,
  avg_nav         NUMERIC(20,4) NOT NULL,
  current_nav     NUMERIC(20,4),
  invested_amount NUMERIC(20,2) NOT NULL,
  currency        TEXT DEFAULT 'INR',
  country         TEXT DEFAULT 'India',
  last_updated    TIMESTAMPTZ DEFAULT NOW(),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ================================================================
-- FIXED DEPOSITS
-- ================================================================
CREATE TABLE IF NOT EXISTS fixed_deposits (
  id            UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id       UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  name          TEXT NOT NULL,
  bank_name     TEXT NOT NULL,
  principal     NUMERIC(20,2) NOT NULL,
  interest_rate NUMERIC(6,4) NOT NULL,
  start_date    DATE NOT NULL,
  maturity_date DATE NOT NULL,
  maturity_amt  NUMERIC(20,2),
  currency      TEXT NOT NULL CHECK (currency IN ('AED','INR')),
  country       TEXT NOT NULL CHECK (country IN ('UAE','India')),
  is_active     BOOLEAN DEFAULT TRUE,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ================================================================
-- RECURRING DEPOSITS
-- ================================================================
CREATE TABLE IF NOT EXISTS recurring_deposits (
  id             UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id        UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  name           TEXT NOT NULL,
  bank_name      TEXT NOT NULL,
  monthly_amount NUMERIC(20,2) NOT NULL,
  interest_rate  NUMERIC(6,4) NOT NULL,
  start_date     DATE NOT NULL,
  maturity_date  DATE NOT NULL,
  tenure_months  INTEGER NOT NULL,
  currency       TEXT NOT NULL CHECK (currency IN ('AED','INR')),
  country        TEXT NOT NULL CHECK (country IN ('UAE','India')),
  is_active      BOOLEAN DEFAULT TRUE,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- ================================================================
-- HOME LOANS
-- ================================================================
CREATE TABLE IF NOT EXISTS home_loans (
  id               UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id          UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  name             TEXT NOT NULL,
  bank_name        TEXT NOT NULL,
  property_address TEXT,
  sanctioned_amt   NUMERIC(20,2) NOT NULL,
  outstanding_amt  NUMERIC(20,2) NOT NULL,
  emi_amount       NUMERIC(20,2) NOT NULL,
  interest_rate    NUMERIC(6,4) NOT NULL,
  loan_start_date  DATE NOT NULL,
  tenure_months    INTEGER NOT NULL,
  months_paid      INTEGER DEFAULT 0,
  currency         TEXT NOT NULL CHECK (currency IN ('AED','INR')),
  country          TEXT NOT NULL CHECK (country IN ('UAE','India')),
  next_emi_date    DATE,
  is_active        BOOLEAN DEFAULT TRUE,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ================================================================
-- INSURANCE POLICIES
-- ================================================================
CREATE TABLE IF NOT EXISTS insurance_policies (
  id                  UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id             UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  policy_name         TEXT NOT NULL,
  policy_number       TEXT,
  provider            TEXT NOT NULL,
  policy_type         TEXT NOT NULL
                        CHECK (policy_type IN ('term_life','health','property','vehicle','travel','other')),
  sum_assured         NUMERIC(20,2),
  annual_premium      NUMERIC(20,2) NOT NULL,
  premium_frequency   TEXT DEFAULT 'annual'
                        CHECK (premium_frequency IN ('monthly','quarterly','semi_annual','annual')),
  start_date          DATE NOT NULL,
  expiry_date         DATE NOT NULL,
  next_premium_date   DATE,
  currency            TEXT NOT NULL CHECK (currency IN ('AED','INR')),
  country             TEXT NOT NULL CHECK (country IN ('UAE','India')),
  insured_members     TEXT[],
  document_url        TEXT,
  ai_extracted_data   JSONB,
  key_benefits        TEXT[],
  is_active           BOOLEAN DEFAULT TRUE,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ================================================================
-- BUDGETS
-- ================================================================
CREATE TABLE IF NOT EXISTS budgets (
  id          UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id     UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  category    TEXT NOT NULL,
  monthly_cap NUMERIC(20,2) NOT NULL,
  currency    TEXT DEFAULT 'INR',
  month_year  TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, category, month_year)
);

-- ================================================================
-- GOALS
-- ================================================================
CREATE TABLE IF NOT EXISTS goals (
  id             UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id        UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  name           TEXT NOT NULL,
  target_amount  NUMERIC(20,2) NOT NULL,
  current_amount NUMERIC(20,2) DEFAULT 0,
  target_date    DATE NOT NULL,
  currency       TEXT NOT NULL CHECK (currency IN ('AED','INR')),
  country        TEXT NOT NULL CHECK (country IN ('UAE','India')),
  color          TEXT DEFAULT '#00C9A7',
  emoji          TEXT DEFAULT '🎯',
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

-- ================================================================
-- STATEMENT UPLOADS — track every file parsed
-- ================================================================
CREATE TABLE IF NOT EXISTS statement_uploads (
  id                UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id           UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  file_name         TEXT NOT NULL,
  file_size         INTEGER,
  file_type         TEXT NOT NULL
                      CHECK (file_type IN ('bank_statement','credit_card_statement','insurance_document')),
  bank_name         TEXT,
  currency          TEXT,
  country           TEXT,
  status            TEXT DEFAULT 'processing'
                      CHECK (status IN ('processing','completed','failed','review_needed')),
  txns_parsed       INTEGER DEFAULT 0,
  ai_raw_response   JSONB,
  error_message     TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ================================================================
-- CHAT SESSIONS — AI advisor conversation history
-- ================================================================
CREATE TABLE IF NOT EXISTS chat_sessions (
  id         UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id    UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  messages   JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ================================================================
-- ROW LEVEL SECURITY — every user sees only their own data
-- ================================================================
ALTER TABLE profiles           ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounts           ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE stocks             ENABLE ROW LEVEL SECURITY;
ALTER TABLE mutual_funds       ENABLE ROW LEVEL SECURITY;
ALTER TABLE fixed_deposits     ENABLE ROW LEVEL SECURITY;
ALTER TABLE recurring_deposits ENABLE ROW LEVEL SECURITY;
ALTER TABLE home_loans         ENABLE ROW LEVEL SECURITY;
ALTER TABLE insurance_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE budgets            ENABLE ROW LEVEL SECURITY;
ALTER TABLE goals              ENABLE ROW LEVEL SECURITY;
ALTER TABLE statement_uploads  ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_sessions      ENABLE ROW LEVEL SECURITY;

-- Profiles policies
DROP POLICY IF EXISTS "profile_select" ON profiles;
DROP POLICY IF EXISTS "profile_insert" ON profiles;
DROP POLICY IF EXISTS "profile_update" ON profiles;
CREATE POLICY "profile_select" ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "profile_insert" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "profile_update" ON profiles FOR UPDATE USING (auth.uid() = id);

-- Generic user-owned table policies
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'accounts','transactions','stocks','mutual_funds','fixed_deposits',
    'recurring_deposits','home_loans','insurance_policies','budgets',
    'goals','statement_uploads','chat_sessions'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "%s_sel" ON %I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "%s_ins" ON %I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "%s_upd" ON %I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "%s_del" ON %I', t, t);
    EXECUTE format('CREATE POLICY "%s_sel" ON %I FOR SELECT USING (auth.uid()=user_id)', t, t);
    EXECUTE format('CREATE POLICY "%s_ins" ON %I FOR INSERT WITH CHECK (auth.uid()=user_id)', t, t);
    EXECUTE format('CREATE POLICY "%s_upd" ON %I FOR UPDATE USING (auth.uid()=user_id)', t, t);
    EXECUTE format('CREATE POLICY "%s_del" ON %I FOR DELETE USING (auth.uid()=user_id)', t, t);
  END LOOP;
END $$;

-- ================================================================
-- TRIGGERS — auto-create profile + updated_at
-- ================================================================
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles(id, email, full_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.email, NEW.raw_user_meta_data->>'email'),
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'avatar_url'
  ) ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS t_profiles_updated  ON profiles;
DROP TRIGGER IF EXISTS t_accounts_updated  ON accounts;
DROP TRIGGER IF EXISTS t_loans_updated     ON home_loans;
DROP TRIGGER IF EXISTS t_insurance_updated ON insurance_policies;
DROP TRIGGER IF EXISTS t_goals_updated     ON goals;
DROP TRIGGER IF EXISTS t_chat_updated      ON chat_sessions;
CREATE TRIGGER t_profiles_updated     BEFORE UPDATE ON profiles           FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER t_accounts_updated     BEFORE UPDATE ON accounts           FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER t_loans_updated        BEFORE UPDATE ON home_loans         FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER t_insurance_updated    BEFORE UPDATE ON insurance_policies FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER t_goals_updated        BEFORE UPDATE ON goals              FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER t_chat_updated         BEFORE UPDATE ON chat_sessions      FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- ================================================================
-- SUPABASE STORAGE BUCKETS for file uploads
-- ================================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('statements', 'statements', FALSE, 10485760, ARRAY['application/pdf','text/csv','image/jpeg','image/png']),
  ('insurance-docs', 'insurance-docs', FALSE, 20971520, ARRAY['application/pdf','image/jpeg','image/png'])
ON CONFLICT (id) DO NOTHING;

-- Storage RLS — users can only access their own folder
DROP POLICY IF EXISTS "statements_user_access" ON storage.objects;
DROP POLICY IF EXISTS "insurance_user_access"  ON storage.objects;
CREATE POLICY "statements_user_access" ON storage.objects
  FOR ALL USING (bucket_id = 'statements' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "insurance_user_access" ON storage.objects
  FOR ALL USING (bucket_id = 'insurance-docs' AND auth.uid()::text = (storage.foldername(name))[1]);
