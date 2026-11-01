// Account by account: what came into each bank, cash wallet and card in a
// period and where it went — the same rules as the live balances (lib/ledger):
// a move between your accounts shows on both (a card bill as "card bill →
// Axis" on the bank and "paid from HDFC" on the card; UAE → India as "sent to
// India" on ENBD and "received from UAE" on NRE), and once per account.
import { catOf, labelOf, CC_BILL, isNreToNro, isRemitOut, isIncome, spendGroup, pairRemittances, type View } from './money'
import { isCredit, counterOf, kindOf, balancesAt } from './ledger'

export type FlowKind = 'income' | 'spend' | 'emi' | 'invest' | 'card' | 'move' | 'payment' | 'refund'
export interface FlowLine {
  key: string; label: string; kind: FlowKind; amount: number; category?: string; count: number
  external?: boolean    // a move whose other side isn't among the accounts on screen (counts as money in / out)
  inr?: number          // money sent home: what landed in India, in ₹
  txns: any[]           // the transactions behind it (to open them)
}
export interface AccountFlow {
  account: any                        // _unlinked: transactions with no account (one per currency)
  ins: FlowLine[]; outs: FlowLine[]
  inTotal: number; outTotal: number
  merchants: { name: string; amount: number }[]   // biggest spending, top 3
}
type Desc = { key: string; label: string; kind: FlowKind; category?: string; peer?: string | null }

const name = (a: any) => a?.name ?? 'another account'

// A row on its own account: which way, and what it was
function describe(t: any, a: any, credit: boolean, cid: string | null, byId: Map<string, any>, peer: string | null): Desc {
  const c = catOf(t)
  if (kindOf(a) === 'card') {
    if (credit) {
      if (c === CC_BILL) return { key: 'payment', label: 'Payments received', kind: 'payment' }
      if (c === 'Refund') return { key: 'refund', label: 'Refunds', kind: 'refund' }
      if (c === 'Converted to EMI') return { key: 'emi-plan', label: 'Moved into an EMI plan', kind: 'move' }
      return { key: `in:${c}`, label: labelOf(c), kind: t.txn_type === 'income' ? 'income' : 'move' }
    }
    if (c === 'Loan on Card') return { key: 'card-loan', label: 'Card-loan EMIs', kind: 'emi' }
  }
  if (credit) {
    if (isIncome(t, 'consolidated')) return { key: `income:${c}`, label: labelOf(c), kind: 'income' }
    if (/^Loan (Taken|Received|Disbursement)$/.test(c)) return { key: 'loan-in', label: 'Loan money received', kind: 'move', peer: null }
    if (['NRE Received', 'Received from UAE', 'Inward Remittance', 'NRI Transfer'].includes(c))
      return { key: 'from-uae', label: peer ? `Received from UAE ← ${name(byId.get(peer))}` : 'Received from UAE', kind: 'move', peer }
    if (isNreToNro(t)) return { key: 'from-nre', label: `From NRE${cid ? ` ← ${name(byId.get(cid))}` : ''}`, kind: 'move', peer: cid }
    const from = cid ?? peer
    return { key: from ? `from:${from}` : `in:${c}`, label: from ? `From ${name(byId.get(from))}` : labelOf(c), kind: 'move', peer: from }
  }
  if (c === CC_BILL) return { key: `bill:${cid ?? '?'}`, label: cid ? name(byId.get(cid)) : 'Card bills', kind: 'card', peer: cid }
  if (isRemitOut(t)) return { key: 'sent-home', label: `Sent to India${cid ? ` → ${name(byId.get(cid))}` : ''}`, kind: 'move', peer: cid }
  if (isNreToNro(t)) return { key: 'to-nro', label: `Moved to NRO${cid ? ` → ${name(byId.get(cid))}` : ''}`, kind: 'move', peer: cid }
  if (c === 'ATM Withdrawal') return { key: 'atm', label: 'ATM cash', kind: 'move', peer: cid }
  const g = spendGroup(t)
  if (g === 'loans') return { key: 'emi', label: 'Loan EMIs', kind: 'emi' }
  if (g === 'invest') return { key: 'invest', label: 'Invested', kind: 'invest' }
  if (g) return { key: `cat:${c}`, label: labelOf(c), kind: 'spend', category: c }
  if (cid) return { key: `to:${cid}`, label: `To ${name(byId.get(cid))}`, kind: 'move', peer: cid }
  return { key: `out:${c}`, label: labelOf(c), kind: 'move', peer: null }
}

