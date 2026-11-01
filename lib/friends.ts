// Friends & splits: what each friend owes you, or you owe them, in each
// currency (dirhams and rupees are never added together). It comes from
//   • splits of what you paid (txn_splits) — they owe you their share
//   • what a friend paid for you (paid_by_friend_id) — you owe them your share
//   • money back either way (friend_id) — settles up
// Nothing here changes a balance: your bank moved what it moved; this only
// says whose spending it was.
import { catOf, REPAID_BY_FRIEND, PAID_BACK_FRIEND } from './money'

export type Cur = 'AED' | 'INR'
export type EntryKind = 'split' | 'paid_for_you' | 'repaid_you' | 'you_paid_back'
export interface FriendEntry {
  id: string; kind: EntryKind; date: string; label: string
  amount: number; currency: Cur
  effect: number          // + they owe you more · − they owe you less (or you owe them)
  txn: any
}
export interface FriendBalance { friend: any; owes: Record<Cur, number>; entries: FriendEntry[] }

const curOf = (c: any): Cur => (c === 'AED' ? 'AED' : 'INR')
export const ENTRY_TEXT: Record<EntryKind, string> = {
  split: 'You paid · their share', paid_for_you: 'They paid · your share', repaid_you: 'They paid you back', you_paid_back: 'You paid them back',
}

export function friendBalances(friends: any[], splits: any[], txns: any[]): FriendBalance[] {
  const out = new Map<string, FriendBalance>(friends.map(f => [f.id, { friend: f, owes: { AED: 0, INR: 0 }, entries: [] }]))
  const push = (friendId: string, e: FriendEntry) => {
    const b = out.get(friendId)
    if (!b) return
    b.entries.push(e)
    b.owes[e.currency] += e.effect
  }
  for (const s of splits) {
    const t = s.transactions ?? txns.find(x => x.id === s.transaction_id)
    if (!t) continue
    const amount = Number(s.amount) || 0
    push(s.friend_id, { id: `split-${s.id}`, kind: 'split', date: t.txn_date, label: t.merchant || t.category || 'Split', amount, currency: curOf(t.currency), effect: amount, txn: t })
  }
  for (const t of txns) {
    const amount = Number(t.amount) || 0
    if (t.paid_by_friend_id) push(t.paid_by_friend_id, { id: `paid-${t.id}`, kind: 'paid_for_you', date: t.txn_date, label: t.merchant || t.category, amount, currency: curOf(t.currency), effect: -amount, txn: t })
    if (t.friend_id) {
      const back = catOf(t) === REPAID_BY_FRIEND || (catOf(t) !== PAID_BACK_FRIEND && t.txn_type === 'income')
      push(t.friend_id, { id: `back-${t.id}`, kind: back ? 'repaid_you' : 'you_paid_back', date: t.txn_date, label: t.merchant || (back ? 'Paid you back' : 'You paid back'),
        amount, currency: curOf(t.currency), effect: back ? -amount : amount, txn: t })
    }
  }
  const list = Array.from(out.values())
  for (const b of list) {
    b.entries.sort((x, y) => String(y.date).localeCompare(String(x.date)))
    for (const c of ['AED', 'INR'] as Cur[]) b.owes[c] = Math.round(b.owes[c] * 100) / 100
  }
  // Who owes the most first, then the ones you owe, then settled — by name
  const weight = (b: FriendBalance) => Math.abs(b.owes.AED) + Math.abs(b.owes.INR) > 0 ? 0 : 1
  return list.sort((x, y) => weight(x) - weight(y) || String(x.friend.name).localeCompare(String(y.friend.name)))
}

// All friends together: what's coming back to you, and what you owe
export function friendTotals(list: FriendBalance[]): { toReceive: Record<Cur, number>; toPay: Record<Cur, number> } {
  const toReceive = { AED: 0, INR: 0 }, toPay = { AED: 0, INR: 0 }
  for (const b of list) for (const c of ['AED', 'INR'] as Cur[]) {
    if (b.owes[c] > 0) toReceive[c] += b.owes[c]
    else if (b.owes[c] < 0) toPay[c] -= b.owes[c]
  }
  return { toReceive, toPay }
}

// Equal split: each friend's share (2 decimals); you take what's left, so the
// shares always add up to the amount exactly. `withMe` false: it was all for them.
export function equalShares(amount: number, friends: number, withMe = true): { each: number[]; mine: number } {
  if (friends <= 0) return { each: [], mine: amount }
  const people = friends + (withMe ? 1 : 0)
  const base = Math.floor(amount / people * 100) / 100
  const each = Array<number>(friends).fill(base)
  if (!withMe) each[0] = Math.round((amount - base * (friends - 1)) * 100) / 100
  const mine = Math.round((amount - each.reduce((s, v) => s + v, 0)) * 100) / 100
  return { each, mine }
}

// Transactions that could be a friend paying you back (a plain credit) or you
// paying them (a plain transfer out), closest in amount and date first
export function settleCandidates(txns: any[], opts: { theyPaid: boolean; currency: Cur; amount: number; date: string }): any[] {
  const day = (d: string) => Math.floor(Date.parse(`${String(d).slice(0, 10)}T00:00:00Z`) / 864e5)
  const plainIn = (t: any) => t.txn_type === 'income' && ['Other', 'Transfer', ''].includes(String(t.category ?? '').trim())
  const plainOut = (t: any) => t.txn_type !== 'income' && catOf(t) === 'Transfer'
  return txns
    .filter(t => t.account_id && !t.friend_id && t.currency === opts.currency && (opts.theyPaid ? plainIn(t) : plainOut(t))
      && Math.abs(day(t.txn_date) - day(opts.date)) <= 45)
    .sort((a, b) => Math.abs(Number(a.amount) - opts.amount) - Math.abs(Number(b.amount) - opts.amount) || Math.abs(day(a.txn_date) - day(opts.date)) - Math.abs(day(b.txn_date) - day(opts.date)))
    .slice(0, 6)
}

// Split by %: each friend's percent of the amount (2 decimals)
export function percentShares(amount: number, percents: number[]): number[] {
  return percents.map(p => Math.round(amount * (p || 0)) / 100)
}
