// Freedom Check — turns the user's own data + their questionnaire answers into
// a checklist, a stage on the 7-step financial-freedom ladder and an action
// plan. Pure functions (no React / Supabase) so the rules live in one place.

export type Cur = 'AED' | 'INR'
export type PerCur = { AED: number; INR: number }

// What the user told us (amounts are monthly, in `currency`).
export interface Answers {
  currency?: Cur
  age?: number
  retireAge?: number
  income?: number
  expenses?: number
  emi?: number
  savings?: number
  dependents?: number
  termCover?: number
  hasHealth?: boolean
  emergencyFund?: number
  retirementSavings?: number
  done?: Record<string, boolean>   // manual ticks, e.g. will & nominees
}

// Figures found in the user's data, kept per currency and converted with the
// live FX rate on the client.
export interface Detected {
  income: PerCur; expenses: PerCur; emi: PerCur
  liquid: PerCur; retirement: PerCur; investments: PerCur
  termCover: PerCur; hasHealth: boolean
  cardBalance: PerCur; costlyLoans: PerCur; loansOutstanding: PerCur
  goals: number
  monthsOfData: number
}

const zero = (): PerCur => ({ AED: 0, INR: 0 })
const num = (v: any) => Number(v) || 0
const curOf = (r: any): Cur => (r?.currency === 'AED' ? 'AED' : 'INR')
const add = (p: PerCur, r: any, v: number) => { p[curOf(r)] += v }
const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`

// Not day-to-day living cost: card bills settle spend counted elsewhere, EMIs
// are asked separately, investments are saving, money moved between own
// accounts / sent home is a transfer.
const NOT_LIVING = new Set([
  'Credit Card Payment', 'Loan on Card', 'EMI/Loan', 'Investment', 'Refund',
  'Transfer', 'International Transfer', 'NRE Received', 'NRE to NRO', 'NRE → NRO', 'NRO to NRE',
  'Self Transfer', 'Internal Transfer', 'ATM Withdrawal', 'Loan Received', 'Loan Taken',
])
// Money in that isn't earnings
const NOT_EARNED = new Set(['Loan Taken', 'Refund', 'NRE Received', 'NRI Transfer', 'FD/RD Maturity', 'UAE Income (NRO)'])

export function detect(d: {
  accounts: any[]; loans: any[]; insurance: any[]; nps: any[]; ppfEpf: any[]
  fds: any[]; rds: any[]; stocks: any[]; mfs: any[]; etf: any[]; gold: any[]; bonds: any[]
  txns: any[]; goals: any[]
}): Detected {
  const today = new Date().toISOString().slice(0, 10)
  const out: Detected = {
    income: zero(), expenses: zero(), emi: zero(), liquid: zero(), retirement: zero(), investments: zero(),
    termCover: zero(), hasHealth: false, cardBalance: zero(), costlyLoans: zero(), loansOutstanding: zero(),
    goals: d.goals.length, monthsOfData: 0,
  }

  // Monthly income / living expenses — average of the last 3 complete months
  // that have any spending recorded (so months before tracking began don't
  // drag the average down).
  const now = new Date()
  const recent: string[] = []
  for (let i = 1; i <= 6; i++) recent.push(monthKey(new Date(now.getFullYear(), now.getMonth() - i, 1)))
  const inc: Record<string, PerCur> = {}, exp: Record<string, PerCur> = {}
  d.txns.forEach(t => {
    const m = t.txn_date?.slice(0, 7); if (!recent.includes(m)) return
    const cat = t.category || ''
    if (t.txn_type === 'income' && !NOT_EARNED.has(cat)) add(inc[m] ??= zero(), t, num(t.amount))
    const living = (t.txn_type === 'expense' && !NOT_LIVING.has(cat))
      || cat === 'Family Transfer' || (cat === 'Transfer' && t.sub_category === 'Family')
    if (living) add(exp[m] ??= zero(), t, num(t.amount))
  })
  const used = recent.filter(m => exp[m]).slice(0, 3)
  out.monthsOfData = used.length
  if (used.length) {
    for (const c of ['AED', 'INR'] as Cur[]) {
      out.expenses[c] = used.reduce((a, m) => a + (exp[m]?.[c] ?? 0), 0) / used.length
      out.income[c]   = used.reduce((a, m) => a + (inc[m]?.[c] ?? 0), 0) / used.length
    }
  }

  d.loans.forEach(l => {
    add(out.emi, l, num(l.emi_amount))
    add(out.loansOutstanding, l, num(l.outstanding_amt))
    if (['personal_loan', 'loan_on_card'].includes(l.loan_type)) add(out.costlyLoans, l, num(l.outstanding_amt))
  })

  // Same valuation rules as Net Worth
  d.accounts.forEach(a => {
    if (a.account_type === 'credit_card') add(out.cardBalance, a, num(a.outstanding_bal))
    else add(out.liquid, a, num(a.current_balance) || num(a.outstanding_bal))
  })
  d.fds.forEach(f => { const v = num(f.principal ?? f.principal_amount); add(out.liquid, f, v); add(out.investments, f, v) })
  d.nps.forEach(n => { const v = num(n.corpus_amount) || num(n.invested_amount) || num(n.current_value); add(out.retirement, n, v); add(out.investments, n, v) })
  d.ppfEpf.forEach(x => { const v = num(x.current_balance); add(out.retirement, x, v); add(out.investments, x, v) })
  d.stocks.forEach(x => add(out.investments, x, num(x.quantity) * num(x.current_price ?? x.avg_buy_price)))
  d.mfs.forEach(m => add(out.investments, m, num(m.units) * num(m.current_nav ?? m.avg_nav)))
  d.etf.forEach(e => add(out.investments, e, num(e.units) * num(e.current_price ?? e.avg_buy_price)))
  d.rds.forEach(r => add(out.investments, r, r.current_amount != null ? num(r.current_amount) : num(r.monthly_amount) * num(r.months_paid)))
  d.gold.forEach(g => add(out.investments, g, g.current_price_per_gram && g.quantity_grams ? num(g.current_price_per_gram) * num(g.quantity_grams) : num(g.invested_amount)))
  d.bonds.forEach(b => add(out.investments, b, num(b.current_value ?? b.invested_amount)))

  d.insurance.forEach(p => {
    if (p.expiry_date && p.expiry_date < today) return
    if (p.policy_type === 'term_life') add(out.termCover, p, num(p.sum_assured))
    if (p.policy_type === 'health') out.hasHealth = true
  })
  return out
}

// ── Resolve answers over detected data ──────────────────────────────────────
export type Source = 'you' | 'data' | 'assumed'
export interface Resolved {
  cur: Cur
  age: number; retireAge: number
  income: number; expenses: number; emi: number; savings: number
  dependents: number; termCover: number; hasHealth: boolean
  emergencyFund: number; retirementSavings: number
  investments: number; cardBalance: number; costlyLoans: number; loansOutstanding: number
  goals: number
  src: Partial<Record<keyof Answers, Source>>
}

export const toCur = (p: PerCur, cur: Cur, fx: number) => cur === 'INR' ? p.INR + p.AED * fx : p.AED + p.INR / fx

export function resolve(a: Answers, det: Detected, cur: Cur, fx: number): Resolved {
  const src: Resolved['src'] = {}
  const pick = <K extends keyof Answers>(k: K, fromData: number | boolean | null, fallback: number | boolean) => {
    if (a[k] != null) { src[k] = 'you'; return a[k] as any }
    if (fromData != null && fromData !== 0 && fromData !== false) { src[k] = 'data'; return fromData }
    src[k] = 'assumed'; return fallback
  }
  const c = (p: PerCur) => toCur(p, cur, fx)
  const income   = pick('income', c(det.income), 0) as number
  const expenses = pick('expenses', c(det.expenses), 0) as number
  const emi      = pick('emi', c(det.emi), 0) as number
  // Savings default to what's left after expenses and EMIs
  src.savings = a.savings != null ? 'you' : 'data'
  const savings = a.savings ?? income - expenses - emi
  return {
    cur,
    age: pick('age', null, 30) as number,
    retireAge: pick('retireAge', null, 60) as number,
    income, expenses, emi, savings,
    dependents: pick('dependents', null, 0) as number,
    termCover: pick('termCover', c(det.termCover), 0) as number,
    hasHealth: pick('hasHealth', det.hasHealth, false) as boolean,
    emergencyFund: pick('emergencyFund', c(det.liquid), 0) as number,
    retirementSavings: pick('retirementSavings', c(det.retirement), 0) as number,
    investments: c(det.investments),
    cardBalance: c(det.cardBalance),
    costlyLoans: c(det.costlyLoans),
    loansOutstanding: c(det.loansOutstanding),
    goals: det.goals,
    src,
  }
}

// ── Formatting ──────────────────────────────────────────────────────────────
export function fmtMoney(n: number, cur: Cur): string {
  const v = Math.abs(n), s = n < 0 ? '-' : ''
  if (cur === 'INR') {
    if (v >= 1e7) return `${s}₹${(v / 1e7).toFixed(2)}Cr`
    if (v >= 1e5) return `${s}₹${(v / 1e5).toFixed(1)}L`
    return `${s}₹${Math.round(v).toLocaleString('en-IN')}`
  }
  if (v >= 1e6) return `${s}AED ${(v / 1e6).toFixed(2)}M`
  if (v >= 1e5) return `${s}AED ${(v / 1e3).toFixed(0)}K`
  return `${s}AED ${Math.round(v).toLocaleString('en-IN')}`
}
const pct = (x: number) => `${Math.round(x * 100)}%`

// ── Evaluate ────────────────────────────────────────────────────────────────
export type Status = 'done' | 'partial' | 'todo' | 'optional'
export interface CheckItem {
  id: string; stage: number; title: string; status: Status; detail: string
  src?: Source; manual?: boolean; link?: { href: string; label: string }
}
export interface PlanStep { id: string; title: string; action: string; link?: { href: string; label: string } }
export interface Stage { n: number; name: string; sub: string; items: string[]; met: boolean }

export const STAGE_DEFS = [
  { n: 1, name: 'Get Stable',         sub: 'Spend less than you earn',          items: ['positive'] },
  { n: 2, name: 'Safety Net',         sub: '1-month buffer, no costly loans',   items: ['starter', 'costly'] },
  { n: 3, name: 'Protect',            sub: 'Health + term insurance',           items: ['health', 'term'] },
  { n: 4, name: 'Emergency Fund',     sub: '6 months of expenses',              items: ['emergency'] },
  { n: 5, name: 'Debt Under Control', sub: 'EMIs ≤ 30% of income',              items: ['emi'] },
  { n: 6, name: 'Grow Wealth',        sub: 'Invest 20%, retirement on track',   items: ['saveRate', 'retirement', 'goals'] },
  { n: 7, name: 'Financial Freedom',  sub: 'Investments ≥ 25× yearly expenses', items: ['fi'] },
]

// Retirement savings guide by age, as a multiple of yearly income
// (≈1× by 30, 3× by 40, 6× by 50, 8× by 60).
function retireMultiple(age: number): number {
  const pts: [number, number][] = [[25, 0], [30, 1], [40, 3], [50, 6], [60, 8]]
  if (age <= 25) return 0
  if (age >= 60) return 8
  for (let i = 1; i < pts.length; i++) {
    const [a1, m1] = pts[i - 1], [a2, m2] = pts[i]
    if (age <= a2) return m1 + (m2 - m1) * (age - a1) / (a2 - a1)
  }
  return 8
}

export const ASSUMPTIONS = { inflation: 0.06, sipReturn: 0.10, existingReturn: 0.08, emergencyMonths: 6, termMultiple: 10, fiMultiple: 25 }

export function evaluate(r: Resolved, manual: Record<string, boolean> = {}) {
  const m = (n: number) => fmtMoney(n, r.cur)
  const A = ASSUMPTIONS
  const annualIncome = r.income * 12
  const monthlyNeed  = r.expenses + r.emi
  const savingsRate  = r.income > 0 ? r.savings / r.income : 0
  const emergencyMonths = monthlyNeed > 0 ? r.emergencyFund / monthlyNeed : (r.emergencyFund > 0 ? 99 : 0)
  const emiRatio     = r.income > 0 ? r.emi / r.income : (r.emi > 0 ? 1 : 0)
  const needsTerm    = r.dependents > 0 || r.loansOutstanding > 0
  const termTarget   = needsTerm ? annualIncome * A.termMultiple + r.loansOutstanding : 0
  const fiNumber     = r.expenses * 12 * A.fiMultiple
  const fiPct        = fiNumber > 0 ? r.investments / fiNumber : 0
  const multiple     = retireMultiple(r.age)
  const retireTarget = multiple * annualIncome
  const years        = Math.max(1, r.retireAge - r.age)
  const corpusNeeded = r.expenses * 12 * A.fiMultiple * Math.pow(1 + A.inflation, years)
  const gap          = Math.max(0, corpusNeeded - r.retirementSavings * Math.pow(1 + A.existingReturn, years))
  const mr = A.sipReturn / 12, n = years * 12
  const sipNeeded    = gap > 0 ? gap * mr / (Math.pow(1 + mr, n) - 1) : 0

  const items: CheckItem[] = [
    { id: 'positive', stage: 1, title: 'Spend less than you earn', src: r.src.savings,
      status: r.income > 0 && r.savings > 0 ? 'done' : 'todo',
      detail: r.income <= 0 ? 'Add your monthly income to start'
        : r.savings > 0 ? `Saving ${m(r.savings)}/mo · ${pct(savingsRate)} of income`
        : `Short by ${m(-r.savings)} every month` },
    { id: 'starter', stage: 2, title: 'Starter emergency fund (1 month)', src: r.src.emergencyFund,
      status: emergencyMonths >= 1 ? 'done' : r.emergencyFund > 0 ? 'partial' : 'todo',
      detail: `${m(r.emergencyFund)} set aside · 1 month = ${m(monthlyNeed)}` },
    { id: 'costly', stage: 2, title: 'No personal or card loans', link: { href: '/dashboard/loans', label: 'Loans' },
      status: r.costlyLoans >= 1 ? 'todo' : 'done',
      detail: r.costlyLoans >= 1 ? `${m(r.costlyLoans)} in personal / card loans`
        : r.cardBalance >= 1 ? `Card balance ${m(r.cardBalance)} — pay it in full by the due date` : 'None — well done' },
    { id: 'health', stage: 3, title: 'Health insurance', src: r.src.hasHealth, link: { href: '/dashboard/insurance', label: 'Insurance' },
      status: r.hasHealth ? 'done' : 'todo',
      detail: r.hasHealth ? 'You have health cover' : 'No health policy found' },
    { id: 'term', stage: 3, title: 'Term life insurance', src: r.src.termCover, link: { href: '/dashboard/insurance', label: 'Insurance' },
      status: !needsTerm ? 'optional' : r.termCover >= termTarget ? 'done' : r.termCover > 0 ? 'partial' : 'todo',
      detail: !needsTerm ? 'No dependents or loans yet — needed once someone relies on your income'
        : `Cover ${m(r.termCover)} of ${m(termTarget)} needed (${A.termMultiple}× yearly income${r.loansOutstanding >= 1 ? ' + loans' : ''})` },
    { id: 'emergency', stage: 4, title: `Emergency fund — ${A.emergencyMonths} months`, src: r.src.emergencyFund,
      status: emergencyMonths >= A.emergencyMonths ? 'done' : emergencyMonths >= 1 ? 'partial' : 'todo',
      detail: `${emergencyMonths >= 99 ? '—' : emergencyMonths.toFixed(1)} months covered · target ${m(monthlyNeed * A.emergencyMonths)}` },
    { id: 'emi', stage: 5, title: 'EMIs under 30% of income', src: r.src.emi, link: { href: '/dashboard/loans', label: 'Loans' },
      status: r.emi <= 0 || emiRatio <= 0.30 ? 'done' : emiRatio <= 0.45 ? 'partial' : 'todo',
      detail: r.emi <= 0 ? 'No EMIs 🎉' : `${m(r.emi)}/mo · ${pct(emiRatio)} of income` },
    { id: 'saveRate', stage: 6, title: 'Save & invest 20% of income', src: r.src.savings,
      status: savingsRate >= 0.2 ? 'done' : savingsRate >= 0.1 ? 'partial' : 'todo',
      detail: `${pct(Math.max(0, savingsRate))} now · 20% = ${m(r.income * 0.2)}/mo` },
    { id: 'retirement', stage: 6, title: 'Pension / retirement fund', src: r.src.retirementSavings, link: { href: '/dashboard/investments/nps', label: 'NPS' },
      status: r.retirementSavings > 0 && r.retirementSavings >= retireTarget ? 'done' : r.retirementSavings > 0 ? 'partial' : 'todo',
      detail: `${m(r.retirementSavings)} in NPS / PPF / EPF · guide at ${r.age}: ${multiple.toFixed(1)}× yearly income (${m(retireTarget)})` },
    { id: 'goals', stage: 6, title: 'Goals written down', link: { href: '/dashboard/goals', label: 'Goals' },
      status: r.goals > 0 ? 'done' : 'todo',
      detail: r.goals > 0 ? `${r.goals} active goal${r.goals > 1 ? 's' : ''}` : 'No goals yet' },
    { id: 'will', stage: 6, title: 'Will & nominees updated', manual: true,
      status: manual.will ? 'done' : 'todo',
      detail: manual.will ? 'Done' : 'Tick when your will is written and nominees are set' },
    { id: 'fi', stage: 7, title: 'Financial independence',
      status: fiPct >= 1 ? 'done' : fiPct > 0 ? 'partial' : 'todo',
      detail: fiNumber > 0 ? `${pct(fiPct)} of ${m(fiNumber)} (25× yearly expenses)` : 'Add your monthly expenses' },
  ]
  const byId = Object.fromEntries(items.map(i => [i.id, i]))
  const ok = (id: string) => ['done', 'optional'].includes(byId[id]?.status)

  const stages: Stage[] = STAGE_DEFS.map(s => ({ ...s, met: s.items.every(ok) }))
  const firstUnmet = stages.findIndex(s => !s.met)
  const current = firstUnmet === -1 ? stages.length + 1 : firstUnmet + 1   // 8 = all done

  const ACTIONS: Record<string, () => PlanStep> = {
    positive: () => ({ id: 'positive', title: 'Spend less than you earn',
      action: r.income <= 0 ? 'Tell us your monthly take-home pay so we can build your plan.'
        : `You spend about ${m(-r.savings)} more than you earn each month. Start with your biggest categories in the Expense Report and cut there first.`,
      link: { href: '/dashboard/expenses/report', label: 'Expense Report' } }),
    starter: () => ({ id: 'starter', title: 'Build a 1-month cushion',
      action: `Keep ${m(Math.max(0, monthlyNeed - r.emergencyFund))} more in your savings account so one surprise bill doesn't become debt.` }),
    costly: () => ({ id: 'costly', title: 'Clear costly loans',
      action: `Pay off ${m(r.costlyLoans)} of personal / card loans first — they cost 15–40% a year, more than any investment earns.`,
      link: { href: '/dashboard/loans', label: 'Loans' } }),
    health: () => ({ id: 'health', title: 'Get health insurance',
      action: r.cur === 'AED'
        ? 'In Dubai and Abu Dhabi employers must insure employees — check that your dependants are covered too, and add a policy for family in India.'
        : 'Buy a family floater health policy (₹10 lakh+ cover) and add a super top-up for large hospital bills.',
      link: { href: '/dashboard/insurance', label: 'Insurance' } }),
    term: () => ({ id: 'term', title: 'Get enough term cover',
      action: `Buy a pure term plan for about ${m(Math.max(0, termTarget - r.termCover))} more cover (${m(termTarget)} total = ${A.termMultiple}× yearly income${r.loansOutstanding >= 1 ? ' + loans' : ''}). Skip endowment / ULIP plans for protection.`,
      link: { href: '/dashboard/insurance', label: 'Insurance' } }),
    emergency: () => {
      const target = monthlyNeed * A.emergencyMonths, gap = Math.max(0, target - r.emergencyFund)
      const months = r.savings > 0 ? Math.ceil(gap / (r.savings / 2)) : null
      return { id: 'emergency', title: `Grow the emergency fund to ${A.emergencyMonths} months`,
        action: `Add ${m(gap)} to reach ${m(target)}.${months ? ` Putting half your monthly savings (${m(r.savings / 2)}) aside gets you there in about ${months} month${months > 1 ? 's' : ''}.` : ''} Keep it in savings, a sweep-in FD or a liquid fund.` }
    },
    emi: () => ({ id: 'emi', title: 'Bring EMIs under 30%',
      action: `EMIs take ${pct(emiRatio)} of your income. Prepay the highest-interest loan first and avoid new loans until you're under 30%.`,
      link: { href: '/dashboard/loans', label: 'Loans' } }),
    saveRate: () => ({ id: 'saveRate', title: 'Save 20% of income',
      action: `Raise savings by about ${m(Math.max(0, r.income * 0.2 - r.savings))} a month. Start a SIP on salary day so it happens before you can spend it.` }),
    retirement: () => ({ id: 'retirement', title: 'Build your pension',
      action: `To retire at ${r.retireAge} you need about ${m(corpusNeeded)} (25× yearly expenses, grown for inflation). A SIP of ~${m(sipNeeded)}/month at 10% gets you there.${r.cur === 'AED' ? ' UAE expats get gratuity, not a pension — NPS / PPF or a retirement SIP is your pension.' : ''}`,
      link: { href: '/dashboard/investments/nps', label: 'NPS' } }),
    goals: () => ({ id: 'goals', title: 'Write down your goals',
      action: 'Pick 2–3 goals (home, children, retirement) with an amount and a date, then link investments to each.',
      link: { href: '/dashboard/goals', label: 'Goals' } }),
    will: () => ({ id: 'will', title: 'Write a will, update nominees',
      action: 'A simple will plus nominees on every bank account, policy and investment saves your family months of paperwork.' }),
    fi: () => ({ id: 'fi', title: 'Reach your freedom number',
      action: `Your freedom number is ${m(fiNumber)} — 25× yearly expenses. You're ${pct(fiPct)} there; every SIP step-up brings the date closer.` }),
  }
  const plan = items.filter(i => i.status === 'todo' || i.status === 'partial')
    .sort((a, b) => a.stage - b.stage).map(i => ACTIONS[i.id]())

  return {
    items, stages, current, plan,
    metrics: { savingsRate, emergencyMonths, emiRatio, fiPct, fiNumber, termTarget, corpusNeeded, sipNeeded },
  }
}
