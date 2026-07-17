'use client'
import { useMemo, useState, useEffect } from 'react'
import { useViewStore } from '@/store/viewStore'
import { Download, ChevronLeft, ChevronRight, CalendarDays, CalendarRange, Target } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, Cell, Legend } from 'recharts'
import TxnDrillModal from '@/components/dashboard/TxnDrillModal'

// ─── Utilities ────────────────────────────────────────────────────────────────
function momChange(curr: number, prev: number): number | null {
  return prev === 0 ? null : Math.round((curr - prev) / prev * 100)
}

const CAT_COLORS: Record<string,string> = {
  Food:'#D97706', Shopping:'#2563EB', Utilities:'#7C3AED', Transport:'#16A34A',
  Health:'#059669', Entertainment:'#E11D48', Travel:'#EA580C', Education:'#0284C7',
  Subscription:'#EC4899', 'Personal Care':'#DB2777', 'EMI/Loan':'#9333EA', Investment:'#0EA5E9', 'Tax Payment':'#BE123C',
  Transfer:'#3B7DD8', Other:'#6B7280', 'Family Transfer':'#0EA5E9',
  'Credit Card Payment':'#9333EA', 'International Transfer':'#0EA5E9', 'NRE Received':'#0284C7',
  'NRE to NRO':'#7C5CBF', 'Self Transfer':'#0891B2', 'Loan on Card':'#F59E0B', 'Loan Received':'#F97316', Refund:'#10B981',
}
// Money-movement (transfers / receipts) — not spending
const MOVEMENT_CATS = new Set([
  'NRE Received', 'Received from NRE', 'Received from UAE', 'NRI Transfer',
  'NRE to NRO', 'NRO to NRE', 'Self Transfer', 'Internal Transfer', 'Transfer',
  'International Transfer', 'Loan Received', 'Loan Taken', 'Loan Disbursement', 'ATM Withdrawal',
])
// Card & loan bill payments — settle spend already counted elsewhere, so kept
// separate and excluded from the income − outflow math (would double-count).
const CARD_LOAN_CATS = new Set(['Credit Card Payment', 'Loan on Card'])
const classify = (c: string) => MOVEMENT_CATS.has(c) ? 'movement' : CARD_LOAN_CATS.has(c) ? 'cardloan' : 'expense'

