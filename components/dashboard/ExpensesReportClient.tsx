'use client'
import { useMemo, useState, useEffect } from 'react'
import { useViewStore } from '@/store/viewStore'
import Link from 'next/link'
import { Download, ChevronLeft, ChevronRight, CalendarDays, CalendarRange, Target, CreditCard, Landmark, Wallet, Link2Off, AlertTriangle, ArrowRight, Copy } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, Cell, Legend } from 'recharts'
import TxnDrillModal from '@/components/dashboard/TxnDrillModal'
import AccountGroupTable from '@/components/dashboard/AccountGroupTable'
import MergeAccountsSheet from '@/components/dashboard/MergeAccountsSheet'
import { duplicateAccounts } from '@/lib/accountMerge'
import { buildAccountGroups } from '@/lib/accountFlows'
import { CC_BILL, classify, labelOf, catOf, prepareMoney, isIncome, isNreToNro, markUnitemisedCardBills, expandSplits, INDIA_INCOME, cashOut, cashLeft, type CashOut } from '@/lib/money'
import { findReviewItems, type ReviewKind } from '@/lib/review'
import { PageHeader, KpiTile, Segmented } from '@/components/ui/kit'
import { useCategoryStore } from '@/store/categoryStore'
import { nriKindOf, methodOf, PAY_METHODS, type PayMethod } from '@/lib/ledger'

// ─── Utilities ────────────────────────────────────────────────────────────────
function momChange(curr: number, prev: number): number | null {
  return prev === 0 ? null : Math.round((curr - prev) / prev * 100)
}

const CAT_COLORS: Record<string,string> = {
  Food:'#D97706', Shopping:'#2563EB', Utilities:'#7C3AED', Transport:'#16A34A',
  Health:'#059669', Entertainment:'#E11D48', Travel:'#EA580C', Education:'#0284C7',
  Subscription:'#EC4899', 'Personal Care':'#DB2777', 'EMI/Loan':'#9333EA', Investment:'#0EA5E9', 'Tax Payment':'#BE123C',
  'Trip/Vacation':'#0D9488', 'Event/Function':'#C026D3', 'Travel & transport':'#0891B2',
  Transfer:'#3B7DD8', Other:'#6B7280', 'Family Transfer':'#0EA5E9',
  'Credit Card Payment':'#9333EA', 'International Transfer':'#0EA5E9', 'NRE Received':'#0284C7',
  'NRE to NRO':'#7C5CBF', 'Self Transfer':'#0891B2', 'Loan on Card':'#F59E0B', 'Loan Received':'#F97316', Refund:'#10B981',
}
// Spend classification (movement / card-bill / spend) lives in lib/money.ts so
// the Home dashboard counts spend exactly the way this report does.
const CC_COLOR = '#9333EA'

const FALLBACK_PALETTE = ['#6366F1','#DB2777','#0D9488','#CA8A04','#C2640A','#475569','#B45309','#7C3AED']
const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

// Which account a transaction ran through. Strict binary split so NRE + NRO =
// everything (no overlap / double-count).
type Scope = 'both' | 'nre' | 'nro'
const NRE_CATS = new Set(['NRE Received', 'NRE to NRO', 'NRE → NRO', 'International Transfer', INDIA_INCOME])
function acctScope(t: any): 'nre' | 'nro' {
  const cat = t?.category || ''
  const sub = t?.sub_category || ''
  // The auto-linked NRO inflow is NRO-side income (check first — it's spread
  // from an NRE→NRO transfer so it still carries sub_category "Internal").
  if (cat === 'UAE Income (NRO)') return 'nro'
  // Money that runs THROUGH the NRE account regardless of what row it's linked
  // to: received from UAE into NRE, or moved from NRE out to NRO.
  if (NRE_CATS.has(cat) || sub === 'Internal' || sub === 'International') return 'nre'
  return nriKindOf(t?.accounts) === 'nre' ? 'nre' : 'nro'
}

// One country's money in a period: what came in (plus, for India, what
// arrived from UAE) and what left its bank & cash (lib/money cashOut)
type Side = { cur: 'AED' | 'INR'; income: number; received: number; flow: CashOut }
const NO_FLOW: CashOut = { direct: 0, cardBills: 0, emis: 0, invested: 0, sentHome: 0, onCards: 0, cardLoanEmis: 0, friends: 0 }
const sumFlows = (fs: CashOut[]): CashOut => fs.reduce((a, f) => ({ direct: a.direct + f.direct, cardBills: a.cardBills + f.cardBills,
  emis: a.emis + f.emis, invested: a.invested + f.invested, sentHome: a.sentHome + f.sentHome, onCards: a.onCards + f.onCards,
  cardLoanEmis: a.cardLoanEmis + f.cardLoanEmis, friends: a.friends + f.friends }), NO_FLOW)
const sideLeft = (x: Side) => cashLeft(x.income + x.received, x.flow)

function buildMonths(from: string, to: string): string[] {
  const months: string[] = []; let cur = from
  while (cur <= to && months.length < 60) {
    months.push(cur)
    const [y, m] = cur.split('-').map(Number)
    const d = new Date(y, m, 1)
    cur = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  }
  return months
}
function fmt(n: number): string {
  if (n === 0) return '—'
  const s = Math.abs(n)
  if (s >= 100000) return `${(n / 100000).toFixed(1)}L`
  if (s >= 1000)   return `${(n / 1000).toFixed(0)}K`
  return String(Math.round(n))
}
function csvExport(rows: string[][]): void {
  const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv' }); const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.download = 'expense_report.csv'; a.click()
  URL.revokeObjectURL(url)
}

type Tab = 'monthly' | 'yearly' | 'budget'

