// Live account balances (ledger) and payment-method breakdowns.
//
// Balance = the account's balance on `balance_as_of` + every transaction on it
// after that date. For a credit card the "balance" is what you owe: purchases
// add to it; payments and refunds reduce it. A move between your own accounts
// also updates the other account (counter_account_id, or worked out for card
// bills, ATM cash, NRE → NRO and UAE → NRE) — unless that account already has
// its own record of the same money, so nothing counts twice.
import { catOf, CC_BILL, isNreToNro, isRemitOut, pairRemittances } from './money'
import { fetchAll } from './supabase/fetchAll'

export type AccKind = 'bank' | 'card' | 'cash'
export const kindOf = (a: any): AccKind => a?.account_type === 'credit_card' ? 'card' : a?.account_type === 'wallet' ? 'cash' : 'bank'

const IN_CATS = new Set(['NRE Received', 'Received from UAE', 'Received from NRE', 'Inward Remittance', 'NRI Transfer',
  'Loan Received', 'Loan Taken', 'Refund', 'Salary', 'Interest', 'Dividend'])
const isNro = (a: any) => /\bnro\b/i.test(`${a?.name ?? ''}`)
const isNre = (a: any) => /\bnre\b/i.test(`${a?.name ?? ''}`)

// Does this transaction put money INTO its own account?
export function isCredit(t: any, a: any): boolean {
  if (t.txn_type === 'income') return true
  const c = catOf(t)
  if (kindOf(a) === 'card') return c === CC_BILL || c === 'Refund' || c === 'Converted to EMI'   // payment, refund, or a purchase moved into a card loan
  if (c === 'ATM Withdrawal') return kindOf(a) === 'cash'
  if (isNreToNro(t)) return isNro(a)
  return IN_CATS.has(c)
}

const nameWords = (a: any) => `${a.bank_name ?? ''} ${a.name ?? ''}`.toLowerCase().split(/[^a-z0-9]+/)
  .filter(w => w.length >= 3 && !['bank', 'card', 'credit', 'savings', 'account', 'the'].includes(w))

// The other account in a move, recorded or worked out (null when unsure)
export function counterOf(t: any, from: any, accounts: any[]): string | null {
  if (t.counter_account_id) return t.counter_account_id
  if (!from) return null
  const c = catOf(t), same = accounts.filter(a => a.id !== from.id && a.currency === t.currency)
  const one = (xs: any[]) => (xs.length === 1 ? xs[0].id : null)
  if (c === CC_BILL && kindOf(from) !== 'card') {
    const cards = same.filter(a => kindOf(a) === 'card')
    if (cards.length <= 1) return one(cards)
    const text = `${t.merchant ?? ''} ${t.description ?? ''}`.toLowerCase()
    return one(cards.filter(a => nameWords(a).some(w => text.includes(w))))
  }
  if (c === 'ATM Withdrawal') return kindOf(from) === 'cash'
    ? one(same.filter(a => kindOf(a) === 'bank')) : one(same.filter(a => kindOf(a) === 'cash'))
  if (isNreToNro(t)) return one(same.filter(a => kindOf(a) === 'bank' && (isNro(from) ? isNre(a) : isNro(a))))
  if (isRemitOut(t)) return one(accounts.filter(a => a.currency === 'INR' && kindOf(a) === 'bank' && isNre(a)))
  return null
}

export interface Ledger {
  balance: number; anchor: number; asOf: string | null
  inflow: number; outflow: number; count: number
  recent: { date: string; label: string; delta: number; balance: number }[]
}

const asOfOf = (a: any): string | null => (a.balance_as_of ?? a.updated_at ?? a.created_at ?? null)?.slice?.(0, 10) ?? null
const anchorOf = (a: any) => kindOf(a) === 'card' ? Number(a.outstanding_bal) || 0 : Number(a.current_balance) || Number(a.outstanding_bal) || 0
const dayN = (d: string) => Math.floor(new Date(`${d.slice(0, 10)}T00:00:00Z`).getTime() / 864e5)

