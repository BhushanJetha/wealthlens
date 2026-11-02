// Charges found in your history, and what each one is to you. The same money can
// be a repeating entry you set up ("Rent") and a bank line under another name
// ("Al Noor Properties"), so a found charge is counted in your plan only when it
// isn't already one of your entries. Your answers live in big_bill_skips
// (migration 041): not regular · a separate bill · the same as an entry.
import { addMonths, findRecurring, normMerchant, seenPayments, ymOf, type Recurring } from './insights'
import { isSpend } from './money'
import { ruleTextFor } from './rules'

const NO = 'regular:no:', SEP = 'regular:sep:', SAME = 'regular:same:'
export const answerNo = (key: string) => `${NO}${key}`
export const answerSeparate = (key: string) => `${SEP}${key}`
export const answerSame = (key: string, repeatId: string) => `${SAME}${key}:${repeatId}`
export const answersFor = (key: string, answers: string[]) => answers.filter(a => a === answerNo(key) || a === answerSeparate(key) || a.startsWith(`${SAME}${key}:`))

// counted: it's in your plan · same: you said it's that entry · looks: it looks
// like that entry, so it's left out until you say · no: you said it isn't regular
export type RegularState = 'counted' | 'same' | 'looks' | 'no'
export function regularState(r: { key: string; category: string; med: number }, cur: string | undefined, repeats: any[], answers: string[] = []): { state: RegularState; repeat: any | null } {
  if (answers.includes(answerNo(r.key))) return { state: 'no', repeat: null }
  const said = answers.find(a => a.startsWith(`${SAME}${r.key}:`))
  const named = said ? repeats.find(x => x.id === said.slice(`${SAME}${r.key}:`.length)) : null
  if (named) return { state: 'same', repeat: named }
  if (answers.includes(answerSeparate(r.key))) return { state: 'counted', repeat: null }
  const near = (x: any, pct: number) => Math.abs(Number(x.amount) - r.med) <= Number(x.amount) * pct
  const look = repeats.filter(x => x.is_active && isSpend(x) && x.currency === cur).find(x => (x.category === r.category && near(x, 0.1)) || near(x, 0.02))
  return look ? { state: 'looks', repeat: look } : { state: 'counted', repeat: null }
}
export const isCounted = (r: { key: string; category: string; med: number }, cur: string | undefined, repeats: any[], answers: string[] = []) =>
  regularState(r, cur, repeats, answers).state === 'counted'

// Every steady charge in the last 6 complete months, except your entries themselves
export interface FoundCharge extends Recurring {
  currency: string; account_id: string | null; sub_category: string | null; seen: { date: string; amount: number }[]
  state: RegularState; repeat: any | null
}
const ORDER: Record<RegularState, number> = { looks: 0, counted: 1, same: 2, no: 3 }
export function foundRegular(txns: any[], repeats: any[], today: string, answers: string[] = []): FoundCharge[] {
  const month = ymOf(today), from = addMonths(month, -6)
  const real = txns.filter(t => !t.auto_ref && ymOf(t.txn_date) >= from && (t.currency === 'AED' || t.currency === 'INR'))
  const names = new Set(repeats.map(x => ruleTextFor(x.merchant)))
  const out: FoundCharge[] = []
  for (const cur of ['AED', 'INR']) {
    const mine = real.filter(t => t.currency === cur)
    const amt = (t: any) => Number(t.amount) || 0
    // Six months finds what's irregular lately; four keeps whatever the plan counts
    const byKey = new Map([...findRecurring(mine, month, amt), ...findRecurring(mine, month, amt, 6)].map(r => [r.key, r]))
    for (const r of Array.from(byKey.values())) {
      if (names.has(ruleTextFor(r.name))) continue
      const rows = mine.filter(t => isSpend(t) && normMerchant(t.merchant) === r.key).sort((a, b) => String(b.txn_date).localeCompare(String(a.txn_date)))
      out.push({ ...r, currency: cur, account_id: rows[0]?.account_id ?? null, sub_category: rows[0]?.sub_category ?? null, seen: seenPayments(rows, r.name, 6), ...regularState(r, cur, repeats, answers) })
    }
  }
  return out.sort((a, b) => ORDER[a.state] - ORDER[b.state] || b.med - a.med)
}

// A found charge left out as the same as an entry, when the entry is in another
// category: its money still sits in that category's average, so it's taken off there
export function sameMoney(txns: any[], repeats: any[], today: string, cur: string, answers: string[] = []) {
  return foundRegular(txns.filter(t => t.currency === cur), repeats, today, answers)
    .filter(f => (f.state === 'same' || f.state === 'looks') && f.repeat && f.repeat.category !== f.category)
    .map(f => ({ category: f.category, amount: f.med }))
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
