-- ================================================================
-- WealthLens — Sample Seed Data (OPTIONAL)
-- Run AFTER creating your first user account via the app.
-- Replace the UUID below with your actual user ID from:
--   Supabase Dashboard → Authentication → Users → copy UUID
-- ================================================================

DO $$
DECLARE v_user_id UUID := 'fdcc41b5-c674-449d-930b-b842440134ca';
BEGIN

-- Ensure profile exists (needed if the trigger wasn't active when you first signed up)
INSERT INTO profiles (id, email, full_name, avatar_url)
SELECT id, email,
       raw_user_meta_data->>'full_name',
       raw_user_meta_data->>'avatar_url'
FROM auth.users
WHERE id = v_user_id
ON CONFLICT (id) DO NOTHING;

-- Accounts
INSERT INTO accounts (user_id, name, bank_name, account_type, currency, country, last_four, credit_limit, outstanding_bal, minimum_due, due_date, is_active) VALUES
  (v_user_id, 'ENBD Skywards Visa',   'Emirates NBD', 'credit_card', 'AED', 'UAE',   '4521', 50000,  18400, 3680,  CURRENT_DATE + 8,  TRUE),
  (v_user_id, 'ADCB TouchPoints',     'ADCB',         'credit_card', 'AED', 'UAE',   '8832', 30000,  22100, 4420,  CURRENT_DATE + 14, TRUE),
  (v_user_id, 'HDFC Regalia',         'HDFC Bank',    'credit_card', 'INR', 'India', '3341', 400000, 82000, 16400, CURRENT_DATE + 5,  TRUE),
  (v_user_id, 'Axis Magnus',          'Axis Bank',    'credit_card', 'INR', 'India', '7729', 300000, 51000, 10200, CURRENT_DATE + 21, TRUE),
  (v_user_id, 'ENBD Current Account', 'Emirates NBD', 'current',     'AED', 'UAE',   '1234', NULL,   NULL,  NULL,  NULL,              TRUE),
  (v_user_id, 'HDFC Savings',         'HDFC Bank',    'savings',     'INR', 'India', '5678', NULL,   NULL,  NULL,  NULL,              TRUE);

-- Stocks
INSERT INTO stocks (user_id, symbol, name, exchange, currency, country, quantity, avg_buy_price, current_price, sector) VALUES
  (v_user_id, 'RELIANCE',  'Reliance Industries', 'NSE', 'INR', 'India', 50,  2200.00, 2850.00, 'Energy'),
  (v_user_id, 'HDFCBANK',  'HDFC Bank',           'NSE', 'INR', 'India', 100, 1450.00, 1680.00, 'Finance'),
  (v_user_id, 'INFY',      'Infosys',             'NSE', 'INR', 'India', 75,  1380.00, 1520.00, 'Technology'),
  (v_user_id, 'EMAAR',     'Emaar Properties',    'DFM', 'AED', 'UAE',   500, 7.20,    9.80,    'Real Estate');

-- Mutual Funds
INSERT INTO mutual_funds (user_id, fund_name, fund_type, units, avg_nav, current_nav, invested_amount) VALUES
  (v_user_id, 'Parag Parikh Flex Cap', 'equity', 1842.63, 48.85,  68.22,  90000),
  (v_user_id, 'Mirae Asset ELSS',      'elss',   2240.15, 32.14,  42.18,  72000),
  (v_user_id, 'Axis Bluechip Fund',    'equity',  880.40, 43.16,  55.90,  38000);

-- Fixed Deposits
INSERT INTO fixed_deposits (user_id, name, bank_name, principal, interest_rate, start_date, maturity_date, currency, country) VALUES
  (v_user_id, 'HDFC FD',      'HDFC Bank',    500000, 7.10, '2024-03-15', '2026-03-15', 'INR', 'India'),
  (v_user_id, 'SBI FD',       'SBI',          200000, 6.80, '2024-06-20', '2025-12-20', 'INR', 'India'),
  (v_user_id, 'ENBD Deposit', 'Emirates NBD',  50000, 4.20, '2024-10-01', '2025-10-01', 'AED', 'UAE');

-- Home Loans
INSERT INTO home_loans (user_id, name, bank_name, property_address, sanctioned_amt, outstanding_amt, emi_amount, interest_rate, loan_start_date, tenure_months, months_paid, currency, country, next_emi_date) VALUES
  (v_user_id, 'Dubai Home Loan',  'Mashreq Bank', 'JBR, Dubai Marina', 1800000, 1340000, 12800, 3.99, '2018-06-01', 240, 84, 'AED', 'UAE',   CURRENT_DATE + 5),
  (v_user_id, 'Mumbai Flat Loan', 'HDFC Bank',    'Powai, Mumbai',     7500000, 5900000, 68000, 8.50, '2020-01-15', 240, 64, 'INR', 'India', CURRENT_DATE + 10);

-- Insurance
INSERT INTO insurance_policies (user_id, policy_name, policy_number, provider, policy_type, sum_assured, annual_premium, premium_frequency, start_date, expiry_date, next_premium_date, currency, country, insured_members, is_active) VALUES
  (v_user_id, 'LIC Term Shield',       'LIC/2019/TRM/001', 'LIC India',         'term_life', 10000000, 48000, 'annual', '2019-08-12', '2049-08-12', CURRENT_DATE + 79,  'INR', 'India', ARRAY['Self'], TRUE),
  (v_user_id, 'Star Health Family',    'STAR/H/2022/4521', 'Star Health',        'health',    1000000,  28000, 'annual', '2022-09-03', '2025-09-03', CURRENT_DATE + 101, 'INR', 'India', ARRAY['Self','Spouse','Child'], TRUE),
  (v_user_id, 'Emirates Life Cover',   'ELC/2021/345678',  'Emirates NBD Life', 'term_life', 500000,   4200,  'annual', '2021-11-20', '2041-11-20', CURRENT_DATE + 179, 'AED', 'UAE',   ARRAY['Self'], TRUE),
  (v_user_id, 'Oman Insurance Health', 'OI/H/2024/9988',   'Oman Insurance',    'health',    1000000,  7800,  'annual', '2024-07-01', '2025-07-01', CURRENT_DATE + 37,  'AED', 'UAE',   ARRAY['Self','Spouse'], TRUE),
  (v_user_id, 'HDFC ERGO Home',        'HE/P/2023/1122',   'HDFC ERGO',         'property',  7500000,  12000, 'annual', '2023-06-30', '2026-06-30', CURRENT_DATE + 36,  'INR', 'India', ARRAY['Self'], TRUE);

-- Budgets (current month)
INSERT INTO budgets (user_id, category, monthly_cap, currency, month_year) VALUES
  (v_user_id, 'Food',          35000, 'INR', TO_CHAR(CURRENT_DATE, 'YYYY-MM')),
  (v_user_id, 'Shopping',      30000, 'INR', TO_CHAR(CURRENT_DATE, 'YYYY-MM')),
  (v_user_id, 'Utilities',     20000, 'INR', TO_CHAR(CURRENT_DATE, 'YYYY-MM')),
  (v_user_id, 'Entertainment', 8000,  'INR', TO_CHAR(CURRENT_DATE, 'YYYY-MM')),
  (v_user_id, 'Health',        10000, 'INR', TO_CHAR(CURRENT_DATE, 'YYYY-MM')),
  (v_user_id, 'Transport',     7000,  'INR', TO_CHAR(CURRENT_DATE, 'YYYY-MM'))
ON CONFLICT (user_id, category, month_year) DO NOTHING;

-- Goals
INSERT INTO goals (user_id, name, target_amount, current_amount, target_date, currency, country, emoji) VALUES
  (v_user_id, 'Emergency Fund',              1500000, 940000, '2025-12-31', 'INR', 'India', '🆘'),
  (v_user_id, 'Europe Vacation',              300000,  85000, '2025-10-15', 'INR', 'India', '✈️'),
  (v_user_id, 'Dubai Property Down-payment',  500000, 180000, '2026-06-01', 'AED', 'UAE',   '🏙️'),
  (v_user_id, 'Children Education Fund',     5000000, 620000, '2030-01-01', 'INR', 'India', '🎓');

-- Sample Transactions (last 30 days)
INSERT INTO transactions (user_id, txn_date, merchant, category, amount, currency, country, txn_type, source, is_verified) VALUES
  (v_user_id, CURRENT_DATE - 1,  'Carrefour Deira',  'Food',          380,   'AED', 'UAE',   'expense', 'manual', TRUE),
  (v_user_id, CURRENT_DATE - 2,  'DEWA',              'Utilities',    1240,   'AED', 'UAE',   'expense', 'manual', TRUE),
  (v_user_id, CURRENT_DATE - 3,  'Noon.com',          'Shopping',      890,   'AED', 'UAE',   'expense', 'manual', TRUE),
  (v_user_id, CURRENT_DATE - 4,  'Dubai Metro',       'Transport',     120,   'AED', 'UAE',   'expense', 'manual', TRUE),
  (v_user_id, CURRENT_DATE - 5,  'Clinique JBR',      'Health',        650,   'AED', 'UAE',   'expense', 'manual', TRUE),
  (v_user_id, CURRENT_DATE - 6,  'VOX Cinemas',       'Entertainment', 220,   'AED', 'UAE',   'expense', 'manual', TRUE),
  (v_user_id, CURRENT_DATE - 7,  'LuLu Hypermarket',  'Food',          560,   'AED', 'UAE',   'expense', 'manual', TRUE),
  (v_user_id, CURRENT_DATE - 8,  'Etisalat',          'Utilities',     350,   'AED', 'UAE',   'expense', 'manual', TRUE),
  (v_user_id, CURRENT_DATE - 1,  'DMart Powai',       'Food',         4200,   'INR', 'India', 'expense', 'manual', TRUE),
  (v_user_id, CURRENT_DATE - 2,  'MSEB',              'Utilities',    3800,   'INR', 'India', 'expense', 'manual', TRUE),
  (v_user_id, CURRENT_DATE - 3,  'Amazon India',      'Shopping',     8900,   'INR', 'India', 'expense', 'manual', TRUE),
  (v_user_id, CURRENT_DATE - 4,  'Ola',               'Transport',    1200,   'INR', 'India', 'expense', 'manual', TRUE),
  (v_user_id, CURRENT_DATE - 5,  'Apollo 24|7',       'Health',       2400,   'INR', 'India', 'expense', 'manual', TRUE),
  (v_user_id, CURRENT_DATE - 6,  'PVR IMAX',          'Entertainment',1800,   'INR', 'India', 'expense', 'manual', TRUE),
  (v_user_id, CURRENT_DATE - 7,  'Big Basket',        'Food',         5600,   'INR', 'India', 'expense', 'manual', TRUE),
  (v_user_id, CURRENT_DATE - 8,  'Jio',               'Utilities',    2000,   'INR', 'India', 'expense', 'manual', TRUE),
  (v_user_id, CURRENT_DATE - 9,  'Myntra',            'Shopping',     6800,   'INR', 'India', 'expense', 'manual', TRUE),
  (v_user_id, CURRENT_DATE - 10, 'Uber',              'Transport',     890,   'AED', 'UAE',   'expense', 'manual', TRUE),
  (v_user_id, CURRENT_DATE - 10, 'HDFC Salary',       'Salary',     280000,   'INR', 'India', 'income',  'manual', TRUE),
  (v_user_id, CURRENT_DATE - 10, 'Company Salary',    'Salary',      28000,   'AED', 'UAE',   'income',  'manual', TRUE);

END $$;
