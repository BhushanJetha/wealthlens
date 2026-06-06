-- Goals table had `country TEXT NOT NULL` (001_schema) but the goal form
-- only sent `currency`, so manual goal creation failed with a not-null error.
-- Make `country` exist everywhere, drop the NOT NULL, and backfill from currency.

ALTER TABLE goals ADD COLUMN IF NOT EXISTS country TEXT;

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'goals' AND column_name = 'country' AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE goals ALTER COLUMN country DROP NOT NULL;
  END IF;
END $$;

UPDATE goals
  SET country = CASE WHEN currency = 'AED' THEN 'UAE' ELSE 'India' END
  WHERE country IS NULL;
