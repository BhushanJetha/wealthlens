'use client'
import { useMemo, useState, useEffect } from 'react'
import { useViewStore } from '@/store/viewStore'
import { Download, ChevronLeft, ChevronRight, Wallet, CalendarDays, Trophy, Activity } from 'lucide-react'
import { PageHeader, KpiTile, Bars } from '@/components/ui/kit'
import { prepareMoney, isIncome, INDIA_INCOME } from '@/lib/money'

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

function stabilityScore(values: number[]): number {
  const mean = values.reduce((a, v) => a + v, 0) / values.length
  if (mean === 0) return 0
  const std = Math.sqrt(values.reduce((a, v) => a + (v - mean) ** 2, 0) / values.length)
  return Math.round(Math.max(0, Math.min(100, (1 - std / mean) * 100)))
}

// ─── Constants ───────────────────────────────────────────────────────────────

const INCOME_CATS = [INDIA_INCOME,'Salary','NRE Received','Dividend','Interest','FD/RD Maturity','Rental','Gift','Bonus','Tax Refund','Freelance','NRI Transfer','Other']
const CAT_COLORS: Record<string,string> = {
  'UAE Income (NRO)':'#15803D',
  Salary:      '#16A34A',
  'NRE Received':'#0284C7',
  Dividend:    '#2563EB',
  Interest:    '#0369A1',
  'FD/RD Maturity':'#0891B2',
  Rental:      '#7C3AED',
  Gift:        '#E11D48',
  Bonus:       '#D97706',
  'Tax Refund':'#059669',
  Freelance:   '#EA580C',
  'NRI Transfer':'#0EA5E9',
  Other:       '#6B7280',
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
  const a = document.createElement('a'); a.href = url; a.download = 'income_report.csv'; a.click()
  URL.revokeObjectURL(url)
}

