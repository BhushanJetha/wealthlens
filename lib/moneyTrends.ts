// Money › Overview, month by month, in the view on screen: what came in (and
// from where), what was spent (by category, needs and wants, and where), card
// bills paid, and money sent from the UAE to India. The same rules as Home and
// Reports (lib/money): saved = income − spent − EMIs, card bills are a move,
// money landing from the UAE is income in the India view only.
import { isIncome, spendGroup, catOf, labelOf, CC_BILL, type View } from './money'
import { groupKeyOf, needOf, type Category } from './categories'

export interface MoneyMonth {
  income: number; incomeBy: Record<string, number>     // income group: earned / returns / extra
  spent: number; emi: number; invested: number
  groups: Record<string, number>; needs: number; wants: number
  merchants: Record<string, { name: string; amount: number; count: number }>
  cardBills: number; cardBillCount: number
  sentAed: number; sentInr: number; sentCount: number  // UAE → India, by the month it landed
  count: number                                        // entries counted (spending and income)
}
const blank = (): MoneyMonth => ({ income: 0, incomeBy: {}, spent: 0, emi: 0, invested: 0, groups: {}, needs: 0, wants: 0, merchants: {},
  cardBills: 0, cardBillCount: 0, sentAed: 0, sentInr: 0, sentCount: 0, count: 0 })

export function moneyMonths(prepared: any[], o: { months: string[]; view: View; fx: number; rows?: Category[]; cardIds?: Set<string> }): MoneyMonth[] {
  const at = new Map(o.months.map((m, i) => [m, i]))
  const out = o.months.map(blank)
  const rows = o.rows ?? [], cards = o.cardIds ?? new Set<string>()
  // In view, in the view's currency: a country on its own, or both in rupees at today's rate
  const val = (t: any) => {
    const v = Number(t.amount) || 0
    if (o.view === 'consolidated') return t.currency === 'AED' ? v * o.fx : v
    return (o.view === 'uae') === (t.currency === 'AED') ? v : null
  }
  for (const t of prepared) {
    const i = at.get(String(t.txn_date).slice(0, 7))
    if (i == null) continue
    const m = out[i]
    // Money from the UAE landing in India: counted as sent in every view
    if (t._remit) {
      if (t._aed) { m.sentAed += Number(t._aed) || 0; m.sentCount++ }
      m.sentInr += Number(t.amount) || 0
      if (isIncome(t, o.view)) { const v = Number(t.amount) || 0; m.income += v; m.incomeBy.earned = (m.incomeBy.earned ?? 0) + v; m.count++ }
      continue
    }
    const v = val(t)
    if (v == null || !(v > 0)) continue
    if (isIncome(t, o.view)) {
      const g = groupKeyOf(catOf(t), rows, 'income') ?? 'extra'
      m.income += v; m.incomeBy[g] = (m.incomeBy[g] ?? 0) + v; m.count++
      continue
    }
    // Card bills paid from the bank (the card side of the same payment isn't counted again)
    const onCard = !!t.account_id && cards.has(t.account_id)
    if ((catOf(t) === CC_BILL || t._cardSpend) && !onCard && t.txn_type !== 'income') {
      const bill = t._cardSpend ? Number(t._billAmount) || v : v
      m.cardBills += o.view === 'consolidated' && t.currency === 'AED' && t._cardSpend ? bill * o.fx : bill
      m.cardBillCount++
    }
    const g = spendGroup(t)
    if (!g) continue
    if (g === 'loans') { m.emi += v; continue }
    if (g === 'invest') { m.invested += v; continue }
    m.spent += v; m.count++
    const c = catOf(t), k = groupKeyOf(c, rows) ?? 'other'
    m.groups[k] = (m.groups[k] ?? 0) + v
    if (needOf(c, rows) === false) m.wants += v; else m.needs += v
    const name = String(t.merchant || labelOf(c)).trim() || labelOf(c), key = name.toLowerCase()
    const e = m.merchants[key] ?? (m.merchants[key] = { name, amount: 0, count: 0 })
    e.amount += v; e.count++
  }
  return out
}

// Several months added together
export function sumMonths(ms: MoneyMonth[]): MoneyMonth {
  const s = blank()
  for (const m of ms) {
    for (const k of ['income', 'spent', 'emi', 'invested', 'needs', 'wants', 'cardBills', 'cardBillCount', 'sentAed', 'sentInr', 'sentCount', 'count'] as const) (s as any)[k] += m[k]
    for (const [k, v] of Object.entries(m.incomeBy)) s.incomeBy[k] = (s.incomeBy[k] ?? 0) + v
    for (const [k, v] of Object.entries(m.groups)) s.groups[k] = (s.groups[k] ?? 0) + v
    for (const [k, e] of Object.entries(m.merchants)) { const x = s.merchants[k] ?? (s.merchants[k] = { name: e.name, amount: 0, count: 0 }); x.amount += e.amount; x.count += e.count }
  }
  return s
}

// The biggest categories over some months; the rest as one "Everything else"
export function topGroups(ms: MoneyMonth[], n = 5): { keys: string[]; rest: boolean } {
  const tot: Record<string, number> = {}
  for (const m of ms) for (const [k, v] of Object.entries(m.groups)) tot[k] = (tot[k] ?? 0) + v
  const all = Object.entries(tot).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).map(([k]) => k)
  return { keys: all.slice(0, all.length > n + 1 ? n : n + 1), rest: all.length > n + 1 }
}
