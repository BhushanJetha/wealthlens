// Loans: the EMI actually being paid, and a loan's journey from start to
// debt-free. Shared by Home, the Loans pages, loan detail, cash flow and
// debt-vs-equity so every screen shows the same EMI.

// Words a lender's EMI line might use for a given bank name
const BANK_ALIASES: [RegExp, string[]][] = [
  [/state bank of india|\bsbi\b/i, ['sbi', 'state bank']],
  [/emirates nbd|\benbd\b/i, ['enbd', 'emirates nbd', 'emirates']],
  [/abu dhabi commercial|\badcb\b/i, ['adcb']],
  [/first abu dhabi|\bfab\b/i, ['fab', 'first abu dhabi']],
  [/mashreq/i, ['mashreq']],
  [/hdfc/i, ['hdfc']], [/icici/i, ['icici']], [/axis/i, ['axis']], [/kotak/i, ['kotak']],
  [/bajaj/i, ['bajaj']], [/lic housing/i, ['lic hfl', 'lic housing']], [/punjab national|\bpnb\b/i, ['pnb']],
  [/bank of baroda|\bbob\b/i, ['bob', 'baroda']], [/canara/i, ['canara']], [/union bank/i, ['union bank']],
  [/idfc/i, ['idfc']], [/yes bank/i, ['yes bank']], [/indusind/i, ['indusind']], [/dubai islamic|\bdib\b/i, ['dib', 'dubai islamic']],
]
const TYPE_WORDS: Record<string, string[]> = {
  home_loan: ['home', 'housing', 'house', 'mortgage', 'hl '], car_loan: ['car', 'auto', 'vehicle'], bike_loan: ['bike', 'two wheeler', 'two-wheeler'],
  gold_loan: ['gold'], personal_loan: ['personal', ' pl '], loan_on_card: ['card', 'loc'], other_loan: [],
}
const GENERIC = new Set(['loan', 'loans', 'emi', 'bank', 'the', 'and', 'ltd', 'limited', 'of', 'home', 'car', 'personal', 'gold', 'bike'])

function bankWords(loan: any): string[] {
  const name = `${loan.bank_name ?? ''}`
  for (const [re, words] of BANK_ALIASES) if (re.test(name)) return words
  return name.toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length >= 3 && !GENERIC.has(w)).slice(0, 2)
}
function nameWords(loan: any): string[] {
  return `${loan.name ?? ''}`.toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length >= 3 && !GENERIC.has(w))
}
// How strongly a bank transaction looks like this loan's EMI (0 = not it)
function matchScore(loan: any, t: any): number {
  if ((t.currency || 'INR') !== (loan.currency || 'INR')) return 0
  const text = ` ${`${t.merchant ?? ''} ${t.description ?? ''}`.toLowerCase()} `
  const bank = bankWords(loan).some(w => text.includes(w)) || nameWords(loan).some(w => text.includes(w))
  if (!bank) return 0
  const type = (TYPE_WORDS[loan.loan_type || 'home_loan'] ?? []).some(w => text.includes(w))
  return 2 + (type ? 1 : 0)
}

export interface PaidEmi { amount: number; date: string; source: 'recorded' | 'statement' }

// The latest EMI paid per loan: recorded on the loan (loan_transactions kind
// 'emi') or found in imported bank statements (an EMI/loan payment naming the
// lender). A payment far from the saved EMI (a prepayment, a part EMI) is
// ignored so one odd payment doesn't become "the EMI".
export function lastPaidEmis(loans: any[], loanTxns: any[], bankTxns: any[]): Record<string, PaidEmi> {
  const out: Record<string, PaidEmi> = {}
  const plausible = (loan: any, amt: number) => {
    const saved = Number(loan.emi_amount) || 0
    return amt > 0 && (saved <= 0 || (amt >= saved * 0.5 && amt <= saved * 1.6))
  }
  const consider = (id: string, p: PaidEmi) => { if (!out[id] || p.date > out[id].date) out[id] = p }
  for (const t of loanTxns) {
    const loan = loans.find(l => l.id === t.loan_id)
    if (loan && t.kind === 'emi' && plausible(loan, Number(t.amount))) consider(loan.id, { amount: Number(t.amount), date: t.txn_date, source: 'recorded' })
  }
  for (const t of bankTxns) {
    // Give each payment to the loan it matches best; skip ties between loans
    const scored = loans.map(l => ({ l, s: matchScore(l, t) })).filter(x => x.s > 0).sort((a, b) => b.s - a.s)
    if (!scored.length || (scored[1] && scored[1].s === scored[0].s)) continue
    const loan = scored[0].l
    if (plausible(loan, Number(t.amount))) consider(loan.id, { amount: Number(t.amount), date: t.txn_date, source: 'statement' })
  }
  return out
}

// Loans with emi_amount set to the EMI actually being paid. The saved value is
// kept as emi_saved; emi_paid_on / emi_source say where the figure came from.
export function applyPaidEmis(loans: any[], paid: Record<string, PaidEmi>) {
  return loans.map(l => {
    const p = paid[l.id]
    return p ? { ...l, emi_saved: Number(l.emi_amount) || 0, emi_amount: p.amount, emi_paid_on: p.date, emi_source: p.source }
      : { ...l, emi_saved: Number(l.emi_amount) || 0, emi_paid_on: null, emi_source: 'saved' }
  })
}

