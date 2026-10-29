'use client'
import { useMemo, useState, useEffect } from 'react'
import { useViewStore } from '@/store/viewStore'
import { Download, ChevronLeft, ChevronRight, CalendarDays, CalendarRange, Target, CreditCard, Landmark, Wallet, Link2Off } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, Cell, Legend } from 'recharts'
import TxnDrillModal from '@/components/dashboard/TxnDrillModal'
import { CC_BILL, classify, labelOf, catOf, prepareMoney, isIncome, isNreToNro, markUnitemisedCardBills, INDIA_INCOME, cashOut, cashLeft, type CashOut } from '@/lib/money'
import { PageHeader, KpiTile, Segmented } from '@/components/ui/kit'
import { useCategoryStore } from '@/store/categoryStore'

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
  const s = `${t?.accounts?.name || ''} ${t?.accounts?.bank_name || ''}`.toLowerCase()
  return /\bnre\b|non[-\s]?resident\s+external/.test(s) ? 'nre' : 'nro'
}

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

export default function ExpensesReportClient({ transactions: rawTxns, incomeTransactions: rawIncome = [], budgets = [] }:
  { transactions: any[]; incomeTransactions?: any[]; budgets?: any[] }) {
  const { view, fromMonth, toMonth, fxRate: FX } = useViewStore()
  // Card bills count only when that month's card purchases weren't imported
  const transactions = useMemo(() => markUnitemisedCardBills(rawTxns,
    new Set(rawTxns.filter((t: any) => t.accounts?.account_type === 'credit_card').map((t: any) => t.account_id))), [rawTxns])

  const inView = (cur: string) => view === 'consolidated' || (view === 'uae' ? cur === 'AED' : cur === 'INR')
  const conv = (amt: number, cur: string) => view === 'consolidated' && cur === 'AED' ? amt * FX : amt
  const disp = (t: any) => inView(t.currency) ? conv(Number(t.amount) || 0, t.currency) : 0
  const sym = view === 'uae' ? 'AED ' : '₹'
  const money = (n: number) => `${sym}${Math.round(n).toLocaleString('en-IN')}`
  const mLabel = (m: string) => new Date(m + '-01').toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })

  // Colours follow the user's own categories (same as Expenses and Reports)
  const { rows: userCats, load: loadCats } = useCategoryStore()
  useEffect(() => { loadCats() }, [loadCats])
  const colorOf = (cat: string, idx: number) => userCats.find(r => r.name === cat)?.color ?? CAT_COLORS[cat] ?? FALLBACK_PALETTE[idx % FALLBACK_PALETTE.length]

  const [tab, setTab] = useState<Tab>('monthly')
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
  // pay for — those are in the expenses above, so nothing is taken off twice
  const isCardRow = (t: any) => t.accounts?.account_type === 'credit_card'
  const flowByMonth = useMemo(() => {
    const by: Record<string, any[]> = {}
    yearTxns.forEach(t => { const m = t.txn_date?.slice(0, 7); if (m) (by[m] ||= []).push(t) })
    return Object.fromEntries(months.map(m => [m, cashOut(by[m] ?? [], { view, isCard: isCardRow, amount: disp })])) as Record<string, CashOut>
  }, [yearTxns, view, FX])
  // NRE alone: what moved on to NRO left it too
  const toNro = (m: string) => scope !== 'nre' ? 0 : yearTxns.filter(t => t.txn_date?.slice(0, 7) === m && isNreToNro(t)).reduce((a, t) => a + disp(t), 0)
  const leftCol = (m: string) => cashLeft(incomeCol(m), flowByMonth[m]) - toNro(m)

  const outflowGrand  = months.reduce((a, m) => a + outflowCol(m), 0)
  const incomeGrand   = months.reduce((a, m) => a + incomeCol(m), 0)
  const netGrand      = incomeGrand - outflowGrand
  const investGrand   = rowTot('Investment')
  const savingsRate   = incomeGrand > 0 ? Math.round((netGrand + investGrand) / incomeGrand * 100) : 0   // investing counts as saved
  const leftGrand     = months.reduce((a, m) => a + leftCol(m), 0)

  // "Where your income went": the months picked at the top (if in this year), or the whole year
  const [flowPeriod, setFlowPeriod] = useState<'range' | 'year'>('range')
  const rangeMonths = months.filter(m => m >= fromMonth && m <= toMonth)
  const fMonths = flowPeriod === 'range' && rangeMonths.length ? rangeMonths : months
  const fLabel = flowPeriod === 'range' && rangeMonths.length
    ? (rangeMonths.length === 1 ? mLabel(rangeMonths[0]) : `${mLabel(rangeMonths[0])} – ${mLabel(rangeMonths[rangeMonths.length - 1])}`) : String(viewYear)
  const F = fMonths.reduce((acc, m) => {
    const f = flowByMonth[m]
    return { direct: acc.direct + f.direct, cardBills: acc.cardBills + f.cardBills, emis: acc.emis + f.emis, invested: acc.invested + f.invested,
      sentHome: acc.sentHome + f.sentHome, onCards: acc.onCards + f.onCards, cardLoanEmis: acc.cardLoanEmis + f.cardLoanEmis }
  }, { direct: 0, cardBills: 0, emis: 0, invested: 0, sentHome: 0, onCards: 0, cardLoanEmis: 0 } as CashOut)
  const fIncome = fMonths.reduce((a, m) => a + incomeCol(m), 0)
  const fToNro = fMonths.reduce((a, m) => a + toNro(m), 0)
  const fExpenses = fMonths.reduce((a, m) => a + outflowCol(m), 0)
  const fLeft = cashLeft(fIncome, F) - fToNro
  const fCharged = F.onCards + F.cardLoanEmis

  const activeExpense  = expenseCats.filter(c => rowTot(c) > 0).sort((a, b) => rowTot(b) - rowTot(a))
  const activeExcluded = excludedCats.filter(c => rowTot(c) > 0).sort((a, b) => rowTot(b) - rowTot(a))
  const ccBillGrand    = rowTot(CC_BILL)
  const hasMonthlyRows = activeExpense.length > 0 || activeExcluded.length > 0 || ccBillGrand > 0

  // Spend (the same txns as Total Monthly Expenses) split by the account / card
  // it was paid from. Card-bill payments aren't charged to the paying bank
  // account — that spend already sits on the card.
  // Rows merge by account NAME, not record id — the same account saved twice
  // (e.g. Wio as both current & savings) or Cash kept per currency is one row.
  const acctKey = (t: any) => !t.account_id ? '__none__'
    : (t.accounts?.name || '').toLowerCase().replace(/\s+/g, ' ').trim() || t.account_id
  const accountRows = useMemo(() => {
    const map: Record<string, { key: string; name: string; sub: string; type: string; currencies: Set<string>; byMonth: Record<string, number>; total: number }> = {}
    yearTxns.forEach(t => {
      const m = t.txn_date?.slice(0, 7); if (!m || classify(catOf(t)) !== 'expense') return
      const key = acctKey(t)
      if (!map[key]) {
        const a = t.accounts
        const name: string = a?.name || (t.account_id ? 'Unknown account' : 'No account linked')
        // Only show bank / last-4 when the name doesn't already carry them
        const lower = name.toLowerCase()
        map[key] = {
          key, name,
          sub: [a?.bank_name && !lower.includes(String(a.bank_name).toLowerCase()) ? a.bank_name : '',
                a?.last_four && !name.includes(a.last_four) ? `••${a.last_four}` : ''].filter(Boolean).join(' · '),
          type: t.account_id ? (a?.account_type || '') : 'none',
          currencies: new Set(), byMonth: {}, total: 0,
        }
      }
      const v = disp(t)
      map[key].currencies.add(t.currency)
      map[key].byMonth[m] = (map[key].byMonth[m] ?? 0) + v
      map[key].total += v
    })
    return Object.values(map).filter(r => r.total > 0)
      .map(r => r.currencies.size > 1 ? { ...r, sub: [r.sub, Array.from(r.currencies).sort().join(' + ')].filter(Boolean).join(' · ') } : r)
      .sort((a, b) => (a.key === '__none__' ? 1 : 0) - (b.key === '__none__' ? 1 : 0) || b.total - a.total)
  }, [yearTxns, view, FX])

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

  const barData = months.map(m => ({
    month: MONTH_NAMES[Number(m.slice(5)) - 1],
    Expenses: Math.round(outflowCol(m)),
    Income: Math.round(incomeCol(m)),
  }))

  function handleExport() {
    const monthHeads = months.map(m => `${MONTH_NAMES[Number(m.slice(5)) - 1]} ${m.slice(0, 4)}`)
    const catRow = (c: string, name: string) => [name, ...months.map(m => Math.round(pivot[c]?.[m] ?? 0).toString()), Math.round(rowTot(c)).toString()]
    const rows = activeExpense.map(c => catRow(c, labelOf(c)))
    activeExcluded.forEach(c => rows.push(catRow(c, `${labelOf(c)} (not in total)`)))
    rows.push(catRow(CC_BILL, 'Credit Card Bill (not in total)'))
    rows.push(['TOTAL MONTHLY EXPENSES', ...months.map(m => Math.round(outflowCol(m)).toString()), Math.round(outflowGrand).toString()])
    rows.push(['INCOME', ...months.map(m => Math.round(incomeCol(m)).toString()), Math.round(incomeGrand).toString()])
    rows.push(['NET (Income − Expenses)', ...months.map(m => Math.round(netCol(m)).toString()), Math.round(netGrand).toString()])
    rows.push(['LEFT IN YOUR ACCOUNTS (Income − bank & cash out, card bills not card charges)', ...months.map(m => Math.round(leftCol(m)).toString()), Math.round(leftGrand).toString()])
    rows.push([], ['Spend by Account / Card', ...monthHeads, 'Total'])
    accountRows.forEach(r => rows.push([r.sub ? `${r.name} (${r.sub})` : r.name, ...months.map(m => Math.round(r.byMonth[m] ?? 0).toString()), Math.round(r.total).toString()]))
    csvExport([['Category', ...monthHeads, 'Total'], ...rows])
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
        <Segmented label="Account" value={scope} onChange={setScope}
          options={[{ value: 'both' as Scope, label: 'NRE + NRO' }, { value: 'nre' as Scope, label: 'NRE' }, { value: 'nro' as Scope, label: 'NRO' }]} />
      </div>

      {tab !== 'yearly' && (
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
          {/* Where the income went, in cash: each thing that left your bank & cash once */}
          {(fIncome > 0 || fExpenses > 0) && (() => {
            const lines = [
              { k: 'Spent from bank & cash', sub: 'living costs and family support, paid directly', v: F.direct, c: '#6A55E8' },
              { k: 'Card bills paid', sub: fCharged > 0 ? `pays for what you charged to cards — ${money(fCharged)} in this period` : 'pays for what you charged to cards', v: F.cardBills, c: '#9333EA' },
              { k: 'Loan EMIs', sub: 'paid from the bank', v: F.emis, c: '#F29A2E' },
              { k: 'Invested', sub: 'still yours — counts as saving', v: F.invested, c: '#2FB67C' },
              { k: 'Sent to India', sub: 'left your UAE accounts for your NRE', v: F.sentHome, c: '#0EA5E9' },
              { k: 'Moved to NRO', sub: 'left the NRE account for daily spending', v: fToNro, c: '#3B8EF0' },
            ].filter(l => l.v > 0)
            const base = Math.max(fIncome, lines.reduce((a, l) => a + l.v, 0), 1)
            const gap = fCharged - F.cardBills
            return (
              <section className="wl-card px-4 md:px-5 py-4 md:py-[18px]" aria-label="Where your income went">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <h2 className="text-[14px] md:text-[15px] font-semibold" style={{ color: 'var(--text)' }}>Where your income went · {fLabel}</h2>
                  {rangeMonths.length > 0 && rangeMonths.length < months.length && (
                    <Segmented label="Period" value={flowPeriod} onChange={setFlowPeriod}
                      options={[{ value: 'range' as const, label: rangeMonths.length === 1 ? mLabel(rangeMonths[0]) : 'Selected months' }, { value: 'year' as const, label: String(viewYear) }]} />
                  )}
                </div>
                <div className="flex h-2.5 rounded-full overflow-hidden gap-[2px] mt-3" style={{ background: 'var(--track)' }} role="img"
                  aria-label={`${lines.map(l => `${l.k} ${money(l.v)}`).join(', ')}, left ${money(Math.max(fLeft, 0))}`}>
                  {lines.map(l => <div key={l.k} style={{ width: `${l.v / base * 100}%`, background: l.c }} />)}
                  {fLeft > 0 && <div style={{ width: `${fLeft / base * 100}%`, background: '#CBD5E1' }} />}
                </div>
                <div className="mt-2">
                  <div className="flex justify-between gap-3 py-2 text-[13.5px]">
                    <span className="font-semibold" style={{ color: 'var(--text)' }}>Came in</span>
                    <span className="font-bold tabular-nums" style={{ color: '#1E8F5F' }}>{money(fIncome)}</span>
                  </div>
                  {lines.map(l => (
                    <div key={l.k} className="flex justify-between gap-3 py-2" style={{ borderTop: '1px solid var(--track)' }}>
                      <span className="flex items-start gap-2 min-w-0">
                        <i className="w-2.5 h-2.5 rounded-sm flex-shrink-0 mt-1" style={{ background: l.c }} />
                        <span className="min-w-0"><span className="block text-[13px]" style={{ color: 'var(--text2)' }}>− {l.k}</span>
                          <span className="block text-[11.5px]" style={{ color: 'var(--text4)' }}>{l.sub}</span></span>
                      </span>
                      <span className="text-[13px] font-semibold tabular-nums" style={{ color: 'var(--text)' }}>{money(l.v)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between gap-3 pt-2.5 mt-1" style={{ borderTop: '1.5px solid var(--line)' }}>
                    <span className="flex items-center gap-2"><i className="w-2.5 h-2.5 rounded-sm" style={{ background: '#CBD5E1' }} />
                      <span className="text-[14px] font-bold" style={{ color: 'var(--text)' }}>= Left in your accounts</span></span>
                    <span className="text-[16px] font-bold tabular-nums" style={{ color: fLeft >= 0 ? '#1E8F5F' : '#D9482F' }}>{fLeft < 0 ? '−' : ''}{money(Math.abs(fLeft))}</span>
                  </div>
                </div>
                <div className="mt-3 rounded-xl px-3.5 py-3 text-[12px] leading-relaxed" style={{ background: '#FAFAFE', border: '1px solid var(--line)', color: 'var(--text3)' }}>
                  <b style={{ color: 'var(--text2)' }}>Counted once.</b> Your expenses for {fLabel} ({money(fExpenses)}) = {money(F.direct)} paid from bank &amp; cash
                  {F.onCards > 0 ? <> + {money(F.onCards)} charged to cards</> : null}{F.emis > 0 ? <> + {money(F.emis)} EMIs</> : null}{F.invested > 0 ? <> + {money(F.invested)} invested</> : null}.
                  {' '}Card charges leave your bank only when you pay the card, so here the card bills come off instead
                  {fCharged > 0 || F.cardBills > 0 ? <> — charged {money(fCharged)}{F.cardLoanEmis > 0 ? ` (incl. ${money(F.cardLoanEmis)} card-loan EMIs)` : ''}, paid {money(F.cardBills)}{Math.abs(gap) >= 1 ? (gap > 0 ? `; ${money(gap)} is still on the cards` : `; ${money(-gap)} of the bills paid for earlier charges`) : ''}</> : null}.
                </div>
              </section>
            )
          })()}

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

          {/* One table: spend categories (summed) → transfers / card bill (shown, not summed) → totals */}
          <div className="wl-card overflow-hidden">
            {!hasMonthlyRows ? (
              <div className="text-center py-16 text-[13px]" style={{ color: 'var(--text3)' }}>No expense data for {viewYear}</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-[11px] border-collapse">
                  <thead>
                    <tr style={{ background: '#FAFAFE', borderBottom: '2px solid var(--line)' }}>
                      <th className="sticky left-0 px-4 py-3 text-left text-[10.5px] uppercase tracking-[0.05em] font-semibold min-w-[130px]"
                        style={{ background: '#FAFAFE', color: 'var(--text3)', borderRight: '1px solid var(--line)' }}>Category</th>
                      {months.map(m => (
                        <th key={m} className="px-3 py-3 text-right text-[10.5px] uppercase tracking-[0.05em] font-semibold min-w-[64px]"
                          style={{ color: 'var(--text3)', background: m >= fromMonth && m <= toMonth ? 'var(--rose-bg)' : 'var(--bg2)' }}>
                          {MONTH_NAMES[Number(m.slice(5)) - 1]}
                        </th>
                      ))}
                      <th className="px-4 py-3 text-right text-[10.5px] uppercase tracking-[0.05em] font-semibold"
                        style={{ color: 'var(--expense)', background: '#FAFAFE', borderLeft: '2px solid var(--line)' }}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeExpense.map((cat, ci) => {
                      const color = colorOf(cat, ci); const total = rowTot(cat)
                      return (
                        <tr key={cat} style={{ borderBottom: '1px solid var(--line)' }} className="hover:bg-stone-50 transition-colors">
                          <td className="sticky left-0 px-4 py-2.5 font-semibold min-w-[130px]"
                            style={{ background: ci % 2 === 0 ? '#fff' : 'var(--bg2)', borderRight: '1px solid var(--line)' }}>
                            <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ background: color }} /><span style={{ color: 'var(--text)' }}>{labelOf(cat)}</span></div>
                          </td>
                          <MonthCells cat={cat} color={color} />
                          <td className="px-4 py-2.5 text-right tabular-nums font-bold" style={{ color: 'var(--expense)', borderLeft: '2px solid var(--line)' }}>
                            <button onClick={() => setDrill({ title: labelOf(cat), subtitle: String(viewYear), items: yearTxns.filter((t: any) => catOf(t) === cat) })} className="hover:underline" style={{ color: 'inherit' }}>{sym}{fmt(total)}</button>
                          </td>
                        </tr>
                      )
                    })}
                    {/* Shown for tracking, NOT summed: own-account moves / money received, then the card bill */}
                    <tr style={{ background: '#FAFAFE', borderTop: '2px solid var(--line)', borderBottom: '1px solid var(--line)' }}>
                      <td className="sticky left-0 px-4 py-1.5 text-[10px] uppercase tracking-[0.05em] font-semibold" style={{ background: '#FAFAFE', color: 'var(--text3)', borderRight: '1px solid var(--line)' }}>Not in total ↓</td>
                      <td colSpan={months.length + 1} />
                    </tr>
                    {activeExcluded.map((cat, ci) => {
                      const color = colorOf(cat, ci)
                      return (
                        <tr key={cat} style={{ borderBottom: '1px solid var(--line)' }} className="hover:bg-stone-50 transition-colors">
                          <td className="sticky left-0 px-4 py-2.5 font-medium min-w-[130px]" style={{ background: '#fff', borderRight: '1px solid var(--line)' }}>
                            <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-sm flex-shrink-0 opacity-50" style={{ background: color }} /><span style={{ color: 'var(--text3)' }}>{labelOf(cat)}</span></div>
                          </td>
                          <MonthCells cat={cat} color={color} muted />
                          <td className="px-4 py-2.5 text-right tabular-nums" style={{ color: 'var(--text3)', borderLeft: '2px solid var(--line)' }}>
                            <button onClick={() => setDrill({ title: labelOf(cat), subtitle: String(viewYear), items: yearTxns.filter((t: any) => catOf(t) === cat) })} className="hover:underline" style={{ color: 'inherit' }}>{sym}{fmt(rowTot(cat))}</button>
                          </td>
                        </tr>
                      )
                    })}
                    <tr style={{ background: `${CC_COLOR}08` }}>
                      <td className="sticky left-0 px-4 py-2.5 font-semibold min-w-[130px]" style={{ background: '#FAF5FF', borderRight: '1px solid var(--line)' }}>
                        <div className="flex items-center gap-2"><CreditCard size={12} style={{ color: CC_COLOR }} className="flex-shrink-0" /><span style={{ color: CC_COLOR }}>Credit Card Bill</span></div>
                      </td>
                      {months.map(m => { const val = pivot[CC_BILL]?.[m] ?? 0
                        return (
                          <td key={m} className="px-3 py-2.5 text-right tabular-nums" style={{ color: val > 0 ? CC_COLOR : 'var(--text3)', fontWeight: val > 0 ? 600 : 400 }}>
                            {val > 0
                              ? <button onClick={() => setDrill({ title: 'Credit Card Bill', subtitle: mLabel(m), items: yearTxns.filter((t: any) => catOf(t) === CC_BILL && t.txn_date?.slice(0, 7) === m) })} className="hover:underline" style={{ color: 'inherit' }}>{sym}{fmt(val)}</button>
                              : '—'}
                          </td>
                        ) })}
                      <td className="px-4 py-2.5 text-right tabular-nums font-bold" style={{ color: CC_COLOR, borderLeft: '2px solid var(--line)' }}>
                        {ccBillGrand > 0
                          ? <button onClick={() => setDrill({ title: 'Credit Card Bill', subtitle: String(viewYear), items: yearTxns.filter((t: any) => catOf(t) === CC_BILL) })} className="hover:underline" style={{ color: 'inherit' }}>{sym}{fmt(ccBillGrand)}</button>
                          : '—'}
                      </td>
                    </tr>
                  </tbody>
                  <tfoot>
                    {/* Total monthly expenses — spend categories only (card bill & moves excluded) */}
                    <tr style={{ borderTop: '2px solid var(--line)', background: '#FAFAFE' }}>
                      <td className="sticky left-0 px-4 py-2.5 font-bold text-[11px] uppercase tracking-wider" style={{ background: '#FAFAFE', color: 'var(--expense)', borderRight: '1px solid var(--line)' }}>Total Monthly Expenses</td>
                      {months.map(m => (<td key={m} className="px-3 py-2.5 text-right tabular-nums font-bold" style={{ color: 'var(--expense)', background: m >= fromMonth && m <= toMonth ? 'var(--rose-bg)' : 'var(--bg2)' }}>{outflowCol(m) > 0 ? `${sym}${fmt(outflowCol(m))}` : '—'}</td>))}
                      <td className="px-4 py-2.5 text-right tabular-nums font-bold text-[13px]" style={{ color: 'var(--expense)', borderLeft: '2px solid var(--line)' }}>{money(outflowGrand)}</td>
                    </tr>
                    {/* Income */}
                    <tr style={{ background: 'var(--income-bg)' }}>
                      <td className="sticky left-0 px-4 py-2.5 font-bold text-[11px] uppercase tracking-wider" style={{ background: 'var(--income-bg)', color: 'var(--income)', borderRight: '1px solid var(--line)' }}>Income</td>
                      {months.map(m => (<td key={m} className="px-3 py-2.5 text-right tabular-nums font-bold" style={{ color: 'var(--income)' }}>{incomeCol(m) > 0 ? `${sym}${fmt(incomeCol(m))}` : '—'}</td>))}
                      <td className="px-4 py-2.5 text-right tabular-nums font-bold text-[13px]" style={{ color: 'var(--income)', borderLeft: '2px solid var(--line)' }}>{money(incomeGrand)}</td>
                    </tr>
                    {/* Net */}
                    <tr style={{ background: '#FAFAFE', borderTop: '1px solid var(--line)' }}>
                      <td className="sticky left-0 px-4 py-3 font-black text-[11px] uppercase tracking-wider" style={{ background: '#FAFAFE', color: 'var(--text)', borderRight: '1px solid var(--line)' }}>Income − expenses</td>
                      {months.map(m => { const n = netCol(m); const has = incomeCol(m) > 0 || outflowCol(m) > 0
                        return (<td key={m} className="px-3 py-3 text-right tabular-nums font-black" style={{ color: !has ? 'var(--text3)' : n >= 0 ? 'var(--income)' : 'var(--rose)' }}>{has ? `${n < 0 ? '-' : ''}${sym}${fmt(Math.abs(n))}` : '—'}</td>) })}
                      <td className="px-4 py-3 text-right tabular-nums font-black text-[13px]" style={{ color: netGrand >= 0 ? 'var(--income)' : 'var(--rose)', borderLeft: '2px solid var(--line)' }}>{netGrand < 0 ? '-' : ''}{money(Math.abs(netGrand))}</td>
                    </tr>
                    {/* Left in your accounts: income − what left your bank & cash (card bills, not card charges) */}
                    <tr style={{ background: '#F3F1FB', borderTop: '1px solid var(--line)' }}>
                      <td className="sticky left-0 px-4 py-3 font-black text-[11px] uppercase tracking-wider" style={{ background: '#F3F1FB', color: 'var(--accent2)', borderRight: '1px solid var(--line)' }}>Left in your accounts</td>
                      {months.map(m => { const n = leftCol(m), f = flowByMonth[m]; const has = incomeCol(m) > 0 || f.direct + f.cardBills + f.emis + f.invested + f.sentHome > 0
                        return (<td key={m} className="px-3 py-3 text-right tabular-nums font-black" style={{ color: !has ? 'var(--text3)' : n >= 0 ? 'var(--income)' : 'var(--rose)' }}>{has ? `${n < 0 ? '-' : ''}${sym}${fmt(Math.abs(n))}` : '—'}</td>) })}
                      <td className="px-4 py-3 text-right tabular-nums font-black text-[13px]" style={{ color: leftGrand >= 0 ? 'var(--income)' : 'var(--rose)', borderLeft: '2px solid var(--line)' }}>{leftGrand < 0 ? '-' : ''}{money(Math.abs(leftGrand))}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
            <div className="px-4 py-2 text-[10px]" style={{ color: 'var(--text3)', borderTop: '1px solid var(--line)' }}>
              Total Monthly Expenses = every spend category, incl. money sent (Money Transfer, Transfer to India, Family), Investment &amp; EMI.
              The credit card bill only settles card spend already counted above, and moves between your own accounts / money received are the same money — so those are shown but not summed.
              Left in your accounts = income − what left your bank &amp; cash: spending paid directly, card bills paid (not the card charges), EMIs, investing{view === 'uae' ? ' and money sent to India' : ''}.
            </div>
          </div>

          {/* Spend by account / card */}
          {accountRows.length > 0 && (
            <div className="wl-card overflow-hidden">
              <div className="px-4 py-3" style={{ background: '#FAFAFE', borderBottom: '1px solid var(--line)' }}>
                <div className="text-[12px] font-bold" style={{ color: 'var(--text)' }}>Spend by Account / Card — {viewYear}</div>
                <div className="text-[10px] mt-0.5" style={{ color: 'var(--text3)' }}>Where your Total Monthly Expenses were paid from · click a cell to see the transactions</div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-[11px] border-collapse">
                  <thead>
                    <tr style={{ background: '#FAFAFE', borderBottom: '2px solid var(--line)' }}>
                      <th className="sticky left-0 px-4 py-3 text-left text-[10.5px] uppercase tracking-[0.05em] font-semibold min-w-[160px]"
                        style={{ background: '#FAFAFE', color: 'var(--text3)', borderRight: '1px solid var(--line)' }}>Account / Card</th>
                      {months.map(m => (
                        <th key={m} className="px-3 py-3 text-right text-[10.5px] uppercase tracking-[0.05em] font-semibold min-w-[64px]"
                          style={{ color: 'var(--text3)', background: m >= fromMonth && m <= toMonth ? 'var(--rose-bg)' : 'var(--bg2)' }}>
                          {MONTH_NAMES[Number(m.slice(5)) - 1]}
                        </th>
                      ))}
                      <th className="px-4 py-3 text-right text-[10.5px] uppercase tracking-[0.05em] font-semibold" style={{ color: 'var(--expense)', background: '#FAFAFE', borderLeft: '2px solid var(--line)' }}>Total</th>
                      <th className="px-3 py-3 text-right text-[10.5px] uppercase tracking-[0.05em] font-semibold" style={{ color: 'var(--text3)', background: '#FAFAFE' }}>Share</th>
                    </tr>
                  </thead>
                  <tbody>
                    {accountRows.map((r, ri) => {
                      const Icon = r.type === 'credit_card' ? CreditCard : r.type === 'wallet' || r.type === 'nol' ? Wallet : r.type === 'none' ? Link2Off : Landmark
                      const iconColor = r.type === 'credit_card' ? CC_COLOR : r.type === 'none' ? 'var(--text3)' : 'var(--blue)'
                      const acctItems = (m?: string) => yearTxns.filter((t: any) => acctKey(t) === r.key
                        && classify(catOf(t)) === 'expense' && (!m || t.txn_date?.slice(0, 7) === m))
                      return (
                        <tr key={r.key} style={{ borderBottom: '1px solid var(--line)' }} className="hover:bg-stone-50 transition-colors">
                          <td className="sticky left-0 px-4 py-2 min-w-[160px]" style={{ background: ri % 2 === 0 ? '#fff' : 'var(--bg2)', borderRight: '1px solid var(--line)' }}>
                            <div className="flex items-center gap-2">
                              <Icon size={13} className="flex-shrink-0" style={{ color: iconColor }} />
                              <div className="min-w-0">
                                <div className="font-semibold truncate" style={{ color: r.type === 'none' ? 'var(--text3)' : 'var(--text)' }}>{r.name}</div>
                                {r.sub && <div className="text-[10.5px] truncate" style={{ color: 'var(--text3)' }}>{r.sub}</div>}
                              </div>
                            </div>
                          </td>
                          {months.map(m => { const val = r.byMonth[m] ?? 0
                            return (
                              <td key={m} className="px-3 py-2 text-right tabular-nums" style={{ color: val > 0 ? 'var(--text)' : 'var(--text3)', fontWeight: val > 0 ? 600 : 400 }}>
                                {val > 0
                                  ? <button onClick={() => setDrill({ title: r.name, subtitle: mLabel(m), items: acctItems(m) })} className="hover:underline" style={{ color: 'inherit' }}>{sym}{fmt(val)}</button>
                                  : '—'}
                              </td>
                            ) })}
                          <td className="px-4 py-2 text-right tabular-nums font-bold" style={{ color: 'var(--expense)', borderLeft: '2px solid var(--line)' }}>
                            <button onClick={() => setDrill({ title: r.name, subtitle: String(viewYear), items: acctItems() })} className="hover:underline" style={{ color: 'inherit' }}>{sym}{fmt(r.total)}</button>
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums" style={{ color: 'var(--text3)' }}>
                            {outflowGrand > 0 ? `${Math.round(r.total / outflowGrand * 100)}%` : '—'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot>
                    <tr style={{ borderTop: '2px solid var(--line)', background: '#FAFAFE' }}>
                      <td className="sticky left-0 px-4 py-2.5 font-bold text-[11px] uppercase tracking-wider" style={{ background: '#FAFAFE', color: 'var(--expense)', borderRight: '1px solid var(--line)' }}>Total</td>
                      {months.map(m => (<td key={m} className="px-3 py-2.5 text-right tabular-nums font-bold" style={{ color: 'var(--expense)' }}>{outflowCol(m) > 0 ? `${sym}${fmt(outflowCol(m))}` : '—'}</td>))}
                      <td className="px-4 py-2.5 text-right tabular-nums font-bold text-[13px]" style={{ color: 'var(--expense)', borderLeft: '2px solid var(--line)' }}>{money(outflowGrand)}</td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
              <div className="px-4 py-2 text-[10px]" style={{ color: 'var(--text3)', borderTop: '1px solid var(--line)' }}>
                Card bill payments aren’t counted against the bank account they were paid from — that spend is already on the card.
                Link transactions to an account so they don’t land in “No account linked”.
              </div>
            </div>
          )}

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
          {yearsSorted.length === 0 || catYear.list.length === 0 ? (
            <div className="text-center py-16 text-[13px]" style={{ color: 'var(--text3)' }}>No expense data yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[12px] border-collapse">
                <thead>
                  <tr style={{ background: '#FAFAFE', borderBottom: '2px solid var(--line)' }}>
                    <th className="sticky left-0 px-4 py-3 text-left text-[10.5px] uppercase tracking-[0.05em] font-semibold min-w-[150px]"
                      style={{ background: '#FAFAFE', color: 'var(--text3)', borderRight: '1px solid var(--line)' }}>Category</th>
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
                  {catYear.list.map((cat, ci) => {
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
            Actual spend per category each year · click a cell to see the transactions · click a year header to open its monthly view.
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

      {drill && <TxnDrillModal title={drill.title} subtitle={drill.subtitle} items={drill.items} amt={disp} money={money} onClose={() => setDrill(null)} />}
    </div>
  )
}
