-- SIP (Systematic Investment Plan) tracking for mutual funds
ALTER TABLE mutual_funds
  ADD COLUMN IF NOT EXISTS has_sip      BOOLEAN      DEFAULT false,
  ADD COLUMN IF NOT EXISTS sip_amount   NUMERIC(20,2),
  ADD COLUMN IF NOT EXISTS sip_date     INTEGER CHECK (sip_date BETWEEN 1 AND 31);

-- Track monthly SIP payment confirmations
CREATE TABLE IF NOT EXISTS sip_payments (
  id           UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id      UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  fund_id      UUID REFERENCES mutual_funds(id) ON DELETE CASCADE NOT NULL,
  payment_date DATE NOT NULL,
  amount       NUMERIC(20,2) NOT NULL,
  status       TEXT NOT NULL CHECK (status IN ('paid', 'skipped')),
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE sip_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own SIP payments" ON sip_payments
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
