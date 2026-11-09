// Expense and income categories. Two levels: a fixed set of categories
// (Food, Transport…) and the sub-categories under each (Groceries, Fuel…).
// A transaction stores the sub-category's name; its category comes from the
// built-in list below, or for one you added, from the `parent` you gave it
// (migration 045). Users' own lists live in the `categories` table (migration
// 024) — see store/categoryStore.

export type CatKind = 'expense' | 'income'
export interface Category {
  id: string; kind: CatKind; name: string; color: string; icon: string; sort_order: number
  parent?: string | null      // a group key (below), for a sub-category you added
  need?: boolean | null       // your own need / want choice, over the built-in one
}

// ── The fixed categories ────────────────────────────────────────────────────
// Spending first, then money out that isn't spending (EMIs, investing), then
// income. They can't be renamed or removed, so every total adds up the same way.
export type GroupKey = 'home' | 'food' | 'bills' | 'transport' | 'health' | 'family' | 'personal' | 'leisure' | 'fees' | 'giving' | 'other'
  | 'emi' | 'invest' | 'earned' | 'returns' | 'extra'
export interface Group { key: GroupKey; kind: CatKind; label: string; color: string; icon: string; spending: boolean }
export const GROUPS: Group[] = [
  { key: 'home',      kind: 'expense', label: 'Home',             color: '#0F766E', icon: 'home',           spending: true },
  { key: 'food',      kind: 'expense', label: 'Food',             color: '#F29A2E', icon: 'utensils',       spending: true },
  { key: 'bills',     kind: 'expense', label: 'Bills',            color: '#7C3AED', icon: 'zap',            spending: true },
  { key: 'transport', kind: 'expense', label: 'Transport',        color: '#0891B2', icon: 'car',            spending: true },
  { key: 'health',    kind: 'expense', label: 'Health',           color: '#DC2626', icon: 'heart-pulse',    spending: true },
  { key: 'family',    kind: 'expense', label: 'Family & kids',    color: '#2563EB', icon: 'users',          spending: true },
  { key: 'personal',  kind: 'expense', label: 'Personal',         color: '#DB2777', icon: 'sparkles',       spending: true },
  { key: 'leisure',   kind: 'expense', label: 'Leisure',          color: '#EC5B8C', icon: 'clapperboard',   spending: true },
  { key: 'fees',      kind: 'expense', label: 'Fees & taxes',     color: '#BE123C', icon: 'landmark',       spending: true },
  { key: 'giving',    kind: 'expense', label: 'Giving',           color: '#C026D3', icon: 'gift',           spending: true },
  { key: 'other',     kind: 'expense', label: 'Other',            color: '#64748B', icon: 'more',           spending: true },
  { key: 'emi',       kind: 'expense', label: 'EMIs',             color: '#EA580C', icon: 'banknote',       spending: false },
  { key: 'invest',    kind: 'expense', label: 'Investing',        color: '#16A34A', icon: 'trending-up',    spending: false },
  { key: 'earned',    kind: 'income',  label: 'Earned',           color: '#16A34A', icon: 'briefcase',      spending: false },
  { key: 'returns',   kind: 'income',  label: 'From investments', color: '#0369A1', icon: 'percent',        spending: false },
  { key: 'extra',     kind: 'income',  label: 'Other income',     color: '#7E22CE', icon: 'coins',          spending: false },
]
export const groupByKey = (k: string | null | undefined) => GROUPS.find(g => g.key === k) ?? null
export const SPEND_GROUP_KEYS = GROUPS.filter(g => g.spending).map(g => g.key)

