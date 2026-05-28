'use client'
import { useMemo } from 'react'
import { useViewStore } from '@/store/viewStore'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis } from 'recharts'
import { TrendingUp, TrendingDown, AlertTriangle, CheckCircle2, Zap, ArrowRight, Target, Shield } from 'lucide-react'
import Link from 'next/link'

function fmtINR(n: number) {
  if (Math.abs(n) >= 10000000) return `₹${(n / 10000000).toFixed(2)}Cr`
  if (Math.abs(n) >= 100000)   return `₹${(n / 100000).toFixed(2)}L`
  return `₹${Math.round(n).toLocaleString('en-IN')}`
}
function fmtAED(n: number) {
  if (Math.abs(n) >= 1000000) return `AED ${(n / 1000000).toFixed(2)}M`
  if (Math.abs(n) >= 1000)    return `AED ${(n / 1000).toFixed(1)}K`
  return `AED ${Math.round(n).toLocaleString()}`
}
function fmtKINR(n: number) {
  if (n >= 100000) return `₹${(n / 100000).toFixed(1)}L`
  if (n >= 1000)   return `₹${(n / 1000).toFixed(0)}K`
  return `₹${Math.round(n).toLocaleString('en-IN')}`
}

const LOAN_TYPE_LABELS: Record<string, string> = {
  home_loan: 'Home Loan', car_loan: 'Car Loan', bike_loan: 'Bike/Vehicle',
  gold_loan: 'Gold Loan', loan_on_card: 'Loan on Card',
  personal_loan: 'Personal Loan', other_loan: 'Other Loan',
}

type Zone = 'high_debt' | 'moderate' | 'healthy' | 'debt_free' | 'no_data'

function getZone(debtPct: number, totalDebt: number, totalEquity: number): Zone {
  if (totalDebt === 0 && totalEquity === 0) return 'no_data'
  if (totalDebt === 0) return 'debt_free'
  if (debtPct > 60) return 'high_debt'
  if (debtPct > 30) return 'moderate'
  return 'healthy'
}

const ZONE_CONFIG = {
  high_debt: { label: 'High Debt',  color: '#EF4444', bg: '#FEF2F2', icon: AlertTriangle, description: 'Your debt significantly outweighs your investments. Focus on reducing high-interest loans first.' },
  moderate:  { label: 'Moderate',   color: '#F59E0B', bg: '#FFFBEB', icon: Zap,           description: 'You\'re balancing debt and investments, but there\'s room to improve. Gradually shift more toward equity.' },
  healthy:   { label: 'Healthy',    color: '#10B981', bg: '#ECFDF5', icon: CheckCircle2,  description: 'Excellent! Your investments outweigh your debt. Keep growing your equity and consider prepaying high-rate loans.' },
  debt_free: { label: 'Debt Free',  color: '#3D7A58', bg: '#F0FDF4', icon: Shield,        description: 'Outstanding! You carry no debt. Focus entirely on growing your investment portfolio.' },
  no_data:   { label: 'No Data',    color: '#9CA3AF', bg: '#F9FAFB', icon: Target,        description: 'Add your investments and loans to see your financial health analysis.' },
}

