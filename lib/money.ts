// Single source of truth for how money is counted — shared by Home, Income,
// Expenses, Spending analysis, Budgets and every report so totals always match.
//
// Every transaction is one of three things:
//   income  — money earned (salary, interest, rent…)
//   move    — money moving between your own accounts: UAE → India remittance,
//             NRE → NRO, card bill payment, ATM cash, loan received. Never
//             counted as income or spending.
//   out     — spent (living costs, family support), loan EMIs, or invested.
//
// UAE → India: the AED debit and the ₹ credit in NRE are the same money, so
// they're paired into one remittance (pairRemittances). India income = what
// lands in NRE; it counts only in the India view. In the All view the UAE
// salary is already the income, so the remittance isn't counted again.

export type View = 'uae' | 'india' | 'consolidated'

// Moves between your own accounts (or borrowing) — never spend, never income
export const MOVEMENT_CATS = new Set([
  'NRE Received', 'Received from NRE', 'Received from UAE', 'NRI Transfer', 'Inward Remittance',
  'International Transfer', 'Transfer to India', 'Remittance',
  'NRE to NRO', 'NRE → NRO', 'NRO Settled', 'NRO to NRE', 'Self Transfer', 'Internal Transfer',
  'Loan Received', 'Loan Taken', 'Loan Disbursement', 'ATM Withdrawal',
  // A card purchase turned into EMIs leaves the card balance for the loan
  // (the purchase was already counted as spending; the EMIs aren't again)
  'Converted to EMI',
  // Splitting with friends: their share of what you paid, and settling up
  'Lent to friends', 'Repaid by friend', 'Paid back to friend',
  // Money back from selling an investment: your own money coming home, not income
  'Investment Sold',
])

// Card bill payments settle purchases already counted on the card, so they're a
// move — unless that month's card purchases were never imported (see
// markUnitemisedCardBills), when the bill stands in for them.
export const CC_BILL = 'Credit Card Payment'
export const CARD_UNITEMISED = 'Card spending (not itemised)'

// Money back from a shop: never spending (whatever type it was saved as) and never income
export const REFUND = 'Refund'
export type SpendClass = 'expense' | 'ccbill' | 'excluded'
export const classify = (c: string): SpendClass =>
  c === CC_BILL ? 'ccbill' : (MOVEMENT_CATS.has(c) || c === 'Loan on Card' || c === REFUND) ? 'excluded' : 'expense'

// Manual transfers are stored as category "Transfer" + a sub_category (the
// kind). Own = between your own accounts in the same country (ENBD → ADCB).
export const TRANSFER_SUB_ROW: Record<string, string> = {
  Internal: 'NRE to NRO', International: 'International Transfer', Family: 'Family Transfer', 'ATM Withdrawal': 'ATM Withdrawal',
  'NRO to NRE': 'NRO to NRE', Own: 'Self Transfer',
}
// A transfer whose kind isn't known yet (imported "NEFT / IMPS / transfer"
// lines): until it's matched to your own account or given a kind in Review,
// it counts as money sent to others
export const isUnknownTransfer = (t: any) => catOf(t) === 'Transfer' && t?.txn_type !== 'income'

// Moves between your own accounts that a statement shows as two plain
// transfers — money out of one, the same amount into another of yours within
// 3 days. Paired, they're a move (not spending, not income). Each row is used
// once; the closest date wins.
const OWN_IN_CATS = new Set(['Transfer', 'Other', 'Self Transfer', ''])
export function pairOwnTransfers(txns: any[]): { out: any; in: any }[] {
  const outs = txns.filter(t => t.account_id && isUnknownTransfer(t)).sort((a, b) => String(a.txn_date).localeCompare(String(b.txn_date)))
  const ins = txns.filter(t => t.account_id && t.txn_type === 'income' && OWN_IN_CATS.has(String(t.category ?? '').trim()))
  const used = new Set<any>(), pairs: { out: any; in: any }[] = []
  const day = (d: string) => Math.floor(Date.parse(`${String(d).slice(0, 10)}T00:00:00Z`) / 864e5)
  for (const o of outs) {
    const amt = Number(o.amount) || 0
    let best: any = null, gap = Infinity
    for (const i of ins) {
      if (used.has(i) || i.account_id === o.account_id || i.currency !== o.currency) continue
      const g = Math.abs(day(i.txn_date) - day(o.txn_date))
      if (g > 3 || Math.abs((Number(i.amount) || 0) - amt) > Math.max(1, amt * 0.005)) continue
      if (g < gap) { best = i; gap = g }
    }
    if (best) { used.add(best); pairs.push({ out: o, in: best }) }
  }
  return pairs
}

