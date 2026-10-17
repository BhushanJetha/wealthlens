// Creates (or refreshes) a demo login filled with ~2 years of realistic NRI
// sample data (UAE salary, AED + INR cards, loans, NRE→NRO transfers,
// insurance, investments, goals, budgets) so the app can be demoed safely.
//
//   npm run seed:demo                          → demo@example.com, random password
//   npm run seed:demo -- demo2@example.com Pass123!   → that email / password
//
// Re-running wipes and reloads that demo user's data only. Refuses to wipe an
// existing account other than demo@example.com unless --wipe is passed.
// Reads NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from .env.local.
import { readFileSync } from 'fs'
import { randomBytes } from 'crypto'
import { createClient } from '@supabase/supabase-js'

const DEFAULT_EMAIL = 'demo@example.com'
const args = process.argv.slice(2).filter(a => !a.startsWith('--'))
const force = process.argv.includes('--wipe')
const email = (args[0] || DEFAULT_EMAIL).toLowerCase()
let password = args[1]

const env = Object.fromEntries(readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split(/\r?\n/)
  .filter(l => l.includes('=') && !l.trim().startsWith('#'))
  .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

// ── Dates ────────────────────────────────────────────────────────────────────
const today = new Date()
const ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const todayStr = ymd(today)
const monthStart = g => new Date(today.getFullYear(), today.getMonth() - g, 1)
const dayOf = (g, day) => { const d = monthStart(g); d.setDate(day); return ymd(d) }
const rel = months => ymd(new Date(today.getFullYear(), today.getMonth() + months, today.getDate()))
const rnd = (min, span) => Math.round(min + Math.random() * span)

// ── 1. The login ─────────────────────────────────────────────────────────────
async function findUser() {
  for (let page = 1; ; page++) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw error
    const u = data.users.find(x => x.email?.toLowerCase() === email)
    if (u || data.users.length < 200) return u ?? null
  }
}

let user = await findUser()
let passwordSet = false
if (!user) {
  password ||= `Demo-${randomBytes(3).toString('hex')}-${randomBytes(3).toString('hex')}`
  const { data, error } = await sb.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: 'Demo User' } })
  if (error) throw error
  user = data.user; passwordSet = true
  console.log(`Created login ${email}`)
} else {
  if (email !== DEFAULT_EMAIL && !force) {
    console.error(`${email} already exists — re-run with --wipe to replace its data with demo data.`)
    process.exit(1)
  }
  if (password) {
    const { error } = await sb.auth.admin.updateUserById(user.id, { password })
    if (error) throw error
    passwordSet = true
  }
  console.log(`Refreshing existing login ${email}`)
}
const uid = user.id

// Profile row normally comes from the signup trigger — make sure it's there
await sb.from('profiles').upsert({ id: uid, email, full_name: 'Demo User', default_view: 'consolidated' })

// ── 2. Wipe this user's data ─────────────────────────────────────────────────
const TABLES = ['transactions', 'budgets', 'goals', 'mutual_funds', 'stocks', 'home_loans', 'insurance_policies',
  'fixed_deposits', 'recurring_deposits', 'nps_accounts', 'lic_policies', 'gold_investments', 'bond_investments',
  'etf_investments', 'ppf_epf_accounts', 'financial_profile', 'vision_pins', 'accounts']
for (const t of TABLES) await sb.from(t).delete().eq('user_id', uid)   // missing tables just error — fine

async function ins(table, rows, { optional = false, select = 'id' } = {}) {
  const out = []
  for (let i = 0; i < rows.length; i += 500) {
    const { data, error } = await sb.from(table).insert(rows.slice(i, i + 500).map(r => ({ user_id: uid, ...r }))).select(select)
    if (error) {
      if (optional) { console.log(`  · ${table.padEnd(19)} skipped (${error.message})`); return [] }
      throw new Error(`${table}: ${error.message}`)
    }
    out.push(...data)
  }
  console.log(`  ✓ ${table.padEnd(19)} ${rows.length}`)
  return out
}
const AED = { currency: 'AED', country: 'UAE' }, INR = { currency: 'INR', country: 'India' }