// ── The built-in sub-categories ─────────────────────────────────────────────
// [name, colour, icon, category, need] — icon keys are in components/ui/CategoryIcon.
// need: true = a need, false = a want, null = not spending. Names are what
// transactions store, so the older ones (Food, Travel & transport, Health)
// stay: each is its category's "general" line for anything not split further.
type Def = [string, string, string, GroupKey | null, boolean | null]
const EXPENSE: Def[] = [
  ['Food', '#F29A2E', 'utensils', 'food', true], ['Groceries', '#EA8A1E', 'cart', 'food', true],
  ['Eating out', '#F59E0B', 'coffee', 'food', false], ['Delivery', '#D97706', 'utensils', 'food', false],
  ['Shopping', '#3B8EF0', 'shopping-bag', 'personal', false], ['Clothes', '#DB2777', 'shirt', 'personal', false],
  ['Personal Care', '#EC4899', 'sparkles', 'personal', false], ['Sports & fitness', '#BE185D', 'dumbbell', 'personal', false],
  ['Rent', '#0F766E', 'home', 'home', true], ['Maintenance', '#0D9488', 'wrench', 'home', true],
  ['Household help', '#14B8A6', 'users', 'home', true], ['Furnishing', '#0E7490', 'home', 'home', false],
  ['Utilities', '#7C3AED', 'zap', 'bills', true], ['Mobile & internet', '#8B5CF6', 'wifi', 'bills', true], ['Subscription', '#6A55E8', 'repeat', 'bills', false],
  ['Travel & transport', '#0891B2', 'car', 'transport', true], ['Fuel', '#0E7490', 'fuel', 'transport', true],
  ['Taxi & metro', '#06B6D4', 'bus', 'transport', true], ['Salik', '#0284C7', 'car', 'transport', true],
  ['Parking & fines', '#155E75', 'receipt', 'transport', true], ['Car service', '#0369A1', 'wrench', 'transport', true],
  ['Health', '#DC2626', 'heart-pulse', 'health', true], ['Medicines', '#EF4444', 'pill', 'health', true], ['Health insurance', '#B91C1C', 'heart-pulse', 'health', true],
  ['Education', '#2563EB', 'graduation-cap', 'family', true], ['Childcare', '#3B82F6', 'baby', 'family', true], ['Family Transfer', '#0EA5E9', 'users', 'family', true],
  ['Entertainment', '#EC5B8C', 'clapperboard', 'leisure', false], ['Holidays', '#0D9488', 'tree-palm', 'leisure', false], ['Flights', '#0369A1', 'plane', 'leisure', false],
  ['Tax Payment', '#BE123C', 'landmark', 'fees', true], ['Visa & ID fees', '#9F1239', 'receipt', 'fees', true],
  ['Insurance', '#E11D48', 'receipt', 'fees', true], ['Bank charges', '#881337', 'banknote', 'fees', true],
  ['Gifts', '#C026D3', 'gift', 'giving', false], ['Donations & zakat', '#A21CAF', 'hand-coins', 'giving', false], ['Event/Function', '#D946EF', 'party-popper', 'giving', false],
  ['EMI/Loan', '#EA580C', 'banknote', 'emi', null], ['Loan on Card', '#D97706', 'credit-card', 'emi', null],
  ['Investment', '#16A34A', 'trending-up', 'invest', null], ['Home purchase', '#15803D', 'building', 'invest', null],
  // Not spending: a card bill is a transfer, a refund is money back
  ['Credit Card Payment', '#9333EA', 'credit-card', null, null], ['Refund', '#059669', 'undo', null, null],
  ['Other', '#64748B', 'more', 'other', true],
]
const INCOME: Def[] = [
  ['Salary', '#16A34A', 'briefcase', 'earned', null], ['Bonus', '#F29A2E', 'sparkles', 'earned', null],
  ['Allowances & reimbursements', '#0D9488', 'wallet', 'earned', null], ['Freelance', '#EA580C', 'wallet', 'earned', null],
  ['End-of-service gratuity', '#15803D', 'piggy-bank', 'earned', null],
  ['Interest', '#0369A1', 'percent', 'returns', null], ['Dividend', '#3B8EF0', 'coins', 'returns', null],
  ['Rental', '#7C3AED', 'home', 'returns', null], ['Capital gains', '#16A34A', 'trending-up', 'returns', null],
  ['Gift', '#EC5B8C', 'gift', 'extra', null], ['Tax Refund', '#059669', 'receipt', 'extra', null],
  ['Cashback & rewards', '#D97706', 'coins', 'extra', null], ['One-off income', '#6A55E8', 'coins', 'extra', null],
  ['Refund', '#059669', 'undo', 'extra', null], ['Other', '#64748B', 'more', 'extra', null],
  // Not income — your own money arriving; kept for old transactions
  ['UAE Income (NRO)', '#15803D', 'building', null, null], ['NRE Received', '#0284C7', 'arrow-down-left', null, null],
  ['FD/RD Maturity', '#0891B2', 'piggy-bank', null, null], ['NRI Transfer', '#0EA5E9', 'hand-coins', null, null],
  ['Loan Taken', '#6366F1', 'banknote', null, null],
]

