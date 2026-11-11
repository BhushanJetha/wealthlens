// Every payment into an investment, one row each, and every sale out of one.
// Investments › Invested lists them; lib/investFlows adds them up by month for
// the Growth tab, the overview chart and the Income Rule, so a month's total
// is the same on every screen.
//
// Sources, best first:
//   Mutual funds / stocks: dated purchases and SIPs (investment_transactions,
//     from CAS imports, Buy actions and linked payments). Any cost not covered
//     by those sits on the month the holding was added.
//   ETF, gold, bonds, FDs: the amount put in, on the purchase / start date.
//   RDs: each instalment taken so far.
//   LIC: each premium on its schedule since the start date.
//   PPF / EPF: the yearly contribution spread over the months since opening.
//   NPS: the amount put in spread evenly since the start date.
// The last four follow a schedule, not records (`scheduled`).
import { holdingCost, rdInstalments } from './netWorth'
import { sipsOf, sipInstalments } from './sips'
import { holdingName, type HType } from './holding'

export const FLOW_KEYS = ['mf', 'stocks', 'etf', 'fd', 'rd', 'gold', 'bonds', 'nps', 'ppf', 'lic'] as const
export type FlowKey = (typeof FLOW_KEYS)[number]

export interface FlowInput {
  stocks: any[]; mutualFunds: any[]; etf: any[]; fixedDeposits: any[]; recurringDeposits: any[]
  nps: any[]; lic: any[]; ppfEpf: any[]; gold: any[]; bonds: any[]
  invTxns: { id?: string; asset_type: string; asset_id: string | null; txn_date: string; txn_type: string; amount: number; units?: number | null; nav?: number | null; estimated?: boolean; cost_amount?: number | null }[]
}

export type EntryHow = 'SIP' | 'Lump sum' | 'Bought' | 'Switched in' | 'Instalment' | 'Opened' | 'Premium' | 'Contribution' | 'Added' | 'Sold' | 'Redeemed' | 'Switched out'
export interface InvEntry {
  id: string                 // unique on the screen
  key: FlowKey; type: HType; holding: any; name: string
  date: string               // YYYY-MM-DD
  month: string              // YYYY-MM
  amount: number             // in the screen's currency (`conv`)
  own: number; currency: string   // in the holding's own currency
  how: EntryHow
  txn?: any                  // the investment_transactions row it is (can be edited)
  units?: number | null; price?: number | null
  estimated?: boolean        // a SIP's units at the SIP day's NAV, not yet confirmed (lib/allotment)
  scheduled?: boolean        // from the holding's schedule, not a dated record
  note?: string
}

export const INFLOW = new Set(['purchase', 'sip', 'switch_in'])
export const OUTFLOW = new Set(['redemption', 'switch_out'])
const PER_YEAR: Record<string, number> = { monthly: 12, quarterly: 4, 'half-yearly': 2, 'half yearly': 2, halfyearly: 2, annually: 1, yearly: 1, annual: 1 }

