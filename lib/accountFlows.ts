// Account by account: what came into each bank, cash wallet and card in a
// period and where it went — the same rules as the live balances (lib/ledger):
// a move between your accounts shows on both (a card bill as "card bill →
// Axis" on the bank and "paid from HDFC" on the card; UAE → India as "sent to
// India" on ENBD and "received from UAE" on NRE), and once per account.
import { catOf, labelOf, CC_BILL, isNreToNro, isRemitOut, isIncome, spendGroup, pairRemittances } from './money'
import { isCredit, counterOf, kindOf } from './ledger'

export type FlowKind = 'income' | 'spend' | 'emi' | 'invest' | 'card' | 'move' | 'payment' | 'refund'
export interface FlowLine { key: string; label: string; kind: FlowKind; amount: number; category?: string; count: number }
export interface AccountFlow {
  account: any                        // _unlinked: transactions with no account (one per currency)
  ins: FlowLine[]; outs: FlowLine[]
  inTotal: number; outTotal: number
  merchants: { name: string; amount: number }[]   // biggest spending, top 3
}
type Desc = [key: string, label: string, kind: FlowKind, category?: string]

const name = (a: any) => a?.name ?? 'another account'

// A row on its own account: which way, and what it was
function describe(t: any, a: any, credit: boolean, cid: string | null, byId: Map<string, any>): Desc {
  const c = catOf(t)
  if (kindOf(a) === 'card') {
    if (credit) {
      if (c === CC_BILL) return ['payment', 'Payments received', 'payment']
      if (c === 'Refund') return ['refund', 'Refunds', 'refund']
      if (c === 'Converted to EMI') return ['emi-plan', 'Moved into an EMI plan', 'move']
      return [`in:${c}`, labelOf(c), t.txn_type === 'income' ? 'income' : 'move']
    }
    if (c === 'Loan on Card') return ['card-loan', 'Card-loan EMIs', 'emi']
  }
  if (credit) {
    if (isIncome(t, 'consolidated')) return [`income:${c}`, labelOf(c), 'income']
    if (/^Loan (Taken|Received|Disbursement)$/.test(c)) return ['loan-in', 'Loan money received', 'move']
    if (['NRE Received', 'Received from UAE', 'Inward Remittance', 'NRI Transfer'].includes(c)) return ['from-uae', 'Received from UAE', 'move']
    if (isNreToNro(t)) return ['from-nre', 'From NRE', 'move']
    return [`in:${c}`, labelOf(c), 'move']
  }
  if (c === CC_BILL) return [`bill:${cid ?? '?'}`, cid ? `Card bill → ${name(byId.get(cid))}` : 'Card bills paid', 'card']
  if (isRemitOut(t)) return ['sent-home', 'Sent to India', 'move']
  if (isNreToNro(t)) return ['to-nro', 'Moved to NRO', 'move']
  if (c === 'ATM Withdrawal') return ['atm', 'ATM cash', 'move']
  const g = spendGroup(t)
  if (g === 'loans') return ['emi', 'Loan EMIs', 'emi']
  if (g === 'invest') return ['invest', 'Invested', 'invest']
  if (g) return [`cat:${c}`, labelOf(c), 'spend', c]
  if (cid) return [`to:${cid}`, `To ${name(byId.get(cid))}`, 'move']
  return [`out:${c}`, labelOf(c), 'move']
}

// The other side of a move, on the account it reached (or left)
function describeCounter(t: any, a: any, c: any, inward: boolean): Desc {
  if (kindOf(c) === 'card') return [`paid-from:${a?.id ?? '?'}`, `Paid from ${name(a)}`, 'payment']
  if (inward) {
    if (isRemitOut(t)) return ['from-uae', `Received from UAE${a ? ` (${a.name})` : ''}`, 'move']
    if (isNreToNro(t)) return ['from-nre', 'From NRE', 'move']
    if (catOf(t) === 'ATM Withdrawal') return ['atm-in', 'ATM cash taken out', 'move']
    return [`from:${a?.id ?? '?'}`, `From ${name(a)}`, 'move']
  }
  if (catOf(t) === 'ATM Withdrawal') return ['atm', 'ATM cash', 'move']
  if (isNreToNro(t)) return ['to-nro', 'Moved to NRO', 'move']
  return [`to:${a?.id ?? '?'}`, `To ${name(a)}`, 'move']
}

