'use client'
import { useMemo, useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useViewStore } from '@/store/viewStore'
import { createClient } from '@/lib/supabase/client'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, AreaChart, Area, XAxis, YAxis, CartesianGrid, ReferenceLine } from 'recharts'
import {
  TrendingUp, TrendingDown, Wallet, Layers, Activity, BarChart2,
  ArrowUpRight, ArrowDownRight, Trophy, AlertTriangle, Repeat, GraduationCap,
  Lightbulb, CheckCircle2, RefreshCw, Loader2, Scale,
} from 'lucide-react'

type Holding = {
  kind: 'Mutual Fund' | 'Stock' | 'ETF'
  name: string
  invested: number      // in INR-display terms (after view conversion)
  current: number
  assetClass: string
  country: string
  currency: string
  holder: string
  sip: number           // monthly SIP (MF only), display terms
  acquired: string      // ISO acquisition date (created_at / purchase_date)
  isElss: boolean
}

const INSTRUMENT_COLORS: Record<string, string> = { 'Mutual Fund': '#2563EB', Stock: '#7C3AED', ETF: '#0EA5E9' }
const CLASS_COLORS: Record<string, string> = {
  Equity: '#2563EB', Debt: '#0EA5E9', Hybrid: '#7C3AED', Gold: '#D97706', Index: '#16A34A', International: '#EA580C', Other: '#6B7280',
}

function mfClass(t: string): string {
  const x = (t || '').toLowerCase()
  if (x === 'debt' || x === 'liquid') return 'Debt'
  if (x === 'hybrid') return 'Hybrid'
  return 'Equity'   // equity / elss / index
}
function etfClass(t: string): string {
  const x = (t || '').toLowerCase()
  if (x === 'debt') return 'Debt'
  if (x === 'gold') return 'Gold'
  if (x === 'international') return 'International'
  return 'Equity'   // equity / index
}