export default function IncomeReportClient({ transactions: raw }: { transactions: any[] }) {
  const { view, fromMonth, toMonth, fxRate: FX } = useViewStore()
  // Income in this view (lib/money): earned income, plus money landing in NRE
  // from UAE in the India view. `raw` keeps the transfers for the remittance card.
  const transactions = useMemo(() => prepareMoney(raw, { fx: FX }).filter(t => isIncome(t, view)), [raw, FX, view])

  const toDisplay = (amt: number, cur: string) =>
    view === 'consolidated' ? (cur === 'AED' ? amt * FX : amt) : amt

  const sym = view === 'uae' ? 'AED ' : '₹'

  const [viewYear, setViewYear] = useState(() => parseInt(fromMonth.slice(0, 4)))
  // Follow the year picked in the top bar's calendar
  useEffect(() => { setViewYear(parseInt(fromMonth.slice(0, 4))) }, [fromMonth])

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

  // Pivot: source → month → total
  const pivot = useMemo(() => {
    const map: Record<string, Record<string, number>> = {}
    INCOME_CATS.forEach(cat => { map[cat] = {} })
    yearTxns.forEach(t => {
      const m = t.txn_date?.slice(0, 7)
      if (!m) return
      const cat = INCOME_CATS.includes(t.category) ? t.category : 'Other'
      map[cat][m] = (map[cat][m] ?? 0) + toDisplay(Number(t.amount), t.currency)
    })
    return map
  }, [yearTxns, view, FX])

  const colTotals = useMemo(() => {
    const totals: Record<string, number> = {}
    months.forEach(m => {
      totals[m] = INCOME_CATS.reduce((a, cat) => a + (pivot[cat]?.[m] ?? 0), 0)
    })
    return totals
  }, [pivot, months])

  const rowTotals = useMemo(() => {
    const totals: Record<string, number> = {}
    INCOME_CATS.forEach(cat => {
      totals[cat] = months.reduce((a, m) => a + (pivot[cat]?.[m] ?? 0), 0)
    })
    return totals
  }, [pivot, months])

  const grandTotal = months.reduce((a, m) => a + (colTotals[m] ?? 0), 0)
  const activeCats = INCOME_CATS.filter(cat => rowTotals[cat] > 0)

  // ─── Analytics: Income Stability, Forecast, Remittance ───────────────────
  const monthlyIncomeTotals = useMemo(() => {
    return Array.from({ length: 12 }, (_, i) => {
      const m = `${viewYear}-${String(i + 1).padStart(2, '0')}`
      return transactions
        .filter((t: any) => t.txn_date?.slice(0, 7) === m)
        .reduce((a: number, t: any) => {
          if (view === 'uae' && t.currency !== 'AED') return a
          if (view === 'india' && t.currency !== 'INR') return a
          return a + (view === 'consolidated' ? Number(t.amount) * (t.currency === 'AED' ? FX : 1) : Number(t.amount))
        }, 0)
    })
  }, [transactions, view, FX, viewYear])

  const validIncomeTotals = monthlyIncomeTotals.filter(v => v > 0)
  const incomeStabilityScore = validIncomeTotals.length > 0 ? stabilityScore(validIncomeTotals) : 0
  const incomeForecast = linearForecast(validIncomeTotals.slice(-6), 3)
  const avgMonthlyIncome = validIncomeTotals.length > 0
    ? Math.round(validIncomeTotals.reduce((a, v) => a + v, 0) / validIncomeTotals.length)
    : 0
  const incomeStdDev = validIncomeTotals.length > 1
    ? Math.round(Math.sqrt(validIncomeTotals.reduce((a, v) => a + (v - avgMonthlyIncome) ** 2, 0) / validIncomeTotals.length))
    : 0

  function handleExport() {
    const header = ['Source', ...months.map(m => `${MONTH_NAMES[Number(m.slice(5)) - 1]} ${m.slice(0, 4)}`), 'Total']
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
    <div className="flex flex-col gap-3.5 md:gap-[18px] animate-fade-up">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
        <PageHeader title="Income report" sub={`Month by month, by source · ${view === 'uae' ? 'UAE · AED' : view === 'india' ? 'India · INR' : 'Consolidated · INR'}`} />
        <div className="flex items-center gap-2">
          <div className="inline-flex items-center rounded-xl bg-white" style={{ border: '1px solid var(--line)', height: 38 }}>
            <button onClick={() => setViewYear(y => y - 1)} aria-label="Previous year" className="w-9 h-full flex items-center justify-center" style={{ color: 'var(--text2)' }}><ChevronLeft size={16} /></button>
            <span className="px-2 text-[13px] font-semibold tabular-nums" style={{ color: 'var(--text)' }}>{viewYear}</span>
            <button onClick={() => setViewYear(y => y + 1)} aria-label="Next year" className="w-9 h-full flex items-center justify-center" style={{ color: 'var(--text2)' }}><ChevronRight size={16} /></button>
          </div>
          <button onClick={handleExport} className="wl-btn" style={{ height: 38 }}><Download size={14} />CSV</button>
        </div>
      </div>

      {/* Income by month (same card on both sizes) */}
      <section className="wl-card px-4 md:px-5 py-4 md:py-[18px]">
        <div className="text-[10.5px] md:text-[11px] font-semibold uppercase tracking-[0.05em]" style={{ color: 'var(--text3)' }}>Income · {viewYear}</div>
        <div className="text-[30px] md:text-[32px] font-bold tabular-nums tracking-[-0.02em] leading-tight mt-0.5" style={{ color: 'var(--text)' }}>{sym}{Math.round(grandTotal).toLocaleString('en-IN')}</div>
        {grandTotal === 0 ? (
          <div className="text-[12.5px] text-center py-8" style={{ color: 'var(--text3)' }}>
            No {view === 'uae' ? 'AED' : view === 'india' ? 'INR' : ''} income recorded for {viewYear}. Try another view (UAE / India / Consolidated) or year.
          </div>
        ) : (
          <Bars className="h-[130px] md:h-[200px] mt-3"
            data={months.map(m => ({ label: MONTH_NAMES[Number(m.slice(5)) - 1], value: colTotals[m] ?? 0, hi: m >= fromMonth && m <= toMonth,
              tip: `${MONTH_NAMES[Number(m.slice(5)) - 1]}: ${sym}${Math.round(colTotals[m] ?? 0).toLocaleString('en-IN')}` }))}
            label={`Income by month in ${viewYear}`} />
        )}
      </section>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 md:gap-3.5">
        <KpiTile label="Year total" value={`${sym}${Math.round(grandTotal).toLocaleString('en-IN')}`} tint={1} icon={Wallet} />
        <KpiTile label="Monthly average" value={`${sym}${Math.round(grandTotal / Math.max(months.filter(m => (colTotals[m] ?? 0) > 0).length, 1)).toLocaleString('en-IN')}`} tint={0} icon={CalendarDays} delta="over months with income" />
        <KpiTile label="Best month" tint={2} icon={Trophy}
          value={months.length ? MONTH_NAMES[Number(months.reduce((best, m) => (colTotals[m] ?? 0) > (colTotals[best] ?? 0) ? m : best, months[0]).slice(5)) - 1] : '—'} />
        <KpiTile label="Income stability" value={`${incomeStabilityScore}/100`} tint={3} icon={Activity}
          tone={incomeStabilityScore >= 70 ? 'good' : incomeStabilityScore >= 40 ? 'neutral' : 'bad'}
          delta={incomeStabilityScore >= 70 ? 'Very predictable' : incomeStabilityScore >= 40 ? 'Some variation' : 'Varies a lot'} />
      </div>

      {/* Income Forecast Panel */}
      {incomeForecast.length > 0 && avgMonthlyIncome > 0 && (
        <div className="wl-card px-4 md:px-5 py-4 md:py-[18px]">
          <div className="text-[14px] md:text-[15px] font-semibold mb-3" style={{ color: 'var(--text)' }}>
            Income Forecast · Next 3 Months
          </div>
          <div className="grid grid-cols-3 gap-3">
            {incomeForecast.map((val, i) => {
              const d = new Date(); d.setMonth(d.getMonth() + i + 1)
              const label = d.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' })
              return (
                <div key={i} className="rounded-xl p-3 text-center"
                  style={{ background: '#FAFAFE', border: '1px solid var(--line)' }}>
                  <div className="text-[10.5px] font-semibold uppercase tracking-[0.05em] mb-1" style={{ color: 'var(--text3)' }}>
                    {label} (est)
                  </div>
                  <div className="text-[20px] font-bold tabular-nums" style={{ color: 'var(--income)' }}>
                    {sym}{val.toLocaleString('en-IN')}
                  </div>
                  <div className="text-[10px] mt-1" style={{ color: 'var(--text3)' }}>
                    ±{sym}{incomeStdDev.toLocaleString('en-IN')}
                  </div>
                </div>
              )
            })}
          </div>
          <div className="text-[10px] mt-2" style={{ color: 'var(--text3)' }}>
            Based on {validIncomeTotals.length}-month trend · Avg: {sym}{avgMonthlyIncome.toLocaleString('en-IN')}/month
          </div>
        </div>
      )}

      {/* Remittance Efficiency Card — NRI-specific, UAE/consolidated only */}
      {(view === 'uae' || view === 'consolidated') && (() => {
        const inRangeCheck = (txnDate: string) => {
          const m = txnDate?.slice(0, 7) ?? ''
          return m >= fromMonth && m <= toMonth
        }
        const aedTransfers = raw.filter((t: any) =>
          t.txn_type === 'transfer' && t.currency === 'AED' && inRangeCheck(t.txn_date))
        const totalAED = aedTransfers.reduce((a: number, t: any) => a + Number(t.amount), 0)
        if (totalAED === 0) return null
        const inrEquivalentAtLive = Math.round(totalAED * FX)

        return (
          <div className="wl-card px-4 md:px-5 py-4 md:py-[18px]" style={{ borderTop: '3px solid #0EA5E9' }}>
            <div className="text-[11px] font-bold uppercase tracking-wider mb-3" style={{ color: '#0EA5E9' }}>
              Remittance Analysis (UAE → India)
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <div className="text-[10px]" style={{ color: 'var(--text3)' }}>Total Transferred</div>
                <div className="text-[18px] font-bold tabular-nums mt-0.5" style={{ color: 'var(--gold)' }}>
                  AED {Math.round(totalAED).toLocaleString('en-IN')}
                </div>
              </div>
              <div>
                <div className="text-[10px]" style={{ color: 'var(--text3)' }}>INR Equivalent (live rate)</div>
                <div className="text-[18px] font-bold tabular-nums mt-0.5" style={{ color: 'var(--income)' }}>
                  ₹{inrEquivalentAtLive.toLocaleString('en-IN')}
                </div>
              </div>
              <div>
                <div className="text-[10px]" style={{ color: 'var(--text3)' }}>Live Rate</div>
                <div className="text-[18px] font-bold tabular-nums mt-0.5" style={{ color: 'var(--text)' }}>
                  ₹{FX.toFixed(2)} / AED
                </div>
              </div>
              <div>
                <div className="text-[10px]" style={{ color: 'var(--text3)' }}>Transfers Count</div>
                <div className="text-[18px] font-bold tabular-nums mt-0.5" style={{ color: 'var(--text)' }}>
                  {aedTransfers.length}
                </div>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Pivot Table */}
      <div className="wl-card overflow-hidden">
        {activeCats.length === 0 ? (
          <div className="text-center py-16 text-[13px]" style={{ color: 'var(--text3)' }}>
            No income data for {viewYear}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[11px] border-collapse">
              <thead>
                <tr style={{ background: '#FAFAFE', borderBottom: '2px solid var(--line)' }}>
                  <th className="sticky left-0 px-4 py-3 text-left text-[10.5px] uppercase tracking-[0.05em] font-semibold min-w-[120px]"
                    style={{ background: '#FAFAFE', color: 'var(--text3)', borderRight: '1px solid var(--line)' }}>
                    Source
                  </th>
                  {months.map((m, mi) => (
                    <th key={m} className="px-3 py-3 text-right text-[10.5px] uppercase tracking-[0.05em] font-semibold min-w-[70px]"
                      style={{ color: 'var(--text3)', background: m >= fromMonth && m <= toMonth ? 'var(--income-bg)' : 'var(--bg2)' }}>
                      {MONTH_NAMES[Number(m.slice(5)) - 1]}
                      {mi > 0 && <div className="text-[8px] font-normal opacity-60">Δ MoM</div>}
                    </th>
                  ))}
                  <th className="px-4 py-3 text-right text-[10.5px] uppercase tracking-[0.05em] font-semibold"
                    style={{ color: 'var(--income)', background: '#FAFAFE', borderLeft: '2px solid var(--line)' }}>
                    Total
                  </th>
                </tr>
              </thead>
              <tbody>
                {activeCats.map((cat, ci) => {
                  const color = CAT_COLORS[cat] ?? '#16A34A'
                  return (
                    <tr key={cat} style={{ borderBottom: '1px solid var(--line)' }}
                      className="hover:bg-stone-50 transition-colors">
                      <td className="sticky left-0 px-4 py-2.5 font-semibold"
                        style={{ background: ci % 2 === 0 ? '#fff' : 'var(--bg2)', borderRight: '1px solid var(--line)' }}>
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ background: color }} />
                          <span style={{ color: 'var(--text)' }}>{cat}</span>
                        </div>
                      </td>
                      {months.map((m, mi) => {
                        const val = pivot[cat]?.[m] ?? 0
                        const inSel = m >= fromMonth && m <= toMonth
                        const prevM = mi > 0 ? months[mi - 1] : null
                        const prevVal = prevM ? (pivot[cat]?.[prevM] ?? 0) : 0
                        const delta = prevM && prevVal > 0
                          ? Math.round((val - prevVal) / prevVal * 100)
                          : null
                        return (
                          <td key={m} className="px-3 py-2.5 text-right tabular-nums"
                            style={{
                              color: val > 0 ? 'var(--income)' : 'var(--text3)',
                              background: inSel ? `${color}08` : 'transparent',
                              fontWeight: val > 0 ? 600 : 400,
                            }}>
                            <div>{val > 0 ? `${sym}${fmt(val)}` : '—'}</div>
                            {mi > 0 && val > 0 && delta !== null && (
                              <div className="text-[10.5px] font-normal"
                                style={{ color: delta > 0 ? 'var(--income)' : 'var(--rose)' }}>
                                {delta > 0 ? `▲ +${delta}%` : `▼ ${delta}%`}
                              </div>
                            )}
                          </td>
                        )
                      })}
                      <td className="px-4 py-2.5 text-right tabular-nums font-bold"
                        style={{ color: 'var(--income)', borderLeft: '2px solid var(--line)' }}>
                        {sym}{Math.round(rowTotals[cat]).toLocaleString('en-IN')}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: '2px solid var(--line)', background: '#FAFAFE' }}>
                  <td className="sticky left-0 px-4 py-3 font-bold text-[11px] uppercase tracking-wider"
                    style={{ background: '#FAFAFE', color: 'var(--text)', borderRight: '1px solid var(--line)' }}>
                    Monthly Total
                  </td>
                  {months.map((m, mi) => {
                    const val = colTotals[m] ?? 0
                    const prevM = mi > 0 ? months[mi - 1] : null
                    const prevVal = prevM ? (colTotals[prevM] ?? 0) : 0
                    const delta = prevM && prevVal > 0
                      ? Math.round((val - prevVal) / prevVal * 100)
                      : null
                    return (
                      <td key={m} className="px-3 py-3 text-right tabular-nums font-bold"
                        style={{ color: 'var(--income)', background: m >= fromMonth && m <= toMonth ? 'var(--income-bg)' : 'var(--bg2)' }}>
                        <div>{val > 0 ? `${sym}${fmt(val)}` : '—'}</div>
                        {mi > 0 && val > 0 && delta !== null && (
                          <div className="text-[10.5px] font-normal"
                            style={{ color: delta > 0 ? 'var(--income)' : 'var(--rose)' }}>
                            {delta > 0 ? `▲ +${delta}%` : `▼ ${delta}%`}
                          </div>
                        )}
                      </td>
                    )
                  })}
                  <td className="px-4 py-3 text-right tabular-nums font-bold text-[13px]"
                    style={{ color: 'var(--income)', borderLeft: '2px solid var(--line)' }}>
                    {sym}{Math.round(grandTotal).toLocaleString('en-IN')}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* Source share */}
      {activeCats.length > 0 && (
        <div className="wl-card px-4 md:px-5 py-4 md:py-[18px]">
          <div className="text-[14px] md:text-[15px] font-semibold mb-3" style={{ color: 'var(--text)' }}>Income Source Share</div>
          <div className="space-y-2">
            {activeCats.sort((a,b) => rowTotals[b] - rowTotals[a]).map(cat => {
              const pct = grandTotal > 0 ? (rowTotals[cat] / grandTotal) * 100 : 0
              const color = CAT_COLORS[cat] ?? '#16A34A'
              return (
                <div key={cat} className="flex items-center gap-3">
                  <div className="text-[11px] font-medium w-24 flex-shrink-0" style={{ color: 'var(--text2)' }}>{cat}</div>
                  <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: '#FAFAFE' }}>
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
                  </div>
                  <div className="text-[11px] tabular-nums font-semibold w-12 text-right" style={{ color }}>
                    {pct.toFixed(1)}%
                  </div>
                  <div className="text-[11px] tabular-nums w-20 text-right" style={{ color: 'var(--text)' }}>
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
