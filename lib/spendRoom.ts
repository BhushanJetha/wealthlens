// How much more you can spend, category by category, in one currency: what's
// left of each flexible budget, or (with no budget) a rough allowance from your
// last 3 months, and never more than what's actually free to spend (safe to
// spend: bank & cash minus what's due before payday). Fixed costs aren't here;
// they're already taken off as dues.
import { budgetLines, carryIn, spendByCategory, suggestCaps, spentOn, FIXED } from './budgets'
import { classify } from './money'
import { ymOf } from './insights'

type Cur = 'AED' | 'INR'
export interface RoomLine { category: string; cap: number; spent: number; left: number; room: number; estimated: boolean }
export interface SpendRoom { cur: Cur; safe: number; lines: RoomLine[]; totalLeft: number; tight: boolean }

export function spendRoom(inp: { today: string; cur: Cur; budgets: any[]; txns: any[]; safe: number }): SpendRoom {
  const { today, cur, budgets, txns, safe } = inp
  const month = ymOf(today), spend = spendByCategory(txns, month, cur)
  const free = Math.max(0, safe)
  const line = (category: string, cap: number, estimated: boolean): RoomLine => {
    const spent = spentOn(spend, category), left = cap - spent
    return { category, cap, spent, left, room: Math.max(0, Math.min(left, free)), estimated }
  }
  const budgeted = budgetLines(budgets, spend, month, cur, { carry: carryIn(budgets, txns, month, cur) })
    .filter(l => !FIXED.has(l.category) && !l.inside && l.cap > 0).map(l => line(l.category, l.cap, false))
  const have = new Set(budgeted.map(l => l.category))
  const estimated = Object.entries(suggestCaps(txns, cur, month))
    .filter(([c]) => !have.has(c) && !FIXED.has(c) && c !== 'Transfer' && classify(c) === 'expense')
    .map(([c, s]) => line(c, s.cap, true))
  const lines = [...budgeted, ...estimated].sort((a, b) => Number(a.estimated) - Number(b.estimated) || b.left - a.left)
  const totalLeft = lines.reduce((s, l) => s + Math.max(0, l.left), 0)
  return { cur, safe, lines, totalLeft, tight: totalLeft > free }
}
