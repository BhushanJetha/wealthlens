'use client'
import { useMemo, useState } from 'react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import { motion } from 'framer-motion'
import { Sparkles, TrendingUp, TrendingDown } from 'lucide-react'

interface Props {
  currentValue: number      // corpus you already hold
  monthlySip:   number      // current monthly SIP
  annualRate:   number      // expected annual return %
  currency?:    string
  subtitle?:    string
}

const HORIZONS = [2, 3, 5, 10, 20]

function abbr(n: number, sym: string) {
  const a = Math.abs(n)
  if (a >= 1e7) return `${sym}${(n / 1e7).toFixed(2)} Cr`
  if (a >= 1e5) return `${sym}${(n / 1e5).toFixed(2)} L`
  if (a >= 1e3) return `${sym}${(n / 1e3).toFixed(1)}K`
  return `${sym}${Math.round(n).toLocaleString('en-IN')}`
}

// Accumulation: month-by-month compounding; SIP steps up by stepPct each year.
function project(currentValue: number, sip0: number, ratePct: number, years: number, stepPct: number) {
  const r = ratePct / 100 / 12
  const months = years * 12
  let corpus = currentValue, sip = sip0, invested = currentValue
  const pts = [{ year: 0, value: Math.round(currentValue), invested: Math.round(invested) }]
  for (let m = 1; m <= months; m++) {
    corpus = corpus * (1 + r) + sip
    invested += sip
    if (m % 12 === 0) { pts.push({ year: m / 12, value: Math.round(corpus), invested: Math.round(invested) }); sip = sip * (1 + stepPct / 100) }
  }
  return pts
}

const SC = { current: '#3D7A58', step5: '#2563EB', step10: '#7C3AED', invested: '#9CA3AF', swp: '#C026D3' }

