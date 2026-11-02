// The one place that decides what repeats. It reads your history on every load,
// with no rule per bill: the same payee at a steady amount, at any steady gap, is a
// repeating charge. Every month suggests a monthly entry; a longer gap suggests a
// big bill with a monthly set-aside. Anything new is found the same way.
//
// The same money can be an entry you set up ("Rent") and a bank line under another
// name ("Al Noor Properties"), so a found charge counts in your plan only when it
// isn't already one of your bills. Your answers live in big_bill_skips (migration
// 041): not regular · a separate bill · the same as an entry.
import { addMonths, daysInMonth, findRecurring, normMerchant, seenPayments, ymOf, type Recurring } from './insights'
import { catOf, isSpend, labelOf } from './money'
import { ruleTextFor } from './rules'
import { NOT_PLANABLE } from './budgets'
import { addMonthsTo, daysUntil, normName } from './recurringGoals'
import type { Bill } from './bigBills'

const NO = 'regular:no:', SEP = 'regular:sep:', SAME = 'regular:same:'
export const answerNo = (key: string) => `${NO}${key}`
export const answerSeparate = (key: string) => `${SEP}${key}`
export const answerSame = (key: string, entryId: string) => `${SAME}${key}:${entryId}`
export const answersFor = (key: string, answers: string[]) => answers.filter(a => a === answerNo(key) || a === answerSeparate(key) || a.startsWith(`${SAME}${key}:`))

// Everything you've said is a bill, whichever way it repeats
export interface BillEntry { id: string; merchant: string; category: string | null; amount: number; currency: string; every: number; is_active: boolean; txn_type: string; policy: boolean }
export function entriesOf(repeats: any[], bills: Bill[] = []): BillEntry[] {
  return [
    ...repeats.filter(r => r.is_active && r.txn_type === 'expense').map(r => ({ id: r.id, merchant: r.merchant, category: r.category, amount: Number(r.amount), currency: r.currency, every: Number(r.every_months) || 1, is_active: true, txn_type: r.txn_type, policy: false })),
    ...bills.map(b => ({ id: `big_${b.key.replace(':', '_')}`, merchant: b.name, category: b.category, amount: b.amount, currency: b.currency, every: b.every, is_active: true, txn_type: 'expense', policy: !!b.policy })),
  ]
}
// Two names for one payee ("Airtel Fiber" and "AIRTEL FIBER 8841")
export function sameName(a: unknown, b: unknown) {
  const x = normMerchant(String(a ?? '')), y = normMerchant(String(b ?? ''))
  if (x.length < 3 || y.length < 3) return false
  if (x === y || ruleTextFor(String(a)) === ruleTextFor(String(b))) return true
  return x.length >= 6 && y.length >= 6 && (x.includes(y.slice(0, 8)) || y.includes(x.slice(0, 8)))
}

// counted: it's in your plan · same: it's that entry · looks: it looks like that
// entry, so it's left out until you say · no: you said it isn't regular
export type RegularState = 'counted' | 'same' | 'looks' | 'no'
export function regularState(r: { key: string; category: string; med: number; name?: string; every?: number }, cur: string | undefined, repeats: any[], answers: string[] = [], bills: Bill[] = []): { state: RegularState; repeat: any | null } {
  if (answers.includes(answerNo(r.key))) return { state: 'no', repeat: null }
  const entries = entriesOf(repeats, bills).filter(x => x.currency === cur)
  const said = answers.find(a => a.startsWith(`${SAME}${r.key}:`))
  const named = said ? entries.find(x => x.id === said.slice(`${SAME}${r.key}:`.length)) : null
  if (named) return { state: 'same', repeat: named }
  if (answers.includes(answerSeparate(r.key))) return { state: 'counted', repeat: null }
  const byName = r.name ? entries.find(x => sameName(x.merchant, r.name)) : null
  if (byName) return { state: 'same', repeat: byName }
  // A monthly charge is never mistaken for a yearly bill of the same amount
  const every = r.every ?? 1
  const near = (x: BillEntry, pct: number) => Math.abs(x.amount - r.med) <= x.amount * pct
  const look = entries.filter(x => (x.every === 1) === (every === 1)).find(x => (x.category === r.category && near(x, 0.1)) || near(x, 0.02) || (x.policy && near(x, 0.1)))
  return look ? { state: 'looks', repeat: look } : { state: 'counted', repeat: null }
}
export const isCounted = (r: { key: string; category: string; med: number; name?: string }, cur: string | undefined, repeats: any[], answers: string[] = [], bills: Bill[] = []) =>
  regularState(r, cur, repeats, answers, bills).state === 'counted'

