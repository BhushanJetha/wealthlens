-- WealthLens 031: recurring goals — Diwali, birthdays, LIC premiums, gold on
-- Dhanteras… saved for every year (or every 6 / 3 months).
-- Run after 030. Safe to run more than once.

ALTER TABLE goals ADD COLUMN IF NOT EXISTS repeat_months  smallint;   -- 12 every year · 6 · 3 · empty = one-time
ALTER TABLE goals ADD COLUMN IF NOT EXISTS occasion       text;       -- diwali, dhanteras, birthday, lic… (gives the next date)
ALTER TABLE goals ADD COLUMN IF NOT EXISTS spend_category text;       -- budget category it pays for (covers that budget in its month)
ALTER TABLE goals ADD COLUMN IF NOT EXISTS source_id      uuid;       -- the LIC / insurance policy it's for
ALTER TABLE goals ADD COLUMN IF NOT EXISTS cycles_done    integer NOT NULL DEFAULT 0;

-- Yearly costs from Budgets (migration 029, budget_funds) become recurring
-- goals, with what was already put aside, so there's one place for them
DO $$
DECLARE f record; gid uuid;
BEGIN
  IF to_regclass('public.budget_funds') IS NULL THEN RETURN; END IF;
  FOR f IN SELECT * FROM budget_funds WHERE is_active LOOP
    IF EXISTS (SELECT 1 FROM goals WHERE user_id = f.user_id AND name = f.name AND repeat_months IS NOT NULL) THEN CONTINUE; END IF;
    INSERT INTO goals (user_id, name, target_amount, currency, country, target_date, category, status, icon, color, kind, priority, repeat_months, spend_category)
    VALUES (f.user_id, f.name, f.target, f.currency, CASE WHEN f.currency = 'AED' THEN 'UAE' ELSE 'India' END, f.due_date,
            'general', 'active', '🧾', '#0891B2', 'payment', 1, 12, f.category)
    RETURNING id INTO gid;
    IF f.saved > 0 THEN
      INSERT INTO goal_contributions (user_id, goal_id, amount, currency, contrib_date, note)
      VALUES (f.user_id, gid, f.saved, f.currency, current_date, 'Put aside before (yearly costs)');
    END IF;
    UPDATE budget_funds SET is_active = false WHERE id = f.id;
  END LOOP;
END $$;
