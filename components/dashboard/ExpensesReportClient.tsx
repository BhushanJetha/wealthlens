'use client'
import { useMemo, useState, useEffect } from 'react'
import { useViewStore } from '@/store/viewStore'
import { Download, ChevronLeft, ChevronRight, CalendarDays, CalendarRange, Target, CreditCard, Landmark, Wallet, Link2Off } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, Cell, Legend } from 'recharts'
import TxnDrillModal from '@/components/dashboard/TxnDrillModal'
import { CC_BILL, classify, labelOf, catOf } from '@/lib/money'
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
  'Trip/Vacation':'#0D9488', 'Event/Function':'#C026D3',
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
const NRE_CATS = new Set(['NRE Received', 'NRE to NRO', 'NRE → NRO', 'International Transfer'])
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

export default function ExpensesReportClient({ transactions, incomeTransactions = [], budgets = [] }:
  { transactions: any[]; incomeTransactions?: any[]; budgets?: any[] }) {
  const { view, fromMonth, toMonth, fxRate: FX } = useViewStore()

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
  const inScope = (t: any) => scope === 'both' || acctScope(t) === scope
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

  const outflowGrand  = months.reduce((a, m) => a + outflowCol(m), 0)
  const incomeGrand   = months.reduce((a, m) => a + incomeCol(m), 0)
  const netGrand      = incomeGrand - outflowGrand
  const savingsRate   = incomeGrand > 0 ? Math.round(netGrand / incomeGrand * 100) : 0

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
          <KpiTile label="Net (income − expenses)" value={`${netGrand < 0 ? '−' : ''}${money(Math.abs(netGrand))}`} tone={netGrand >= 0 ? 'good' : 'bad'} tint={3} icon={Landmark}
            delta={netGrand >= 0 ? 'kept this year' : 'spent more than came in'} />
          <KpiTile label="Savings rate" value={`${savingsRate}%`} tone={savingsRate >= 20 ? 'good' : 'bad'} tint={2} icon={Target} delta="target 20%" />
        </div>
      )}

      {/* ─────────────── MONTHLY TAB ─────────────── */}
      {tab === 'monthly' && (
        <>
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
                      <td className="sticky left-0 px-4 py-3 font-black text-[11px] uppercase tracking-wider" style={{ background: '#FAFAFE', color: 'var(--text)', borderRight: '1px solid var(--line)' }}>Net (Inc − Exp)</td>
                      {months.map(m => { const n = netCol(m); const has = incomeCol(m) > 0 || outflowCol(m) > 0
                        return (<td key={m} className="px-3 py-3 text-right tabular-nums font-black" style={{ color: !has ? 'var(--text3)' : n >= 0 ? 'var(--income)' : 'var(--rose)' }}>{has ? `${n < 0 ? '-' : ''}${sym}${fmt(Math.abs(n))}` : '—'}</td>) })}
                      <td className="px-4 py-3 text-right tabular-nums font-black text-[13px]" style={{ color: netGrand >= 0 ? 'var(--income)' : 'var(--rose)', borderLeft: '2px solid var(--line)' }}>{netGrand < 0 ? '-' : ''}{money(Math.abs(netGrand))}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
            <div className="px-4 py-2 text-[10px]" style={{ color: 'var(--text3)', borderTop: '1px solid var(--line)' }}>
              Total Monthly Expenses = every spend category, incl. money sent (Money Transfer, Transfer to India, Family), Investment &amp; EMI.
              The credit card bill only settles card spend already counted above, and moves between your own accounts / money received are the same money — so those are shown but not summed.
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
