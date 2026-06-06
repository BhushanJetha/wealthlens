'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { ArrowLeft, Target, Star, CheckCircle, Search } from 'lucide-react'

const THANE_BUDGET = {
  income: 100000,
  needs: {
    pct: 48, total: 48000, color: '#16A34A', bg: '#F0FDF4',
    items: [
      { label: 'Rent (1BHK, Thane West)',         amt: 18000 },
      { label: 'Groceries & Vegetables',           amt: 6000  },
      { label: 'Weekday Tiffin / Canteen',         amt: 3500  },
      { label: 'Transport (train + rickshaw)',      amt: 4000  },
      { label: 'Electricity + Water',              amt: 2500  },
      { label: 'Mobile + Broadband Internet',      amt: 1500  },
      { label: 'Household Help (maid)',             amt: 3000  },
      { label: 'Health Insurance (monthly)',        amt: 4500  },
      { label: 'Household Essentials / Toiletries', amt: 5000  },
    ],
  },
  wants: {
    pct: 28, total: 28000, color: '#2563EB', bg: '#EFF6FF',
    items: [
      { label: 'Dining Out & Cafes',                       amt: 5000 },
      { label: 'Entertainment (OTT + movies)',              amt: 2500 },
      { label: 'Shopping (clothes, accessories)',           amt: 7000 },
      { label: 'Weekend Trips (Lonavala, Alibaug, Matheran)', amt: 5000 },
      { label: 'Gym + Personal Care (salon)',               amt: 3500 },
      { label: 'Online Courses / Books',                   amt: 3000 },
      { label: 'Subscriptions (Netflix, Spotify, etc.)',   amt: 2000 },
    ],
  },
  savings: {
    pct: 24, total: 24000, color: '#7C3AED', bg: '#F5F3FF',
    items: [
      { label: 'Equity SIP (NIFTY 50 / Flexicap MF)', amt: 12000 },
      { label: 'PPF / NPS Contribution',               amt: 5000  },
      { label: 'Emergency Fund (liquid SB A/c)',        amt: 5000  },
      { label: 'Short-term Goal FD',                   amt: 2000  },
    ],
  },
}

const TIPS = [
  {
    icon: '🌍', title: 'NRI Split Rule', color: '#3B7DD8', bg: '#EFF6FF',
    subtitle: 'Managing UAE + India finances',
    content: 'As an NRI, manage two economies. UAE income covers your UAE lifestyle (AED), while systematic remittances build your India corpus. A healthy goal: remit 40–60% of net income to India each month for savings, investments, and family support.',
  },
  {
    icon: '🛡️', title: 'Emergency Fund', color: '#D97706', bg: '#FFFBEB',
    subtitle: '6 months of expenses, always',
    content: 'Keep 6 months of total expenses as an emergency fund in a liquid, accessible account. For NRIs, hold buffers in both UAE (local emergencies) and India (family emergencies). NRE savings accounts are ideal — fully repatriable and tax-free in India.',
  },
  {
    icon: '📱', title: 'Subscription Audit', color: '#EC4899', bg: '#FDF2F8',
    subtitle: 'Review every 3 months',
    content: 'Subscriptions creep up silently. Quarterly audit: review every streaming, software, and monthly service. Cancel anything unused for 30+ days. The average household spends ₹3,000–5,000/month on forgotten subscriptions — that\'s ₹60,000/year.',
  },
  {
    icon: '📈', title: 'Rule of 72', color: '#7C3AED', bg: '#F5F3FF',
    subtitle: 'How fast does money double?',
    content: 'Divide 72 by your annual return rate to find how many years your money takes to double. At 8% (FD), money doubles in 9 years. At 12% (equity mutual funds), it doubles in just 6 years. Start early — time is your biggest asset.',
  },
]

const NRI_CHECKLIST = [
  { text: 'Track UAE expenses separately from India savings', done: true },
  { text: 'Set up automatic remittances on salary day', done: true },
  { text: 'Maintain 3 months UAE expenses as emergency buffer', done: false },
  { text: 'Review NRE/NRO allocation quarterly', done: false },
  { text: 'File ITR in India if Indian income > ₹2.5L', done: false },
  { text: 'Invest in ELSS / NPS for India tax savings', done: false },
]