// Server/client loader: fetch recent EMI records and statement payments, then
// apply them. Missing tables (migration 019 not run) just mean no records.
export async function withPaidEmi(supabase: any, userId: string, loans: any[]): Promise<any[]> {
  if (!loans?.length) return loans ?? []
  const since = new Date(Date.now() - 200 * 864e5).toISOString().slice(0, 10)
  const ids = loans.map(l => l.id)
  const [lt, byCat, byType] = await Promise.all([
    supabase.from('loan_transactions').select('loan_id,kind,txn_date,amount').in('loan_id', ids).eq('kind', 'emi').gte('txn_date', since),
    supabase.from('transactions').select('merchant,description,amount,currency,txn_date').eq('user_id', userId)
      .in('category', ['EMI/Loan', 'Loan on Card']).gte('txn_date', since).limit(500),
    supabase.from('transactions').select('merchant,description,amount,currency,txn_date').eq('user_id', userId)
      .eq('txn_type', 'loan').gte('txn_date', since).limit(500),
  ])
  const bank = [...(byCat.data ?? []), ...(byType.data ?? [])]
  return applyPaidEmis(loans, lastPaidEmis(loans, lt.data ?? [], bank))
}

// ── Journey: start → today → debt-free ──────────────────────────────────────
const ym = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
const addM = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth() + n, 1)

export interface JourneyPoint { m: string; past: number | null; ahead: number | null }
export interface Journey {
  start: { m: string; amount: number } | null
  today: { m: string; amount: number }
  end: { m: string; months: number } | null          // null = EMI doesn't cover the interest
  points: JourneyPoint[]
  repaidPct: number; timePct: number | null
  estimatedPast: boolean
}

// Balance from the start of the loan to today (estimated from the loan's terms
// and pinned to today's real outstanding) and on to zero at today's EMI.
export function loanJourney(loan: any, opts: { principal: number; emi: number; today?: Date }): Journey {
  const today = opts.today ?? new Date()
  const P = Math.max(0, opts.principal || 0), out = Math.max(0, Number(loan.outstanding_amt) || 0)
  const r = (Number(loan.interest_rate) || 0) / 1200, emi = Math.max(0, opts.emi || 0)
  const now = new Date(today.getFullYear(), today.getMonth(), 1)

  // When it started: the start date, else back-dated by EMIs paid
  let start: Date | null = null
  if (/^\d{4}-\d{2}/.test(loan.loan_start_date ?? '')) {
    const [y, m] = String(loan.loan_start_date).split('-').map(Number); start = new Date(y, m - 1, 1)
  } else if (Number(loan.months_paid) > 0) start = addM(now, -Number(loan.months_paid))
  const elapsed = start ? Math.max(0, (now.getFullYear() - start.getFullYear()) * 12 + now.getMonth() - start.getMonth()) : 0

  // Past: textbook amortisation from P, nudged so it lands exactly on today's balance
  const past: number[] = []
  if (start && P > 0 && elapsed > 0) {
    let b = P
    const est = [P]
    for (let i = 1; i <= elapsed; i++) { b = Math.max(0, b - Math.max(emi - b * r, 0)); est.push(b) }
    const gap = out - est[elapsed]
    for (let i = 0; i <= elapsed; i++) past.push(Math.max(0, est[i] + gap * (i / elapsed)))
  }

  // Ahead: today's balance paid down at today's EMI
  const ahead: number[] = [out]
  let b = out, clears = true
  while (b > 0.5 && ahead.length < 600) {
    const princ = emi - b * r
    if (princ <= 0) { clears = false; break }
    b = Math.max(0, b - princ); ahead.push(b)
  }
  const monthsLeft = clears ? ahead.length - 1 : null

  const points: JourneyPoint[] = []
  const first = past.length ? addM(now, -elapsed) : now
  past.forEach((v, i) => points.push({ m: ym(addM(first, i)), past: Math.round(v), ahead: i === past.length - 1 ? Math.round(v) : null }))
  ahead.forEach((v, i) => { if (i === 0 && past.length) return; points.push({ m: ym(addM(now, i)), past: i === 0 ? Math.round(v) : null, ahead: Math.round(v) }) })
  // Keep charts light: about 120 points
  const step = Math.max(1, Math.ceil(points.length / 120))
  const thin = points.filter((p, i) => i % step === 0 || i === points.length - 1 || p.m === ym(now))

  const base = P > 0 ? P : out
  return {
    start: start && P > 0 ? { m: ym(start), amount: P } : null,
    today: { m: ym(now), amount: out },
    end: monthsLeft != null ? { m: ym(addM(now, monthsLeft)), months: monthsLeft } : null,
    points: thin,
    repaidPct: base > 0 ? Math.max(0, Math.min(100, Math.round((base - out) / base * 100))) : 0,
    timePct: monthsLeft != null && elapsed + monthsLeft > 0 ? Math.round(elapsed / (elapsed + monthsLeft) * 100) : null,
    estimatedPast: past.length > 0,
  }
}

// Active loans with the paid EMI applied, in the { data, error } shape of a
// Supabase query so loaders can drop it into their Promise.all unchanged.
export async function activeLoansWithEmi(supabase: any, userId: string, narrow?: (q: any) => any): Promise<{ data: any[] | null; error: any }> {
  let q = supabase.from('home_loans').select('*').eq('user_id', userId).eq('is_active', true)
  if (narrow) q = narrow(q)
  const { data, error } = await q
  return { data: data ? await withPaidEmi(supabase, userId, data) : data, error }
}