// ── 3. Accounts ──────────────────────────────────────────────────────────────
const accts = await ins('accounts', [
  { ...AED, name: 'ENBD Savings', bank_name: 'Emirates NBD', account_type: 'savings', current_balance: 48250, last_four: '2041' },
  { ...INR, name: 'HDFC NRE Savings', bank_name: 'HDFC Bank', account_type: 'savings', current_balance: 192000, last_four: '7731' },
  { ...INR, name: 'SBI NRO Savings', bank_name: 'State Bank of India', account_type: 'savings', current_balance: 88000, last_four: '5520' },
  { ...AED, name: 'ENBD Skywards Credit Card', bank_name: 'Emirates NBD', account_type: 'credit_card', last_four: '6634',
    credit_limit: 30000, outstanding_bal: 6850, minimum_due: 350, due_date: dayOf(-1, 14) },
  { ...INR, name: 'Axis Magnus Credit Card', bank_name: 'Axis Bank', account_type: 'credit_card', last_four: '9012',
    credit_limit: 300000, outstanding_bal: 38500, minimum_due: 1950, due_date: dayOf(-1, 9) },
].map(a => ({ is_active: true, ...a })), { select: 'id,name' })
const A = Object.fromEntries(accts.map(a => [a.name, a.id]))
const enbdSav = A['ENBD Savings'], hdfc = A['HDFC NRE Savings'], sbi = A['SBI NRO Savings']
const enbdCC = A['ENBD Skywards Credit Card'], axisCC = A['Axis Magnus Credit Card']

// ── 4. Loans, insurance, investments, goals ──────────────────────────────────
await ins('home_loans', [
  { ...INR, name: 'Home Loan – HDFC', bank_name: 'HDFC Bank', property_address: '204 Prestige Lakeside, Whitefield, Bengaluru', loan_type: 'home_loan',
    sanctioned_amt: 7500000, outstanding_amt: 6050000, emi_amount: 58000, interest_rate: 8.65, loan_start_date: '2023-06-01', tenure_months: 240, months_paid: 40 },
  { ...AED, name: 'Car Loan – Emirates NBD', bank_name: 'Emirates NBD', loan_type: 'car_loan',
    sanctioned_amt: 80000, outstanding_amt: 38000, emi_amount: 1850, interest_rate: 4.99, loan_start_date: '2023-06-01', tenure_months: 60, months_paid: 40 },
  { ...INR, name: 'Personal Loan – SBI', bank_name: 'State Bank of India', loan_type: 'personal_loan',
    sanctioned_amt: 500000, outstanding_amt: 210000, emi_amount: 12500, interest_rate: 12.5, loan_start_date: '2024-06-01', tenure_months: 48, months_paid: 28 },
].map(l => ({ is_active: true, next_emi_date: dayOf(-1, 1), ...l })))

await ins('insurance_policies', [
  { ...INR, policy_name: 'LIC Term Plan – 1 Crore', policy_number: 'LIC-TRM-441234567', provider: 'LIC of India', policy_type: 'term_life',
    sum_assured: 10000000, annual_premium: 12500, start_date: '2020-04-01', expiry_date: '2045-04-01', next_premium_date: rel(6) },
  { ...INR, policy_name: 'Star Health Family Floater 10L', policy_number: 'STR-HLT-8821003', provider: 'Star Health', policy_type: 'health',
    sum_assured: 1000000, annual_premium: 24000, start_date: rel(-3), expiry_date: rel(9), next_premium_date: rel(9) },
  { ...AED, policy_name: 'Daman Health – Gold Plan', policy_number: 'DAM-2026-AE-90142', provider: 'Daman', policy_type: 'health',
    sum_assured: 500000, annual_premium: 4200, start_date: rel(-5), expiry_date: rel(7), next_premium_date: rel(7) },
  { ...AED, policy_name: 'ADNIC Motor Insurance', policy_number: 'ADNIC-MOT-2026-77341', provider: 'ADNIC', policy_type: 'vehicle',
    sum_assured: null, annual_premium: 2800, start_date: rel(-2), expiry_date: rel(10), next_premium_date: rel(10) },
].map(p => ({ is_active: true, premium_frequency: 'annual', ...p })))

