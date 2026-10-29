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
])

// Card bill payments settle purchases already counted on the card, so they're a
// move — unless that month's card purchases were never imported (see
// markUnitemisedCardBills), when the bill stands in for them.
export const CC_BILL = 'Credit Card Payment'
export const CARD_UNITEMISED = 'Card spending (not itemised)'

export type SpendClass = 'expense' | 'ccbill' | 'excluded'
export const classify = (c: string): SpendClass =>
  c === CC_BILL ? 'ccbill' : (MOVEMENT_CATS.has(c) || c === 'Loan on Card') ? 'excluded' : 'expense'

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
  return c === 'Transfer' && TRANSFER_SUB_ROW[t.sub_category] ? TRANSFER_SUB_ROW[t.sub_category] : c
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
  if (t.txn_type === 'loan' || c === 'EMI/Loan') return 'loans'
  if (c === 'Investment') return 'invest'
  if (t.txn_type === 'transfer' || SENT_CATS.has(c)) return 'sent'
  return 'living'
}
// "Spent" on screens = living costs + family & others (not EMIs or investing)
export const isSpending = (t: any) => { const g = spendGroup(t); return g === 'living' || g === 'sent' }

// ── Income ──────────────────────────────────────────────────────────────────
// Income-typed rows that are really moves (money received from yourself,
// borrowing, or the old auto "NRO" copies)
const NOT_INCOME = new Set(['NRE Received', 'Received from NRE', 'Received from UAE', 'NRI Transfer', 'Inward Remittance',
  'Loan Taken', 'Loan Received', 'UAE Income (NRO)', 'Self Transfer', 'NRE to NRO', 'NRO Settled'])
export const INDIA_INCOME = 'Received from UAE'

// Income in a view. Remittances landing in India (rows made by prepareMoney)
// count only in the India view; earned income counts everywhere it's in view.
export function isIncome(t: any, view: View): boolean {
  if (t?._remit) return view === 'india'
  return t?.txn_type === 'income' && !NOT_INCOME.has(String(t.category ?? '').trim())
}

// ── UAE → India remittances ─────────────────────────────────────────────────
const REMIT_OUT = new Set(['International Transfer', 'Transfer to India', 'Remittance'])
const REMIT_IN = new Set(['NRE Received', 'Received from UAE', 'Inward Remittance', 'NRI Transfer'])
const NRO_MOVE = new Set(['NRE to NRO', 'NRE → NRO', 'NRO Settled'])
export const isRemitOut = (t: any) => t?.currency === 'AED' && t?.txn_type !== 'income' && REMIT_OUT.has(catOf(t))
export const isRemitIn = (t: any) => !t?._remit && t?.currency === 'INR' && t?.txn_type !== 'expense' && REMIT_IN.has(String(t.category ?? '').trim())
// (an imported "Self Transfer" once carried the Internal kind — it's not NRE → NRO)
export const isNreToNro = (t: any) => t?.currency === 'INR' && ((t?.sub_category === 'Internal' && String(t.category ?? '').trim() !== 'Self Transfer') || NRO_MOVE.has(String(t.category ?? '').trim()))

export interface Remittance {
  id: string; sentOn: string | null; landedOn: string; aed: number | null; inr: number
  rate: number | null; source: 'matched' | 'via NRO' | 'estimated' | 'received'
  out?: any; in?: any
}
const dayNum = (d: string) => Math.floor(new Date(`${d.slice(0, 10)}T00:00:00Z`).getTime() / 864e5)