const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
function monthLabel(ym: string) {
  const [y, m] = ym.split('-')
  return `${MONTHS_SHORT[Number(m) - 1]} '${y.slice(2)}`
}
function fmtK(n: number): string {
  if (n >= 1e7) return `${(n / 1e7).toFixed(2)}Cr`
  if (n >= 1e5) return `${(n / 1e5).toFixed(1)}L`
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)}K`
  return String(Math.round(n))
}

// Money-weighted return (XIRR) via bisection on NPV
function xirr(flows: { date: Date; amount: number }[]): number | null {
  const f = [...flows].sort((a, b) => a.date.getTime() - b.date.getTime())
  if (f.length < 2) return null
  const t0 = f[0].date.getTime()
  const yrs = (d: Date) => (d.getTime() - t0) / (365.25 * 86400 * 1000)
  const npv = (r: number) => f.reduce((a, x) => a + x.amount / Math.pow(1 + r, yrs(x.date)), 0)
  let lo = -0.95, hi = 5, nlo = npv(lo), nhi = npv(hi)
  if (nlo * nhi > 0) return null
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2, v = npv(mid)
    if (Math.abs(v) < 0.5) return mid * 100
    if (nlo * v < 0) { hi = mid; nhi = v } else { lo = mid; nlo = v }
  }
  return ((lo + hi) / 2) * 100
}

export default function MarketLinkedClient({ funds, stocks, etfs }: { funds: any[]; stocks: any[]; etfs: any[] }) {
  const { view, fxRate: FX } = useViewStore()
  const router = useRouter()
  const [sortBy, setSortBy] = useState<'value' | 'gain' | 'invested'>('value')
  const [nifty, setNifty] = useState<{ cagr: number } | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const sym = view === 'uae' ? 'AED ' : '₹'
  const money = (n: number) => `${sym}${Math.round(n).toLocaleString('en-IN')}`
  // Respect the view: UAE shows AED holdings, India shows INR, Consolidated shows
  // everything converted to INR.
  const conv = (amt: number, cur: string) => (view === 'consolidated' ? (cur === 'AED' ? amt * FX : amt) : amt)
  const inView = (cur: string) => !((view === 'uae' && cur !== 'AED') || (view === 'india' && cur !== 'INR'))

  // ── Normalise all three into a common Holding shape ──────────────────────
  const holdings = useMemo<Holding[]>(() => {
    const out: Holding[] = []

    for (const f of funds) {
      const cur = f.currency || 'INR'
      if (!inView(cur)) continue
      const invested = Number(f.invested_amount) || (Number(f.units) * Number(f.avg_nav)) || 0
      const units = Number(f.units) || 0
      const nav = Number(f.current_nav) || 0
      const current = units > 0 && nav > 0 ? units * nav : invested
      const sip = f.has_sip && f.sip_amount ? Number(f.sip_amount) : 0
      out.push({
        kind: 'Mutual Fund', name: f.fund_name || 'Fund',
        invested: conv(invested, cur), current: conv(current, cur),
        assetClass: mfClass(f.fund_type), country: f.country || 'India', currency: cur,
        holder: f.holder_name || 'Self', sip: conv(sip, cur),
        acquired: f.created_at || new Date().toISOString(), isElss: (f.fund_type || '').toLowerCase() === 'elss',
      })
    }

    for (const s of stocks) {
      const cur = s.currency || 'INR'
      if (!inView(cur)) continue
      const qty = Number(s.quantity) || 0
      const buy = Number(s.avg_buy_price) || 0
      const px = Number(s.current_price) || buy
      const invested = qty * buy
      const current = qty * px
      out.push({
        kind: 'Stock', name: s.name || s.symbol || 'Stock',
        invested: conv(invested, cur), current: conv(current, cur),
        assetClass: 'Equity', country: s.country || 'India', currency: cur,
        holder: s.holder_name || 'Self', sip: 0,
        acquired: s.created_at || new Date().toISOString(), isElss: false,
      })
    }

    for (const e of etfs) {
      const cur = e.currency || 'INR'
      if (!inView(cur)) continue
      const invested = Number(e.invested_amount) || (Number(e.units) * Number(e.avg_buy_price)) || 0
      const cv = Number(e.current_value) || (Number(e.units) * (Number(e.current_price) || Number(e.avg_buy_price))) || invested
      out.push({
        kind: 'ETF', name: e.etf_name || e.symbol || 'ETF',
        invested: conv(invested, cur), current: conv(cv, cur),
        assetClass: etfClass(e.etf_type), country: e.country || 'India', currency: cur,
        holder: e.holder_name || 'Self', sip: 0,
        acquired: e.created_at || e.purchase_date || new Date().toISOString(), isElss: false,
      })
    }
    return out
  }, [funds, stocks, etfs, view, FX])

  // ── Totals ───────────────────────────────────────────────────────────────
  const totalInvested = holdings.reduce((a, h) => a + h.invested, 0)
  const totalCurrent  = holdings.reduce((a, h) => a + h.current, 0)
  const totalGain     = totalCurrent - totalInvested
  const gainPct       = totalInvested > 0 ? (totalGain / totalInvested) * 100 : 0
  const monthlySip    = holdings.reduce((a, h) => a + h.sip, 0)
  const gainers       = holdings.filter(h => h.current > h.invested).length
  const losers        = holdings.filter(h => h.current < h.invested).length

  // ── Group helpers ────────────────────────────────────────────────────────
  const groupSum = (key: (h: Holding) => string) => {
    const m: Record<string, number> = {}
    holdings.forEach(h => { m[key(h)] = (m[key(h)] ?? 0) + h.current })
    return Object.entries(m).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1])
  }
  const byInstrument = useMemo(() => groupSum(h => h.kind), [holdings])
  const byClass      = useMemo(() => groupSum(h => h.assetClass), [holdings])
  const byHolder     = useMemo(() => groupSum(h => h.holder), [holdings])

  const ret = (h: Holding) => (h.invested > 0 ? (h.current - h.invested) / h.invested * 100 : 0)
  const sorted = useMemo(() => [...holdings].sort((a, b) =>
    sortBy === 'gain' ? ret(b) - ret(a) : sortBy === 'invested' ? b.invested - a.invested : b.current - a.current
  ), [holdings, sortBy])

  const withReturns = holdings.filter(h => h.invested > 0)
  const best  = withReturns.length ? [...withReturns].sort((a, b) => ret(b) - ret(a))[0] : null
  const worst = withReturns.length ? [...withReturns].sort((a, b) => ret(a) - ret(b))[0] : null

  // ── Actionable insights ──────────────────────────────────────────────────
  const equityCur = holdings.filter(h => h.assetClass === 'Equity').reduce((a, h) => a + h.current, 0)
  const equityPct = totalCurrent > 0 ? (equityCur / totalCurrent) * 100 : 0
  const topHold   = [...holdings].sort((a, b) => b.current - a.current)[0]
  const topPct    = totalCurrent > 0 && topHold ? (topHold.current / totalCurrent) * 100 : 0
  const stale     = holdings.filter(h => h.invested > 0 && Math.abs(h.current - h.invested) < 0.5)
  const downBig   = withReturns.filter(h => ret(h) <= -10)
  const upBig     = withReturns.filter(h => ret(h) >= 30)

  const insights = useMemo(() => {
    const out: { tone: 'warn' | 'good' | 'info'; title: string; detail: string }[] = []
    if (totalInvested > 0) {
      if (totalGain >= 0) out.push({ tone: 'good', title: `Portfolio up ${gainPct.toFixed(1)}%`, detail: `Gained ${money(totalGain)} on ${money(totalInvested)} invested.` })
      else out.push({ tone: 'warn', title: `Portfolio down ${Math.abs(gainPct).toFixed(1)}%`, detail: `${money(Math.abs(totalGain))} below cost — review weak holdings rather than reacting to short-term dips.` })
    }
    if (topHold && topPct >= 30) out.push({ tone: 'warn', title: 'Concentration risk', detail: `${topHold.name} is ${topPct.toFixed(0)}% of this portfolio — consider trimming or diversifying.` })
    if (totalCurrent > 0 && equityPct >= 85) out.push({ tone: 'warn', title: 'Heavily equity-weighted', detail: `Equity is ${equityPct.toFixed(0)}% of your mix — some debt/hybrid would cushion volatility.` })
    else if (totalCurrent > 0 && equityPct > 0 && equityPct <= 40) out.push({ tone: 'info', title: 'Conservative mix', detail: `Only ${equityPct.toFixed(0)}% in equity — you may be under-allocated for long-term growth.` })
    if (downBig.length > 0) { const w = [...downBig].sort((a, b) => ret(a) - ret(b))[0]; out.push({ tone: 'warn', title: `${downBig.length} holding${downBig.length > 1 ? 's' : ''} down over 10%`, detail: `Worst: ${w.name} (${ret(w).toFixed(0)}%). Check if your reason to hold still applies.` }) }
    if (upBig.length > 0) { const b = [...upBig].sort((a, b) => ret(b) - ret(a))[0]; out.push({ tone: 'info', title: 'Profit-booking opportunity', detail: `${b.name} is up ${ret(b).toFixed(0)}% — consider rebalancing or booking partial gains.` }) }
    if (stale.length > 0) out.push({ tone: 'warn', title: `${stale.length} holding${stale.length > 1 ? 's' : ''} missing live price`, detail: `Returns may be understated — refresh NAV/prices on the Mutual Funds / Stocks pages.` })
    if (monthlySip > 0) out.push({ tone: 'good', title: 'SIP on track', detail: `Auto-investing ${money(monthlySip)}/month — great for rupee-cost averaging.` })
    else if (holdings.some(h => h.kind === 'Mutual Fund')) out.push({ tone: 'info', title: 'No active SIP', detail: `A monthly SIP averages your buy price and builds discipline.` })
    const kinds = Array.from(new Set(holdings.map(h => h.kind)))
    if (kinds.length === 1 && holdings.length >= 3) out.push({ tone: 'info', title: 'Single instrument type', detail: `Everything is in ${kinds[0]}s — spreading across MF / stocks / ETF lowers risk.` })
    const order = { warn: 0, good: 1, info: 2 } as const
    return out.sort((a, b) => order[a.tone] - order[b.tone]).slice(0, 6)
  }, [holdings, totalCurrent, totalInvested, totalGain, gainPct, equityPct, topPct, monthlySip])

  // ── Returns: portfolio XIRR vs Nifty ─────────────────────────────────────
  const portfolioXirr = useMemo(() => {
    if (totalInvested <= 0) return null
    const flows = holdings.filter(h => h.invested > 0).map(h => ({ date: new Date(h.acquired || Date.now()), amount: -h.invested }))
    flows.push({ date: new Date(), amount: totalCurrent })
    return xirr(flows)
  }, [holdings, totalInvested, totalCurrent])

  useEffect(() => {
    if (holdings.length === 0) { setNifty(null); return }
    const from = holdings.map(h => (h.acquired || '').slice(0, 10)).filter(Boolean).sort()[0]
    if (!from) return
    fetch(`/api/index-return?from=${from}`).then(r => r.json())
      .then(d => { if (typeof d?.cagr === 'number') setNifty({ cagr: d.cagr }) }).catch(() => {})
  }, [holdings.length, view]) // eslint-disable-line

  // ── Wealth curve: cumulative invested over time ──────────────────────────
  const wealthSeries = useMemo(() => {
    const byMonth: Record<string, number> = {}
    holdings.forEach(h => { const m = (h.acquired || '').slice(0, 7); if (m) byMonth[m] = (byMonth[m] ?? 0) + h.invested })
    const keys = Object.keys(byMonth).sort()
    let cum = 0
    return keys.map(k => { cum += byMonth[k]; return { month: monthLabel(k), invested: Math.round(cum) } })
  }, [holdings])

  // ── Tax estimate (India equity rules; only relevant for INR view) ─────────
  const taxView = useMemo(() => {
    const now = Date.now()
    let ltcg = 0, stcg = 0, debtGain = 0, elssLocked = 0, elssUnlock = ''
    holdings.forEach(h => {
      const gain = h.current - h.invested
      const days = (now - new Date(h.acquired || now).getTime()) / (86400 * 1000)
      if (h.assetClass === 'Debt') { debtGain += gain }
      else if (gain >= 0) { if (days > 365) ltcg += gain; else stcg += gain }
      if (h.isElss && days < 3 * 365.25) {
        elssLocked++
        const u = new Date(new Date(h.acquired).getTime() + 3 * 365.25 * 86400 * 1000).toISOString().slice(0, 10)
        if (!elssUnlock || u < elssUnlock) elssUnlock = u
      }
    })
    const EX = 125000
    const ltcgTax = Math.max(0, ltcg - EX) * 0.125
    const stcgTax = Math.max(0, stcg) * 0.20
    return { ltcg, stcg, debtGain, ltcgTax, stcgTax, total: ltcgTax + stcgTax, bookableFree: Math.min(Math.max(0, ltcg), EX), elssLocked, elssUnlock }
  }, [holdings])

  async function refreshPrices() {
    setRefreshing(true)
    const supabase = createClient()
    const jobs: Promise<any>[] = []
    funds.forEach((f: any) => { if (!f.scheme_code) return; jobs.push((async () => { try { const r = await fetch(`/api/mf-nav?schemeCode=${f.scheme_code}`).then(x => x.json()); const nav = Number(r?.data?.[0]?.nav); if (nav > 0) await supabase.from('mutual_funds').update({ current_nav: nav }).eq('id', f.id) } catch {} })()) })
    stocks.forEach((s: any) => { if (!s.symbol) return; jobs.push((async () => { try { const r = await fetch(`/api/stock-price?symbol=${encodeURIComponent(s.symbol)}`).then(x => x.json()); if (Number(r?.price) > 0) await supabase.from('stocks').update({ current_price: Number(r.price) }).eq('id', s.id) } catch {} })()) })
    etfs.forEach((e: any) => { if (!e.symbol) return; jobs.push((async () => { try { const r = await fetch(`/api/stock-price?symbol=${encodeURIComponent(e.symbol)}`).then(x => x.json()); const p = Number(r?.price); if (p > 0) { const u = Number(e.units) || 0; await supabase.from('etf_investments').update(u > 0 ? { current_price: p, current_value: u * p } : { current_price: p }).eq('id', e.id) } } catch {} })()) })
    await Promise.all(jobs)
    setRefreshing(false)
    router.refresh()
  }

  const pieData = byInstrument.map(([name, value]) => ({ name, value: Math.round(value), color: INSTRUMENT_COLORS[name] ?? '#6B7280' }))

  if (holdings.length === 0) {
    return (
      <div className="space-y-5 animate-fade-up">
        <Header view={view} />
        <div className="wl-card p-12 text-center">
          <Layers size={28} className="mx-auto mb-3" style={{ color: 'var(--text3)' }} />
          <div className="text-[14px] font-semibold" style={{ color: 'var(--text)' }}>No market-linked holdings in this view</div>
          <p className="text-[12px] mt-1" style={{ color: 'var(--text3)' }}>
            {view === 'uae'
              ? 'No UAE (AED) market-linked holdings. Switch to India or Consolidated at the top, or add holdings below.'
              : 'Add Mutual Funds, Stocks or ETFs to see your combined portfolio here.'}
          </p>
          <div className="flex gap-2 justify-center mt-4 flex-wrap">
            <Link href="/dashboard/investments/mutual-funds" className="px-3 py-1.5 rounded-lg text-[12px] font-semibold border" style={{ borderColor: 'var(--border)', color: 'var(--text2)', background: 'var(--bg2)' }}>Mutual Funds</Link>
            <Link href="/dashboard/stocks" className="px-3 py-1.5 rounded-lg text-[12px] font-semibold border" style={{ borderColor: 'var(--border)', color: 'var(--text2)', background: 'var(--bg2)' }}>Stocks</Link>
            <Link href="/dashboard/investments/etf" className="px-3 py-1.5 rounded-lg text-[12px] font-semibold border" style={{ borderColor: 'var(--border)', color: 'var(--text2)', background: 'var(--bg2)' }}>ETF</Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5 animate-fade-up">
      <Header view={view} onRefresh={refreshPrices} refreshing={refreshing} />

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Invested"      value={money(totalInvested)} icon={Wallet}     color="var(--text2)" />
        <Kpi label="Current Value" value={money(totalCurrent)}  icon={BarChart2}   color="var(--sage)" />
        <Kpi label="Total Gain/Loss" value={`${totalGain >= 0 ? '+' : '−'}${money(Math.abs(totalGain))}`}
          icon={totalGain >= 0 ? TrendingUp : TrendingDown}
          color={totalGain >= 0 ? 'var(--income)' : 'var(--rose)'}
          sub={`${totalGain >= 0 ? '+' : ''}${gainPct.toFixed(2)}%`} />
        <Kpi label="Holdings" value={String(holdings.length)} icon={Layers} color="var(--blue)"
          sub={`${gainers} up · ${losers} down${monthlySip > 0 ? ` · SIP ${money(monthlySip)}/mo` : ''}`} />
      </div>

      {/* Returns: XIRR vs Nifty */}
      {portfolioXirr !== null && (
        <div className="wl-card p-4">
          <div className="text-[11px] font-bold uppercase tracking-wider mb-3 flex items-center gap-1.5" style={{ color: 'var(--text3)' }}>
            <TrendingUp size={12} /> Annualised Return (XIRR){nifty ? ' vs Nifty 50' : ''}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="rounded-xl p-3" style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}>
              <div className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--text3)' }}>Your Portfolio</div>
              <div className="text-[20px] font-bold font-mono" style={{ color: portfolioXirr >= 0 ? 'var(--income)' : 'var(--rose)' }}>{portfolioXirr >= 0 ? '+' : ''}{portfolioXirr.toFixed(1)}%<span className="text-[11px] font-normal" style={{ color: 'var(--text3)' }}>/yr</span></div>
            </div>
            <div className="rounded-xl p-3" style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}>
              <div className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--text3)' }}>Nifty 50</div>
              <div className="text-[20px] font-bold font-mono" style={{ color: 'var(--text)' }}>{nifty ? `${nifty.cagr >= 0 ? '+' : ''}${nifty.cagr.toFixed(1)}%` : '…'}<span className="text-[11px] font-normal" style={{ color: 'var(--text3)' }}>{nifty ? '/yr' : ''}</span></div>
            </div>
            {nifty && (
              <div className="rounded-xl p-3 col-span-2 sm:col-span-1" style={{ background: (portfolioXirr - nifty.cagr) >= 0 ? 'var(--income-bg)' : 'var(--rose-bg)', border: '1px solid var(--border)' }}>
                <div className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--text3)' }}>{(portfolioXirr - nifty.cagr) >= 0 ? 'Beating index by' : 'Trailing index by'}</div>
                <div className="text-[20px] font-bold font-mono" style={{ color: (portfolioXirr - nifty.cagr) >= 0 ? 'var(--income)' : 'var(--rose)' }}>{Math.abs(portfolioXirr - nifty.cagr).toFixed(1)}%</div>
              </div>
            )}
          </div>
          <p className="text-[10px] mt-2" style={{ color: 'var(--text3)' }}>XIRR is your money-weighted return (accounts for when you invested). Compared against the Nifty 50 over the same period.</p>
        </div>
      )}

      {/* Actionable insights */}
      {insights.length > 0 && (
        <div className="wl-card p-4">
          <div className="text-[11px] font-bold uppercase tracking-wider mb-3 flex items-center gap-1.5" style={{ color: 'var(--text3)' }}>
            <Lightbulb size={12} style={{ color: 'var(--gold)' }} /> Insights &amp; Actions
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {insights.map((ins, i) => {
              const c = ins.tone === 'warn' ? 'var(--rose)' : ins.tone === 'good' ? 'var(--income)' : 'var(--blue)'
              const Icon = ins.tone === 'warn' ? AlertTriangle : ins.tone === 'good' ? CheckCircle2 : Lightbulb
              return (
                <div key={i} className="flex gap-2.5 rounded-xl p-2.5" style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}>
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5" style={{ background: c + '18' }}>
                    <Icon size={14} style={{ color: c }} />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[12px] font-semibold" style={{ color: 'var(--text)' }}>{ins.title}</div>
                    <div className="text-[11px] leading-snug mt-0.5" style={{ color: 'var(--text3)' }}>{ins.detail}</div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Allocation */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="wl-card p-4">
          <div className="text-[11px] font-bold uppercase tracking-wider mb-3" style={{ color: 'var(--text3)' }}>Allocation by Instrument</div>
          <div className="flex items-center gap-4">
            <div style={{ width: 150, height: 150 }} className="flex-shrink-0">
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={45} outerRadius={70} paddingAngle={2}>
                    {pieData.map((d, i) => <Cell key={i} fill={d.color} />)}
                  </Pie>
                  <Tooltip formatter={(v: any) => money(Number(v))} contentStyle={{ fontSize: 11, borderRadius: 10, border: '1px solid var(--border)' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex-1 space-y-2">
              {byInstrument.map(([name, val]) => {
                const pct = totalCurrent > 0 ? (val / totalCurrent) * 100 : 0
                return (
                  <div key={name} className="flex items-center gap-2 text-[12px]">
                    <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: INSTRUMENT_COLORS[name] ?? '#6B7280' }} />
                    <span className="flex-1" style={{ color: 'var(--text2)' }}>{name}</span>
                    <span className="font-mono font-semibold" style={{ color: 'var(--text)' }}>{money(val)}</span>
                    <span className="font-mono w-10 text-right" style={{ color: 'var(--text3)' }}>{pct.toFixed(0)}%</span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        <AllocBars title="Allocation by Asset Class" rows={byClass} total={totalCurrent} money={money} colors={CLASS_COLORS} />
      </div>

      {/* Wealth curve */}
      {wealthSeries.length > 0 && (
        <div className="wl-card p-4">
          <div className="text-[11px] font-bold uppercase tracking-wider mb-3" style={{ color: 'var(--text3)' }}>Wealth Curve · invested over time vs current value</div>
          <div style={{ width: '100%', height: 220 }}>
            <ResponsiveContainer>
              <AreaChart data={wealthSeries} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="wlInv" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#2563EB" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#2563EB" stopOpacity={0.03} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 10, fill: 'var(--text3)' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: 'var(--text3)' }} axisLine={false} tickLine={false} tickFormatter={(v) => fmtK(Number(v))} />
                <Tooltip formatter={(v: any) => money(Number(v))} contentStyle={{ fontSize: 11, borderRadius: 10, border: '1px solid var(--border)' }} />
                <ReferenceLine y={Math.round(totalCurrent)} stroke="var(--income)" strokeDasharray="4 3"
                  label={{ value: `Current ${money(totalCurrent)}`, position: 'insideTopRight', fontSize: 10, fill: 'var(--income)' }} />
                <Area type="monotone" dataKey="invested" name="Invested" stroke="#2563EB" strokeWidth={2} fill="url(#wlInv)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <p className="text-[10px] mt-1" style={{ color: 'var(--text3)' }}>Blue = total invested over time. The dashed line is today's market value — the gap above the area is your unrealised gain ({money(totalGain)}).</p>
        </div>
      )}

      {/* Tax view */}
      {view !== 'uae' && (taxView.ltcg > 0 || taxView.stcg > 0 || taxView.elssLocked > 0 || taxView.debtGain !== 0) && (
        <div className="wl-card p-4">
          <div className="text-[11px] font-bold uppercase tracking-wider mb-3 flex items-center gap-1.5" style={{ color: 'var(--text3)' }}>
            <Scale size={12} /> Tax View · if you sold today
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <TaxStat label="LT gains (>1yr)" value={money(taxView.ltcg)} color="var(--text)" />
            <TaxStat label="ST gains (<1yr)" value={money(taxView.stcg)} color="var(--text)" />
            <TaxStat label="Est. tax now" value={money(taxView.total)} color="var(--rose)" />
            <TaxStat label="Tax-free LT room" value={money(taxView.bookableFree)} color="var(--income)" />
          </div>
          {taxView.bookableFree > 1000 && (
            <p className="text-[11px] mt-2 flex items-start gap-1.5" style={{ color: 'var(--text2)' }}>
              <CheckCircle2 size={12} style={{ color: 'var(--income)' }} className="mt-0.5 flex-shrink-0" />
              You can realise about <b className="mx-1">{money(taxView.bookableFree)}</b> of long-term equity gains tax-free this year (₹1.25L exemption) — consider harvesting.
            </p>
          )}
          {taxView.elssLocked > 0 && (
            <p className="text-[11px] mt-1.5 flex items-start gap-1.5" style={{ color: 'var(--text2)' }}>
              <AlertTriangle size={12} style={{ color: 'var(--gold)' }} className="mt-0.5 flex-shrink-0" />
              {taxView.elssLocked} ELSS fund{taxView.elssLocked > 1 ? 's are' : ' is'} under the 3-year lock-in{taxView.elssUnlock ? ` (earliest unlock ${taxView.elssUnlock})` : ''}.
            </p>
          )}
          <p className="text-[10px] mt-2" style={{ color: 'var(--text3)' }}>
            Estimate using India equity rules: LTCG 12.5% above ₹1.25L, STCG 20%. Debt gains ({money(taxView.debtGain)}) are taxed at your slab and excluded here. Holding period from purchase date.
          </p>
        </div>
      )}

      {/* Performance */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <PerfCard title="Best Performer" h={best} money={money} ret={ret} good />
        <PerfCard title="Needs Attention" h={worst} money={money} ret={ret} />
        <div className="wl-card p-4">
          <div className="text-[11px] font-bold uppercase tracking-wider mb-3" style={{ color: 'var(--text3)' }}>Gainers vs Losers</div>
          <div className="flex items-center gap-4">
            <div className="flex-1 text-center">
              <div className="text-[24px] font-bold font-mono" style={{ color: 'var(--income)' }}>{gainers}</div>
              <div className="text-[10px] flex items-center justify-center gap-1" style={{ color: 'var(--text3)' }}><ArrowUpRight size={11} /> in profit</div>
            </div>
            <div className="w-px self-stretch" style={{ background: 'var(--border)' }} />
            <div className="flex-1 text-center">
              <div className="text-[24px] font-bold font-mono" style={{ color: 'var(--rose)' }}>{losers}</div>
              <div className="text-[10px] flex items-center justify-center gap-1" style={{ color: 'var(--text3)' }}><ArrowDownRight size={11} /> in loss</div>
            </div>
          </div>
          {byHolder.length > 1 && (
            <div className="mt-3 pt-3 border-t" style={{ borderColor: 'var(--border)' }}>
              <div className="text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text3)' }}>By Holder</div>
              {byHolder.slice(0, 4).map(([name, val]) => (
                <div key={name} className="flex justify-between text-[11px]">
                  <span style={{ color: 'var(--text2)' }}>{name}</span>
                  <span className="font-mono" style={{ color: 'var(--text)' }}>{money(val)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Holdings table */}
      <div className="wl-card overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
          <div className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--text3)' }}>All Holdings ({holdings.length})</div>
          <div className="flex gap-1">
            {([['value', 'Value'], ['gain', 'Return %'], ['invested', 'Invested']] as const).map(([k, label]) => (
              <button key={k} onClick={() => setSortBy(k)}
                className="px-2.5 py-1 rounded-lg text-[10px] font-semibold transition-all"
                style={sortBy === k ? { background: 'var(--sage-bg)', color: 'var(--sage)' } : { background: 'var(--bg2)', color: 'var(--text3)' }}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Desktop */}
        <div className="overflow-x-auto hidden md:block">
          <table className="w-full text-[12px]">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg2)' }}>
                {['Holding', 'Type', 'Class', 'Invested', 'Current', 'Gain/Loss', 'Return'].map(h => (
                  <th key={h} className="px-4 py-2.5 text-left text-[10px] uppercase tracking-wider font-bold" style={{ color: 'var(--text3)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((h, i) => {
                const g = h.current - h.invested
                const r = ret(h)
                return (
                  <tr key={i} style={{ borderBottom: '1px solid var(--border)' }} className="hover:bg-stone-50 transition-colors">
                    <td className="px-4 py-2.5 font-semibold" style={{ color: 'var(--text)' }}>{h.name}</td>
                    <td className="px-4 py-2.5"><span className="px-2 py-0.5 rounded text-[10px] font-semibold" style={{ background: (INSTRUMENT_COLORS[h.kind] ?? '#6B7280') + '18', color: INSTRUMENT_COLORS[h.kind] ?? '#6B7280' }}>{h.kind}</span></td>
                    <td className="px-4 py-2.5 text-[11px]" style={{ color: 'var(--text3)' }}>{h.assetClass}</td>
                    <td className="px-4 py-2.5 font-mono" style={{ color: 'var(--text3)' }}>{money(h.invested)}</td>
                    <td className="px-4 py-2.5 font-mono font-semibold" style={{ color: 'var(--text)' }}>{money(h.current)}</td>
                    <td className="px-4 py-2.5 font-mono" style={{ color: g >= 0 ? 'var(--income)' : 'var(--rose)' }}>{g >= 0 ? '+' : '−'}{money(Math.abs(g))}</td>
                    <td className="px-4 py-2.5 font-mono font-bold" style={{ color: r >= 0 ? 'var(--income)' : 'var(--rose)' }}>{r >= 0 ? '+' : ''}{r.toFixed(1)}%</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Mobile cards */}
        <div className="md:hidden divide-y" style={{ borderColor: 'var(--border)' }}>
          {sorted.map((h, i) => {
            const g = h.current - h.invested
            const r = ret(h)
            return (
              <div key={i} className="px-3 py-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-[13px] truncate" style={{ color: 'var(--text)' }}>{h.name}</span>
                  <span className="font-bold font-mono text-[13px] flex-shrink-0" style={{ color: 'var(--text)' }}>{money(h.current)}</span>
                </div>
                <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold" style={{ background: (INSTRUMENT_COLORS[h.kind] ?? '#6B7280') + '18', color: INSTRUMENT_COLORS[h.kind] ?? '#6B7280' }}>{h.kind}</span>
                  <span className="text-[10px]" style={{ color: 'var(--text3)' }}>{h.assetClass} · inv {money(h.invested)}</span>
                  <span className="text-[10px] font-mono font-bold ml-auto" style={{ color: r >= 0 ? 'var(--income)' : 'var(--rose)' }}>{r >= 0 ? '+' : ''}{r.toFixed(1)}%</span>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ── Sub-components ───────────────────────────────────────────────────────────

function Header({ view, onRefresh, refreshing }: { view: string; onRefresh?: () => void; refreshing?: boolean }) {
  return (
    <div className="flex items-start justify-between flex-wrap gap-2">
      <div>
        <h1 className="text-xl font-bold flex items-center gap-2" style={{ color: 'var(--text)' }}>
          <Activity size={20} style={{ color: 'var(--sage)' }} /> Market-Linked Portfolio
        </h1>
        <p className="text-[12px] mt-0.5" style={{ color: 'var(--text3)' }}>
          Mutual Funds · Stocks · ETFs · {view === 'uae' ? 'UAE · AED' : view === 'india' ? 'India · INR' : 'Consolidated · INR'}
        </p>
      </div>
      <div className="flex items-center gap-2 no-print">
        {onRefresh && (
          <button onClick={onRefresh} disabled={refreshing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold border transition-all disabled:opacity-60"
            style={{ background: 'var(--bg2)', borderColor: 'var(--border)', color: 'var(--text3)' }}>
            {refreshing ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
            {refreshing ? 'Refreshing…' : 'Refresh prices'}
          </button>
        )}
        <Link href="/dashboard/learn"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold border"
          style={{ background: 'var(--sage-bg)', borderColor: 'var(--sage)', color: 'var(--sage)' }}>
          <GraduationCap size={12} /> Learn
        </Link>
      </div>
    </div>
  )
}

function Kpi({ label, value, icon: Icon, color, sub }: { label: string; value: string; icon: any; color: string; sub?: string }) {
  return (
    <div className="wl-card p-3.5">
      <div className="flex items-center gap-2 mb-1.5">
        <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: color + '18' }}>
          <Icon size={14} style={{ color }} />
        </div>
        <span className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: 'var(--text3)' }}>{label}</span>
      </div>
      <div className="text-[18px] font-bold font-mono" style={{ color }}>{value}</div>
      {sub && <div className="text-[10px] mt-0.5 font-medium" style={{ color: 'var(--text3)' }}>{sub}</div>}
    </div>
  )
}

function AllocBars({ title, rows, total, money, colors }: { title: string; rows: [string, number][]; total: number; money: (n: number) => string; colors: Record<string, string> }) {
  return (
    <div className="wl-card p-4">
      <div className="text-[11px] font-bold uppercase tracking-wider mb-3" style={{ color: 'var(--text3)' }}>{title}</div>
      <div className="space-y-2.5">
        {rows.map(([name, val]) => {
          const pct = total > 0 ? (val / total) * 100 : 0
          const color = colors[name] ?? '#6B7280'
          return (
            <div key={name} className="flex items-center gap-3">
              <div className="text-[11px] font-medium w-24 flex-shrink-0 truncate" style={{ color: 'var(--text2)' }}>{name}</div>
              <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: 'var(--bg2)' }}>
                <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
              </div>
              <div className="text-[10px] font-mono w-10 text-right" style={{ color: 'var(--text3)' }}>{pct.toFixed(0)}%</div>
              <div className="text-[11px] font-mono font-semibold w-20 text-right" style={{ color: 'var(--text)' }}>{money(val)}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function TaxStat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="rounded-xl p-3" style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}>
      <div className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--text3)' }}>{label}</div>
      <div className="text-[16px] font-bold font-mono" style={{ color }}>{value}</div>
    </div>
  )
}

function PerfCard({ title, h, money, ret, good }: { title: string; h: Holding | null; money: (n: number) => string; ret: (h: Holding) => number; good?: boolean }) {
  return (
    <div className="wl-card p-4">
      <div className="text-[11px] font-bold uppercase tracking-wider mb-2 flex items-center gap-1.5" style={{ color: 'var(--text3)' }}>
        {good ? <Trophy size={12} style={{ color: 'var(--gold)' }} /> : <AlertTriangle size={12} style={{ color: 'var(--rose)' }} />} {title}
      </div>
      {!h ? (
        <div className="text-[12px] py-3" style={{ color: 'var(--text3)' }}>—</div>
      ) : (
        <>
          <div className="text-[13px] font-semibold truncate" style={{ color: 'var(--text)' }}>{h.name}</div>
          <div className="text-[10px] mb-1" style={{ color: 'var(--text3)' }}>{h.kind}</div>
          <div className="text-[20px] font-bold font-mono" style={{ color: ret(h) >= 0 ? 'var(--income)' : 'var(--rose)' }}>
            {ret(h) >= 0 ? '+' : ''}{ret(h).toFixed(1)}%
          </div>
          <div className="text-[11px] font-mono mt-0.5" style={{ color: 'var(--text3)' }}>{money(h.current)} now</div>
        </>
      )}
    </div>
  )
}
