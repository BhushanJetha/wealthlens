-- Track how each mutual fund got into the app: a CAMS / KFintech statement import
-- or a manual add. Used for the source tag on the Mutual Funds page.
ALTER TABLE mutual_funds ADD COLUMN IF NOT EXISTS source TEXT;  -- 'cams' | 'kfintech' | 'manual'