// Pair each AED remittance with the ₹ that landed in India: the NRE credit
// within a week (rate 15–35 ₹/AED), else the NRE → NRO move that followed,
// else an estimate at `fx`. ₹ receipts with no AED side are kept as received.
export function pairRemittances(txns: any[], fx: number): Remittance[] {
  const outs = txns.filter(isRemitOut).sort((a, b) => a.txn_date.localeCompare(b.txn_date))
  const ins = txns.filter(isRemitIn), nros = txns.filter(isNreToNro)
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
    const hit = pick(ins, o), nro = hit ? null : pick(nros, o)
    const inr = hit ? Number(hit.amount) : nro ? Number(nro.amount) : Math.round(aed * fx)
    return {
      id: `remit-${o.id ?? o.txn_date}`, sentOn: o.txn_date, landedOn: (hit ?? nro ?? o).txn_date, aed, inr,
      rate: aed > 0 ? inr / aed : null, source: hit ? 'matched' : nro ? 'via NRO' : 'estimated', out: o, in: hit ?? nro ?? undefined,
    }
  })
  for (const t of ins) if (!used.has(t)) out.push({ id: `remit-${t.id ?? t.txn_date}`, sentOn: null, landedOn: t.txn_date, aed: null, inr: Number(t.amount) || 0, rate: null, source: 'received', in: t })
  return out.sort((a, b) => b.landedOn.localeCompare(a.landedOn))
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
}
export function cashOut(rows: any[], opts: { view: View; isCard: (t: any) => boolean; amount: (t: any) => number }): CashOut {
  const o: CashOut = { direct: 0, cardBills: 0, emis: 0, invested: 0, sentHome: 0, onCards: 0, cardLoanEmis: 0 }
  // A payment on both statements (bank debit + card credit) is one payment
  const bankBills = rows.filter(t => catOf(t) === CC_BILL && !opts.isCard(t))
  const onBank = (t: any) => bankBills.some(b => b.currency === t.currency && Math.abs(dayNum(b.txn_date) - dayNum(t.txn_date)) <= 4
    && Math.abs((Number(b.amount) || 0) - (Number(t.amount) || 0)) <= Math.max(1, (Number(t.amount) || 0) * 0.01))
  for (const t of rows) {
    if (t.txn_type === 'income' || t._remit) continue
    const v = opts.amount(t)
    if (!(v > 0)) continue
    const c = catOf(t), card = opts.isCard(t)
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
export const cashLeft = (income: number, o: CashOut) => income - o.direct - o.cardBills - o.emis - o.invested - o.sentHome

// Card bills stand in for card purchases only when that month's purchases on
// cards of the same currency were never imported (else they'd count twice).
export function markUnitemisedCardBills(txns: any[], cardIds: Set<string>): any[] {
  if (!cardIds.size) return txns
  const itemised = new Set<string>()        // `${currency}|${YYYY-MM}` with card purchases
  for (const t of txns) if (t.account_id && cardIds.has(t.account_id) && t.txn_type !== 'income' && catOf(t) !== CC_BILL) itemised.add(`${t.currency}|${String(t.txn_date).slice(0, 7)}`)
  const prev = (m: string) => { const [y, mo] = m.split('-').map(Number); const d = new Date(y, mo - 2, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` }
  return txns.map(t => {
    if (catOf(t) !== CC_BILL || (t.account_id && cardIds.has(t.account_id))) return t
    const m = String(t.txn_date).slice(0, 7)
    return itemised.has(`${t.currency}|${m}`) || itemised.has(`${t.currency}|${prev(m)}`) ? t : { ...t, _cardSpend: true }
  })
}

// Transactions ready for counting: card bills marked where needed, plus one
// "Received from UAE" income row per remittance (₹, India view only).
export function prepareMoney(txns: any[], opts: { fx: number; cardIds?: Set<string> }): any[] {
  const raw = txns.filter(t => !t?._remit)          // safe to call twice
  const base = opts.cardIds ? markUnitemisedCardBills(raw, opts.cardIds) : raw
  const rows = pairRemittances(base, opts.fx).map(r => ({
    id: r.id, txn_date: r.landedOn, amount: r.inr, currency: 'INR', country: 'India', txn_type: 'income',
    category: INDIA_INCOME, merchant: r.aed ? `From UAE · AED ${Math.round(r.aed).toLocaleString('en-US')}` : 'Received in NRE',
    account_id: r.in?.account_id ?? null, _remit: true, _aed: r.aed, _rate: r.rate, _source: r.source,
  }))
  return [...base, ...rows]
}
