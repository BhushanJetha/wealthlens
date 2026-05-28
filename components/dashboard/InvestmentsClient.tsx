'use client'
import { useMemo, useState } from 'react'
import { useViewStore } from '@/store/viewStore'
import MetricCard from '@/components/dashboard/MetricCard'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import {
  TrendingUp, TrendingDown, Plus, ArrowRight,
  AlertTriangle, CheckCircle2, Zap, Target, Shield,
} from 'lucide-react'
import AddInvestmentModal from '@/components/forms/AddInvestmentModal'
import Link from 'next/link'

const FX = 22.80
const COLORS = ['#3D7A58','#3B7DD8','#D4920A','#C96A3A','#7C5CBF','#2E7D52','#B45309','#0891B2','#6D28D9']

function toINR(amt: number, cur: string) { return cur === 'AED' ? amt * FX : amt }
function fmt(n: number, sym: string) {
  if (sym !== '₹') {
    if (Math.abs(n) >= 1000000) return `AED ${(n / 1000000).toFixed(2)}M`
    if (Math.abs(n) >= 1000)    return `AED ${(n / 1000).toFixed(1)}K`
    return `AED ${Math.round(n).toLocaleString()}`
  }
  if (Math.abs(n) >= 10000000) return `₹${(n / 10000000).toFixed(2)}Cr`
  if (Math.abs(n) >= 100000)   return `₹${(n / 100000).toFixed(2)}L`
  return `₹${Math.round(n).toLocaleString('en-IN')}`
}

const INV_TYPES = [
  { href: '/dashboard/investments/mutual-funds',       label: 'Mutual Funds',       key: 'mf'    },
  { href: '/dashboard/investments/stocks',             label: 'Stocks',             key: 'st'    },
  { href: '/dashboard/investments/etf',                label: 'ETF',                key: 'etf'   },
  { href: '/dashboard/investments/fixed-deposits',     label: 'Fixed Deposits',     key: 'fd'    },
  { href: '/dashboard/investments/recurring-deposits', label: 'Recurring Deposits', key: 'rd'    },
  { href: '/dashboard/investments/gold',               label: 'Gold',               key: 'gold'  },
  { href: '/dashboard/investments/bonds',              label: 'Bonds',              key: 'bonds' },
  { href: '/dashboard/investments/nps',                label: 'NPS',                key: 'nps'   },
  { href: '/dashboard/investments/lic',                label: 'LIC',                key: 'lic'   },
]

const PROFILE_CONFIG = {
  aggressive:   { label: 'Aggressive',   color: '#EF4444', bg: '#FEF2F2', desc: 'Heavy on equity — high growth potential with higher volatility. Best for a 7+ year investment horizon.' },
  moderate:     { label: 'Moderate',     color: '#F59E0B', bg: '#FFFBEB', desc: 'Balanced equity + stable mix — decent growth with manageable risk. Good for 3–7 year goals.' },
  conservative: { label: 'Conservative', color: '#3B7DD8', bg: 'var(--blue-bg)', desc: 'Capital preservation focus — low volatility but may underperform inflation over the long run.' },
}

