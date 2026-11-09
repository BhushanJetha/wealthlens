// How big your emergency fund should be, from your own spending: six months
// of essentials (needs + EMIs — the wants you'd stop in a bad month are left
// out, lib/categories), per currency. It's worked out over the last
// 6, 12 and (when there's that much history) 24 complete months; the target
// uses the higher of the 6- and 12-month averages, so a recent rise is
// covered. It grows each year by how much your spending grew year on year
// (with two years of history), else by typical price rises.
import { monthMoney, addMonths } from './budgets'
import type { Category } from './categories'

type Cur = 'AED' | 'INR'
export const COVER_MONTHS = 6
const PRICES: Record<Cur, number> = { INR: 6, AED: 3 }

export interface EmergencyWindow { months: number; have: number; monthly: number; target: number }
export interface EmergencyAdvice {
  windows: EmergencyWindow[]          // only windows with enough months of data
  basis: EmergencyWindow | null       // the one the target comes from
  target: number                      // COVER_MONTHS × basis monthly
  growth: number                      // % a year
  growthFrom: 'spending' | 'prices'
  nextYear: number
}

export function emergencyAdvice(prepared: any[], today: string, cur: Cur, rows: Category[] = []): EmergencyAdvice {
  const thisMonth = today.slice(0, 7)
  const months = Array.from({ length: 24 }, (_, i) => monthMoney(prepared, addMonths(thisMonth, -(i + 1)), cur, rows))
  const used = (x: ReturnType<typeof monthMoney>) => x.income > 0 || x.spent > 0 || x.emi > 0
  const avg = (from: number, n: number) => {
    const ms = months.slice(from, from + n).filter(used)
    return { have: ms.length, monthly: ms.length ? ms.reduce((s, x) => s + x.spent - x.wants + x.emi, 0) / ms.length : 0 }
  }
  // A window counts when at least three quarters of its months have money in them
  const windows = [6, 12, 24].map(n => ({ months: n, ...avg(0, n) }))
    .filter(w => w.have >= Math.ceil(w.months * 0.75) && w.monthly > 0)
    .map(w => ({ ...w, target: w.monthly * COVER_MONTHS }))
  const recent = windows.filter(w => w.months <= 12)
  const basis = (recent.length ? recent : windows).reduce<EmergencyWindow | null>((b, w) => (!b || w.monthly > b.monthly ? w : b), null)
  const last = avg(0, 12), prev = avg(12, 12)
  const fromSpending = last.have >= 9 && prev.have >= 9 && prev.monthly > 0
  const growth = fromSpending ? Math.min(25, Math.max(0, Math.round((last.monthly / prev.monthly - 1) * 1000) / 10)) : PRICES[cur]
  const target = basis?.target ?? 0
  return { windows, basis, target, growth, growthFrom: fromSpending ? 'spending' : 'prices', nextYear: target * (1 + growth / 100) }
}
