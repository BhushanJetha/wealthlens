'use client'
import { useMemo } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, LabelList, Area, AreaChart,
} from 'recharts'

export interface InvTxn {
  txn_date: string
  txn_type: string
  amount:   number
  units?:   number | null
  nav?:     number | null
}

interface Props {
  txns:         InvTxn[]
  invested:     number          // total cost / amount invested
  currentValue: number          // current market value
  currency?:    string
  compact?:     boolean         // inline per-asset view
}

const INFLOW  = new Set(['purchase', 'sip', 'switch_in'])
const OUTFLOW = new Set(['redemption', 'switch_out'])

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function abbr(n: number, sym: string) {
  const a = Math.abs(n)
  if (a >= 1e7) return `${sym}${(n / 1e7).toFixed(2)}Cr`
  if (a >= 1e5) return `${sym}${(n / 1e5).toFixed(2)}L`
  if (a >= 1e3) return `${sym}${(n / 1e3).toFixed(1)}K`
  return `${sym}${Math.round(n).toLocaleString('en-IN')}`
}

// XIRR — annualised return accounting for the date of every cash flow.
// Bisection on NPV(r)=0. Returns % or null when not computable.
function xirr(cf: { t: number; a: number }[]): number | null {
  if (cf.length < 2) return null
  const sorted = [...cf].sort((x, y) => x.t - y.t)
  const t0 = sorted[0].t
  const yf = (t: number) => (t - t0) / (365.25 * 864e5)
  if (!sorted.some(c => c.a < 0) || !sorted.some(c => c.a > 0)) return null
  const npv = (r: number) => sorted.reduce((s, c) => s + c.a / Math.pow(1 + r, yf(c.t)), 0)
  let lo = -0.999, hi = 10, flo = npv(lo), fhi = npv(hi)
  if (isNaN(flo) || isNaN(fhi) || flo * fhi > 0) return null
  for (let i = 0; i < 120; i++) {
    const mid = (lo + hi) / 2, fmid = npv(mid)
    if (!isFinite(fmid)) return null
    if (Math.abs(fmid) < 1e-7) return mid * 100
    if (flo * fmid < 0) { hi = mid; fhi = fmid } else { lo = mid; flo = fmid }
  }
  const r = ((lo + hi) / 2) * 100
  return r > -99 && r < 1000 ? r : null
}