export const ROW_LABEL: Record<string, string> = {
  Transfer: 'Transfers to sort', 'International Transfer': 'Sent to India', [CC_BILL]: 'Credit Card Bill', 'Family Transfer': 'Family support',
}
// Categories merged into one (migration 034 rewrites saved data; this keeps
// anything still carrying an old name — a rule, an old import — in the right row)
export const CATEGORY_ALIAS: Record<string, string> = { Transport: 'Travel & transport', Travel: 'Travel & transport', 'Trip/Vacation': 'Travel & transport' }
const CARD_PAYMENT_NAME = /^(credit\s*card|cc|card)\s*(bill|payment|repayment)s?$/i
export const canonCategory = (c: string) => CATEGORY_ALIAS[c] ?? (CARD_PAYMENT_NAME.test(c.trim()) ? 'Credit Card Payment' : c)
export const labelOf = (cat: string) => ROW_LABEL[cat] ?? cat

// Report row a transaction belongs to
export const catOf = (t: any) => {
  if (t?._cardSpend) return CARD_UNITEMISED
  const c = canonCategory((t.category && String(t.category).trim()) || 'Other')
  if (c !== 'Transfer') return c
  if (TRANSFER_SUB_ROW[t.sub_category]) return TRANSFER_SUB_ROW[t.sub_category]
  // A card statement's "payment received" line, which older imports saved as
  // a plain transfer named "Credit Card Payment": it's the card bill (on the
  // card it lowers what you owe — counted as a charge, it raised it)
  return CARD_PAYMENT_NAME.test(String(t.merchant ?? '').trim()) ? CC_BILL : c
}

// Transaction types the Expense Report reads spend from
export const SPEND_TXN_TYPES = ['expense', 'transfer', 'loan']

// True when a transaction is money out (spent, EMI or invested)
export const isSpend = (t: any) =>
  SPEND_TXN_TYPES.includes(t?.txn_type) && classify(catOf(t)) === 'expense'

// Where money out went: living costs and family support are spending; loan
// repayments and investments are shown on their own.
export type SpendGroup = 'living' | 'sent' | 'loans' | 'invest'
export const SPEND_GROUPS: { key: SpendGroup; label: string; short: string; color: string }[] = [
  { key: 'living', label: 'Living costs',    short: 'Living',   color: '#6A55E8' },
  { key: 'sent',   label: 'Family & others', short: 'Family',   color: '#3B8EF0' },
  { key: 'loans',  label: 'Loan EMIs',       short: 'EMIs',     color: '#F29A2E' },
  { key: 'invest', label: 'Invested',        short: 'Invested', color: '#2FB67C' },
]
const SENT_CATS = new Set(['Transfer', 'Family Transfer', 'NRO to Family'])
export function spendGroup(t: any): SpendGroup | null {
  if (!isSpend(t)) return null
  const c = catOf(t)
  // A card bill standing in for purchases is what you bought: everyday spending
  if (t._cardSpend) return 'living'
  if (t.txn_type === 'loan' || c === 'EMI/Loan') return 'loans'
  // Money into an asset: investments, and payments towards your home
  if (c === 'Investment' || c === 'Home purchase') return 'invest'
  if (t.txn_type === 'transfer' || SENT_CATS.has(c)) return 'sent'
  return 'living'
}
// "Spent" on screens = living costs + family & others (not EMIs or investing)
export const isSpending = (t: any) => { const g = spendGroup(t); return g === 'living' || g === 'sent' }

