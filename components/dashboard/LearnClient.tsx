'use client'
import { useMemo, useState } from 'react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import { motion, AnimatePresence } from 'framer-motion'
import {
  GraduationCap, Sparkles, ChevronDown, BookOpen, TrendingUp, Layers,
  Wallet, Receipt, Lock, PieChart as PieIcon, Lightbulb,
} from 'lucide-react'

interface Fund {
  fund_name?:       string
  fund_type?:       string
  units?:           number | null
  avg_nav?:         number | null
  current_nav?:     number | null
  invested_amount?: number | null
  has_sip?:         boolean | null
  sip_amount?:      number | null
  currency?:        string | null
}

interface Props { funds: Fund[] }

// ── helpers (self-contained) ────────────────────────────────────────────────
function abbr(n: number, sym: string) {
  const a = Math.abs(n)
  if (a >= 1e7) return `${sym}${(n / 1e7).toFixed(2)} Cr`
  if (a >= 1e5) return `${sym}${(n / 1e5).toFixed(2)} L`
  if (a >= 1e3) return `${sym}${(n / 1e3).toFixed(1)}K`
  return `${sym}${Math.round(n).toLocaleString('en-IN')}`
}

// Future value of a monthly SIP: P * ((1+r)^n - 1) / r * (1+r)
function sipFV(monthly: number, annualPct: number, years: number) {
  const r = annualPct / 100 / 12
  const n = years * 12
  if (r === 0) return monthly * n
  return monthly * ((Math.pow(1 + r, n) - 1) / r) * (1 + r)
}

// Asset bucket from fund_type + name keywords
type Asset = 'Equity' | 'Debt' | 'Hybrid' | 'Gold'
function assetOf(name = '', type = ''): Asset {
  const n = name.toLowerCase()
  if (/gold|silver|precious/.test(n)) return 'Gold'
  if (type === 'debt' || type === 'liquid' ||
      /\bdebt\b|gilt|liquid|overnight|money\s*market|corporate\s*bond|credit\s*risk|banking\s*&?\s*psu|duration|\bincome\b|treasury|\bbond\b/.test(n)) return 'Debt'
  if (type === 'hybrid' ||
      /hybrid|balanced|advantage|asset\s*alloc|multi\s*asset|equity\s*savings|arbitrage/.test(n)) return 'Hybrid'
  // equity / elss / index all behave like equity for risk/return
  return 'Equity'
}
const isElss = (f: Fund) => f.fund_type === 'elss' || /elss|tax\s*sav/i.test(f.fund_name ?? '')

const ASSET_COLOR: Record<Asset, string> = {
  Equity: '#3D7A58', Debt: '#64748B', Hybrid: '#C2640A', Gold: '#CA8A04',
}
const ASSET_BLURB: Record<Asset, string> = {
  Equity: 'Highest long-term return potential, but the most ups and downs. Best for goals 5+ years away.',
  Debt:   'Steadier and lower-risk — bonds and money-market instruments. Good for short-term needs and stability.',
  Hybrid: 'A blend of equity and debt in one fund. Smoother ride than pure equity, with a moderate return.',
  Gold:   'A hedge that often holds value when markets fall. Useful in small doses for diversification.',
}

