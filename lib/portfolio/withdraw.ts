// "I need money": where to take it from, cheapest first. Spare cash (keeping
// the emergency fund), deposits that mature in time, liquid and debt funds,
// then investments — losses first, then the ones that cost least in tax —
// breaking an FD last. Locked money (PPF, EPF, NPS, ELSS, LIC, property,
// gratuity) is never touched; goal money only if allowed. Every cost is an
// estimate and says what it assumes.
import { type PHolding, type Cur, type Cls } from './holdings'

export type When = 'now' | 'month' | 'quarter' | 'later'
export const WHEN: Record<When, { label: string; days: number }> = { now: { label: 'Now', days: 3 }, month: { label: 'Within a month', days: 30 }, quarter: { label: 'In 3 months', days: 90 }, later: { label: 'In 6+ months', days: 180 } }
export interface NeedInput { amount: number; currency: Cur; when: When; keepEmergency: boolean; protectGoals: boolean }
export interface Step { key: string; source: string; detail: string; amount: number; cost: number; costNote: string; speed: string; warn?: string }
export interface WithdrawPlan { steps: Step[]; covered: number; shortfall: number; cost: number; untouched: { label: string; value: number; why: string }[]; alternatives: string[] }

const LTCG_FREE = 125000           // ₹ of equity long-term gains tax-free each year (India)
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10)

