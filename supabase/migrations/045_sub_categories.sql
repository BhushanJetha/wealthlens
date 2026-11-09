-- WealthLens 045: categories and sub-categories, need or want.
-- Transactions keep storing one name (the sub-category: Groceries, Fuel…).
-- The ten categories it belongs to are fixed in the app; a sub-category you
-- add yourself says which one in `categories.parent`. `categories.need` is
-- your own need (true) / want (false) choice over the built-in one.
-- Then the older, wider names are split by merchant where it's clear, and
-- what isn't clear stays where it was (Food, Travel & transport, Health and
-- Utilities each still mean their category in general). Amounts, dates and
-- accounts never change. Run after 044. Safe to run more than once.

ALTER TABLE categories ADD COLUMN IF NOT EXISTS parent text;
ALTER TABLE categories ADD COLUMN IF NOT EXISTS need boolean;

-- What the statement said, in one string to match against
CREATE OR REPLACE FUNCTION pg_temp.said(m text, d text) RETURNS text
  LANGUAGE sql IMMUTABLE AS $$ SELECT lower(coalesce(m, '') || ' ' || coalesce(d, '')) $$;

-- ── Food → Groceries / Eating out / Delivery ────────────────────────────────
UPDATE transactions SET category = 'Delivery'
 WHERE category = 'Food' AND txn_type <> 'income'
   AND pg_temp.said(merchant, description) ~ '(talabat|deliveroo|zomato|swiggy|noon ?food|careem ?food|uber ?eats|eatclub|box8|faasos|smiles|instashop food)';
UPDATE transactions SET category = 'Groceries'
 WHERE category = 'Food' AND txn_type <> 'income'
   AND pg_temp.said(merchant, description) ~ '(carrefour|lulu|spinneys|waitrose|union ?coop|choithram|grandiose|viva |nesto|al ?maya|west ?zone|kibsons|instashop|el ?grocer|amazon ?fresh|bigbasket|big ?basket|blinkit|zepto|dmart|d-mart|reliance ?fresh|nature.?s ?basket|more ?retail|spar |supermarket|hypermarket|grocer|minimart|mini ?mart|baqala|vegetable|fruit|dairy|milk)';
-- The statement readers used to file supermarkets under Shopping
UPDATE transactions SET category = 'Groceries'
 WHERE category = 'Shopping' AND txn_type <> 'income'
   AND pg_temp.said(merchant, description) ~ '(carrefour|lulu|spinneys|waitrose|union ?coop|choithram|grandiose|nesto|al ?maya|west ?zone|kibsons|instashop|el ?grocer|bigbasket|big ?basket|blinkit|zepto|dmart|d-mart|reliance ?fresh|supermarket|hypermarket|grocer|minimart|mini ?mart|baqala)'
   AND pg_temp.said(merchant, description) !~ '(exchange|remit)';
UPDATE transactions SET category = 'Eating out'
 WHERE category = 'Food' AND txn_type <> 'income'
   AND pg_temp.said(merchant, description) ~ '(restaurant|resto|cafe|café|coffee|starbucks|costa|tim hortons|caribou|mcdonald|kfc|burger|pizza|domino|subway|shawarma|grill|kitchen|bistro|eatery|diner|biryani|dhaba|bakery|tea |chai|juice|dine)';

-- ── Travel & transport → Fuel / Salik / Parking & fines / Taxi & metro ─────
UPDATE transactions SET category = 'Fuel'
 WHERE category = 'Travel & transport' AND txn_type <> 'income'
   AND pg_temp.said(merchant, description) ~ '(adnoc|enoc|eppco|emarat|petrol|fuel|indian ?oil|iocl|hpcl|bpcl|bharat ?petroleum|shell )';
UPDATE transactions SET category = 'Salik'
 WHERE category = 'Travel & transport' AND txn_type <> 'income'
   AND pg_temp.said(merchant, description) ~ '(salik|darb|fastag|toll)';
UPDATE transactions SET category = 'Parking & fines'
 WHERE category = 'Travel & transport' AND txn_type <> 'income'
   AND pg_temp.said(merchant, description) ~ '(parking|mawaqif|parkin|traffic fine|\mfine\M|challan)';
