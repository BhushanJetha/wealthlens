// Expense and income categories: the built-in list every account starts
// with, and which of them the app's maths depends on. Users' own lists live
// in the `categories` table (migration 024) — see store/categoryStore.

export type CatKind = 'expense' | 'income'
export interface Category {
  id: string; kind: CatKind; name: string; color: string; icon: string; sort_order: number
}

// [name, colour, icon] — icon keys are in components/ui/CategoryIcon
type Def = [string, string, string]
const EXPENSE: Def[] = [
  ['Food', '#F29A2E', 'utensils'], ['Shopping', '#3B8EF0', 'shopping-bag'], ['Utilities', '#7C3AED', 'zap'],
  ['Transport', '#2FB67C', 'car'], ['Health', '#DC2626', 'heart-pulse'], ['Personal Care', '#DB2777', 'sparkles'],
  ['Entertainment', '#EC5B8C', 'clapperboard'], ['Travel', '#0891B2', 'plane'], ['Trip/Vacation', '#0D9488', 'tree-palm'],
  ['Event/Function', '#C026D3', 'party-popper'], ['Education', '#2563EB', 'graduation-cap'], ['Subscription', '#6A55E8', 'repeat'],
  ['Investment', '#16A34A', 'trending-up'], ['Tax Payment', '#BE123C', 'landmark'], ['EMI/Loan', '#EA580C', 'banknote'],
  ['Loan on Card', '#D97706', 'credit-card'], ['Credit Card Payment', '#9333EA', 'credit-card'], ['Family Transfer', '#0EA5E9', 'users'],
  ['Refund', '#059669', 'undo'], ['Other', '#64748B', 'more'],
]
const INCOME: Def[] = [
  ['Salary', '#16A34A', 'briefcase'], ['UAE Income (NRO)', '#15803D', 'building'], ['NRE Received', '#0284C7', 'arrow-down-left'],
  ['Dividend', '#3B8EF0', 'coins'], ['Interest', '#0369A1', 'percent'], ['FD/RD Maturity', '#0891B2', 'piggy-bank'],
  ['Rental', '#7C3AED', 'home'], ['Gift', '#EC5B8C', 'gift'], ['Bonus', '#F29A2E', 'sparkles'], ['Tax Refund', '#059669', 'receipt'],
  ['Freelance', '#EA580C', 'wallet'], ['NRI Transfer', '#0EA5E9', 'hand-coins'], ['Loan Taken', '#6366F1', 'banknote'],
  ['Refund', '#059669', 'undo'], ['Other', '#64748B', 'more'],
]

export const DEFAULT_CATEGORIES: Category[] = [
  ...EXPENSE.map(([name, color, icon], i) => ({ id: `default:expense:${name}`, kind: 'expense' as const, name, color, icon, sort_order: i })),
  ...INCOME.map(([name, color, icon], i) => ({ id: `default:income:${name}`, kind: 'income' as const, name, color, icon, sort_order: i })),
]

// Categories the app's maths reads by name (card bills, loans, investments,
// money movements, NRO income…). They can be recoloured but not renamed or
// deleted, or totals elsewhere would silently change.
const SYSTEM: Record<CatKind, Set<string>> = {
  expense: new Set(['Credit Card Payment', 'Loan on Card', 'EMI/Loan', 'Investment', 'Family Transfer', 'Refund', 'Other']),
  income:  new Set(['Salary', 'UAE Income (NRO)', 'NRE Received', 'NRI Transfer', 'FD/RD Maturity', 'Loan Taken', 'Refund', 'Other']),
}
export const isSystemCategory = (kind: CatKind, name: string) => SYSTEM[kind].has(name)

export const CATEGORY_COLORS = ['#6A55E8', '#3B8EF0', '#2FB67C', '#F29A2E', '#EC5B8C', '#0891B2', '#D97706', '#DC2626', '#7C3AED', '#16A34A', '#DB2777', '#64748B']

// Colour for any category name, including ones not in the list (imports)
export function colorOf(rows: Category[], name: string, fallback = '#64748B') {
  return rows.find(r => r.name === name)?.color
    ?? DEFAULT_CATEGORIES.find(r => r.name === name)?.color
    ?? fallback
}