export default function LearnClient({ funds }: Props) {
  const sym = (funds[0]?.currency === 'AED') ? 'AED ' : '₹'

  // ── derive everything from real holdings ──────────────────────────────────
  const model = useMemo(() => {
    const rows = funds.map(f => {
      const units = Number(f.units) || 0
      const avg = Number(f.avg_nav) || 0
      const cur = Number(f.current_nav) || avg
      const invested = Number(f.invested_amount) || 0
      const current = units * (cur || avg)
      return { f, units, avg, cur, invested, current, asset: assetOf(f.fund_name, f.fund_type) }
    })

    const totalInvested = rows.reduce((a, r) => a + r.invested, 0)
    const totalCurrent  = rows.reduce((a, r) => a + r.current, 0)
    const totalGain     = totalCurrent - totalInvested

    // asset split by current value
    const assetMap: Record<string, number> = {}
    rows.forEach(r => { assetMap[r.asset] = (assetMap[r.asset] ?? 0) + r.current })
    const byAsset = (Object.entries(assetMap) as [Asset, number][])
      .map(([asset, value]) => ({ asset, value, pct: totalCurrent > 0 ? value / totalCurrent * 100 : 0 }))
      .sort((a, b) => b.value - a.value)

    // distinct categories held
    const categories = Array.from(new Set(rows.map(r => r.asset)))

    // a representative fund to use in the NAV example (prefer one with a real NAV)
    const navExample = rows.find(r => r.cur > 0) ?? rows[0] ?? null

    // SIP details
    const sippers = rows.filter(r => r.f.has_sip)
    const sipMonthly = sippers.reduce((a, r) => a + (Number(r.f.sip_amount) || 0), 0)
    const hasSip = sipMonthly > 0

    // equity gain (for tax illustration)
    const equityGain = rows
      .filter(r => r.asset === 'Equity' || r.asset === 'Hybrid')
      .reduce((a, r) => a + (r.current - r.invested), 0)

    const elss = rows.filter(r => isElss(r.f))

    return { rows, totalInvested, totalCurrent, totalGain, byAsset, categories, navExample, hasSip, sipMonthly, equityGain, elss }
  }, [funds])

  const hasFunds = model.rows.length > 0
  const RATE = 12

  // ── SIP growth chart (animated by recharts) ───────────────────────────────
  const sipForChart = model.hasSip ? Math.round(model.sipMonthly) : 5000
  const sipSeries = useMemo(() => {
    const pts: { year: number; value: number; invested: number }[] = [{ year: 0, value: 0, invested: 0 }]
    for (let y = 1; y <= 10; y++) {
      pts.push({ year: y, value: Math.round(sipFV(sipForChart, RATE, y)), invested: sipForChart * 12 * y })
    }
    return pts
  }, [sipForChart])
  const sip10y = sipFV(sipForChart, RATE, 10)
  const sipInvested10y = sipForChart * 12 * 10

  // ── expense-ratio illustration: ₹X over 20y at net 11% vs 11.5% ───────────
  const erBase = model.hasSip ? Math.max(2000, Math.round(model.sipMonthly)) : 5000
  const erHigh = sipFV(erBase, 11.0, 20)   // 1.0% expense → ~11% net
  const erLow  = sipFV(erBase, 11.5, 20)   // 0.5% expense → ~11.5% net
  const erDiff = erLow - erHigh

  // ── tax illustration ──────────────────────────────────────────────────────
  const taxGain = model.equityGain > 0 ? model.equityGain : 200000
  const taxGainIsReal = model.equityGain > 0
  const ltcgTaxable = Math.max(0, taxGain - 125000)
  const ltcgTax = ltcgTaxable * 0.125
  const stcgTax = Math.max(0, taxGain) * 0.20

  const fmtSip = `${sym}${sipForChart.toLocaleString('en-IN')}`
  const topAsset = model.byAsset[0]

  // ── lesson definitions ──────────────────────────────────────────────────
  const navName = model.navExample?.f.fund_name || 'an equity fund'
  const navVal  = model.navExample && model.navExample.cur > 0 ? model.navExample.cur : 45.20
  const navUnits = model.navExample && model.navExample.units > 0 ? model.navExample.units : 0

  const lessons = [
    {
      id: 'nav',
      icon: BookOpen,
      title: 'What is a mutual fund & NAV?',
      teaser: 'The basics — pooled money, professionally managed, priced once a day.',
      body: (
        <div className="space-y-3 text-[12.5px] leading-relaxed" style={{ color: 'var(--text2)' }}>
          <p>A <strong style={{ color: 'var(--text)' }}>mutual fund</strong> pools money from many investors and a professional manager invests it across dozens of stocks or bonds. You own <em>units</em> of that pool rather than the underlying shares directly.</p>
          <p>The price of one unit is the <strong style={{ color: 'var(--text)' }}>NAV (Net Asset Value)</strong> — the fund's total holdings divided by the number of units. It updates once each business day after markets close.</p>
          <div className="rounded-lg p-3" style={{ background: 'var(--sage-bg)' }}>
            <div className="text-[11px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--sage)' }}>Your example</div>
            <p>{hasFunds
              ? <>Your <strong style={{ color: 'var(--text)' }}>{navName}</strong> currently has a NAV of <strong style={{ color: 'var(--text)' }}>{sym}{navVal.toFixed(2)}</strong>{navUnits > 0 ? <> per unit. Holding <strong style={{ color: 'var(--text)' }}>{navUnits.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</strong> units, that's worth about <strong style={{ color: 'var(--text)' }}>{abbr(navUnits * navVal, sym)}</strong> today.</> : '.'} When the fund's investments rise in value, your NAV — and your holding — rises with it.</>
              : <>Say a fund's NAV is <strong style={{ color: 'var(--text)' }}>{sym}45.20</strong>. Investing {sym}10,000 buys you about <strong style={{ color: 'var(--text)' }}>221.2 units</strong>. As the fund's holdings grow, the NAV rises and so does your money.</>}</p>
          </div>
          <Takeaway>{hasFunds
            ? `You already own units — you don't need to track individual stocks, the fund does that for you.`
            : `Buying units is simply buying a slice of a professionally managed basket — a great first step.`}</Takeaway>
        </div>
      ),
    },
    {
      id: 'sip',
      icon: TrendingUp,
      title: 'The power of SIP & compounding',
      teaser: model.hasSip ? `Your ${fmtSip}/mo SIP, projected over 10 years.` : 'How small, regular investments snowball over time.',
      body: (
        <div className="space-y-3 text-[12.5px] leading-relaxed" style={{ color: 'var(--text2)' }}>
          <p>A <strong style={{ color: 'var(--text)' }}>SIP (Systematic Investment Plan)</strong> invests a fixed amount every month — automatically. You buy more units when prices are low and fewer when high (rupee-cost averaging), and your returns earn returns of their own. That snowball is <strong style={{ color: 'var(--text)' }}>compounding</strong>.</p>
          <p>{model.hasSip
            ? <>You currently invest <strong style={{ color: 'var(--text)' }}>{fmtSip}/month</strong> via SIP. At a steady ~{RATE}% a year, here's how that could grow:</>
            : <>You don't have a SIP set up yet. Here's what a sample <strong style={{ color: 'var(--text)' }}>{sym}5,000/month</strong> SIP could become at ~{RATE}% a year — consider starting one:</>}</p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            {[
              { label: 'You invest', value: abbr(sipInvested10y, sym), color: 'var(--text2)', note: 'over 10 years' },
              { label: 'Could become', value: abbr(sip10y, sym), color: 'var(--sage)', note: 'at ~12%/yr' },
              { label: 'Pure growth', value: abbr(sip10y - sipInvested10y, sym), color: 'var(--income)', note: 'compounding does this' },
            ].map((c, i) => (
              <motion.div key={c.label} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08, duration: 0.35 }}
                className="rounded-xl p-3" style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}>
                <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text3)' }}>{c.label}</div>
                <div className="text-[20px] font-bold font-mono leading-tight mt-0.5" style={{ color: c.color }}>{c.value}</div>
                <div className="text-[10px] mt-0.5" style={{ color: 'var(--text3)' }}>{c.note}</div>
              </motion.div>
            ))}
          </div>

          <div className="rounded-xl p-3" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
            <div className="flex items-center gap-2 mb-2 px-1">
              <TrendingUp size={13} style={{ color: 'var(--sage)' }} />
              <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--text3)' }}>{fmtSip}/mo growing at ~{RATE}%/yr</span>
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={sipSeries} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="learn-sip" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3D7A58" stopOpacity={0.32} /><stop offset="100%" stopColor="#3D7A58" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="year" tickFormatter={(v: number) => `${v}y`} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={(v: number) => abbr(v, sym)} tick={{ fontSize: 9 }} width={52} axisLine={false} tickLine={false} />
                <Tooltip formatter={(v: any, n: any) => [abbr(Number(v), sym), n === 'value' ? 'Could be worth' : 'Invested']} labelFormatter={(l: any) => `Year ${l}`} />
                <Area type="monotone" dataKey="invested" stroke="#9CA3AF" strokeWidth={1} strokeDasharray="4 4" fill="none" />
                <Area type="monotone" dataKey="value" stroke="#3D7A58" strokeWidth={2.5} fill="url(#learn-sip)" isAnimationActive animationDuration={1100} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <Takeaway>{model.hasSip
            ? `Staying invested is the whole game — your ${fmtSip}/mo could roughly ${(sip10y / sipInvested10y).toFixed(1)}x your contributions over a decade.`
            : `Even a modest ${sym}5,000/month, left to compound, can grow to ${abbr(sip10y, sym)} in 10 years. Time matters more than amount.`}</Takeaway>
        </div>
      ),
    },
    {
      id: 'assets',
      icon: Layers,
      title: 'Equity vs Debt vs Hybrid',
      teaser: hasFunds ? `Your split across ${model.byAsset.length} asset type${model.byAsset.length === 1 ? '' : 's'}.` : 'Matching risk to your time horizon.',
      body: (
        <div className="space-y-3 text-[12.5px] leading-relaxed" style={{ color: 'var(--text2)' }}>
          <p>Funds differ mainly by <strong style={{ color: 'var(--text)' }}>what they hold</strong>, which sets their risk and return.</p>
          {hasFunds && (
            <>
              <div className="flex h-4 rounded-full overflow-hidden" style={{ background: 'var(--bg2)' }}>
                {model.byAsset.map(a => (
                  <div key={a.asset} style={{ width: `${a.pct}%`, background: ASSET_COLOR[a.asset] }} title={`${a.asset} ${a.pct.toFixed(0)}%`} />
                ))}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {model.byAsset.map(a => (
                  <div key={a.asset} className="rounded-lg px-3 py-2" style={{ background: 'var(--bg2)' }}>
                    <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider" style={{ color: ASSET_COLOR[a.asset] }}>
                      <span className="w-2 h-2 rounded-sm" style={{ background: ASSET_COLOR[a.asset] }} />{a.asset}
                    </div>
                    <div className="text-[15px] font-bold font-mono mt-0.5" style={{ color: 'var(--text)' }}>{a.pct.toFixed(0)}%</div>
                    <div className="text-[10px]" style={{ color: 'var(--text3)' }}>{abbr(a.value, sym)}</div>
                  </div>
                ))}
              </div>
            </>
          )}
          <div className="space-y-2">
            {(['Equity', 'Debt', 'Hybrid'] as Asset[]).map(a => (
              <div key={a} className="flex items-start gap-2">
                <span className="w-2.5 h-2.5 rounded-sm mt-1 flex-shrink-0" style={{ background: ASSET_COLOR[a] }} />
                <p><strong style={{ color: 'var(--text)' }}>{a}:</strong> {ASSET_BLURB[a]}</p>
              </div>
            ))}
          </div>
          <Takeaway>{hasFunds
            ? (topAsset && topAsset.pct > 70
                ? `${topAsset.pct.toFixed(0)}% of your money is in ${topAsset.asset} — quite concentrated. Mixing in another asset type can smooth your ride.`
                : `Your ${model.byAsset.length}-way mix balances growth and stability — a sensible structure.`)
            : `Pick the mix that fits your goal's timeline: more equity for far-off goals, more debt for near-term ones.`}</Takeaway>
        </div>
      ),
    },
    {
      id: 'er',
      icon: Wallet,
      title: 'Expense ratio — why low cost matters',
      teaser: 'A tiny annual fee quietly compounds against you.',
      body: (
        <div className="space-y-3 text-[12.5px] leading-relaxed" style={{ color: 'var(--text2)' }}>
          <p>The <strong style={{ color: 'var(--text)' }}>expense ratio</strong> is the fund's annual fee, charged silently from the NAV. It sounds trivial — but over decades it compounds against you. <strong style={{ color: 'var(--text)' }}>Direct</strong> plans skip distributor commissions and cost ~0.5% less than <strong style={{ color: 'var(--text)' }}>Regular</strong> plans.</p>
          <p>Imagine {sym}{erBase.toLocaleString('en-IN')}/month invested for <strong style={{ color: 'var(--text)' }}>20 years</strong>. The only difference below is a <strong style={{ color: 'var(--text)' }}>0.5% lower fee</strong>:</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            {[
              { label: 'Higher fee (~1.0%)', value: abbr(erHigh, sym), color: 'var(--text2)' },
              { label: 'Lower fee (~0.5%)', value: abbr(erLow, sym), color: 'var(--sage)' },
              { label: 'You keep extra', value: abbr(erDiff, sym), color: 'var(--income)' },
            ].map((c, i) => (
              <motion.div key={c.label} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08, duration: 0.35 }}
                className="rounded-xl p-3" style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}>
                <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text3)' }}>{c.label}</div>
                <div className="text-[18px] font-bold font-mono mt-0.5" style={{ color: c.color }}>{c.value}</div>
              </motion.div>
            ))}
          </div>
          <Takeaway>Half a percent looks small but costs you <strong style={{ color: 'var(--text)' }}>{abbr(erDiff, sym)}</strong> here. Prefer <strong style={{ color: 'var(--text)' }}>Direct</strong> plans and watch the expense ratio.</Takeaway>
        </div>
      ),
    },
    {
      id: 'tax',
      icon: Receipt,
      title: 'LTCG vs STCG tax (equity)',
      teaser: 'Hold for over a year to pay far less tax.',
      body: (
        <div className="space-y-3 text-[12.5px] leading-relaxed" style={{ color: 'var(--text2)' }}>
          <p>On equity funds, how long you hold changes your tax:</p>
          <div className="space-y-2">
            <div className="flex items-start gap-2"><span className="text-[9px] px-1.5 py-0.5 rounded font-semibold mt-0.5" style={{ background: '#D1FAE5', color: '#065F46' }}>LTCG</span><p><strong style={{ color: 'var(--text)' }}>Long-term</strong> (held over 1 year): just <strong style={{ color: 'var(--text)' }}>12.5%</strong>, and only on gains above <strong style={{ color: 'var(--text)' }}>{sym}1.25L</strong> each year.</p></div>
            <div className="flex items-start gap-2"><span className="text-[9px] px-1.5 py-0.5 rounded font-semibold mt-0.5" style={{ background: '#FEF3C7', color: '#92400E' }}>STCG</span><p><strong style={{ color: 'var(--text)' }}>Short-term</strong> (held under 1 year): a steeper <strong style={{ color: 'var(--text)' }}>20%</strong> on the whole gain.</p></div>
          </div>
          <div className="rounded-lg p-3" style={{ background: 'var(--sage-bg)' }}>
            <div className="text-[11px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--sage)' }}>{taxGainIsReal ? 'Your example' : 'Example'}</div>
            <p>On {taxGainIsReal ? <>your equity gain of <strong style={{ color: 'var(--text)' }}>{abbr(taxGain, sym)}</strong></> : <>a gain of <strong style={{ color: 'var(--text)' }}>{sym}2,00,000</strong></>}:</p>
            <div className="grid grid-cols-2 gap-2 mt-2">
              <div className="rounded-lg px-3 py-2" style={{ background: 'var(--card)' }}>
                <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#065F46' }}>If long-term</div>
                <div className="text-[16px] font-bold font-mono mt-0.5" style={{ color: 'var(--text)' }}>{abbr(ltcgTax, sym)}</div>
                <div className="text-[10px]" style={{ color: 'var(--text3)' }}>12.5% over {sym}1.25L</div>
              </div>
              <div className="rounded-lg px-3 py-2" style={{ background: 'var(--card)' }}>
                <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#92400E' }}>If short-term</div>
                <div className="text-[16px] font-bold font-mono mt-0.5" style={{ color: 'var(--text)' }}>{abbr(stcgTax, sym)}</div>
                <div className="text-[10px]" style={{ color: 'var(--text3)' }}>20% on full gain</div>
              </div>
            </div>
          </div>
          <Takeaway>Waiting past the 1-year mark would save roughly <strong style={{ color: 'var(--text)' }}>{abbr(Math.max(0, stcgTax - ltcgTax), sym)}</strong> in this example. Patience is rewarded.</Takeaway>
          <p className="text-[10px]" style={{ color: 'var(--text3)' }}>Indicative only, based on current equity rules — not tax advice.</p>
        </div>
      ),
    },
    {
      id: 'elss',
      icon: Lock,
      title: model.elss.length > 0 ? 'Your ELSS & the 3-year lock-in' : 'ELSS & the 80C tax break',
      teaser: model.elss.length > 0 ? `You hold ${model.elss.length} ELSS fund${model.elss.length === 1 ? '' : 's'}.` : 'Save tax under 80C with the shortest lock-in around.',
      body: (
        <div className="space-y-3 text-[12.5px] leading-relaxed" style={{ color: 'var(--text2)' }}>
          <p><strong style={{ color: 'var(--text)' }}>ELSS (Equity Linked Savings Scheme)</strong> funds let you claim up to <strong style={{ color: 'var(--text)' }}>{sym}1.5L</strong> under Section 80C (old tax regime). Each investment is locked for <strong style={{ color: 'var(--text)' }}>3 years</strong> — the shortest lock-in of any 80C option, while still giving equity-like growth.</p>
          {model.elss.length > 0 ? (
            <div className="rounded-lg p-3 space-y-1.5" style={{ background: 'var(--sage-bg)' }}>
              <div className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--sage)' }}>In your portfolio</div>
              {model.elss.map((r, i) => (
                <div key={i} className="flex items-center justify-between">
                  <span className="text-[12px] truncate pr-2" style={{ color: 'var(--text)' }}>{r.f.fund_name}</span>
                  <span className="text-[11px] font-mono flex-shrink-0" style={{ color: 'var(--text3)' }}>{abbr(r.current, sym)}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="px-3 py-2 rounded-lg text-[12px]" style={{ background: 'var(--bg2)', color: 'var(--text2)' }}>You don't hold an ELSS fund yet. If you're on the old tax regime, a small ELSS allocation can trim your tax bill while keeping you invested in equity.</p>
          )}
          <Takeaway>{model.elss.length > 0
            ? `Each ELSS lot frees up 3 years after its purchase — handy to know before you plan a withdrawal.`
            : `Consider ELSS for 80C: it locks money for only 3 years, far less than a 5-year FD or PPF.`}</Takeaway>
        </div>
      ),
    },
    {
      id: 'diversify',
      icon: PieIcon,
      title: 'Diversification',
      teaser: hasFunds ? `You span ${model.categories.length} asset type${model.categories.length === 1 ? '' : 's'}.` : "Don't put all your eggs in one basket.",
      body: (
        <div className="space-y-3 text-[12.5px] leading-relaxed" style={{ color: 'var(--text2)' }}>
          <p><strong style={{ color: 'var(--text)' }}>Diversification</strong> spreads money across different assets so one bad patch doesn't sink everything. The goal isn't owning <em>more</em> funds — it's owning <em>different</em> kinds.</p>
          {hasFunds && (
            <div className="flex flex-wrap gap-2">
              {model.categories.map(c => (
                <span key={c} className="text-[11px] font-semibold px-2.5 py-1 rounded-full" style={{ background: 'var(--bg2)', color: ASSET_COLOR[c as Asset], border: `1px solid ${ASSET_COLOR[c as Asset]}40` }}>{c}</span>
              ))}
            </div>
          )}
          <Takeaway>{hasFunds
            ? (model.categories.length >= 3
                ? `Holding ${model.categories.length} distinct asset types is well diversified — nicely done.`
                : model.categories.length === 2
                  ? `You're across ${model.categories.length} asset types — a third (e.g. some debt or gold) would steady things further.`
                  : `Everything sits in one asset type. Adding a different kind would cushion the bumps.`)
            : `Once you start, aim for a couple of asset types rather than many funds doing the same thing.`}</Takeaway>
        </div>
      ),
    },
  ]

  // ── expand state: open the first lesson by default ─────────────────────────
  const [open, setOpen] = useState<string | null>(lessons[0].id)

  return (
    <div className="space-y-5 max-w-3xl">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
        className="wl-card p-6" style={{ borderLeft: '3px solid var(--sage)' }}>
        <div className="flex items-center gap-2.5 mb-1">
          <GraduationCap size={20} style={{ color: 'var(--sage)' }} />
          <h1 className="text-[18px] font-bold" style={{ color: 'var(--text)' }}>Learn — personalized to your portfolio</h1>
        </div>
        <p className="text-[13px]" style={{ color: 'var(--text2)' }}>
          {hasFunds
            ? <>Bite-size lessons on mutual fund investing, woven around the {model.rows.length} fund{model.rows.length === 1 ? '' : 's'} you actually hold ({abbr(model.totalCurrent, sym)} today). Tap any card to expand.</>
            : <>Bite-size lessons on mutual fund investing. Add or import your funds to see every lesson tailored to your real money — meanwhile, explore with sample numbers below.</>}
        </p>
      </motion.div>

      {/* Empty-state nudge */}
      {!hasFunds && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1, duration: 0.35 }}
          className="wl-card p-5 flex items-start gap-3" style={{ background: 'var(--sage-bg)' }}>
          <Sparkles size={18} style={{ color: 'var(--sage)', flexShrink: 0, marginTop: 2 }} />
          <div>
            <div className="text-[13px] font-bold" style={{ color: 'var(--text)' }}>No funds yet — that's the perfect place to start</div>
            <p className="text-[12px] mt-0.5" style={{ color: 'var(--text2)' }}>Head to the Mutual Funds section to add a holding or import a CAMS statement. Every lesson here will then use your own NAVs, SIPs and gains.</p>
          </div>
        </motion.div>
      )}

      {/* Lesson cards */}
      <div className="space-y-3">
        {lessons.map((lesson, i) => {
          const Icon = lesson.icon
          const isOpen = open === lesson.id
          return (
            <motion.div key={lesson.id}
              initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 + i * 0.06, duration: 0.4 }}
              className="wl-card overflow-hidden" style={isOpen ? { borderColor: 'var(--sage)' } : undefined}>
              <button onClick={() => setOpen(isOpen ? null : lesson.id)}
                className="w-full flex items-center gap-3 p-4 text-left transition-colors">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'var(--sage-bg)' }}>
                  <Icon size={17} style={{ color: 'var(--sage)' }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold" style={{ color: 'var(--text3)' }}>{String(i + 1).padStart(2, '0')}</span>
                    <span className="text-[14px] font-bold truncate" style={{ color: 'var(--text)' }}>{lesson.title}</span>
                  </div>
                  <div className="text-[11.5px] truncate" style={{ color: 'var(--text3)' }}>{lesson.teaser}</div>
                </div>
                <motion.div animate={{ rotate: isOpen ? 180 : 0 }} transition={{ duration: 0.25 }} className="flex-shrink-0">
                  <ChevronDown size={18} style={{ color: 'var(--text3)' }} />
                </motion.div>
              </button>
              <AnimatePresence initial={false}>
                {isOpen && (
                  <motion.div key="content"
                    initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.3, ease: 'easeInOut' }} style={{ overflow: 'hidden' }}>
                    <div className="px-4 pb-4 pt-1 border-t" style={{ borderColor: 'var(--border)' }}>
                      <div className="pt-3">{lesson.body}</div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )
        })}
      </div>

      <div className="text-[11px] text-center pb-2" style={{ color: 'var(--text3)' }}>
        Educational content only — figures are illustrative and not investment or tax advice.
      </div>
    </div>
  )
}

// ── small presentational helper ─────────────────────────────────────────────
function Takeaway({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-lg p-3 mt-1" style={{ background: 'var(--bg2)', borderLeft: '3px solid var(--gold)' }}>
      <Lightbulb size={15} style={{ color: 'var(--gold)', flexShrink: 0, marginTop: 1 }} />
      <div>
        <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--gold)' }}>Your takeaway</div>
        <p className="text-[12px] mt-0.5" style={{ color: 'var(--text2)' }}>{children}</p>
      </div>
    </div>
  )
}
