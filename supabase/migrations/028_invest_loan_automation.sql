-- WealthLens 028: Investments & loans automation.
-- Safe to run more than once.

-- SIPs: recorded on their day — automatically when your bank statement shows
-- the debit (or you've chosen "record it for me"), else after a one-tap
-- confirm. sip_last_month (YYYY-MM) is the latest month recorded or skipped,
-- so a month is never recorded twice.
ALTER TABLE mutual_funds ADD COLUMN IF NOT EXISTS sip_auto       boolean NOT NULL DEFAULT false;
ALTER TABLE mutual_funds ADD COLUMN IF NOT EXISTS sip_last_month text;
ALTER TABLE mutual_funds ADD COLUMN IF NOT EXISTS sip_account_id uuid REFERENCES accounts(id) ON DELETE SET NULL;

-- EMIs: the same, per loan
ALTER TABLE home_loans ADD COLUMN IF NOT EXISTS emi_auto       boolean NOT NULL DEFAULT false;
ALTER TABLE home_loans ADD COLUMN IF NOT EXISTS emi_last_month text;

-- Live outstanding: outstanding_amt is the balance on this date; EMIs and
-- prepayments recorded after it bring it down (like account balances).
ALTER TABLE home_loans ADD COLUMN IF NOT EXISTS outstanding_as_of date;
UPDATE home_loans SET outstanding_as_of = COALESCE(updated_at, created_at)::date WHERE outstanding_as_of IS NULL;
ALTER TABLE home_loans ALTER COLUMN outstanding_as_of SET DEFAULT CURRENT_DATE;

-- Whenever the outstanding is written (edit form, loan statement import),
-- it becomes the new starting point — unless the date was set with it.
CREATE OR REPLACE FUNCTION loans_outstanding_as_of() RETURNS trigger AS $$
BEGIN
  IF NEW.outstanding_amt IS DISTINCT FROM OLD.outstanding_amt
     AND NEW.outstanding_as_of IS NOT DISTINCT FROM OLD.outstanding_as_of THEN
    NEW.outstanding_as_of := CURRENT_DATE;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS t_loans_outstanding_as_of ON home_loans;
CREATE TRIGGER t_loans_outstanding_as_of BEFORE UPDATE ON home_loans
  FOR EACH ROW EXECUTE FUNCTION loans_outstanding_as_of();