export default function ExpensesReportClient({ transactions: rawTxns, incomeTransactions: rawIncome = [], budgets = [], accounts = [] }:
  { transactions: any[]; incomeTransactions?: any[]; budgets?: any[]; accounts?: any[] }) {
  const { view, fromMonth, toMonth, fxRate: FX } = useViewStore()
  // Card bills count only when that month's card purchases weren't imported
  const transactions = useMemo(() => markUnitemisedCardBills(expandSplits(rawTxns),
    new Set(rawTxns.filter((t: any) => t.accounts?.account_type === 'credit_card').map((t: any) => t.account_id))), [rawTxns])

  const inView = (cur: string) => view === 'consolidated' || (view === 'uae' ? cur === 'AED' : cur === 'INR')
  const conv = (amt: number, cur: string) => view === 'consolidated' && cur === 'AED' ? amt * FX : amt
  const disp = (t: any) => inView(t.currency) ? conv(Number(t.amount) || 0, t.currency) : 0
  const sym = view === 'uae' ? 'AED ' : '₹'
  const money = (n: number) => `${sym}${Math.round(n).toLocaleString('en-IN')}`
  const signed = (n: number) => `${n < 0 ? '−' : ''}${money(Math.abs(n))}`
  const mLabel = (m: string) => new Date(m + '-01').toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })

  // Colours follow the user's own categories (same as Expenses and Reports)
  const { rows: userCats, load: loadCats } = useCategoryStore()
  useEffect(() => { loadCats() }, [loadCats])
  const colorOf = (cat: string, idx: number) => userCats.find(r => r.name === cat)?.color ?? CAT_COLORS[cat] ?? FALLBACK_PALETTE[idx % FALLBACK_PALETTE.length]

  const [tab, setTab] = useState<Tab>('monthly')
  // Yearly: by category (default) or by the account it was paid from
  const [byPay, setByPay] = useState(false)
  const [scope, setScope] = useState<Scope>('both')
  const inScope = (t: any) => scope === 'both' || t._nroIn || acctScope(t) === scope
  // Income in this view (lib/money): earned income, plus money landing in NRE
  // from UAE in the India view. For the NRO account alone, its inflow is what
  // moved in from NRE.
  const incomeTransactions = useMemo(() => {
    const all = [...rawIncome, ...rawTxns]
    const counted = prepareMoney(all, { fx: FX }).filter(t => isIncome(t, view))
    return scope === 'nro'
      ? [...counted.filter(t => !t._remit), ...all.filter(isNreToNro).map(t => ({ ...t, _nroIn: true }))]
      : counted
  }, [rawIncome, rawTxns, FX, view, scope])
  const [viewYear, setViewYear] = useState(() => parseInt(fromMonth.slice(0, 4)))
  const [drill, setDrill] = useState<{ title: string; subtitle?: string; items: any[] } | null>(null)
  useEffect(() => { setViewYear(parseInt(fromMonth.slice(0, 4))) }, [fromMonth])

  const yearFrom = `${viewYear}-01`, yearTo = `${viewYear}-12`
  const months = buildMonths(yearFrom, yearTo)

  const yearTxns = useMemo(() => transactions.filter(t => {
    const m = t.txn_date?.slice(0, 7) ?? ''
    return m >= yearFrom && m <= yearTo && inView(t.currency) && inScope(t)
  }), [transactions, viewYear, view, scope])

  // category → month → amount (all fetched txns for the year)
  const pivot = useMemo(() => {
    const map: Record<string, Record<string, number>> = {}
    yearTxns.forEach(t => {
      const m = t.txn_date?.slice(0, 7); if (!m) return
      const cat = catOf(t)
      if (!map[cat]) map[cat] = {}
      map[cat][m] = (map[cat][m] ?? 0) + disp(t)
    })
    return map
  }, [yearTxns, view, FX])

  const cats = useMemo(() => Object.keys(pivot), [pivot])
  const expenseCats  = cats.filter(c => classify(c) === 'expense')
  const excludedCats = cats.filter(c => classify(c) === 'excluded')

  const colTot = (list: string[], m: string) => list.reduce((a, c) => a + (pivot[c]?.[m] ?? 0), 0)
  const rowTot = (c: string) => months.reduce((a, m) => a + (pivot[c]?.[m] ?? 0), 0)
  const outflowCol  = (m: string) => colTot(expenseCats, m)

  // Income per month (view/FX aware) from income txns + auto-linked NRO settlements
  const incByMonth = useMemo(() => {
    const map: Record<string, number> = {}
    incomeTransactions.forEach(t => {
      const m = t.txn_date?.slice(0, 7); if (!m || !inView(t.currency) || !inScope(t)) return
      map[m] = (map[m] ?? 0) + conv(Number(t.amount) || 0, t.currency)
    })
    return map
  }, [incomeTransactions, view, FX, scope])
  const incomeCol = (m: string) => incByMonth[m] ?? 0
  const netCol = (m: string) => incomeCol(m) - outflowCol(m)

  // What left your bank & cash each month, and what's left of the income
  // (lib/money cashOut): card bills paid come off, not the card charges they
  // pay for — those are in the expenses above, so nothing is taken off twice.
  // Each country is its own side: in the All view money sent to India comes
  // off the UAE side and arrives on the India side, so it neither vanishes nor doubles.
  const isCardRow = (t: any) => t.accounts?.account_type === 'credit_card'
  const landedRows = useMemo(() => view === 'consolidated' ? prepareMoney([...rawIncome, ...rawTxns], { fx: FX }).filter(t => t._remit) : [],
    [rawIncome, rawTxns, FX, view])
  const sideCurs: ('AED' | 'INR')[] = view === 'uae' ? ['AED'] : view === 'india' ? ['INR'] : ['AED', 'INR']
  const sidesByMonth = useMemo(() => {
    const rows: Record<string, any[]> = {}, inc: Record<string, number> = {}, landed: Record<string, number> = {}
    yearTxns.forEach(t => { const m = t.txn_date?.slice(0, 7); if (m) (rows[`${t.currency}|${m}`] ||= []).push(t) })
    incomeTransactions.forEach(t => {
      const m = t.txn_date?.slice(0, 7); if (!m || !inView(t.currency) || !inScope(t)) return
      inc[`${t.currency}|${m}`] = (inc[`${t.currency}|${m}`] ?? 0) + conv(Number(t.amount) || 0, t.currency)
    })
    landedRows.forEach(t => { const m = t.txn_date?.slice(0, 7); if (m && inScope(t)) landed[m] = (landed[m] ?? 0) + (Number(t.amount) || 0) })
    return Object.fromEntries(months.map(m => [m, sideCurs.map(c => ({
      cur: c, income: inc[`${c}|${m}`] ?? 0, received: c === 'INR' ? landed[m] ?? 0 : 0,
      flow: cashOut(rows[`${c}|${m}`] ?? [], { view: c === 'AED' ? 'uae' : 'india', isCard: isCardRow, amount: disp }),
    }))])) as Record<string, Side[]>
  }, [yearTxns, incomeTransactions, landedRows, view, FX, scope])
  const flowByMonth = useMemo(() => Object.fromEntries(months.map(m => [m, sumFlows(sidesByMonth[m].map(x => x.flow))])) as Record<string, CashOut>, [sidesByMonth])
  // NRE alone: what moved on to NRO left it too
  const toNro = (m: string) => scope !== 'nre' ? 0 : yearTxns.filter(t => t.txn_date?.slice(0, 7) === m && isNreToNro(t)).reduce((a, t) => a + disp(t), 0)
  const leftCol = (m: string) => sidesByMonth[m].reduce((a, x) => a + sideLeft(x), 0) - toNro(m)

  const outflowGrand  = months.reduce((a, m) => a + outflowCol(m), 0)
  const incomeGrand   = months.reduce((a, m) => a + incomeCol(m), 0)
  const netGrand      = incomeGrand - outflowGrand
  const investGrand   = rowTot('Investment')
  const savingsRate   = incomeGrand > 0 ? Math.round((netGrand + investGrand) / incomeGrand * 100) : 0   // investing counts as saved
  const leftGrand     = months.reduce((a, m) => a + leftCol(m), 0)

  // The grouped table (lib/accountFlows): every bank account (what came in,
  // every rupee or dirham that left) and every card (what was bought on it),
  // month by month in the view's currency. Phones show the month picked at the top.
  // Rows as saved: a card bill always lowers its card here, even in a month
  // whose card purchases weren't imported
  const groups = useMemo(() => buildAccountGroups(accounts, [...rawIncome, ...rawTxns], { fx: FX, months, view, toView: conv }),
    [accounts, rawIncome, rawTxns, FX, view, viewYear]) // eslint-disable-line react-hooks/exhaustive-deps
  const focusMonth = months.includes(toMonth) ? toMonth : months.includes(fromMonth) ? fromMonth : months[months.length - 1]
  const focus = months.indexOf(focusMonth)
  const viewNote = (a: any) => [a.currency === 'AED' ? (view === 'consolidated' ? 'UAE · AED in ₹' : 'UAE') : 'India', a.is_active === false ? 'closed' : null].filter(Boolean).join(' · ')
  const started = groups.startTotal[focus], ended = groups.endTotal[focus]

  // Anything this year that can put the numbers off (the same checks as
  // Review): transfers not sorted, no account, a move missing its other
  // account, likely duplicates, the wrong currency
  const gaps = useMemo(() => {
    const today = new Date().toLocaleDateString('en-CA')
    const items = findReviewItems([...rawIncome, ...rawTxns], { today, fx: FX, accounts, since: `${yearFrom}-01` })
      .filter(i => i.date <= `${yearTo}-31` && inView(i.txns[0]?.currency ?? 'INR'))
    const by: Partial<Record<ReviewKind, { n: number; amount: number }>> = {}
    for (const i of items) {
      const rows = i.kind === 'duplicate' ? i.txns.slice(0, 1) : i.txns.filter((t: any) => t.txn_date >= `${yearFrom}-01` && t.txn_date <= `${yearTo}-31`)
      const g = (by[i.kind] ||= { n: 0, amount: 0 })
      g.n += rows.length
      g.amount += rows.reduce((a: number, t: any) => a + conv(Number(t.amount) || 0, t.currency), 0)
    }
    return by
  }, [rawIncome, rawTxns, FX, accounts, viewYear, view]) // eslint-disable-line react-hooks/exhaustive-deps
  const GAP_TEXT: [ReviewKind, string, string][] = [
    ['transfer', 'transfer', 'not sorted — counted as money sent'],
    ['account', 'transaction', 'with no account — no balance moves'],
    ['counter', 'move', "that doesn't say which of your accounts it went to"],
    ['duplicate', 'possible duplicate', 'counted twice'],
    ['currency', 'amount', "in a different currency from its account"],
    ['remit', 'transfer to India', 'with no ₹ credit found'],
  ]
  const gapList = GAP_TEXT.filter(([k]) => gapN(k))

  // The same account on file twice (usually deleted — which only closes it —
  // and added again): its history is split over two rows. Shown when both
  // records have transactions, or both are open.
  const [merging, setMerging] = useState<any[] | null>(null)
  const dups = useMemo(() => {
    const used = new Set([...rawTxns, ...rawIncome].map((t: any) => t.account_id).filter(Boolean))
    return duplicateAccounts(accounts.filter((a: any) => inView(a.currency ?? 'INR'))).map(d => [d.keep, ...d.dupes])
      .filter(g => g.filter(a => used.has(a.id)).length > 1 || g.filter(a => a.is_active !== false).length > 1)
  }, [accounts, rawTxns, rawIncome, view]) // eslint-disable-line react-hooks/exhaustive-deps
  function gapN(k: ReviewKind) { return gaps[k]?.n ?? 0 }

  const activeExpense  = expenseCats.filter(c => rowTot(c) > 0).sort((a, b) => rowTot(b) - rowTot(a))
  const activeExcluded = excludedCats.filter(c => rowTot(c) > 0).sort((a, b) => rowTot(b) - rowTot(a))
  const ccBillGrand    = rowTot(CC_BILL)
  const hasMonthlyRows = activeExpense.length > 0 || activeExcluded.length > 0 || ccBillGrand > 0


  // Budget caps (current-month) in the view currency
  const budgetCapMap = useMemo(() => {
    const map: Record<string, number> = {}
    budgets.forEach((b: any) => {
      const cur = b.currency || 'INR'; if (!inView(cur)) return
      map[b.category] = (map[b.category] ?? 0) + conv(Number(b.monthly_cap) || 0, cur)
    })
    return map
  }, [budgets, view, FX])
  const budgetCats = Object.keys(budgetCapMap).filter(c => budgetCapMap[c] > 0)
    .sort((a, b) => budgetCapMap[b] - budgetCapMap[a])

  // Multi-year aggregation for the Yearly tab
  const yearAgg = useMemo(() => {
    const years = new Set<string>()
    transactions.forEach(t => t.txn_date && years.add(t.txn_date.slice(0, 4)))
    incomeTransactions.forEach(t => t.txn_date && years.add(t.txn_date.slice(0, 4)))
    const agg: Record<string, { income: number; outflow: number }> = {}
    years.forEach(y => agg[y] = { income: 0, outflow: 0 })
    transactions.forEach(t => {
      const y = t.txn_date?.slice(0, 4); if (!y || !agg[y] || !inView(t.currency) || !inScope(t)) return
      if (classify(catOf(t)) === 'expense') agg[y].outflow += disp(t)
    })
    incomeTransactions.forEach(t => {
      const y = t.txn_date?.slice(0, 4); if (!y || !agg[y] || !inView(t.currency) || !inScope(t)) return
      agg[y].income += conv(Number(t.amount) || 0, t.currency)
    })
    return agg
  }, [transactions, incomeTransactions, view, FX, scope])
  const yearsSorted = Object.keys(yearAgg).sort()

  // Category × year matrix for the Yearly tab (rows = categories/Income, cols = years)
  const catYear = useMemo(() => {
    const matrix: Record<string, Record<string, number>> = {}
    const inc: Record<string, number> = {}
    transactions.forEach(t => {
      const y = t.txn_date?.slice(0, 4); if (!y || !inView(t.currency) || !inScope(t)) return
      if (classify(catOf(t)) !== 'expense') return
      const cat = catOf(t)
      if (!matrix[cat]) matrix[cat] = {}
      matrix[cat][y] = (matrix[cat][y] ?? 0) + disp(t)
    })
    incomeTransactions.forEach(t => {
      const y = t.txn_date?.slice(0, 4); if (!y || !inView(t.currency) || !inScope(t)) return
      inc[y] = (inc[y] ?? 0) + conv(Number(t.amount) || 0, t.currency)
    })
    const list = Object.keys(matrix).sort((a, b) =>
      Object.values(matrix[b]).reduce((x, v) => x + v, 0) - Object.values(matrix[a]).reduce((x, v) => x + v, 0))
    return { matrix, inc, list }
  }, [transactions, incomeTransactions, view, FX, scope])
  const payYear = useMemo(() => {
    const accById = new Map(accounts.map((a: any) => [a.id, a]))
    const rows: Record<string, { key: string; name: string; method: PayMethod; byYear: Record<string, number>; total: number }> = {}
    transactions.forEach(t => {
      const y = t.txn_date?.slice(0, 4); if (!y || !inView(t.currency) || !inScope(t)) return
      if (classify(catOf(t)) !== 'expense') return
      const a = t.account_id ? accById.get(t.account_id) : null, key = a ? a.id : 'none', v = disp(t)
      const r = rows[key] ??= { key, name: a ? a.name : 'Not linked to an account', method: methodOf(t, accById), byYear: {}, total: 0 }
      r.byYear[y] = (r.byYear[y] ?? 0) + v; r.total += v
    })
    return PAY_METHODS.map(m => {
      const list = Object.values(rows).filter(r => r.method === m.key).sort((a, b) => b.total - a.total)
      const byYear: Record<string, number> = {}
      list.forEach(r => Object.entries(r.byYear).forEach(([y, v]) => { byYear[y] = (byYear[y] ?? 0) + v }))
      return { ...m, label: m.key === 'card' ? 'Credit cards' : m.key === 'bank' ? 'Bank accounts' : m.label, list, byYear, total: list.reduce((a, r) => a + r.total, 0) }
    }).filter(g => g.list.length)
  }, [transactions, incomeTransactions, view, FX, scope])

  const barData = months.map(m => ({
    month: MONTH_NAMES[Number(m.slice(5)) - 1],
    Expenses: Math.round(outflowCol(m)),
    Income: Math.round(incomeCol(m)),
  }))

  function handleExport() {
    const monthHeads = months.map(m => `${MONTH_NAMES[Number(m.slice(5)) - 1]} ${m.slice(0, 4)}`)
    const vals = (v: number[]) => [...v.map(x => Math.round(x).toString()), Math.round(v.reduce((a, b) => a + b, 0)).toString()]
    const rows: string[][] = []
    for (const [title, list] of [['BANK ACCOUNTS', groups.banks], ['CREDIT CARDS', groups.cards]] as const) {
      if (!list.length) continue
      rows.push([title, ...vals(title === 'BANK ACCOUNTS' ? groups.moneyOut : groups.charged)])
      for (const g of list) {
        rows.push([`${g.account.name} (${g.card ? 'charged' : 'net change'})`, ...vals(g.head)])
        const bal = (v: (number | null)[]) => [...v.map(x => x == null ? '' : Math.round(x).toString()), '']
        if (g.start.some(v => v != null)) rows.push([`   ${g.card ? 'Owed at the start' : 'Started the month with'}`, ...bal(g.start)])
        for (const l of g.lines) rows.push([`   ${g.card ? '' : l.dir === 'in' ? '+ ' : '− '}${l.label}`, ...vals(l.values)])
        if (g.end.some(v => v != null)) rows.push([`   ${g.card ? '= Owed at the end' : '= Left at the end of the month'}`, ...bal(g.end)])
      }
    }
    rows.push([], ['CAME IN', ...vals(groups.income)])
    if (groups.otherIn.some(Boolean)) rows.push(['OTHER MONEY IN', ...vals(groups.otherIn)])
    const T = groups.byType
    rows.push(['− SPENDING FROM BANK & CASH', ...vals(T.spend)], ['− EMIS', ...vals(T.emi)], ['− INVESTING', ...vals(T.invest)], ['− CARD BILLS', ...vals(T.card)], ['− SENT OUTSIDE THESE ACCOUNTS', ...vals(T.sentOut)],
      ['= CAME IN − WENT OUT', ...vals(groups.left)])
    if (groups.startTotal.some(v => v != null)) rows.splice(rows.findIndex(r => r[0] === 'CAME IN'), 0, ['STARTED THE MONTH WITH', ...groups.startTotal.map(x => x == null ? '' : Math.round(x).toString()), ''])
    if (groups.endTotal.some(v => v != null)) rows.push(['= LEFT AT THE END OF THE MONTH', ...groups.endTotal.map(x => x == null ? '' : Math.round(x).toString()), ''])
    rows.push(['SPENT ON CARDS', ...vals(groups.charged)], ['ALL SPENDING (bank + cards)', ...vals(groups.allSpend)])
    csvExport([['', ...monthHeads, 'Total'], ...rows])
  }

  const TABS: { key: Tab; label: string; icon: any }[] = [
    { key: 'monthly', label: 'Monthly', icon: CalendarDays },
    { key: 'yearly',  label: 'Yearly',  icon: CalendarRange },
    { key: 'budget',  label: 'Budget',  icon: Target },
  ]

  // Reusable: a category × month table body
  // `muted` = shown for tracking but not summed into the total
  const MonthCells = ({ cat, color, muted = false }: { cat: string; color: string; muted?: boolean }) => (
    <>
      {months.map(m => {
        const val = pivot[cat]?.[m] ?? 0
        const inSel = m >= fromMonth && m <= toMonth
        return (
          <td key={m} className="px-3 py-2.5 text-right tabular-nums"
            style={{ color: val > 0 && !muted ? 'var(--text)' : 'var(--text3)', background: inSel ? `${color}08` : 'transparent', fontWeight: val > 0 && !muted ? 600 : 400 }}>
            {val > 0
              ? <button onClick={() => setDrill({ title: labelOf(cat), subtitle: mLabel(m), items: yearTxns.filter((t: any) => catOf(t) === cat && t.txn_date?.slice(0, 7) === m) })} className="hover:underline" style={{ color: 'inherit' }}>{sym}{fmt(val)}</button>
              : '—'}
          </td>
        )
      })}
    </>
  )

  return (
    <div className="flex flex-col gap-3.5 md:gap-[18px] animate-fade-up">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
        <PageHeader title="Expense report"
          sub={<>{view === 'uae' ? 'UAE · AED' : view === 'india' ? 'India · INR' : 'Consolidated · INR'}{scope !== 'both' && <> · <b>{scope.toUpperCase()} account only</b></>} · every category, month by month</>} />
        <div className="flex items-center gap-2">
          <div className="inline-flex items-center rounded-xl bg-white" style={{ border: '1px solid var(--line)', height: 38 }}>
            <button onClick={() => setViewYear(y => y - 1)} aria-label="Previous year" className="w-9 h-full flex items-center justify-center" style={{ color: 'var(--text2)' }}><ChevronLeft size={16} /></button>
            <span className="px-2 text-[13px] font-semibold tabular-nums" style={{ color: 'var(--text)' }}>{viewYear}</span>
            <button onClick={() => setViewYear(y => y + 1)} aria-label="Next year" className="w-9 h-full flex items-center justify-center" style={{ color: 'var(--text2)' }}><ChevronRight size={16} /></button>
          </div>
          <button onClick={handleExport} className="wl-btn" style={{ height: 38 }}><Download size={14} />CSV</button>
        </div>
      </div>

      <div className="flex items-center justify-between flex-wrap gap-2">
        <Segmented label="Report view" value={tab} onChange={setTab}
          options={TABS.map(({ key, label, icon: Icon }) => ({ value: key, label: <span className="inline-flex items-center gap-1.5"><Icon size={13} />{label}</span> }))} />
        {tab !== 'monthly' && <Segmented label="Account" value={scope} onChange={setScope}
          options={[{ value: 'both' as Scope, label: 'NRE + NRO' }, { value: 'nre' as Scope, label: 'NRE' }, { value: 'nro' as Scope, label: 'NRO' }]} />}
      </div>

      {tab === 'monthly' && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 md:gap-3.5">
          {started != null && <KpiTile label={`Started ${mLabel(focusMonth)} with`} value={signed(started)} tint={0} icon={Landmark}
            delta="all bank and cash balances" />}
          <KpiTile label={`Came in · ${mLabel(focusMonth)}`} value={money((groups.income[focus] ?? 0) + (groups.otherIn[focus] ?? 0))} tint={1} icon={Wallet}
            delta={groups.otherIn[focus] ? `incl. ${money(groups.otherIn[focus])} from outside these accounts` : 'salary and other income'} />
          <KpiTile label="Went out of your bank accounts" value={money(groups.moneyOut[focus] ?? 0)} tint={0} icon={Landmark}
            delta="spending, EMIs, investing, card bills, money sent" />
          {ended != null
            ? <KpiTile label="Left at the end of the month" value={signed(ended)} tint={3} icon={Target}
                tone={ended >= 0 ? 'good' : 'bad'} delta={`${(groups.left[focus] ?? 0) < 0 ? '−' : '+'}${money(Math.abs(groups.left[focus] ?? 0))} over the month`} />
            : <KpiTile label="Came in − went out" value={signed(groups.left[focus] ?? 0)} tint={3} icon={Target}
                tone={(groups.left[focus] ?? 0) >= 0 ? 'good' : 'bad'} delta="start balances not known for this month" />}
          {started == null && <KpiTile label="Charged to cards" value={money(groups.charged[focus] ?? 0)} tint={2} icon={CreditCard}
            delta="paid through the card bills" />}
        </div>
      )}
      {tab === 'monthly' && dups.map(g => (
        <div key={g[0].id} className="wl-card px-4 py-3 flex flex-col md:flex-row md:items-center gap-2.5 md:gap-4" style={{ background: '#F5F3FF', borderColor: '#DDD6FE' }}>
          <div className="flex items-start gap-2.5 min-w-0 flex-1">
            <Copy size={16} className="flex-shrink-0 mt-0.5" style={{ color: 'var(--accent)' }} />
            <div className="min-w-0">
              <div className="text-[13px] font-semibold" style={{ color: 'var(--accent2)' }}>{g[0].name} is on file {g.length === 2 ? 'twice' : `${g.length} times`}</div>
              <div className="text-[12.5px] mt-0.5" style={{ color: '#5B4BB7' }}>
                {g.some(a => a.is_active === false) ? 'One was deleted and added again — its older transactions still sit on the closed one' : 'Two records for the same account'}, so it shows as {g.length} rows. Merge them into one.
              </div>
            </div>
          </div>
          <button onClick={() => setMerging(g)} className="wl-btn wl-btn-primary flex-shrink-0 self-start md:self-center" style={{ height: 36 }}>Merge</button>
        </div>
      ))}
      {tab === 'monthly' && gapList.length > 0 && (
        <div className="wl-card px-4 py-3 flex flex-col md:flex-row md:items-center gap-2.5 md:gap-4" style={{ background: '#FFF8EC', borderColor: '#F6DDB4' }}>
          <div className="flex items-start gap-2.5 min-w-0 flex-1">
            <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" style={{ color: '#B96A0B' }} />
            <div className="min-w-0">
              <div className="text-[13px] font-semibold" style={{ color: '#7A4A06' }}>A few things in {viewYear} can put these numbers off</div>
              <ul className="mt-1 flex flex-col gap-0.5">
                {gapList.map(([k, one, what]) => (
                  <li key={k} className="text-[12.5px]" style={{ color: '#8A5A12' }}>
                    <b>{gapN(k)} {one}{gapN(k) === 1 ? '' : 's'}</b> {what}{gaps[k]!.amount > 0 && k !== 'duplicate' ? <> · {money(gaps[k]!.amount)}</> : null}
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <Link href={`/dashboard/money/review?from=${yearFrom}`} className="wl-btn flex-shrink-0 self-start md:self-center" style={{ height: 36 }}>
            Fix in Review <ArrowRight size={14} />
          </Link>
        </div>
      )}
      {tab === 'budget' && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 md:gap-3.5">
          <KpiTile label={`${viewYear} income`} value={money(incomeGrand)} tint={1} icon={Wallet} />
          <KpiTile label={`${viewYear} expenses`} value={money(outflowGrand)} tint={0} icon={CreditCard} />
          <KpiTile label="Left in your accounts" value={`${leftGrand < 0 ? '−' : ''}${money(Math.abs(leftGrand))}`} tone={leftGrand >= 0 ? 'good' : 'bad'} tint={3} icon={Landmark}
            delta={leftGrand >= 0 ? 'income − what left your bank & cash' : 'more left your accounts than came in'} />
          <KpiTile label="Savings rate" value={`${savingsRate}%`} tone={savingsRate >= 20 ? 'good' : 'bad'} tint={2} icon={Target}
            delta={investGrand > 0 ? `incl. ${money(investGrand)} invested · target 20%` : 'target 20%'} />
        </div>
      )}

      {/* ─────────────── MONTHLY TAB ─────────────── */}
      {tab === 'monthly' && (
        <>
          <AccountGroupTable groups={groups} months={months} focus={focus} cell={(n: number) => `${sym}${fmt(n)}`} money={money} viewNote={viewNote}
            sentLabel={view === 'uae' ? 'Sent to India & other money out' : 'Sent outside these accounts'}
            colorOf={(c?: string) => (c ? colorOf(c, 0) : '#6A55E8')} isHighlighted={(m: string) => m >= fromMonth && m <= toMonth}
            onDrill={(title, subtitle, items) => setDrill({ title, subtitle, items })} />

          {/* Income vs Expense bar */}
          <div className="wl-card px-4 md:px-5 py-4 md:py-[18px]">
            <div className="flex justify-between items-center gap-3 mb-3">
              <h2 className="text-[14px] md:text-[15px] font-semibold" style={{ color: 'var(--text)' }}>Income vs expenses · {viewYear}</h2>
              <div className="flex gap-3.5 text-[11.5px]" style={{ color: 'var(--text3)' }}>
                <span className="flex items-center gap-1.5"><i className="w-[9px] h-[9px] rounded-sm" style={{ background: '#2FB67C' }} />Income</span>
                <span className="flex items-center gap-1.5"><i className="w-[9px] h-[9px] rounded-sm" style={{ background: '#6A55E8' }} />Expenses</span>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={210}>
              <BarChart data={barData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }} barGap={3}>
                <CartesianGrid stroke="var(--track)" vertical={false} />
                <XAxis dataKey="month" tick={{ fill: '#94A3B8', fontSize: 10.5 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#94A3B8', fontSize: 10 }} axisLine={false} tickLine={false} width={40}
                  tickFormatter={(v: number) => v >= 100000 ? `${(v / 100000).toFixed(0)}L` : v >= 1000 ? `${(v / 1000).toFixed(0)}K` : String(v)} />
                <Tooltip cursor={{ fill: 'rgba(106,85,232,0.06)' }} contentStyle={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 10, fontSize: 12 }}
                  formatter={(v: any, n: any) => [`${sym}${Number(v).toLocaleString('en-IN')}`, n]} />
                <Bar dataKey="Income" fill="#2FB67C" radius={[4, 4, 0, 0]} maxBarSize={18} isAnimationActive={false} />
                <Bar dataKey="Expenses" fill="#6A55E8" radius={[4, 4, 0, 0]} maxBarSize={18} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Category share */}
          {activeExpense.length > 0 && (
            <div className="wl-card px-4 md:px-5 py-4 md:py-[18px]">
              <div className="text-[14px] md:text-[15px] font-semibold mb-3" style={{ color: 'var(--text)' }}>Where it goes — {viewYear}</div>
              <div className="space-y-2">
                {activeExpense.map((cat, ci) => {
                  const pct = outflowGrand > 0 ? (rowTot(cat) / outflowGrand) * 100 : 0
                  const color = colorOf(cat, ci)
                  return (
                    <div key={cat} className="flex items-center gap-3">
                      <div className="text-[11px] font-medium w-28 flex-shrink-0 truncate" style={{ color: 'var(--text2, var(--text))' }}>{labelOf(cat)}</div>
                      <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: '#FAFAFE' }}><div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} /></div>
                      <div className="text-[11px] tabular-nums font-semibold w-12 text-right" style={{ color }}>{pct.toFixed(1)}%</div>
                      <div className="text-[11px] tabular-nums w-20 text-right" style={{ color: 'var(--text)' }}>{money(rowTot(cat))}</div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </>
      )}

      {/* ─────────────── YEARLY TAB — category × year ─────────────── */}
      {tab === 'yearly' && (
        <div className="wl-card overflow-hidden">
          <div className="flex items-center justify-between gap-3 px-4 md:px-5 py-3" style={{ borderBottom: '1px solid var(--line)' }}>
            <div className="min-w-0">
              <div className="text-[14px] md:text-[15px] font-semibold" style={{ color: 'var(--text)' }}>{byPay ? 'Spending by account, each year' : 'Spending by category, each year'}</div>
              <div className="text-[11.5px]" style={{ color: 'var(--text3)' }}>{byPay ? 'Which bank account, credit card or cash it was paid from' : 'Every category, whichever account paid'}</div>
            </div>
            <label className="flex items-center gap-2 flex-shrink-0 cursor-pointer select-none">
              <span className="text-[12.5px] font-semibold" style={{ color: 'var(--text2)' }}>By bank &amp; card</span>
              <button role="switch" aria-checked={byPay} aria-label="Show spending by bank account and card" onClick={() => setByPay(v => !v)}
                className="relative w-[42px] h-[24px] rounded-full transition-colors" style={{ background: byPay ? 'var(--accent)' : '#CBD0DC' }}>
                <span className="absolute top-[3px] w-[18px] h-[18px] rounded-full bg-white shadow transition-[left]" style={{ left: byPay ? 21 : 3 }} />
              </button>
            </label>
          </div>
          {yearsSorted.length === 0 || catYear.list.length === 0 ? (
            <div className="text-center py-16 text-[13px]" style={{ color: 'var(--text3)' }}>No expense data yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[12px] border-collapse">
                <thead>
                  <tr style={{ background: '#FAFAFE', borderBottom: '2px solid var(--line)' }}>
                    <th className="sticky left-0 px-4 py-3 text-left text-[10.5px] uppercase tracking-[0.05em] font-semibold min-w-[150px]"
                      style={{ background: '#FAFAFE', color: 'var(--text3)', borderRight: '1px solid var(--line)' }}>{byPay ? 'Paid from' : 'Category'}</th>
                    {yearsSorted.map(y => (
                      <th key={y} className="px-4 py-3 text-right text-[11px] font-bold min-w-[90px]"
                        style={{ color: y === String(viewYear) ? 'var(--sage)' : 'var(--text3)', background: y === String(viewYear) ? 'var(--sage-bg)' : 'var(--bg2)' }}>
                        <button onClick={() => setViewYear(parseInt(y))} className="hover:underline">{y}</button>
                      </th>
                    ))}
                    <th className="px-4 py-3 text-right text-[10.5px] uppercase tracking-[0.05em] font-semibold" style={{ color: 'var(--expense)', background: '#FAFAFE', borderLeft: '2px solid var(--line)' }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {byPay && payYear.map(g => [
                    <tr key={g.key} style={{ background: g.color + '10', borderBottom: '1px solid var(--line)' }}>
                      <td className="sticky left-0 px-4 py-2.5 font-bold" style={{ background: '#F6F5FC', borderRight: '1px solid var(--line)' }}>
                        <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: g.color }} /><span style={{ color: 'var(--text)' }}>{g.label}</span></div>
                      </td>
                      {yearsSorted.map(y => <td key={y} className="px-4 py-2.5 text-right tabular-nums font-bold" style={{ color: (g.byYear[y] ?? 0) > 0 ? 'var(--text)' : 'var(--text3)' }}>{(g.byYear[y] ?? 0) > 0 ? `${sym}${fmt(g.byYear[y])}` : '—'}</td>)}
                      <td className="px-4 py-2.5 text-right tabular-nums font-bold" style={{ color: 'var(--expense)', borderLeft: '2px solid var(--line)' }}>{money(g.total)}</td>
                    </tr>,
                    ...g.list.map(r => (
                      <tr key={r.key} style={{ borderBottom: '1px solid var(--line)' }} className="hover:bg-stone-50 transition-colors">
                        <td className="sticky left-0 pl-8 pr-4 py-2 text-[12px]" style={{ background: '#fff', borderRight: '1px solid var(--line)', color: 'var(--text2)' }}>{r.name}</td>
                        {yearsSorted.map(y => { const v = r.byYear[y] ?? 0
                          return (
                            <td key={y} className="px-4 py-2 text-right tabular-nums" style={{ color: v > 0 ? 'var(--text2)' : 'var(--text3)', background: y === String(viewYear) ? 'rgba(0,0,0,0.02)' : 'transparent' }}>
                              {v > 0
                                ? <button onClick={() => setDrill({ title: r.name, subtitle: y, items: transactions.filter((t: any) => (t.account_id ?? 'none') === r.key && t.txn_date?.slice(0, 4) === y && classify(catOf(t)) === 'expense' && inView(t.currency) && inScope(t)) })} className="hover:underline" style={{ color: 'inherit' }}>{sym}{fmt(v)}</button>
                                : '—'}
                            </td>
                          )
                        })}
                        <td className="px-4 py-2 text-right tabular-nums font-semibold" style={{ color: 'var(--text)', borderLeft: '2px solid var(--line)' }}>{money(r.total)}</td>
                      </tr>
                    )),
                  ])}
                  {!byPay && catYear.list.map((cat, ci) => {
                    const rowTotal = yearsSorted.reduce((a, y) => a + (catYear.matrix[cat]?.[y] ?? 0), 0)
                    return (
                      <tr key={cat} style={{ borderBottom: '1px solid var(--line)' }} className="hover:bg-stone-50 transition-colors">
                        <td className="sticky left-0 px-4 py-2.5 font-semibold" style={{ background: ci % 2 === 0 ? '#fff' : 'var(--bg2)', borderRight: '1px solid var(--line)' }}>
                          <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ background: colorOf(cat, ci) }} /><span style={{ color: 'var(--text)' }}>{labelOf(cat)}</span></div>
                        </td>
                        {yearsSorted.map(y => { const v = catYear.matrix[cat]?.[y] ?? 0
                          return (
                            <td key={y} className="px-4 py-2.5 text-right tabular-nums" style={{ color: v > 0 ? 'var(--text)' : 'var(--text3)', fontWeight: v > 0 ? 600 : 400, background: y === String(viewYear) ? 'rgba(0,0,0,0.02)' : 'transparent' }}>
                              {v > 0
                                ? <button onClick={() => setDrill({ title: labelOf(cat), subtitle: y, items: transactions.filter((t: any) => catOf(t) === cat && t.txn_date?.slice(0, 4) === y && inView(t.currency) && inScope(t)) })} className="hover:underline" style={{ color: 'inherit' }}>{sym}{fmt(v)}</button>
                                : '—'}
                            </td>
                          )
                        })}
                        <td className="px-4 py-2.5 text-right tabular-nums font-bold" style={{ color: 'var(--expense)', borderLeft: '2px solid var(--line)' }}>{money(rowTotal)}</td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  {/* Total Outflow */}
                  <tr style={{ borderTop: '2px solid var(--line)', background: '#FAFAFE' }}>
                    <td className="sticky left-0 px-4 py-2.5 font-bold text-[11px] uppercase tracking-wider" style={{ background: '#FAFAFE', color: 'var(--expense)', borderRight: '1px solid var(--line)' }}>Total Expenses</td>
                    {yearsSorted.map(y => (<td key={y} className="px-4 py-2.5 text-right tabular-nums font-bold" style={{ color: 'var(--expense)' }}>{yearAgg[y].outflow > 0 ? `${sym}${fmt(yearAgg[y].outflow)}` : '—'}</td>))}
                    <td className="px-4 py-2.5 text-right tabular-nums font-bold text-[13px]" style={{ color: 'var(--expense)', borderLeft: '2px solid var(--line)' }}>{money(yearsSorted.reduce((a, y) => a + yearAgg[y].outflow, 0))}</td>
                  </tr>
                  {/* Income */}
                  <tr style={{ background: 'var(--income-bg)' }}>
                    <td className="sticky left-0 px-4 py-2.5 font-bold text-[11px] uppercase tracking-wider" style={{ background: 'var(--income-bg)', color: 'var(--income)', borderRight: '1px solid var(--line)' }}>Income</td>
                    {yearsSorted.map(y => (<td key={y} className="px-4 py-2.5 text-right tabular-nums font-bold" style={{ color: 'var(--income)' }}>{(catYear.inc[y] ?? 0) > 0 ? `${sym}${fmt(catYear.inc[y])}` : '—'}</td>))}
                    <td className="px-4 py-2.5 text-right tabular-nums font-bold text-[13px]" style={{ color: 'var(--income)', borderLeft: '2px solid var(--line)' }}>{money(yearsSorted.reduce((a, y) => a + (catYear.inc[y] ?? 0), 0))}</td>
                  </tr>
                  {/* Net */}
                  <tr style={{ background: '#FAFAFE', borderTop: '1px solid var(--line)' }}>
                    <td className="sticky left-0 px-4 py-3 font-black text-[11px] uppercase tracking-wider" style={{ background: '#FAFAFE', color: 'var(--text)', borderRight: '1px solid var(--line)' }}>Net (Inc − Exp)</td>
                    {yearsSorted.map(y => { const n = (catYear.inc[y] ?? 0) - yearAgg[y].outflow
                      return (<td key={y} className="px-4 py-3 text-right tabular-nums font-black" style={{ color: n >= 0 ? 'var(--income)' : 'var(--rose)' }}>{n < 0 ? '-' : ''}{sym}{fmt(Math.abs(n))}</td>) })}
                    <td className="px-4 py-3 text-right tabular-nums font-black text-[13px]" style={{ borderLeft: '2px solid var(--line)', color: (yearsSorted.reduce((a, y) => a + ((catYear.inc[y] ?? 0) - yearAgg[y].outflow), 0)) >= 0 ? 'var(--income)' : 'var(--rose)' }}>
                      {(() => { const t = yearsSorted.reduce((a, y) => a + ((catYear.inc[y] ?? 0) - yearAgg[y].outflow), 0); return `${t < 0 ? '-' : ''}${money(Math.abs(t))}` })()}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
          <div className="px-4 py-2 text-[10px]" style={{ color: 'var(--text3)', borderTop: '1px solid var(--line)' }}>
            {byPay ? 'Spending by the account it was paid from; card bills aren’t counted again, as the card purchases already are' : 'Actual spend per category each year'} · click a cell to see the transactions · click a year header to open its monthly view.
          </div>
        </div>
      )}

      {/* ─────────────── BUDGET TAB ─────────────── */}
      {tab === 'budget' && (
        <div className="wl-card overflow-hidden">
          {budgetCats.length === 0 ? (
            <div className="text-center py-16 text-[13px]" style={{ color: 'var(--text3)' }}>
              No budgets set for this view. Set caps on the Budgets page — they’ll show here as % used per month.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[11px] border-collapse">
                <thead>
                  <tr style={{ background: '#FAFAFE', borderBottom: '2px solid var(--line)' }}>
                    <th className="sticky left-0 px-4 py-3 text-left text-[10.5px] uppercase tracking-[0.05em] font-semibold min-w-[130px]" style={{ background: '#FAFAFE', color: 'var(--text3)', borderRight: '1px solid var(--line)' }}>Category</th>
                    <th className="px-3 py-3 text-right text-[10.5px] uppercase tracking-[0.05em] font-semibold" style={{ background: '#FAFAFE', color: 'var(--sage)', borderRight: '1px solid var(--line)' }}>Budget /mo</th>
                    {months.map(m => (<th key={m} className="px-2 py-3 text-center text-[10.5px] uppercase tracking-[0.05em] font-semibold min-w-[60px]" style={{ color: 'var(--text3)', background: m >= fromMonth && m <= toMonth ? 'var(--sage-bg)' : 'var(--bg2)' }}>{MONTH_NAMES[Number(m.slice(5)) - 1]}</th>))}
                  </tr>
                </thead>
                <tbody>
                  {budgetCats.map((cat, ci) => {
                    const cap = budgetCapMap[cat]
                    return (
                      <tr key={cat} style={{ borderBottom: '1px solid var(--line)' }}>
                        <td className="sticky left-0 px-4 py-2.5 font-semibold" style={{ background: ci % 2 === 0 ? '#fff' : 'var(--bg2)', borderRight: '1px solid var(--line)' }}>
                          <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ background: colorOf(cat, ci) }} /><span style={{ color: 'var(--text)' }}>{labelOf(cat)}</span></div>
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums font-bold" style={{ color: 'var(--text)', borderRight: '1px solid var(--line)' }}>{money(cap)}</td>
                        {months.map(m => {
                          const spent = pivot[cat]?.[m] ?? 0
                          const pct = cap > 0 ? Math.round(spent / cap * 100) : 0
                          const bg = spent === 0 ? 'transparent' : pct >= 100 ? '#FEE2E2' : pct >= 75 ? '#FEF3C7' : '#DCFCE7'
                          const fg = spent === 0 ? 'var(--text3)' : pct >= 100 ? '#B91C1C' : pct >= 75 ? '#B45309' : '#15803D'
                          return (
                            <td key={m} className="px-2 py-2.5 text-center" style={{ background: bg }}>
                              {spent > 0
                                ? <button onClick={() => setDrill({ title: `${cat} · budget ${money(cap)}`, subtitle: mLabel(m), items: yearTxns.filter((t: any) => catOf(t) === cat && t.txn_date?.slice(0, 7) === m) })} className="tabular-nums" style={{ color: fg }}>
                                    <div className="font-bold text-[11px]">{pct}%</div>
                                    <div className="text-[8px] opacity-80">{sym}{fmt(spent)}</div>
                                  </button>
                                : <span style={{ color: 'var(--text3)' }}>—</span>}
                            </td>
                          )
                        })}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
          <div className="px-4 py-2.5 border-t flex flex-wrap gap-4 text-[10px]" style={{ borderColor: 'var(--line)', color: 'var(--text3)' }}>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded inline-block" style={{ background: '#DCFCE7' }} /> Under 75%</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded inline-block" style={{ background: '#FEF3C7' }} /> 75–99% (near limit)</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded inline-block" style={{ background: '#FEE2E2' }} /> ≥100% over budget</span>
            <span>Cells show % of the monthly cap used · click to see transactions</span>
          </div>
        </div>
      )}

      {merging && <MergeAccountsSheet accounts={merging} onClose={() => setMerging(null)} />}
      {drill && <TxnDrillModal title={drill.title} subtitle={drill.subtitle} items={drill.items} amt={disp} money={money} onClose={() => setDrill(null)} />}
    </div>
  )
}