export const DEFAULT_CATEGORIES: Category[] = [
  ...EXPENSE.map(([name, color, icon], i) => ({ id: `default:expense:${name}`, kind: 'expense' as const, name, color, icon, sort_order: i })),
  ...INCOME.map(([name, color, icon], i) => ({ id: `default:income:${name}`, kind: 'income' as const, name, color, icon, sort_order: i })),
]
const key = (kind: CatKind, name: string) => `${kind}|${String(name ?? '').trim().toLowerCase()}`
const BUILT_IN = new Map<string, Def>([...EXPENSE.map(d => [key('expense', d[0]), d] as const), ...INCOME.map(d => [key('income', d[0]), d] as const)])
export const isBuiltIn = (kind: CatKind, name: string) => BUILT_IN.has(key(kind, name))

// Every built-in name is fixed: the totals, the statement readers and your
// rules find them by name. They can be recoloured (and given another need /
// want), and are added for everyone who doesn't have them yet.
export const isSystemCategory = (kind: CatKind, name: string) => isBuiltIn(kind, name)

// The "general" line of a category: what isn't split further
const GENERAL = new Set(['Food', 'Travel & transport', 'Health', 'Other'])
export const isGeneral = (name: string) => GENERAL.has(name)

// Rows that aren't one of your categories at all, as the report names them
// (lib/money catOf): transfers still to sort, money sent to family, a card
// bill standing in for card purchases that weren't imported
const ROW_GROUP: Record<string, GroupKey> = { Transfer: 'other', 'NRO to Family': 'family', 'Card spending (not itemised)': 'other' }

// Which category a sub-category belongs to. null: not spending or income at
// all (a card bill, a move between your accounts, money back). An expense name
// that's neither built in nor given a category is Other.
export function groupKeyOf(name: string, rows: Category[] = [], kind: CatKind = 'expense'): GroupKey | null {
  const d = BUILT_IN.get(key(kind, name))
  if (d) return d[3]
  if (kind === 'expense' && ROW_GROUP[name]) return ROW_GROUP[name]
  // Salary sent home, as it lands in India (the India view's income)
  if (kind === 'income' && name === 'Received from UAE') return 'earned'
  const row = rows.find(r => r.kind === kind && key(kind, r.name) === key(kind, name))
  const g = groupByKey(row?.parent)
  if (g && g.kind === kind) return g.key
  return kind === 'expense' ? 'other' : 'extra'
}
export const groupOf = (name: string, rows: Category[] = [], kind: CatKind = 'expense') => groupByKey(groupKeyOf(name, rows, kind))

// Need (true) or want (false) for spending; null for anything that isn't.
// Your choice in Settings wins over the built-in one.
export function needOf(name: string, rows: Category[] = []): boolean | null {
  const g = groupOf(name, rows)
  if (!g?.spending) return null
  const row = rows.find(r => r.kind === 'expense' && key('expense', r.name) === key('expense', name))
  if (row?.need != null) return row.need
  const d = BUILT_IN.get(key('expense', name))
  return d ? d[4] ?? true : true
}

