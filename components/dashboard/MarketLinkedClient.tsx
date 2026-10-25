'use client'
import { PageHeader, InsightBar, AiActions, HeroStat, KpiTile, Donut, ProgressRow } from '@/components/ui/kit'
import { ListCard, ListRow } from '@/components/ui/list'
import { useMemo, useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useViewStore } from '@/store/viewStore'
import { createClient } from '@/lib/supabase/client'
import { ResponsiveContainer, Tooltip, AreaChart, Area, XAxis, YAxis, ReferenceLine } from 'recharts'
import {
  TrendingUp, TrendingDown, Wallet, Layers, BarChart2,
  Trophy, AlertTriangle, GraduationCap,
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

const INSTRUMENT_COLORS: Record<string, string> = { 'Mutual Fund': '#6A55E8', Stock: '#3B8EF0', ETF: '#2FB67C' }
const CLASS_COLORS: Record<string, string> = {
  Equity: '#6A55E8', Debt: '#3B8EF0', Hybrid: '#2FB67C', Gold: '#F29A2E', Index: '#2FB67C', International: '#EC5B8C', Other: '#94A3B8',
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
            <Link href="/dashboard/investments/mutual-funds" className="px-3 py-1.5 rounded-lg text-[12px] font-semibold border" style={{ borderColor: 'var(--line)', color: 'var(--text2)', background: 'var(--bg2)' }}>Mutual Funds</Link>
            <Link href="/dashboard/stocks" className="px-3 py-1.5 rounded-lg text-[12px] font-semibold border" style={{ borderColor: 'var(--line)', color: 'var(--text2)', background: 'var(--bg2)' }}>Stocks</Link>
            <Link href="/dashboard/investments/etf" className="px-3 py-1.5 rounded-lg text-[12px] font-semibold border" style={{ borderColor: 'var(--line)', color: 'var(--text2)', background: 'var(--bg2)' }}>ETF</Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3.5 md:gap-[18px] animate-fade-up">
      <Header view={view} onRefresh={refreshPrices} refreshing={refreshing} />
      {insights[0] && <InsightBar text={`${insights[0].title}. ${insights[0].detail}`}
        prompt={`Explain my market-linked portfolio: invested ${money(totalInvested)}, worth ${money(totalCurrent)} (${gainPct.toFixed(1)}%), SIPs ${money(monthlySip)} a month. ${insights.map(i => `${i.title}: ${i.detail}`).join(' ')}`} />}
      {holdings.length > 0 && <AiActions actions={['Rebalance my portfolio', 'Which holdings should I review?']}
        context={`Holdings: ${holdings.slice(0, 20).map(h => `${h.name} (${h.kind}, ${money(h.current)})`).join(', ')}.`} />}

      {/* Headline value + wealth curve (same card on desktop and phone), returns vs Nifty */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-3.5 md:gap-4">
        <HeroStat label="Value today" value={money(totalCurrent)} tone={totalGain >= 0 ? 'good' : 'bad'}
          delta={`${totalGain >= 0 ? '▲' : '▼'} ${money(Math.abs(totalGain))} (${totalGain >= 0 ? '+' : ''}${gainPct.toFixed(1)}%) on ${money(totalInvested)} put in`}
          right={<span className="text-[11.5px] flex items-center gap-3" style={{ color: 'var(--text3)' }}>
            <span className="flex items-center gap-1.5"><i className="w-[9px] h-[9px] rounded-sm" style={{ background: '#6A55E8' }} />Put in</span>
            <span className="flex items-center gap-1.5"><i className="w-4 border-t-2 border-dashed" style={{ borderColor: '#16A34A' }} />Value today</span>
          </span>}>
          {wealthSeries.length > 0 && (
            <div className="h-[130px] md:h-auto md:flex-1 md:min-h-[180px] mt-3 -mx-1">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={wealthSeries} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="wlInv" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#6A55E8" stopOpacity={0.25} />
                      <stop offset="100%" stopColor="#6A55E8" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false} minTickGap={30} />
                  <YAxis hide domain={[0, (max: number) => Math.max(max, totalCurrent) * 1.05]} />
                  <Tooltip formatter={(v: any) => [money(Number(v)), 'Put in']} contentStyle={{ fontSize: 12, borderRadius: 10, border: '1px solid var(--line)' }} />
                  <ReferenceLine y={Math.round(totalCurrent)} stroke="#16A34A" strokeDasharray="4 3" />
                  <Area type="monotone" dataKey="invested" name="Put in" stroke="#6A55E8" strokeWidth={2.5} fill="url(#wlInv)" isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </HeroStat>

        <section className="wl-card px-4 md:px-5 py-4 md:py-[18px] flex flex-col gap-3">
          <h2 className="text-[14px] font-semibold" style={{ color: 'var(--text)' }}>Yearly return (XIRR){nifty ? ' vs Nifty 50' : ''}</h2>
          {portfolioXirr === null ? (
            <p className="text-[12.5px]" style={{ color: 'var(--text3)' }}>Import dated purchases (a CAMS statement, or buys you record) to work out your yearly return.</p>
          ) : (<>
            <div className="grid grid-cols-2 gap-2.5">
              <div className="rounded-xl px-3.5 py-2.5" style={{ background: '#FAFAFE', border: '1px solid var(--line)' }}>
                <div className="text-[11.5px]" style={{ color: 'var(--text3)' }}>You</div>
                <div className="text-[19px] font-bold tabular-nums" style={{ color: portfolioXirr >= 0 ? '#16A34A' : '#DC2626' }}>{portfolioXirr >= 0 ? '+' : ''}{portfolioXirr.toFixed(1)}%<span className="text-[11px] font-normal" style={{ color: 'var(--text4)' }}> a yr</span></div>
              </div>
              <div className="rounded-xl px-3.5 py-2.5" style={{ background: '#FAFAFE', border: '1px solid var(--line)' }}>
                <div className="text-[11.5px]" style={{ color: 'var(--text3)' }}>Nifty 50</div>
                <div className="text-[19px] font-bold tabular-nums" style={{ color: 'var(--text)' }}>{nifty ? `${nifty.cagr >= 0 ? '+' : ''}${nifty.cagr.toFixed(1)}%` : '…'}<span className="text-[11px] font-normal" style={{ color: 'var(--text4)' }}>{nifty ? ' a yr' : ''}</span></div>
              </div>
            </div>
            {nifty && (() => { const d = portfolioXirr - nifty.cagr; return (
              <div className="rounded-xl px-3.5 py-2.5 flex items-center justify-between" style={{ background: d >= 0 ? '#E7F7EF' : '#FDECE8' }}>
                <span className="text-[12.5px] font-medium" style={{ color: d >= 0 ? '#1E8F5F' : '#D9482F' }}>{d >= 0 ? 'Ahead of the index by' : 'Behind the index by'}</span>
                <span className="text-[16px] font-bold tabular-nums" style={{ color: d >= 0 ? '#1E8F5F' : '#D9482F' }}>{Math.abs(d).toFixed(1)}%</span>
              </div>
            ) })()}
            <p className="text-[11.5px] leading-snug mt-auto" style={{ color: 'var(--text4)' }}>XIRR weighs each investment by when you made it, compared with the Nifty 50 over the same period.</p>
          </>)}
        </section>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 md:gap-3.5">
        <KpiTile label="Put in" value={money(totalInvested)} delta={`${holdings.length} holding${holdings.length === 1 ? '' : 's'}`} tint={0} icon={Wallet} />
        <KpiTile label="Gain / loss" value={`${totalGain >= 0 ? '+' : '−'}${money(Math.abs(totalGain))}`} delta={`${totalGain >= 0 ? '+' : ''}${gainPct.toFixed(1)}% overall`} tone={totalGain >= 0 ? 'good' : 'bad'} tint={1} icon={totalGain >= 0 ? TrendingUp : TrendingDown} />
        <KpiTile label="Up / down" value={`${gainers} / ${losers}`} delta="holdings in profit / at a loss" tint={3} icon={Layers} />
        <KpiTile label="Monthly SIPs" value={monthlySip > 0 ? money(monthlySip) : '—'} delta={monthlySip > 0 ? 'auto-invested a month' : 'No SIP running'} tint={2} icon={BarChart2} />
      </div>

      {/* What stands out */}
      {insights.length > 0 && (
        <section className="wl-card px-4 md:px-5 py-4 md:py-[18px]">
          <h2 className="text-[14px] md:text-[15px] font-semibold mb-3" style={{ color: 'var(--text)' }}>What stands out</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {insights.map((ins, i) => {
              const [c, bg] = ins.tone === 'warn' ? ['#D9482F', '#FDECE8'] : ins.tone === 'good' ? ['#1E8F5F', '#E7F7EF'] : ['#6A55E8', '#F0EDFF']
              const Icon = ins.tone === 'warn' ? AlertTriangle : ins.tone === 'good' ? CheckCircle2 : Lightbulb
              return (
                <div key={i} className="flex gap-3 rounded-xl px-3.5 py-3" style={{ background: '#FAFAFE', border: '1px solid var(--line)' }}>
                  <span className="w-8 h-8 rounded-[10px] flex items-center justify-center flex-shrink-0" style={{ background: bg, color: c }}><Icon size={15} /></span>
                  <div className="min-w-0">
                    <div className="text-[13px] font-semibold" style={{ color: 'var(--text)' }}>{ins.title}</div>
                    <div className="text-[12px] leading-snug mt-0.5" style={{ color: 'var(--text3)' }}>{ins.detail}</div>
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* Where the money sits */}
      <section className="wl-card px-4 md:px-5 py-4 md:py-[18px]">
        <h2 className="text-[14px] md:text-[15px] font-semibold mb-3.5" style={{ color: 'var(--text)' }}>Where your money sits</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 md:gap-10">
          <div className="flex items-center gap-4 md:gap-5">
            <Donut segments={pieData} size={112} label="Split by instrument">
              <span className="text-[10.5px]" style={{ color: 'var(--text3)' }}>Holdings</span>
              <span className="text-[17px] font-bold tabular-nums" style={{ color: 'var(--text)' }}>{holdings.length}</span>
            </Donut>
            <div className="flex-1 min-w-0 flex flex-col gap-2.5">
              <div className="text-[11.5px] font-medium" style={{ color: 'var(--text3)' }}>By instrument</div>
              {byInstrument.map(([name, val]) => (
                <div key={name} className="flex items-center gap-2 text-[12.5px]">
                  <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: INSTRUMENT_COLORS[name] ?? '#94A3B8' }} />
                  <span className="flex-1 truncate" style={{ color: 'var(--text2)' }}>{name}</span>
                  <span className="text-right">
                    <span className="block tabular-nums font-semibold" style={{ color: 'var(--text)' }}>{money(val)}</span>
                    <span className="md:hidden block text-[11px] tabular-nums" style={{ color: 'var(--text3)' }}>{totalCurrent > 0 ? Math.round(val / totalCurrent * 100) : 0}%</span>
                  </span>
                  <span className="max-md:hidden tabular-nums w-9 text-right" style={{ color: 'var(--text3)' }}>{totalCurrent > 0 ? Math.round(val / totalCurrent * 100) : 0}%</span>
                </div>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-3">
            <div className="text-[11.5px] font-medium" style={{ color: 'var(--text3)' }}>By asset class</div>
            {byClass.map(([name, val]) => {
              const pct = totalCurrent > 0 ? val / totalCurrent * 100 : 0
              return <ProgressRow key={name} name={name} value={money(val)} right={`${pct.toFixed(0)}%`} pct={pct} color={CLASS_COLORS[name] ?? '#94A3B8'} />
            })}
          </div>
        </div>
      </section>

      {/* Tax view */}
      {view !== 'uae' && (taxView.ltcg > 0 || taxView.stcg > 0 || taxView.elssLocked > 0 || taxView.debtGain !== 0) && (
        <section className="wl-card px-4 md:px-5 py-4 md:py-[18px]">
          <div className="flex items-center gap-2.5 mb-3">
            <span className="w-8 h-8 rounded-[10px] flex items-center justify-center" style={{ background: 'var(--accent-bg)', color: 'var(--accent)' }}><Scale size={15} /></span>
            <div>
              <h2 className="text-[14px] md:text-[15px] font-semibold" style={{ color: 'var(--text)' }}>Tax if you sold today</h2>
              <div className="text-[11.5px]" style={{ color: 'var(--text3)' }}>An estimate, before any losses you could set off</div>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
            <TaxStat label="Long-term gains" value={money(taxView.ltcg)} color="var(--text)" />
            <TaxStat label="Short-term gains" value={money(taxView.stcg)} color="var(--text)" />
            <TaxStat label="Tax due (est.)" value={money(taxView.total)} color="#DC2626" />
            <TaxStat label="Tax-free room left" value={money(taxView.bookableFree)} color="#16A34A" />
          </div>
          {taxView.bookableFree > 1000 && (
            <div className="rounded-xl px-3.5 py-2.5 mt-2.5 text-[12.5px] leading-snug flex items-start gap-2" style={{ background: '#E7F7EF', color: '#1E8F5F' }}>
              <CheckCircle2 size={14} className="mt-0.5 flex-shrink-0" />
              <span>You can book about <b>{money(taxView.bookableFree)}</b> of long-term equity gains tax-free this year (the ₹1.25L exemption). Selling and buying back resets your cost.</span>
            </div>
          )}
          {taxView.elssLocked > 0 && (
            <div className="rounded-xl px-3.5 py-2.5 mt-2 text-[12.5px] leading-snug flex items-start gap-2" style={{ background: '#FFF2E2', color: '#B96A0B' }}>
              <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
              <span>{taxView.elssLocked} ELSS fund{taxView.elssLocked > 1 ? 's are' : ' is'} still in the 3-year lock-in{taxView.elssUnlock ? ` (the first unlocks ${taxView.elssUnlock})` : ''}.</span>
            </div>
          )}
          <p className="text-[11px] mt-2.5 leading-snug" style={{ color: 'var(--text4)' }}>
            India equity rules: long-term 12.5% above ₹1.25L, short-term 20%. Debt gains ({money(taxView.debtGain)}) are taxed at your slab and left out here. Holding period counts from the purchase date.
          </p>
        </section>
      )}

      {/* Best and worst, and who holds what */}
      <div className={`grid grid-cols-2 ${byHolder.length > 1 ? 'lg:grid-cols-3' : ''} gap-2.5 md:gap-3.5`}>
        <PerfCard title="Best performer" h={best} money={money} ret={ret} good />
        <PerfCard title="Needs a look" h={worst} money={money} ret={ret} />
        {byHolder.length > 1 && (
          <section className="wl-card px-4 md:px-5 py-4 max-lg:col-span-2 flex flex-col gap-2.5">
            <h2 className="text-[13px] md:text-[14px] font-semibold" style={{ color: 'var(--text)' }}>By holder</h2>
            {byHolder.slice(0, 4).map(([name, val]) => (
              <ProgressRow key={name} name={name} value={money(val)} pct={totalCurrent > 0 ? val / totalCurrent * 100 : 0} />
            ))}
          </section>
        )}
      </div>

      {/* Holdings */}
      <ListCard title="All holdings" sub={`${holdings.length} across mutual funds, stocks and ETFs`}
        toolbar={<div className="flex flex-wrap gap-1.5" role="group" aria-label="Sort holdings">
          {([['value', 'By value'], ['gain', 'By return'], ['invested', 'By amount put in']] as const).map(([k, label]) => (
            <button key={k} onClick={() => setSortBy(k)} aria-pressed={sortBy === k} className="wl-chip">{label}</button>
          ))}
        </div>}
        head={['Holding', 'Type', 'Return', 'Value']}>
        {sorted.map((h, i) => {
          const r = ret(h)
          const href = h.kind === 'Mutual Fund' ? '/dashboard/investments/mutual-funds' : h.kind === 'Stock' ? '/dashboard/investments/stocks' : '/dashboard/investments/etf'
          return (
            <ListRow key={`${h.kind}-${h.name}-${i}`} color={INSTRUMENT_COLORS[h.kind] ?? '#94A3B8'} title={h.name}
              sub={`${h.assetClass}${h.holder ? ` · ${h.holder}` : ''}`} tag={h.kind}
              meta={`${r >= 0 ? '+' : ''}${r.toFixed(1)}%`} metaColor={r >= 0 ? '#16A34A' : '#DC2626'}
              amount={money(h.current)} amountSub={`put in ${money(h.invested)}`} href={href} />
          )
        })}
      </ListCard>
    </div>
  )
}

// ── Sub-components ───────────────────────────────────────────────────────────

function Header({ view, onRefresh, refreshing }: { view: string; onRefresh?: () => void; refreshing?: boolean }) {
  return (
    <PageHeader title="Market-linked portfolio"
      sub={`Mutual funds · stocks · ETFs · ${view === 'uae' ? 'UAE · AED' : view === 'india' ? 'India · INR' : 'Consolidated · INR'}`}
      actions={<>
        {onRefresh && (
          <button onClick={onRefresh} disabled={refreshing} className="wl-btn no-print" style={{ height: 34 }}>
            {refreshing ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}{refreshing ? 'Refreshing…' : 'Refresh prices'}
          </button>
        )}
        <Link href="/dashboard/learn" className="wl-btn no-print" style={{ height: 34 }}><GraduationCap size={13} />Learn</Link>
      </>} />
  )
}

function TaxStat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="rounded-xl px-3.5 py-2.5" style={{ background: '#FAFAFE', border: '1px solid var(--line)' }}>
      <div className="text-[11.5px] mb-0.5" style={{ color: 'var(--text3)' }}>{label}</div>
      <div className="text-[15px] md:text-[16px] font-bold tabular-nums" style={{ color }}>{value}</div>
    </div>
  )
}

function PerfCard({ title, h, money, ret, good }: { title: string; h: Holding | null; money: (n: number) => string; ret: (h: Holding) => number; good?: boolean }) {
  const r = h ? ret(h) : 0
  return (
    <section className="wl-card px-4 md:px-5 py-4 min-w-0">
      <div className="flex items-center gap-2 mb-2.5">
        <span className="w-7 h-7 rounded-[9px] flex items-center justify-center flex-shrink-0" style={good ? { background: '#E7F7EF', color: '#1E8F5F' } : { background: '#FDECE8', color: '#D9482F' }}>
          {good ? <Trophy size={14} /> : <AlertTriangle size={14} />}
        </span>
        <h2 className="text-[12.5px] md:text-[14px] font-semibold truncate" style={{ color: 'var(--text)' }}>{title}</h2>
      </div>
      {!h ? (
        <div className="text-[12.5px]" style={{ color: 'var(--text3)' }}>Nothing to show yet</div>
      ) : (<>
        <div className="text-[13px] font-semibold truncate" style={{ color: 'var(--text)' }}>{h.name}</div>
        <div className="text-[11.5px]" style={{ color: 'var(--text3)' }}>{h.kind}</div>
        <div className="text-[20px] md:text-[22px] font-bold tabular-nums mt-1" style={{ color: r >= 0 ? '#16A34A' : '#DC2626' }}>{r >= 0 ? '+' : ''}{r.toFixed(1)}%</div>
        <div className="text-[11.5px] tabular-nums" style={{ color: 'var(--text3)' }}>{money(h.current)} today</div>
      </>)}
    </section>
  )
}
