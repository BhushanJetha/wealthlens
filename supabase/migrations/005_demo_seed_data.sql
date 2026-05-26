-- ================================================================
-- WealthLens Demo Seed Data
-- Paste into Supabase Dashboard → SQL Editor → Run
-- Uses the FIRST user in auth.users (your account)
-- ================================================================

DO $$
DECLARE
  uid              UUID;
  acc_enbd_sav     UUID;
  acc_hdfc_sav     UUID;
  acc_sbi_sav      UUID;
  acc_enbd_cc      UUID;
  acc_axis_cc      UUID;
BEGIN
  SELECT id INTO uid FROM auth.users ORDER BY created_at LIMIT 1;
  IF uid IS NULL THEN
    RAISE EXCEPTION 'No user found — sign up in the app first.';
  END IF;

  UPDATE profiles SET full_name = 'Bhushan Jetha', default_view = 'consolidated' WHERE id = uid;

  -- ================================================================
  -- ACCOUNTS
  -- ================================================================
  INSERT INTO accounts (user_id, name, bank_name, account_type, currency, country, current_balance, is_active)
    VALUES (uid, 'ENBD Savings', 'Emirates NBD', 'savings', 'AED', 'UAE', 45230.00, true)
    RETURNING id INTO acc_enbd_sav;

  INSERT INTO accounts (user_id, name, bank_name, account_type, currency, country, current_balance, is_active)
    VALUES (uid, 'HDFC Savings', 'HDFC Bank', 'savings', 'INR', 'India', 185000.00, true)
    RETURNING id INTO acc_hdfc_sav;

  INSERT INTO accounts (user_id, name, bank_name, account_type, currency, country, current_balance, is_active)
    VALUES (uid, 'SBI Savings', 'State Bank of India', 'savings', 'INR', 'India', 95000.00, true)
    RETURNING id INTO acc_sbi_sav;

  INSERT INTO accounts (user_id, name, bank_name, account_type, currency, country, credit_limit, outstanding_bal, minimum_due, due_date, is_active)
    VALUES (uid, 'ENBD Skywards Credit Card', 'Emirates NBD', 'credit_card', 'AED', 'UAE', 30000.00, 8450.00, 425.00, '2026-06-15', true)
    RETURNING id INTO acc_enbd_cc;

  INSERT INTO accounts (user_id, name, bank_name, account_type, currency, country, credit_limit, outstanding_bal, minimum_due, due_date, is_active)
    VALUES (uid, 'Axis Magnus Credit Card', 'Axis Bank', 'credit_card', 'INR', 'India', 300000.00, 42000.00, 2100.00, '2026-06-10', true)
    RETURNING id INTO acc_axis_cc;

  -- ================================================================
  -- LOANS
  -- ================================================================
  INSERT INTO home_loans (user_id, name, bank_name, property_address, loan_type, sanctioned_amt, outstanding_amt, emi_amount, interest_rate, loan_start_date, tenure_months, months_paid, currency, country, next_emi_date, is_active)
  VALUES
    (uid, 'Home Loan – HDFC', 'HDFC Bank', '204 Prestige Lakeside, Whitefield, Bengaluru 560066',
     'home_loan', 7500000, 6150000, 58000, 8.65, '2024-03-01', 240, 26, 'INR', 'India', '2026-06-01', true),
    (uid, 'Car Loan – Emirates NBD', 'Emirates NBD', null,
     'car_loan', 80000, 52000, 1850, 4.99, '2024-03-01', 60, 26, 'AED', 'UAE', '2026-06-01', true),
    (uid, 'Personal Loan – SBI', 'State Bank of India', null,
     'personal_loan', 500000, 280000, 12500, 12.50, '2024-12-01', 48, 17, 'INR', 'India', '2026-06-01', true),
    (uid, 'Bike Loan – ICICI', 'ICICI Bank', null,
     'bike_loan', 180000, 45000, 5200, 9.50, '2023-06-01', 36, 35, 'INR', 'India', '2026-06-01', true);

  -- ================================================================
  -- INSURANCE
  -- ================================================================
  INSERT INTO insurance_policies (user_id, policy_name, policy_number, provider, policy_type, sum_assured, annual_premium, premium_frequency, start_date, expiry_date, next_premium_date, currency, country, is_active)
  VALUES
    (uid, 'LIC Term Plan – 1 Crore', 'LIC-TRM-441234567', 'LIC of India',
     'term_life', 10000000, 12500, 'annual', '2020-04-01', '2045-04-01', '2027-04-01', 'INR', 'India', true),
    (uid, 'Star Health Family Floater 10L', 'STR-HLT-8821003', 'Star Health Insurance',
     'health', 1000000, 24000, 'annual', '2023-07-15', '2026-07-15', '2026-07-15', 'INR', 'India', true),
    (uid, 'Daman Health – Gold Plan', 'DAM-2024-AE-90142', 'Daman National Health Insurance',
     'health', 500000, 4200, 'annual', '2025-01-01', '2026-12-31', '2026-12-31', 'AED', 'UAE', true),
    (uid, 'Bajaj Allianz Car Insurance', 'BAJ-MOT-VH2024882', 'Bajaj Allianz',
     'vehicle', 800000, 15000, 'annual', '2025-05-01', '2026-05-01', '2026-05-01', 'INR', 'India', true),
    (uid, 'ADNIC Motor Insurance UAE', 'ADNIC-MOT-2025-77341', 'ADNIC',
     'vehicle', null, 2800, 'annual', '2025-03-01', '2026-03-01', '2026-03-01', 'AED', 'UAE', true);

  -- ================================================================
  -- STOCKS
  -- ================================================================
  INSERT INTO stocks (user_id, symbol, name, exchange, currency, country, quantity, avg_buy_price, current_price, sector)
  VALUES
    (uid, 'RELIANCE', 'Reliance Industries Ltd',         'NSE', 'INR', 'India',  50, 2450.00, 2890.00, 'Energy'),
    (uid, 'TCS',      'Tata Consultancy Services',       'NSE', 'INR', 'India',  20, 3600.00, 4250.00, 'Technology'),
    (uid, 'HDFCBANK', 'HDFC Bank Ltd',                   'NSE', 'INR', 'India',  80, 1450.00, 1720.00, 'Banking'),
    (uid, 'INFY',     'Infosys Ltd',                     'NSE', 'INR', 'India',  60, 1400.00, 1650.00, 'Technology'),
    (uid, 'ITC',      'ITC Ltd',                         'NSE', 'INR', 'India', 200,  360.00,  465.00, 'FMCG'),
    (uid, 'EMBNK',    'Emirates NBD Bank',               'DFM', 'AED', 'UAE',  100,   14.20,   17.80, 'Banking'),
    (uid, 'ALDAR',    'Aldar Properties PJSC',           'ADX', 'AED', 'UAE',  200,    4.10,    5.45, 'Real Estate');

  -- ================================================================
  -- MUTUAL FUNDS
  -- ================================================================
  INSERT INTO mutual_funds (user_id, fund_name, fund_type, folio_number, units, avg_nav, current_nav, invested_amount, currency, country)
  VALUES
    (uid, 'Parag Parikh Flexi Cap Fund – Direct Growth',         'equity', 'PPFAS/12345678',   1250.500, 48.50,  65.30,  60650.00, 'INR', 'India'),
    (uid, 'Mirae Asset Large & Midcap Fund – Direct Growth',     'equity', 'MAM/87654321',      890.250, 85.20, 108.50,  75861.00, 'INR', 'India'),
    (uid, 'Axis Bluechip Fund – Direct Growth',                  'equity', 'AXIS/44556677',    2100.750, 42.30,  54.80,  88862.00, 'INR', 'India'),
    (uid, 'SBI Small Cap Fund – Direct Growth',                  'equity', 'SBI/99887766',      560.500, 98.50, 142.30,  55209.00, 'INR', 'India'),
    (uid, 'HDFC Balanced Advantage Fund – Direct Growth',        'hybrid', 'HDFC/33221100',    3200.000, 68.40,  82.50, 218880.00, 'INR', 'India'),
    (uid, 'Mirae Asset ELSS Tax Saver Fund – Direct Growth',     'elss',   'MAM/ELSS/112233', 1800.000, 28.80,  38.50,  51840.00, 'INR', 'India');

  -- ================================================================
  -- FIXED DEPOSITS
  -- ================================================================
  INSERT INTO fixed_deposits (user_id, name, bank_name, principal, interest_rate, start_date, maturity_date, maturity_amt, currency, country, is_active)
  VALUES
    (uid, 'HDFC Bank FD – 3 Year',       'HDFC Bank',              500000, 7.25, '2023-03-15', '2026-03-15', 615200.00, 'INR', 'India', true),
    (uid, 'SBI FD – Tax Saver 5 Year',   'State Bank of India',    150000, 7.10, '2024-01-10', '2029-01-10', 212300.00, 'INR', 'India', true),
    (uid, 'Emirates NBD Term Deposit',   'Emirates NBD',            20000, 5.25, '2024-06-01', '2026-06-01',  22095.00, 'AED', 'UAE',   true),
    (uid, 'ICICI Bank FD – 2 Year',      'ICICI Bank',             200000, 7.50, '2024-08-01', '2026-08-01', 230900.00, 'INR', 'India', true);

  -- ================================================================
  -- RECURRING DEPOSITS
  -- ================================================================
  INSERT INTO recurring_deposits (user_id, name, bank_name, monthly_amount, interest_rate, start_date, maturity_date, tenure_months, currency, country, is_active)
  VALUES
    (uid, 'SBI RD – Goal Saver', 'State Bank of India', 10000, 6.75, '2024-04-01', '2027-04-01', 36, 'INR', 'India', true),
    (uid, 'HDFC Bank RD',        'HDFC Bank',            5000, 7.00, '2025-01-01', '2027-01-01', 24, 'INR', 'India', true);

  -- ================================================================
  -- NPS
  -- ================================================================
  INSERT INTO nps_accounts (user_id, name, pran_number, tier, corpus_amount, invested_amount, equity_allocation, corporate_bond_allocation, govt_securities_allocation, fund_manager, start_date, currency, country)
  VALUES
    (uid, 'NPS Tier I – SBI Pension',    '500123456789', 'Tier I',  485000, 360000, 75, 15, 10, 'SBI Pension Funds',        '2019-04-01', 'INR', 'India'),
    (uid, 'NPS Tier II – HDFC Pension',  '500123456790', 'Tier II', 125000, 100000, 50, 30, 20, 'HDFC Pension Management',  '2021-06-01', 'INR', 'India');

  -- ================================================================
  -- LIC POLICIES
  -- ================================================================
  INSERT INTO lic_policies (user_id, name, policy_number, plan_name, sum_assured, annual_premium, premium_frequency, premium_paid_years, policy_term_years, start_date, maturity_date, bonus_accrued, next_premium_date, total_paid, currency, country, is_active)
  VALUES
    (uid, 'LIC Jeevan Anand', '123456789', 'Jeevan Anand (Plan 815)',
     1000000, 24500, 'Annually', 13.0, 21, '2013-04-01', '2034-04-01', 385000, '2027-04-01', 318500, 'INR', 'India', true),
    (uid, 'LIC Jeevan Labh',  '987654321', 'Jeevan Labh (Plan 836)',
     500000, 12000, 'Annually',  8.0, 25, '2018-04-01', '2043-04-01',  95000, '2027-04-01',  96000, 'INR', 'India', true);

  -- ================================================================
  -- GOLD
  -- ================================================================
  INSERT INTO gold_investments (user_id, name, gold_type, quantity_grams, buy_price_per_gram, current_price_per_gram, invested_amount, current_value, purchase_date, currency, country)
  VALUES
    (uid, 'Physical Gold – Jewellery & Coins', 'physical', 85,  5200, 7250, 442000, 616250, '2021-11-15', 'INR', 'India'),
    (uid, 'Sovereign Gold Bond 2023-24 Series I', 'sgb',   20,  5900, 7250, 118000, 145000, '2023-10-01', 'INR', 'India'),
    (uid, 'Gold Bar – 50g (Dubai)',            'physical', 50,   205,  248,  10250,  12400, '2023-03-15', 'AED', 'UAE');

  -- ================================================================
  -- BONDS
  -- ================================================================
  INSERT INTO bond_investments (user_id, name, bond_type, face_value, quantity, coupon_rate, maturity_date, invested_amount, current_value, purchase_date, currency, country)
  VALUES
    (uid, 'RBI 7.75% Savings Bond 2018',  'rbi_bonds', 1000, 200, 7.75, '2031-01-01', 200000, 218000, '2018-07-15', 'INR', 'India'),
    (uid, 'NHAI Tax Free Bond 8.20%',     'tax_free',  1000, 100, 8.20, '2027-03-15', 100000, 108500, '2017-03-15', 'INR', 'India'),
    (uid, 'Adani Ports NCD 9.50%',        'corporate', 1000,  50, 9.50, '2026-12-01',  50000,  52400, '2023-12-01', 'INR', 'India');

  -- ================================================================
  -- ETFs
  -- ================================================================
  INSERT INTO etf_investments (user_id, etf_name, symbol, exchange, units, avg_buy_price, current_price, invested_amount, current_value, etf_type, purchase_date, currency, country)
  VALUES
    (uid, 'Nippon India Nifty 50 BeES', 'NIFTYBEES', 'NSE', 500,  215.40, 268.50, 107700, 134250, 'index',         '2022-06-01', 'INR', 'India'),
    (uid, 'Mirae Asset NYSE FANG+ ETF', 'MAFANG',    'NSE', 100,   85.20, 112.30,   8520,  11230, 'international', '2023-04-01', 'INR', 'India'),
    (uid, 'HDFC Gold ETF',              'HDFCGOLD',  'NSE', 200,   46.80,  58.10,   9360,  11620, 'gold',          '2022-11-01', 'INR', 'India');

  -- ================================================================
  -- GOALS
  -- ================================================================
  INSERT INTO goals (user_id, name, target_amount, current_amount, target_date, currency, country, color, emoji)
  VALUES
    (uid, 'Emergency Fund (6 months)',    1500000, 985000, '2027-12-31', 'INR', 'India', '#00C9A7', '🛡️'),
    (uid, 'Dubai Property Down Payment',  300000, 145000, '2028-06-30', 'AED', 'UAE',   '#7C5CBF', '🏡'),
    (uid, 'Children''s Education Fund',  5000000,1250000, '2035-04-01', 'INR', 'India', '#F59E0B', '🎓'),
    (uid, 'Dream Car – BMW 5 Series',     250000,  95000, '2027-06-30', 'AED', 'UAE',   '#3B82F6', '🚗'),
    (uid, 'Annual Family Vacation',       500000, 280000, '2026-12-31', 'INR', 'India', '#EF4444', '✈️');

  -- ================================================================
  -- BUDGETS (May 2026)
  -- ================================================================
  INSERT INTO budgets (user_id, category, monthly_cap, currency, month_year) VALUES
    (uid, 'Groceries',     15000, 'INR', '2026-05'),
    (uid, 'Dining Out',    10000, 'INR', '2026-05'),
    (uid, 'Transport',      8000, 'INR', '2026-05'),
    (uid, 'Entertainment',  6000, 'INR', '2026-05'),
    (uid, 'Shopping',      20000, 'INR', '2026-05'),
    (uid, 'Healthcare',     5000, 'INR', '2026-05'),
    (uid, 'Investments',   36000, 'INR', '2026-05'),
    (uid, 'EMI',           92700, 'INR', '2026-05')
  ON CONFLICT (user_id, category, month_year) DO NOTHING;

  -- ================================================================
  -- TRANSACTIONS – June 2025
  -- ================================================================
  INSERT INTO transactions (user_id, account_id, txn_date, merchant, category, amount, currency, country, txn_type) VALUES
    (uid, acc_enbd_sav, '2025-06-01', 'Salary Credit',              'Income',        25000, 'AED', 'UAE',   'income'),
    (uid, acc_enbd_sav, '2025-06-02', 'Al Barsha Rent',             'Housing',        7500, 'AED', 'UAE',   'expense'),
    (uid, acc_enbd_sav, '2025-06-05', 'DEWA',                       'Utilities',       420, 'AED', 'UAE',   'expense'),
    (uid, acc_enbd_sav, '2025-06-06', 'du Telecom',                 'Utilities',       299, 'AED', 'UAE',   'expense'),
    (uid, acc_enbd_sav, '2025-06-08', 'Carrefour Mall of Emirates', 'Groceries',       780, 'AED', 'UAE',   'expense'),
    (uid, acc_enbd_sav, '2025-06-12', 'ADNOC Fuel Station',         'Transport',       280, 'AED', 'UAE',   'expense'),
    (uid, acc_enbd_cc,  '2025-06-14', 'Zuma Restaurant Dubai',      'Dining Out',      380, 'AED', 'UAE',   'expense'),
    (uid, acc_enbd_cc,  '2025-06-15', 'Amazon.ae',                  'Shopping',        450, 'AED', 'UAE',   'expense'),
    (uid, acc_enbd_sav, '2025-06-18', 'GEMS Education School Fee',  'Education',      2800, 'AED', 'UAE',   'expense'),
    (uid, acc_enbd_cc,  '2025-06-25', 'Vox Cinemas',                'Entertainment',   120, 'AED', 'UAE',   'expense'),
    (uid, acc_enbd_sav, '2025-06-28', 'Car Loan EMI – ENBD',        'EMI',            1850, 'AED', 'UAE',   'emi'),
    (uid, acc_hdfc_sav, '2025-06-01', 'HDFC Home Loan EMI',         'EMI',           58000, 'INR', 'India', 'emi'),
    (uid, acc_sbi_sav,  '2025-06-01', 'SBI Personal Loan EMI',      'EMI',           12500, 'INR', 'India', 'emi'),
    (uid, acc_hdfc_sav, '2025-06-05', 'SIP – Parag Parikh',         'Investments',   10000, 'INR', 'India', 'expense'),
    (uid, acc_hdfc_sav, '2025-06-05', 'SIP – Axis Bluechip',        'Investments',    8000, 'INR', 'India', 'expense'),
    (uid, acc_hdfc_sav, '2025-06-10', 'Family Transfer',            'Family',        30000, 'INR', 'India', 'expense'),
    (uid, acc_axis_cc,  '2025-06-15', 'BigBasket',                  'Groceries',      4500, 'INR', 'India', 'expense'),
    (uid, acc_axis_cc,  '2025-06-20', 'Zomato',                     'Dining Out',     1800, 'INR', 'India', 'expense');

  -- ================================================================
  -- TRANSACTIONS – July 2025
  -- ================================================================
  INSERT INTO transactions (user_id, account_id, txn_date, merchant, category, amount, currency, country, txn_type) VALUES
    (uid, acc_enbd_sav, '2025-07-01', 'Salary Credit',              'Income',        25000, 'AED', 'UAE',   'income'),
    (uid, acc_enbd_sav, '2025-07-02', 'Al Barsha Rent',             'Housing',        7500, 'AED', 'UAE',   'expense'),
    (uid, acc_enbd_sav, '2025-07-05', 'DEWA',                       'Utilities',       520, 'AED', 'UAE',   'expense'),
    (uid, acc_enbd_sav, '2025-07-06', 'du Telecom',                 'Utilities',       299, 'AED', 'UAE',   'expense'),
    (uid, acc_enbd_sav, '2025-07-09', 'Lulu Hypermarket',           'Groceries',       850, 'AED', 'UAE',   'expense'),
    (uid, acc_enbd_sav, '2025-07-12', 'ENOC Fuel',                  'Transport',       310, 'AED', 'UAE',   'expense'),
    (uid, acc_enbd_cc,  '2025-07-16', 'Nammos Dubai',               'Dining Out',      450, 'AED', 'UAE',   'expense'),
    (uid, acc_enbd_sav, '2025-07-18', 'GEMS Education School Fee',  'Education',      2800, 'AED', 'UAE',   'expense'),
    (uid, acc_enbd_cc,  '2025-07-20', 'H&M Mall of Emirates',       'Shopping',        680, 'AED', 'UAE',   'expense'),
    (uid, acc_enbd_sav, '2025-07-28', 'Car Loan EMI – ENBD',        'EMI',            1850, 'AED', 'UAE',   'emi'),
    (uid, acc_hdfc_sav, '2025-07-01', 'HDFC Home Loan EMI',         'EMI',           58000, 'INR', 'India', 'emi'),
    (uid, acc_sbi_sav,  '2025-07-01', 'SBI Personal Loan EMI',      'EMI',           12500, 'INR', 'India', 'emi'),
    (uid, acc_hdfc_sav, '2025-07-05', 'SIP – Parag Parikh',         'Investments',   10000, 'INR', 'India', 'expense'),
    (uid, acc_hdfc_sav, '2025-07-05', 'SIP – Axis Bluechip',        'Investments',    8000, 'INR', 'India', 'expense'),
    (uid, acc_hdfc_sav, '2025-07-10', 'Family Transfer',            'Family',        30000, 'INR', 'India', 'expense'),
    (uid, acc_axis_cc,  '2025-07-12', 'Swiggy',                     'Dining Out',     2400, 'INR', 'India', 'expense'),
    (uid, acc_axis_cc,  '2025-07-22', 'Amazon India',               'Shopping',       8500, 'INR', 'India', 'expense');

  -- ================================================================
  -- TRANSACTIONS – August 2025
  -- ================================================================
  INSERT INTO transactions (user_id, account_id, txn_date, merchant, category, amount, currency, country, txn_type) VALUES
    (uid, acc_enbd_sav, '2025-08-01', 'Salary Credit',              'Income',        25000, 'AED', 'UAE',   'income'),
    (uid, acc_enbd_sav, '2025-08-02', 'Al Barsha Rent',             'Housing',        7500, 'AED', 'UAE',   'expense'),
    (uid, acc_enbd_sav, '2025-08-05', 'DEWA',                       'Utilities',       580, 'AED', 'UAE',   'expense'),
    (uid, acc_enbd_sav, '2025-08-06', 'du Telecom',                 'Utilities',       299, 'AED', 'UAE',   'expense'),
    (uid, acc_enbd_cc,  '2025-08-10', 'Waitrose Supermarket',       'Groceries',       920, 'AED', 'UAE',   'expense'),
    (uid, acc_enbd_sav, '2025-08-14', 'ADNOC Fuel Station',         'Transport',       295, 'AED', 'UAE',   'expense'),
    (uid, acc_enbd_sav, '2025-08-18', 'GEMS Education School Fee',  'Education',      2800, 'AED', 'UAE',   'expense'),
    (uid, acc_enbd_cc,  '2025-08-20', 'Dubai Mall Shopping',        'Shopping',       1200, 'AED', 'UAE',   'expense'),
    (uid, acc_enbd_cc,  '2025-08-23', 'Hakkasan Dubai',             'Dining Out',      520, 'AED', 'UAE',   'expense'),
    (uid, acc_enbd_sav, '2025-08-28', 'Car Loan EMI – ENBD',        'EMI',            1850, 'AED', 'UAE',   'emi'),
    (uid, acc_hdfc_sav, '2025-08-01', 'HDFC Home Loan EMI',         'EMI',           58000, 'INR', 'India', 'emi'),
    (uid, acc_sbi_sav,  '2025-08-01', 'SBI Personal Loan EMI',      'EMI',           12500, 'INR', 'India', 'emi'),
    (uid, acc_hdfc_sav, '2025-08-05', 'SIP – Parag Parikh',         'Investments',   10000, 'INR', 'India', 'expense'),
    (uid, acc_hdfc_sav, '2025-08-05', 'SIP – Axis Bluechip',        'Investments',    8000, 'INR', 'India', 'expense'),
    (uid, acc_hdfc_sav, '2025-08-10', 'Family Transfer',            'Family',        30000, 'INR', 'India', 'expense'),
    (uid, acc_axis_cc,  '2025-08-15', 'Nykaa',                      'Shopping',       3200, 'INR', 'India', 'expense'),
    (uid, acc_axis_cc,  '2025-08-25', 'Apollo Pharmacy',            'Healthcare',     2800, 'INR', 'India', 'expense');

  -- ================================================================
  -- TRANSACTIONS – September 2025
  -- ================================================================
  INSERT INTO transactions (user_id, account_id, txn_date, merchant, category, amount, currency, country, txn_type) VALUES
    (uid, acc_enbd_sav, '2025-09-01', 'Salary Credit',              'Income',        25000, 'AED', 'UAE',   'income'),
    (uid, acc_enbd_sav, '2025-09-02', 'Al Barsha Rent',             'Housing',        7500, 'AED', 'UAE',   'expense'),
    (uid, acc_enbd_sav, '2025-09-05', 'DEWA',                       'Utilities',       460, 'AED', 'UAE',   'expense'),
    (uid, acc_enbd_sav, '2025-09-06', 'du Telecom',                 'Utilities',       299, 'AED', 'UAE',   'expense'),
    (uid, acc_enbd_sav, '2025-09-10', 'Carrefour JBR',              'Groceries',       740, 'AED', 'UAE',   'expense'),
    (uid, acc_enbd_sav, '2025-09-13', 'ADNOC Fuel',                 'Transport',       270, 'AED', 'UAE',   'expense'),
    (uid, acc_enbd_sav, '2025-09-18', 'GEMS Education School Fee',  'Education',      2800, 'AED', 'UAE',   'expense'),
    (uid, acc_enbd_cc,  '2025-09-21', 'Shake Shack Dubai',          'Dining Out',      180, 'AED', 'UAE',   'expense'),
    (uid, acc_enbd_cc,  '2025-09-24', 'Noon.com',                   'Shopping',        350, 'AED', 'UAE',   'expense'),
    (uid, acc_enbd_sav, '2025-09-28', 'Car Loan EMI – ENBD',        'EMI',            1850, 'AED', 'UAE',   'emi'),
    (uid, acc_hdfc_sav, '2025-09-01', 'HDFC Home Loan EMI',         'EMI',           58000, 'INR', 'India', 'emi'),
    (uid, acc_sbi_sav,  '2025-09-01', 'SBI Personal Loan EMI',      'EMI',           12500, 'INR', 'India', 'emi'),
    (uid, acc_hdfc_sav, '2025-09-05', 'SIP – Parag Parikh',         'Investments',   10000, 'INR', 'India', 'expense'),
    (uid, acc_hdfc_sav, '2025-09-05', 'SIP – Axis Bluechip',        'Investments',    8000, 'INR', 'India', 'expense'),
    (uid, acc_hdfc_sav, '2025-09-10', 'Family Transfer',            'Family',        30000, 'INR', 'India', 'expense'),
    (uid, acc_axis_cc,  '2025-09-20', 'Myntra',                     'Shopping',       6500, 'INR', 'India', 'expense'),
    (uid, acc_axis_cc,  '2025-09-27', 'Zomato',                     'Dining Out',     3200, 'INR', 'India', 'expense');

  -- ================================================================
  -- TRANSACTIONS – October 2025
  -- ================================================================
  INSERT INTO transactions (user_id, account_id, txn_date, merchant, category, amount, currency, country, txn_type) VALUES
    (uid, acc_enbd_sav, '2025-10-01', 'Salary Credit',              'Income',        25000, 'AED', 'UAE',   'income'),
    (uid, acc_enbd_sav, '2025-10-02', 'Al Barsha Rent',             'Housing',        7500, 'AED', 'UAE',   'expense'),
    (uid, acc_enbd_sav, '2025-10-05', 'DEWA',                       'Utilities',       380, 'AED', 'UAE',   'expense'),
    (uid, acc_enbd_sav, '2025-10-06', 'du Telecom',                 'Utilities',       299, 'AED', 'UAE',   'expense'),
    (uid, acc_enbd_sav, '2025-10-09', 'Lulu Hypermarket',           'Groceries',       820, 'AED', 'UAE',   'expense'),
    (uid, acc_enbd_sav, '2025-10-12', 'ENOC Fuel',                  'Transport',       260, 'AED', 'UAE',   'expense'),
    (uid, acc_enbd_sav, '2025-10-18', 'GEMS Education School Fee',  'Education',      2800, 'AED', 'UAE',   'expense'),
    (uid, acc_enbd_cc,  '2025-10-22', 'La Mer Dubai',               'Entertainment',   280, 'AED', 'UAE',   'expense'),
    (uid, acc_enbd_cc,  '2025-10-25', 'Sephora Dubai Mall',         'Shopping',        560, 'AED', 'UAE',   'expense'),
    (uid, acc_enbd_sav, '2025-10-28', 'Car Loan EMI – ENBD',        'EMI',            1850, 'AED', 'UAE',   'emi'),
    (uid, acc_hdfc_sav, '2025-10-01', 'HDFC Home Loan EMI',         'EMI',           58000, 'INR', 'India', 'emi'),
    (uid, acc_sbi_sav,  '2025-10-01', 'SBI Personal Loan EMI',      'EMI',           12500, 'INR', 'India', 'emi'),
    (uid, acc_hdfc_sav, '2025-10-05', 'SIP – Parag Parikh',         'Investments',   10000, 'INR', 'India', 'expense'),
    (uid, acc_hdfc_sav, '2025-10-05', 'SIP – Axis Bluechip',        'Investments',    8000, 'INR', 'India', 'expense'),
    (uid, acc_hdfc_sav, '2025-10-10', 'Family Transfer',            'Family',        30000, 'INR', 'India', 'expense'),
    (uid, acc_axis_cc,  '2025-10-15', 'Flipkart Big Billion Days',  'Shopping',      18500, 'INR', 'India', 'expense'),
    (uid, acc_axis_cc,  '2025-10-25', 'Tanishq Jewellery (Diwali)', 'Shopping',      35000, 'INR', 'India', 'expense');

  -- ================================================================
  -- TRANSACTIONS – November 2025
  -- ================================================================
  INSERT INTO transactions (user_id, account_id, txn_date, merchant, category, amount, currency, country, txn_type) VALUES
    (uid, acc_enbd_sav, '2025-11-01', 'Salary Credit',              'Income',        25000, 'AED', 'UAE',   'income'),
    (uid, acc_enbd_sav, '2025-11-02', 'Al Barsha Rent',             'Housing',        7500, 'AED', 'UAE',   'expense'),
    (uid, acc_enbd_sav, '2025-11-05', 'DEWA',                       'Utilities',       350, 'AED', 'UAE',   'expense'),
    (uid, acc_enbd_sav, '2025-11-06', 'du Telecom',                 'Utilities',       299, 'AED', 'UAE',   'expense'),
    (uid, acc_enbd_sav, '2025-11-09', 'Carrefour',                  'Groceries',       710, 'AED', 'UAE',   'expense'),
    (uid, acc_enbd_sav, '2025-11-13', 'ADNOC Fuel',                 'Transport',       255, 'AED', 'UAE',   'expense'),
    (uid, acc_enbd_sav, '2025-11-18', 'GEMS Education School Fee',  'Education',      2800, 'AED', 'UAE',   'expense'),
    (uid, acc_enbd_cc,  '2025-11-22', 'White Dubai Nightclub',      'Entertainment',   350, 'AED', 'UAE',   'expense'),
    (uid, acc_enbd_sav, '2025-11-28', 'Car Loan EMI – ENBD',        'EMI',            1850, 'AED', 'UAE',   'emi'),
    (uid, acc_hdfc_sav, '2025-11-01', 'HDFC Home Loan EMI',         'EMI',           58000, 'INR', 'India', 'emi'),
    (uid, acc_sbi_sav,  '2025-11-01', 'SBI Personal Loan EMI',      'EMI',           12500, 'INR', 'India', 'emi'),
    (uid, acc_hdfc_sav, '2025-11-05', 'SIP – Parag Parikh',         'Investments',   10000, 'INR', 'India', 'expense'),
    (uid, acc_hdfc_sav, '2025-11-05', 'SIP – Axis Bluechip',        'Investments',    8000, 'INR', 'India', 'expense'),
    (uid, acc_hdfc_sav, '2025-11-10', 'Family Transfer',            'Family',        30000, 'INR', 'India', 'expense'),
    (uid, acc_axis_cc,  '2025-11-12', 'Swiggy Instamart',           'Groceries',      5800, 'INR', 'India', 'expense'),
    (uid, acc_axis_cc,  '2025-11-28', 'PVR Cinemas',                'Entertainment',  2200, 'INR', 'India', 'expense');

  -- ================================================================
  -- TRANSACTIONS – December 2025 (bonus month, holiday spending)
  -- ================================================================
  INSERT INTO transactions (user_id, account_id, txn_date, merchant, category, amount, currency, country, txn_type) VALUES
    (uid, acc_enbd_sav, '2025-12-01', 'Salary Credit',              'Income',        25000, 'AED', 'UAE',   'income'),
    (uid, acc_enbd_sav, '2025-12-01', 'Year-End Bonus',             'Income',        15000, 'AED', 'UAE',   'income'),
    (uid, acc_enbd_sav, '2025-12-02', 'Al Barsha Rent',             'Housing',        7500, 'AED', 'UAE',   'expense'),
    (uid, acc_enbd_sav, '2025-12-05', 'DEWA',                       'Utilities',       340, 'AED', 'UAE',   'expense'),
    (uid, acc_enbd_sav, '2025-12-06', 'du Telecom',                 'Utilities',       299, 'AED', 'UAE',   'expense'),
    (uid, acc_enbd_cc,  '2025-12-10', 'Carrefour',                  'Groceries',      1200, 'AED', 'UAE',   'expense'),
    (uid, acc_enbd_cc,  '2025-12-15', 'Dubai Mall Christmas',       'Shopping',       2800, 'AED', 'UAE',   'expense'),
    (uid, acc_enbd_cc,  '2025-12-18', 'Armani Hotel Restaurant',    'Dining Out',      850, 'AED', 'UAE',   'expense'),
    (uid, acc_enbd_sav, '2025-12-20', 'Jumeirah Beach Hotel',       'Travel',         1800, 'AED', 'UAE',   'expense'),
    (uid, acc_enbd_sav, '2025-12-28', 'Car Loan EMI – ENBD',        'EMI',            1850, 'AED', 'UAE',   'emi'),
    (uid, acc_hdfc_sav, '2025-12-01', 'HDFC Home Loan EMI',         'EMI',           58000, 'INR', 'India', 'emi'),
    (uid, acc_sbi_sav,  '2025-12-01', 'SBI Personal Loan EMI',      'EMI',           12500, 'INR', 'India', 'emi'),
    (uid, acc_hdfc_sav, '2025-12-05', 'SIP – Parag Parikh',         'Investments',   10000, 'INR', 'India', 'expense'),
    (uid, acc_hdfc_sav, '2025-12-05', 'SIP – Axis Bluechip',        'Investments',    8000, 'INR', 'India', 'expense'),
    (uid, acc_hdfc_sav, '2025-12-10', 'Family Transfer (Diwali)',   'Family',        50000, 'INR', 'India', 'expense'),
    (uid, acc_axis_cc,  '2025-12-20', 'SpiceJet – India Trip',      'Travel',        24000, 'INR', 'India', 'expense'),
    (uid, acc_axis_cc,  '2025-12-28', 'Amazon Year End Sale',       'Shopping',      12000, 'INR', 'India', 'expense');

  -- ================================================================
  -- TRANSACTIONS – January 2026
  -- ================================================================
  INSERT INTO transactions (user_id, account_id, txn_date, merchant, category, amount, currency, country, txn_type) VALUES
    (uid, acc_enbd_sav, '2026-01-01', 'Salary Credit',              'Income',        25000, 'AED', 'UAE',   'income'),
    (uid, acc_enbd_sav, '2026-01-02', 'Al Barsha Rent',             'Housing',        7500, 'AED', 'UAE',   'expense'),
    (uid, acc_enbd_sav, '2026-01-05', 'DEWA',                       'Utilities',       360, 'AED', 'UAE',   'expense'),
    (uid, acc_enbd_sav, '2026-01-06', 'du Telecom',                 'Utilities',       299, 'AED', 'UAE',   'expense'),
    (uid, acc_enbd_sav, '2026-01-09', 'Lulu Hypermarket',           'Groceries',       760, 'AED', 'UAE',   'expense'),
    (uid, acc_enbd_sav, '2026-01-13', 'ENOC Fuel',                  'Transport',       280, 'AED', 'UAE',   'expense'),
    (uid, acc_enbd_sav, '2026-01-18', 'GEMS Education School Fee',  'Education',      2800, 'AED', 'UAE',   'expense'),
    (uid, acc_enbd_cc,  '2026-01-20', 'Gaucho Dubai',               'Dining Out',      420, 'AED', 'UAE',   'expense'),
    (uid, acc_enbd_cc,  '2026-01-24', 'Fitness First Gym',          'Healthcare',      350, 'AED', 'UAE',   'expense'),
    (uid, acc_enbd_sav, '2026-01-28', 'Car Loan EMI – ENBD',        'EMI',            1850, 'AED', 'UAE',   'emi'),
    (uid, acc_hdfc_sav, '2026-01-01', 'HDFC Home Loan EMI',         'EMI',           58000, 'INR', 'India', 'emi'),
    (uid, acc_sbi_sav,  '2026-01-01', 'SBI Personal Loan EMI',      'EMI',           12500, 'INR', 'India', 'emi'),
    (uid, acc_hdfc_sav, '2026-01-05', 'SIP – Parag Parikh',         'Investments',   10000, 'INR', 'India', 'expense'),
    (uid, acc_hdfc_sav, '2026-01-05', 'SIP – Axis Bluechip',        'Investments',    8000, 'INR', 'India', 'expense'),
    (uid, acc_hdfc_sav, '2026-01-10', 'Family Transfer',            'Family',        30000, 'INR', 'India', 'expense'),
    (uid, acc_axis_cc,  '2026-01-15', 'SBI RD Instalment',          'Investments',   15000, 'INR', 'India', 'expense'),
    (uid, acc_axis_cc,  '2026-01-22', 'Reliance Fresh',             'Groceries',      6800, 'INR', 'India', 'expense');

  -- ================================================================
  -- TRANSACTIONS – February 2026
  -- ================================================================
  INSERT INTO transactions (user_id, account_id, txn_date, merchant, category, amount, currency, country, txn_type) VALUES
    (uid, acc_enbd_sav, '2026-02-01', 'Salary Credit',              'Income',        25000, 'AED', 'UAE',   'income'),
    (uid, acc_enbd_sav, '2026-02-02', 'Al Barsha Rent',             'Housing',        7500, 'AED', 'UAE',   'expense'),
    (uid, acc_enbd_sav, '2026-02-05', 'DEWA',                       'Utilities',       370, 'AED', 'UAE',   'expense'),
    (uid, acc_enbd_sav, '2026-02-06', 'du Telecom',                 'Utilities',       299, 'AED', 'UAE',   'expense'),
    (uid, acc_enbd_sav, '2026-02-10', 'Carrefour',                  'Groceries',       700, 'AED', 'UAE',   'expense'),
    (uid, acc_enbd_sav, '2026-02-13', 'ADNOC Fuel',                 'Transport',       265, 'AED', 'UAE',   'expense'),
    (uid, acc_enbd_cc,  '2026-02-14', 'Nobu Restaurant (Valentine)','Dining Out',      680, 'AED', 'UAE',   'expense'),
    (uid, acc_enbd_sav, '2026-02-18', 'GEMS Education School Fee',  'Education',      2800, 'AED', 'UAE',   'expense'),
    (uid, acc_enbd_cc,  '2026-02-22', 'Kidzania Dubai',             'Entertainment',   320, 'AED', 'UAE',   'expense'),
    (uid, acc_enbd_sav, '2026-02-28', 'Car Loan EMI – ENBD',        'EMI',            1850, 'AED', 'UAE',   'emi'),
    (uid, acc_hdfc_sav, '2026-02-01', 'HDFC Home Loan EMI',         'EMI',           58000, 'INR', 'India', 'emi'),
    (uid, acc_sbi_sav,  '2026-02-01', 'SBI Personal Loan EMI',      'EMI',           12500, 'INR', 'India', 'emi'),
    (uid, acc_hdfc_sav, '2026-02-05', 'SIP – Parag Parikh',         'Investments',   10000, 'INR', 'India', 'expense'),
    (uid, acc_hdfc_sav, '2026-02-05', 'SIP – Axis Bluechip',        'Investments',    8000, 'INR', 'India', 'expense'),
    (uid, acc_hdfc_sav, '2026-02-10', 'Family Transfer',            'Family',        30000, 'INR', 'India', 'expense'),
    (uid, acc_axis_cc,  '2026-02-18', 'Star Health Insurance',      'Healthcare',    24000, 'INR', 'India', 'expense'),
    (uid, acc_axis_cc,  '2026-02-25', 'Zomato',                     'Dining Out',     2800, 'INR', 'India', 'expense');

  -- ================================================================
  -- TRANSACTIONS – March 2026
  -- ================================================================
  INSERT INTO transactions (user_id, account_id, txn_date, merchant, category, amount, currency, country, txn_type) VALUES
    (uid, acc_enbd_sav, '2026-03-01', 'Salary Credit',              'Income',        25000, 'AED', 'UAE',   'income'),
    (uid, acc_enbd_sav, '2026-03-02', 'Al Barsha Rent',             'Housing',        7500, 'AED', 'UAE',   'expense'),
    (uid, acc_enbd_sav, '2026-03-05', 'DEWA',                       'Utilities',       390, 'AED', 'UAE',   'expense'),
    (uid, acc_enbd_sav, '2026-03-06', 'du Telecom',                 'Utilities',       299, 'AED', 'UAE',   'expense'),
    (uid, acc_enbd_sav, '2026-03-10', 'Lulu Hypermarket',           'Groceries',       790, 'AED', 'UAE',   'expense'),
    (uid, acc_enbd_sav, '2026-03-13', 'ENOC Fuel',                  'Transport',       290, 'AED', 'UAE',   'expense'),
    (uid, acc_enbd_sav, '2026-03-18', 'GEMS Education School Fee',  'Education',      2800, 'AED', 'UAE',   'expense'),
    (uid, acc_enbd_cc,  '2026-03-22', 'Atlantis Aquaventure',       'Entertainment',   580, 'AED', 'UAE',   'expense'),
    (uid, acc_enbd_cc,  '2026-03-25', 'The Cheesecake Factory',     'Dining Out',      290, 'AED', 'UAE',   'expense'),
    (uid, acc_enbd_sav, '2026-03-28', 'Car Loan EMI – ENBD',        'EMI',            1850, 'AED', 'UAE',   'emi'),
    (uid, acc_hdfc_sav, '2026-03-01', 'HDFC Home Loan EMI',         'EMI',           58000, 'INR', 'India', 'emi'),
    (uid, acc_sbi_sav,  '2026-03-01', 'SBI Personal Loan EMI',      'EMI',           12500, 'INR', 'India', 'emi'),
    (uid, acc_hdfc_sav, '2026-03-05', 'SIP – Parag Parikh',         'Investments',   10000, 'INR', 'India', 'expense'),
    (uid, acc_hdfc_sav, '2026-03-05', 'SIP – Axis Bluechip',        'Investments',    8000, 'INR', 'India', 'expense'),
    (uid, acc_hdfc_sav, '2026-03-10', 'Family Transfer',            'Family',        30000, 'INR', 'India', 'expense'),
    (uid, acc_axis_cc,  '2026-03-20', 'ELSS Tax Saving Investment', 'Investments',   50000, 'INR', 'India', 'expense'),
    (uid, acc_axis_cc,  '2026-03-28', 'Holi Shopping',              'Shopping',       8500, 'INR', 'India', 'expense');

  -- ================================================================
  -- TRANSACTIONS – April 2026
  -- ================================================================
  INSERT INTO transactions (user_id, account_id, txn_date, merchant, category, amount, currency, country, txn_type) VALUES
    (uid, acc_enbd_sav, '2026-04-01', 'Salary Credit',              'Income',        25000, 'AED', 'UAE',   'income'),
    (uid, acc_enbd_sav, '2026-04-02', 'Al Barsha Rent',             'Housing',        7500, 'AED', 'UAE',   'expense'),
    (uid, acc_enbd_sav, '2026-04-05', 'DEWA',                       'Utilities',       410, 'AED', 'UAE',   'expense'),
    (uid, acc_enbd_sav, '2026-04-06', 'du Telecom',                 'Utilities',       299, 'AED', 'UAE',   'expense'),
    (uid, acc_enbd_sav, '2026-04-10', 'Carrefour',                  'Groceries',       830, 'AED', 'UAE',   'expense'),
    (uid, acc_enbd_sav, '2026-04-13', 'ADNOC Fuel',                 'Transport',       305, 'AED', 'UAE',   'expense'),
    (uid, acc_enbd_sav, '2026-04-18', 'GEMS Education School Fee',  'Education',      2800, 'AED', 'UAE',   'expense'),
    (uid, acc_enbd_cc,  '2026-04-20', 'Eid Shopping Festival',      'Shopping',       1500, 'AED', 'UAE',   'expense'),
    (uid, acc_enbd_cc,  '2026-04-24', 'Zahr El Laymoun',            'Dining Out',      220, 'AED', 'UAE',   'expense'),
    (uid, acc_enbd_sav, '2026-04-28', 'Car Loan EMI – ENBD',        'EMI',            1850, 'AED', 'UAE',   'emi'),
    (uid, acc_hdfc_sav, '2026-04-01', 'HDFC Home Loan EMI',         'EMI',           58000, 'INR', 'India', 'emi'),
    (uid, acc_sbi_sav,  '2026-04-01', 'SBI Personal Loan EMI',      'EMI',           12500, 'INR', 'India', 'emi'),
    (uid, acc_hdfc_sav, '2026-04-05', 'SIP – Parag Parikh',         'Investments',   10000, 'INR', 'India', 'expense'),
    (uid, acc_hdfc_sav, '2026-04-05', 'SIP – Axis Bluechip',        'Investments',    8000, 'INR', 'India', 'expense'),
    (uid, acc_hdfc_sav, '2026-04-10', 'Family Transfer',            'Family',        30000, 'INR', 'India', 'expense'),
    (uid, acc_axis_cc,  '2026-04-01', 'LIC Jeevan Anand Premium',   'Insurance',     24500, 'INR', 'India', 'expense'),
    (uid, acc_axis_cc,  '2026-04-01', 'LIC Jeevan Labh Premium',    'Insurance',     12000, 'INR', 'India', 'expense'),
    (uid, acc_axis_cc,  '2026-04-20', 'Swiggy',                     'Dining Out',     3800, 'INR', 'India', 'expense');

  -- ================================================================
  -- TRANSACTIONS – May 2026 (current month)
  -- ================================================================
  INSERT INTO transactions (user_id, account_id, txn_date, merchant, category, amount, currency, country, txn_type) VALUES
    (uid, acc_enbd_sav, '2026-05-01', 'Salary Credit',              'Income',        25000, 'AED', 'UAE',   'income'),
    (uid, acc_enbd_sav, '2026-05-02', 'Al Barsha Rent',             'Housing',        7500, 'AED', 'UAE',   'expense'),
    (uid, acc_enbd_sav, '2026-05-05', 'DEWA',                       'Utilities',       430, 'AED', 'UAE',   'expense'),
    (uid, acc_enbd_sav, '2026-05-06', 'du Telecom',                 'Utilities',       299, 'AED', 'UAE',   'expense'),
    (uid, acc_enbd_sav, '2026-05-09', 'Lulu Hypermarket',           'Groceries',       880, 'AED', 'UAE',   'expense'),
    (uid, acc_enbd_sav, '2026-05-12', 'ADNOC Fuel',                 'Transport',       320, 'AED', 'UAE',   'expense'),
    (uid, acc_enbd_cc,  '2026-05-15', 'Ossiano Atlantis',           'Dining Out',      650, 'AED', 'UAE',   'expense'),
    (uid, acc_enbd_sav, '2026-05-18', 'GEMS Education School Fee',  'Education',      2800, 'AED', 'UAE',   'expense'),
    (uid, acc_enbd_cc,  '2026-05-20', 'Dubai Festival City Mall',   'Shopping',       1100, 'AED', 'UAE',   'expense'),
    (uid, acc_enbd_sav, '2026-05-28', 'Car Loan EMI – ENBD',        'EMI',            1850, 'AED', 'UAE',   'emi'),
    (uid, acc_hdfc_sav, '2026-05-01', 'HDFC Home Loan EMI',         'EMI',           58000, 'INR', 'India', 'emi'),
    (uid, acc_sbi_sav,  '2026-05-01', 'SBI Personal Loan EMI',      'EMI',           12500, 'INR', 'India', 'emi'),
    (uid, acc_hdfc_sav, '2026-05-05', 'SIP – Parag Parikh',         'Investments',   10000, 'INR', 'India', 'expense'),
    (uid, acc_hdfc_sav, '2026-05-05', 'SIP – Axis Bluechip',        'Investments',    8000, 'INR', 'India', 'expense'),
    (uid, acc_hdfc_sav, '2026-05-10', 'Family Transfer',            'Family',        30000, 'INR', 'India', 'expense'),
    (uid, acc_axis_cc,  '2026-05-12', 'BigBasket',                  'Groceries',      7200, 'INR', 'India', 'expense'),
    (uid, acc_axis_cc,  '2026-05-18', 'Zomato',                     'Dining Out',     4500, 'INR', 'India', 'expense'),
    (uid, acc_axis_cc,  '2026-05-22', 'Decathlon',                  'Shopping',       9800, 'INR', 'India', 'expense');

  RAISE NOTICE 'Demo data inserted successfully for user: %', uid;
END $$;