await ins('stocks', [
  ['RELIANCE', 'Reliance Industries Ltd', 'NSE', INR, 50, 2450, 2890, 'Energy', '2023-03-01'],
  ['TCS', 'Tata Consultancy Services', 'NSE', INR, 20, 3600, 4250, 'Technology', '2023-07-15'],
  ['HDFCBANK', 'HDFC Bank Ltd', 'NSE', INR, 80, 1450, 1720, 'Banking', '2022-11-01'],
  ['INFY', 'Infosys Ltd', 'NSE', INR, 60, 1400, 1650, 'Technology', '2024-01-10'],
  ['ITC', 'ITC Ltd', 'NSE', INR, 200, 360, 465, 'FMCG', '2023-05-20'],
  ['EMIRATESNBD', 'Emirates NBD Bank', 'DFM', AED, 100, 14.2, 17.8, 'Banking', '2024-08-01'],
  ['ALDAR', 'Aldar Properties PJSC', 'ADX', AED, 200, 4.1, 5.45, 'Real Estate', '2024-09-15'],
].map(([symbol, name, exchange, cur, quantity, avg_buy_price, current_price, sector, created_at]) =>
  ({ ...cur, symbol, name, exchange, quantity, avg_buy_price, current_price, sector, created_at })))

await ins('mutual_funds', [
  ['Parag Parikh Flexi Cap Fund – Direct Growth', 'equity', 'PPFAS/12345678', 1250.5, 48.5, 65.3, 60650, '2023-01-15'],
  ['Mirae Asset Large & Midcap Fund – Direct Growth', 'equity', 'MAM/87654321', 890.25, 85.2, 108.5, 75861, '2023-06-10'],
  ['Axis Bluechip Fund – Direct Growth', 'equity', 'AXIS/44556677', 2100.75, 42.3, 54.8, 88862, '2022-09-01'],
  ['SBI Small Cap Fund – Direct Growth', 'equity', 'SBI/99887766', 560.5, 98.5, 142.3, 55209, '2024-02-20'],
  ['HDFC Balanced Advantage Fund – Direct Growth', 'hybrid', 'HDFC/33221100', 3200, 68.4, 82.5, 218880, '2022-04-05'],
  ['Mirae Asset ELSS Tax Saver Fund – Direct Growth', 'elss', 'MAM/ELSS/112233', 1800, 28.8, 38.5, 51840, '2024-04-01'],
].map(([fund_name, fund_type, folio_number, units, avg_nav, current_nav, invested_amount, created_at]) =>
  ({ ...INR, fund_name, fund_type, folio_number, units, avg_nav, current_nav, invested_amount, created_at })))

await ins('fixed_deposits', [
  { ...INR, name: 'HDFC Bank FD – 3 Year', bank_name: 'HDFC Bank', principal: 500000, interest_rate: 7.25, start_date: '2024-09-15', maturity_date: '2027-09-15', maturity_amt: 615200 },
  { ...INR, name: 'SBI Tax Saver FD – 5 Year', bank_name: 'State Bank of India', principal: 150000, interest_rate: 7.1, start_date: '2024-01-10', maturity_date: '2029-01-10', maturity_amt: 212300 },
  { ...AED, name: 'Emirates NBD Term Deposit', bank_name: 'Emirates NBD', principal: 20000, interest_rate: 5.25, start_date: '2025-06-01', maturity_date: '2027-06-01', maturity_amt: 22155 },
].map(f => ({ is_active: true, ...f })), { optional: true })