const CATEGORY_GUIDE = [
  {
    cat: 'Food', icon: '🍔', color: '#D97706', bg: '#FFFBEB',
    desc: 'Everything you eat or drink — at home, on the go, or delivered.',
    items: ['Restaurants & Cafes','Swiggy, Zomato, Talabat, Deliveroo','Groceries & Supermarket food items',
            'Vegetables & Fruits 🥦🍅','Bakery, Juice bars, Coffee shops','Canteen / Tiffin (work meals)',
            'Home cooking supplies (oil, spices, rice)'],
    highlight: ['Vegetables & Fruits', 'Grocery shopping (food items)'],
  },
  {
    cat: 'Shopping', icon: '🛒', color: '#2563EB', bg: '#EFF6FF',
    desc: 'Non-food physical purchases — clothes, electronics, household goods.',
    items: ['Clothes, shoes, accessories','Amazon, Flipkart, Noon, Carrefour','Electronics & gadgets (Croma, Reliance Digital)',
            'Furniture & home décor','Toiletries & personal care products','Household supplies (detergent, kitchen tools)',
            'LULU Hypermarket (non-food items)', 'Spinneys, Waitrose'],
    highlight: [],
  },
  {
    cat: 'Utilities', icon: '🏠', color: '#7C3AED', bg: '#F5F3FF',
    desc: 'Fixed household costs — housing, services, and essential connections.',
    items: ['Home Rent / Housing 🏠','Electricity & DEWA bills','Water & gas supply',
            'Internet / Broadband / WiFi','Mobile postpaid & prepaid recharge',
            'Ironing & laundry services 👔','Maid / cleaning services',
            'Etisalat / du / Jio / Airtel bills','Cable TV / DTH subscription'],
    highlight: ['Home Rent', 'Ironing / Laundry services'],
  },
  {
    cat: 'Transport', icon: '🚗', color: '#16A34A', bg: '#F0FDF4',
    desc: 'Getting around — daily commute, rides, and vehicle costs.',
    items: ['Uber, Careem, Ola, Rapido','Metro, bus, auto, rickshaw',
            'Fuel / petrol (car/bike)','Parking fees','Salik (Dubai toll)','RTA bus pass'],
    highlight: [],
  },
  {
    cat: 'Health', icon: '❤️', color: '#059669', bg: '#ECFDF5',
    desc: 'Physical & mental wellbeing — medical and fitness.',
    items: ['Doctor visits & hospital bills','Pharmacy & medicines (Apollo, NetMeds, 1mg)',
            'Lab tests & diagnostics','Dental & optical care',
            'Gym membership & fitness classes','Salon, spa & personal grooming','Health insurance premium'],
    highlight: ['Salon / Beauty / Grooming'],
  },
  {
    cat: 'Entertainment', icon: '🎬', color: '#E11D48', bg: '#FFF1F2',
    desc: 'Fun, leisure and recreational spending.',
    items: ['Movie tickets (PVR, Inox, Cinepolis, VOX)','Concerts & live events',
            'Bowling, snooker, laser tag, karting','Gaming & arcade','Amusement parks'],
    highlight: [],
  },
  {
    cat: 'Travel', icon: '✈️', color: '#EA580C', bg: '#FFF7ED',
    desc: 'Trips, stays, and flights outside your daily routine.',
    items: ['Flight tickets (Air India, IndiGo, Emirates)','Hotel & resort bookings (Marriott, Airbnb, OYO)',
            'Holiday packages (MakeMyTrip, Cleartrip, Yatra)','Airport transfers & taxi','Holiday shopping & forex'],
    highlight: [],
  },
  {
    cat: 'Subscription', icon: '📱', color: '#EC4899', bg: '#FDF2F8',
    desc: 'Recurring digital & service subscriptions billed monthly or annually.',
    items: ['Netflix, Disney+, Hotstar, ZEE5, SonyLIV','Spotify, Apple Music, Gaana',
            'Amazon Prime, Apple TV+','YouTube Premium','Software (Adobe, Microsoft 365)',
            'Cloud storage (iCloud, Google One)', 'News & magazine apps'],
    highlight: [],
  },
  {
    cat: 'Transfer', icon: '💸', color: '#3B7DD8', bg: '#EFF6FF',
    desc: 'Money moved to another bank or country — not spent on goods/services.',
    items: ['UAE → India via LULU International Exchange','Al Ansari Exchange, Western Union, MoneyGram',
            'NRO to NRE inter-account transfer','NRE to NRO inter-account transfer',
            'SWIFT / wire transfer to Indian bank','NEFT / RTGS / IMPS payments'],
    highlight: ['Always set Type = Transfer (not Expense)'],
    note: 'Type must be: Transfer',
  },
  {
    cat: 'Family Transfer', icon: '👨‍👩‍👦', color: '#0EA5E9', bg: '#F0F9FF',
    desc: 'Monthly money sent to family members — allowance, support, gifts.',
    items: ['Monthly allowance to Father / Mother','Rent or bill payment for Wife / Spouse',
            'Support to children\'s education abroad','Gift money to siblings or relatives'],
    highlight: ['Set Type = Transfer for proper tracking'],
    note: 'Type must be: Transfer',
  },
  {
    cat: 'Credit Card Payment', icon: '💳', color: '#9333EA', bg: '#FAF5FF',
    desc: 'Paying off your credit card bill — not new spending.',
    items: ['ENBD CC bill payment','Credit Repayment Autopay','ADCB / FAB card bill',
            'HDFC / ICICI / Axis CC payment','Any card statement settlement'],
    highlight: ['Set Type = Expense (not Transfer)'],
    note: 'Type must be: Expense',
  },
  {
    cat: 'Loan on Card', icon: '🏦', color: '#F59E0B', bg: '#FFFBEB',
    desc: 'Loan installments tied to your credit line or card — LOC/DAC.',
    items: ['LOC AND DAC Transit (ENBD)','Line of Credit monthly debit',
            'Credit card EMI conversion payment','Buy-now-pay-later installments'],
    highlight: ['Set Type = Loan for proper tracking'],
    note: 'Type must be: Loan',
  },
  {
    cat: 'EMI/Loan', icon: '📋', color: '#F97316', bg: '#FFF7ED',
    desc: 'Regular loan installments for home, car, or personal loans.',
    items: ['Home loan EMI / mortgage','Car loan installment','Personal loan NACH debit',
            'Education loan EMI','Gold loan interest payment'],
    highlight: ['Set Type = Loan for proper tracking'],
    note: 'Type must be: Loan',
  },
]

