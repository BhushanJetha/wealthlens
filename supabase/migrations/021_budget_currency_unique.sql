-- 021_budget_currency_unique.sql
-- Budgets are per-currency: an NRI plans India (INR) and UAE (AED) separately.
-- The original UNIQUE(user_id, category, month_year) collided across currencies,
-- so creating a UAE "Food" budget clashed with the India "Food" for the same
-- month (they could not coexist). Include currency in the uniqueness key.

-- Make currency reliable (no NULLs) before indexing on it.
ALTER TABLE budgets ALTER COLUMN currency SET DEFAULT 'INR';
UPDATE budgets SET currency = 'INR' WHERE currency IS NULL;
ALTER TABLE budgets ALTER COLUMN currency SET NOT NULL;

-- Drop the old currency-agnostic unique constraint (auto-named by Postgres).
ALTER TABLE budgets DROP CONSTRAINT IF EXISTS budgets_user_id_category_month_year_key;
-- Robust fallback: drop ANY unique constraint on exactly (user_id, category, month_year).
DO $$
DECLARE c text;
BEGIN
  FOR c IN
    SELECT con.conname
    FROM pg_constraint con
    WHERE con.conrelid = 'budgets'::regclass
      AND con.contype = 'u'
      AND (
        SELECT array_agg(att.attname::text ORDER BY att.attname::text)
        FROM unnest(con.conkey) k
        JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = k
      ) = ARRAY['category','month_year','user_id']
  LOOP
    EXECUTE format('ALTER TABLE budgets DROP CONSTRAINT %I', c);
  END LOOP;
END $$;

-- New uniqueness: one budget per (user, category, month, currency).
CREATE UNIQUE INDEX IF NOT EXISTS budgets_user_cat_month_cur_key
  ON budgets (user_id, category, month_year, currency);
