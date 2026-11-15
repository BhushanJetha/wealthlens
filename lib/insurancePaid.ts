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
  // Recorded insurance payments that name this policy (its insurer, name or number)
  const keys = [...words(p.provider), ...words(p.policy_name).slice(0, 2)]
  const num = String(p.policy_number ?? '').replace(/\s/g, '').toLowerCase()
  const mine = txns.filter(t => t.txn_type !== 'income' && (t.currency ?? 'INR') === (p.currency ?? 'INR')
    && /insur|premium|policy/i.test(`${t.category ?? ''} ${t.sub_category ?? ''} ${t.merchant ?? ''} ${t.description ?? ''}`)
    && (() => { const txt = `${t.merchant ?? ''} ${t.description ?? ''}`.toLowerCase(); return (num.length >= 5 && txt.replace(/\s/g, '').includes(num)) || keys.some(w => txt.includes(w)) })())
  const recorded = mine.reduce((s, t) => s + (Number(t.amount) || 0), 0)
  const scheduled = count * per
  return { per, count, scheduled, since: start && count ? start : null, recorded, recCount: mine.length, paid: Math.max(scheduled, recorded) }
}