// ── Any gap longer than a month ──────────────────────────────────────────────
const MIN_LONG: Record<string, number> = { INR: 1000, AED: 100 }
const NOT_BILLS = ['Investment', 'EMI/Loan', 'Family Transfer', 'Credit Card Payment']
export interface LongCharge extends Recurring { every: number }
export function longCharges(rows: any[], cur: string, today: string): LongCharge[] {
  const groups: Record<string, any[]> = {}
  for (const t of rows) {
    if (!isSpend(t) || NOT_PLANABLE.has(catOf(t)) || NOT_BILLS.includes(catOf(t))) continue
    const k = normMerchant(t.merchant)
    if (k.length >= 3) (groups[k] ??= []).push(t)
  }
  const out: LongCharge[] = []
  for (const [key, list] of Object.entries(groups)) {
    if (list.length < 2) continue
    const s = [...list].sort((a, b) => String(a.txn_date).localeCompare(String(b.txn_date)))
    const dates = s.map(t => String(t.txn_date).slice(0, 10))
    const gaps = dates.slice(1).map((d, i) => daysUntil(dates[i], d))
    const mid = [...gaps].sort((a, b) => a - b)[Math.floor(gaps.length / 2)]
    const every = Math.round(mid / 30.44)
    if (every < 2 || every > 13) continue
    // Steady: every gap is close to the usual one
    if (gaps.some(g => Math.abs(g - mid) > Math.max(15, mid * 0.15))) continue
    // Two payments can be chance when the gap is short: a quarter needs three
    if (every < 4 && dates.length < 3) continue
    const last = s[s.length - 1], prev = s[s.length - 2], amt = Number(last.amount) || 0, was = Number(prev.amount) || 0
    if (amt < MIN_LONG[cur] || Math.abs(amt - was) > Math.max(amt, was) * 0.25) continue
    // It stopped: it didn't come when it should have
    if (daysUntil(addMonthsTo(dates[dates.length - 1], every), today) > Math.min(45, every * 15)) continue
    const rose = was > 0 ? Math.round((amt - was) / was * 100) : 0
    out.push({ key, name: String(last.merchant).trim(), category: catOf(last), n: dates.length, med: Math.round(amt), last: amt, day: Number(dates[dates.length - 1].slice(8, 10)),
      paidThisMonth: dates[dates.length - 1].slice(0, 7) === today.slice(0, 7), rose: rose >= 5 ? rose : null, every })
  }
  return out
}