await ins('recurring_deposits', [
  { ...INR, name: 'SBI RD – Goal Saver', bank_name: 'State Bank of India', monthly_amount: 10000, interest_rate: 6.75, start_date: '2024-04-01', maturity_date: '2027-04-01', tenure_months: 36 },
  { ...INR, name: 'HDFC Bank RD', bank_name: 'HDFC Bank', monthly_amount: 5000, interest_rate: 7, start_date: '2025-01-01', maturity_date: '2027-01-01', tenure_months: 24 },
].map(r => ({ is_active: true, ...r })), { optional: true })

await ins('nps_accounts', [
  { ...INR, name: 'NPS Tier I – SBI Pension', pran_number: '500123456789', tier: 'Tier I', corpus_amount: 485000, invested_amount: 360000,
    equity_allocation: 75, corporate_bond_allocation: 15, govt_securities_allocation: 10, fund_manager: 'SBI Pension Funds', start_date: '2019-04-01' },
  { ...INR, name: 'NPS Tier II – HDFC Pension', pran_number: '500123456790', tier: 'Tier II', corpus_amount: 125000, invested_amount: 100000,
    equity_allocation: 50, corporate_bond_allocation: 30, govt_securities_allocation: 20, fund_manager: 'HDFC Pension Management', start_date: '2021-06-01' },
], { optional: true })

await ins('lic_policies', [
  { ...INR, name: 'LIC Jeevan Anand', policy_number: '123456789', plan_name: 'Jeevan Anand (Plan 815)', sum_assured: 1000000, annual_premium: 24500,
    premium_frequency: 'Annually', premium_paid_years: 13, policy_term_years: 21, start_date: '2013-04-01', maturity_date: '2034-04-01',
    bonus_accrued: 385000, next_premium_date: rel(6), total_paid: 318500, is_active: true },
  { ...INR, name: 'LIC Jeevan Labh', policy_number: '987654321', plan_name: 'Jeevan Labh (Plan 836)', sum_assured: 500000, annual_premium: 12000,
    premium_frequency: 'Annually', premium_paid_years: 8, policy_term_years: 25, start_date: '2018-04-01', maturity_date: '2043-04-01',
    bonus_accrued: 95000, next_premium_date: rel(6), total_paid: 96000, is_active: true },
], { optional: true })

await ins('gold_investments', [
  { ...INR, name: 'Physical Gold – Jewellery & Coins', gold_type: 'physical', quantity_grams: 85, buy_price_per_gram: 5200, current_price_per_gram: 7250, invested_amount: 442000, current_value: 616250, purchase_date: '2021-11-15' },
  { ...INR, name: 'Sovereign Gold Bond 2023-24 Series I', gold_type: 'sgb', quantity_grams: 20, buy_price_per_gram: 5900, current_price_per_gram: 7250, invested_amount: 118000, current_value: 145000, purchase_date: '2023-10-01' },
], { optional: true })

await ins('bond_investments', [
  { ...INR, name: 'RBI 7.75% Savings Bond', bond_type: 'rbi_bonds', face_value: 1000, quantity: 200, coupon_rate: 7.75, maturity_date: '2031-01-01', invested_amount: 200000, current_value: 218000, purchase_date: '2018-07-15' },
  { ...INR, name: 'NHAI Tax Free Bond 8.20%', bond_type: 'tax_free', face_value: 1000, quantity: 100, coupon_rate: 8.2, maturity_date: '2027-03-15', invested_amount: 100000, current_value: 108500, purchase_date: '2017-03-15' },
], { optional: true })

await ins('etf_investments', [
  { ...INR, etf_name: 'Nippon India Nifty 50 BeES', symbol: 'NIFTYBEES', exchange: 'NSE', units: 500, avg_buy_price: 215.4, current_price: 268.5, invested_amount: 107700, current_value: 134250, etf_type: 'index', purchase_date: '2022-06-01', created_at: '2022-06-01' },
  { ...INR, etf_name: 'Mirae Asset NYSE FANG+ ETF', symbol: 'MAFANG', exchange: 'NSE', units: 100, avg_buy_price: 85.2, current_price: 112.3, invested_amount: 8520, current_value: 11230, etf_type: 'international', purchase_date: '2023-04-01', created_at: '2023-04-01' },
  { ...INR, etf_name: 'HDFC Gold ETF', symbol: 'HDFCGOLD', exchange: 'NSE', units: 200, avg_buy_price: 46.8, current_price: 58.1, invested_amount: 9360, current_value: 11620, etf_type: 'gold', purchase_date: '2022-11-01', created_at: '2022-11-01' },
], { optional: true })