export default function InvestmentTimeline({ txns, invested, currentValue, currency = 'INR', compact = false }: Props) {
  const sym = currency === 'AED' ? 'AED ' : '₹'

  const { monthly, yearly, firstDate, netInvested } = useMemo(() => {
    const flows = (txns ?? []).filter(t => INFLOW.has(t.txn_type) || OUTFLOW.has(t.txn_type))
    const byMonth: Record<string, number> = {}
    const byYear:  Record<string, number> = {}
    let net = 0
    for (const t of flows) {
      const signed = OUTFLOW.has(t.txn_type) ? -t.amount : t.amount
      net += signed
      byMonth[t.txn_date.slice(0, 7)] = (byMonth[t.txn_date.slice(0, 7)] ?? 0) + signed
      byYear[t.txn_date.slice(0, 4)]  = (byYear[t.txn_date.slice(0, 4)]  ?? 0) + signed
    }

    // Continuous monthly range (fills empty months) — last 24 months max
    const monthKeys = Object.keys(byMonth).sort()
    let monthly: Array<{ key: string; label: string; invested: number; cumulative: number }> = []
    if (monthKeys.length) {
      const start = new Date(monthKeys[0] + '-01')
      const end   = new Date(monthKeys[monthKeys.length - 1] + '-01')
      let cum = 0
      const cur = new Date(start)
      while (cur <= end) {
        const k = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}`
        cum += byMonth[k] ?? 0
        monthly.push({ key: k, label: `${MONTH_LABELS[cur.getMonth()]} '${String(cur.getFullYear()).slice(2)}`, invested: Math.round(byMonth[k] ?? 0), cumulative: Math.round(cum) })
        cur.setMonth(cur.getMonth() + 1)
      }
      monthly = monthly.slice(-24)
    }

    const yearKeys = Object.keys(byYear).sort()
    let cumY = 0
    const yearly = yearKeys.map((y, i) => {
      cumY += byYear[y]
      const prev = i > 0 ? byYear[yearKeys[i - 1]] : null
      const yoy  = prev != null && prev !== 0 ? ((byYear[y] - prev) / Math.abs(prev)) * 100 : null
      return { year: y, invested: Math.round(byYear[y]), cumulative: Math.round(cumY), yoy }
    })

    const firstDate = flows.length ? flows.map(f => f.txn_date).sort()[0] : null
    return { monthly, yearly, firstDate, netInvested: net }
  }, [txns])

  // Use the transaction-derived net invested so the headline matches the
  // cumulative/year charts (which are built from the same flows); fall back to
  // the holding cost only when there's no transaction history.
  const investedBase = netInvested > 0 ? netInvested : (invested || 0)
  const gain     = currentValue - investedBase
  const gainPct  = investedBase > 0 ? (gain / investedBase) * 100 : 0
  const posColor = 'var(--income)'
  const negColor = 'var(--rose)'
  const gainColor = gain >= 0 ? posColor : negColor

  const elapsedYrs = firstDate ? (Date.now() - new Date(firstDate).getTime()) / (365.25 * 864e5) : 0
  const cagr = investedBase > 0 && currentValue > 0 && elapsedYrs > 0.5
    ? (Math.pow(currentValue / investedBase, 1 / elapsedYrs) - 1) * 100
    : null
  // Prefer XIRR (uses each cash flow's date); fall back to simple CAGR
  const cashflows = (txns ?? [])
    .filter(t => INFLOW.has(t.txn_type) || OUTFLOW.has(t.txn_type))
    .map(t => ({ t: new Date(t.txn_date).getTime(), a: INFLOW.has(t.txn_type) ? -t.amount : t.amount }))
  if (currentValue > 0) cashflows.push({ t: Date.now(), a: currentValue })
  const annualised = xirr(cashflows) ?? cagr

  const hasHistory = yearly.length > 0

  // ── Returns summary cards ─────────────────────────────────────────────
  const summary = (
    <div className={`grid ${compact ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-2 lg:grid-cols-4'} gap-2`}>
      {[
        { label: 'Invested',      value: abbr(investedBase, sym),                       color: 'var(--text)' },
        { label: 'Current Value', value: abbr(currentValue, sym),                       color: gainColor },
        { label: 'Total Return',  value: `${gainPct >= 0 ? '+' : ''}${gainPct.toFixed(1)}%`, color: gainColor },
        { label: annualised != null ? 'Annualised (XIRR)' : 'Gain / Loss',
          value: annualised != null ? `${annualised >= 0 ? '+' : ''}${annualised.toFixed(1)}%` : `${gain >= 0 ? '+' : ''}${abbr(Math.abs(gain), sym)}`,
          color: gainColor },
      ].map(c => (
        <div key={c.label} className="rounded-lg px-3 py-2" style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}>
          <div className="text-[9px] font-bold uppercase tracking-wider" style={{ color: 'var(--text3)' }}>{c.label}</div>
          <div className="text-[14px] font-bold font-mono mt-0.5" style={{ color: c.color }}>{c.value}</div>
        </div>
      ))}
    </div>
  )

  if (!hasHistory) {
    return (
      <div className="space-y-3">
        {summary}
        <div className="text-[11px] text-center py-4 rounded-lg" style={{ color: 'var(--text3)', background: 'var(--bg2)' }}>
          No dated investment history yet. Import a CAMS statement (Mutual Funds) or record buys to see month-on-month & year-on-year trends.
        </div>
      </div>
    )
  }

  // ── Year-on-year bars ─────────────────────────────────────────────────
  const yearChart = (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--text3)' }}>Invested per Year</span>
        <span className="text-[10px]" style={{ color: 'var(--text3)' }}>YoY % = change vs previous year</span>
      </div>
      <ResponsiveContainer width="100%" height={compact ? 140 : 190}>
        <BarChart data={yearly} margin={{ top: 18, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis dataKey="year" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
          <YAxis tickFormatter={(v: number) => abbr(v, sym)} tick={{ fontSize: 9 }} width={48} axisLine={false} tickLine={false} />
          <Tooltip formatter={(v: any) => [abbr(Number(v), sym), 'Invested']} cursor={{ fill: 'var(--bg2)' }} />
          <Bar dataKey="invested" radius={[5, 5, 0, 0]} fill="var(--sage)">
            <LabelList dataKey="yoy" position="top" style={{ fontSize: 10, fontWeight: 700 }}
              formatter={(v: any) => (v == null ? '' : `${v >= 0 ? '+' : ''}${Number(v).toFixed(0)}%`)} />
            {yearly.map((y, i) => <Cell key={i} fill={(y.yoy ?? 0) >= 0 ? 'var(--sage)' : 'var(--gold)'} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )

  // ── Month-on-month bars + cumulative ──────────────────────────────────
  const monthChart = (
    <div>
      <div className="text-[11px] font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--text3)' }}>
        Month-on-Month {monthly.length === 24 ? '(last 24 months)' : ''}
      </div>
      <ResponsiveContainer width="100%" height={compact ? 130 : 180}>
        <BarChart data={monthly} margin={{ top: 5, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 8 }} interval={monthly.length > 12 ? 1 : 0} axisLine={false} tickLine={false} angle={-30} textAnchor="end" height={36} />
          <YAxis tickFormatter={(v: number) => abbr(v, sym)} tick={{ fontSize: 9 }} width={48} axisLine={false} tickLine={false} />
          <Tooltip formatter={(v: any) => [abbr(Number(v), sym), 'Invested']} cursor={{ fill: 'var(--bg2)' }} />
          <Bar dataKey="invested" radius={[3, 3, 0, 0]} fill="var(--blue)" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )

  const cumulativeChart = (
    <div>
      <div className="text-[11px] font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--text3)' }}>Cumulative Invested</div>
      <ResponsiveContainer width="100%" height={160}>
        <AreaChart data={monthly} margin={{ top: 5, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="cumGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--sage)" stopOpacity={0.35} />
              <stop offset="100%" stopColor="var(--sage)" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 8 }} interval={monthly.length > 12 ? 2 : 0} axisLine={false} tickLine={false} angle={-30} textAnchor="end" height={36} />
          <YAxis tickFormatter={(v: number) => abbr(v, sym)} tick={{ fontSize: 9 }} width={48} axisLine={false} tickLine={false} />
          <Tooltip formatter={(v: any) => [abbr(Number(v), sym), 'Cumulative']} cursor={{ fill: 'var(--bg2)' }} />
          <Area type="monotone" dataKey="cumulative" stroke="var(--sage)" strokeWidth={2} fill="url(#cumGrad)" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )

  if (compact) {
    return (
      <div className="space-y-3">
        {summary}
        {yearChart}
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {summary}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {yearChart}
        {monthChart}
      </div>
      {cumulativeChart}
    </div>
  )
}