// ── Everything found, with what each one is to you ───────────────────────────
export interface FoundCharge extends Recurring {
  currency: string; account_id: string | null; sub_category: string | null; seen: { date: string; amount: number }[]
  every: number; next: string; state: RegularState; repeat: any | null; why: string
}
const ORDER: Record<RegularState, number> = { looks: 0, counted: 1, same: 2, no: 3 }
const everyWords = (n: number) => (n === 1 ? 'every month' : n === 12 ? 'every year' : `every ${n} months`)
export function foundRegular(txns: any[], repeats: any[], today: string, answers: string[] = [], bills: Bill[] = []): FoundCharge[] {
  const month = ymOf(today)
  const entries = entriesOf(repeats, bills)
  const out: FoundCharge[] = []
  for (const cur of ['AED', 'INR']) {
    const mine = txns.filter(t => t.currency === cur && !t.auto_ref && t.txn_date)
    const amt = (t: any) => Number(t.amount) || 0
    const monthly = new Map([...findRecurring(mine, month, amt), ...findRecurring(mine, month, amt, 6)].map(r => [r.key, r]))
    // The gap decides: three payments two months apart are in 3 of 6 months, but aren't monthly
    const long = longCharges(mine, cur, today), isLong = new Set(long.map(r => r.key))
    const all: (Recurring & { every: number })[] = [
      ...Array.from(monthly.values()).filter(r => !isLong.has(r.key)).map(r => ({ ...r, every: 1 })),
      ...long,
    ]
    for (const r of all) {
      const said = answersFor(r.key, answers).length > 0
      // Already one of your bills by name: there's nothing to ask
      if (!said && entries.some(x => x.currency === cur && sameName(x.merchant, r.name))) continue
      const rows = mine.filter(t => isSpend(t) && normMerchant(t.merchant) === r.key).sort((a, b) => String(b.txn_date).localeCompare(String(a.txn_date)))
      const lastDate = rows[0] ? String(rows[0].txn_date).slice(0, 10) : today
      let next: string
      if (r.every > 1) { next = addMonthsTo(lastDate, r.every); while (next < today) next = addMonthsTo(next, r.every) }
      else {
        const ym = r.paidThisMonth || r.day < Number(today.slice(8, 10)) ? addMonths(month, 1) : month
        next = `${ym}-${String(Math.min(r.day, daysInMonth(ym))).padStart(2, '0')}`
      }
      const earlier = answers.includes(`detect:${cur}|${normName(r.name)}`)     // "Not a bill" from before
      const seen = seenPayments(rows, r.name, 6)
      out.push({ ...r, currency: cur, account_id: rows[0]?.account_id ?? null, sub_category: rows[0]?.sub_category ?? null, seen, next,
        why: `${labelOf(r.category)} · ${everyWords(r.every)} · ${seen.length} payment${seen.length === 1 ? '' : 's'} found`,
        ...(earlier ? { state: 'no' as const, repeat: null } : regularState({ ...r }, cur, repeats, answers, bills)) })
    }
  }
  return out.sort((a, b) => ORDER[a.state] - ORDER[b.state] || b.med - a.med)
}
// What still needs an answer from you
export const pendingCharges = (found: FoundCharge[], answers: string[]) =>
  found.filter(f => f.state === 'looks' || (f.state === 'counted' && answersFor(f.key, answers).length === 0))

// A found charge left out as the same as an entry, when the entry is in another
// category: its money still sits in that category's average, so it's taken off there
export function sameMoney(txns: any[], repeats: any[], today: string, cur: string, answers: string[] = []) {
  return foundRegular(txns.filter(t => t.currency === cur), repeats, today, answers)
    .filter(f => (f.state === 'same' || f.state === 'looks') && f.repeat && f.repeat.category !== f.category)
    .map(f => ({ category: f.category, amount: f.med }))
}

// What your bills take in an average month, in one currency
export function monthlyCommitted(cur: string, repeats: any[], bills: Bill[], found: FoundCharge[]) {
  const repeating = entriesOf(repeats).filter(x => x.currency === cur).reduce((s, x) => s + x.amount / x.every, 0)
  const aside = bills.filter(b => b.currency === cur).reduce((s, b) => s + b.amount / Math.max(1, b.every), 0)
  const spotted = found.filter(f => f.currency === cur && f.state === 'counted' && f.every === 1).reduce((s, f) => s + f.med, 0)
  return { repeating, aside, spotted, total: repeating + aside + spotted }
}

// For reconciling: the bank names you've said are each repeating entry
export function aliasesOf(answers: string[]): Record<string, string[]> {
  const out: Record<string, string[]> = {}
  for (const a of answers) {
    if (!a.startsWith(SAME)) continue
    const rest = a.slice(SAME.length), at = rest.lastIndexOf(':')
    if (at > 0) (out[rest.slice(at + 1)] ??= []).push(rest.slice(0, at))
  }
  return out
}

// Answering (client side). One answer per charge: the new one replaces the old
export async function answerCharge(sb: any, uid: string, key: string, answers: string[], next: string | null): Promise<string | null> {
  const old = answersFor(key, answers)
  if (old.length) {
    const { error } = await sb.from('big_bill_skips').delete().eq('user_id', uid).in('key', old)
    if (error) return /big_bill_skips/.test(error.message) ? 'Run migration 041 in Supabase to save this.' : error.message
  }
  if (!next) return null
  const { error } = await sb.from('big_bill_skips').upsert({ user_id: uid, key: next }, { onConflict: 'user_id,key' })
  return error ? (/big_bill_skips/.test(error.message) ? 'Run migration 041 in Supabase to save this.' : error.message) : null
}