// ── Income ──────────────────────────────────────────────────────────────────
// Income-typed rows that are really moves (money received from yourself,
// borrowing, or the old auto "NRO" copies), your own money coming back (a
// refund, an FD or RD paying out what you put in — its interest is Interest)
const NOT_INCOME = new Set(['NRE Received', 'Received from NRE', 'Received from UAE', 'NRI Transfer', 'Inward Remittance',
  'Loan Taken', 'Loan Received', 'UAE Income (NRO)', 'Self Transfer', 'NRE to NRO', 'NRO Settled', 'Repaid by friend', 'Investment Sold', 'Refund', 'FD/RD Maturity'])
export const INDIA_INCOME = 'Received from UAE'

// Income in a view. Remittances landing in India (rows made by prepareMoney)
// count only in the India view; earned income counts everywhere it's in view.
export function isIncome(t: any, view: View): boolean {
  if (t?._remit) return view === 'india'
  if (t?._ownIn) return false
  return t?.txn_type === 'income' && !NOT_INCOME.has(String(t.category ?? '').trim())
}

// ── UAE → India remittances ─────────────────────────────────────────────────
const REMIT_OUT = new Set(['International Transfer', 'Transfer to India', 'Remittance'])
const REMIT_IN = new Set(['NRE Received', 'Received from UAE', 'Inward Remittance', 'NRI Transfer'])
const NRO_MOVE = new Set(['NRE to NRO', 'NRE → NRO', 'NRO Settled'])
// Credits a statement saved as plain income ("Other", "Transfer"): money from
// UAE landing in NRE, or from NRE landing in NRO, arrives as one of these
// when nobody marked it
const PLAIN_IN = new Set(['Other', 'Transfer', ''])
const isPlainCredit = (t: any) => !t?._remit && t?.txn_type === 'income' && PLAIN_IN.has(String(t.category ?? '').trim())
export const isRemitOut = (t: any) => t?.currency === 'AED' && t?.txn_type !== 'income' && REMIT_OUT.has(catOf(t))
export const isRemitIn = (t: any) => !t?._remit && t?.currency === 'INR' && t?.txn_type !== 'expense' && REMIT_IN.has(String(t.category ?? '').trim())
// (an imported "Self Transfer" once carried the Internal kind — it's not NRE → NRO)
export const isNreToNro = (t: any) => t?.currency === 'INR' && ((t?.sub_category === 'Internal' && String(t.category ?? '').trim() !== 'Self Transfer') || NRO_MOVE.has(String(t.category ?? '').trim()))

export interface Remittance {
  id: string; sentOn: string | null; landedOn: string; aed: number | null; inr: number
  rate: number | null; source: 'matched' | 'entered' | 'via NRO' | 'estimated' | 'received'
  out?: any; in?: any
}
const dayNum = (d: string) => Math.floor(new Date(`${d.slice(0, 10)}T00:00:00Z`).getTime() / 864e5)