export function computeLedgers(accounts: any[], txns: any[], fx: number): Record<string, Ledger> {
  const byId = new Map(accounts.map(a => [a.id, a]))
  const moves: Record<string, { t: any; delta: number }[]> = {}
  const push = (id: string, t: any, delta: number) => { (moves[id] ||= []).push({ t, delta }) }
  const after = (a: any, d: string) => { const s = asOfOf(a); return !s || d.slice(0, 10) > s }
  // Real rows per account, to spot when the other side of a move is already recorded
  const realOn = new Map<string, any[]>()
  for (const t of txns) if (t.account_id) (realOn.get(t.account_id) ?? realOn.set(t.account_id, []).get(t.account_id)!).push(t)
  const recorded = (accId: string, amount: number, date: string, wantCredit: boolean, except: any) =>
    (realOn.get(accId) ?? []).some(x => x !== except && Math.abs((Number(x.amount) || 0) - amount) <= Math.max(1, amount * 0.01)
      && Math.abs(dayN(x.txn_date) - dayN(date)) <= 4 && isCredit(x, byId.get(accId)) === wantCredit)
  const remits = pairRemittances(txns, fx)
  const remitOf = new Map(remits.filter(r => r.out).map(r => [r.out, r]))

  for (const t of txns) {
    const a = byId.get(t.account_id)
    const amt = Number(t.amount) || 0
    if (!(amt > 0) || !t.txn_date) continue
    const credit = a ? isCredit(t, a) : false
    // Own account
    if (a && after(a, t.txn_date)) push(a.id, t, kindOf(a) === 'card' ? (credit ? -amt : amt) : (credit ? amt : -amt))
    // Other side of a move between your accounts
    const cid = counterOf(t, a, accounts), c = cid ? byId.get(cid) : null
    if (!c || c.id === a?.id || !after(c, t.txn_date)) continue
    let camt = amt
    if (c.currency !== t.currency) {
      const r = remitOf.get(t)
      if (!r || (r.source === 'matched' && r.in?.account_id === c.id)) continue    // the ₹ credit is its own row
      camt = r.inr
    }
    const counterCredit = !credit                         // money left `a`, so it arrived in `c` (and vice versa)
    if (kindOf(c) === 'card' && !counterCredit) continue  // nothing moves out of a card this way
    if (c.currency === t.currency && recorded(c.id, camt, t.txn_date, counterCredit, t)) continue
    push(c.id, t, kindOf(c) === 'card' ? -camt : (counterCredit ? camt : -camt))
  }

  const out: Record<string, Ledger> = {}
  for (const a of accounts) {
    const rows = (moves[a.id] ?? []).sort((x, y) => x.t.txn_date.localeCompare(y.t.txn_date))
    let bal = anchorOf(a)
    const recent = rows.map(r => { bal += r.delta; return { date: r.t.txn_date, label: r.t.merchant || catOf(r.t), delta: r.delta, balance: bal } })
    const sign = kindOf(a) === 'card' ? -1 : 1            // for cards, money "in" = payments
    out[a.id] = {
      balance: bal, anchor: anchorOf(a), asOf: asOfOf(a), count: rows.length,
      inflow: rows.filter(r => r.delta * sign > 0).reduce((s, r) => s + Math.abs(r.delta), 0),
      outflow: rows.filter(r => r.delta * sign < 0).reduce((s, r) => s + Math.abs(r.delta), 0),
      recent: recent.slice(-8).reverse(),
    }
  }
  return out
}

// Accounts with live balances (bank/cash: current_balance; card: outstanding_bal)
export function applyLedgers(accounts: any[], ledgers: Record<string, Ledger>) {
  return accounts.map(a => {
    const l = ledgers[a.id]
    if (!l) return a
    return kindOf(a) === 'card'
      ? { ...a, outstanding_bal: Math.max(0, Math.round(l.balance)), _ledger: l }
      : { ...a, current_balance: Math.round(l.balance), _ledger: l }
  })
}

// Loader helper: fetch transactions since the earliest starting point, apply.
// Works before migration 026 too (no counter column: retried without it).
export async function withLedgerBalances(supabase: any, userId: string, accounts: any[], fx: number) {
  if (!accounts?.length) return accounts ?? []
  const since = accounts.map(asOfOf).filter(Boolean).sort()[0] ?? null
  const cols = 'id,account_id,counter_account_id,txn_date,amount,currency,txn_type,category,sub_category,merchant,description'
  const read = (sel: string) => fetchAll((a, b) => {
    let q = supabase.from('transactions').select(sel).eq('user_id', userId)
    if (since) q = q.gte('txn_date', since)
    return q.order('txn_date', { ascending: true }).order('id').range(a, b)
  }, 10)
  let res = await read(cols)
  if (res.error) res = await read(cols.replace('counter_account_id,', ''))
  return applyLedgers(accounts, computeLedgers(accounts, res.data, fx))
}

// ── How you paid ────────────────────────────────────────────────────────────
export type PayMethod = 'card' | 'bank' | 'cash' | 'unlinked'
export const PAY_METHODS: { key: PayMethod; label: string; color: string }[] = [
  { key: 'card', label: 'Credit card', color: '#6A55E8' },
  { key: 'bank', label: 'Bank', color: '#3B8EF0' },
  { key: 'cash', label: 'Cash', color: '#2FB67C' },
  { key: 'unlinked', label: 'No account', color: '#94A3B8' },
]
export const methodOf = (t: any, accById: Map<string, any>): PayMethod => {
  const a = t.account_id ? accById.get(t.account_id) : null
  return a ? kindOf(a) : 'unlinked'
}
export const CHANNELS: Record<string, string> = {
  upi: 'UPI', transfer: 'Bank transfer', debit_card: 'Debit card', netbanking: 'Net banking', autodebit: 'Auto-debit', cheque: 'Cheque', other: 'Other',
}
// How a bank payment was made: chosen on entry, else read from the description
export function channelOf(t: any): string {
  if (t.payment_mode && CHANNELS[t.payment_mode]) return t.payment_mode
  const s = `${t.merchant ?? ''} ${t.description ?? ''}`.toLowerCase()
  if (/\bupi\b|@ok|@ybl|@paytm|@axl|@ibl|\bvpa\b/.test(s)) return 'upi'
  if (/\bach\b|nach|\becs\b|standing instruction|auto ?debit|autopay|mandate|\bsi\b/.test(s)) return 'autodebit'
  if (/neft|imps|rtgs|\bift\b|fund[s]? transfer|remittance|swift|transfer/.test(s)) return 'transfer'
  if (/\bpos\b|debit card|\bdc\b|card no|visa|mastercard|rupay/.test(s)) return 'debit_card'
  if (/net ?banking|billdesk|razorpay|payu|ccavenue|online/.test(s)) return 'netbanking'
  if (/\bchq\b|cheque/.test(s)) return 'cheque'
  return 'other'
}

// Active accounts with live balances, in the { data, error } shape of a
// Supabase query so loaders can drop it into their Promise.all unchanged.
export async function activeAccountsWithLedger(supabase: any, userId: string, fx: number): Promise<{ data: any[] | null; error: any }> {
  const { data, error } = await supabase.from('accounts').select('*').eq('user_id', userId).eq('is_active', true)
  return { data: data ? await withLedgerBalances(supabase, userId, data, fx) : data, error }
}