// ── Investing, by what it went into ─────────────────────────────────────────
// Every investment is saved under the one name Investment (the SIP and RD
// automations, the Mutual funds page and the dues look for it), with its kind
// in sub_category. The kind is that, or what the automations save (SIP, RD,
// Lumpsum, Stock Purchase), else read from the merchant.
export const INVEST_KINDS = ['Mutual funds', 'Stocks', 'Fixed deposit', 'Recurring deposit', 'Gold', 'PPF & NPS', 'Insurance plans', 'Other investing'] as const
export type InvestKind = typeof INVEST_KINDS[number]
export const INVEST_KIND_ICON: Record<InvestKind, string> = {
  'Mutual funds': 'trending-up', Stocks: 'coins', 'Fixed deposit': 'landmark', 'Recurring deposit': 'repeat', Gold: 'coins',
  'PPF & NPS': 'piggy-bank', 'Insurance plans': 'receipt', 'Other investing': 'more',
}
const KIND_SUB: Record<string, InvestKind> = { sip: 'Mutual funds', lumpsum: 'Mutual funds', 'stock purchase': 'Stocks', rd: 'Recurring deposit', fd: 'Fixed deposit' }
const KIND_RULES: [RegExp, InvestKind][] = [
  [/\brd\b|recurring\s*deposit/i, 'Recurring deposit'],
  [/\bfd\b|fixed\s*deposit|term\s*deposit/i, 'Fixed deposit'],
  [/\blic\b|ulip|endowment|life\s*insurance|sbi\s*life|hdfc\s*life|max\s*life|pru(?:dential)?\s*life|policy\s*prem/i, 'Insurance plans'],
  [/\bppf\b|\bnps\b|\bepf\b|\bvpf\b|pension/i, 'PPF & NPS'],
  [/gold|\bsgb\b|sovereign/i, 'Gold'],
  [/\bsip\b|mutual\s*fund|\bmf\b|lumpsum|elss|kuvera|paytm\s*money|\bcoin\b|bse\s*star|\bcams\b|kfin/i, 'Mutual funds'],
  [/stock|shares?\b|equity|\betf\b|zerodha|upstox|angel\s*one|icici\s*direct|hdfc\s*sec|kotak\s*sec|interactive\s*brokers|sarwa|\bnse\b|\bbse\b|groww/i, 'Stocks'],
]
export function investKindOf(t: { sub_category?: string | null; merchant?: string | null; description?: string | null }): InvestKind {
  const sub = String(t?.sub_category ?? '').trim()
  const named = INVEST_KINDS.find(k => k.toLowerCase() === sub.toLowerCase())
  if (named) return named
  if (KIND_SUB[sub.toLowerCase()]) return KIND_SUB[sub.toLowerCase()]
  const text = `${sub} ${t?.merchant ?? ''} ${t?.description ?? ''}`
  return KIND_RULES.find(([re]) => re.test(text))?.[1] ?? 'Other investing'
}

// Kept for old transactions, but not offered when picking: money that isn't
// spending or income is recorded as a transfer (card bill, UAE → India,
// NRE → NRO) or comes in on its own (loan money, investments paying out)
const NOT_PICKED: Record<CatKind, Set<string>> = {
  expense: new Set(['Refund']),
  income:  new Set(['UAE Income (NRO)', 'NRE Received', 'NRI Transfer', 'Loan Taken', 'FD/RD Maturity']),
}
export const isPickable = (kind: CatKind, name: string) => !NOT_PICKED[kind].has(name)

// For pickers: each category with its sub-categories, in order — built-in
// ones first, then yours. Only categories of this kind; not-pickable names left out.
export function groupedCategories(rows: Category[], kind: CatKind): { group: Group; items: Category[] }[] {
  const list = rows.filter(r => r.kind === kind && isPickable(kind, r.name))
  return GROUPS.filter(g => g.kind === kind).map(g => ({
    group: g,
    items: list.filter(r => groupKeyOf(r.name, rows, kind) === g.key)
      .sort((a, b) => Number(!isBuiltIn(kind, a.name)) - Number(!isBuiltIn(kind, b.name)) || Number(isGeneral(b.name)) - Number(isGeneral(a.name)) || a.sort_order - b.sort_order),
  })).filter(x => x.items.length)
}

export const CATEGORY_COLORS = ['#6A55E8', '#3B8EF0', '#2FB67C', '#F29A2E', '#EC5B8C', '#0891B2', '#D97706', '#DC2626', '#7C3AED', '#16A34A', '#DB2777', '#64748B']

// Colour for any category name, including ones not in the list (imports)
export function colorOf(rows: Category[], name: string, fallback = '#64748B') {
  return rows.find(r => r.name === name)?.color
    ?? DEFAULT_CATEGORIES.find(r => r.name === name)?.color
    ?? fallback
}