const SAVINGS_TARGETS = [
  { label: 'Emergency Fund',     target: '6× expenses', icon: '🛡️', color: '#D97706' },
  { label: 'Annual Savings Rate', target: '≥ 20%',       icon: '📈', color: '#16A34A' },
  { label: 'Debt-to-Income',     target: '< 35%',        icon: '💳', color: '#E11D48' },
  { label: 'Retirement Corpus',  target: '25× expenses', icon: '🏖️', color: '#7C3AED' },
]

export default function BudgetLearnClient() {
  const [income,    setIncome]    = useState(100000)
  const [animated,  setAnimated]  = useState(false)
  const [search,    setSearch]    = useState('')
  const [expanded,  setExpanded]  = useState<string | null>(null)

  useEffect(() => {
    const t = setTimeout(() => setAnimated(true), 200)
    return () => clearTimeout(t)
  }, [])

  const filteredGuide = search.trim()
    ? CATEGORY_GUIDE.filter(g =>
        g.cat.toLowerCase().includes(search.toLowerCase()) ||
        g.items.some(it => it.toLowerCase().includes(search.toLowerCase())) ||
        g.highlight?.some(h => h.toLowerCase().includes(search.toLowerCase()))
      )
    : CATEGORY_GUIDE

  const needs   = Math.round(income * 0.50)
  const wants   = Math.round(income * 0.30)
  const savings = Math.round(income * 0.20)

  const RULE_BARS = [
    { label: '50% — Needs',   pct: 50, amount: needs,   color: '#16A34A', icon: '🏠', desc: 'Rent, food, transport, utilities, EMIs' },
    { label: '30% — Wants',   pct: 30, amount: wants,   color: '#2563EB', icon: '✈️', desc: 'Entertainment, dining, travel, shopping' },
    { label: '20% — Savings', pct: 20, amount: savings, color: '#7C3AED', icon: '💰', desc: 'Investments, SIP, emergency fund' },
  ]

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-8 animate-fade-up">

      {/* Back + Hero */}
      <div>
        <Link href="/dashboard/budgets"
          className="flex items-center gap-1.5 text-[12px] font-semibold mb-4 w-fit"
          style={{ color: 'var(--text3)' }}>
          <ArrowLeft size={14} /> Back to Budgets
        </Link>

        <div className="text-center py-10 rounded-2xl"
          style={{
            background: 'linear-gradient(135deg, #16A34A15 0%, #3B7DD820 60%, #7C3AED15 100%)',
            border: '1px solid var(--border)',
          }}>
          <div className="text-5xl mb-3" style={{ animation: animated ? 'none' : undefined }}>💰</div>
          <h1 className="text-[26px] font-black" style={{ color: 'var(--text)' }}>Budget Like a Pro</h1>
          <p className="text-[13px] mt-2 max-w-md mx-auto px-4" style={{ color: 'var(--text3)' }}>
            Learn the essentials of personal finance and NRI money management — interactive, visual, and actually useful.
          </p>
          <div className="flex justify-center gap-3 mt-4 flex-wrap">
            {['50/30/20 Rule', 'NRI Tips', 'Goal Targets', 'Subscriptions'].map(tag => (
              <span key={tag} className="px-3 py-1 rounded-full text-[11px] font-bold"
                style={{ background: 'var(--sage-bg)', color: 'var(--sage)', border: '1px solid var(--sage)' }}>
                {tag}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* ─── Category Reference Guide ─── */}
      <div>
        <div className="mb-4">
          <div className="text-[17px] font-black mb-1" style={{ color: 'var(--text)' }}>
            📂 Category Reference Guide
          </div>
          <div className="text-[12px]" style={{ color: 'var(--text3)' }}>
            Not sure where something belongs? Find any item below. Search by name or browse all categories.
          </div>
        </div>

        {/* Quick-find highlights */}
        <div className="flex flex-wrap gap-2 mb-4">
          {['Ironing','Home Rent','Vegetables','LOC AND DAC','NRO to NRE','CC Payment'].map(q => (
            <button key={q} onClick={() => setSearch(q)}
              className="px-3 py-1.5 rounded-full text-[11px] font-semibold border transition-all"
              style={{ background: search === q ? 'var(--sage)' : 'var(--bg2)', color: search === q ? '#fff' : 'var(--text3)', borderColor: search === q ? 'var(--sage)' : 'var(--border)' }}>
              {q}
            </button>
          ))}
          {search && <button onClick={() => setSearch('')} className="px-3 py-1.5 rounded-full text-[11px] font-semibold" style={{ color:'var(--rose)' }}>✕ Clear</button>}
        </div>

        <div className="relative mb-4">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color:'var(--text3)' }} />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search e.g. 'ironing', 'rent', 'grocery'…"
            className="wl-input pl-9 w-full"
            style={{ background:'var(--bg2)', border:'1px solid var(--border)' }} />
        </div>

        <div className="space-y-2">
          {filteredGuide.map(g => (
            <div key={g.cat} className="rounded-xl overflow-hidden border transition-all"
              style={{ borderColor: expanded === g.cat ? g.color : 'var(--border)', background: expanded === g.cat ? g.bg : '#fff' }}>
              <button className="w-full flex items-center justify-between px-4 py-3 text-left"
                onClick={() => setExpanded(expanded === g.cat ? null : g.cat)}>
                <div className="flex items-center gap-3">
                  <span className="text-xl">{g.icon}</span>
                  <div>
                    <div className="text-[13px] font-bold" style={{ color: g.color }}>{g.cat}</div>
                    <div className="text-[11px]" style={{ color:'var(--text3)' }}>{g.desc}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {g.note && (
                    <span className="text-[9px] px-2 py-0.5 rounded font-bold hidden sm:block"
                      style={{ background: g.color+'18', color: g.color }}>{g.note}</span>
                  )}
                  <span className="text-[18px] font-light" style={{ color:'var(--text3)' }}>
                    {expanded === g.cat ? '−' : '+'}
                  </span>
                </div>
              </button>

              {(expanded === g.cat || search.trim()) && (
                <div className="px-4 pb-4 pt-1">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    {g.items.map((item, ii) => {
                      const isHL = g.highlight?.some(h => item.toLowerCase().includes(h.toLowerCase()))
                      return (
                        <div key={ii} className="flex items-start gap-2 text-[11px] px-2 py-1.5 rounded-lg"
                          style={{ background: isHL ? g.color+'15' : 'transparent', border: isHL ? `1px solid ${g.color}30` : '1px solid transparent' }}>
                          <span style={{ color: isHL ? g.color : 'var(--text3)', marginTop: 1, flexShrink: 0 }}>
                            {isHL ? '★' : '•'}
                          </span>
                          <span style={{ color: isHL ? g.color : 'var(--text2, var(--text))', fontWeight: isHL ? 600 : 400 }}>
                            {item}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                  {g.highlight && g.highlight.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {g.highlight.map((h, hi) => (
                        <span key={hi} className="text-[10px] px-2 py-0.5 rounded-full font-semibold"
                          style={{ background: g.color+'20', color: g.color }}>★ {h}</span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
          {filteredGuide.length === 0 && (
            <div className="text-center py-10 text-[13px]" style={{ color:'var(--text3)' }}>
              No category found for &ldquo;{search}&rdquo;. Try a different keyword.
            </div>
          )}
        </div>

        {/* Quick summary table */}
        <div className="mt-4 wl-card overflow-hidden">
          <div className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider border-b"
            style={{ color:'var(--text3)', borderColor:'var(--border)', background:'var(--bg2)' }}>
            Quick Category Cheatsheet
          </div>
          <div className="divide-y" style={{ borderColor:'var(--border)' }}>
            {[
              { item:'Vegetables & Fruits',     cat:'Food',                type:'Expense',  color:'#D97706' },
              { item:'Grocery shopping',         cat:'Food',                type:'Expense',  color:'#D97706' },
              { item:'Home Rent',                cat:'Utilities',           type:'Expense',  color:'#7C3AED' },
              { item:'Ironing / Laundry',        cat:'Utilities',           type:'Expense',  color:'#7C3AED' },
              { item:'Maid / Cleaning service',  cat:'Utilities',           type:'Expense',  color:'#7C3AED' },
              { item:'Salon / Beauty',           cat:'Health',              type:'Expense',  color:'#059669' },
              { item:'LULU Exchange (UAE→India)','cat':'Transfer',          type:'Transfer', color:'#3B7DD8' },
              { item:'NRO to NRE transfer',      cat:'Transfer',            type:'Transfer', color:'#3B7DD8' },
              { item:'Money to Father / Wife',   cat:'Family Transfer',     type:'Transfer', color:'#0EA5E9' },
              { item:'ENBD CC Bill / Autopay',   cat:'Credit Card Payment', type:'Expense',  color:'#9333EA' },
              { item:'LOC AND DAC Transit',      cat:'Loan on Card',        type:'Loan',     color:'#F59E0B' },
              { item:'Car loan / Home EMI',      cat:'EMI/Loan',            type:'Loan',     color:'#F97316' },
            ].map((row, i) => (
              <div key={i} className="grid grid-cols-3 gap-2 px-4 py-2 text-[11px]"
                style={{ background: i % 2 === 0 ? '#fff' : '#FAFAFA' }}>
                <span style={{ color:'var(--text)' }}>{row.item}</span>
                <span className="font-semibold" style={{ color: row.color }}>{row.cat}</span>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold w-fit"
                  style={{ background: row.color+'15', color: row.color }}>{row.type}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 50/30/20 Interactive Calculator */}
      <div className="wl-card p-5" style={{ border: '2px solid #16A34A30' }}>
        <div className="flex items-center gap-3 mb-4">
          <span className="text-3xl">📊</span>
          <div>
            <div className="text-[15px] font-black" style={{ color: 'var(--text)' }}>50 / 30 / 20 Rule</div>
            <div className="text-[11px]" style={{ color: 'var(--text3)' }}>
              The universal budgeting formula — enter your monthly income to see your split
            </div>
          </div>
        </div>

        <div className="mb-5">
          <label className="block text-[10px] uppercase tracking-wider font-bold mb-1.5" style={{ color: 'var(--text3)' }}>
            Monthly Net Income (₹)
          </label>
          <input
            type="number" value={income || ''}
            onChange={e => setIncome(Number(e.target.value) || 0)}
            className="wl-input font-mono font-bold"
            style={{ background: 'var(--bg2)', maxWidth: 220, fontSize: 16 }}
            onFocus={e => (e.target.style.borderColor = 'var(--sage)')}
            onBlur={e => (e.target.style.borderColor = 'var(--border)')} />
        </div>

        <div className="space-y-4">
          {RULE_BARS.map((item, i) => (
            <div key={i}>
              <div className="flex justify-between items-start mb-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-lg">{item.icon}</span>
                  <div>
                    <div className="text-[12px] font-bold" style={{ color: item.color }}>{item.label}</div>
                    <div className="text-[10px]" style={{ color: 'var(--text3)' }}>{item.desc}</div>
                  </div>
                </div>
                <div className="text-[16px] font-black font-mono" style={{ color: item.color }}>
                  ₹{item.amount.toLocaleString('en-IN')}
                </div>
              </div>
              <div className="h-4 rounded-full overflow-hidden" style={{ background: item.color + '18' }}>
                <div className="h-full rounded-full transition-all duration-700 ease-out"
                  style={{ width: animated ? `${item.pct}%` : '0%', background: item.color }} />
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 p-3 rounded-xl text-[11px]"
          style={{ background: 'var(--bg2)', border: '1px solid var(--border)', color: 'var(--text3)' }}>
          💡 <strong>For NRIs:</strong> Your UAE "Needs" in AED should stay under 50% of UAE income. Remit the Savings portion (20%+) to India for long-term wealth building.
        </div>
      </div>

      {/* ─── Thane, Mumbai Sample Budget ─── */}
      <div className="wl-card overflow-hidden" style={{ border: '2px solid #D9770640' }}>
        <div className="px-5 py-4 flex items-center justify-between"
          style={{ background: 'linear-gradient(90deg,#FFFBEB 0%,#FEF9EC 100%)', borderBottom: '1px solid #D9770620' }}>
          <div>
            <div className="text-[15px] font-black flex items-center gap-2" style={{ color: '#92400E' }}>
              🏠 Sample Budget: Thane, Mumbai
            </div>
            <div className="text-[11px] mt-0.5" style={{ color: '#B45309' }}>
              Software professional · ₹1,00,000/month net salary · Single / couple
            </div>
          </div>
          <div className="text-right hidden sm:block">
            <div className="text-[11px]" style={{ color: '#92400E' }}>Split: 48 / 28 / 24</div>
            <div className="text-[9px]" style={{ color: '#B45309' }}>Needs / Wants / Savings</div>
          </div>
        </div>

        {/* Visual bar */}
        <div className="px-5 py-3 flex gap-0 overflow-hidden rounded-none" style={{ background: '#FFFBEB' }}>
          {[THANE_BUDGET.needs, THANE_BUDGET.wants, THANE_BUDGET.savings].map((seg, i) => (
            <div key={i}
              className="flex items-center justify-center text-[10px] font-black text-white transition-all"
              style={{
                width: `${seg.pct}%`,
                background: seg.color,
                height: 28,
                opacity: animated ? 1 : 0,
                transition: 'opacity 0.5s ease',
              }}>
              {seg.pct}%
            </div>
          ))}
        </div>

        {/* Three columns */}
        <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x"
          style={{ borderColor: 'var(--border)' }}>
          {[
            { ...THANE_BUDGET.needs,    title: '🏠 Needs',    label: '48% · ₹48,000' },
            { ...THANE_BUDGET.wants,    title: '✨ Wants',    label: '28% · ₹28,000' },
            { ...THANE_BUDGET.savings,  title: '💰 Savings',  label: '24% · ₹24,000' },
          ].map((col, ci) => (
            <div key={ci} className="p-4" style={{ background: col.bg }}>
              <div className="flex items-center justify-between mb-2.5">
                <span className="text-[12px] font-black" style={{ color: col.color }}>{col.title}</span>
                <span className="text-[11px] font-bold font-mono" style={{ color: col.color }}>{col.label}</span>
              </div>
              <div className="space-y-1.5">
                {col.items.map((item, ii) => (
                  <div key={ii} className="flex justify-between text-[10px]">
                    <span style={{ color: '#374151' }}>{item.label}</span>
                    <span className="font-mono font-semibold ml-2 whitespace-nowrap" style={{ color: col.color }}>
                      ₹{item.amt.toLocaleString('en-IN')}
                    </span>
                  </div>
                ))}
              </div>
              <div className="mt-3 pt-2 flex justify-between text-[10px] font-bold border-t"
                style={{ borderColor: col.color + '30' }}>
                <span style={{ color: col.color }}>Total</span>
                <span className="font-mono" style={{ color: col.color }}>₹{col.total.toLocaleString('en-IN')}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="px-5 py-3 text-[10px] leading-relaxed"
          style={{ background: '#FFFBEB', color: '#92400E', borderTop: '1px solid #D9770620' }}>
          💡 <strong>Thane tips:</strong> Rent in Thane West / Ghodbunder is ~60% cheaper than Bandra or Andheri.
          Use the central railway's BEST bus + Thane station for commute savings. Lonavala, Matheran, and Alibaug
          are under 2 hours for weekend getaways. Max out ₹1.5L under 80C (ELSS + PPF) to reduce taxable income.
        </div>
      </div>

      {/* Tip Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {TIPS.map((s, i) => (
          <div key={i} className="wl-card p-4" style={{ background: s.bg, border: `1px solid ${s.color}25` }}>
            <div className="text-2xl mb-2">{s.icon}</div>
            <div className="text-[13px] font-black mb-0.5" style={{ color: s.color }}>{s.title}</div>
            <div className="text-[10px] font-semibold uppercase tracking-wider mb-2"
              style={{ color: s.color + '80' }}>{s.subtitle}</div>
            <p className="text-[11px] leading-relaxed" style={{ color: '#374151' }}>{s.content}</p>
          </div>
        ))}
      </div>

      {/* NRI Checklist */}
      <div className="wl-card p-5" style={{ border: '1px solid #3B7DD830', background: '#EFF6FF' }}>
        <div className="flex items-center gap-3 mb-4">
          <span className="text-2xl">🌍</span>
          <div>
            <div className="text-[14px] font-black" style={{ color: '#1D4ED8' }}>NRI Financial Checklist</div>
            <div className="text-[11px]" style={{ color: '#3B7DD890' }}>UAE → India money management essentials</div>
          </div>
        </div>
        <div className="space-y-2.5">
          {NRI_CHECKLIST.map((tip, i) => (
            <div key={i} className="flex items-start gap-2.5">
              <div className="mt-0.5 flex-shrink-0">
                {tip.done
                  ? <CheckCircle size={15} style={{ color: '#16A34A' }} />
                  : <div className="w-3.5 h-3.5 rounded-full border-2 mt-0.5" style={{ borderColor: '#3B7DD8' }} />}
              </div>
              <span className="text-[12px]" style={{ color: '#1E40AF' }}>{tip.text}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Animated Savings Targets */}
      <div className="wl-card p-5">
        <div className="text-[14px] font-black mb-4 flex items-center gap-2" style={{ color: 'var(--text)' }}>
          <Star size={15} style={{ color: '#D97706' }} /> Standard Financial Targets
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {SAVINGS_TARGETS.map((g, i) => (
            <div key={i} className="flex flex-col items-center p-3 rounded-xl text-center transition-all hover:scale-105"
              style={{ background: g.color + '10', border: `1px solid ${g.color}30` }}>
              <div className="text-2xl mb-1.5">{g.icon}</div>
              <div className="text-[14px] font-black" style={{ color: g.color }}>{g.target}</div>
              <div className="text-[9px] mt-1 font-semibold uppercase tracking-wide" style={{ color: g.color + '90' }}>
                {g.label}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Why Budget section */}
      <div className="wl-card p-5">
        <div className="text-[14px] font-black mb-3" style={{ color: 'var(--text)' }}>
          📚 Why Budgeting Works
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { stat: '73%', desc: 'of people who budget feel more financially secure', color: '#16A34A' },
            { stat: '2.3×', desc: 'more wealth accumulated by people who track spending', color: '#2563EB' },
            { stat: '₹6L+', desc: 'average annual savings unlocked by subscription audits', color: '#EC4899' },
          ].map((s, i) => (
            <div key={i} className="text-center p-4 rounded-xl" style={{ background: s.color + '10' }}>
              <div className="text-[28px] font-black" style={{ color: s.color }}>{s.stat}</div>
              <div className="text-[11px] mt-1" style={{ color: 'var(--text3)' }}>{s.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* CTA */}
      <div className="text-center py-8 rounded-2xl"
        style={{ background: 'var(--sage-bg)', border: '1px solid var(--sage)' }}>
        <div className="text-3xl mb-3">🎯</div>
        <div className="text-[18px] font-black mb-2" style={{ color: 'var(--sage)' }}>Ready to set your budgets?</div>
        <p className="text-[12px] mb-5 max-w-sm mx-auto" style={{ color: 'var(--text3)' }}>
          Use WealthLens to set monthly caps per category and get instant alerts when you overspend.
        </p>
        <Link href="/dashboard/budgets"
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-white text-[13px] font-bold transition-all hover:opacity-90"
          style={{ background: 'var(--sage)' }}>
          <Target size={15} /> Set My Budgets Now
        </Link>
      </div>

    </div>
  )
}
