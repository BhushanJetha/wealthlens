// How much you've paid on an insurance policy so far, two ways:
//  • by its schedule: each premium due from the start date up to today (and
//    not past expiry), at today's premium (annual ÷ instalments a year);
//  • from your entries: payments recorded as insurance that name the insurer,
//    the policy or its number.
// The schedule is complete if the start date is the policy's first day (a
// health policy's start date is often just this year's renewal); the entries
// are exact but only cover what you've recorded.
const PER_YEAR: Record<string, number> = { monthly: 12, quarterly: 4, semi_annual: 2, annual: 1 }
const addMonths = (d: string, n: number) => {
  const [y, m, day] = d.slice(0, 10).split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1 + n, 1)), last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate()
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(Math.min(day, last)).padStart(2, '0')}`
}
const words = (s: any) => String(s ?? '').toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length >= 4 && !['insurance', 'general', 'life', 'health', 'company', 'limited', 'policy', 'plan'].includes(w))

// Recorded insurance payments that name this policy (its insurer, name or number)
export function policyPayments(p: any, txns: any[]): any[] {
  const keys = [...words(p.provider), ...words(p.policy_name).slice(0, 2)]
  const num = String(p.policy_number ?? '').replace(/\s/g, '').toLowerCase()
  return txns.filter(t => t.txn_type !== 'income' && (t.currency ?? 'INR') === (p.currency ?? 'INR')
    && /insur|premium|policy/i.test(`${t.category ?? ''} ${t.sub_category ?? ''} ${t.merchant ?? ''} ${t.description ?? ''}`)
    && (() => { const txt = `${t.merchant ?? ''} ${t.description ?? ''}`.toLowerCase(); return (num.length >= 5 && txt.replace(/\s/g, '').includes(num)) || keys.some(w => txt.includes(w)) })())
}

export interface PremiumsPaid {
  per: number                 // one instalment
  count: number; scheduled: number; since: string | null     // by the schedule
  recorded: number; recCount: number                          // found in your entries
  paid: number                // what's shown: the larger of the two (entries can't be less than what really left)
}
export function premiumsPaid(p: any, today: string, txns: any[] = []): PremiumsPaid {
  const n = PER_YEAR[p.premium_frequency] ?? 1, step = 12 / n
  const per = (Number(p.annual_premium) || 0) / n
  const start = p.start_date ? String(p.start_date).slice(0, 10) : null
  const end = p.expiry_date ? String(p.expiry_date).slice(0, 10) : null
  let count = 0
  if (start && per > 0) for (let d = start, k = 0; d <= today && (!end || d < end) && k < 1200; k++, d = addMonths(start, step * k)) {
    if (k > 0 || d === start) count = k + 1
  }
  const mine = policyPayments(p, txns)
  const recorded = mine.reduce((s, t) => s + (Number(t.amount) || 0), 0)
  const scheduled = count * per
  return { per, count, scheduled, since: start && count ? start : null, recorded, recCount: mine.length, paid: Math.max(scheduled, recorded) }
}

// ── Each premium, from the start date ───────────────────────────────────────
// Every premium due from the start date to today (plus the next one), each
// matched to a payment in your entries when one is near it (within 20 days,
// amount within 30% — premiums change): 'recorded' shows what you actually
// paid, 'schedule' is the premium as it stands today, 'next' is still to come.
export interface PremiumRow { date: string; amount: number; kind: 'recorded' | 'schedule' | 'next'; txn?: any }
export interface PremiumYear { year: string; rows: PremiumRow[]; paid: number; count: number }
const dayNum = (d: string) => Math.floor(Date.parse(`${d.slice(0, 10)}T00:00:00Z`) / 864e5)
export function premiumSchedule(p: any, today: string, txns: any[] = []): PremiumYear[] {
  const n = PER_YEAR[p.premium_frequency] ?? 1, step = 12 / n, per = (Number(p.annual_premium) || 0) / n
  const start = p.start_date ? String(p.start_date).slice(0, 10) : null
  const end = p.expiry_date ? String(p.expiry_date).slice(0, 10) : null
  if (!start || !(per > 0)) return []
  const pays = policyPayments(p, txns).sort((a, b) => String(a.txn_date).localeCompare(String(b.txn_date)))
  const used = new Set<any>()
  const rows: PremiumRow[] = []
  for (let k = 0; k < 1200; k++) {
    const d = addMonths(start, step * k)
    if (end && d >= end) break
    if (d > today) { rows.push({ date: d, amount: per, kind: 'next' }); break }
    let hit: any = null, gap = Infinity
    for (const t of pays) {
      if (used.has(t)) continue
      const g = Math.abs(dayNum(String(t.txn_date)) - dayNum(d)), amt = Number(t.amount) || 0
      if (g <= 20 && Math.abs(amt - per) <= per * 0.3 && g < gap) { hit = t; gap = g }
    }
    if (hit) { used.add(hit); rows.push({ date: String(hit.txn_date).slice(0, 10), amount: Number(hit.amount) || 0, kind: 'recorded', txn: hit }) }
    else rows.push({ date: d, amount: per, kind: 'schedule' })
  }
  const years = new Map<string, PremiumRow[]>()
  for (const r of rows) { const y = r.date.slice(0, 4); if (!years.has(y)) years.set(y, []); years.get(y)!.push(r) }
  return Array.from(years.entries()).map(([year, rs]) => {
    const done = rs.filter(r => r.kind !== 'next')
    return { year, rows: rs, paid: done.reduce((s, r) => s + r.amount, 0), count: done.length }
  }).sort((a, b) => b.year.localeCompare(a.year))
}
