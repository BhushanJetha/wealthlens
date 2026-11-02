// Whole family: each person is worked out on their own, by the same rules as
// their own screens, and only then added up. (Mixing everyone's rows first would
// let one person's credit pair with another's transfer, and a card bill lose
// track of its card.) The one thing that crosses people: money sent from one to
// the other is a move, not spending and income.
import { computeNetWorth, groupAssets, type Holdings } from './netWorth'
import { buildHomeInsights, daysBetween, type CatRow } from './insights'
import { catOf, isUnknownTransfer, type View } from './money'
import { buildDues, type Due } from './moneyOverview'
import { kindOf } from './ledger'

export interface FamilyPerson {
  id: string; name: string; isMe: boolean
  holdings: Holdings; transactions: any[]; insurance: any[]; budgets: any[]; recurring: any[]
}
export interface FamilyMove { from: string; to: string; amount: number; currency: string; date: string; label: string }

const PLAIN_IN = new Set(['Other', 'Transfer', 'Gift', 'Self Transfer', ''])
const SENT = (t: any) => t.account_id && t.txn_type !== 'income' && (isUnknownTransfer(t) || catOf(t) === 'Family Transfer')

// Money out of one person's account and the same amount (±0.5%) into another's,
// the day before up to 3 days after. Each row is used once; the closest date wins.
// Those rows become moves here. Saved data isn't touched.
export function familyMoves(people: FamilyPerson[]): { people: FamilyPerson[]; moves: FamilyMove[] } {
  const moved = new Set<string>(), moves: FamilyMove[] = []
  const owner = new Map<any, FamilyPerson>()
  const ins: any[] = []
  for (const p of people) for (const t of p.transactions) {
    if (t.account_id && t.txn_type === 'income' && PLAIN_IN.has(String(t.category ?? '').trim())) { ins.push(t); owner.set(t, p) }
  }
  for (const p of people) for (const o of [...p.transactions].filter(SENT).sort((a, b) => String(a.txn_date).localeCompare(String(b.txn_date)))) {
    const amt = Number(o.amount) || 0
    let best: any = null, gap = Infinity
    for (const i of ins) {
      if (moved.has(i.id) || owner.get(i) === p || i.currency !== o.currency) continue
      const g = daysBetween(o.txn_date, i.txn_date)
      if (g < -1 || g > 3 || Math.abs((Number(i.amount) || 0) - amt) > Math.max(1, amt * 0.005)) continue
      if (Math.abs(g) < gap) { best = i; gap = Math.abs(g) }
    }
    if (!best) continue
    moved.add(best.id); moved.add(o.id)
    moves.push({ from: p.name, to: owner.get(best)!.name, amount: amt, currency: o.currency, date: String(o.txn_date).slice(0, 10), label: o.merchant || 'Transfer' })
  }
  if (!moves.length) return { people, moves }
  const asMove = (t: any) => moved.has(t.id) ? { ...t, category: 'Self Transfer', sub_category: null, txn_type: t.txn_type === 'income' ? 'income' : 'transfer' } : t
  return { people: people.map(p => ({ ...p, transactions: p.transactions.map(asMove) })), moves: moves.sort((a, b) => b.date.localeCompare(a.date)) }
}

// The category table matches "Spent": investing and home payments have their own lines
const spendsMoney = (c: string) => c !== 'Investment' && c !== 'Home purchase'

export interface PersonFigures {
  person: FamilyPerson; netWorth: number; owned: number; owed: number; cash: number; investments: number; invested: number
  cards: number; loans: number; cameIn: number; spent: number; saved: number; investedThisMonth: number
  categories: CatRow[]; assets: { key: string; label: string; value: number }[]
}
export function personFigures(p: FamilyPerson, o: { view: View; fx: number; today: string; month: string }): PersonFigures {
  const nw = computeNetWorth(p.holdings, o.view, o.fx)
  const ins = buildHomeInsights({
    view: o.view, fx: o.fx, today: o.today, focusMonth: o.month, txns: p.transactions, accounts: p.holdings.accounts, loans: p.holdings.loans,
    insurance: p.insurance, fixedDeposits: p.holdings.fixedDeposits, budgets: p.budgets, mutualFunds: p.holdings.mutualFunds, stocks: p.holdings.stocks,
    cash: nw.cash, invested: nw.investments,
  })
  const owedOn = (key: string) => nw.liabRows.find(r => r.key === key)?.value ?? 0
  return {
    person: p, netWorth: nw.netWorth, owned: nw.totalAssets, owed: nw.totalLiab, cash: nw.cash, investments: nw.investments.value, invested: nw.investments.cost,
    cards: owedOn('cards'), loans: owedOn('loans'), cameIn: ins.income.value, spent: ins.spend.value, saved: ins.saved.value, investedThisMonth: ins.saved.invest,
    categories: ins.categories.filter(c => spendsMoney(c.cat)), assets: groupAssets(nw.assetRows).map(g => ({ key: g.key, label: g.label, value: g.value })),
  }
}

// Rows of a by-person table: each person's value and the family's total, biggest first
export interface ByPerson { key: string; label: string; values: number[]; total: number }
export function byPerson(figures: PersonFigures[], rows: (f: PersonFigures) => { key: string; label: string; value: number }[]): ByPerson[] {
  const m = new Map<string, ByPerson>()
  figures.forEach((f, i) => {
    for (const r of rows(f)) {
      const e = m.get(r.key) ?? { key: r.key, label: r.label, values: figures.map(() => 0), total: 0 }
      e.values[i] += r.value; e.total += r.value
      m.set(r.key, e)
    }
  })
  return Array.from(m.values()).filter(e => Math.abs(e.total) > 0.5).sort((a, b) => b.total - a.total)
}

// Recent spending across everyone, tagged with whose it is
export function familyRecent(people: FamilyPerson[], limit = 8) {
  const out = people.flatMap(p => p.transactions.filter(t => t.txn_type !== 'income' && t.category !== 'Self Transfer').map(t => ({ t, who: p.name, isMe: p.isMe })))
  return out.sort((a, b) => String(b.t.txn_date).localeCompare(String(a.t.txn_date))).slice(0, limit)
}

// What's due from each person's own accounts in the coming days
export function familyDues(people: FamilyPerson[], o: { view: View; today: string; days?: number }): (Due & { who: string })[] {
  const out: (Due & { who: string })[] = []
  for (const p of people) {
    const cards = new Set(p.holdings.accounts.filter((a: any) => kindOf(a) === 'card').map((a: any) => a.id))
    const dues = buildDues({ today: o.today, days: o.days ?? 7, view: o.view, txns: p.transactions, accounts: p.holdings.accounts, loans: p.holdings.loans, insurance: p.insurance,
      mutualFunds: p.holdings.mutualFunds, recurring: p.recurring, rds: p.holdings.recurringDeposits })
    for (const d of dues) if (!(d.payFrom && cards.has(d.payFrom))) out.push({ ...d, who: p.name })
  }
  return out.sort((a, b) => a.date.localeCompare(b.date))
}
