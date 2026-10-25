-- ================================================================
-- WealthLens — your own expense and income categories
-- Run this in Supabase Dashboard → SQL Editor → New Query
-- One row per category. The app fills in the built-in list the first time
-- you open Expenses, then you can add, rename, recolour or delete.
-- Transactions keep storing the category NAME, so renaming a category also
-- renames it on your past transactions and budgets (done by the app).
-- ================================================================

CREATE TABLE IF NOT EXISTS categories (
  id          uuid default uuid_generate_v4() primary key,
  user_id     uuid references profiles(id) on delete cascade not null,
  kind        text not null default 'expense' check (kind in ('expense','income')),
  name        text not null,
  color       text not null default '#6A55E8',
  icon        text,
  sort_order  integer not null default 0,
  created_at  timestamptz default now()
);

-- No two categories of the same kind with the same name (any letter case)
CREATE UNIQUE INDEX IF NOT EXISTS categories_user_kind_name ON categories (user_id, kind, lower(name));

-- RLS — owner-only access
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS categories_owner ON categories;
CREATE POLICY categories_owner ON categories
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