await ins('ppf_epf_accounts', [
  { ...INR, kind: 'ppf', name: 'PPF – SBI', account_number: 'PPF0012345', current_balance: 1250000, annual_contribution: 150000, interest_rate: 7.1, start_date: '2018-04-01', maturity_date: '2033-04-01', holder_name: 'Self' },
  { ...INR, kind: 'epf', name: 'EPF – EPFO', account_number: 'EPF/MH/12345', current_balance: 1850000, annual_contribution: 144000, interest_rate: 8.25, start_date: '2015-07-01', maturity_date: null, holder_name: 'Self' },
], { optional: true })

await ins('goals', [
  { ...INR, name: 'Emergency Fund (6 months)', target_amount: 1500000, current_amount: 985000, target_date: '2027-12-31', color: '#00C9A7', emoji: '🛡️' },
  { ...AED, name: 'Dubai Property Down Payment', target_amount: 300000, current_amount: 165000, target_date: '2028-06-30', color: '#7C5CBF', emoji: '🏡' },
  { ...INR, name: 'Children’s Education Fund', target_amount: 5000000, current_amount: 1350000, target_date: '2035-04-01', color: '#F59E0B', emoji: '🎓' },
  { ...INR, name: 'Annual Family Vacation', target_amount: 500000, current_amount: 310000, target_date: rel(3), color: '#EF4444', emoji: '✈️' },
], { optional: true })

// Budgets for this month and the previous two (Budget vs Actual)
const budgetCaps = [
  ['Food', 22000, 'INR'], ['Entertainment', 4000, 'INR'], ['Health', 5000, 'INR'], ['Investment', 18000, 'INR'],
  ['EMI/Loan', 72000, 'INR'], ['Family Transfer', 15000, 'INR'],
  ['Food', 1800, 'AED'], ['Transport', 450, 'AED'], ['Utilities', 900, 'AED'], ['Shopping', 1200, 'AED'], ['Education', 2800, 'AED'],
]
await ins('budgets', [0, 1, 2].flatMap(g => budgetCaps.map(([category, monthly_cap, currency]) =>
  ({ category, monthly_cap, currency, month_year: dayOf(g, 1).slice(0, 7) }))), { optional: true })