// Pair each AED remittance with the ₹ that landed in India: the NRE credit
// within a week (rate 15–35 ₹/AED) — one marked as received from UAE, else a
// plain ₹ credit the statement saved as "Other" — else the NRE → NRO move
// that followed, else an estimate at `fx`. ₹ receipts with no AED side are
// kept as received.
export function pairRemittances(txns: any[], fx: number): Remittance[] {
  const outs = txns.filter(isRemitOut).sort((a, b) => a.txn_date.localeCompare(b.txn_date))
  const ins = txns.filter(isRemitIn), nros = txns.filter(isNreToNro)
  const plain = txns.filter(t => t?.currency === 'INR' && isPlainCredit(t))
  const used = new Set<any>()
  const pick = (pool: any[], out: any) => {
    const d = dayNum(out.txn_date), aed = Number(out.amount) || 0
    let best: any = null, bestGap = Infinity
    for (const t of pool) {
      if (used.has(t)) continue
      const gap = dayNum(t.txn_date) - d, rate = (Number(t.amount) || 0) / aed
      if (gap < -1 || gap > 7 || rate < 15 || rate > 35) continue
      if (Math.abs(gap) < bestGap) { best = t; bestGap = Math.abs(gap) }
    }
    if (best) used.add(best)
    return best
  }
  const out: Remittance[] = outs.map(o => {
    const aed = Number(o.amount) || 0
    const hit = pick(ins, o) ?? pick(plain, o)
    const kept = Number(o.counter_amount) > 0 ? Number(o.counter_amount) : 0
    const entered = !hit && kept && !o.counter_estimated ? kept : 0
    // What you moved on to NRO is what landed only if it's all of it: moving part
    // of it says nothing about the rest, which is still in NRE. An estimate is the
    // one kept when it was made, so it doesn't move with the rate
    const est = kept || Math.round(aed * fx)
    const nro = hit || entered ? null : pick(nros.filter(t => Math.abs((Number(t.amount) || 0) - est) <= est * 0.04), o)
    const inr = hit ? Number(hit.amount) : entered || (nro ? Number(nro.amount) : est)
    return {
      id: `remit-${o.id ?? o.txn_date}`, sentOn: o.txn_date, landedOn: (hit ?? nro ?? o).txn_date, aed, inr,
      rate: aed > 0 ? inr / aed : null, source: hit ? 'matched' : entered ? 'entered' : nro ? 'via NRO' : 'estimated', out: o, in: hit ?? nro ?? undefined,
    }
  })
  for (const t of ins) if (!used.has(t)) out.push({ id: `remit-${t.id ?? t.txn_date}`, sentOn: null, landedOn: t.txn_date, aed: null, inr: Number(t.amount) || 0, rate: null, source: 'received', in: t })
  return out.sort((a, b) => b.landedOn.localeCompare(a.landedOn))
}

// Transfers from the last 45 days still at an estimate: only you know what landed
export function landedToAsk(txns: any[], today: string, fx: number): Remittance[] {
  const now = dayNum(today)
  return pairRemittances(txns, fx).filter(r => r.source === 'estimated' && r.out?.id && r.out.auto_status !== 'pending' && r.sentOn && now - dayNum(r.sentOn) >= 0 && now - dayNum(r.sentOn) <= 45)
}

// ── Splitting with friends ──────────────────────────────────────────────────
// You paid for friends too: `friend_share` is what they owe you back. Only
// your share is spending; theirs is money lent — a move out of your account
// that comes back as "Repaid by friend". A friend paid for you
// (`paid_by_friend_id`, no account): your share is spending, nothing left
// your accounts, and paying them back ("Paid back to friend") isn't spending
// again. Neither money back is income.
export const LENT_TO_FRIENDS = 'Lent to friends'
export const REPAID_BY_FRIEND = 'Repaid by friend'
export const PAID_BACK_FRIEND = 'Paid back to friend'
export const myShare = (t: any) => Math.max(0, (Number(t?.amount) || 0) - (Number(t?.friend_share) || 0))
// A split expense becomes two rows on the same account: your share (its own
// category) and your friends' share ("Lent to friends"). Together they're the
// full amount that left the account. Safe to call twice.
export function expandSplits(txns: any[]): any[] {
  if (!txns.some(t => Number(t?.friend_share) > 0)) return txns
  const out: any[] = []
  for (const t of txns) {
    const amount = Number(t?.amount) || 0, share = Math.min(Number(t?.friend_share) || 0, amount)
    if (!(share > 0) || t.txn_type !== 'expense' || t._remit) { out.push(t); continue }
    if (amount - share > 0.004) out.push({ ...t, amount: amount - share, friend_share: null, _whole: t })
    out.push({ ...t, id: `${t.id}:friends`, amount: share, friend_share: null, category: LENT_TO_FRIENDS, sub_category: null,
      txn_type: 'transfer', event_id: null, counter_account_id: null, _friendShare: true, _whole: t })
  }
  return out
}