const dayN = (d: string) => Math.floor(new Date(`${d.slice(0, 10)}T00:00:00Z`).getTime() / 864e5)

export function accountFlows(accounts: any[], txns: any[], fx: number, inPeriod: (date: string) => boolean): AccountFlow[] {
  const byId = new Map(accounts.map(a => [a.id, a]))
  const flows = new Map<string, { account: any; ins: Map<string, FlowLine>; outs: Map<string, FlowLine>; merch: Map<string, number> }>()
  const flowOf = (a: any) => {
    const id = a.id
    if (!flows.has(id)) flows.set(id, { account: a, ins: new Map(), outs: new Map(), merch: new Map() })
    return flows.get(id)!
  }
  const add = (a: any, inward: boolean, [key, label, kind, category]: Desc, amount: number, merchant?: string) => {
    const f = flowOf(a), m = inward ? f.ins : f.outs
    const line = m.get(key) ?? { key, label, kind, amount: 0, category, count: 0 }
    line.amount += amount; line.count++
    m.set(key, line)
    if (kind === 'spend' && merchant) f.merch.set(merchant, (f.merch.get(merchant) ?? 0) + amount)
  }
  // As in the ledger: the other side isn't added where that account has its own record of the same money
  const realOn = new Map<string, any[]>()
  for (const t of txns) if (t.account_id) (realOn.get(t.account_id) ?? realOn.set(t.account_id, []).get(t.account_id)!).push(t)
  const recorded = (accId: string, amount: number, date: string, wantCredit: boolean, except: any) =>
    (realOn.get(accId) ?? []).some(x => x !== except && Math.abs((Number(x.amount) || 0) - amount) <= Math.max(1, amount * 0.01)
      && Math.abs(dayN(x.txn_date) - dayN(date)) <= 4 && isCredit(x, byId.get(accId)) === wantCredit)
  const remitOf = new Map(pairRemittances(txns, fx).filter(r => r.out).map(r => [r.out, r]))

  for (const t of txns) {
    if (t._remit || !t.txn_date || !inPeriod(t.txn_date)) continue
    const amt = Number(t.amount) || 0
    if (!(amt > 0)) continue
    const a = t.account_id ? byId.get(t.account_id) ?? null : null
    const cid = counterOf(t, a, accounts)
    const credit = a ? isCredit(t, a) : t.txn_type === 'income'
    // No account: kept per currency so dirhams and rupees never add up together
    const own = a ?? { id: `__none__${t.currency}`, name: 'Not linked to an account', account_type: 'unlinked', currency: t.currency, _unlinked: true }
    add(own, credit, describe(t, own, credit, cid, byId), amt, t.merchant)
    // The other side of a move between your accounts
    const c = cid ? byId.get(cid) : null
    if (!c || c.id === a?.id) continue
    let camt = amt
    if (c.currency !== t.currency) {
      const r = remitOf.get(t)
      if (!r || (r.source === 'matched' && r.in?.account_id === c.id)) continue    // the ₹ credit is its own row
      camt = r.inr
    }
    const inward = !credit
    if (kindOf(c) === 'card' && !inward) continue
    if (c.currency === t.currency && recorded(c.id, camt, t.txn_date, inward, t)) continue
    add(c, inward, describeCounter(t, a, c, inward), camt)
  }

  const sorted = (m: Map<string, FlowLine>) => Array.from(m.values()).sort((x, y) => y.amount - x.amount)
  return Array.from(flows.values()).map(f => {
    const ins = sorted(f.ins), outs = sorted(f.outs)
    return {
      account: f.account, ins, outs,
      inTotal: ins.reduce((s, l) => s + l.amount, 0), outTotal: outs.reduce((s, l) => s + l.amount, 0),
      merchants: Array.from(f.merch.entries()).sort((x, y) => y[1] - x[1]).slice(0, 3).map(([n, v]) => ({ name: n, amount: v })),
    }
  })
}