function DebtGauge({ debtPct, zone }: { debtPct: number; zone: Zone }) {
  const color = ZONE_CONFIG[zone].color
  const data = [
    { value: Math.round(debtPct), fill: color },
    { value: Math.round(100 - debtPct), fill: '#F3F4F6' },
  ]
  return (
    <div className="relative" style={{ height: 160 }}>
      <ResponsiveContainer width="100%" height={160}>
        <PieChart>
          <Pie data={data} cx="50%" cy="90%" startAngle={180} endAngle={0}
            innerRadius={75} outerRadius={105} dataKey="value" paddingAngle={1} strokeWidth={0}>
            {data.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div className="absolute inset-0 flex flex-col items-center" style={{ paddingTop: 80 }}>
        <div className="text-3xl font-black" style={{ color, lineHeight: 1 }}>{Math.round(debtPct)}%</div>
        <div className="text-[10px] font-semibold uppercase tracking-wider mt-0.5" style={{ color: '#9CA3AF' }}>Debt Ratio</div>
      </div>
      <div className="absolute bottom-0 w-full flex justify-between px-2">
        <span className="text-[9px] font-semibold" style={{ color: '#10B981' }}>0% · Healthy</span>
        <span className="text-[9px] font-semibold" style={{ color: '#EF4444' }}>100% · High Debt</span>
      </div>
    </div>
  )
}

export default function FinancialHealthClient({ stocks, mutualFunds, fixedDeposits, recurringDeposits,
  npsAccounts, licPolicies, goldInvestments, bondInvestments, etfInvestments, loans, transactions }: any) {

  const { view, fxRate } = useViewStore()
  const isUAE = view === 'uae'
  const sym   = isUAE ? 'AED' : '₹'
  const fmt   = isUAE ? fmtAED : fmtINR
  const fmtK  = isUAE ? fmtAED : fmtKINR

  const filterArr = (arr: any[]) =>
    view === 'uae'   ? arr.filter((x: any) => x.currency === 'AED' || x.country === 'UAE')
    : view === 'india' ? arr.filter((x: any) => x.currency === 'INR' || x.country === 'India')
    : arr

  const convAmt = (amt: number, cur: string) =>
    view === 'consolidated' ? (cur === 'AED' ? amt * fxRate : amt) : amt

  const { totalEquity, totalDebt, breakdown, loanList, debtPct, deRatio,
    zone, avgMonthly } = useMemo(() => {

    const fSt   = filterArr(stocks ?? [])
    const fMF   = filterArr(mutualFunds ?? [])
    const fETF  = filterArr(etfInvestments ?? [])
    const fFD   = filterArr(fixedDeposits ?? [])
    const fRD   = filterArr(recurringDeposits ?? [])
    const fNPS  = filterArr(npsAccounts ?? [])
    const fLIC  = filterArr(licPolicies ?? [])
    const fGold = filterArr(goldInvestments ?? [])
    const fBond = filterArr(bondInvestments ?? [])
    const fLoan = filterArr(loans ?? [])

    const stVal   = fSt.reduce((a: number, s: any) => a + convAmt(s.quantity * (s.current_price ?? s.avg_buy_price), s.currency), 0)
    const mfVal   = fMF.reduce((a: number, m: any) => a + m.units * (m.current_nav ?? m.avg_nav), 0)
    const etfVal  = fETF.reduce((a: number, e: any) => a + Number(e.units ?? 0) * Number(e.current_price ?? e.avg_buy_price ?? 0), 0)
    const fdVal   = fFD.reduce((a: number, f: any) => a + convAmt(Number(f.principal), f.currency), 0)
    const rdVal   = fRD.reduce((a: number, r: any) => a + convAmt(Number(r.monthly_amount) * r.tenure_months, r.currency), 0)
    const npsVal  = fNPS.reduce((a: number, n: any) => a + Number(n.corpus_amount ?? 0), 0)
    const licVal  = fLIC.reduce((a: number, l: any) => a + Number(l.total_paid ?? 0), 0)
    const goldVal = fGold.reduce((a: number, g: any) => {
      if (g.current_price_per_gram && g.quantity_grams)
        return a + Number(g.current_price_per_gram) * Number(g.quantity_grams)
      return a + Number(g.invested_amount ?? 0)
    }, 0)
    const bondVal = fBond.reduce((a: number, b: any) => a + Number(b.current_value ?? b.invested_amount ?? 0), 0)

    const totalEquity = stVal + mfVal + etfVal + fdVal + rdVal + npsVal + licVal + goldVal + bondVal

    const totalDebt = fLoan.reduce((a: number, l: any) => a + convAmt(Number(l.outstanding_amt), l.currency), 0)

    const totalPortfolio = totalEquity + totalDebt
    const debtPct  = totalPortfolio > 0 ? (totalDebt / totalPortfolio) * 100 : 0
    const deRatio  = totalEquity > 0 ? (totalDebt / totalEquity).toFixed(2) : totalDebt > 0 ? '∞' : '0'
    const zone     = getZone(debtPct, totalDebt, totalEquity)

    const breakdown = [
      { name: 'Stocks',    value: Math.round(stVal),   color: '#3B7DD8' },
      { name: 'Mutual\nFunds', value: Math.round(mfVal), color: '#3D7A58' },
      { name: 'ETF',       value: Math.round(etfVal),  color: '#7C5CBF' },
      { name: 'FD',        value: Math.round(fdVal),   color: '#D4920A' },
      { name: 'RD',        value: Math.round(rdVal),   color: '#C96A3A' },
      { name: 'NPS',       value: Math.round(npsVal),  color: '#059669' },
      { name: 'LIC',       value: Math.round(licVal),  color: '#6D28D9' },
      { name: 'Gold',      value: Math.round(goldVal), color: '#D97706' },
      { name: 'Bonds',     value: Math.round(bondVal), color: '#0891B2' },
    ].filter(d => d.value > 0)

    const loanList = fLoan.map((l: any) => ({
      ...l,
      outstanding: convAmt(Number(l.outstanding_amt), l.currency),
      remaining: Math.max(0, l.tenure_months - (l.months_paid ?? 0)),
      typeLabel: LOAN_TYPE_LABELS[l.loan_type ?? 'home_loan'] ?? 'Loan',
    })).sort((a: any, b: any) => b.interest_rate - a.interest_rate)

    const now = new Date()
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1).toISOString().slice(0, 7)
    const recentIncome = filterArr(transactions ?? []).filter((t: any) =>
      t.txn_type === 'income' && t.txn_date?.slice(0, 7) >= sixMonthsAgo
    ).reduce((a: number, t: any) => a + convAmt(Number(t.amount), t.currency ?? 'INR'), 0)
    const avgMonthly = Math.round(recentIncome / 6)

    return { totalEquity, totalDebt, breakdown, loanList, debtPct, deRatio, zone, avgMonthly }
  }, [view, fxRate, stocks, mutualFunds, fixedDeposits, recurringDeposits, npsAccounts,
    licPolicies, goldInvestments, bondInvestments, etfInvestments, loans, transactions])

  const zoneConf = ZONE_CONFIG[zone]
  const ZoneIcon = zoneConf.icon

  const recommendations = useMemo(() => {
    const recs = []
    const highestRateLoan = loanList[0]

    if (zone === 'high_debt') {
      if (highestRateLoan) {
        const extra = Math.max(2000, Math.round(highestRateLoan.emi_amount * 0.10 / 500) * 500)
        const interestSaved = Math.round(extra * highestRateLoan.remaining * Number(highestRateLoan.interest_rate) / 1200)
        const monthsEarly = Math.min(highestRateLoan.remaining, Math.round(extra * highestRateLoan.remaining / Number(highestRateLoan.outstanding)))
        recs.push({
          type: 'debt', color: '#EF4444', bg: '#FEF2F2', icon: TrendingDown,
          title: `Prepay ${highestRateLoan.name}`,
          body: `At ${highestRateLoan.interest_rate}% interest, paying ${fmt(extra)} extra/month closes this loan ~${monthsEarly} months early and saves ${fmt(interestSaved)} in total interest.`,
          tag: `Saves ${fmt(interestSaved)} interest`,
        })
      }
      const sipAmount = avgMonthly > 0 ? Math.max(1000, Math.round(avgMonthly * 0.05 / 500) * 500) : 2000
      recs.push({
        type: 'invest', color: '#3D7A58', bg: 'var(--sage-bg)', icon: TrendingUp,
        title: 'Start a small SIP alongside',
        body: `Even ${fmt(sipAmount)}/month in a low-cost index fund builds an investing habit and compounds over time while you reduce debt.`,
        tag: `${fmt(sipAmount)}/month builds the habit`,
      })
      const emergencyFund = avgMonthly > 0 ? fmt(avgMonthly * 3) : `${sym} 1–2L`
      recs.push({
        type: 'protect', color: '#6B7280', bg: 'var(--bg2)', icon: Shield,
        title: 'Build a 3-month emergency buffer',
        body: `Before aggressive debt prepayment, keep ${emergencyFund} liquid so you don't need to take new loans for emergencies.`,
        tag: 'Prevents new debt cycles',
      })
    } else if (zone === 'moderate') {
      const equityNeeded = Math.max(0, (7 / 3) * totalDebt - totalEquity)
      const sipToHealthy = equityNeeded > 0 ? Math.round(equityNeeded / 36 / 500) * 500 : 0
      if (sipToHealthy > 0) {
        recs.push({
          type: 'invest', color: '#10B981', bg: '#ECFDF5', icon: TrendingUp,
          title: 'Increase SIP to reach Healthy zone',
          body: `You need ${fmt(equityNeeded)} more in investments to cross into the Healthy zone. A SIP of ${fmtK(sipToHealthy)}/month gets you there in ~3 years (before market returns).`,
          tag: `${fmtK(sipToHealthy)}/month → Healthy in 3 yrs`,
        })
      }
      if (highestRateLoan) {
        const extra = Math.max(1000, Math.round(highestRateLoan.emi_amount * 0.15 / 500) * 500)
        const interestSaved = Math.round(extra * highestRateLoan.remaining * Number(highestRateLoan.interest_rate) / 1200)
        recs.push({
          type: 'debt', color: '#F59E0B', bg: '#FFFBEB', icon: TrendingDown,
          title: `Pay extra on ${highestRateLoan.name} (${highestRateLoan.interest_rate}%)`,
          body: `Your highest-interest loan — paying ${fmt(extra)} extra/month reduces this balance faster and saves ${fmt(interestSaved)} over the loan tenure.`,
          tag: `Saves ${fmt(interestSaved)} in interest`,
        })
      }
      recs.push({
        type: 'invest', color: '#3B7DD8', bg: 'var(--blue-bg)', icon: Target,
        title: 'Diversify your investments',
        body: 'If your equity is concentrated in one asset type, spread across mutual funds, FD, and gold to reduce risk while growing total equity.',
        tag: 'Reduces concentration risk',
      })
    } else if (zone === 'healthy') {
      if (highestRateLoan) {
        const extra = Math.max(2000, Math.round(highestRateLoan.emi_amount * 0.20 / 500) * 500)
        const interestSaved = Math.round(extra * highestRateLoan.remaining * Number(highestRateLoan.interest_rate) / 1200)
        recs.push({
          type: 'debt', color: '#10B981', bg: '#ECFDF5', icon: CheckCircle2,
          title: `Optionally prepay ${highestRateLoan.name}`,
          body: `Your highest-rate loan is at ${highestRateLoan.interest_rate}%. Paying ${fmt(extra)} extra/month saves ${fmt(interestSaved)} and frees up cash flow. Compare this to expected investment returns first.`,
          tag: `Frees ${fmt(Number(highestRateLoan.emi_amount))}/month sooner`,
        })
      }
      recs.push({
        type: 'invest', color: '#3D7A58', bg: 'var(--sage-bg)', icon: TrendingUp,
        title: 'Grow your equity aggressively',
        body: 'With your debt well under control, this is the time to maximise SIPs, increase NPS contributions (tax benefit), and look at international index funds for diversification.',
        tag: 'Compound growth phase',
      })
      recs.push({
        type: 'invest', color: '#6D28D9', bg: '#EDE9FE', icon: Shield,
        title: 'Maximise tax-efficient instruments',
        body: 'NPS (up to ₹50K extra under 80CCD), ELSS (₹1.5L under 80C), and SGBs for gold give you both growth and tax savings.',
        tag: 'Saves tax + builds wealth',
      })
    } else if (zone === 'debt_free') {
      recs.push({
        type: 'invest', color: '#3D7A58', bg: 'var(--sage-bg)', icon: TrendingUp,
        title: 'You\'re debt-free — invest aggressively',
        body: 'Without any EMI burden, redirect all surplus into equity mutual funds and NPS. A monthly SIP of 40–50% of income accelerates wealth creation significantly.',
        tag: 'Maximum compounding potential',
      })
    }
    return recs
  }, [zone, loanList, totalEquity, totalDebt, avgMonthly, fmt, fmtK, sym])

  const pathData = useMemo(() => {
    if (zone === 'healthy' || zone === 'debt_free') return null
    const equityTarget = (7 / 3) * totalDebt
    const equityGap    = Math.max(0, equityTarget - totalEquity)
    const sipNeeded    = Math.round(equityGap / 36 / 500) * 500
    const currentDebtPct = Math.round(debtPct)
    const steps = [
      { pct: currentDebtPct, label: `Now (${currentDebtPct}%)`, active: true },
      { pct: 50, label: '50% · Moderate', active: currentDebtPct > 50 },
      { pct: 30, label: '30% · Healthy',  active: currentDebtPct > 30 },
    ]
    return { equityGap, sipNeeded, steps }
  }, [zone, totalDebt, totalEquity, debtPct])

  return (
    <div className="space-y-5 animate-fade-up">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--text)' }}>Financial Health</h1>
          <p className="text-[12px] mt-0.5" style={{ color: 'var(--text3)' }}>
            Debt vs Equity Analysis ·{' '}
            {view === 'uae' ? 'UAE (AED)' : view === 'india' ? 'India (INR)' : 'Consolidated (INR)'}
            {' '}— all investments vs all active loans
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/dashboard/investments"
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-semibold border"
            style={{ background: 'var(--sage-bg)', borderColor: 'var(--sage)' + '40', color: 'var(--sage)' }}>
            <TrendingUp size={12} /> Investments
          </Link>
          <Link href="/dashboard/loans"
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-semibold border"
            style={{ background: 'var(--blue-bg)', borderColor: 'var(--blue)' + '40', color: 'var(--blue)' }}>
            <TrendingDown size={12} /> Loans
          </Link>
        </div>
      </div>

      {/* Zone Hero */}
      <div className="wl-card p-5" style={{ background: zoneConf.bg, border: `1.5px solid ${zoneConf.color}30` }}>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-center">
          <div>
            <DebtGauge debtPct={debtPct} zone={zone} />
          </div>
          <div className="lg:col-span-2">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: zoneConf.color + '20' }}>
                <ZoneIcon size={16} style={{ color: zoneConf.color }} />
              </div>
              <span className="text-[18px] font-black" style={{ color: zoneConf.color }}>{zoneConf.label}</span>
            </div>
            <p className="text-[13px] mb-4" style={{ color: 'var(--text2)' }}>{zoneConf.description}</p>

            <div className="mb-3">
              <div className="flex justify-between text-[9px] font-semibold mb-1" style={{ color: '#9CA3AF' }}>
                <span>Debt-Free</span><span>Healthy</span><span>Moderate</span><span>High Debt</span>
              </div>
              <div className="h-3 rounded-full overflow-hidden" style={{ background: 'linear-gradient(to right, #10B981, #34D399, #F59E0B, #EF4444)' }}>
                <div className="relative h-full">
                  <div className="absolute top-0 bottom-0 w-0.5 rounded bg-white shadow-lg"
                    style={{ left: `${Math.min(98, Math.max(2, Math.round(debtPct)))}%`, transform: 'translateX(-50%)' }} />
                </div>
              </div>
              <div className="text-[10px] mt-1 font-medium" style={{ color: 'var(--text3)' }}>
                Your position: <span style={{ color: zoneConf.color, fontWeight: 700 }}>{Math.round(debtPct)}% debt</span>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {[
                { label: 'Total Equity', value: fmt(totalEquity), color: '#10B981' },
                { label: 'Total Debt',   value: fmt(totalDebt),   color: '#EF4444' },
                { label: 'D/E Ratio',    value: `${deRatio}×`,    color: zoneConf.color },
              ].map(k => (
                <div key={k.label} className="rounded-xl p-2.5 text-center" style={{ background: '#fff' }}>
                  <div className="text-[15px] font-black" style={{ color: k.color }}>{k.value}</div>
                  <div className="text-[9px] font-semibold uppercase tracking-wider mt-0.5" style={{ color: '#9CA3AF' }}>{k.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Breakdown row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Investment breakdown */}
        <div className="wl-card p-4">
          <div className="text-[11px] font-bold uppercase tracking-wider mb-3" style={{ color: 'var(--text3)' }}>
            Investment Breakdown · {fmt(totalEquity)}
          </div>
          {breakdown.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 gap-2 text-[12px]" style={{ color: 'var(--text3)' }}>
              <TrendingUp size={24} style={{ color: 'var(--border2)' }} />
              No investments added yet
              <Link href="/dashboard/investments" className="text-[11px]" style={{ color: 'var(--sage)' }}>Add Investments <ArrowRight size={10} className="inline" /></Link>
            </div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={170}>
                <BarChart data={breakdown} layout="vertical" margin={{ left: 0, right: 16 }}>
                  <XAxis type="number" hide />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: 'var(--text3)' }} width={50} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 8, fontSize: 11 }}
                    formatter={(v: any) => [fmt(v), 'Value']} />
                  <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                    {breakdown.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <div className="mt-2 space-y-1">
                {breakdown.slice(0, 5).map((d, i) => (
                  <div key={i} className="flex items-center justify-between text-[11px]">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ background: d.color }} />
                      <span style={{ color: 'var(--text2)' }}>{d.name.replace('\n', ' ')}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono" style={{ color: 'var(--text)' }}>{fmt(d.value)}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'var(--bg2)', color: 'var(--text3)' }}>
                        {totalEquity > 0 ? Math.round(d.value / totalEquity * 100) : 0}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Loan breakdown */}
        <div className="wl-card p-4">
          <div className="text-[11px] font-bold uppercase tracking-wider mb-3" style={{ color: 'var(--text3)' }}>
            Loan Breakdown · {fmt(totalDebt)}
          </div>
          {loanList.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 gap-2 text-[12px]" style={{ color: 'var(--text3)' }}>
              <TrendingDown size={24} style={{ color: 'var(--border2)' }} />
              No active loans
            </div>
          ) : (
            <div className="space-y-3">
              {loanList.map((l: any, i: number) => {
                const pct = totalDebt > 0 ? Math.round(l.outstanding / totalDebt * 100) : 0
                const interestColor = Number(l.interest_rate) >= 12 ? '#EF4444' : Number(l.interest_rate) >= 8 ? '#F59E0B' : '#10B981'
                return (
                  <div key={i} className="p-3 rounded-xl" style={{ background: 'var(--bg2)' }}>
                    <div className="flex items-start justify-between mb-1.5">
                      <div>
                        <div className="text-[12px] font-semibold" style={{ color: 'var(--text)' }}>{l.name}</div>
                        <div className="text-[10px]" style={{ color: 'var(--text3)' }}>{l.typeLabel} · {l.bank_name}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-[13px] font-bold font-mono" style={{ color: '#EF4444' }}>{fmt(l.outstanding)}</div>
                        <span className="text-[10px] font-bold" style={{ color: interestColor }}>
                          {Number(l.interest_rate).toFixed(1)}% p.a.
                        </span>
                      </div>
                    </div>
                    <div className="h-1.5 rounded-full mb-1.5 overflow-hidden" style={{ background: 'var(--border)' }}>
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: '#EF4444' }} />
                    </div>
                    <div className="flex justify-between text-[10px]" style={{ color: 'var(--text3)' }}>
                      <span>EMI: <span className="font-semibold" style={{ color: 'var(--text)' }}>{fmt(Number(l.emi_amount))}</span></span>
                      <span>{l.remaining} months left</span>
                      <span>{pct}% of total debt</span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Action Plan */}
      <div className="wl-card p-4">
        <div className="text-[11px] font-bold uppercase tracking-wider mb-3" style={{ color: 'var(--text3)' }}>
          Your Action Plan · {zoneConf.label} Zone
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          {recommendations.map((r, i) => {
            const Icon = r.icon
            return (
              <div key={i} className="p-4 rounded-xl border" style={{ background: r.bg, borderColor: r.color + '30' }}>
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: r.color + '20' }}>
                    <Icon size={14} style={{ color: r.color }} />
                  </div>
                  <span className="text-[12px] font-bold" style={{ color: 'var(--text)' }}>{r.title}</span>
                </div>
                <p className="text-[11px] mb-3 leading-relaxed" style={{ color: 'var(--text2)' }}>{r.body}</p>
                <div className="text-[10px] font-bold px-2 py-1 rounded-lg inline-block" style={{ background: r.color + '18', color: r.color }}>
                  {r.tag}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Path to Healthy — only for non-healthy zones */}
      {pathData && (
        <div className="wl-card p-4" style={{ background: 'linear-gradient(135deg, var(--sage-bg) 0%, #fff 60%)' }}>
          <div className="text-[11px] font-bold uppercase tracking-wider mb-4" style={{ color: 'var(--text3)' }}>Path to Healthy Zone</div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-center">
            <div className="flex items-center gap-2">
              {pathData.steps.map((s, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div className="flex flex-col items-center">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold text-white"
                      style={{ background: s.active ? ZONE_CONFIG[zone].color : '#10B981' }}>
                      {s.active ? '→' : '✓'}
                    </div>
                    <div className="text-[9px] font-semibold mt-1 text-center max-w-[64px]" style={{ color: s.active ? ZONE_CONFIG[zone].color : '#10B981' }}>
                      {s.label}
                    </div>
                  </div>
                  {i < pathData.steps.length - 1 && (
                    <div className="h-0.5 w-8 flex-shrink-0" style={{ background: 'var(--border)' }} />
                  )}
                </div>
              ))}
            </div>
            <div className="space-y-2.5">
              <div className="flex items-baseline justify-between p-3 rounded-xl" style={{ background: '#fff' }}>
                <div>
                  <div className="text-[11px] font-semibold" style={{ color: 'var(--text)' }}>Investment gap to Healthy</div>
                  <div className="text-[10px]" style={{ color: 'var(--text3)' }}>Equity needed: equity &gt; 2.3× your total debt</div>
                </div>
                <div className="text-[16px] font-black" style={{ color: '#3D7A58' }}>{fmt(pathData.equityGap)}</div>
              </div>
              {pathData.sipNeeded > 0 && (
                <div className="flex items-baseline justify-between p-3 rounded-xl" style={{ background: '#fff' }}>
                  <div>
                    <div className="text-[11px] font-semibold" style={{ color: 'var(--text)' }}>Suggested monthly SIP / investment</div>
                    <div className="text-[10px]" style={{ color: 'var(--text3)' }}>Reaches Healthy zone in ~3 years</div>
                  </div>
                  <div className="text-[16px] font-black" style={{ color: '#3D7A58' }}>{fmtK(pathData.sipNeeded)}</div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Healthy celebration */}
      {(zone === 'healthy' || zone === 'debt_free') && (
        <div className="wl-card p-5 text-center" style={{ background: 'linear-gradient(135deg, var(--sage-bg) 0%, #fff 80%)' }}>
          <div className="text-2xl mb-2">🎉</div>
          <div className="text-[16px] font-black" style={{ color: 'var(--sage)' }}>
            {zone === 'debt_free' ? 'You are completely debt-free!' : 'Your investments outweigh your debt!'}
          </div>
          <div className="text-[12px] mt-1" style={{ color: 'var(--text2)' }}>
            {zone === 'debt_free'
              ? 'Focus on compounding your wealth. Invest aggressively into equity, NPS, and diversified instruments.'
              : `You have ${fmt(totalEquity - totalDebt)} more in investments than debt. Keep growing your equity.`}
          </div>
        </div>
      )}
    </div>
  )
}