// ── 5. Transactions — 24 months, nothing dated after today ───────────────────
const txns = []
const add = (g, day, t) => { const d = dayOf(g, day); if (d <= todayStr) txns.push({ source: 'manual', ...t, txn_date: d }) }
for (let g = 0; g < 24; g++) {
  const month = monthStart(g).getMonth() + 1
  // UAE — salary & bonus
  add(g, 1, { ...AED, account_id: enbdSav, merchant: 'Salary Credit', category: 'Salary', amount: 25000, txn_type: 'income' })
  if (month === 12) add(g, 1, { ...AED, account_id: enbdSav, merchant: 'Year-End Bonus', category: 'Bonus', amount: 15000, txn_type: 'income' })
  // UAE — living costs (bank + card)
  add(g, 2, { ...AED, account_id: enbdSav, merchant: 'Apartment Rent', category: 'Rent', amount: 7500, txn_type: 'expense' })
  add(g, 5, { ...AED, account_id: enbdSav, merchant: 'DEWA + du', category: 'Utilities', amount: rnd(580, 220), txn_type: 'expense' })
  add(g, 9, { ...AED, account_id: enbdCC, merchant: 'Carrefour / Lulu', category: 'Food', amount: rnd(650, 350), txn_type: 'expense' })
  add(g, 12, { ...AED, account_id: enbdCC, merchant: 'ADNOC Fuel', category: 'Transport', amount: rnd(240, 120), txn_type: 'expense' })
  add(g, 16, { ...AED, account_id: enbdCC, merchant: 'Dubai Restaurants', category: 'Food', amount: rnd(150, 520), txn_type: 'expense' })
  add(g, 18, { ...AED, account_id: enbdSav, merchant: 'GEMS School Fee', category: 'Education', amount: 2800, txn_type: 'expense' })
  add(g, 20, { ...AED, account_id: enbdCC, merchant: 'Dubai Mall', category: 'Shopping', amount: rnd(300, 1200), txn_type: 'expense' })
  add(g, 25, { ...AED, account_id: enbdSav, merchant: 'ENBD Credit Card Payment', category: 'Credit Card Payment', amount: rnd(1600, 900), txn_type: 'expense' })
  add(g, 27, { ...AED, account_id: enbdSav, merchant: 'Car Loan EMI – ENBD', category: 'EMI/Loan', amount: 1850, txn_type: 'loan' })
  // UAE → India: remittance lands in NRE, then moves to NRO (= India income)
  const remit = rnd(4800, 600)
  add(g, 10, { ...AED, account_id: enbdSav, merchant: 'Family Remittance to India', category: 'International Transfer', sub_category: 'International', amount: remit, txn_type: 'transfer' })
  add(g, 11, { ...INR, account_id: sbi, merchant: 'NRE → NRO transfer', category: 'NRE to NRO', sub_category: 'Internal', amount: Math.round(remit * 22.8), txn_type: 'transfer' })
  // India — EMIs, SIPs, everyday spend, family support
  add(g, 1, { ...INR, account_id: hdfc, merchant: 'HDFC Home Loan EMI', category: 'EMI/Loan', amount: 58000, txn_type: 'loan' })
  add(g, 1, { ...INR, account_id: sbi, merchant: 'SBI Personal Loan EMI', category: 'EMI/Loan', amount: 12500, txn_type: 'loan' })
  add(g, 5, { ...INR, account_id: hdfc, merchant: 'SIP – Parag Parikh Flexi', category: 'Investment', amount: 10000, txn_type: 'expense' })
  add(g, 5, { ...INR, account_id: hdfc, merchant: 'SIP – Axis Bluechip', category: 'Investment', amount: 8000, txn_type: 'expense' })
  add(g, 13, { ...INR, account_id: sbi, merchant: 'Monthly support – Parents', category: 'Family Transfer', amount: 15000, txn_type: 'expense' })
  add(g, 15, { ...INR, account_id: axisCC, merchant: 'BigBasket / Reliance Fresh', category: 'Food', amount: rnd(4000, 3000), txn_type: 'expense' })
  add(g, 20, { ...INR, account_id: axisCC, merchant: 'Swiggy / Zomato', category: 'Food', amount: rnd(1500, 3200), txn_type: 'expense' })
  add(g, 23, { ...INR, account_id: axisCC, merchant: 'PVR / Netflix / BookMyShow', category: 'Entertainment', amount: rnd(500, 2000), txn_type: 'expense' })
  add(g, 26, { ...INR, account_id: hdfc, merchant: 'Axis Credit Card Payment', category: 'Credit Card Payment', amount: rnd(9000, 8000), txn_type: 'expense' })
  if (g % 3 === 0) add(g, 7, { ...INR, account_id: hdfc, merchant: 'FD Interest Credit', category: 'Interest', amount: rnd(8000, 2500), txn_type: 'income' })
  if (g % 4 === 0) add(g, 17, { ...INR, account_id: axisCC, merchant: 'Apollo / Practo', category: 'Health', amount: rnd(1500, 2800), txn_type: 'expense' })
}
await ins('transactions', txns)

console.log(`\nDemo ready → ${email}${passwordSet ? `  /  ${password}` : '  (password unchanged)'}`)
