// Repeating entries (migration 027, recurring_txns): rent, SIPs, family
// support, EMIs you record by hand… added on their day each month, either
// automatically or after a one-tap confirm. A month that's already in your
// transactions (imported from a statement, say) is ticked off, never doubled.
import { addMonths, daysInMonth, daysBetween, ymOf } from './insights'
import { ruleTextFor } from './rules'
import { CC_BILL } from './money'
import { isMissingTable } from './supabase/missingTable'

export interface RecurringTxn {
  id: string; merchant: string; description: string | null
  category: string; sub_category: string | null; txn_type: string
  amount: number; currency: string; account_id: string | null; counter_account_id: string | null
  day_of_month: number; every_months: number; start_month: string; last_done_month: string | null
  auto_add: boolean; is_active: boolean
}
export interface Occurrence { r: RecurringTxn; month: string; date: string }

const monthsBetween = (a: string, b: string) => {
  const [ya, ma] = a.split('-').map(Number), [yb, mb] = b.split('-').map(Number)
  return (yb - ya) * 12 + (mb - ma)
}
export const dateIn = (ym: string, day: number) => `${ym}-${String(Math.min(day, daysInMonth(ym))).padStart(2, '0')}`

// The next date an entry falls on, from today
export function nextDate(r: RecurringTxn, today: string): string {
  for (let i = 0; i < 24; i++) {
    const m = addMonths(ymOf(today), i)
    if (m < r.start_month || monthsBetween(r.start_month, m) % (r.every_months || 1)) continue
    if (r.last_done_month && m <= r.last_done_month) continue
    return dateIn(m, r.day_of_month)
  }
  return dateIn(addMonths(ymOf(today), 1), r.day_of_month)
}

// Months whose day has come and that haven't been added or skipped yet,
// oldest first (looking back at most `maxBack` months)
export function dueOccurrences(r: RecurringTxn, today: string, maxBack = 3): Occurrence[] {
  if (!r.is_active) return []
  const now = ymOf(today), out: Occurrence[] = []
  for (let i = maxBack - 1; i >= 0; i--) {
    const m = addMonths(now, -i)
    if (m < r.start_month || (r.last_done_month && m <= r.last_done_month)) continue
    if (monthsBetween(r.start_month, m) % (r.every_months || 1) !== 0) continue
    const date = dateIn(m, r.day_of_month)
    if (date <= today) out.push({ r, month: m, date })
  }
  return out
}

// A transaction that already covers this month: added from this entry, or
// the same money within ~a week (same category or merchant, amount ±10%)
export function alreadyRecorded(o: Occurrence, txns: any[]): any | null {
  const amt = Number(o.r.amount), key = ruleTextFor(o.r.merchant)
  return txns.find(t => t.recurring_id === o.r.id && ymOf(t.txn_date) === o.month)
    ?? txns.find(t => t.currency === o.r.currency && Math.abs(daysBetween(o.date, t.txn_date)) <= 6
      && Math.abs((Number(t.amount) || 0) - amt) <= amt * 0.1
      && (t.category === o.r.category || (!!key && ruleTextFor(t.merchant) === key)))
    ?? null
}

export function rowFor(o: Occurrence, userId: string) {
  const r = o.r
  return {
    user_id: userId, txn_date: o.date, merchant: r.merchant, description: r.description, category: r.category,
    sub_category: r.sub_category, txn_type: r.txn_type, amount: Number(r.amount), currency: r.currency,
    country: r.currency === 'AED' ? 'UAE' : 'India', account_id: r.account_id, counter_account_id: r.counter_account_id,
    source: 'manual', is_verified: true, recurring_id: r.id,
  }
}

// Mark a month done — only if it still isn't, so two open tabs can't both add it
export async function claimMonth(supabase: any, r: RecurringTxn, month: string): Promise<boolean> {
  let q = supabase.from('recurring_txns').update({ last_done_month: month }).eq('id', r.id)
  q = r.last_done_month ? q.eq('last_done_month', r.last_done_month) : q.is('last_done_month', null)
  const { data, error } = await q.select('id')
  return !error && (data?.length ?? 0) > 0
}