// ── Where income went, in cash ──────────────────────────────────────────────
// What left your bank & cash: spending paid directly, card bills (they pay for
// what was charged to cards — so the charges aren't taken off again), EMIs,
// investing and, in the UAE view, money sent to India. Charges on cards are
// kept apart (`onCards`, `cardLoanEmis`): spending, but out of your bank only
// as card bills. Moves between your own accounts don't leave you.
export interface CashOut {
  direct: number; cardBills: number; emis: number; invested: number; sentHome: number
  onCards: number; cardLoanEmis: number
  friends: number      // lent to friends + paid back to them − what they repaid (out of your bank & cash)
}
export function cashOut(rows: any[], opts: { view: View; isCard: (t: any) => boolean; amount: (t: any) => number }): CashOut {
  const o: CashOut = { direct: 0, cardBills: 0, emis: 0, invested: 0, sentHome: 0, onCards: 0, cardLoanEmis: 0, friends: 0 }
  // A payment on both statements (bank debit + card credit) is one payment
  const bankBills = rows.filter(t => catOf(t) === CC_BILL && !opts.isCard(t))
  const onBank = (t: any) => bankBills.some(b => b.currency === t.currency && Math.abs(dayNum(b.txn_date) - dayNum(t.txn_date)) <= 4
    && Math.abs((Number(b.amount) || 0) - (Number(t.amount) || 0)) <= Math.max(1, (Number(t.amount) || 0) * 0.01))
  for (const t of expandSplits(rows)) {
    if (t._remit || t.paid_by_friend_id) continue          // a friend paid: nothing left your accounts
    const v = opts.amount(t)
    if (!(v > 0)) continue
    if (catOf(t) === REPAID_BY_FRIEND) { o.friends -= v; continue }
    if (t.txn_type === 'income') continue
    const c = catOf(t), card = opts.isCard(t)
    if (c === LENT_TO_FRIENDS || c === PAID_BACK_FRIEND) { if (!card) o.friends += v; continue }
    if (c === CC_BILL) { if (!card || !onBank(t)) o.cardBills += v; continue }
    if (isRemitOut(t)) { if (opts.view === 'uae') o.sentHome += v; continue }
    if (c === 'Loan on Card') { if (card) o.cardLoanEmis += v; else o.emis += v; continue }
    const g = spendGroup(t)
    if (!g) continue
    if (card) o.onCards += v
    else if (g === 'loans') o.emis += v
    else if (g === 'invest') o.invested += v
    else o.direct += v
  }
  return o
}
export const cashLeft = (income: number, o: CashOut) => income - o.direct - o.cardBills - o.emis - o.invested - o.sentHome - o.friends