export function planWithdrawal(hs: PHolding[], need: NeedInput, ctx: { fx: number; today: string; essentials: Record<Cur, number>; saving: Record<Cur, number>; goalName: (id: string) => string
    flagged?: string[]; overweight?: Cls[]; underweight?: Cls[] }): WithdrawPlan {
  const by = addDays(ctx.today, WHEN[need.when].days)
  const conv = (v: number, from: Cur) => (from === need.currency ? v : need.currency === 'INR' ? v * ctx.fx : v / ctx.fx)
  const money = (n: number, c: Cur = need.currency) => (c === 'AED' ? `AED ${Math.round(n).toLocaleString('en-US')}` : `₹${Math.round(n).toLocaleString('en-IN')}`)
  let left = need.amount, exemption = LTCG_FREE
  const steps: Step[] = []
  const take = (h: PHolding | null, s: Omit<Step, 'amount' | 'cost'> & { available: number; costRate?: (amt: number) => number }) => {
    if (left <= 0.5 || s.available <= 0.5) return
    const amt = Math.min(left, s.available)
    const cost = s.costRate ? s.costRate(amt) : 0
    left -= amt
    const goals = h?.goalIds.map(ctx.goalName).filter(Boolean) ?? []
    steps.push({ key: s.key, source: s.source, detail: s.detail, speed: s.speed, costNote: s.costNote, amount: amt, cost, warn: goals.length ? `Linked to ${goals.join(', ')} — that goal falls back by this much.` : s.warn })
  }
  const usable = (h: PHolding) => !(need.protectGoals && h.goalIds.length)
  const gainShare = (h: PHolding) => (h.value > 0 ? Math.max(0, (h.value - h.cost) / h.value) : 0)

  // 1. Spare cash, same currency first
  const spare = (c: Cur) => Math.max(0, hs.filter(h => h.type === 'bank' && h.currency === c).reduce((s, h) => s + h.value, 0) - (need.keepEmergency ? ctx.essentials[c] * 6 : 0))
  take(null, { key: 'cash', source: 'Spare money in your bank', detail: need.keepEmergency ? `Above your 6-month emergency cushion (${money(ctx.essentials[need.currency] * 6)})` : 'Your bank balance', available: spare(need.currency), costNote: 'No cost', speed: 'Today' })

  // 2. Deposits and bonds that mature in time — just wait for them
  for (const h of hs.filter(h => ['fd', 'rd', 'bond'].includes(h.type) && h.currency === need.currency && h.unlock && h.unlock <= by && h.unlock >= ctx.today && usable(h)).sort((a, b) => a.unlock!.localeCompare(b.unlock!)))
    take(h, { key: h.key, source: h.name, detail: `Matures ${h.unlock}`, available: Number(h.raw?.maturity_amt) || h.value, costNote: 'No cost — it matures in time', speed: `On ${h.unlock}` })

  // Gold you wear or keep at home isn't sold to raise money
  const physical = (h: PHolding) => h.type === 'gold' && /physical|jewel|coin|bar/i.test(`${h.raw?.gold_type ?? ''} ${h.name}`)
  const sellable = hs.filter(h => h.currency === need.currency && usable(h) && h.access !== 'locked' && !physical(h) && ['mf', 'etf', 'stock', 'gold', 'other'].includes(h.type) && !(h.type === 'other' && !['us_stocks', 'uae_broker', 'esop', 'crypto'].includes(h.raw?.kind)))
  const debtTax = (h: PHolding) => (amt: number) => (h.currency === 'INR' ? amt * gainShare(h) * 0.3 : 0)
  // 3. Liquid, then debt funds
  for (const h of sellable.filter(h => h.mix.cash >= 0.9)) take(h, { key: h.key, source: h.name, detail: 'Liquid fund', available: h.value, costRate: debtTax(h), costNote: h.currency === 'INR' ? 'Gains taxed at your slab (30% TDS for NRIs)' : 'No tax in the UAE', speed: '1 working day' })
  for (const h of sellable.filter(h => h.mix.debt >= 0.9)) take(h, { key: h.key, source: h.name, detail: 'Debt fund / ETF', available: h.value, costRate: debtTax(h), costNote: h.currency === 'INR' ? 'Gains taxed at your slab (30% TDS for NRIs)' : 'No tax in the UAE', speed: '1–2 working days' })
  // 4. Equity and gold. A portfolio manager sells what it would sell anyway:
  // holdings flagged to switch or trim, then whatever is over your target mix,
  // then the cheapest in tax (losses, then the smallest gains). A class that's
  // under target is sold last — after breaking an FD, if fixed income is over
  // target. Sovereign gold bonds go last of all (interest, tax-free at maturity).
  const flagged = new Set(ctx.flagged ?? []), over = new Set(ctx.overweight ?? []), under = new Set(ctx.underweight ?? [])
  const main = (h: PHolding): Cls => (Object.entries(h.mix) as [Cls, number][]).sort((a, b) => b[1] - a[1])[0][0]
  const sgb = (h: PHolding) => /sgb|sovereign/i.test(`${h.sub} ${h.name}`)
  const tier = (h: PHolding) => (sgb(h) ? 4 : flagged.has(h.key) ? 0 : over.has(main(h)) ? 1 : under.has(main(h)) ? 3 : 2)
  const growth = sellable.filter(h => h.mix.cash < 0.9 && h.mix.debt < 0.9).sort((a, b) => tier(a) - tier(b) || gainShare(a) - gainShare(b))
  const breakFds = () => {
    for (const h of hs.filter(h => ['fd', 'rd'].includes(h.type) && h.currency === need.currency && (!h.unlock || h.unlock > by) && usable(h)).sort((a, b) => a.value - b.value)) {
      const yrs = h.raw?.start_date ? Math.max(0, (Date.parse(ctx.today) - Date.parse(h.raw.start_date)) / (365.25 * 864e5)) : 1
      take(h, { key: h.key, source: `Break ${h.name}`, detail: over.has('debt') ? 'Fixed income is over your target — cheaper than selling what’s under it' : h.unlock ? `Due ${h.unlock}` : 'Fixed deposit', available: h.value, costRate: amt => amt * 0.01 * Math.max(yrs, 0.25), costNote: 'About 1% less interest for the time it was held (bank penalty, estimated)', speed: '1–2 days' })
    }
  }
  let fdsDone = false
  for (const h of growth) {
    if (!fdsDone && over.has('debt') && tier(h) >= 3) { breakFds(); fdsDone = true }
    const loss = h.value < h.cost, india = h.currency === 'INR', exit = h.type === 'mf' && h.mix.equity > 0 ? ' (and a 1% exit load if bought under a year ago)' : ''
    const cls = main(h) === 'debt' ? 'Fixed income' : main(h)[0].toUpperCase() + main(h).slice(1)
    const why = flagged.has(h.key) ? 'Already flagged to switch or trim' : over.has(main(h)) ? `${cls} is over your target` : under.has(main(h)) ? `${cls} is under your target — sold late` : loss ? `At a loss of ${money(conv(h.cost - h.value, h.currency))} — selling locks the loss in` : h.sub
    take(h, { key: h.key, source: h.name, detail: why, available: h.value,
      costRate: amt => { if (!india || loss) return 0; const gain = amt * gainShare(h), free = Math.min(exemption, gain); exemption -= free; return (gain - free) * 0.125 },
      costNote: !india ? 'No capital-gains tax in the UAE (if you’re tax-resident here)' : loss ? 'No tax — and the loss can offset other gains' : `12.5% on gains above ₹1.25 lakh a year, if held over a year${exit}`,
      speed: h.type === 'stock' || h.type === 'etf' ? 'Next working day' : '2–3 working days' })
  }
  // 5. Break deposits that don't mature in time (if not already)
  if (!fdsDone) breakFds()
  // 6. The other currency: spare cash, then liquid funds
  const other: Cur = need.currency === 'INR' ? 'AED' : 'INR'
  const remitNote = need.currency === 'INR' ? 'Send from the UAE — about 0.5% in exchange-rate spread (estimate)' : 'Bring back from India: NRE money freely; NRO needs forms 15CA/CB (up to $1M a year)'
  take(null, { key: 'cash-other', source: `Spare money in your ${other === 'AED' ? 'UAE' : 'Indian'} bank`, detail: `${money(spare(other), other)} spare`, available: conv(spare(other), other), costRate: amt => amt * 0.005, costNote: remitNote, speed: '1–2 days' })
  for (const h of hs.filter(h => h.currency === other && h.mix.cash >= 0.9 && h.type === 'mf' && usable(h)))
    take(h, { key: h.key, source: h.name, detail: 'Liquid fund', available: conv(h.value, other), costRate: amt => amt * 0.005, costNote: remitNote, speed: '2–3 days' })

  // Never touched
  const untouched = [
    { label: 'PPF, EPF and NPS', types: ['ppf', 'nps'], why: 'Locked, and tax-free or tax-saving — the hardest money to replace' },
    { label: 'ELSS funds', test: (h: PHolding) => h.type === 'mf' && h.access === 'locked', why: 'Locked 3 years from each purchase' },
    { label: 'LIC policies', types: ['lic'], why: 'Surrendering early returns less than you paid in' },
    { label: 'Property, vehicles and gratuity', test: (h: PHolding) => h.type === 'gratuity' || (h.type === 'other' && !h.investable && h.raw?.kind !== 'jewellery'), why: 'Takes months to sell, or isn’t yours to take yet' },
    { label: 'Goal money', test: (h: PHolding) => need.protectGoals && h.goalIds.length > 0, why: 'Kept for your goals (switch “protect goals” off to use it)' },
  ].map(u => ({ label: u.label, why: u.why, value: hs.filter(h => (u.types ? u.types.includes(h.type) : u.test!(h))).reduce((s, h) => s + conv(h.value, h.currency), 0) })).filter(u => u.value > 0)

  const covered = need.amount - Math.max(0, left)
  const alternatives: string[] = []
  const save = ctx.saving[need.currency]
  if (need.when !== 'now' && save > 0) {
    const months = Math.ceil(need.amount / save)
    alternatives.push(`Save it instead: you put aside about ${money(save)} a month, so ${money(need.amount)} takes about ${months} month${months === 1 ? '' : 's'} — nothing sold, no tax.`)
  }
  if (hs.some(h => h.type === 'fd' && h.currency === need.currency)) alternatives.push('A loan against your FD usually costs only 1–2% more than the FD earns — often cheaper than breaking it, and the FD keeps running.')
  if (hs.some(h => ['mf', 'stock'].includes(h.type) && h.currency === 'INR') && need.currency === 'INR') alternatives.push('A loan against mutual funds or shares lets you borrow without selling, at lower rates than a personal loan.')
  return { steps, covered, shortfall: Math.max(0, left), cost: steps.reduce((s, x) => s + x.cost, 0), untouched, alternatives }
}