// Add one month's entry (confirm button or auto-add). Returns the new row.
export async function addOccurrence(supabase: any, userId: string, o: Occurrence): Promise<{ row: any | null; error: string | null }> {
  const before = o.r.last_done_month
  if (!(await claimMonth(supabase, o.r, o.month))) return { row: null, error: 'Already added' }
  const { data, error } = await supabase.from('transactions').insert(rowFor(o, userId)).select().single()
  if (error) {
    await supabase.from('recurring_txns').update({ last_done_month: before }).eq('id', o.r.id)
    return { row: null, error: error.message }
  }
  o.r.last_done_month = o.month
  return { row: data, error: null }
}

// Run when Home or Money opens: auto entries are added, months already in
// your transactions are ticked off, and the rest wait for a confirm.
// `rules` = the recurring_txns read already done (lib/automation reads it with
// everything else, saving a round trip); read here when not given.
export async function runRecurring(supabase: any, userId: string, today: string, txns: any[], rules?: { data: any; error: any }):
  Promise<{ ready: boolean; list: RecurringTxn[]; pending: Occurrence[]; inserted: any[] }> {
  const { data, error } = rules ?? await supabase.from('recurring_txns').select('*').eq('user_id', userId).order('created_at')
  if (error) return { ready: !isMissingTable(error), list: [], pending: [], inserted: [] }
  const list = (data ?? []) as RecurringTxn[]
  const pending: Occurrence[] = [], inserted: any[] = []
  for (const r of list) for (const o of dueOccurrences(r, today)) {
    if (alreadyRecorded(o, [...txns, ...inserted])) {
      if (await claimMonth(supabase, r, o.month)) r.last_done_month = o.month
    } else if (r.auto_add) {
      const { row } = await addOccurrence(supabase, userId, o)
      if (row) inserted.push(row)
    } else pending.push(o)
  }
  return { ready: true, list, pending, inserted }
}

// ── Suggestions ──────────────────────────────────────────────────────────────
// Things you've added by hand in at least 3 of the last 5 months (this one
// included), once a month, at a steady amount (±10%) — worth making repeat.
export interface RepeatSuggestion {
  key: string; merchant: string; category: string; sub_category: string | null; txn_type: string
  currency: string; amount: number; day: number; account_id: string | null; counter_account_id: string | null
  months: number; lastMonth: string
}
export function suggestRepeats(txns: any[], existing: RecurringTxn[], today: string): RepeatSuggestion[] {
  const months = [0, 1, 2, 3, 4].map(i => addMonths(ymOf(today), -i))
  const groups: Record<string, any[]> = {}
  for (const t of txns) {
    if (t.source && t.source !== 'manual') continue
    if (t.recurring_id || t._remit || !t.txn_date || !months.includes(ymOf(t.txn_date))) continue
    if (t.category === CC_BILL || t.category === 'ATM Withdrawal') continue
    const key = ruleTextFor(t.merchant)
    if (!key) continue
    ;(groups[`${key}|${t.category}|${t.currency}|${t.txn_type}`] ||= []).push(t)
  }
  const covered = (key: string, cur: string) => existing.some(r => ruleTextFor(r.merchant) === key && r.currency === cur)
  const out: RepeatSuggestion[] = []
  for (const [g, ts] of Object.entries(groups)) {
    const [key, , currency] = g.split('|')
    const per: Record<string, any[]> = {}
    for (const t of ts) (per[ymOf(t.txn_date)] ||= []).push(t)
    const ms = Object.keys(per)
    if (ms.length < 3 || Object.values(per).some(x => x.length > 1) || covered(key, currency)) continue
    const amts = ts.map(t => Number(t.amount) || 0).sort((a, b) => a - b)
    const med = amts[Math.floor(amts.length / 2)]
    if (!(med > 0) || amts.some(a => Math.abs(a - med) > med * 0.1)) continue
    const days = ts.map(t => Number(t.txn_date.slice(8, 10))).sort((a, b) => a - b)
    const last = [...ts].sort((a, b) => b.txn_date.localeCompare(a.txn_date))[0]
    out.push({
      key, merchant: String(last.merchant).trim(), category: last.category, sub_category: last.sub_category ?? null, txn_type: last.txn_type,
      currency, amount: med, day: days[Math.floor(days.length / 2)], account_id: last.account_id ?? null,
      counter_account_id: last.counter_account_id ?? null, months: ms.length, lastMonth: ms.sort()[ms.length - 1],
    })
  }
  return out.sort((a, b) => b.amount - a.amount)
}
