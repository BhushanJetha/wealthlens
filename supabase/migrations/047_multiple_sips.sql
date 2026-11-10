-- WealthLens 047: more than one SIP on a mutual fund. mutual_funds.sips is the
-- list — each { id, amount, day, account_id, auto, last_month, active } — and
-- sips_rev counts changes, so two open tabs can't record the same month twice
-- (lib/sips). The fund's single-SIP fields stay as a summary of the list (the
-- total a month, the earliest day). Each fund's SIP so far becomes its first
-- one. Run after 046. Safe to run more than once.

ALTER TABLE mutual_funds ADD COLUMN IF NOT EXISTS sips jsonb;
ALTER TABLE mutual_funds ADD COLUMN IF NOT EXISTS sips_rev integer NOT NULL DEFAULT 0;

UPDATE mutual_funds SET sips = jsonb_build_array(jsonb_build_object(
    'id',         uuid_generate_v4()::text,
    'amount',     sip_amount,
    'day',        LEAST(GREATEST(COALESCE(sip_date, 5), 1), 28),
    'account_id', sip_account_id,
    'auto',       COALESCE(sip_auto, false),
    'last_month', sip_last_month,
    'active',     true))
 WHERE sips IS NULL AND has_sip AND COALESCE(sip_amount, 0) > 0;
