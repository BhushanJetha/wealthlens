-- WealthLens 034: one "Travel & transport" category (Travel, Transport and
-- Trip/Vacation merged), and events & trips — a trip, a function at home, a
-- festival — that expenses are tagged to (they keep their own category, so
-- nothing is counted twice). Run after 033. Safe to run more than once.

-- ── Travel + Transport + Trip/Vacation → Travel & transport ─────────────────
UPDATE transactions SET category = 'Travel & transport' WHERE category IN ('Transport', 'Travel', 'Trip/Vacation');

-- Budgets: the three become one per month / currency / person, caps added together
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT user_id, month_year, currency, coalesce(holder_name, '') AS holder,
           min(id::text)::uuid AS keep_id, sum(monthly_cap) AS cap, bool_or(coalesce(rollover, false)) AS roll
    FROM budgets WHERE category IN ('Transport', 'Travel', 'Trip/Vacation', 'Travel & transport')
    GROUP BY user_id, month_year, currency, coalesce(holder_name, '')
  LOOP
    DELETE FROM budgets WHERE user_id = r.user_id AND month_year = r.month_year AND currency = r.currency
      AND coalesce(holder_name, '') = r.holder AND category IN ('Transport', 'Travel', 'Trip/Vacation', 'Travel & transport') AND id <> r.keep_id;
    UPDATE budgets SET category = 'Travel & transport', monthly_cap = r.cap, rollover = r.roll WHERE id = r.keep_id;
  END LOOP;
END $$;

-- Rules, repeating entries, recurring goals and yearly costs that pointed at the old names
DO $$ BEGIN
  IF to_regclass('public.txn_rules') IS NOT NULL THEN
    UPDATE txn_rules SET set_category = 'Travel & transport' WHERE set_category IN ('Transport', 'Travel', 'Trip/Vacation');
  END IF;
  IF to_regclass('public.recurring_txns') IS NOT NULL THEN
    UPDATE recurring_txns SET category = 'Travel & transport' WHERE category IN ('Transport', 'Travel', 'Trip/Vacation');
  END IF;
  IF to_regclass('public.budget_funds') IS NOT NULL THEN
    UPDATE budget_funds SET category = 'Travel & transport' WHERE category IN ('Transport', 'Travel', 'Trip/Vacation');
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'goals' AND column_name = 'spend_category') THEN
    UPDATE goals SET spend_category = 'Travel & transport' WHERE spend_category IN ('Transport', 'Travel', 'Trip/Vacation');
  END IF;
END $$;

-- Your category list (migration 024): one "Travel & transport" in place of the three
DO $$ BEGIN
  IF to_regclass('public.categories') IS NOT NULL THEN
    INSERT INTO categories (user_id, kind, name, color, icon, sort_order)
      SELECT user_id, 'expense', 'Travel & transport', '#0891B2', 'car', min(sort_order)
      FROM categories WHERE kind = 'expense' AND name IN ('Transport', 'Travel', 'Trip/Vacation')
        AND user_id NOT IN (SELECT user_id FROM categories WHERE kind = 'expense' AND lower(name) = 'travel & transport')
      GROUP BY user_id;
    DELETE FROM categories WHERE kind = 'expense' AND name IN ('Transport', 'Travel', 'Trip/Vacation');
  END IF;
END $$;

-- ── Events & trips ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS spend_events (
  id          uuid default uuid_generate_v4() primary key,
  user_id     uuid references profiles(id) on delete cascade not null,
  kind        text not null default 'trip',          -- trip, function, festival, project, medical, other
  name        text not null,
  start_date  date not null,
  end_date    date not null,
  budget      numeric,                               -- its own budget (separate from monthly budgets)
  currency    text not null default 'INR' check (currency in ('AED', 'INR')),
  goal_id     uuid references goals(id) on delete set null,   -- money saved for it
  place       text,
  notes       text,
  closed_at   date,                                  -- wrapped up
  created_at  timestamptz default now()
);
CREATE INDEX IF NOT EXISTS idx_spend_events_user ON spend_events(user_id, start_date DESC);
ALTER TABLE spend_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS spend_events_owner ON spend_events;
CREATE POLICY spend_events_owner ON spend_events
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- One event per expense (a tag, not a category)
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS event_id uuid REFERENCES spend_events(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_transactions_event ON transactions(event_id) WHERE event_id IS NOT NULL;
