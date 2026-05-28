'use client'
import { useMemo, useState } from 'react'
import { useViewStore } from '@/store/viewStore'
import { Download, ChevronLeft, ChevronRight } from 'lucide-react'

const EXPENSE_CATS = ['Food','Shopping','Utilities','Transport','Health','Entertainment','Travel','Education','EMI/Loan','Investment','Other']
const CAT_COLORS: Record<string,string> = {
  Food:'#D97706', Shopping:'#2563EB', Utilities:'#7C3AED', Transport:'#16A34A',
  Health:'#059669', Entertainment:'#E11D48', Travel:'#EA580C', Education:'#0284C7',
  'EMI/Loan':'#9333EA', Investment:'#0EA5E9', Other:'#6B7280',
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
  if (n >= 1000) return `${(n / 1000).toFixed(0)}K`
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
  const { view, fromMonth, toMonth, setDateRange } = useViewStore()
  const FX = 22.80

  const toDisplay = (amt: number, cur: string) =>
    view === 'consolidated' ? (cur === 'AED' ? amt * FX : amt) : amt

  const sym = view === 'uae' ? 'AED ' : '₹'

  // Year navigator — default to fromMonth's year
  const [viewYear, setViewYear] = useState(() => parseInt(fromMonth.slice(0, 4)))

  const yearFrom = `${viewYear}-01`
  const yearTo   = `${viewYear}-12`

  const months = buildMonths(yearFrom, yearTo)

  // Filter transactions for the viewed year
  const yearTxns = useMemo(() => transactions.filter(t => {
    const m = t.txn_date?.slice(0, 7) ?? ''
    if (m < yearFrom || m > yearTo) return false
    if (view === 'uae'   && t.currency !== 'AED') return false
    if (view === 'india' && t.currency !== 'INR') return false
    return true
  }), [transactions, viewYear, view])

  // Build pivot: category → month → total
  const pivot = useMemo(() => {
    const map: Record<string, Record<string, number>> = {}
    EXPENSE_CATS.forEach(cat => { map[cat] = {} })

    yearTxns.forEach(t => {
      const m = t.txn_date?.slice(0, 7)
      if (!m) return
      const cat = EXPENSE_CATS.includes(t.category) ? t.category : 'Other'
      map[cat][m] = (map[cat][m] ?? 0) + toDisplay(Number(t.amount), t.currency)
    })
    return map
  }, [yearTxns, view])

  // Column totals (per month)
  const colTotals = useMemo(() => {
    const totals: Record<string, number> = {}
    months.forEach(m => {
      totals[m] = EXPENSE_CATS.reduce((a, cat) => a + (pivot[cat]?.[m] ?? 0), 0)
    })
    return totals
  }, [pivot, months])

  // Row totals (per category)
  const rowTotals = useMemo(() => {
    const totals: Record<string, number> = {}
    EXPENSE_CATS.forEach(cat => {
      totals[cat] = months.reduce((a, m) => a + (pivot[cat]?.[m] ?? 0), 0)
    })
    return totals
  }, [pivot, months])

  const grandTotal = months.reduce((a, m) => a + (colTotals[m] ?? 0), 0)

  // Only show categories that have any data
  const activeCats = EXPENSE_CATS.filter(cat => rowTotals[cat] > 0)

  function handleExport() {
    const header = ['Category', ...months.map(m => `${MONTH_NAMES[Number(m.slice(5)) - 1]} ${m.slice(0, 4)}`), 'Total']
    const dataRows = activeCats.map(cat => [
      cat,
      ...months.map(m => Math.round(pivot[cat]?.[m] ?? 0).toString()),
      Math.round(rowTotals[cat]).toString(),
    ])
    const totalRow = ['TOTAL', ...months.map(m => Math.round(colTotals[m] ?? 0).toString()), Math.round(grandTotal).toString()]
    csvExport([header, ...dataRows, totalRow])
  }

  const maxVal = Math.max(...Object.values(colTotals).filter(v => v > 0), 1)

  return (
    <div className="space-y-5 animate-fade-up">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--text)' }}>Expense Report</h1>
          <p className="text-[12px] mt-0.5" style={{ color: 'var(--text3)' }}>
            Monthly breakdown by category · {view === 'uae' ? 'UAE · AED' : view === 'india' ? 'India · INR' : 'Consolidated · INR'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Year picker */}
          <div className="flex items-center rounded-lg border overflow-hidden" style={{ borderColor: 'var(--border)', background: 'var(--bg2)' }}>
            <button onClick={() => setViewYear(y => y - 1)} className="px-2 py-1.5 hover:bg-gray-100" style={{ color: 'var(--text3)' }}>
              <ChevronLeft size={13} />
            </button>
            <span className="px-3 text-[12px] font-bold" style={{ color: 'var(--text)' }}>{viewYear}</span>
            <button onClick={() => setViewYear(y => y + 1)} className="px-2 py-1.5 hover:bg-gray-100" style={{ color: 'var(--text3)' }}>
              <ChevronRight size={13} />
            </button>
          </div>
          <button onClick={handleExport}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold border transition-all"
            style={{ borderColor: 'var(--border)', color: 'var(--sage)', background: 'var(--sage-bg)' }}>
            <Download size={13} /> Export CSV
          </button>
        </div>
      </div>

      {/* Monthly total sparkline */}
      <div className="wl-card p-4">
        <div className="text-[11px] font-bold uppercase tracking-wider mb-3" style={{ color: 'var(--text3)' }}>Monthly Spend — {viewYear}</div>
        <div className="flex items-end gap-1 h-16">
          {months.map(m => {
            const val = colTotals[m] ?? 0
            const pct = val > 0 ? Math.max(8, Math.round((val / maxVal) * 100)) : 2
            const isSelected = m >= fromMonth && m <= toMonth
            return (
              <div key={m} className="flex-1 flex flex-col items-center gap-1">
                <div className="w-full rounded-t-sm transition-all"
                  style={{ height: `${pct}%`, background: isSelected ? 'var(--expense)' : 'var(--border)', minHeight: 2 }} />
                <span className="text-[9px]" style={{ color: 'var(--text3)' }}>
                  {MONTH_NAMES[Number(m.slice(5)) - 1]}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Summary KPI strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="wl-card p-3 text-center">
          <div className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text3)' }}>Annual Total</div>
          <div className="text-[16px] font-bold font-mono mt-1" style={{ color: 'var(--expense)' }}>
            {sym}{Math.round(grandTotal).toLocaleString('en-IN')}
          </div>
        </div>
        <div className="wl-card p-3 text-center">
          <div className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text3)' }}>Monthly Avg</div>
          <div className="text-[16px] font-bold font-mono mt-1" style={{ color: 'var(--text)' }}>
            {sym}{Math.round(grandTotal / 12).toLocaleString('en-IN')}
          </div>
        </div>
        <div className="wl-card p-3 text-center">
          <div className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text3)' }}>Peak Month</div>
          <div className="text-[16px] font-bold font-mono mt-1" style={{ color: 'var(--text)' }}>
            {months.reduce((best, m) => (colTotals[m] ?? 0) > (colTotals[best] ?? 0) ? m : best, months[0])
              ? MONTH_NAMES[Number(months.reduce((best, m) => (colTotals[m] ?? 0) > (colTotals[best] ?? 0) ? m : best, months[0]).slice(5)) - 1]
              : '—'}
          </div>
        </div>
        <div className="wl-card p-3 text-center">
          <div className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text3)' }}>Active Categories</div>
          <div className="text-[16px] font-bold font-mono mt-1" style={{ color: 'var(--text)' }}>{activeCats.length}</div>
        </div>
      </div>

      {/* Pivot Table */}
      <div className="wl-card overflow-hidden">
        {activeCats.length === 0 ? (
          <div className="text-center py-16 text-[13px]" style={{ color: 'var(--text3)' }}>
            No expense data for {viewYear}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[11px] border-collapse">
              <thead>
                <tr style={{ background: 'var(--bg2)', borderBottom: '2px solid var(--border)' }}>
                  <th className="sticky left-0 px-4 py-3 text-left text-[10px] uppercase tracking-wider font-bold min-w-[120px]"
                    style={{ background: 'var(--bg2)', color: 'var(--text3)', borderRight: '1px solid var(--border)' }}>
                    Category
                  </th>
                  {months.map(m => (
                    <th key={m} className="px-3 py-3 text-right text-[10px] uppercase tracking-wider font-bold min-w-[70px]"
                      style={{ color: 'var(--text3)', background: m >= fromMonth && m <= toMonth ? 'var(--rose-bg)' : 'var(--bg2)' }}>
                      {MONTH_NAMES[Number(m.slice(5)) - 1]}
                    </th>
                  ))}
                  <th className="px-4 py-3 text-right text-[10px] uppercase tracking-wider font-bold"
                    style={{ color: 'var(--expense)', background: 'var(--bg2)', borderLeft: '2px solid var(--border)' }}>
                    Total
                  </th>
                </tr>
              </thead>
              <tbody>
                {activeCats.map((cat, ci) => {
                  const color = CAT_COLORS[cat] ?? '#6B7280'
                  return (
                    <tr key={cat} style={{ borderBottom: '1px solid var(--border)' }}
                      className="hover:bg-stone-50 transition-colors">
                      <td className="sticky left-0 px-4 py-2.5 font-semibold"
                        style={{ background: ci % 2 === 0 ? '#fff' : 'var(--bg2)', borderRight: '1px solid var(--border)' }}>
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ background: color }} />
                          <span style={{ color: 'var(--text)' }}>{cat}</span>
                        </div>
                      </td>
                      {months.map(m => {
                        const val = pivot[cat]?.[m] ?? 0
                        const inSel = m >= fromMonth && m <= toMonth
                        return (
                          <td key={m} className="px-3 py-2.5 text-right font-mono"
                            style={{ color: val > 0 ? 'var(--text)' : 'var(--text3)',
                              background: inSel ? `${color}08` : 'transparent',
                              fontWeight: val > 0 ? 600 : 400 }}>
                            {val > 0 ? `${sym}${fmt(val)}` : '—'}
                          </td>
                        )
                      })}
                      <td className="px-4 py-2.5 text-right font-mono font-bold"
                        style={{ color: 'var(--expense)', borderLeft: '2px solid var(--border)' }}>
                        {sym}{Math.round(rowTotals[cat]).toLocaleString('en-IN')}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: '2px solid var(--border)', background: 'var(--bg2)' }}>
                  <td className="sticky left-0 px-4 py-3 font-bold text-[11px] uppercase tracking-wider"
                    style={{ background: 'var(--bg2)', color: 'var(--text)', borderRight: '1px solid var(--border)' }}>
                    Monthly Total
                  </td>
                  {months.map(m => {
                    const val = colTotals[m] ?? 0
                    return (
                      <td key={m} className="px-3 py-3 text-right font-mono font-bold"
                        style={{ color: 'var(--expense)', background: m >= fromMonth && m <= toMonth ? 'var(--rose-bg)' : 'var(--bg2)' }}>
                        {val > 0 ? `${sym}${fmt(val)}` : '—'}
                      </td>
                    )
                  })}
                  <td className="px-4 py-3 text-right font-mono font-bold text-[13px]"
                    style={{ color: 'var(--expense)', borderLeft: '2px solid var(--border)' }}>
                    {sym}{Math.round(grandTotal).toLocaleString('en-IN')}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* Category share bar */}
      {activeCats.length > 0 && (
        <div className="wl-card p-4">
          <div className="text-[11px] font-bold uppercase tracking-wider mb-3" style={{ color: 'var(--text3)' }}>Category Share</div>
          <div className="space-y-2">
            {activeCats.sort((a,b) => rowTotals[b] - rowTotals[a]).map(cat => {
              const pct = grandTotal > 0 ? (rowTotals[cat] / grandTotal) * 100 : 0
              const color = CAT_COLORS[cat] ?? '#6B7280'
              return (
                <div key={cat} className="flex items-center gap-3">
                  <div className="text-[11px] font-medium w-24 flex-shrink-0" style={{ color: 'var(--text2)' }}>{cat}</div>
                  <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: 'var(--bg2)' }}>
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
                  </div>
                  <div className="text-[11px] font-mono font-semibold w-12 text-right" style={{ color }}>
                    {pct.toFixed(1)}%
                  </div>
                  <div className="text-[11px] font-mono w-20 text-right" style={{ color: 'var(--text)' }}>
                    {sym}{Math.round(rowTotals[cat]).toLocaleString('en-IN')}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
