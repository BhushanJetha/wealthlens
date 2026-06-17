// Loan amortization helper — splits payments into principal vs interest and
// builds a month-by-month schedule. Uses the actual outstanding balance to
// reconcile principal/interest paid so far (so prepayments are reflected).

export interface AmortRow {
  n: number
  date: string        // YYYY-MM
  emi: number
  principal: number
  interest: number
  balance: number
}

export interface AmortResult {
  principal: number       // original principal used (disbursed/sanctioned)
  emi: number
  principalPaid: number
  interestPaid: number
  remaining: number
  totalInterest: number   // interest over the full (remaining) life from today
  emisPaid: number
  emisTotal: number
  balanceTenor: number    // months remaining
  schedule: AmortRow[]    // forward schedule from the current outstanding
}

function emiFor(p: number, rMonthly: number, n: number): number {
  if (n <= 0) return 0
  if (rMonthly <= 0) return p / n
  const f = Math.pow(1 + rMonthly, n)
  return (p * rMonthly * f) / (f - 1)
}

export function amortize(opts: {
  principal: number
  annualRate: number
  tenureMonths: number
  emi?: number
  monthsPaid?: number
  outstanding?: number
  startDate?: string        // YYYY-MM-DD — to date the forward schedule
}): AmortResult {
  const P = Math.max(0, Number(opts.principal) || 0)
  const N = Math.max(0, Math.round(Number(opts.tenureMonths) || 0))
  const r = (Number(opts.annualRate) || 0) / 1200
  const emisPaid = Math.max(0, Math.round(Number(opts.monthsPaid) || 0))
  let emi = Number(opts.emi) || 0
  if (emi <= 0 && P > 0 && N > 0) emi = emiFor(P, r, N)

  const outstanding = opts.outstanding != null && Number(opts.outstanding) > 0
    ? Number(opts.outstanding)
    : null

  // Paid-so-far split: prefer the real outstanding balance.
  let principalPaid: number, interestPaid: number, remaining: number
  if (outstanding != null && P > 0) {
    principalPaid = Math.max(0, P - outstanding)
    interestPaid  = Math.max(0, emi * emisPaid - principalPaid)
    remaining     = outstanding
  } else {
    // Simulate the first emisPaid months from P
    let bal = P, pp = 0, ip = 0
    for (let i = 0; i < emisPaid && bal > 0; i++) {
      const interest = bal * r
      const princ = Math.min(Math.max(emi - interest, 0), bal)
      pp += princ; ip += interest; bal -= princ
    }
    principalPaid = pp; interestPaid = ip; remaining = bal
  }

  const balanceTenor = Math.max(0, N - emisPaid)

  // Forward schedule from the current remaining balance
  const schedule: AmortRow[] = []
  let bal = remaining
  let totalInterest = 0
  const start = opts.startDate ? new Date(opts.startDate) : new Date()
  const base = new Date(start.getFullYear(), start.getMonth() + emisPaid, 1)
  for (let i = 0; i < balanceTenor && bal > 0.5 && i < 600; i++) {
    const interest = bal * r
    let princ = emi - interest
    if (princ <= 0) princ = bal * 0.01            // safety for under-water EMIs
    princ = Math.min(princ, bal)
    bal -= princ
    totalInterest += interest
    const d = new Date(base.getFullYear(), base.getMonth() + i, 1)
    schedule.push({
      n: emisPaid + i + 1,
      date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      emi: Math.round(princ + interest),
      principal: Math.round(princ),
      interest: Math.round(interest),
      balance: Math.round(Math.max(0, bal)),
    })
  }

  return {
    principal: P,
    emi: Math.round(emi),
    principalPaid: Math.round(principalPaid),
    interestPaid: Math.round(interestPaid),
    remaining: Math.round(remaining),
    totalInterest: Math.round(totalInterest),
    emisPaid,
    emisTotal: N,
    balanceTenor,
    schedule,
  }
}