export default function SipProjector({ currentValue, monthlySip, annualRate, currency = 'INR', subtitle }: Props) {
  const sym = currency === 'AED' ? 'AED ' : '₹'
  const [mode, setMode] = useState<'grow' | 'swp'>('grow')
  const [sip, setSip]   = useState(Math.max(0, Math.round(monthlySip)))
  const [rate, setRate] = useState(Math.round(annualRate * 10) / 10)
  const [horizon, setHorizon] = useState(10)
  const [inflation, setInflation] = useState(false)
  const inflRate = 6

  // SWP state
  const [swpCorpus, setSwpCorpus]     = useState(Math.max(0, Math.round(currentValue)))
  const [swpWithdraw, setSwpWithdraw] = useState(Math.max(1000, Math.round(currentValue * 0.005)))  // ~0.5%/mo default

  const r = rate / 100 / 12
  const defl = (val: number, years: number) => inflation ? val / Math.pow(1 + inflRate / 100, years) : val

  // ── Accumulation series ────────────────────────────────────────────────
  const data = useMemo(() => {
    const flat = project(currentValue, sip, rate, 20, 0)
    const s5   = project(currentValue, sip, rate, 20, 5)
    const s10  = project(currentValue, sip, rate, 20, 10)
    return flat.map((p, i) => ({ year: p.year, invested: p.invested, current: p.value, step5: s5[i].value, step10: s10[i].value }))
  }, [currentValue, sip, rate])

  const chartData = useMemo(() => inflation
    ? data.map(d => ({ ...d, current: Math.round(defl(d.current, d.year)), step5: Math.round(defl(d.step5, d.year)), step10: Math.round(defl(d.step10, d.year)) }))
    : data, [data, inflation])

  const row = (yrs: number) => data.find(d => d.year === yrs) ?? { current: 0, step5: 0, step10: 0, invested: 0 }
  const sel = row(horizon)

  const scenarios = [
    { key: 'current' as const, label: 'Current SIP',   color: SC.current, value: sel.current },
    { key: 'step5'   as const, label: 'Step-up 5%/yr',  color: SC.step5,   value: sel.step5 },
    { key: 'step10'  as const, label: 'Step-up 10%/yr', color: SC.step10,  value: sel.step10 },
  ]

  // ── SWP calcs ──────────────────────────────────────────────────────────
  const monthsLast = (C: number, W: number): number => {
    if (r <= 0) return W > 0 ? C / W : Infinity
    if (W <= C * r) return Infinity                       // withdrawals ≤ growth → never depletes
    return Math.log(W / (W - C * r)) / Math.log(1 + r)
  }
  const sustainable = (C: number, years: number): number => {  // monthly withdrawal that lasts exactly `years`
    const n = years * 12
    if (r <= 0) return C / n
    return C * r * Math.pow(1 + r, n) / (Math.pow(1 + r, n) - 1)
  }
  const lastMonths = monthsLast(swpCorpus, swpWithdraw)
  const lastsLabel = lastMonths === Infinity ? 'Forever ✓'
    : `${Math.floor(lastMonths / 12)}y ${Math.round(lastMonths % 12)}m`
  const safeForever = swpCorpus * r                                   // interest-only monthly
  const for20y      = sustainable(swpCorpus, 20)

  const swpSeries = useMemo(() => {
    const pts: { year: number; value: number }[] = [{ year: 0, value: swpCorpus }]
    let c = swpCorpus
    for (let m = 1; m <= 30 * 12 && c > 0; m++) {
      c = c * (1 + r) - swpWithdraw
      if (m % 12 === 0) pts.push({ year: m / 12, value: Math.round(Math.max(0, c)) })
    }
    return pts
  }, [swpCorpus, swpWithdraw, r])

  const ctrlInput = "wl-input text-[13px] font-mono"

  return (
    <div className="space-y-4">
      {subtitle && <div className="text-[11px]" style={{ color: 'var(--text3)' }}>{subtitle}</div>}

      {/* Make the starting point explicit (projection grows FROM your current corpus, not 0) */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] px-3 py-2 rounded-lg" style={{ background: 'var(--sage-bg)', color: 'var(--text2)' }}>
        <span>Starting corpus today: <strong style={{ color: 'var(--text)' }}>{abbr(currentValue, sym)}</strong></span>
        <span>Monthly SIP: <strong style={{ color: 'var(--text)' }}>{sip > 0 ? `${sym}${sip.toLocaleString('en-IN')}` : 'none — enter below'}</strong></span>
        <span>Expected return: <strong style={{ color: 'var(--text)' }}>{rate}%/yr</strong></span>
      </div>

      {/* Mode toggle */}
      <div className="flex gap-1 p-1 rounded-xl w-fit wl-tabs" style={{ background: 'var(--bg2)' }}>
        {([['grow', 'Grow corpus', TrendingUp], ['swp', 'Withdraw (SWP)', TrendingDown]] as const).map(([k, label, Icon]) => (
          <button key={k} onClick={() => setMode(k)}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-[12px] font-semibold transition-all"
            style={mode === k ? { background: 'var(--card)', color: 'var(--sage)', boxShadow: '0 1px 4px rgba(0,0,0,0.1)' } : { color: 'var(--text3)' }}>
            <Icon size={13} /> {label}
          </button>
        ))}
      </div>

      {mode === 'grow' ? (
        <>
          {/* Controls */}
          <div className="flex flex-wrap gap-4 items-end">
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--text3)' }}>Monthly SIP</label>
              <div className="flex items-center gap-1"><span className="text-[13px]" style={{ color: 'var(--text3)' }}>{sym}</span>
                <input type="number" value={sip} onChange={e => setSip(Math.max(0, Number(e.target.value)))} className={`${ctrlInput} w-28`} style={{ background: 'var(--bg2)' }} /></div>
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--text3)' }}>Expected return %/yr</label>
              <input type="number" value={rate} step={0.5} onChange={e => setRate(Number(e.target.value))} className={`${ctrlInput} w-24`} style={{ background: 'var(--bg2)' }} />
            </div>
            <div className="flex-1 min-w-[160px]">
              <label className="block text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--text3)' }}>Horizon — {horizon} years</label>
              <div className="flex gap-1">
                {HORIZONS.map(h => (
                  <button key={h} onClick={() => setHorizon(h)} className="flex-1 py-1.5 rounded-lg text-[11px] font-semibold transition-all"
                    style={horizon === h ? { background: 'var(--sage)', color: '#fff' } : { background: 'var(--bg2)', color: 'var(--text3)', border: '1px solid var(--border)' }}>{h}y</button>
                ))}
              </div>
            </div>
            <label className="flex items-center gap-1.5 text-[11px] font-semibold cursor-pointer" style={{ color: 'var(--text2)' }}>
              <input type="checkbox" checked={inflation} onChange={e => setInflation(e.target.checked)} style={{ accentColor: 'var(--sage)' }} />
              Adjust for inflation ({inflRate}%)
            </label>
          </div>

          {/* Scenario cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {scenarios.map((s, i) => {
              const shown = inflation ? defl(s.value, horizon) : s.value
              const gain = shown - (inflation ? defl(sel.invested, horizon) : sel.invested)
              return (
                <motion.div key={s.key} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08, duration: 0.35 }}
                  className="rounded-xl p-4" style={{ background: 'var(--bg2)', border: `1px solid ${s.color}40`, borderTop: `3px solid ${s.color}` }}>
                  <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: s.color }}>
                    {s.key !== 'current' && <Sparkles size={11} />}{s.label}
                  </div>
                  <div className="text-[24px] font-bold font-mono leading-tight" style={{ color: s.color }}>{abbr(shown, sym)}</div>
                  <div className="text-[10px] mt-1" style={{ color: 'var(--text3)' }}>
                    in {horizon}y{inflation ? " (today's money)" : ''} · <span style={{ color: 'var(--income)' }}>+{abbr(gain, sym)} growth</span>
                  </div>
                </motion.div>
              )
            })}
          </div>

          {/* Growth chart */}
          <div className="rounded-xl p-3" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
            <div className="flex items-center gap-2 mb-2 px-1">
              <TrendingUp size={13} style={{ color: 'var(--sage)' }} />
              <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--text3)' }}>Projected corpus{inflation ? " (today's money)" : ''}</span>
            </div>
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  {(['current', 'step5', 'step10'] as const).map(k => (
                    <linearGradient key={k} id={`g-${k}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={SC[k]} stopOpacity={0.3} /><stop offset="100%" stopColor={SC[k]} stopOpacity={0.02} />
                    </linearGradient>
                  ))}
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="year" tickFormatter={(v: number) => `${v}y`} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={(v: number) => abbr(v, sym)} tick={{ fontSize: 9 }} width={52} axisLine={false} tickLine={false} />
                <Tooltip formatter={(v: any, n: any) => [abbr(Number(v), sym), n === 'current' ? 'Current SIP' : n === 'step5' ? '+5%/yr' : n === 'step10' ? '+10%/yr' : 'Invested']} labelFormatter={(l: any) => `Year ${l}`} />
                <Area type="monotone" dataKey="step10" stroke={SC.step10} strokeWidth={2} fill="url(#g-step10)" />
                <Area type="monotone" dataKey="step5" stroke={SC.step5} strokeWidth={2} fill="url(#g-step5)" />
                <Area type="monotone" dataKey="current" stroke={SC.current} strokeWidth={2.5} fill="url(#g-current)" />
                <Area type="monotone" dataKey="invested" stroke={SC.invested} strokeWidth={1} strokeDasharray="4 4" fill="none" />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Horizon table */}
          <div className="overflow-x-auto rounded-xl border" style={{ borderColor: 'var(--border)' }}>
            <table className="w-full text-[11px]" style={{ borderCollapse: 'collapse' }}>
              <thead><tr style={{ background: 'var(--bg2)' }}>
                {['After', 'Invested', 'Current SIP', 'Step-up 5%/yr', 'Step-up 10%/yr'].map(h => (
                  <th key={h} className="px-3 py-2 text-right first:text-left" style={{ color: 'var(--text3)', fontSize: 10, textTransform: 'uppercase', fontWeight: 700 }}>{h}</th>
                ))}</tr></thead>
              <tbody>
                {HORIZONS.map(h => {
                  const rr = row(h)
                  return (
                    <tr key={h} style={{ borderTop: '1px solid var(--border)' }}>
                      <td className="px-3 py-2 font-bold" style={{ color: 'var(--text)' }}>{h} years</td>
                      <td className="px-3 py-2 text-right font-mono" style={{ color: 'var(--text3)' }}>{abbr(inflation ? defl(rr.invested, h) : rr.invested, sym)}</td>
                      <td className="px-3 py-2 text-right font-mono font-semibold" style={{ color: SC.current }}>{abbr(inflation ? defl(rr.current, h) : rr.current, sym)}</td>
                      <td className="px-3 py-2 text-right font-mono font-semibold" style={{ color: SC.step5 }}>{abbr(inflation ? defl(rr.step5, h) : rr.step5, sym)}</td>
                      <td className="px-3 py-2 text-right font-mono font-semibold" style={{ color: SC.step10 }}>{abbr(inflation ? defl(rr.step10, h) : rr.step10, sym)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="text-[10px]" style={{ color: 'var(--text3)' }}>
            Estimates only — assumes a steady {rate}% annual return on your current corpus of {abbr(currentValue, sym)}. Step-up raises the monthly SIP once a year{inflation ? '; values shown in today’s purchasing power' : ''}. Actual returns vary with the market.
          </div>
        </>
      ) : (
        /* ── SWP (withdrawal) ─────────────────────────────────────────────── */
        <>
          <div className="flex flex-wrap gap-4 items-end">
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--text3)' }}>Corpus</label>
              <div className="flex items-center gap-1"><span className="text-[13px]" style={{ color: 'var(--text3)' }}>{sym}</span>
                <input type="number" value={swpCorpus} onChange={e => setSwpCorpus(Math.max(0, Number(e.target.value)))} className={`${ctrlInput} w-32`} style={{ background: 'var(--bg2)' }} /></div>
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--text3)' }}>Withdraw / month</label>
              <div className="flex items-center gap-1"><span className="text-[13px]" style={{ color: 'var(--text3)' }}>{sym}</span>
                <input type="number" value={swpWithdraw} onChange={e => setSwpWithdraw(Math.max(0, Number(e.target.value)))} className={`${ctrlInput} w-28`} style={{ background: 'var(--bg2)' }} /></div>
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--text3)' }}>Return %/yr</label>
              <input type="number" value={rate} step={0.5} onChange={e => setRate(Number(e.target.value))} className={`${ctrlInput} w-20`} style={{ background: 'var(--bg2)' }} />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              { label: 'This withdrawal lasts', value: lastsLabel, color: lastMonths === Infinity ? 'var(--income)' : 'var(--text)' },
              { label: 'Safe forever (₹/mo)',   value: abbr(safeForever, sym), color: 'var(--income)', note: 'withdraw only the growth' },
              { label: 'For 20 yrs (₹/mo)',     value: abbr(for20y, sym), color: SC.step5, note: 'fully uses the corpus' },
            ].map(c => (
              <div key={c.label} className="rounded-xl p-4" style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}>
                <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text3)' }}>{c.label}</div>
                <div className="text-[22px] font-bold font-mono mt-0.5" style={{ color: c.color }}>{c.value}</div>
                {c.note && <div className="text-[10px] mt-0.5" style={{ color: 'var(--text3)' }}>{c.note}</div>}
              </div>
            ))}
          </div>

          <div className="rounded-xl p-3" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
            <div className="text-[11px] font-bold uppercase tracking-wider mb-2 px-1" style={{ color: 'var(--text3)' }}>Corpus while withdrawing {sym}{swpWithdraw.toLocaleString('en-IN')}/mo</div>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={swpSeries} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <defs><linearGradient id="g-swp" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={SC.swp} stopOpacity={0.3} /><stop offset="100%" stopColor={SC.swp} stopOpacity={0.02} /></linearGradient></defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="year" tickFormatter={(v: number) => `${v}y`} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={(v: number) => abbr(v, sym)} tick={{ fontSize: 9 }} width={52} axisLine={false} tickLine={false} />
                <Tooltip formatter={(v: any) => [abbr(Number(v), sym), 'Corpus']} labelFormatter={(l: any) => `Year ${l}`} />
                <Area type="monotone" dataKey="value" stroke={SC.swp} strokeWidth={2.5} fill="url(#g-swp)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="text-[10px]" style={{ color: 'var(--text3)' }}>
            SWP = Systematic Withdrawal Plan. If you withdraw at most <strong>{abbr(safeForever, sym)}/mo</strong> the corpus keeps growing; beyond that it slowly depletes. Assumes a steady {rate}% return — actual market returns vary.
          </div>
        </>
      )}
    </div>
  )
}