// The other side of a move, on the account it reached (or left)
function describeCounter(t: any, a: any, c: any, inward: boolean): Desc {
  const peer = a?.id ?? null
  if (kindOf(c) === 'card') return { key: `paid-from:${peer ?? '?'}`, label: `Paid from ${name(a)}`, kind: 'payment', peer }
  if (inward) {
    if (isRemitOut(t)) return { key: 'from-uae', label: `Received from UAE${a ? ` ← ${a.name}` : ''}`, kind: 'move', peer }
    if (isNreToNro(t)) return { key: 'from-nre', label: `From NRE${a ? ` ← ${a.name}` : ''}`, kind: 'move', peer }
    if (catOf(t) === 'ATM Withdrawal') return { key: 'atm-in', label: 'ATM cash taken out', kind: 'move', peer }
    return { key: `from:${peer ?? '?'}`, label: `From ${name(a)}`, kind: 'move', peer }
  }
  if (catOf(t) === 'ATM Withdrawal') return { key: 'atm', label: 'ATM cash', kind: 'move', peer }
  if (isNreToNro(t)) return { key: 'to-nro', label: `Moved to NRO${a ? ` → ${a.name}` : ''}`, kind: 'move', peer }
  return { key: `to:${peer ?? '?'}`, label: `To ${name(a)}`, kind: 'move', peer }
}

const dayN = (d: string) => Math.floor(new Date(`${d.slice(0, 10)}T00:00:00Z`).getTime() / 864e5)
const near = (x: any, amount: number, date: string) =>
  Math.abs((Number(x.amount) || 0) - amount) <= Math.max(1, amount * 0.01) && Math.abs(dayN(x.txn_date) - dayN(date)) <= 4

