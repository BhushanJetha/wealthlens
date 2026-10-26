-- ================================================================
-- WealthLens — bank details per account, and a locked password vault
-- Run this in Supabase Dashboard → SQL Editor → New Query
--
-- account_details: the everyday details of a bank account or card
--   (holder, account number, IFSC / IBAN / SWIFT, branch, customer ID,
--   net banking username). Shown masked in the app.
--
-- vault_meta / vault_items: passwords are encrypted IN THE BROWSER with a
--   key made from the user's vault passphrase (PBKDF2 → AES-GCM). Only the
--   scrambled text, its IV and the salt are stored here. The passphrase and
--   the key never leave the device, so the database alone can't reveal them.
-- ================================================================

CREATE TABLE IF NOT EXISTS account_details (
  id               uuid default uuid_generate_v4() primary key,
  user_id          uuid references profiles(id) on delete cascade not null,
  account_id       uuid references accounts(id) on delete cascade not null unique,
  holder_name      text,
  account_number   text,
  ifsc             text,
  iban             text,
  swift            text,
  branch           text,
  customer_id      text,
  netbanking_user  text,
  card_network     text,          -- visa | mastercard | amex | rupay | diners
  notes            text,
  updated_at       timestamptz default now()
);

CREATE TABLE IF NOT EXISTS vault_meta (
  user_id     uuid primary key references profiles(id) on delete cascade,
  salt        text not null,      -- base64, 16 random bytes
  iterations  integer not null default 310000,
  check_iv    text not null,      -- base64 IV of the check value
  check_ct    text not null,      -- encrypted known text: proves the passphrase
  created_at  timestamptz default now()
);

CREATE TABLE IF NOT EXISTS vault_items (
  id          uuid default uuid_generate_v4() primary key,
  user_id     uuid references profiles(id) on delete cascade not null,
  account_id  uuid references accounts(id) on delete cascade,
  kind        text not null default 'netbanking_password',
  iv          text not null,
  ct          text not null,
  updated_at  timestamptz default now(),
  unique (account_id, kind)
);

-- RLS — owner-only access on all three
ALTER TABLE account_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE vault_meta      ENABLE ROW LEVEL SECURITY;
ALTER TABLE vault_items     ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS account_details_owner ON account_details;
DROP POLICY IF EXISTS vault_meta_owner ON vault_meta;
DROP POLICY IF EXISTS vault_items_owner ON vault_items;
CREATE POLICY account_details_owner ON account_details FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY vault_meta_owner      ON vault_meta      FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY vault_items_owner     ON vault_items     FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