const FALLBACK_PALETTE = ['#6366F1','#DB2777','#0D9488','#CA8A04','#C2640A','#475569','#B45309','#7C3AED']
const colorOf = (cat: string, idx: number) => CAT_COLORS[cat] ?? FALLBACK_PALETTE[idx % FALLBACK_PALETTE.length]
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
  const catOf = (t: any) => (t.category && String(t.category).trim()) || 'Other'
  const mLabel = (m: string) => new Date(m + '-01').toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })

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
  const cardLoanCats = cats.filter(c => classify(c) === 'cardloan')
  const movementCats = cats.filter(c => classify(c) === 'movement')

  const colTot = (list: string[], m: string) => list.reduce((a, c) => a + (pivot[c]?.[m] ?? 0), 0)
  const rowTot = (c: string) => months.reduce((a, m) => a + (pivot[c]?.[m] ?? 0), 0)
  const outflowCol  = (m: string) => colTot(expenseCats, m)
  const cardLoanCol = (m: string) => colTot(cardLoanCats, m)
  const movCol      = (m: string) => colTot(movementCats, m)

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
  const cardLoanGrand = months.reduce((a, m) => a + cardLoanCol(m), 0)
  const netGrand      = incomeGrand - outflowGrand
  const savingsRate   = incomeGrand > 0 ? Math.round(netGrand / incomeGrand * 100) : 0

  const activeExpense  = expenseCats.filter(c => rowTot(c) > 0).sort((a, b) => rowTot(b) - rowTot(a))
  const activeCardLoan = cardLoanCats.filter(c => rowTot(c) > 0).sort((a, b) => rowTot(b) - rowTot(a))
  const activeMovement = movementCats.filter(c => rowTot(c) > 0).sort((a, b) => rowTot(b) - rowTot(a))

  // NRE→NRO is the same money as NRE Received — count only the NRO leg
  const hasNroChain = activeMovement.includes('NRE to NRO') && activeMovement.includes('NRE Received')
  const nroCol = (m: string) => pivot['NRE to NRO']?.[m] ?? 0
  const movSpendable = hasNroChain ? months.reduce((a, m) => a + nroCol(m), 0) : months.reduce((a, m) => a + movCol(m), 0)

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
    const agg: Record<string, { income: number; outflow: number; cardloan: number }> = {}
    years.forEach(y => agg[y] = { income: 0, outflow: 0, cardloan: 0 })
    transactions.forEach(t => {
      const y = t.txn_date?.slice(0, 4); if (!y || !agg[y] || !inView(t.currency) || !inScope(t)) return
      const cls = classify(catOf(t))
      if (cls === 'expense') agg[y].outflow += disp(t)
      else if (cls === 'cardloan') agg[y].cardloan += disp(t)
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
    const header = ['Category', ...months.map(m => `${MONTH_NAMES[Number(m.slice(5)) - 1]} ${m.slice(0, 4)}`), 'Total']
    const rows = activeExpense.map(c => [c, ...months.map(m => Math.round(pivot[c]?.[m] ?? 0).toString()), Math.round(rowTot(c)).toString()])
    rows.push(['OUTFLOW TOTAL', ...months.map(m => Math.round(outflowCol(m)).toString()), Math.round(outflowGrand).toString()])
    rows.push(['INCOME', ...months.map(m => Math.round(incomeCol(m)).toString()), Math.round(incomeGrand).toString()])
    rows.push(['NET (Income − Outflow)', ...months.map(m => Math.round(netCol(m)).toString()), Math.round(netGrand).toString()])
    csvExport([header, ...rows])
  }

  const TABS: { key: Tab; label: string; icon: any }[] = [
    { key: 'monthly', label: 'Monthly', icon: CalendarDays },
    { key: 'yearly',  label: 'Yearly',  icon: CalendarRange },
    { key: 'budget',  label: 'Budget',  icon: Target },
  ]

  // Reusable: a category × month table body
  const MonthCells = ({ cat, color }: { cat: string; color: string }) => (
    <>
      {months.map(m => {
        const val = pivot[cat]?.[m] ?? 0
        const inSel = m >= fromMonth && m <= toMonth
        return (
          <td key={m} className="px-3 py-2.5 text-right font-mono"
            style={{ color: val > 0 ? 'var(--text)' : 'var(--text3)', background: inSel ? `${color}08` : 'transparent', fontWeight: val > 0 ? 600 : 400 }}>
            {val > 0
              ? <button onClick={() => setDrill({ title: cat, subtitle: mLabel(m), items: yearTxns.filter((t: any) => catOf(t) === cat && t.txn_date?.slice(0, 7) === m) })} className="hover:underline" style={{ color: 'inherit' }}>{sym}{fmt(val)}</button>
              : '—'}
          </td>
        )
      })}
    </>
  )

  return (
    <div className="space-y-5 animate-fade-up">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--text)' }}>Expense Report</h1>
          <p className="text-[12px] mt-0.5" style={{ color: 'var(--text3)' }}>
            {view === 'uae' ? 'UAE · AED' : view === 'india' ? 'India · INR' : 'Consolidated · INR'}
            {scope !== 'both' && <> · <strong>{scope.toUpperCase()} account only</strong></>} · income, spend &amp; net
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-lg border overflow-hidden" style={{ borderColor: 'var(--border)', background: 'var(--bg2)' }}>
            <button onClick={() => setViewYear(y => y - 1)} className="px-2 py-1.5 hover:bg-gray-100" style={{ color: 'var(--text3)' }}><ChevronLeft size={13} /></button>
            <span className="px-3 text-[12px] font-bold" style={{ color: 'var(--text)' }}>{viewYear}</span>
            <button onClick={() => setViewYear(y => y + 1)} className="px-2 py-1.5 hover:bg-gray-100" style={{ color: 'var(--text3)' }}><ChevronRight size={13} /></button>
          </div>
          <button onClick={handleExport} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold border transition-all"
            style={{ borderColor: 'var(--border)', color: 'var(--sage)', background: 'var(--sage-bg)' }}>
            <Download size={13} /> CSV
          </button>
        </div>
      </div>

      {/* Tabs + account scope */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex gap-1 p-1 rounded-xl w-fit wl-tabs" style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}>
          {TABS.map(({ key, label, icon: Icon }) => (
            <button key={key} onClick={() => setTab(key)}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-[12px] font-bold transition-all"
              style={tab === key ? { background: '#fff', color: 'var(--text)', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' } : { color: 'var(--text3)' }}>
              <Icon size={13} /> {label}
            </button>
          ))}
        </div>
        <div className="flex gap-1 p-1 rounded-xl w-fit wl-tabs" style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}>
          {([['both', 'NRE + NRO'], ['nre', 'NRE'], ['nro', 'NRO']] as [Scope, string][]).map(([key, label]) => (
            <button key={key} onClick={() => setScope(key)}
              className="px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all"
              style={scope === key ? { background: '#fff', color: 'var(--blue)', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' } : { color: 'var(--text3)' }}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* KPI strip — income / outflow / net / savings (hidden on Yearly, which has its own YoY table) */}
      {tab !== 'yearly' && (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: `${viewYear} Income`,  val: money(incomeGrand),  color: 'var(--income)' },
          { label: `${viewYear} Outflow`, val: money(outflowGrand), color: 'var(--expense)' },
          { label: 'Net (Income − Out)',  val: `${netGrand < 0 ? '-' : ''}${money(Math.abs(netGrand))}`, color: netGrand >= 0 ? 'var(--income)' : 'var(--rose)' },
          { label: 'Savings Rate',        val: `${savingsRate}%`,   color: savingsRate >= 20 ? 'var(--income)' : savingsRate >= 0 ? 'var(--gold)' : 'var(--rose)' },
        ].map(k => (
          <div key={k.label} className="wl-card p-3 text-center">
            <div className="text-[10px] uppercase tracking-wider mb-1" style={{ color: 'var(--text3)' }}>{k.label}</div>
            <div className="text-[16px] font-bold font-mono" style={{ color: k.color }}>{k.val}</div>
          </div>
        ))}
      </div>
      )}

      {/* ─────────────── MONTHLY TAB ─────────────── */}
      {tab === 'monthly' && (
        <>
          {/* Income vs Expense bar */}
          <div className="wl-card p-4">
            <div className="text-[11px] font-bold uppercase tracking-wider mb-3" style={{ color: 'var(--text3)' }}>Income vs Expense — {viewYear}</div>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={barData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="month" tick={{ fill: 'var(--text3)', fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: 'var(--text3)', fontSize: 10 }} axisLine={false} tickLine={false}
                  tickFormatter={(v: number) => v >= 100000 ? `${(v / 100000).toFixed(0)}L` : v >= 1000 ? `${(v / 1000).toFixed(0)}K` : String(v)} />
                <Tooltip contentStyle={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 8, fontSize: 11 }}
                  formatter={(v: any, n: any) => [`${sym}${Number(v).toLocaleString('en-IN')}`, n]} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="Income" fill="var(--income)" radius={[3, 3, 0, 0]} />
                <Bar dataKey="Expenses" fill="var(--expense)" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Expense pivot with Income + Net rows */}
          <div className="wl-card overflow-hidden">
            {activeExpense.length === 0 ? (
              <div className="text-center py-16 text-[13px]" style={{ color: 'var(--text3)' }}>No expense data for {viewYear}</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-[11px] border-collapse">
                  <thead>
                    <tr style={{ background: 'var(--bg2)', borderBottom: '2px solid var(--border)' }}>
                      <th className="sticky left-0 px-4 py-3 text-left text-[10px] uppercase tracking-wider font-bold min-w-[130px]"
                        style={{ background: 'var(--bg2)', color: 'var(--text3)', borderRight: '1px solid var(--border)' }}>Category</th>
                      {months.map(m => (
                        <th key={m} className="px-3 py-3 text-right text-[10px] uppercase tracking-wider font-bold min-w-[64px]"
                          style={{ color: 'var(--text3)', background: m >= fromMonth && m <= toMonth ? 'var(--rose-bg)' : 'var(--bg2)' }}>
                          {MONTH_NAMES[Number(m.slice(5)) - 1]}
                        </th>
                      ))}
                      <th className="px-4 py-3 text-right text-[10px] uppercase tracking-wider font-bold"
                        style={{ color: 'var(--expense)', background: 'var(--bg2)', borderLeft: '2px solid var(--border)' }}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeExpense.map((cat, ci) => {
                      const color = colorOf(cat, ci); const total = rowTot(cat)
                      return (
                        <tr key={cat} style={{ borderBottom: '1px solid var(--border)' }} className="hover:bg-stone-50 transition-colors">
                          <td className="sticky left-0 px-4 py-2.5 font-semibold min-w-[130px]"
                            style={{ background: ci % 2 === 0 ? '#fff' : 'var(--bg2)', borderRight: '1px solid var(--border)' }}>
                            <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ background: color }} /><span style={{ color: 'var(--text)' }}>{cat}</span></div>
                          </td>
                          <MonthCells cat={cat} color={color} />
                          <td className="px-4 py-2.5 text-right font-mono font-bold" style={{ color: 'var(--expense)', borderLeft: '2px solid var(--border)' }}>
                            <button onClick={() => setDrill({ title: cat, subtitle: String(viewYear), items: yearTxns.filter((t: any) => catOf(t) === cat) })} className="hover:underline" style={{ color: 'inherit' }}>{sym}{fmt(total)}</button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot>
                    {/* Outflow total */}
                    <tr style={{ borderTop: '2px solid var(--border)', background: 'var(--bg2)' }}>
                      <td className="sticky left-0 px-4 py-2.5 font-bold text-[11px] uppercase tracking-wider" style={{ background: 'var(--bg2)', color: 'var(--expense)', borderRight: '1px solid var(--border)' }}>Total Outflow</td>
                      {months.map(m => (<td key={m} className="px-3 py-2.5 text-right font-mono font-bold" style={{ color: 'var(--expense)', background: m >= fromMonth && m <= toMonth ? 'var(--rose-bg)' : 'var(--bg2)' }}>{outflowCol(m) > 0 ? `${sym}${fmt(outflowCol(m))}` : '—'}</td>))}
                      <td className="px-4 py-2.5 text-right font-mono font-bold text-[13px]" style={{ color: 'var(--expense)', borderLeft: '2px solid var(--border)' }}>{money(outflowGrand)}</td>
                    </tr>
                    {/* Income */}
                    <tr style={{ background: 'var(--income-bg)' }}>
                      <td className="sticky left-0 px-4 py-2.5 font-bold text-[11px] uppercase tracking-wider" style={{ background: 'var(--income-bg)', color: 'var(--income)', borderRight: '1px solid var(--border)' }}>Income</td>
                      {months.map(m => (<td key={m} className="px-3 py-2.5 text-right font-mono font-bold" style={{ color: 'var(--income)' }}>{incomeCol(m) > 0 ? `${sym}${fmt(incomeCol(m))}` : '—'}</td>))}
                      <td className="px-4 py-2.5 text-right font-mono font-bold text-[13px]" style={{ color: 'var(--income)', borderLeft: '2px solid var(--border)' }}>{money(incomeGrand)}</td>
                    </tr>
                    {/* Net */}
                    <tr style={{ background: 'var(--bg2)', borderTop: '1px solid var(--border)' }}>
                      <td className="sticky left-0 px-4 py-3 font-black text-[11px] uppercase tracking-wider" style={{ background: 'var(--bg2)', color: 'var(--text)', borderRight: '1px solid var(--border)' }}>Net (Inc − Out)</td>
                      {months.map(m => { const n = netCol(m); const has = incomeCol(m) > 0 || outflowCol(m) > 0
                        return (<td key={m} className="px-3 py-3 text-right font-mono font-black" style={{ color: !has ? 'var(--text3)' : n >= 0 ? 'var(--income)' : 'var(--rose)' }}>{has ? `${n < 0 ? '-' : ''}${sym}${fmt(Math.abs(n))}` : '—'}</td>) })}
                      <td className="px-4 py-3 text-right font-mono font-black text-[13px]" style={{ color: netGrand >= 0 ? 'var(--income)' : 'var(--rose)', borderLeft: '2px solid var(--border)' }}>{netGrand < 0 ? '-' : ''}{money(Math.abs(netGrand))}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
            <div className="px-4 py-2 text-[10px]" style={{ color: 'var(--text3)', borderTop: '1px solid var(--border)' }}>
              Net = income − outflow (incl. Investment & EMI). Card & loan bill payments and transfers are excluded to avoid double-counting.
            </div>
          </div>

          {/* Card & Loan payments — separate */}
          {activeCardLoan.length > 0 && (
            <SideTable title="Card & Loan Bill Payments — settle spend counted above"
              note="Excluded from the income − outflow math to avoid double-counting."
              cats={activeCardLoan} months={months} pivot={pivot} colFn={cardLoanCol} grand={cardLoanGrand}
              sym={sym} fromMonth={fromMonth} toMonth={toMonth} fmt={fmt} money={money} accent="#F59E0B" />
          )}

          {/* Money movement */}
          {activeMovement.length > 0 && (
            <SideTable title="Transfers & Money Received — not expenses"
              note={hasNroChain ? 'UAE → NRE → NRO is the same money; only the NRO amount is counted as spendable.' : 'NRE credits, inter-account & remittance movement.'}
              totalLabel={hasNroChain ? 'Reached NRO (spendable)' : 'Total moved'}
              cats={activeMovement} months={months} pivot={pivot}
              colFn={hasNroChain ? nroCol : movCol} grand={movSpendable}
              sym={sym} fromMonth={fromMonth} toMonth={toMonth} fmt={fmt} money={money} accent="var(--blue)" />
          )}

          {/* Category share */}
          {activeExpense.length > 0 && (
            <div className="wl-card p-4">
              <div className="text-[11px] font-bold uppercase tracking-wider mb-3" style={{ color: 'var(--text3)' }}>Where it goes — {viewYear}</div>
              <div className="space-y-2">
                {activeExpense.map((cat, ci) => {
                  const pct = outflowGrand > 0 ? (rowTot(cat) / outflowGrand) * 100 : 0
                  const color = colorOf(cat, ci)
                  return (
                    <div key={cat} className="flex items-center gap-3">
                      <div className="text-[11px] font-medium w-28 flex-shrink-0 truncate" style={{ color: 'var(--text2, var(--text))' }}>{cat}</div>
                      <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: 'var(--bg2)' }}><div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} /></div>
                      <div className="text-[11px] font-mono font-semibold w-12 text-right" style={{ color }}>{pct.toFixed(1)}%</div>
                      <div className="text-[11px] font-mono w-20 text-right" style={{ color: 'var(--text)' }}>{money(rowTot(cat))}</div>
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
                  <tr style={{ background: 'var(--bg2)', borderBottom: '2px solid var(--border)' }}>
                    <th className="sticky left-0 px-4 py-3 text-left text-[10px] uppercase tracking-wider font-bold min-w-[150px]"
                      style={{ background: 'var(--bg2)', color: 'var(--text3)', borderRight: '1px solid var(--border)' }}>Category</th>
                    {yearsSorted.map(y => (
                      <th key={y} className="px-4 py-3 text-right text-[11px] font-bold min-w-[90px]"
                        style={{ color: y === String(viewYear) ? 'var(--sage)' : 'var(--text3)', background: y === String(viewYear) ? 'var(--sage-bg)' : 'var(--bg2)' }}>
                        <button onClick={() => setViewYear(parseInt(y))} className="hover:underline">{y}</button>
                      </th>
                    ))}
                    <th className="px-4 py-3 text-right text-[10px] uppercase tracking-wider font-bold" style={{ color: 'var(--expense)', background: 'var(--bg2)', borderLeft: '2px solid var(--border)' }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {catYear.list.map((cat, ci) => {
                    const rowTotal = yearsSorted.reduce((a, y) => a + (catYear.matrix[cat]?.[y] ?? 0), 0)
                    return (
                      <tr key={cat} style={{ borderBottom: '1px solid var(--border)' }} className="hover:bg-stone-50 transition-colors">
                        <td className="sticky left-0 px-4 py-2.5 font-semibold" style={{ background: ci % 2 === 0 ? '#fff' : 'var(--bg2)', borderRight: '1px solid var(--border)' }}>
                          <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ background: colorOf(cat, ci) }} /><span style={{ color: 'var(--text)' }}>{cat}</span></div>
                        </td>
                        {yearsSorted.map(y => { const v = catYear.matrix[cat]?.[y] ?? 0
                          return (
                            <td key={y} className="px-4 py-2.5 text-right font-mono" style={{ color: v > 0 ? 'var(--text)' : 'var(--text3)', fontWeight: v > 0 ? 600 : 400, background: y === String(viewYear) ? 'rgba(0,0,0,0.02)' : 'transparent' }}>
                              {v > 0
                                ? <button onClick={() => setDrill({ title: cat, subtitle: y, items: transactions.filter((t: any) => catOf(t) === cat && t.txn_date?.slice(0, 4) === y && inView(t.currency) && inScope(t)) })} className="hover:underline" style={{ color: 'inherit' }}>{sym}{fmt(v)}</button>
                                : '—'}
                            </td>
                          )
                        })}
                        <td className="px-4 py-2.5 text-right font-mono font-bold" style={{ color: 'var(--expense)', borderLeft: '2px solid var(--border)' }}>{money(rowTotal)}</td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  {/* Total Outflow */}
                  <tr style={{ borderTop: '2px solid var(--border)', background: 'var(--bg2)' }}>
                    <td className="sticky left-0 px-4 py-2.5 font-bold text-[11px] uppercase tracking-wider" style={{ background: 'var(--bg2)', color: 'var(--expense)', borderRight: '1px solid var(--border)' }}>Total Outflow</td>
                    {yearsSorted.map(y => (<td key={y} className="px-4 py-2.5 text-right font-mono font-bold" style={{ color: 'var(--expense)' }}>{yearAgg[y].outflow > 0 ? `${sym}${fmt(yearAgg[y].outflow)}` : '—'}</td>))}
                    <td className="px-4 py-2.5 text-right font-mono font-bold text-[13px]" style={{ color: 'var(--expense)', borderLeft: '2px solid var(--border)' }}>{money(yearsSorted.reduce((a, y) => a + yearAgg[y].outflow, 0))}</td>
                  </tr>
                  {/* Income */}
                  <tr style={{ background: 'var(--income-bg)' }}>
                    <td className="sticky left-0 px-4 py-2.5 font-bold text-[11px] uppercase tracking-wider" style={{ background: 'var(--income-bg)', color: 'var(--income)', borderRight: '1px solid var(--border)' }}>Income</td>
                    {yearsSorted.map(y => (<td key={y} className="px-4 py-2.5 text-right font-mono font-bold" style={{ color: 'var(--income)' }}>{(catYear.inc[y] ?? 0) > 0 ? `${sym}${fmt(catYear.inc[y])}` : '—'}</td>))}
                    <td className="px-4 py-2.5 text-right font-mono font-bold text-[13px]" style={{ color: 'var(--income)', borderLeft: '2px solid var(--border)' }}>{money(yearsSorted.reduce((a, y) => a + (catYear.inc[y] ?? 0), 0))}</td>
                  </tr>
                  {/* Net */}
                  <tr style={{ background: 'var(--bg2)', borderTop: '1px solid var(--border)' }}>
                    <td className="sticky left-0 px-4 py-3 font-black text-[11px] uppercase tracking-wider" style={{ background: 'var(--bg2)', color: 'var(--text)', borderRight: '1px solid var(--border)' }}>Net (Inc − Out)</td>
                    {yearsSorted.map(y => { const n = (catYear.inc[y] ?? 0) - yearAgg[y].outflow
                      return (<td key={y} className="px-4 py-3 text-right font-mono font-black" style={{ color: n >= 0 ? 'var(--income)' : 'var(--rose)' }}>{n < 0 ? '-' : ''}{sym}{fmt(Math.abs(n))}</td>) })}
                    <td className="px-4 py-3 text-right font-mono font-black text-[13px]" style={{ borderLeft: '2px solid var(--border)', color: (yearsSorted.reduce((a, y) => a + ((catYear.inc[y] ?? 0) - yearAgg[y].outflow), 0)) >= 0 ? 'var(--income)' : 'var(--rose)' }}>
                      {(() => { const t = yearsSorted.reduce((a, y) => a + ((catYear.inc[y] ?? 0) - yearAgg[y].outflow), 0); return `${t < 0 ? '-' : ''}${money(Math.abs(t))}` })()}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
          <div className="px-4 py-2 text-[10px]" style={{ color: 'var(--text3)', borderTop: '1px solid var(--border)' }}>
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
                  <tr style={{ background: 'var(--bg2)', borderBottom: '2px solid var(--border)' }}>
                    <th className="sticky left-0 px-4 py-3 text-left text-[10px] uppercase tracking-wider font-bold min-w-[130px]" style={{ background: 'var(--bg2)', color: 'var(--text3)', borderRight: '1px solid var(--border)' }}>Category</th>
                    <th className="px-3 py-3 text-right text-[10px] uppercase tracking-wider font-bold" style={{ background: 'var(--bg2)', color: 'var(--sage)', borderRight: '1px solid var(--border)' }}>Budget /mo</th>
                    {months.map(m => (<th key={m} className="px-2 py-3 text-center text-[10px] uppercase tracking-wider font-bold min-w-[60px]" style={{ color: 'var(--text3)', background: m >= fromMonth && m <= toMonth ? 'var(--sage-bg)' : 'var(--bg2)' }}>{MONTH_NAMES[Number(m.slice(5)) - 1]}</th>))}
                  </tr>
                </thead>
                <tbody>
                  {budgetCats.map((cat, ci) => {
                    const cap = budgetCapMap[cat]
                    return (
                      <tr key={cat} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td className="sticky left-0 px-4 py-2.5 font-semibold" style={{ background: ci % 2 === 0 ? '#fff' : 'var(--bg2)', borderRight: '1px solid var(--border)' }}>
                          <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ background: colorOf(cat, ci) }} /><span style={{ color: 'var(--text)' }}>{cat}</span></div>
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono font-bold" style={{ color: 'var(--text)', borderRight: '1px solid var(--border)' }}>{money(cap)}</td>
                        {months.map(m => {
                          const spent = pivot[cat]?.[m] ?? 0
                          const pct = cap > 0 ? Math.round(spent / cap * 100) : 0
                          const bg = spent === 0 ? 'transparent' : pct >= 100 ? '#FEE2E2' : pct >= 75 ? '#FEF3C7' : '#DCFCE7'
                          const fg = spent === 0 ? 'var(--text3)' : pct >= 100 ? '#B91C1C' : pct >= 75 ? '#B45309' : '#15803D'
                          return (
                            <td key={m} className="px-2 py-2.5 text-center" style={{ background: bg }}>
                              {spent > 0
                                ? <button onClick={() => setDrill({ title: `${cat} · budget ${money(cap)}`, subtitle: mLabel(m), items: yearTxns.filter((t: any) => catOf(t) === cat && t.txn_date?.slice(0, 7) === m) })} className="font-mono" style={{ color: fg }}>
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
          <div className="px-4 py-2.5 border-t flex flex-wrap gap-4 text-[10px]" style={{ borderColor: 'var(--border)', color: 'var(--text3)' }}>
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

// A compact category × month table with a header total (used for Card&Loan + Movement)
function SideTable({ title, note, totalLabel = 'Total', cats, months, pivot, colFn, grand, sym, fromMonth, toMonth, fmt, money, accent }: any) {
  return (
    <div className="wl-card overflow-hidden">
      <div className="px-4 py-3 flex items-center justify-between flex-wrap gap-2" style={{ background: 'var(--bg2)', borderBottom: '1px solid var(--border)' }}>
        <div>
          <div className="text-[12px] font-bold" style={{ color: 'var(--text)' }}>{title}</div>
          <div className="text-[10px] mt-0.5" style={{ color: 'var(--text3)' }}>{note}</div>
        </div>
        <div className="text-right">
          <div className="text-[9px] uppercase tracking-wider font-bold" style={{ color: 'var(--text3)' }}>{totalLabel}</div>
          <div className="text-[15px] font-black font-mono" style={{ color: accent }}>{money(grand)}</div>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[11px] border-collapse">
          <thead>
            <tr style={{ background: 'var(--bg2)', borderBottom: '1px solid var(--border)' }}>
              <th className="sticky left-0 px-4 py-2.5 text-left text-[10px] uppercase tracking-wider font-bold min-w-[130px]" style={{ background: 'var(--bg2)', color: 'var(--text3)', borderRight: '1px solid var(--border)' }}>Category</th>
              {months.map((m: string) => (<th key={m} className="px-3 py-2.5 text-right text-[10px] uppercase tracking-wider font-bold min-w-[64px]" style={{ color: 'var(--text3)', background: m >= fromMonth && m <= toMonth ? 'var(--bg2)' : 'var(--bg2)' }}>{['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][Number(m.slice(5)) - 1]}</th>))}
              <th className="px-4 py-2.5 text-right text-[10px] uppercase tracking-wider font-bold" style={{ color: accent, background: 'var(--bg2)', borderLeft: '2px solid var(--border)' }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {cats.map((cat: string, ci: number) => {
              const total = months.reduce((a: number, m: string) => a + (pivot[cat]?.[m] ?? 0), 0)
              return (
                <tr key={cat} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td className="sticky left-0 px-4 py-2.5 font-semibold" style={{ background: ci % 2 === 0 ? '#fff' : 'var(--bg2)', borderRight: '1px solid var(--border)' }}>
                    <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ background: colorOf(cat, ci) }} /><span style={{ color: 'var(--text)' }}>{cat}</span></div>
                  </td>
                  {months.map((m: string) => { const val = pivot[cat]?.[m] ?? 0
                    return (<td key={m} className="px-3 py-2.5 text-right font-mono" style={{ color: val > 0 ? 'var(--text)' : 'var(--text3)', fontWeight: val > 0 ? 600 : 400 }}>{val > 0 ? `${sym}${fmt(val)}` : '—'}</td>) })}
                  <td className="px-4 py-2.5 text-right font-mono font-bold" style={{ color: accent, borderLeft: '2px solid var(--border)' }}>{money(total)}</td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr style={{ borderTop: '2px solid var(--border)', background: 'var(--bg2)' }}>
              <td className="sticky left-0 px-4 py-2.5 font-bold text-[11px] uppercase tracking-wider" style={{ background: 'var(--bg2)', color: 'var(--text)', borderRight: '1px solid var(--border)' }}>{totalLabel}</td>
              {months.map((m: string) => { const val = colFn(m)
                return (<td key={m} className="px-3 py-2.5 text-right font-mono font-bold" style={{ color: accent }}>{val > 0 ? `${sym}${fmt(val)}` : '—'}</td>) })}
              <td className="px-4 py-2.5 text-right font-mono font-bold text-[13px]" style={{ color: accent, borderLeft: '2px solid var(--border)' }}>{money(grand)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
