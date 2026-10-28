// Events & trips (migration 034): a trip, a function at home, a festival, a
// home project — each with its own budget. Expenses are TAGGED to one (they
// keep their category), so the total per event, per year and per category
// never counts anything twice. Tagged spending is kept out of monthly budgets
// (lib/budgets) — those measure everyday living — but always counts in what
// you spent and saved.
import { isSpend, catOf } from './money'
import { FIXED } from './budgets'

export type EventKind = 'trip' | 'function' | 'festival' | 'project' | 'medical' | 'other'
export const EVENT_KINDS: { key: EventKind; label: string; icon: string; color: string; hint: string }[] = [
  { key: 'trip',     label: 'Trip',             icon: '✈️', color: '#0891B2', hint: 'A holiday, the trip home, a weekend away' },
  { key: 'function', label: 'Function at home', icon: '🎉', color: '#EC5B8C', hint: 'Wedding, birthday party, housewarming, pooja' },
  { key: 'festival', label: 'Festival',         icon: '🪔', color: '#F29A2E', hint: 'Diwali, Eid, Onam, Christmas' },
  { key: 'project',  label: 'Home project',     icon: '🏠', color: '#6A55E8', hint: 'Renovation, moving house, furnishing' },
  { key: 'medical',  label: 'Medical',          icon: '🏥', color: '#DC2626', hint: 'A hospital stay or treatment' },
  { key: 'other',    label: 'Other',            icon: '📌', color: '#64748B', hint: 'Anything you want to total up' },
]
export const eventKind = (k: string) => EVENT_KINDS.find(x => x.key === k) ?? EVENT_KINDS[EVENT_KINDS.length - 1]

const day = (d: string) => Math.floor(Date.parse(`${String(d).slice(0, 10)}T00:00:00Z`) / 864e5)
const addDays = (d: string, n: number) => new Date((day(d) + n) * 864e5).toISOString().slice(0, 10)
const conv = (amt: number, from: string, to: string, fx: number) => (from === to ? amt : to === 'INR' ? amt * fx : amt / fx)

export type EventStatus = 'upcoming' | 'live' | 'ended' | 'done'
export interface EventStats {
  spent: number; budget: number; left: number; pct: number | null
  count: number; days: number; dayNo: number; perDayLeft: number | null
  byCategory: { name: string; value: number }[]; byPerson: { name: string; value: number }[]
  byDay: { date: string; value: number }[]; currencies: string[]
  status: EventStatus; rows: any[]
}
// What an event has cost so far, in its own currency (AED ↔ ₹ at today's rate)
export function eventStats(ev: any, txns: any[], fx: number, today: string): EventStats {
  const rows = txns.filter(t => t.event_id === ev.id && isSpend(t)).sort((a, b) => String(b.txn_date).localeCompare(String(a.txn_date)))
  const cur = ev.currency === 'AED' ? 'AED' : 'INR'
  const v = (t: any) => conv(Number(t.amount) || 0, t.currency, cur, fx)
  const group = (key: (t: any) => string) => {
    const m: Record<string, number> = {}
    for (const t of rows) m[key(t)] = (m[key(t)] ?? 0) + v(t)
    return Object.entries(m).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value)
  }
  const spent = rows.reduce((s, t) => s + v(t), 0), budget = Number(ev.budget) || 0
  const days = Math.max(1, day(ev.end_date) - day(ev.start_date) + 1)
  const status: EventStatus = ev.closed_at ? 'done' : today < ev.start_date ? 'upcoming' : today <= ev.end_date ? 'live' : 'ended'
  const dayNo = status === 'live' ? day(today) - day(ev.start_date) + 1 : status === 'upcoming' ? 0 : days
  const remainingDays = status === 'live' ? day(ev.end_date) - day(today) + 1 : status === 'upcoming' ? days : 0
  return {
    spent, budget, left: budget - spent, pct: budget > 0 ? spent / budget * 100 : null,
    count: rows.length, days, dayNo, perDayLeft: budget > 0 && remainingDays > 0 ? Math.max(0, budget - spent) / remainingDays : null,
    byCategory: group(catOf), byPerson: group(t => t.holder_name || 'Whole family'),
    byDay: group(t => String(t.txn_date).slice(0, 10)).map(x => ({ date: x.name, value: x.value })).sort((a, b) => a.date.localeCompare(b.date)),
    currencies: Array.from(new Set(rows.map(t => t.currency))), status, rows,
  }
}

// Untagged spending that probably belongs: anything in its dates (not rent,
// EMIs, bills or investments), and for a trip, flight and hotel bookings made
// in the 90 days before it
const NOT_EVENT = new Set([...Array.from(FIXED), 'Utilities', 'Subscription', 'Tax Payment', 'Loan on Card', 'Credit Card Payment'])
const BOOKING = /flight|airline|air ?india|indigo|spicejet|vistara|akasa|emirates|flydubai|air ?arabia|etihad|hotel|resort|airbnb|booking\.com|agoda|makemytrip|goibibo|cleartrip|yatra|easemytrip|\boyo\b|visa/i
export function eventSuggestions(ev: any, txns: any[]): any[] {
  return txns.filter(t => !t.event_id && isSpend(t) && !NOT_EVENT.has(catOf(t)) && (
    (t.txn_date >= ev.start_date && t.txn_date <= ev.end_date)
    || (ev.kind === 'trip' && t.txn_date >= addDays(ev.start_date, -90) && t.txn_date < ev.start_date && BOOKING.test(`${t.merchant ?? ''} ${t.description ?? ''}`))
  )).sort((a, b) => String(a.txn_date).localeCompare(String(b.txn_date)))
}

// A year of events: how many, what they cost (₹, AED at today's rate), by
// kind and by category — "2026: 4 events, ₹3.2L"
export function yearSummary(events: any[], txns: any[], fx: number, today: string, year: string) {
  const mine = events.filter(e => String(e.start_date).slice(0, 4) === year)
  const items = mine.map(e => {
    const s = eventStats(e, txns, fx, today)
    return { ev: e, s, inr: conv(s.spent, e.currency === 'AED' ? 'AED' : 'INR', 'INR', fx), budgetInr: conv(s.budget, e.currency === 'AED' ? 'AED' : 'INR', 'INR', fx) }
  }).sort((a, b) => String(b.ev.start_date).localeCompare(String(a.ev.start_date)))
  const byKind: Record<string, number> = {}, byCat: Record<string, number> = {}
  for (const it of items) {
    byKind[it.ev.kind] = (byKind[it.ev.kind] ?? 0) + it.inr
    for (const c of it.s.byCategory) byCat[c.name] = (byCat[c.name] ?? 0) + conv(c.value, it.ev.currency === 'AED' ? 'AED' : 'INR', 'INR', fx)
  }
  const total = items.reduce((s, x) => s + x.inr, 0)
  const budgeted = items.filter(x => x.budgetInr > 0)
  return {
    year, items, total, count: items.length,
    byKind: Object.entries(byKind).map(([k, v]) => ({ kind: k, value: v })).sort((a, b) => b.value - a.value),
    byCategory: Object.entries(byCat).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value),
    overBudget: budgeted.filter(x => x.inr > x.budgetInr).length, budgetedCount: budgeted.length,
  }
}

// The open event a new expense on `date` most likely belongs to
export const eventForDate = (events: any[], date: string) =>
  events.filter(e => !e.closed_at && date >= e.start_date && date <= e.end_date).sort((a, b) => String(b.start_date).localeCompare(String(a.start_date)))[0] ?? null