export default function InvestmentsClient({
  stocks, mutualFunds, fixedDeposits, recurringDeposits, npsAccounts, licPolicies,
  goldInvestments = [], bondInvestments = [], etfInvestments = []
}: any) {
  const { view } = useViewStore()
  const [showAdd, setShowAdd] = useState(false)
  const sym = view === 'uae' ? 'AED' : '₹'

  const filter = (arr: any[]) =>
    view === 'uae'   ? arr.filter(x => x.currency === 'AED' || x.country === 'UAE')
    : view === 'india' ? arr.filter(x => x.currency === 'INR' || x.country === 'India')
    : arr

  const conv = (amt: number, cur: string) => view === 'consolidated' ? toINR(amt, cur) : amt

  const fSt   = filter(stocks ?? [])
  const fMF   = filter(mutualFunds ?? [])
  const fFD   = filter(fixedDeposits ?? [])
  const fRD   = filter(recurringDeposits ?? [])
  const fNPS  = filter(npsAccounts ?? [])
  const fLIC  = filter(licPolicies ?? [])
  const fGold = filter(goldInvestments)
  const fBond = filter(bondInvestments)
  const fEtf  = filter(etfInvestments)

  const stCurr  = fSt.reduce((a: number, s: any) => a + conv(s.quantity * (s.current_price ?? s.avg_buy_price), s.currency), 0)
  const stInv   = fSt.reduce((a: number, s: any) => a + conv(s.quantity * s.avg_buy_price, s.currency), 0)
  const mfCurr  = fMF.reduce((a: number, m: any) => a + m.units * (m.current_nav ?? m.avg_nav), 0)
  const mfInv   = fMF.reduce((a: number, m: any) => a + Number(m.invested_amount), 0)
  const fdVal   = fFD.reduce((a: number, f: any) => a + conv(Number(f.principal), f.currency), 0)
  const rdVal   = fRD.reduce((a: number, r: any) => a + conv(Number(r.monthly_amount) * r.tenure_months, r.currency), 0)
  const npsVal  = fNPS.reduce((a: number, n: any) => a + Number(n.corpus_amount), 0)
  const npsInv  = fNPS.reduce((a: number, n: any) => a + Number(n.invested_amount), 0)
  const licVal  = fLIC.reduce((a: number, l: any) => a + Number(l.sum_assured), 0)
  const licPaid = fLIC.reduce((a: number, l: any) => a + Number(l.total_paid ?? 0), 0)
  const goldVal = fGold.reduce((a: number, g: any) => {
    if (g.current_price_per_gram && g.quantity_grams) return a + Number(g.current_price_per_gram) * Number(g.quantity_grams)
    return a + Number(g.invested_amount || 0)
  }, 0)
  const goldInv = fGold.reduce((a: number, g: any) => a + Number(g.invested_amount || 0), 0)
  const bondVal = fBond.reduce((a: number, b: any) => a + Number(b.current_value || b.invested_amount || 0), 0)
  const bondInv = fBond.reduce((a: number, b: any) => a + Number(b.invested_amount || 0), 0)
  const etfCurr = fEtf.reduce((a: number, e: any) => a + Number(e.units || 0) * Number(e.current_price || e.avg_buy_price || 0), 0)
  const etfInv  = fEtf.reduce((a: number, e: any) => a + Number(e.invested_amount || 0), 0)

  const totalCurr = stCurr + mfCurr + fdVal + rdVal + npsVal + goldVal + bondVal + etfCurr + licPaid
  const totalInv  = stInv  + mfInv  + fdVal + rdVal + npsInv + goldInv + bondInv + etfInv
  const totalRet  = totalInv > 0 ? ((totalCurr - totalInv) / totalInv * 100).toFixed(2) : '0.00'
  const dailyPnL  = fSt.reduce((a: number, s: any) => a + (s.daily_change ?? 0), 0)

  const allocData = [
    { name: 'Mutual Funds', value: Math.round(mfCurr),   count: fMF.length   },
    { name: 'Stocks',       value: Math.round(stCurr),   count: fSt.length   },
    { name: 'ETF',          value: Math.round(etfCurr),  count: fEtf.length  },
    { name: 'FDs',          value: Math.round(fdVal),    count: fFD.length   },
    { name: 'RDs',          value: Math.round(rdVal),    count: fRD.length   },
    { name: 'Gold',         value: Math.round(goldVal),  count: fGold.length },
    { name: 'Bonds',        value: Math.round(bondVal),  count: fBond.length },
    { name: 'NPS',          value: Math.round(npsVal),   count: fNPS.length  },
    { name: 'LIC',          value: Math.round(licPaid),  count: fLIC.length  },
  ].filter(d => d.value > 0)

  const typeStats = useMemo(() => [
    { label: 'Mutual Funds',       value: fmt(mfCurr, sym),  count: fMF.length,   href: '/dashboard/investments/mutual-funds',       color: COLORS[0] },
    { label: 'Stocks',             value: fmt(stCurr, sym),  count: fSt.length,   href: '/dashboard/investments/stocks',             color: COLORS[1] },
    { label: 'ETF',                value: fmt(etfCurr, sym), count: fEtf.length,  href: '/dashboard/investments/etf',                color: COLORS[2] },
    { label: 'Fixed Deposits',     value: fmt(fdVal, sym),   count: fFD.length,   href: '/dashboard/investments/fixed-deposits',     color: COLORS[3] },
    { label: 'Recurring Deposits', value: fmt(rdVal, sym),   count: fRD.length,   href: '/dashboard/investments/recurring-deposits', color: COLORS[4] },
    { label: 'Gold',               value: fmt(goldVal, sym), count: fGold.length, href: '/dashboard/investments/gold',               color: COLORS[5] },
    { label: 'Bonds',              value: fmt(bondVal, sym), count: fBond.length, href: '/dashboard/investments/bonds',              color: COLORS[6] },
    { label: 'NPS',                value: fmt(npsVal, sym),  count: fNPS.length,  href: '/dashboard/investments/nps',                color: COLORS[7] },
    { label: 'LIC',                value: fmt(licVal, sym),  count: fLIC.length,  href: '/dashboard/investments/lic',                color: COLORS[8] },
  ], [mfCurr, stCurr, etfCurr, fdVal, rdVal, goldVal, bondVal, npsVal, licVal,
    fMF, fSt, fEtf, fFD, fRD, fGold, fBond, fNPS, fLIC, sym])

  // ─── Analytics ────────────────────────────────────────────────────────────────
  const analytics = useMemo(() => {
    if (totalCurr === 0) return null

    // Equity vs stable vs alternative
    const isEquityMF = (m: any) => {
      const t = (m.fund_type ?? '').toLowerCase()
      return ['equity', 'elss', 'large_cap', 'mid_cap', 'small_cap', 'flexi_cap', 'multi_cap',
        'index', 'smallcap', 'midcap', 'largecap', 'growth'].some(k => t.includes(k))
    }
    const equityMfVal = fMF.filter(isEquityMF).reduce((a: number, m: any) => a + m.units * (m.current_nav ?? m.avg_nav), 0)
    const equityTotal = stCurr + etfCurr + equityMfVal
    const stableTotal = fdVal + rdVal + bondVal
    const altTotal    = goldVal + npsVal + licPaid

    const equityPct = equityTotal / totalCurr * 100
    const stablePct = stableTotal / totalCurr * 100
    const altPct    = altTotal    / totalCurr * 100

    const profile: 'aggressive' | 'moderate' | 'conservative' =
      equityPct >= 55 ? 'aggressive' : equityPct >= 25 ? 'moderate' : 'conservative'

    // Health score (0–100)
    const divScore  = Math.min(allocData.length * 8, 40)
    const retPct    = Number(totalRet)
    const retScore  = retPct > 15 ? 40 : retPct > 8 ? 28 : retPct > 3 ? 18 : retPct > 0 ? 10 : 0
    const topAsset  = allocData.length > 0 ? Math.max(...allocData.map(d => d.value / totalCurr * 100)) : 0
    const concScore = topAsset < 25 ? 20 : topAsset < 40 ? 12 : topAsset < 60 ? 5 : 0
    const healthScore = divScore + retScore + concScore

    // Returns by investment type
    const typeReturns = [
      { name: 'Stocks',  curr: stCurr,  inv: stInv,  color: '#3B7DD8' },
      { name: 'MF',      curr: mfCurr,  inv: mfInv,  color: '#3D7A58' },
      { name: 'ETF',     curr: etfCurr, inv: etfInv, color: '#7C5CBF' },
      { name: 'NPS',     curr: npsVal,  inv: npsInv, color: '#059669' },
      { name: 'Gold',    curr: goldVal, inv: goldInv, color: '#D97706' },
      { name: 'Bonds',   curr: bondVal, inv: bondInv, color: '#0891B2' },
    ].filter(t => t.inv > 100 && t.curr > 0)
     .map(t => ({ ...t, pct: (t.curr - t.inv) / t.inv * 100 }))
     .sort((a, b) => b.pct - a.pct)

    // Sector distribution (stocks)
    const sectorMap: Record<string, number> = {}
    fSt.forEach((s: any) => {
      const sec = s.sector ?? 'Equity'
      sectorMap[sec] = (sectorMap[sec] ?? 0) + conv(s.quantity * (s.current_price ?? s.avg_buy_price), s.currency)
    })
    const sectorData = Object.entries(sectorMap)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)

    // MF category distribution
    const mfCatMap: Record<string, number> = {}
    fMF.forEach((m: any) => {
      const cat = (m.fund_type ?? 'Other').toUpperCase().replace('_', ' ')
      mfCatMap[cat] = (mfCatMap[cat] ?? 0) + m.units * (m.current_nav ?? m.avg_nav)
    })
    const mfCatData = Object.entries(mfCatMap)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)

    // Underperforming stocks
    const underStocks = fSt
      .map((s: any) => {
        const curV = conv(s.quantity * (s.current_price ?? s.avg_buy_price), s.currency)
        const invV = conv(s.quantity * s.avg_buy_price, s.currency)
        return { ...s, curV, invV, retPct: invV > 0 ? (curV - invV) / invV * 100 : 0 }
      })
      .filter((s: any) => s.retPct < 0)
      .sort((a: any, b: any) => a.retPct - b.retPct)

    // Underperforming MFs
    const underMF = fMF
      .map((m: any) => {
        const curV = m.units * (m.current_nav ?? m.avg_nav)
        const invV = Number(m.invested_amount)
        return { ...m, curV, invV, retPct: invV > 0 ? (curV - invV) / invV * 100 : 0 }
      })
      .filter((m: any) => m.retPct < 0)
      .sort((a: any, b: any) => a.retPct - b.retPct)

    // Top stock concentration
    const topStockEntry = fSt.length > 0
      ? fSt.map((s: any) => ({ ...s, val: conv(s.quantity * (s.current_price ?? s.avg_buy_price), s.currency) }))
           .sort((a: any, b: any) => b.val - a.val)[0]
      : null
    const topStockPct = topStockEntry && stCurr > 0 ? topStockEntry.val / stCurr * 100 : 0

    const topMFEntry = fMF.length > 0
      ? fMF.map((m: any) => ({ ...m, val: m.units * (m.current_nav ?? m.avg_nav) }))
           .sort((a: any, b: any) => b.val - a.val)[0]
      : null
    const topMFPct = topMFEntry && mfCurr > 0 ? topMFEntry.val / mfCurr * 100 : 0

    // Recommendations
    const recs: any[] = []

    if (topStockPct > 40 && topStockEntry) {
      recs.push({
        icon: AlertTriangle, color: '#EF4444', bg: '#FEF2F2',
        title: `High concentration: ${topStockEntry.name}`,
        body: `${topStockPct.toFixed(0)}% of your stock portfolio is in one stock. Diversify across 8–12 stocks in different sectors to reduce single-stock risk.`,
        tag: 'Reduces single-stock risk',
      })
    }

    if (topMFPct > 65 && topMFEntry && fMF.length >= 2) {
      recs.push({
        icon: AlertTriangle, color: '#F59E0B', bg: '#FFFBEB',
        title: `MF over-concentration: ${topMFEntry.name ?? 'Top Fund'}`,
        body: `${topMFPct.toFixed(0)}% of your MF portfolio is in one fund. Spread across 3–4 funds with different mandates (large cap, mid cap, hybrid) for better resilience.`,
        tag: 'Better fund diversification',
      })
    }

    if (equityPct < 25 && totalCurr > 200000) {
      recs.push({
        icon: TrendingUp, color: '#3D7A58', bg: 'var(--sage-bg)',
        title: 'Increase equity for higher long-term growth',
        body: `Only ${equityPct.toFixed(0)}% is in equity (stocks / ETF / equity MF). For a 5+ year horizon, equity historically delivers 12–15% CAGR. Consider starting SIPs in index funds.`,
        tag: 'Higher long-term returns',
      })
    }

    if ((fdVal + rdVal) > totalCurr * 0.5 && totalCurr > 0) {
      recs.push({
        icon: Zap, color: '#F59E0B', bg: '#FFFBEB',
        title: 'Too much in fixed-rate instruments',
        body: `${(((fdVal + rdVal) / totalCurr) * 100).toFixed(0)}% in FD/RD. With inflation at 5–6%, real returns may be negligible. Redirect maturing FDs into equity mutual funds gradually.`,
        tag: 'Beat inflation',
      })
    }

    if (allocData.length < 3 && totalCurr > 100000) {
      recs.push({
        icon: Target, color: '#7C5CBF', bg: '#EDE9FE',
        title: 'Diversify across more asset classes',
        body: `You use ${allocData.length} asset type(s). A resilient portfolio typically covers equity + debt + gold + alternatives. Each class responds differently to market cycles.`,
        tag: 'Reduce portfolio volatility',
      })
    }

    if (npsVal === 0 && view !== 'uae') {
      recs.push({
        icon: Shield, color: '#6D28D9', bg: '#EDE9FE',
        title: 'Start NPS for retirement + ₹50K extra deduction',
        body: 'NPS Tier 1 gives an extra ₹50,000 deduction under 80CCD(1B) beyond the ₹1.5L 80C limit. Even ₹3,000/month compounds significantly with employer co-contributions.',
        tag: '₹50K extra tax savings',
      })
    }

    if (underStocks.length === 0 && underMF.length === 0 && Number(totalRet) > 5) {
      recs.push({
        icon: CheckCircle2, color: '#10B981', bg: '#ECFDF5',
        title: 'All investments in profit — scale up SIPs',
        body: `Portfolio returns ${totalRet}%. To accelerate wealth: step up SIPs by 10% each year. Consistent compounding at this rate builds significant wealth over 10–15 years.`,
        tag: 'Maximize compounding',
      })
    }

    return {
      profile, equityPct, stablePct, altPct,
      healthScore, divScore, retScore, concScore,
      typeReturns, sectorData, mfCatData,
      underStocks, underMF,
      topStockEntry, topStockPct, topMFEntry, topMFPct,
      recs: recs.slice(0, 4),
    }
  }, [fSt, fMF, fFD, fRD, fNPS, fLIC, fGold, fBond, fEtf,
    stCurr, mfCurr, etfCurr, fdVal, rdVal, npsVal, goldVal, bondVal, licPaid,
    stInv, mfInv, etfInv, npsInv, goldInv, bondInv,
    totalCurr, totalRet, allocData, view, sym])

  return (
    <div className="space-y-5 animate-fade-up">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--text)' }}>Investment Portfolio</h1>
          <p className="text-[12px] mt-0.5" style={{ color: 'var(--text3)' }}>
            {view === 'uae' ? 'UAE investments' : view === 'india' ? 'India investments' : 'All investments'} — select a category to drill down
          </p>
        </div>
        <button onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-white text-[12px] font-bold"
          style={{ background: 'var(--sage)' }}>
          <Plus size={14} /> Add Investment
        </button>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard label="Total Invested"  value={fmt(totalInv, sym)}  accent="blue" icon={<TrendingUp size={14} />} />
        <MetricCard label="Current Value"   value={fmt(totalCurr, sym)} accent="sage" icon={<TrendingUp size={14} />} />
        <MetricCard label="Total Returns"
          value={fmt(totalCurr - totalInv, sym)}
          delta={`${Number(totalRet) >= 0 ? '+' : ''}${totalRet}%`}
          positive={Number(totalRet) >= 0} accent="gold" />
        <MetricCard label="Today&apos;s P&amp;L"
          value={fmt(Math.abs(dailyPnL), sym)}
          delta={dailyPnL >= 0 ? '▲ Gain' : '▼ Loss'} positive={dailyPnL >= 0}
          accent={dailyPnL >= 0 ? 'income' : 'rose'} />
      </div>

      {/* Allocation + Type list */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="wl-card p-4">
          <div className="text-[11px] font-bold uppercase tracking-wider mb-3" style={{ color: 'var(--text3)' }}>Asset Allocation</div>
          {allocData.length > 0 ? (
            <div className="flex items-center gap-4">
              <ResponsiveContainer width={160} height={160}>
                <PieChart>
                  <Pie data={allocData} dataKey="value" cx="50%" cy="50%" innerRadius={45} outerRadius={72} paddingAngle={2}>
                    {allocData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 8, fontSize: 11 }}
                    formatter={(v: any) => [fmt(v, sym), '']} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-col gap-1.5 flex-1">
                {allocData.map((d, i) => (
                  <div key={i} className="flex items-center justify-between text-[11px]">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-sm" style={{ background: COLORS[i % COLORS.length] }} />
                      <span style={{ color: 'var(--text2)' }}>{d.name}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono font-semibold" style={{ color: 'var(--text)' }}>{fmt(d.value, sym)}</span>
                      <span className="text-[9px] px-1 py-0.5 rounded" style={{ background: 'var(--bg2)', color: 'var(--text3)' }}>
                        {totalCurr > 0 ? Math.round(d.value / totalCurr * 100) : 0}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-32 text-[12px]" style={{ color: 'var(--text3)' }}>
              Add investments to see allocation
            </div>
          )}
        </div>

        <div className="wl-card p-4">
          <div className="text-[11px] font-bold uppercase tracking-wider mb-3" style={{ color: 'var(--text3)' }}>By Investment Type</div>
          <div className="space-y-1.5">
            {typeStats.map(t => (
              <Link key={t.href} href={t.href}
                className="flex items-center justify-between p-2 rounded-lg transition-all group"
                style={{ background: 'var(--bg2)' }}>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full" style={{ background: t.color }} />
                  <span className="text-[12px] font-semibold" style={{ color: 'var(--text)' }}>{t.label}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: 'var(--border)', color: 'var(--text3)' }}>{t.count}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[12px] font-mono font-bold" style={{ color: 'var(--text)' }}>{t.value}</span>
                  <ArrowRight size={12} style={{ color: 'var(--text3)' }} className="group-hover:translate-x-0.5 transition-transform" />
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* Manage by Category */}
      <div>
        <div className="text-[11px] font-bold uppercase tracking-wider mb-3" style={{ color: 'var(--text3)' }}>Manage by Category</div>
        <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-9 gap-2">
          {INV_TYPES.map((t, i) => (
            <Link key={t.href} href={t.href}
              className="wl-card p-3 flex flex-col items-center gap-1 text-center hover:shadow-md transition-shadow group">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: `${COLORS[i]}18`, color: COLORS[i] }}>
                <TrendingUp size={13} />
              </div>
              <div className="text-[10px] font-semibold leading-tight" style={{ color: 'var(--text)' }}>{t.label}</div>
            </Link>
          ))}
        </div>
      </div>

      {/* ─── Investor Profile + Health Score ─────────────────────────────────────── */}
      {analytics && (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

            {/* Investor Profile */}
            {(() => {
              const prof = PROFILE_CONFIG[analytics.profile]
              return (
                <div className="wl-card p-4" style={{ background: prof.bg, border: `1.5px solid ${prof.color}25` }}>
                  <div className="text-[11px] font-bold uppercase tracking-wider mb-3" style={{ color: 'var(--text3)' }}>Investor Profile</div>
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ background: prof.color + '25' }}>
                      <TrendingUp size={20} style={{ color: prof.color }} />
                    </div>
                    <div>
                      <div className="text-[17px] font-black" style={{ color: prof.color }}>{prof.label} Investor</div>
                      <div className="text-[10px]" style={{ color: 'var(--text3)' }}>Based on current allocation</div>
                    </div>
                  </div>
                  <p className="text-[12px] mb-4 leading-relaxed" style={{ color: 'var(--text2)' }}>{prof.desc}</p>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { label: 'Equity',     pct: analytics.equityPct, color: '#EF4444' },
                      { label: 'Stable',     pct: analytics.stablePct, color: '#3B7DD8' },
                      { label: 'Alt / Other', pct: analytics.altPct,   color: '#D4920A' },
                    ].map(k => (
                      <div key={k.label} className="p-2.5 rounded-xl text-center" style={{ background: 'rgba(255,255,255,0.7)' }}>
                        <div className="text-[16px] font-black" style={{ color: k.color }}>{k.pct.toFixed(0)}%</div>
                        <div className="text-[9px] font-semibold uppercase tracking-wider mt-0.5" style={{ color: '#9CA3AF' }}>{k.label}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })()}

            {/* Health Score */}
            <div className="wl-card p-4">
              <div className="text-[11px] font-bold uppercase tracking-wider mb-3" style={{ color: 'var(--text3)' }}>Investment Health Score</div>
              <div className="flex items-center gap-5 mb-4">
                <div className="relative flex-shrink-0 w-[76px] h-[76px]">
                  <svg width="76" height="76" viewBox="0 0 76 76">
                    <circle cx="38" cy="38" r="30" fill="none" stroke="#E5E7EB" strokeWidth="7" />
                    <circle cx="38" cy="38" r="30" fill="none"
                      stroke={analytics.healthScore >= 70 ? '#10B981' : analytics.healthScore >= 45 ? '#F59E0B' : '#EF4444'}
                      strokeWidth="7" strokeLinecap="round"
                      strokeDasharray={`${(analytics.healthScore / 100) * 188.5} 188.5`}
                      transform="rotate(-90 38 38)" />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-[17px] font-black"
                      style={{ color: analytics.healthScore >= 70 ? '#10B981' : analytics.healthScore >= 45 ? '#F59E0B' : '#EF4444' }}>
                      {analytics.healthScore}
                    </span>
                  </div>
                </div>
                <div>
                  <div className="text-[15px] font-bold mb-0.5" style={{ color: 'var(--text)' }}>
                    {analytics.healthScore >= 70 ? 'Excellent Portfolio' : analytics.healthScore >= 45 ? 'Good Foundation' : 'Needs Attention'}
                  </div>
                  <div className="text-[11px] leading-relaxed" style={{ color: 'var(--text3)' }}>
                    {analytics.healthScore >= 70
                      ? 'Well-diversified with solid returns and low concentration risk.'
                      : analytics.healthScore >= 45
                      ? 'Good base — a few tweaks can push you to excellent.'
                      : 'Focus on diversification and reducing concentration.'}
                  </div>
                </div>
              </div>
              <div className="space-y-2.5">
                {[
                  { label: 'Diversification', score: analytics.divScore,  max: 40, hint: `${allocData.length} asset type(s)` },
                  { label: 'Return Quality',  score: analytics.retScore,  max: 40, hint: `${Number(totalRet) >= 0 ? '+' : ''}${totalRet}% total return` },
                  { label: 'Concentration',   score: analytics.concScore, max: 20, hint: analytics.topStockPct > 0 ? `Top stock: ${analytics.topStockPct.toFixed(0)}% of stocks` : 'No concentration risk' },
                ].map((c, ci) => (
                  <div key={c.label}>
                    <div className="flex justify-between text-[10px] mb-1">
                      <span style={{ color: 'var(--text3)' }}>{c.label}</span>
                      <div className="flex items-center gap-1.5">
                        <span style={{ color: 'var(--text3)' }}>{c.hint}</span>
                        <span className="font-bold" style={{ color: 'var(--text)' }}>{c.score}/{c.max}</span>
                      </div>
                    </div>
                    <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
                      <div className="h-full rounded-full" style={{
                        width: `${(c.score / c.max) * 100}%`,
                        background: [COLORS[0], COLORS[1], COLORS[2]][ci],
                      }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ─── Returns by Type + Sector / MF Category ──────────────────────────── */}
          {(analytics.typeReturns.length > 0 || analytics.sectorData.length > 1 || analytics.mfCatData.length > 1) && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

              {analytics.typeReturns.length > 0 && (
                <div className="wl-card p-4">
                  <div className="text-[11px] font-bold uppercase tracking-wider mb-3" style={{ color: 'var(--text3)' }}>Returns by Investment Type</div>
                  <div className="space-y-2.5">
                    {analytics.typeReturns.map((t, i) => (
                      <div key={i} className="flex items-center gap-3">
                        <div className="text-[11px] font-semibold w-14 flex-shrink-0" style={{ color: 'var(--text2)' }}>{t.name}</div>
                        <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: 'var(--bg2)' }}>
                          <div className="h-full rounded-full transition-all" style={{
                            width: `${Math.min(Math.abs(t.pct), 60) / 60 * 100}%`,
                            background: t.pct >= 0 ? '#10B981' : '#EF4444',
                          }} />
                        </div>
                        <span className="text-[11px] font-bold font-mono w-14 text-right flex-shrink-0"
                          style={{ color: t.pct >= 0 ? '#10B981' : '#EF4444' }}>
                          {t.pct >= 0 ? '+' : ''}{t.pct.toFixed(1)}%
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Stock sector concentration */}
              {analytics.sectorData.length > 1 && (
                <div className="wl-card p-4">
                  <div className="text-[11px] font-bold uppercase tracking-wider mb-3" style={{ color: 'var(--text3)' }}>
                    Stock Sector Exposure · {fSt.length} stocks
                  </div>
                  <div className="space-y-2">
                    {analytics.sectorData.slice(0, 7).map((s, i) => {
                      const pct = stCurr > 0 ? s.value / stCurr * 100 : 0
                      const isHigh = pct > 40
                      return (
                        <div key={i} className="flex items-center gap-2">
                          <div className="w-20 text-[10px] truncate flex-shrink-0" style={{ color: 'var(--text3)' }}>{s.name}</div>
                          <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: 'var(--bg2)' }}>
                            <div className="h-full rounded-full" style={{ width: `${pct}%`, background: isHigh ? '#F59E0B' : COLORS[i % COLORS.length] }} />
                          </div>
                          <div className="flex items-center gap-1 w-12 flex-shrink-0 justify-end">
                            {isHigh && <AlertTriangle size={9} style={{ color: '#F59E0B' }} />}
                            <span className="text-[10px] font-semibold" style={{ color: isHigh ? '#F59E0B' : 'var(--text3)' }}>{pct.toFixed(0)}%</span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* MF category breakdown (shown when no stock sector data) */}
              {analytics.mfCatData.length > 1 && analytics.sectorData.length <= 1 && (
                <div className="wl-card p-4">
                  <div className="text-[11px] font-bold uppercase tracking-wider mb-3" style={{ color: 'var(--text3)' }}>
                    Mutual Fund Categories · {fMF.length} funds
                  </div>
                  <div className="space-y-2">
                    {analytics.mfCatData.slice(0, 7).map((c, i) => {
                      const pct = mfCurr > 0 ? c.value / mfCurr * 100 : 0
                      const isHigh = pct > 60
                      return (
                        <div key={i} className="flex items-center gap-2">
                          <div className="w-20 text-[10px] truncate flex-shrink-0" style={{ color: 'var(--text3)' }}>{c.name}</div>
                          <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: 'var(--bg2)' }}>
                            <div className="h-full rounded-full" style={{ width: `${pct}%`, background: isHigh ? '#F59E0B' : COLORS[i % COLORS.length] }} />
                          </div>
                          <span className="text-[10px] font-semibold w-10 text-right flex-shrink-0" style={{ color: 'var(--text3)' }}>{pct.toFixed(0)}%</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ─── Underperformers ─────────────────────────────────────────────────── */}
          {(analytics.underStocks.length > 0 || analytics.underMF.length > 0) && (
            <div className="wl-card p-4" style={{ background: '#FEF2F2', border: '1.5px solid #EF444428' }}>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: '#EF444420' }}>
                  <TrendingDown size={14} style={{ color: '#EF4444' }} />
                </div>
                <div className="text-[11px] font-bold uppercase tracking-wider" style={{ color: '#EF4444' }}>
                  Underperforming Investments
                  <span className="ml-2 font-normal normal-case" style={{ color: 'var(--text3)' }}>
                    — consider reviewing or averaging down
                  </span>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {[
                  ...analytics.underStocks.slice(0, 3).map((s: any) => ({
                    name: s.name,
                    type: `Stock · ${s.exchange ?? 'NSE'}`,
                    loss: s.invV - s.curV,
                    pct: s.retPct,
                  })),
                  ...analytics.underMF.slice(0, 3).map((m: any) => ({
                    name: m.name ?? 'Mutual Fund',
                    type: `MF · ${(m.fund_type ?? '').toUpperCase()}`,
                    loss: m.invV - m.curV,
                    pct: m.retPct,
                  })),
                ].map((item, i) => (
                  <div key={i} className="flex items-center justify-between p-3 rounded-xl" style={{ background: '#fff' }}>
                    <div className="min-w-0 flex-1 mr-2">
                      <div className="text-[12px] font-semibold truncate" style={{ color: 'var(--text)' }}>{item.name}</div>
                      <div className="text-[10px]" style={{ color: 'var(--text3)' }}>{item.type}</div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="text-[12px] font-bold" style={{ color: '#EF4444' }}>{item.pct.toFixed(1)}%</div>
                      <div className="text-[10px] font-mono" style={{ color: 'var(--text3)' }}>-{fmt(item.loss, sym)}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ─── Investment Recommendations ───────────────────────────────────────── */}
          {analytics.recs.length > 0 && (
            <div className="wl-card p-4">
              <div className="text-[11px] font-bold uppercase tracking-wider mb-3" style={{ color: 'var(--text3)' }}>
                Investment Recommendations
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {analytics.recs.map((r: any, i: number) => {
                  const Icon = r.icon
                  return (
                    <div key={i} className="p-4 rounded-xl border" style={{ background: r.bg, borderColor: r.color + '30' }}>
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: r.color + '20' }}>
                          <Icon size={13} style={{ color: r.color }} />
                        </div>
                        <span className="text-[12px] font-bold leading-tight" style={{ color: 'var(--text)' }}>{r.title}</span>
                      </div>
                      <p className="text-[11px] mb-2.5 leading-relaxed" style={{ color: 'var(--text2)' }}>{r.body}</p>
                      <div className="text-[10px] font-bold px-2 py-1 rounded-lg inline-block" style={{ background: r.color + '18', color: r.color }}>
                        {r.tag}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </>
      )}

      {showAdd && <AddInvestmentModal onClose={() => setShowAdd(false)} />}
    </div>
  )
}