// `inside(id)`: is that account on screen? A move to or from one that isn't
// (NRE in the UAE view, or no account at all) is money really leaving or arriving.
export function accountFlows(accounts: any[], txns: any[], fx: number, inPeriod: (date: string) => boolean,
  opts: { inside?: (id: string) => boolean } = {}): AccountFlow[] {
  const byId = new Map(accounts.map(a => [a.id, a]))
  const flows = new Map<string, { account: any; ins: Map<string, FlowLine>; outs: Map<string, FlowLine>; merch: Map<string, number> }>()
  const flowOf = (a: any) => {
    if (!flows.has(a.id)) flows.set(a.id, { account: a, ins: new Map(), outs: new Map(), merch: new Map() })
    return flows.get(a.id)!
  }
  const add = (a: any, inward: boolean, d: Desc, t: any, amount: number, merchant?: string, inr?: number) => {
    const external = d.kind === 'move' && !!opts.inside && !(d.peer && opts.inside(d.peer))
    const key = external ? `${d.key}|out-of-view` : d.key
    const f = flowOf(a), m = inward ? f.ins : f.outs
    const line = m.get(key) ?? { key, label: d.label, kind: d.kind, amount: 0, category: d.category, count: 0, external, txns: [] }
    line.amount += amount; line.count++; line.txns.push(t)
    if (inr != null) line.inr = (line.inr ?? 0) + inr
    m.set(key, line)
    if (d.kind === 'spend' && merchant) f.merch.set(merchant, (f.merch.get(merchant) ?? 0) + amount)
  }
  // As in the ledger: the other side isn't added where that account has its own record of the same money
  const realOn = new Map<string, any[]>()
  for (const t of txns) if (t.account_id) (realOn.get(t.account_id) ?? realOn.set(t.account_id, []).get(t.account_id)!).push(t)
  const recorded = (accId: string, amount: number, date: string, wantCredit: boolean, except: any) =>
    (realOn.get(accId) ?? []).some(x => x !== except && near(x, amount, date) && isCredit(x, byId.get(accId)) === wantCredit)
  const remits = pairRemittances(txns, fx)
  const remitOf = new Map(remits.filter(r => r.out).map(r => [r.out, r]))
  // A ₹ credit paired with an AED remittance: where it came from
  const sentFrom = new Map(remits.filter(r => r.in && r.out?.account_id).map(r => [r.in, r.out.account_id as string]))
  // Moves recorded on the sending side, by the account they reached — to find
  // where an own-account credit (e.g. "Self Transfer") came from
  const movesTo = new Map<string, any[]>()
  for (const t of txns) {
    const a = t.account_id ? byId.get(t.account_id) : null
    const cid = a ? counterOf(t, a, accounts) : null
    if (cid && cid !== t.account_id) (movesTo.get(cid) ?? movesTo.set(cid, []).get(cid)!).push(t)
  }

  for (const t of txns) {
    if (t._remit || !t.txn_date || !inPeriod(t.txn_date)) continue
    const amt = Number(t.amount) || 0
    if (!(amt > 0)) continue
    const a = t.account_id ? byId.get(t.account_id) ?? null : null
    const cid = counterOf(t, a, accounts)
    const credit = a ? isCredit(t, a) : t.txn_type === 'income'
    // No account: kept per currency so dirhams and rupees never add up together
    const own = a ?? { id: `__none__${t.currency}`, name: 'Not linked to an account', account_type: 'unlinked', currency: t.currency, _unlinked: true }
    const peer = credit && a ? (sentFrom.get(t) ?? (movesTo.get(a.id) ?? []).find(x => x.account_id !== a.id && near(x, amt, t.txn_date))?.account_id ?? null) : null
    const r = isRemitOut(t) ? remitOf.get(t) : undefined
    add(own, credit, describe(t, own, credit, cid, byId, peer), t, amt, t.merchant, r ? r.inr : undefined)
    // The other side of a move between your accounts
    const c = cid ? byId.get(cid) : null
    if (!c || c.id === a?.id) continue
    let camt = amt
    if (c.currency !== t.currency) {
      if (!r || (r.source === 'matched' && r.in?.account_id === c.id)) continue    // the ₹ credit is its own row
      camt = r.inr
    }
    const inward = !credit
    if (kindOf(c) === 'card' && !inward) continue
    if (c.currency === t.currency && recorded(c.id, camt, t.txn_date, inward, t)) continue
    add(c, inward, describeCounter(t, a, c, inward), t, camt)
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

// ── Grouped by account, month by month ──────────────────────────────────────
// The Expense report's table: bank accounts (each with what came in and every
// rupee or dirham that left it) and cards (what was bought on each), in the
// view's currency. Totals: came in − money out of your bank accounts = left in
// your accounts; moves between accounts on screen cancel out, moves to one
// off screen (UAE → India in the UAE view) are money out.
export interface GroupLine { key: string; label: string; kind: FlowKind; dir: 'in' | 'out'; external: boolean; category?: string; values: number[]; total: number; items: any[][] }
export interface GroupAccount {
  id: string; account: any; card: boolean
  lines: GroupLine[]
  head: number[]; headTotal: number      // banks: net change · cards: charged
  // What it held at the start of each month (a card: what was owed) and at
  // the end = start + in − out (a card: + charged − paid). null where the app
  // doesn't know the balance yet — never guessed.
  start: (number | null)[]; end: (number | null)[]
}
export interface AccountGroups {
  banks: GroupAccount[]; cards: GroupAccount[]
  income: number[]; otherIn: number[]; moneyOut: number[]; left: number[]
  charged: number[]; paidToCards: number[]; allSpend: number[]
  // Money out of your bank accounts, each type on its own
  byType: { spend: number[]; emi: number[]; invest: number[]; card: number[]; sentOut: number[] }
  // All bank accounts together, where every one's start is known (else null)
  startTotal: (number | null)[]; endTotal: (number | null)[]
  merchants: Record<string, { name: string; amount: number }[]>   // per account, over all the months
}
const BANK_OUT: FlowKind[] = ['spend', 'emi', 'invest', 'card']
// Money in first (income, then money from your other accounts); money out:
// spending, EMIs, investing, card bills, then moves to your other accounts
const ORDER: Record<string, number> = { income: 0, move: 1, spend: 2, emi: 3, invest: 4, card: 5, payment: 6, refund: 7 }
const rank = (l: GroupLine) => l.dir === 'out' && l.kind === 'move' ? 6 : ORDER[l.kind]

export function buildAccountGroups(accounts: any[], txns: any[], opts: { fx: number; months: string[]; view: View; toView: (n: number, cur: string) => number; today?: string }): AccountGroups {
  const { months, view } = opts
  const inView = (cur: string) => view === 'consolidated' || (view === 'uae' ? cur === 'AED' : cur !== 'AED')
  const shown = new Set(accounts.filter(a => inView(a.currency)).map(a => a.id))
  const inside = (id: string) => id.startsWith('__none__') ? inView(id.slice(8)) : shown.has(id)
  const n = months.length, zeros = () => Array<number>(n).fill(0)
  const accs = new Map<string, { account: any; lines: Map<string, GroupLine> }>()
  const merch = new Map<string, Map<string, number>>()
  const T = { income: zeros(), otherIn: zeros(), moneyOut: zeros(), charged: zeros(), paidToCards: zeros(), bankSpend: zeros(),
    emi: zeros(), invest: zeros(), card: zeros(), sentOut: zeros() }
  // Balances at the end of the day before each month starts (lib/ledger) — null where unknown
  const dayBefore = (m: string) => { const d = new Date(`${m}-01T00:00:00Z`); d.setUTCDate(0); return d.toISOString().slice(0, 10) }
  const opening = balancesAt(accounts, txns, opts.fx, months.map(dayBefore))

  months.forEach((m, i) => {
    for (const f of accountFlows(accounts, txns, opts.fx, d => d.slice(0, 7) === m, { inside })) {
      const a = f.account, cur = a.currency ?? 'INR'
      if (!inView(cur)) continue
      const card = kindOf(a) === 'card'
      const e = accs.get(a.id) ?? accs.set(a.id, { account: a, lines: new Map() }).get(a.id)!
      // Every line in the view's currency at one rate, so each account's
      // start + in − out = left adds up exactly
      const val = (l: FlowLine) => opts.toView(l.amount, cur)
      for (const [dir, ls] of [['in', f.ins], ['out', f.outs]] as const) for (const l of ls) {
        const k = `${dir}:${l.key}`
        const g = e.lines.get(k) ?? { key: k, label: l.label, kind: l.kind, dir, external: !!l.external, category: l.category, values: zeros(), total: 0, items: months.map(() => [] as any[]) }
        const v = val(l)
        g.values[i] += v; g.total += v; g.items[i].push(...l.txns)
        e.lines.set(k, g)
        if (card) {
          if (dir === 'out' && (l.kind === 'spend' || l.kind === 'emi')) T.charged[i] += v
          if (dir === 'in' && l.kind === 'payment') T.paidToCards[i] += v
        } else if (dir === 'in') {
          if (l.kind === 'income') T.income[i] += v
          else if (l.kind === 'move' && l.external) T.otherIn[i] += v
        } else if (BANK_OUT.includes(l.kind) || (l.kind === 'move' && l.external)) {
          T.moneyOut[i] += v
          if (l.kind === 'spend') T.bankSpend[i] += v
          else if (l.kind === 'emi') T.emi[i] += v
          else if (l.kind === 'invest') T.invest[i] += v
          else if (l.kind === 'card') T.card[i] += v
          else T.sentOut[i] += v
        }
      }
      const mm = merch.get(a.id) ?? merch.set(a.id, new Map()).get(a.id)!
      for (const x of f.merchants) mm.set(x.name, (mm.get(x.name) ?? 0) + opts.toView(x.amount, cur))
    }
  })

  const toGroup = (e: { account: any; lines: Map<string, GroupLine> }): GroupAccount => {
    const card = kindOf(e.account) === 'card'
    const lines = Array.from(e.lines.values()).sort((x, y) =>
      card ? (x.dir === y.dir ? 0 : x.dir === 'out' ? -1 : 1) || (rank(x) - rank(y)) || y.total - x.total
        : (x.dir === y.dir ? 0 : x.dir === 'in' ? -1 : 1) || (rank(x) - rank(y)) || y.total - x.total)
    const head = months.map((_, i) => card
      ? lines.filter(l => l.dir === 'out' && (l.kind === 'spend' || l.kind === 'emi')).reduce((s, l) => s + l.values[i], 0)
      : lines.reduce((s, l) => s + (l.dir === 'in' ? 1 : -1) * l.values[i], 0))
    // A bank: in adds, out takes off · a card: charges add to what's owed, payments take off
    const net = months.map((_, i) => lines.reduce((s, l) => s + (l.dir === 'in' ? 1 : -1) * (card ? -1 : 1) * l.values[i], 0))
    const cur = e.account.currency ?? 'INR'
    // A month that hasn't started yet has no starting balance
    const thisMonth = (opts.today ?? new Date().toISOString()).slice(0, 7)
    const start = months.map((m, i) => { const b = opening[e.account.id]?.[i]; return b == null || m > thisMonth ? null : opts.toView(b, cur) })
    return { id: e.account.id, account: e.account, card, lines, head, headTotal: head.reduce((s, v) => s + v, 0),
      start, end: start.map((b, i) => b == null ? null : b + net[i]) }
  }
  const all = Array.from(accs.values()).map(toGroup)
  const size = (g: GroupAccount) => g.lines.reduce((s, l) => s + l.total, 0)
  const banks = all.filter(g => !g.card).sort((x, y) => Number(!!x.account._unlinked) - Number(!!y.account._unlinked) || size(y) - size(x))
  const cards = all.filter(g => g.card).sort((x, y) => y.headTotal - x.headTotal)
  const cardSpend = months.map((_, i) => cards.reduce((s, g) => s + g.lines.filter(l => l.dir === 'out' && l.kind === 'spend').reduce((a, l) => a + l.values[i], 0), 0))
  const realBanks = banks.filter(g => !g.account._unlinked)
  const startTotal = months.map((_, i) => realBanks.length && realBanks.every(g => g.start[i] != null) ? realBanks.reduce((s, g) => s + (g.start[i] ?? 0), 0) : null)
  return {
    banks, cards,
    income: T.income, otherIn: T.otherIn, moneyOut: T.moneyOut,
    left: months.map((_, i) => T.income[i] + T.otherIn[i] - T.moneyOut[i]),
    charged: T.charged, paidToCards: T.paidToCards,
    allSpend: months.map((_, i) => T.bankSpend[i] + cardSpend[i]),
    byType: { spend: T.bankSpend, emi: T.emi, invest: T.invest, card: T.card, sentOut: T.sentOut },
    startTotal,
    endTotal: startTotal.map((st, i) => st == null ? null : st + T.income[i] + T.otherIn[i] - T.moneyOut[i]),
    merchants: Object.fromEntries(Array.from(merch.entries()).map(([id, mm]) => [id, Array.from(mm.entries()).sort((x, y) => y[1] - x[1]).slice(0, 3).map(([name, amount]) => ({ name, amount }))])),
  }
}