// Card bills stand in for card purchases only when that month's purchases on
// cards of the same currency were never imported (else they'd count twice).
// A card loan's EMI billed to the card is in the bill too, but it's an EMI, not
// spending: it's taken out of the bill, and it doesn't make a month look itemised.
const NOT_PURCHASES = new Set([CC_BILL, 'Loan on Card', 'Converted to EMI', 'Refund'])
export function markUnitemisedCardBills(txns: any[], cardIds: Set<string>): any[] {
  if (!cardIds.size) return txns
  const itemised = new Set<string>()        // `${currency}|${YYYY-MM}` with card purchases
  for (const t of txns) if (t.account_id && cardIds.has(t.account_id) && t.txn_type !== 'income' && !NOT_PURCHASES.has(catOf(t))) itemised.add(`${t.currency}|${String(t.txn_date).slice(0, 7)}`)
  const prev = (m: string) => { const [y, mo] = m.split('-').map(Number); const d = new Date(y, mo - 2, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` }
  const emis = txns.filter(t => t.account_id && cardIds.has(t.account_id) && catOf(t) === 'Loan on Card' && t.txn_type !== 'income')
  const used = new Set<any>()
  const out = new Map<any, any>()
  // Oldest bill first: each EMI goes into the first bill after it, within 40 days
  for (const t of [...txns].sort((a, b) => String(a.txn_date).localeCompare(String(b.txn_date)))) {
    if (catOf(t) !== CC_BILL || (t.account_id && cardIds.has(t.account_id))) continue
    const m = String(t.txn_date).slice(0, 7)
    if (itemised.has(`${t.currency}|${m}`) || itemised.has(`${t.currency}|${prev(m)}`)) continue
    const day = dayNum(t.txn_date)
    const mine = emis.filter(e => !used.has(e) && e.currency === t.currency && (!t.counter_account_id || e.account_id === t.counter_account_id)
      && day - dayNum(e.txn_date) >= 0 && day - dayNum(e.txn_date) <= 40)
    const bill = Number(t.amount) || 0
    let emi = 0
    for (const e of mine) { if (emi + (Number(e.amount) || 0) > bill + 0.5) continue; emi += Number(e.amount) || 0; used.add(e) }
    const rest = Math.round((bill - emi) * 100) / 100
    // All of it was EMIs: nothing left that's spending
    if (rest > 0) out.set(t, { ...t, _cardSpend: true, _billAmount: bill, _cardEmi: emi, amount: rest })
  }
  return out.size ? txns.map(t => out.get(t) ?? t) : txns
}

// The receiving side of a move between your own accounts that a statement
// saved as plain income: the same amount (±0.5%) left another of your
// accounts as a known move — NRE → NRO, "to my other account", or one that
// names this account — the day before up to 3 days after. Each credit → the
// row it came from. Not income (it would count the same money twice).
export function ownCredits(txns: any[]): Map<any, any> {
  const day = (d: string) => Math.floor(Date.parse(`${String(d).slice(0, 10)}T00:00:00Z`) / 864e5)
  const outs = txns.filter(o => o.account_id && o.txn_type !== 'income' && !o._remit
    && (isNreToNro(o) || catOf(o) === 'Self Transfer' || (!!o.counter_account_id && catOf(o) !== CC_BILL)))
  const out = new Map<any, any>(), used = new Set<any>()
  for (const i of txns) {
    if (!i.account_id || !isPlainCredit(i)) continue
    const amt = Number(i.amount) || 0
    let best: any = null, gap = Infinity
    for (const o of outs) {
      if (used.has(o) || o.account_id === i.account_id || o.currency !== i.currency) continue
      if (o.counter_account_id && o.counter_account_id !== i.account_id) continue
      const g = day(i.txn_date) - day(o.txn_date)
      if (g < -1 || g > 3 || Math.abs((Number(o.amount) || 0) - amt) > Math.max(1, amt * 0.005)) continue
      if (Math.abs(g) < gap) { best = o; gap = Math.abs(g) }
    }
    if (best) { used.add(best); out.set(i, best) }
  }
  return out
}

// Transactions ready for counting: card bills marked where needed, credits
// that are really your own money arriving (from UAE, from another of your
// accounts) marked `_ownIn` so they're never income, plus one "Received
// from UAE" income row per remittance (₹, India view only).
export function prepareMoney(txns: any[], opts: { fx: number; cardIds?: Set<string> }): any[] {
  const raw = expandSplits(txns.filter(t => !t?._remit))   // safe to call twice
  const marked = opts.cardIds ? markUnitemisedCardBills(raw, opts.cardIds) : raw
  const remits = pairRemittances(marked, opts.fx)
  const landed = new Set(remits.map(r => r.in).filter(Boolean))
  const own = ownCredits(marked.filter(t => !landed.has(t)))
  const base = marked.map(t => t.txn_type === 'income' && (landed.has(t) || own.has(t)) ? { ...t, _ownIn: true } : t)
  const rows = remits.map(r => ({
    id: r.id, txn_date: r.landedOn, amount: r.inr, currency: 'INR', country: 'India', txn_type: 'income',
    category: INDIA_INCOME, merchant: r.aed ? `From UAE · AED ${Math.round(r.aed).toLocaleString('en-US')}` : 'Received in NRE',
    account_id: r.in?.account_id ?? null, _remit: true, _aed: r.aed, _rate: r.rate, _source: r.source,
  }))
  return [...base, ...rows]
}