UPDATE transactions SET category = 'Taxi & metro'
 WHERE category = 'Travel & transport' AND txn_type <> 'income'
   AND pg_temp.said(merchant, description) ~ '(careem|uber|\mola\M|rapido|taxi|\mcab\M|\mrta\M|metro|\mnol\M|hala|yango|blablacar|redbus|\mbus\M)';
UPDATE transactions SET category = 'Flights'
 WHERE category = 'Travel & transport' AND txn_type <> 'income'
   AND pg_temp.said(merchant, description) ~ '(airline|airways|air ?arabia|flydubai|emirates air|etihad|indigo|air ?india|spicejet|akasa|vistara|\mflight)';
UPDATE transactions SET category = 'Holidays'
 WHERE category = 'Travel & transport' AND txn_type <> 'income'
   AND pg_temp.said(merchant, description) ~ '(hotel|resort|airbnb|booking\.com|agoda|\moyo\M|makemytrip|goibibo|cleartrip|yatra|holiday|vacation|tour)';

-- ── Utilities → Mobile & internet ──────────────────────────────────────────
UPDATE transactions SET category = 'Mobile & internet'
 WHERE category = 'Utilities' AND txn_type <> 'income'
   AND pg_temp.said(merchant, description) ~ '(\mdu\M|etisalat|\me&|virgin ?mobile|\mjio\M|airtel|vodafone|\mvi\M|bsnl|\midea\M|broadband|fibre|fiber|internet|wifi|postpaid|prepaid|recharge|act ?fibernet|hathway)';

-- ── Health → Medicines ─────────────────────────────────────────────────────
UPDATE transactions SET category = 'Medicines'
 WHERE category = 'Health' AND txn_type <> 'income'
   AND pg_temp.said(merchant, description) ~ '(pharmacy|pharma|chemist|aster|life ?pharmacy|boots|apollo ?pharmacy|medplus|1mg|pharmeasy|netmeds|medical store)';

-- ── Gym, sports and clubs → Sports & fitness (wherever they were put) ──────
UPDATE transactions SET category = 'Sports & fitness'
 WHERE category IN ('Health', 'Entertainment', 'Shopping', 'Other', 'Personal Care') AND txn_type <> 'income'
   AND pg_temp.said(merchant, description) ~ '(\mgym|fitness|cult\.?fit|gold.?s gym|badminton|table tennis|tennis|padel|squash|swimming|\myoga|decathlon|sports club|sport club|playo|hudle)';

-- ── Budgets: a budget on a whole category keeps covering all of it ──────────
-- Travel & transport → Transport; Utilities → Bills (with any Subscription
-- budget's amount added, as Bills now covers subscriptions too — the
-- Subscription budget stays as a limit inside it).
DO $$
DECLARE r record; sub numeric;
BEGIN
  FOR r IN SELECT * FROM budgets WHERE category = 'Travel & transport' LOOP
    IF NOT EXISTS (SELECT 1 FROM budgets b WHERE b.user_id = r.user_id AND b.month_year = r.month_year AND b.currency = r.currency
                   AND coalesce(b.holder_name, '') = coalesce(r.holder_name, '') AND b.category = 'Transport') THEN
      UPDATE budgets SET category = 'Transport' WHERE id = r.id;
    END IF;
  END LOOP;
  FOR r IN SELECT * FROM budgets WHERE category = 'Utilities' LOOP
    IF NOT EXISTS (SELECT 1 FROM budgets b WHERE b.user_id = r.user_id AND b.month_year = r.month_year AND b.currency = r.currency
                   AND coalesce(b.holder_name, '') = coalesce(r.holder_name, '') AND b.category = 'Bills') THEN
      SELECT coalesce(sum(monthly_cap), 0) INTO sub FROM budgets b WHERE b.user_id = r.user_id AND b.month_year = r.month_year
        AND b.currency = r.currency AND coalesce(b.holder_name, '') = coalesce(r.holder_name, '') AND b.category = 'Subscription';
      UPDATE budgets SET category = 'Bills', monthly_cap = r.monthly_cap + sub WHERE id = r.id;
    END IF;
  END LOOP;
END $$;
