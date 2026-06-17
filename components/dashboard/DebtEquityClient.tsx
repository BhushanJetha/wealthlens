'use client'
import { useMemo } from 'react'
import Link from 'next/link'
import { useViewStore } from '@/store/viewStore'
import { Scale, TrendingUp, TrendingDown, PiggyBank, ArrowLeft, Lightbulb, AlertTriangle, CheckCircle2 } from 'lucide-react'

function monthsElapsed(start?: string): number {
  if (!start) return 0
  const s = new Date(start), n = new Date()
  return Math.max(0, (n.getFullYear() - s.getFullYear()) * 12 + (n.getMonth() - s.getMonth()))
}

export default function DebtEquityClient(props: {
  funds: any[]; stocks: any[]; etfs: any[]; fds: any[]; rds: any[]; nps: any[]
  lic: any[]; gold: any[]; bonds: any[]; ppf: any[]; loans: any[]
}) {
  const { view, fxRate: FX } = useViewStore()
  const sym = view === 'uae' ? 'AED ' : '₹'
  const money = (n: number) => `${sym}${Math.round(Number(n) || 0).toLocaleString('en-IN')}`
  const conv = (amt: number, cur = 'INR') =>
    view === 'uae' ? (cur === 'AED' ? amt : amt / (FX || 1)) : (cur === 'AED' ? amt * FX : amt)
  const S = (arr: any[], fn: (x: any) => number) => arr.reduce((a, x) => a + conv(fn(x) || 0, x.currency || 'INR'), 0)

  const { equityRows, debtRows, totalEquity, totalDebt } = useMemo(() => {
    const mfVal  = (f: any) => (Number(f.units) > 0 && Number(f.current_nav) > 0) ? Number(f.units) * Number(f.current_nav) : Number(f.invested_amount) || 0
    const stVal  = (s: any) => Number(s.quantity) * (Number(s.current_price) || Number(s.avg_buy_price) || 0)
    const etfVal = (e: any) => Number(e.current_value) || (Number(e.units) * (Number(e.current_price) || Number(e.avg_buy_price))) || Number(e.invested_amount) || 0
    const rdVal  = (r: any) => Number(r.current_amount) || (Number(r.monthly_amount) * monthsElapsed(r.start_date)) || 0
    const licVal = (l: any) => (Number(l.total_paid) || 0) + (Number(l.bonus_accrued) || 0)

    const eq = [
      { cat: 'Mutual Funds',       val: S(props.funds, mfVal),                              color: '#2563EB' },
      { cat: 'Stocks',             val: S(props.stocks, stVal),                             color: '#7C3AED' },
      { cat: 'ETF',                val: S(props.etfs, etfVal),                              color: '#0EA5E9' },
      { cat: 'Fixed Deposits',     val: S(props.fds, (f: any) => Number(f.principal)),       color: '#16A34A' },
      { cat: 'Recurring Deposits', val: S(props.rds, rdVal),                                color: '#059669' },
      { cat: 'PPF / EPF',          val: S(props.ppf, (p: any) => Number(p.current_balance)), color: '#0D9488' },
      { cat: 'NPS',                val: S(props.nps, (n: any) => Number(n.corpus_amount)),   color: '#7C5CBF' },
      { cat: 'Gold',               val: S(props.gold, (g: any) => Number(g.current_value) || (Number(g.quantity_grams) * Number(g.current_price_per_gram)) || Number(g.invested_amount)), color: '#D97706' },
      { cat: 'Bonds',              val: S(props.bonds, (b: any) => Number(b.current_value) || Number(b.invested_amount) || (Number(b.face_value) * Number(b.quantity))), color: '#CA8A04' },
      { cat: 'LIC',                val: S(props.lic, licVal),                               color: '#EA580C' },
    ].filter(r => r.val > 0).sort((a, b) => b.val - a.val)

    const typeLabel: Record<string, string> = { home_loan: 'Home Loan', car_loan: 'Car Loan', bike_loan: 'Bike Loan', gold_loan: 'Gold Loan', personal_loan: 'Personal Loan', loan_on_card: 'Loan on Card', other_loan: 'Other Loan' }
    const dm: Record<string, number> = {}
    props.loans.forEach((l: any) => {
      const k = typeLabel[l.loan_type] || 'Loan'
      dm[k] = (dm[k] ?? 0) + conv(Number(l.outstanding_amt) || 0, l.currency || 'INR')
    })
    const debt = Object.entries(dm).map(([cat, val]) => ({ cat, val })).filter(r => r.val > 0).sort((a, b) => b.val - a.val)

    return {
      equityRows: eq, debtRows: debt,
      totalEquity: eq.reduce((a, r) => a + r.val, 0),
      totalDebt: debt.reduce((a, r) => a + r.val, 0),
    }
  }, [props, view, FX])

  const netWorth = totalEquity - totalDebt
  const debtPct  = totalEquity + totalDebt > 0 ? Math.round((totalDebt / (totalEquity + totalDebt)) * 100) : 0
  const deRatio  = totalEquity > 0 ? totalDebt / totalEquity : (totalDebt > 0 ? Infinity : 0)

  const zone = totalDebt === 0 ? 'debt_free' : debtPct >= 65 ? 'high' : debtPct >= 45 ? 'moderate' : 'healthy'
  const zoneColor = zone === 'high' ? 'var(--rose)' : zone === 'moderate' ? 'var(--gold)' : 'var(--income)'
  const zoneLabel = zone === 'high' ? 'High Debt' : zone === 'moderate' ? 'Moderate' : zone === 'debt_free' ? 'Debt Free' : 'Healthy'
  const rawColor = zone === 'high' ? '#EF4444' : zone === 'moderate' ? '#F59E0B' : '#10B981'

  const insights: { tone: 'good' | 'warn' | 'info'; text: string }[] = []
  if (totalDebt === 0 && totalEquity > 0) insights.push({ tone: 'good', text: 'You have no outstanding loans — every rupee compounds for you. Keep growing your investments.' })
  else if (zone === 'high') insights.push({ tone: 'warn', text: `Your debt (${money(totalDebt)}) exceeds your investments (${money(totalEquity)}). Prioritise repaying the highest-interest loan and pause new borrowing.` })
  else if (zone === 'moderate') insights.push({ tone: 'info', text: `Balanced: debt is ${debtPct}% of your total. Grow investments faster than debt to move into the healthy zone.` })
  else if (totalEquity > 0) insights.push({ tone: 'good', text: `Healthy: investments (${money(totalEquity)}) comfortably outweigh debt (${money(totalDebt)}).` })
  insights.push({ tone: netWorth >= 0 ? 'good' : 'warn', text: `Net position (assets − liabilities): ${money(netWorth)}.` })
  const topLoan = [...props.loans].filter(l => Number(l.interest_rate) > 0).sort((a, b) => Number(b.interest_rate) - Number(a.interest_rate))[0]
  if (topLoan) insights.push({ tone: 'info', text: `Your costliest loan is ${topLoan.name} at ${topLoan.interest_rate}% p.a. — prepaying this first saves the most interest.` })
  const liquidShare = totalEquity > 0 ? Math.round(((equityRows.find(r => r.cat === 'Mutual Funds')?.val ?? 0) + (equityRows.find(r => r.cat === 'Stocks')?.val ?? 0)) / totalEquity * 100) : 0
  if (totalEquity > 0) insights.push({ tone: 'info', text: `${liquidShare}% of your investments are market-linked (MF + stocks) — liquid but volatile; the rest is in fixed/long-term assets.` })

  const Bar = ({ rows, total, label, accent }: { rows: { cat: string; val: number; color?: string }[]; total: number; label: string; accent: string }) => (
    <div className="wl-card p-4">
      <div className="text-[11px] font-bold uppercase tracking-wider mb-3 flex items-center justify-between" style={{ color: 'var(--text3)' }}>
        <span>{label}</span><span className="font-mono" style={{ color: accent }}>{money(total)}</span>
      </div>
      {rows.length === 0 ? <p className="text-[12px] py-4 text-center" style={{ color: 'var(--text3)' }}>None</p> : (
        <div className="space-y-2.5">
          {rows.map((r, i) => {
            const pct = total > 0 ? (r.val / total) * 100 : 0
            const c = r.color ?? accent
            return (
              <div key={r.cat} className="flex items-center gap-3">
                <div className="text-[11px] font-medium w-28 flex-shrink-0 truncate" style={{ color: 'var(--text2)' }}>{r.cat}</div>
                <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: 'var(--bg2)' }}>
                  <div className="h-full rounded-full" style={{ width: `${pct}%`, background: c }} />
                </div>
                <div className="text-[10px] font-mono w-9 text-right" style={{ color: 'var(--text3)' }}>{pct.toFixed(0)}%</div>
                <div className="text-[11px] font-mono font-semibold w-20 text-right" style={{ color: 'var(--text)' }}>{money(r.val)}</div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )

  return (
    <div className="space-y-5 animate-fade-up">
      <div>
        <Link href="/dashboard" className="flex items-center gap-1 text-[11px] mb-2" style={{ color: 'var(--sage)' }}><ArrowLeft size={13} /> Dashboard</Link>
        <h1 className="text-xl font-bold flex items-center gap-2" style={{ color: 'var(--text)' }}><Scale size={20} style={{ color: 'var(--sage)' }} /> Debt vs Equity</h1>
        <p className="text-[12px] mt-0.5" style={{ color: 'var(--text3)' }}>
          {view === 'uae' ? 'UAE · AED' : view === 'india' ? 'India · INR' : 'Consolidated · INR'} · how your investments stack up against your loans
        </p>
      </div>

      {/* Gauge + zone */}
      <div className="wl-card p-5 flex items-center gap-5 flex-wrap" style={{ border: `1.5px solid ${rawColor}40` }}>
        <div className="w-24 h-24 rounded-full flex items-center justify-center flex-shrink-0"
          style={{ background: `conic-gradient(${rawColor} ${debtPct * 3.6}deg, #E5E7EB ${debtPct * 3.6}deg)` }}>
          <div className="w-[72px] h-[72px] bg-white rounded-full flex flex-col items-center justify-center">
            <div className="text-[18px] font-black" style={{ color: rawColor }}>{debtPct}%</div>
            <div className="text-[8px] uppercase tracking-wider" style={{ color: 'var(--text3)' }}>debt</div>
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[15px] font-bold" style={{ color: 'var(--text)' }}>Debt is {debtPct}% of your total</span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: rawColor + '20', color: rawColor }}>{zoneLabel}</span>
          </div>
          <p className="text-[12px]" style={{ color: 'var(--text3)' }}>
            Debt-to-Equity ratio: <b style={{ color: 'var(--text)' }}>{deRatio === Infinity ? '∞' : deRatio.toFixed(2)}</b>
            {' '}· every {sym}1 invested carries {sym}{(totalEquity > 0 ? totalDebt / totalEquity : 0).toFixed(2)} of debt.
          </p>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Investments (Equity)" value={money(totalEquity)} icon={TrendingUp} color="var(--income)" />
        <Kpi label="Total Debt"          value={money(totalDebt)}   icon={TrendingDown} color="var(--rose)" />
        <Kpi label="Net Worth"           value={money(netWorth)}    icon={PiggyBank} color={netWorth >= 0 ? 'var(--income)' : 'var(--rose)'} />
        <Kpi label="Debt / Equity"       value={deRatio === Infinity ? '∞' : deRatio.toFixed(2)} icon={Scale} color={zoneColor} />
      </div>

      {/* Breakdowns */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Bar rows={equityRows} total={totalEquity} label="Investments breakdown" accent="var(--income)" />
        <Bar rows={debtRows.map(d => ({ ...d, color: 'var(--rose)' }))} total={totalDebt} label="Debt breakdown" accent="var(--rose)" />
      </div>

      {/* Insights */}
      <div className="wl-card p-4">
        <div className="text-[11px] font-bold uppercase tracking-wider mb-3 flex items-center gap-1.5" style={{ color: 'var(--text3)' }}>
          <Lightbulb size={12} style={{ color: 'var(--gold)' }} /> Insights &amp; Recommendations
        </div>
        <div className="space-y-2.5">
          {insights.map((ins, i) => {
            const c = ins.tone === 'warn' ? 'var(--rose)' : ins.tone === 'good' ? 'var(--income)' : 'var(--blue)'
            const Icon = ins.tone === 'warn' ? AlertTriangle : ins.tone === 'good' ? CheckCircle2 : Lightbulb
            return (
              <div key={i} className="flex gap-2.5">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5" style={{ background: c + '18' }}><Icon size={14} style={{ color: c }} /></div>
                <p className="text-[12px] leading-snug" style={{ color: 'var(--text2)' }}>{ins.text}</p>
              </div>
            )
          })}
        </div>
        <div className="mt-3 pt-3 border-t flex gap-2 flex-wrap" style={{ borderColor: 'var(--border)' }}>
          <Link href="/dashboard/loans" className="px-3 py-1.5 rounded-lg text-[11px] font-semibold border" style={{ borderColor: 'var(--border)', color: 'var(--text2)', background: 'var(--bg2)' }}>Manage loans</Link>
          <Link href="/dashboard/investments" className="px-3 py-1.5 rounded-lg text-[11px] font-semibold border" style={{ borderColor: 'var(--border)', color: 'var(--text2)', background: 'var(--bg2)' }}>View investments</Link>
          <Link href="/dashboard/financial-health" className="px-3 py-1.5 rounded-lg text-[11px] font-semibold border" style={{ borderColor: 'var(--sage)', color: 'var(--sage)', background: 'var(--sage-bg)' }}>Full financial health</Link>
        </div>
      </div>
    </div>
  )
}

function Kpi({ label, value, icon: Icon, color }: { label: string; value: string; icon: any; color: string }) {
  return (
    <div className="wl-card p-3.5">
      <div className="flex items-center gap-2 mb-1.5">
        <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: color + '18' }}><Icon size={14} style={{ color }} /></div>
        <span className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: 'var(--text3)' }}>{label}</span>
      </div>
      <div className="text-[18px] font-bold font-mono" style={{ color }}>{value}</div>
    </div>
  )
}
