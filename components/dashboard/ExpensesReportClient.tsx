'use client'
import { useMemo, useState, useEffect } from 'react'
import { useViewStore } from '@/store/viewStore'
import { Download, ChevronLeft, ChevronRight } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, Cell } from 'recharts'
import TxnDrillModal from '@/components/dashboard/TxnDrillModal'

// ─── Analytics Utilities ────────────────────────────────────────────────────

function linearForecast(values: number[], steps = 3): number[] {
  const n = values.length
  if (n < 2) return Array(steps).fill(values[0] ?? 0)
  const xMean = (n - 1) / 2
  const yMean = values.reduce((a, v) => a + v, 0) / n
  const denom = values.reduce((a, _, i) => a + (i - xMean) ** 2, 0)
  const slope = denom === 0 ? 0 : values.reduce((a, v, i) => a + (i - xMean) * (v - yMean), 0) / denom
  const intercept = yMean - slope * xMean
  return Array.from({ length: steps }, (_, k) => Math.max(0, Math.round(intercept + slope * (n + k))))
}

function zScores(values: number[]): number[] {
  const mean = values.reduce((a, v) => a + v, 0) / values.length
  const std = Math.sqrt(values.reduce((a, v) => a + (v - mean) ** 2, 0) / values.length)
  return values.map(v => std === 0 ? 0 : (v - mean) / std)
}

function momChange(curr: number, prev: number): number | null {
  return prev === 0 ? null : Math.round((curr - prev) / prev * 100)
}

// ─── Constants ───────────────────────────────────────────────────────────────

const CAT_COLORS: Record<string,string> = {
  Food:'#D97706', Shopping:'#2563EB', Utilities:'#7C3AED', Transport:'#16A34A',
  Health:'#059669', Entertainment:'#E11D48', Travel:'#EA580C', Education:'#0284C7',
  Subscription:'#EC4899', 'Personal Care':'#DB2777', 'EMI/Loan':'#9333EA', Investment:'#0EA5E9',
  Transfer:'#3B7DD8', Other:'#6B7280',
  // Transfers / payments / loans (so they show by name, not lumped into "Other")
  'Credit Card Payment':'#9333EA', 'International Transfer':'#0EA5E9', 'NRE Received':'#0284C7',
  'NRE to NRO':'#7C5CBF', 'NRO to Family':'#3D7A58', 'Self Transfer':'#0891B2',
  'Family Transfer':'#0EA5E9', 'Loan on Card':'#F59E0B', 'Loan Received':'#F97316', Refund:'#10B981',
}
// Money-movement categories — transfers between the user's own accounts and
// money received (NRE credits, remittances, loan inflows). These are NOT
// spending, so they're pulled out of the expense totals and shown separately.
const MOVEMENT_CATS = new Set([
  'NRE Received', 'Received from NRE', 'Received from UAE', 'NRI Transfer',
  'NRE to NRO', 'NRO to NRE', 'Self Transfer', 'Internal Transfer', 'Transfer',
  'International Transfer', 'Loan Received', 'Loan Taken', 'Loan Disbursement',
  'ATM Withdrawal',
])
const isMovement = (cat: string) => MOVEMENT_CATS.has(cat)

// A palette to colour any category we don't have an explicit colour for
const FALLBACK_PALETTE = ['#6366F1','#DB2777','#0D9488','#CA8A04','#C2640A','#475569','#B45309','#7C3AED']
function colorOf(cat: string, idx: number): string {
  return CAT_COLORS[cat] ?? FALLBACK_PALETTE[idx % FALLBACK_PALETTE.length]
}
const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function buildMonths(from: string, to: string): string[] {
  const months: string[] = []
  let cur = from
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
  if (n >= 100000) return `${(n / 100000).toFixed(1)}L`
  if (n >= 1000)   return `${(n / 1000).toFixed(0)}K`
  return String(Math.round(n))
}

function csvExport(rows: string[][]): void {
  const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.download = 'expenses_report.csv'; a.click()
  URL.revokeObjectURL(url)
}

