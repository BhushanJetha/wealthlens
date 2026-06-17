-- ================================================================
-- WealthLens — 2-YEAR SAMPLE DATA for test@gmail.com
-- Paste into Supabase Dashboard → SQL Editor → Run.
-- Safe to re-run: it first deletes this user's existing data.
-- Aligns with the app's category/txn_type model so the Money Report,
-- budgets, transfers and investment dashboards all populate correctly.
-- ================================================================

DO $$
DECLARE
  uid          UUID;
  acc_enbd_sav UUID;
  acc_hdfc_sav UUID;
  acc_sbi_sav  UUID;
  acc_enbd_cc  UUID;
  acc_axis_cc  UUID;
BEGIN
  SELECT id INTO uid FROM auth.users WHERE lower(email) = 'test@gmail.com' ORDER BY created_at LIMIT 1;
  IF uid IS NULL THEN
    RAISE EXCEPTION 'No user with email test@gmail.com — sign up that account in the app first.';
  END IF;

  UPDATE profiles SET full_name = 'Test User', default_view = 'consolidated' WHERE id = uid;

  -- ---- Clean existing data for a fresh, idempotent load -------------------
  DELETE FROM transactions WHERE user_id = uid;
  DELETE FROM budgets      WHERE user_id = uid;
  DELETE FROM goals        WHERE user_id = uid;
  DELETE FROM mutual_funds WHERE user_id = uid;
  DELETE FROM stocks       WHERE user_id = uid;
  DELETE FROM home_loans   WHERE user_id = uid;
  DELETE FROM insurance_policies WHERE user_id = uid;
  BEGIN DELETE FROM fixed_deposits     WHERE user_id = uid; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN DELETE FROM recurring_deposits WHERE user_id = uid; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN DELETE FROM nps_accounts       WHERE user_id = uid; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN DELETE FROM lic_policies       WHERE user_id = uid; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN DELETE FROM gold_investments   WHERE user_id = uid; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN DELETE FROM bond_investments   WHERE user_id = uid; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN DELETE FROM etf_investments    WHERE user_id = uid; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN DELETE FROM ppf_epf_accounts   WHERE user_id = uid; EXCEPTION WHEN undefined_table THEN NULL; END;
  DELETE FROM accounts WHERE user_id = uid;  -- after transactions (FK)

  -- ================================================================
  -- ACCOUNTS
  -- ================================================================
  INSERT INTO accounts (user_id, name, bank_name, account_type, currency, country, current_balance, is_active)
    VALUES (uid, 'ENBD Savings', 'Emirates NBD', 'savings', 'AED', 'UAE', 48250.00, true) RETURNING id INTO acc_enbd_sav;
  INSERT INTO accounts (user_id, name, bank_name, account_type, currency, country, current_balance, is_active)
    VALUES (uid, 'HDFC Savings', 'HDFC Bank', 'savings', 'INR', 'India', 192000.00, true) RETURNING id INTO acc_hdfc_sav;
  INSERT INTO accounts (user_id, name, bank_name, account_type, currency, country, current_balance, is_active)
    VALUES (uid, 'SBI NRO Savings', 'State Bank of India', 'savings', 'INR', 'India', 88000.00, true) RETURNING id INTO acc_sbi_sav;
  INSERT INTO accounts (user_id, name, bank_name, account_type, currency, country, credit_limit, outstanding_bal, minimum_due, due_date, is_active)
    VALUES (uid, 'ENBD Skywards Credit Card', 'Emirates NBD', 'credit_card', 'AED', 'UAE', 30000.00, 6850.00, 350.00, (date_trunc('month', CURRENT_DATE) + interval '14 days')::date, true) RETURNING id INTO acc_enbd_cc;
  INSERT INTO accounts (user_id, name, bank_name, account_type, currency, country, credit_limit, outstanding_bal, minimum_due, due_date, is_active)
    VALUES (uid, 'Axis Magnus Credit Card', 'Axis Bank', 'credit_card', 'INR', 'India', 300000.00, 38500.00, 1950.00, (date_trunc('month', CURRENT_DATE) + interval '9 days')::date, true) RETURNING id INTO acc_axis_cc;

  -- ================================================================
  -- LOANS
  -- ================================================================
  INSERT INTO home_loans (user_id, name, bank_name, property_address, loan_type, sanctioned_amt, outstanding_amt, emi_amount, interest_rate, loan_start_date, tenure_months, months_paid, currency, country, next_emi_date, is_active)
  VALUES
    (uid,'Home Loan – HDFC','HDFC Bank','204 Prestige Lakeside, Whitefield, Bengaluru','home_loan',7500000,6050000,58000,8.65,'2023-06-01',240,36,'INR','India',(date_trunc('month',CURRENT_DATE)+interval '1 month')::date,true),
    (uid,'Car Loan – Emirates NBD','Emirates NBD',null,'car_loan',80000,38000,1850,4.99,'2023-06-01',60,36,'AED','UAE',(date_trunc('month',CURRENT_DATE)+interval '1 month')::date,true),
    (uid,'Personal Loan – SBI','State Bank of India',null,'personal_loan',500000,210000,12500,12.50,'2024-06-01',48,24,'INR','India',(date_trunc('month',CURRENT_DATE)+interval '1 month')::date,true);

  -- ================================================================
  -- INSURANCE
  -- ================================================================
  INSERT INTO insurance_policies (user_id, policy_name, policy_number, provider, policy_type, sum_assured, annual_premium, premium_frequency, start_date, expiry_date, next_premium_date, currency, country, is_active)
  VALUES
    (uid,'LIC Term Plan – 1 Crore','LIC-TRM-441234567','LIC of India','term_life',10000000,12500,'annual','2020-04-01','2045-04-01','2027-04-01','INR','India',true),
    (uid,'Star Health Family Floater 10L','STR-HLT-8821003','Star Health','health',1000000,24000,'annual','2023-07-15','2026-07-15','2026-07-15','INR','India',true),
    (uid,'Daman Health – Gold Plan','DAM-2024-AE-90142','Daman','health',500000,4200,'annual','2025-01-01','2026-12-31','2026-12-31','AED','UAE',true),
    (uid,'ADNIC Motor Insurance','ADNIC-MOT-2025-77341','ADNIC','vehicle',null,2800,'annual','2025-03-01','2026-03-01','2026-03-01','AED','UAE',true);

  -- ================================================================
  -- STOCKS (created_at spread over 1–3 yrs for realistic XIRR / wealth curve)
  -- ================================================================
  INSERT INTO stocks (user_id, symbol, name, exchange, currency, country, quantity, avg_buy_price, current_price, sector, created_at)
  VALUES
    (uid,'RELIANCE','Reliance Industries Ltd','NSE','INR','India', 50,2450.00,2890.00,'Energy','2023-03-01'),
    (uid,'TCS','Tata Consultancy Services','NSE','INR','India', 20,3600.00,4250.00,'Technology','2023-07-15'),
    (uid,'HDFCBANK','HDFC Bank Ltd','NSE','INR','India', 80,1450.00,1720.00,'Banking','2022-11-01'),
    (uid,'INFY','Infosys Ltd','NSE','INR','India', 60,1400.00,1650.00,'Technology','2024-01-10'),
    (uid,'ITC','ITC Ltd','NSE','INR','India',200, 360.00, 465.00,'FMCG','2023-05-20'),
    (uid,'EMBNK','Emirates NBD Bank','DFM','AED','UAE',100,  14.20,  17.80,'Banking','2024-08-01'),
    (uid,'ALDAR','Aldar Properties PJSC','ADX','AED','UAE',200,   4.10,   5.45,'Real Estate','2024-09-15');

  -- ================================================================
  -- MUTUAL FUNDS
  -- ================================================================
  INSERT INTO mutual_funds (user_id, fund_name, fund_type, folio_number, units, avg_nav, current_nav, invested_amount, currency, country, created_at)
  VALUES
    (uid,'Parag Parikh Flexi Cap Fund – Direct Growth','equity','PPFAS/12345678',1250.500,48.50, 65.30, 60650.00,'INR','India','2023-01-15'),
    (uid,'Mirae Asset Large & Midcap Fund – Direct Growth','equity','MAM/87654321',890.250,85.20,108.50, 75861.00,'INR','India','2023-06-10'),
    (uid,'Axis Bluechip Fund – Direct Growth','equity','AXIS/44556677',2100.750,42.30, 54.80, 88862.00,'INR','India','2022-09-01'),
    (uid,'SBI Small Cap Fund – Direct Growth','equity','SBI/99887766',560.500,98.50,142.30, 55209.00,'INR','India','2024-02-20'),
    (uid,'HDFC Balanced Advantage Fund – Direct Growth','hybrid','HDFC/33221100',3200.000,68.40, 82.50,218880.00,'INR','India','2022-04-05'),
    (uid,'Mirae Asset ELSS Tax Saver Fund – Direct Growth','elss','MAM/ELSS/112233',1800.000,28.80, 38.50, 51840.00,'INR','India','2024-04-01');

  -- ================================================================
  -- FIXED DEPOSITS / RD / NPS / LIC / GOLD / BONDS / ETF / PPF-EPF
  -- (each wrapped so a not-yet-migrated table is skipped, not fatal)
  -- ================================================================
  BEGIN
    INSERT INTO fixed_deposits (user_id, name, bank_name, principal, interest_rate, start_date, maturity_date, maturity_amt, currency, country, is_active)
    VALUES
      (uid,'HDFC Bank FD – 3 Year','HDFC Bank',500000,7.25,'2023-09-15','2026-09-15',615200.00,'INR','India',true),
      (uid,'SBI Tax Saver FD – 5 Year','State Bank of India',150000,7.10,'2024-01-10','2029-01-10',212300.00,'INR','India',true),
      (uid,'Emirates NBD Term Deposit','Emirates NBD',20000,5.25,'2024-06-01','2026-06-01',22095.00,'AED','UAE',true);
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'fixed_deposits skipped: %', SQLERRM; END;

  BEGIN
    INSERT INTO recurring_deposits (user_id, name, bank_name, monthly_amount, interest_rate, start_date, maturity_date, tenure_months, currency, country, is_active)
    VALUES
      (uid,'SBI RD – Goal Saver','State Bank of India',10000,6.75,'2024-04-01','2027-04-01',36,'INR','India',true),
      (uid,'HDFC Bank RD','HDFC Bank',5000,7.00,'2025-01-01','2027-01-01',24,'INR','India',true);
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'recurring_deposits skipped: %', SQLERRM; END;

  BEGIN
    INSERT INTO nps_accounts (user_id, name, pran_number, tier, corpus_amount, invested_amount, equity_allocation, corporate_bond_allocation, govt_securities_allocation, fund_manager, start_date, currency, country)
    VALUES
      (uid,'NPS Tier I – SBI Pension','500123456789','Tier I',485000,360000,75,15,10,'SBI Pension Funds','2019-04-01','INR','India'),
      (uid,'NPS Tier II – HDFC Pension','500123456790','Tier II',125000,100000,50,30,20,'HDFC Pension Management','2021-06-01','INR','India');
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'nps_accounts skipped: %', SQLERRM; END;

  BEGIN
    INSERT INTO lic_policies (user_id, name, policy_number, plan_name, sum_assured, annual_premium, premium_frequency, premium_paid_years, policy_term_years, start_date, maturity_date, bonus_accrued, next_premium_date, total_paid, currency, country, is_active)
    VALUES
      (uid,'LIC Jeevan Anand','123456789','Jeevan Anand (Plan 815)',1000000,24500,'Annually',13.0,21,'2013-04-01','2034-04-01',385000,'2027-04-01',318500,'INR','India',true),
      (uid,'LIC Jeevan Labh','987654321','Jeevan Labh (Plan 836)',500000,12000,'Annually',8.0,25,'2018-04-01','2043-04-01',95000,'2027-04-01',96000,'INR','India',true);
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'lic_policies skipped: %', SQLERRM; END;

  BEGIN
    INSERT INTO gold_investments (user_id, name, gold_type, quantity_grams, buy_price_per_gram, current_price_per_gram, invested_amount, current_value, purchase_date, currency, country)
    VALUES
      (uid,'Physical Gold – Jewellery & Coins','physical',85,5200,7250,442000,616250,'2021-11-15','INR','India'),
      (uid,'Sovereign Gold Bond 2023-24 Series I','sgb',20,5900,7250,118000,145000,'2023-10-01','INR','India');
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'gold_investments skipped: %', SQLERRM; END;

  BEGIN
    INSERT INTO bond_investments (user_id, name, bond_type, face_value, quantity, coupon_rate, maturity_date, invested_amount, current_value, purchase_date, currency, country)
    VALUES
      (uid,'RBI 7.75% Savings Bond','rbi_bonds',1000,200,7.75,'2031-01-01',200000,218000,'2018-07-15','INR','India'),
      (uid,'NHAI Tax Free Bond 8.20%','tax_free',1000,100,8.20,'2027-03-15',100000,108500,'2017-03-15','INR','India');
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'bond_investments skipped: %', SQLERRM; END;

  BEGIN
    INSERT INTO etf_investments (user_id, etf_name, symbol, exchange, units, avg_buy_price, current_price, invested_amount, current_value, etf_type, purchase_date, currency, country, created_at)
    VALUES
      (uid,'Nippon India Nifty 50 BeES','NIFTYBEES','NSE',500,215.40,268.50,107700,134250,'index','2022-06-01','INR','India','2022-06-01'),
      (uid,'Mirae Asset NYSE FANG+ ETF','MAFANG','NSE',100, 85.20,112.30,  8520, 11230,'international','2023-04-01','INR','India','2023-04-01'),
      (uid,'HDFC Gold ETF','HDFCGOLD','NSE',200, 46.80, 58.10,  9360, 11620,'gold','2022-11-01','INR','India','2022-11-01');
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'etf_investments skipped: %', SQLERRM; END;

  BEGIN
    INSERT INTO ppf_epf_accounts (user_id, kind, name, account_number, current_balance, annual_contribution, interest_rate, start_date, maturity_date, currency, country, holder_name)
    VALUES
      (uid,'ppf','PPF – SBI','PPF0012345',1250000,150000,7.10,'2018-04-01','2033-04-01','INR','India','Self'),
      (uid,'epf','EPF – EPFO','EPF/MH/12345',1850000,144000,8.25,'2015-07-01',NULL,'INR','India','Self');
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'ppf_epf_accounts skipped (run migration 017): %', SQLERRM; END;

  -- ================================================================
  -- GOALS
  -- ================================================================
  INSERT INTO goals (user_id, name, target_amount, current_amount, target_date, currency, country, color, emoji)
  VALUES
    (uid,'Emergency Fund (6 months)',1500000,985000,'2027-12-31','INR','India','#00C9A7','🛡️'),
    (uid,'Dubai Property Down Payment',300000,165000,'2028-06-30','AED','UAE','#7C5CBF','🏡'),
    (uid,'Children''s Education Fund',5000000,1350000,'2035-04-01','INR','India','#F59E0B','🎓'),
    (uid,'Annual Family Vacation',500000,310000,'2026-12-31','INR','India','#EF4444','✈️');

  -- ================================================================
  -- BUDGETS — current + previous 2 months (so Budget vs Actual works)
  -- ================================================================
  INSERT INTO budgets (user_id, category, monthly_cap, currency, month_year)
  SELECT uid, c.cat, c.cap, 'INR', to_char(date_trunc('month', CURRENT_DATE) - (g||' months')::interval, 'YYYY-MM')
  FROM generate_series(0,2) g
  CROSS JOIN (VALUES
    ('Groceries',18000),('Dining Out',8000),('Transport',8000),('Entertainment',4000),
    ('Shopping',20000),('Healthcare',5000),('Education',14000),('Utilities',4000),
    ('Investment',18000),('EMI/Loan',90000)
  ) AS c(cat, cap)
  ON CONFLICT (user_id, category, month_year) DO NOTHING;

  -- ================================================================
  -- TRANSACTIONS — 24 months, generated. Uses the app's txn_type model:
  --   income / expense / transfer / loan.  'Investment' & 'Credit Card
  --   Payment' categories are excluded from "spend" in the Money Report.
  -- d0 = first day of each of the last 24 months.
  -- ================================================================

  -- helper expression for the first-of-month date, N months ago: g

  -- UAE income
  INSERT INTO transactions (user_id, account_id, txn_date, merchant, category, amount, currency, country, txn_type)
  SELECT uid, acc_enbd_sav, (date_trunc('month',CURRENT_DATE)-(g||' months')::interval)::date,
         'Salary Credit','Salary',25000,'AED','UAE','income' FROM generate_series(0,23) g;

  -- Year-end bonus (December only)
  INSERT INTO transactions (user_id, account_id, txn_date, merchant, category, amount, currency, country, txn_type)
  SELECT uid, acc_enbd_sav, (date_trunc('month',CURRENT_DATE)-(g||' months')::interval)::date,
         'Year-End Bonus','Bonus',15000,'AED','UAE','income' FROM generate_series(0,23) g
  WHERE EXTRACT(MONTH FROM (date_trunc('month',CURRENT_DATE)-(g||' months')::interval)) = 12;

  -- UAE expenses
  INSERT INTO transactions (user_id, account_id, txn_date, merchant, category, amount, currency, country, txn_type)
  SELECT uid, acc_enbd_sav, (date_trunc('month',CURRENT_DATE)-(g||' months')::interval + interval '1 day')::date,
         'Apartment Rent','Rent',7500,'AED','UAE','expense' FROM generate_series(0,23) g;
  INSERT INTO transactions (user_id, account_id, txn_date, merchant, category, amount, currency, country, txn_type)
  SELECT uid, acc_enbd_sav, (date_trunc('month',CURRENT_DATE)-(g||' months')::interval + interval '4 days')::date,
         'DEWA + du','Utilities',round((580+random()*220)::numeric,0),'AED','UAE','expense' FROM generate_series(0,23) g;
  INSERT INTO transactions (user_id, account_id, txn_date, merchant, category, amount, currency, country, txn_type)
  SELECT uid, acc_enbd_sav, (date_trunc('month',CURRENT_DATE)-(g||' months')::interval + interval '8 days')::date,
         'Carrefour / Lulu','Groceries',round((650+random()*350)::numeric,0),'AED','UAE','expense' FROM generate_series(0,23) g;
  INSERT INTO transactions (user_id, account_id, txn_date, merchant, category, amount, currency, country, txn_type)
  SELECT uid, acc_enbd_sav, (date_trunc('month',CURRENT_DATE)-(g||' months')::interval + interval '11 days')::date,
         'ADNOC Fuel','Transport',round((240+random()*120)::numeric,0),'AED','UAE','expense' FROM generate_series(0,23) g;
  INSERT INTO transactions (user_id, account_id, txn_date, merchant, category, amount, currency, country, txn_type)
  SELECT uid, acc_enbd_cc, (date_trunc('month',CURRENT_DATE)-(g||' months')::interval + interval '15 days')::date,
         'Dubai Restaurants','Dining Out',round((150+random()*520)::numeric,0),'AED','UAE','expense' FROM generate_series(0,23) g;
  INSERT INTO transactions (user_id, account_id, txn_date, merchant, category, amount, currency, country, txn_type)
  SELECT uid, acc_enbd_sav, (date_trunc('month',CURRENT_DATE)-(g||' months')::interval + interval '17 days')::date,
         'GEMS School Fee','Education',2800,'AED','UAE','expense' FROM generate_series(0,23) g;
  INSERT INTO transactions (user_id, account_id, txn_date, merchant, category, amount, currency, country, txn_type)
  SELECT uid, acc_enbd_cc, (date_trunc('month',CURRENT_DATE)-(g||' months')::interval + interval '19 days')::date,
         'Dubai Mall','Shopping',round((300+random()*1200)::numeric,0),'AED','UAE','expense' FROM generate_series(0,23) g;
  -- UAE car loan EMI
  INSERT INTO transactions (user_id, account_id, txn_date, merchant, category, amount, currency, country, txn_type)
  SELECT uid, acc_enbd_sav, (date_trunc('month',CURRENT_DATE)-(g||' months')::interval + interval '27 days')::date,
         'Car Loan EMI – ENBD','EMI/Loan',1850,'AED','UAE','loan' FROM generate_series(0,23) g;
  -- UAE -> India remittance (International transfer)
  INSERT INTO transactions (user_id, account_id, txn_date, merchant, category, sub_category, amount, currency, country, txn_type)
  SELECT uid, acc_enbd_sav, (date_trunc('month',CURRENT_DATE)-(g||' months')::interval + interval '9 days')::date,
         'Family Remittance to India','International Transfer','International',round((2800+random()*600)::numeric,0),'AED','UAE','transfer' FROM generate_series(0,23) g;

  -- India loan EMIs
  INSERT INTO transactions (user_id, account_id, txn_date, merchant, category, amount, currency, country, txn_type)
  SELECT uid, acc_hdfc_sav, (date_trunc('month',CURRENT_DATE)-(g||' months')::interval)::date,
         'HDFC Home Loan EMI','EMI/Loan',58000,'INR','India','loan' FROM generate_series(0,23) g;
  INSERT INTO transactions (user_id, account_id, txn_date, merchant, category, amount, currency, country, txn_type)
  SELECT uid, acc_sbi_sav, (date_trunc('month',CURRENT_DATE)-(g||' months')::interval)::date,
         'SBI Personal Loan EMI','EMI/Loan',12500,'INR','India','loan' FROM generate_series(0,23) g;
  -- India SIPs (Investment — excluded from spend)
  INSERT INTO transactions (user_id, account_id, txn_date, merchant, category, amount, currency, country, txn_type)
  SELECT uid, acc_hdfc_sav, (date_trunc('month',CURRENT_DATE)-(g||' months')::interval + interval '4 days')::date,
         'SIP – Parag Parikh Flexi','Investment',10000,'INR','India','expense' FROM generate_series(0,23) g;
  INSERT INTO transactions (user_id, account_id, txn_date, merchant, category, amount, currency, country, txn_type)
  SELECT uid, acc_hdfc_sav, (date_trunc('month',CURRENT_DATE)-(g||' months')::interval + interval '4 days')::date,
         'SIP – Axis Bluechip','Investment',8000,'INR','India','expense' FROM generate_series(0,23) g;
  -- India everyday spend
  INSERT INTO transactions (user_id, account_id, txn_date, merchant, category, amount, currency, country, txn_type)
  SELECT uid, acc_axis_cc, (date_trunc('month',CURRENT_DATE)-(g||' months')::interval + interval '14 days')::date,
         'BigBasket / Reliance Fresh','Groceries',round((4000+random()*3000)::numeric,0),'INR','India','expense' FROM generate_series(0,23) g;
  INSERT INTO transactions (user_id, account_id, txn_date, merchant, category, amount, currency, country, txn_type)
  SELECT uid, acc_axis_cc, (date_trunc('month',CURRENT_DATE)-(g||' months')::interval + interval '19 days')::date,
         'Swiggy / Zomato','Dining Out',round((1500+random()*3200)::numeric,0),'INR','India','expense' FROM generate_series(0,23) g;
  INSERT INTO transactions (user_id, account_id, txn_date, merchant, category, amount, currency, country, txn_type)
  SELECT uid, acc_axis_cc, (date_trunc('month',CURRENT_DATE)-(g||' months')::interval + interval '22 days')::date,
         'PVR / Netflix / BookMyShow','Entertainment',round((500+random()*2000)::numeric,0),'INR','India','expense' FROM generate_series(0,23) g;
  -- India credit-card bill payment (excluded from spend)
  INSERT INTO transactions (user_id, account_id, txn_date, merchant, category, amount, currency, country, txn_type)
  SELECT uid, acc_hdfc_sav, (date_trunc('month',CURRENT_DATE)-(g||' months')::interval + interval '25 days')::date,
         'Axis Credit Card Payment','Credit Card Payment',round((9000+random()*8000)::numeric,0),'INR','India','expense' FROM generate_series(0,23) g;
  -- Quarterly FD interest (income)
  INSERT INTO transactions (user_id, account_id, txn_date, merchant, category, amount, currency, country, txn_type)
  SELECT uid, acc_hdfc_sav, (date_trunc('month',CURRENT_DATE)-(g||' months')::interval + interval '6 days')::date,
         'FD Interest Credit','Interest',round((8000+random()*2500)::numeric,0),'INR','India','income' FROM generate_series(0,23) g
  WHERE g % 3 = 0;
  -- Occasional healthcare (every 4th month)
  INSERT INTO transactions (user_id, account_id, txn_date, merchant, category, amount, currency, country, txn_type)
  SELECT uid, acc_axis_cc, (date_trunc('month',CURRENT_DATE)-(g||' months')::interval + interval '16 days')::date,
         'Apollo / Practo','Healthcare',round((1500+random()*2800)::numeric,0),'INR','India','expense' FROM generate_series(0,23) g
  WHERE g % 4 = 0;

  RAISE NOTICE 'Seeded 2 years of sample data for test@gmail.com (uid %)', uid;
END $$;