const ym = (d: string | null | undefined) => (d && /^\d{4}-\d{2}/.test(d) ? d.slice(0, 7) : null)
const day = (d: string | null | undefined) => (d && /^\d{4}-\d{2}-\d{2}/.test(d) ? d.slice(0, 10) : null)
export function addMonth(m: string, n: number) {
  const [y, mo] = m.split('-').map(Number)
  const t = y * 12 + (mo - 1) + n
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`
}
export const monthsBetween = (a: string, b: string) => {
  const [y1, m1] = a.split('-').map(Number), [y2, m2] = b.split('-').map(Number)
  return (y2 - y1) * 12 + (m2 - m1)
}
// The same day of the month in another month (the 31st becomes the month's last day)
const onDay = (month: string, d: number) => {
  const [y, m] = month.split('-').map(Number), last = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return `${month}-${String(Math.min(Math.max(1, d), last)).padStart(2, '0')}`
}
const nowMonth = (today: Date) => `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`

// Money put in, one row per payment, up to this month
export function investmentEntries(h: FlowInput, conv: (amt: number, cur: string) => number, today = new Date()): InvEntry[] {
  const now = nowMonth(today)
  const out: InvEntry[] = []
  const add = (e: Omit<InvEntry, 'month' | 'amount' | 'own' | 'currency' | 'name'> & { own: number; currency?: string }) => {
    const month = ym(e.date)
    if (!month || !(e.own > 0) || month > now) return
    const currency = e.currency || e.holding.currency || 'INR'
    out.push({ ...e, month, currency, amount: conv(e.own, currency), name: holdingName(e.type, e.holding) })
  }

  // Funds and stocks: dated records first, the rest on the month it was added
  const byAsset = new Map<string, FlowInput['invTxns']>()
  for (const t of h.invTxns ?? []) {
    if (!t.asset_id || !INFLOW.has(t.txn_type)) continue
    const list = byAsset.get(t.asset_id) ?? []
    list.push(t); byAsset.set(t.asset_id, list)
  }
  const recorded = (rows: any[], key: FlowKey, type: HType, cost: (x: any) => number) => rows.forEach(x => {
    const txns = byAsset.get(x.id) ?? []
    // A purchase that repeats like a SIP is a SIP instalment (as on the fund's page)
    const isSip = type === 'mutual_funds'
      ? sipInstalments(txns.map(t => ({ date: t.txn_date, amount: Number(t.amount) || 0 })), sipsOf(x, true).map(s => Number(s.amount)))
      : () => false
    let covered = 0
    txns.forEach((t, i) => {
      const amt = Number(t.amount) || 0
      add({ id: `${x.id}:${t.id ?? i}`, key, type, holding: x, date: String(t.txn_date), own: amt, currency: x.currency, txn: t,
        how: t.txn_type === 'switch_in' ? 'Switched in' : type === 'stocks' ? 'Bought' : t.txn_type === 'sip' || isSip(amt) ? 'SIP' : 'Lump sum',
        units: t.units != null ? Number(t.units) : null, price: t.nav != null ? Number(t.nav) : null, estimated: !!t.estimated })
      covered += amt
    })
    const rest = cost(x) - covered
    if (rest > Math.max(1, cost(x) * 0.01)) add({ id: `${x.id}:rest`, key, type, holding: x, date: String(x.created_at ?? ''), own: rest, currency: x.currency, how: 'Added',
      note: covered > 0 ? 'What it cost beyond the dated purchases, on the day you added it' : 'What it cost, on the day you added it' })
  })
  recorded(h.mutualFunds ?? [], 'mf', 'mutual_funds', holdingCost.mf)
  recorded(h.stocks ?? [], 'stocks', 'stocks', holdingCost.stock)

  const once = (rows: any[], key: FlowKey, type: HType, when: (x: any) => string, how: EntryHow, cost: (x: any) => number) =>
    rows.forEach(x => add({ id: `${x.id}:0`, key, type, holding: x, date: when(x), own: cost(x), currency: x.currency, how,
      units: x.units != null ? Number(x.units) : null, price: x.avg_buy_price != null ? Number(x.avg_buy_price) : null }))
  once(h.etf ?? [], 'etf', 'etf_investments', e => String(e.purchase_date ?? e.created_at ?? ''), 'Bought', holdingCost.etf)
  once(h.gold ?? [], 'gold', 'gold_investments', g => String(g.purchase_date ?? g.created_at ?? ''), 'Bought', holdingCost.gold)
  once(h.bonds ?? [], 'bonds', 'bond_investments', b => String(b.purchase_date ?? b.created_at ?? ''), 'Bought', holdingCost.bond)
  once(h.fixedDeposits ?? [], 'fd', 'fixed_deposits', f => String(f.start_date ?? f.created_at ?? ''), 'Opened', holdingCost.fd)

  for (const r of h.recurringDeposits ?? []) {
    const startDay = day(r.start_date) ?? day(r.created_at), start = ym(startDay), n = rdInstalments(r, today), tenure = Number(r.tenure_months) || 0
    if (start) for (let i = 0; i < n; i++) {
      const m = addMonth(start, i)
      add({ id: `${r.id}:${m}`, key: 'rd', type: 'recurring_deposits', holding: r, date: onDay(m, Number(startDay!.slice(8, 10))), own: Number(r.monthly_amount) || 0, currency: r.currency,
        how: 'Instalment', scheduled: true, note: `Instalment ${i + 1}${tenure ? ` of ${tenure}` : ''}` })
    }
  }

  for (const l of h.lic ?? []) {
    const startDay = day(l.start_date), start = ym(startDay), per = PER_YEAR[String(l.premium_frequency ?? 'annually').toLowerCase()] ?? 1
    if (!start) continue
    const end = ym(l.maturity_date) ?? now, step = 12 / per, amt = (Number(l.annual_premium) || 0) / per
    for (let m = start; m <= end && m <= now; m = addMonth(m, step))
      add({ id: `${l.id}:${m}`, key: 'lic', type: 'lic_policies', holding: l, date: onDay(m, Number(startDay!.slice(8, 10))), own: amt, currency: l.currency ?? 'INR', how: 'Premium', scheduled: true, note: 'On its premium schedule' })
  }

  for (const x of h.ppfEpf ?? []) {
    const start = ym(x.start_date ?? x.created_at), monthly = (Number(x.annual_contribution) || 0) / 12
    if (!start || !(monthly > 0)) continue
    const end = ym(x.maturity_date) ?? now
    for (let m = start; m <= end && m <= now; m = addMonth(m, 1))
      add({ id: `${x.id}:${m}`, key: 'ppf', type: 'ppf_epf_accounts', holding: x, date: `${m}-01`, own: monthly, currency: x.currency, how: 'Contribution', scheduled: true, note: 'Its yearly contribution, spread over the months' })
  }

  for (const n of h.nps ?? []) {
    const start = ym(n.start_date), cost = holdingCost.nps(n)
    if (!start) { add({ id: `${n.id}:0`, key: 'nps', type: 'nps_accounts', holding: n, date: String(n.created_at ?? ''), own: cost, currency: n.currency, how: 'Added', note: 'What it holds, on the day you added it' }); continue }
    const months = Math.max(1, monthsBetween(start, now) + 1)
    for (let i = 0; i < months; i++) {
      const m = addMonth(start, i)
      add({ id: `${n.id}:${m}`, key: 'nps', type: 'nps_accounts', holding: n, date: `${m}-01`, own: cost / months, currency: n.currency, how: 'Contribution', scheduled: true, note: 'What it holds, spread evenly since it started' })
    }
  }

  return out
}

// Money taken out: fund redemptions and share / ETF sales, as recorded
export function investmentOuts(h: Pick<FlowInput, 'mutualFunds' | 'stocks' | 'etf' | 'invTxns'>, conv: (amt: number, cur: string) => number, today = new Date()): InvEntry[] {
  const now = nowMonth(today)
  const holdings = new Map<string, { type: HType; key: FlowKey; row: any }>()
  ;(h.mutualFunds ?? []).forEach(r => holdings.set(r.id, { type: 'mutual_funds', key: 'mf', row: r }))
  ;(h.stocks ?? []).forEach(r => holdings.set(r.id, { type: 'stocks', key: 'stocks', row: r }))
  ;(h.etf ?? []).forEach(r => holdings.set(r.id, { type: 'etf_investments', key: 'etf', row: r }))
  const out: InvEntry[] = []
  ;(h.invTxns ?? []).forEach((t, i) => {
    const x = t.asset_id ? holdings.get(t.asset_id) : null, month = ym(t.txn_date), own = Number(t.amount) || 0
    if (!x || !OUTFLOW.has(t.txn_type) || !month || month > now || !(own > 0)) return
    const currency = x.row.currency || 'INR'
    out.push({ id: `${x.row.id}:${t.id ?? `o${i}`}`, key: x.key, type: x.type, holding: x.row, name: holdingName(x.type, x.row), date: String(t.txn_date).slice(0, 10), month,
      own, currency, amount: conv(own, currency), how: t.txn_type === 'switch_out' ? 'Switched out' : x.type === 'mutual_funds' ? 'Redeemed' : 'Sold', txn: t,
      units: t.units != null ? Number(t.units) : null, price: t.nav != null ? Number(t.nav) : null })
  })
  return out
}

// A fund's SIPs that had no payment in a month, once their day has passed.
// A SIP whose month is ticked off (recorded, or skipped) is never "missing".
export function missingSips(funds: any[], entries: InvEntry[], month: string, today: string, conv: (amt: number, cur: string) => number) {
  const out: { fund: any; name: string; day: number; own: number; amount: number; currency: string }[] = []
  for (const f of funds) {
    if (f.is_active === false || (ym(f.created_at) ?? '') > month) continue
    const paid = entries.filter(e => e.holding?.id === f.id && e.month === month && e.txn).map(e => e.own)
    for (const s of sipsOf(f).sort((a, b) => a.day - b.day)) {
      const due = onDay(month, s.day)
      if (due > today || (s.last_month && s.last_month >= month) || (day(f.created_at) ?? '') > due) continue
      const i = paid.findIndex(a => Math.abs(a - Number(s.amount)) <= Number(s.amount) * 0.1)
      if (i >= 0) { paid.splice(i, 1); continue }
      const currency = f.currency || 'INR'
      out.push({ fund: f, name: holdingName('mutual_funds', f), day: s.day, own: Number(s.amount), amount: conv(Number(s.amount), currency), currency })
    }
  }
  return out
}