export default function ExpensesReportClient({ transactions }: { transactions: any[] }) {
  const { view, fromMonth, toMonth, fxRate: FX } = useViewStore()

  const toDisplay = (amt: number, cur: string) =>
    view === 'consolidated' ? (cur === 'AED' ? amt * FX : amt) : amt
  const sym = view === 'uae' ? 'AED ' : '₹'
  const amtOf = (t: any) => toDisplay(Number(t.amount) || 0, t.currency)
  const catOf = (t: any) => (t.category && String(t.category).trim()) || 'Other'
  const moneyFull = (n: number) => `${sym}${Math.round(n).toLocaleString('en-IN')}`
  const mLabel = (m: string) => new Date(m + '-01').toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })

  const [viewYear, setViewYear] = useState(() => parseInt(fromMonth.slice(0, 4)))
  const [drill, setDrill] = useState<{ title: string; subtitle?: string; items: any[] } | null>(null)

  // Sync year when the date-range control in the topbar changes
  useEffect(() => {
    setViewYear(parseInt(fromMonth.slice(0, 4)))
  }, [fromMonth])

  const yearFrom = `${viewYear}-01`
  const yearTo   = `${viewYear}-12`
  const months   = buildMonths(yearFrom, yearTo)

  const yearTxns = useMemo(() => transactions.filter(t => {
    const m = t.txn_date?.slice(0, 7) ?? ''
    if (m < yearFrom || m > yearTo) return false
    if (view === 'uae'   && t.currency !== 'AED') return false
    if (view === 'india' && t.currency !== 'INR') return false
    return true
  }), [transactions, viewYear, view])

  // Build pivot: category → month → total. Uses each txn's REAL category
  // (only truly blank categories fall back to "Other") so Credit Card Payment,
  // International Transfer, etc. show by name instead of being lumped together.
  const pivot = useMemo(() => {
    const map: Record<string, Record<string, number>> = {}
    yearTxns.forEach(t => {
      const m = t.txn_date?.slice(0, 7)
      if (!m) return
      const cat = (t.category && String(t.category).trim()) || 'Other'
      if (!map[cat]) map[cat] = {}
      map[cat][m] = (map[cat][m] ?? 0) + toDisplay(Number(t.amount), t.currency)
    })
    return map
  }, [yearTxns, view])

  const cats = useMemo(() => Object.keys(pivot), [pivot])
  // Split real spending from money movement (transfers / receipts)
  const expenseCatsAll  = useMemo(() => cats.filter(c => !isMovement(c)), [cats])
  const movementCatsAll = useMemo(() => cats.filter(c =>  isMovement(c)), [cats])

  // Expense monthly totals (excludes transfers/receipts)
  const colTotals = useMemo(() => {
    const totals: Record<string, number> = {}
    months.forEach(m => { totals[m] = expenseCatsAll.reduce((a, cat) => a + (pivot[cat]?.[m] ?? 0), 0) })
    return totals
  }, [pivot, months, expenseCatsAll])

  // Movement monthly totals (separate table)
  const movColTotals = useMemo(() => {
    const totals: Record<string, number> = {}
    months.forEach(m => { totals[m] = movementCatsAll.reduce((a, cat) => a + (pivot[cat]?.[m] ?? 0), 0) })
    return totals
  }, [pivot, months, movementCatsAll])

  const rowTotals = useMemo(() => {
    const totals: Record<string, number> = {}
    cats.forEach(cat => { totals[cat] = months.reduce((a, m) => a + (pivot[cat]?.[m] ?? 0), 0) })
    return totals
  }, [pivot, months, cats])

  const grandTotal    = months.reduce((a, m) => a + (colTotals[m] ?? 0), 0)
  const movGrandTotal = months.reduce((a, m) => a + (movColTotals[m] ?? 0), 0)
  const activeCats    = expenseCatsAll.filter(cat => rowTotals[cat] > 0).sort((a, b) => rowTotals[b] - rowTotals[a])
  const activeMovementCats = movementCatsAll.filter(cat => rowTotals[cat] > 0).sort((a, b) => rowTotals[b] - rowTotals[a])
  const peakMonth     = months.reduce((best, m) => (colTotals[m] ?? 0) > (colTotals[best] ?? 0) ? m : best, months[0])

  // Money flows UAE → NRE → NRO, so "NRE Received" and "NRE to NRO" are the SAME
  // rupees. Summing them double-counts. The amount that actually reaches the
  // account you spend/invest from (NRO) is the real figure — count that only.
  const NRO_REACH_CAT = 'NRE to NRO'
  const hasNroChain   = activeMovementCats.includes(NRO_REACH_CAT) && activeMovementCats.includes('NRE Received')
  const nroCol        = (m: string) => pivot[NRO_REACH_CAT]?.[m] ?? 0
  const spendableTotal = hasNroChain ? months.reduce((a, m) => a + nroCol(m), 0) : movGrandTotal

  // ─── Analytics: Monthly totals for forecasting & anomaly detection ────────
  const monthlyTotals = useMemo(() => {
    return Array.from({ length: 12 }, (_, i) => {
      const m = `${viewYear}-${String(i + 1).padStart(2, '0')}`
      return transactions
        .filter((t: any) => t.txn_date?.slice(0, 7) === m && t.txn_type === 'expense')
        .reduce((a: number, t: any) => {
          if (view === 'uae' && t.currency !== 'AED') return a
          if (view === 'india' && t.currency !== 'INR') return a
          return a + (view === 'consolidated' ? Number(t.amount) * (t.currency === 'AED' ? FX : 1) : Number(t.amount))
        }, 0)
    })
  }, [transactions, view, FX, viewYear])

  const validMonthTotals = monthlyTotals.filter(v => v > 0)
  const avgMonthlySpend = validMonthTotals.length > 0
    ? Math.round(validMonthTotals.reduce((a, v) => a + v, 0) / validMonthTotals.length)
    : 0
  const forecastValues = linearForecast(validMonthTotals.slice(-6), 3)
  const stdDev = validMonthTotals.length > 1
    ? Math.round(Math.sqrt(validMonthTotals.reduce((a, v) => a + (v - avgMonthlySpend) ** 2, 0) / validMonthTotals.length))
    : 0
  const zs = zScores(monthlyTotals.length > 0 ? monthlyTotals : [0])
  const anomalyMonths = MONTH_NAMES
    .map((label: string, i: number) => ({ label, z: zs[i] ?? 0, value: monthlyTotals[i] ?? 0 }))
    .filter(({ z, value }: { z: number; value: number }) => Math.abs(z) > 1.8 && value > 0)

  // Bar chart data — all 12 months
  const barData = months.map(m => ({
    month: MONTH_NAMES[Number(m.slice(5)) - 1],
    value: Math.round(colTotals[m] ?? 0),
    inRange: m >= fromMonth && m <= toMonth,
  }))

  function handleExport() {
    const header = ['Category', ...months.map(m => `${MONTH_NAMES[Number(m.slice(5))-1]} ${m.slice(0,4)}`), 'Total']
    const dataRows = activeCats.map(cat => [
      cat,
      ...months.map(m => Math.round(pivot[cat]?.[m] ?? 0).toString()),
      Math.round(rowTotals[cat]).toString(),
    ])
    const totalRow = ['TOTAL', ...months.map(m => Math.round(colTotals[m] ?? 0).toString()), Math.round(grandTotal).toString()]
    csvExport([header, ...dataRows, totalRow])
  }

  return (
    <div className="space-y-5 animate-fade-up">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--text)' }}>Expense Report</h1>
          <p className="text-[12px] mt-0.5" style={{ color: 'var(--text3)' }}>
            Monthly breakdown · {view === 'uae' ? 'UAE · AED' : view === 'india' ? 'India · INR' : 'Consolidated · INR'} · transfers &amp; money received shown separately
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-lg border overflow-hidden" style={{ borderColor:'var(--border)', background:'var(--bg2)' }}>
            <button onClick={() => setViewYear(y => y - 1)} className="px-2 py-1.5 hover:bg-gray-100" style={{ color:'var(--text3)' }}>
              <ChevronLeft size={13} />
            </button>
            <span className="px-3 text-[12px] font-bold" style={{ color:'var(--text)' }}>{viewYear}</span>
            <button onClick={() => setViewYear(y => y + 1)} className="px-2 py-1.5 hover:bg-gray-100" style={{ color:'var(--text3)' }}>
              <ChevronRight size={13} />
            </button>
          </div>
          <button onClick={handleExport}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold border transition-all"
            style={{ borderColor:'var(--border)', color:'var(--sage)', background:'var(--sage-bg)' }}>
            <Download size={13} /> Export CSV
          </button>
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Annual Total',       val: `${sym}${Math.round(grandTotal).toLocaleString('en-IN')}`,          color: 'var(--expense)' },
          { label: 'Monthly Avg',        val: `${sym}${Math.round(grandTotal/12).toLocaleString('en-IN')}`,       color: 'var(--text)' },
          { label: 'Peak Month',         val: peakMonth ? MONTH_NAMES[Number(peakMonth.slice(5))-1] : '—',        color: 'var(--gold)' },
          { label: 'Active Categories',  val: String(activeCats.length),                                          color: 'var(--blue)' },
        ].map(k => (
          <div key={k.label} className="wl-card p-3 text-center">
            <div className="text-[10px] uppercase tracking-wider mb-1" style={{ color:'var(--text3)' }}>{k.label}</div>
            <div className="text-[16px] font-bold font-mono" style={{ color: k.color }}>{k.val}</div>
          </div>
        ))}
      </div>

      {/* Anomaly Detection Banner */}
      {anomalyMonths.length > 0 && (
        <div className="wl-card p-4 space-y-2">
          <div className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--gold)' }}>
            ⚠ Spending Intelligence
          </div>
          {anomalyMonths.map(({ label, z, value }: { label: string; z: number; value: number }) => (
            <div key={label} className="flex items-center gap-3 rounded-lg px-3 py-2"
              style={{
                background: z > 0 ? 'rgba(244,63,94,0.06)' : 'rgba(16,185,129,0.06)',
                border: `1px solid ${z > 0 ? 'rgba(244,63,94,0.3)' : 'rgba(16,185,129,0.3)'}`,
              }}>
              <span className="text-[13px]">{z > 0 ? '⚠' : '✓'}</span>
              <span className="text-[12px] font-medium" style={{ color: 'var(--text)' }}>
                {label}: {sym}{Math.round(value).toLocaleString('en-IN')} —{' '}
                {z > 0
                  ? `${Math.round(Math.abs(z) * 100 / 1.8)}% above your usual spending — unusual spike`
                  : 'Lower than usual — great discipline!'}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Monthly bar chart — recharts */}
      <div className="wl-card p-4">
        <div className="text-[11px] font-bold uppercase tracking-wider mb-3" style={{ color:'var(--text3)' }}>
          Monthly Spend — {viewYear} <span className="font-normal">(highlighted = selected date range)</span>
        </div>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={barData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="month" tick={{ fill:'var(--text3)', fontSize:10 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill:'var(--text3)', fontSize:10 }} axisLine={false} tickLine={false}
              tickFormatter={v => v >= 100000 ? `${(v/100000).toFixed(0)}L` : v >= 1000 ? `${(v/1000).toFixed(0)}K` : String(v)} />
            <Tooltip
              contentStyle={{ background:'#fff', border:'1px solid var(--border)', borderRadius:8, fontSize:11 }}
              formatter={(v:any) => [`${sym}${Number(v).toLocaleString('en-IN')}`, 'Expenses']}
              labelStyle={{ color:'var(--text)' }} />
            <Bar dataKey="value" radius={[4,4,0,0]}>
              {barData.map((d, i) => (
                <Cell key={i} fill={d.inRange ? 'var(--expense)' : 'var(--border2, #D1D5DB)'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Spending Forecast — Next 3 Months */}
      {forecastValues.length > 0 && avgMonthlySpend > 0 && (
        <div className="wl-card p-4">
          <div className="text-[11px] font-bold uppercase tracking-wider mb-3" style={{ color: 'var(--text3)' }}>
            Spending Forecast · Next 3 Months
          </div>
          <div className="grid grid-cols-3 gap-3">
            {forecastValues.map((val, i) => {
              const d = new Date(); d.setMonth(d.getMonth() + i + 1)
              const label = d.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' })
              const isHigher = val > avgMonthlySpend
              return (
                <div key={i} className="rounded-xl p-3 text-center"
                  style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}>
                  <div className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--text3)' }}>
                    {label} (est)
                  </div>
                  <div className="text-[20px] font-bold font-mono" style={{ color: isHigher ? 'var(--rose)' : 'var(--income)' }}>
                    {sym}{val.toLocaleString('en-IN')}
                  </div>
                  <div className="text-[10px] mt-1" style={{ color: 'var(--text3)' }}>
                    ±{sym}{stdDev.toLocaleString('en-IN')}
                  </div>
                  <div className="text-[10px] mt-0.5 font-semibold" style={{ color: isHigher ? 'var(--rose)' : 'var(--income)' }}>
                    {isHigher ? '▲' : '▼'} vs avg
                  </div>
                </div>
              )
            })}
          </div>
          <div className="text-[10px] mt-2" style={{ color: 'var(--text3)' }}>
            Based on {validMonthTotals.length}-month linear trend · Avg: {sym}{avgMonthlySpend.toLocaleString('en-IN')}/month
          </div>
        </div>
      )}

      {/* Day-of-Week Spending Heatmap */}
      {(() => {
        const daySpend = Array(7).fill(0)
        const inRangeCheck = (txnDate: string) => {
          const m = txnDate?.slice(0, 7) ?? ''
          return m >= fromMonth && m <= toMonth
        }
        transactions
          .filter((t: any) => t.txn_type === 'expense' && inRangeCheck(t.txn_date))
          .forEach((t: any) => {
            const day = new Date(t.txn_date).getDay()
            let amt = 0
            if (view === 'uae' && t.currency !== 'AED') amt = 0
            else if (view === 'india' && t.currency !== 'INR') amt = 0
            else if (view === 'consolidated') amt = Number(t.amount) * (t.currency === 'AED' ? FX : 1)
            else amt = Number(t.amount)
            daySpend[day] += amt
          })
        const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
        const maxSpend = Math.max(...daySpend, 1)
        const peakDay = DAY_LABELS[daySpend.indexOf(Math.max(...daySpend))]
        if (maxSpend === 1) return null
        return (
          <div className="wl-card p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--text3)' }}>
                Spending by Day of Week
              </div>
              <div className="text-[11px]" style={{ color: 'var(--text3)' }}>
                Peak: <span className="font-semibold" style={{ color: 'var(--expense)' }}>{peakDay}</span>
              </div>
            </div>
            <div className="grid grid-cols-7 gap-1">
              {DAY_LABELS.map((day, i) => {
                const pct = daySpend[i] / maxSpend
                return (
                  <div key={day} className="flex flex-col items-center gap-1">
                    <div className="text-[9px] font-semibold" style={{ color: 'var(--text3)' }}>{day}</div>
                    <div className="w-full rounded-lg relative overflow-hidden" style={{ height: 60, background: 'var(--bg2)' }}>
                      <div className="absolute bottom-0 w-full rounded-lg transition-all"
                        style={{
                          height: `${pct * 100}%`,
                          background: pct > 0.7 ? 'var(--rose)' : pct > 0.4 ? 'var(--gold)' : 'var(--sage)',
                          opacity: 0.8,
                        }} />
                    </div>
                    <div className="text-[9px] font-mono text-center" style={{ color: 'var(--text3)' }}>
                      {daySpend[i] > 0 ? `${sym}${Math.round(daySpend[i] / 1000)}K` : '—'}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })()}

      {/* Pivot table — ALL categories always shown */}
      <div className="wl-card overflow-hidden">
        {activeCats.length === 0 ? (
          <div className="text-center py-16 text-[13px]" style={{ color:'var(--text3)' }}>
            No expense data for {viewYear}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[11px] border-collapse">
              <thead>
                <tr style={{ background:'var(--bg2)', borderBottom:'2px solid var(--border)' }}>
                  <th className="sticky left-0 px-4 py-3 text-left text-[10px] uppercase tracking-wider font-bold min-w-[130px]"
                    style={{ background:'var(--bg2)', color:'var(--text3)', borderRight:'1px solid var(--border)' }}>
                    Category
                  </th>
                  {months.map((m, mi) => (
                    <th key={m} className="px-3 py-3 text-right text-[10px] uppercase tracking-wider font-bold min-w-[68px]"
                      style={{ color:'var(--text3)', background: m >= fromMonth && m <= toMonth ? 'var(--rose-bg)' : 'var(--bg2)' }}>
                      {MONTH_NAMES[Number(m.slice(5))-1]}
                      {mi > 0 && <div className="text-[8px] font-normal opacity-60">Δ MoM</div>}
                    </th>
                  ))}
                  <th className="px-4 py-3 text-right text-[10px] uppercase tracking-wider font-bold"
                    style={{ color:'var(--expense)', background:'var(--bg2)', borderLeft:'2px solid var(--border)' }}>
                    Total
                  </th>
                </tr>
              </thead>
              <tbody>
                {activeCats.map((cat, ci) => {
                  const color = colorOf(cat, ci)
                  const total = rowTotals[cat] ?? 0
                  return (
                    <tr key={cat} style={{ borderBottom:'1px solid var(--border)', opacity: total === 0 ? 0.4 : 1 }}
                      className="hover:bg-stone-50 transition-colors">
                      <td className="sticky left-0 px-4 py-2.5 font-semibold min-w-[130px]"
                        style={{ background: ci % 2 === 0 ? '#fff' : 'var(--bg2)', borderRight:'1px solid var(--border)' }}>
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ background: color }} />
                          <span style={{ color:'var(--text)' }}>{cat}</span>
                        </div>
                      </td>
                      {months.map((m, mi) => {
                        const val    = pivot[cat]?.[m] ?? 0
                        const inSel  = m >= fromMonth && m <= toMonth
                        const prevM  = mi > 0 ? months[mi - 1] : null
                        const prevVal = prevM ? (pivot[cat]?.[prevM] ?? 0) : 0
                        const delta  = prevM ? momChange(val, prevVal) : null
                        return (
                          <td key={m} className="px-3 py-2.5 text-right font-mono"
                            style={{
                              color: val > 0 ? 'var(--text)' : 'var(--text3)',
                              background: inSel ? `${color}08` : 'transparent',
                              fontWeight: val > 0 ? 600 : 400,
                            }}>
                            <div>{val > 0
                              ? <button onClick={() => setDrill({ title: cat, subtitle: mLabel(m), items: yearTxns.filter((t: any) => catOf(t) === cat && t.txn_date?.slice(0, 7) === m) })} className="hover:underline" style={{ color: 'inherit' }}>{sym}{fmt(val)}</button>
                              : '—'}</div>
                            {mi > 0 && val > 0 && delta !== null && (
                              <div className="text-[9px] font-normal"
                                style={{ color: delta > 0 ? 'var(--rose)' : '#10B981' }}>
                                {delta > 0 ? `▲ +${delta}%` : `▼ ${delta}%`}
                              </div>
                            )}
                          </td>
                        )
                      })}
                      <td className="px-4 py-2.5 text-right font-mono font-bold"
                        style={{ color: total > 0 ? 'var(--expense)' : 'var(--text3)', borderLeft:'2px solid var(--border)' }}>
                        {total > 0
                          ? <button onClick={() => setDrill({ title: cat, subtitle: String(viewYear), items: yearTxns.filter((t: any) => catOf(t) === cat) })} className="hover:underline" style={{ color: 'inherit' }}>{sym}{Math.round(total).toLocaleString('en-IN')}</button>
                          : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr style={{ borderTop:'2px solid var(--border)', background:'var(--bg2)' }}>
                  <td className="sticky left-0 px-4 py-3 font-bold text-[11px] uppercase tracking-wider"
                    style={{ background:'var(--bg2)', color:'var(--text)', borderRight:'1px solid var(--border)' }}>
                    Monthly Total
                  </td>
                  {months.map((m, mi) => {
                    const val = colTotals[m] ?? 0
                    const prevM = mi > 0 ? months[mi - 1] : null
                    const prevVal = prevM ? (colTotals[prevM] ?? 0) : 0
                    const delta = prevM ? momChange(val, prevVal) : null
                    return (
                      <td key={m} className="px-3 py-3 text-right font-mono font-bold"
                        style={{ color:'var(--expense)', background: m >= fromMonth && m <= toMonth ? 'var(--rose-bg)' : 'var(--bg2)' }}>
                        <div>{val > 0
                          ? <button onClick={() => setDrill({ title: 'All categories', subtitle: mLabel(m), items: yearTxns.filter((t: any) => t.txn_date?.slice(0, 7) === m) })} className="hover:underline" style={{ color: 'inherit' }}>{sym}{fmt(val)}</button>
                          : '—'}</div>
                        {mi > 0 && val > 0 && delta !== null && (
                          <div className="text-[9px] font-normal"
                            style={{ color: delta > 0 ? 'var(--rose)' : '#10B981' }}>
                            {delta > 0 ? `▲ +${delta}%` : `▼ ${delta}%`}
                          </div>
                        )}
                      </td>
                    )
                  })}
                  <td className="px-4 py-3 text-right font-mono font-bold text-[13px]"
                    style={{ color:'var(--expense)', borderLeft:'2px solid var(--border)' }}>
                    {sym}{Math.round(grandTotal).toLocaleString('en-IN')}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* Money Movement — transfers & receipts, NOT counted as expenses */}
      {activeMovementCats.length > 0 && (
        <div className="wl-card overflow-hidden">
          <div className="px-4 py-3 flex items-center justify-between flex-wrap gap-2"
            style={{ background: 'var(--bg2)', borderBottom: '1px solid var(--border)' }}>
            <div>
              <div className="text-[12px] font-bold" style={{ color: 'var(--text)' }}>
                Transfers &amp; Money Received — not expenses
              </div>
              <div className="text-[10px] mt-0.5" style={{ color: 'var(--text3)' }}>
                {hasNroChain
                  ? 'UAE → NRE → NRO is the same money. Only the NRO amount is counted as spendable in India.'
                  : 'NRE credits, inter-account & remittance movement · excluded from the expense totals above'}
              </div>
            </div>
            <div className="text-right">
              <div className="text-[9px] uppercase tracking-wider font-bold" style={{ color: 'var(--text3)' }}>
                {hasNroChain ? 'Reached NRO · spendable' : 'Total moved'}
              </div>
              <div className="text-[15px] font-black font-mono" style={{ color: 'var(--blue)' }}>
                {sym}{Math.round(spendableTotal).toLocaleString('en-IN')}
              </div>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[11px] border-collapse">
              <thead>
                <tr style={{ background: 'var(--bg2)', borderBottom: '1px solid var(--border)' }}>
                  <th className="sticky left-0 px-4 py-2.5 text-left text-[10px] uppercase tracking-wider font-bold min-w-[130px]"
                    style={{ background: 'var(--bg2)', color: 'var(--text3)', borderRight: '1px solid var(--border)' }}>Category</th>
                  {months.map(m => (
                    <th key={m} className="px-3 py-2.5 text-right text-[10px] uppercase tracking-wider font-bold min-w-[68px]"
                      style={{ color: 'var(--text3)', background: m >= fromMonth && m <= toMonth ? 'var(--blue-bg, #EFF6FF)' : 'var(--bg2)' }}>
                      {MONTH_NAMES[Number(m.slice(5)) - 1]}
                    </th>
                  ))}
                  <th className="px-4 py-2.5 text-right text-[10px] uppercase tracking-wider font-bold"
                    style={{ color: 'var(--blue)', background: 'var(--bg2)', borderLeft: '2px solid var(--border)' }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {activeMovementCats.map((cat, ci) => {
                  const color = colorOf(cat, ci)
                  const total = rowTotals[cat] ?? 0
                  return (
                    <tr key={cat} style={{ borderBottom: '1px solid var(--border)' }} className="hover:bg-stone-50 transition-colors">
                      <td className="sticky left-0 px-4 py-2.5 font-semibold min-w-[130px]"
                        style={{ background: ci % 2 === 0 ? '#fff' : 'var(--bg2)', borderRight: '1px solid var(--border)' }}>
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ background: color }} />
                          <span style={{ color: 'var(--text)' }}>{cat}</span>
                        </div>
                      </td>
                      {months.map(m => {
                        const val = pivot[cat]?.[m] ?? 0
                        return (
                          <td key={m} className="px-3 py-2.5 text-right font-mono"
                            style={{ color: val > 0 ? 'var(--text)' : 'var(--text3)', fontWeight: val > 0 ? 600 : 400 }}>
                            {val > 0
                              ? <button onClick={() => setDrill({ title: cat, subtitle: mLabel(m), items: yearTxns.filter((t: any) => catOf(t) === cat && t.txn_date?.slice(0, 7) === m) })} className="hover:underline" style={{ color: 'inherit' }}>{sym}{fmt(val)}</button>
                              : '—'}
                          </td>
                        )
                      })}
                      <td className="px-4 py-2.5 text-right font-mono font-bold"
                        style={{ color: 'var(--blue)', borderLeft: '2px solid var(--border)' }}>
                        {sym}{Math.round(total).toLocaleString('en-IN')}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: '2px solid var(--border)', background: 'var(--bg2)' }}>
                  <td className="sticky left-0 px-4 py-2.5 font-bold text-[11px] uppercase tracking-wider"
                    style={{ background: 'var(--bg2)', color: 'var(--text)', borderRight: '1px solid var(--border)' }}>
                    {hasNroChain ? 'Reached NRO (spendable)' : 'Monthly Total'}
                  </td>
                  {months.map(m => {
                    const val = hasNroChain ? nroCol(m) : (movColTotals[m] ?? 0)
                    return (
                      <td key={m} className="px-3 py-2.5 text-right font-mono font-bold"
                        style={{ color: 'var(--blue)', background: m >= fromMonth && m <= toMonth ? 'var(--blue-bg, #EFF6FF)' : 'var(--bg2)' }}>
                        {val > 0 ? `${sym}${fmt(val)}` : '—'}
                      </td>
                    )
                  })}
                  <td className="px-4 py-2.5 text-right font-mono font-bold text-[13px]"
                    style={{ color: 'var(--blue)', borderLeft: '2px solid var(--border)' }}>
                    {sym}{Math.round(spendableTotal).toLocaleString('en-IN')}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* Category share */}
      {activeCats.length > 0 && (
        <div className="wl-card p-4">
          <div className="text-[11px] font-bold uppercase tracking-wider mb-3" style={{ color:'var(--text3)' }}>Category Share — {viewYear}</div>
          <div className="space-y-2">
            {activeCats.map((cat, ci) => {
              const pct   = grandTotal > 0 ? (rowTotals[cat] / grandTotal) * 100 : 0
              const color = colorOf(cat, ci)
              return (
                <div key={cat} className="flex items-center gap-3">
                  <div className="text-[11px] font-medium w-28 flex-shrink-0 truncate" style={{ color:'var(--text2)' }}>{cat}</div>
                  <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background:'var(--bg2)' }}>
                    <div className="h-full rounded-full transition-all" style={{ width:`${pct}%`, background: color }} />
                  </div>
                  <div className="text-[11px] font-mono font-semibold w-12 text-right" style={{ color }}>{pct.toFixed(1)}%</div>
                  <div className="text-[11px] font-mono w-20 text-right" style={{ color:'var(--text)' }}>
                    {sym}{Math.round(rowTotals[cat]).toLocaleString('en-IN')}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {drill && <TxnDrillModal title={drill.title} subtitle={drill.subtitle} items={drill.items} amt={amtOf} money={moneyFull} onClose={() => setDrill(null)} />}
    </div>
  )
}
