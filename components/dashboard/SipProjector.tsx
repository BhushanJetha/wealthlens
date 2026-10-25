'use client'
import { useMemo, useState } from 'react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import { motion } from 'framer-motion'
import { Sparkles, TrendingUp, TrendingDown } from 'lucide-react'
import { Segmented } from '@/components/ui/kit'

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

const SC = { current: '#6A55E8', step5: '#3B8EF0', step10: '#2FB67C', invested: '#94A3B8', swp: '#EC5B8C' }
const TINT = { current: { bg: '#F1EEFF', bd: '#E1DAFF' }, step5: { bg: '#E7F1FE', bd: '#CDE0F8' }, step10: { bg: '#E7F7EF', bd: '#CBEBDA' } }

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

  const ctrlInput = "wl-input text-[14px] tabular-nums"
  const Label = ({ children }: { children: React.ReactNode }) => <label className="block text-[12px] font-medium mb-1" style={{ color: 'var(--text3)' }}>{children}</label>
  const Row = ({ i, children }: { i: number; children: React.ReactNode }) => (
    <div className="flex items-center gap-3 px-4 py-2.5" style={{ borderTop: i ? '1px solid var(--track)' : undefined }}>{children}</div>
  )
  const Chart = ({ children, title }: { children: React.ReactNode; title: string }) => (
    <div className="rounded-2xl px-3 pt-3 pb-1" style={{ background: '#fff', border: '1px solid var(--line)' }}>
      <div className="text-[13px] font-semibold mb-1.5 px-1" style={{ color: 'var(--text)' }}>{title}</div>
      {children}
    </div>
  )
  const tip = { background: '#fff', border: '1px solid var(--line)', borderRadius: 10, fontSize: 12, padding: '6px 10px' }

  return (
    <div className="flex flex-col gap-3.5">
      {subtitle && <div className="text-[12px]" style={{ color: 'var(--text3)' }}>{subtitle}</div>}

      {/* Where the projection starts (it grows FROM your current corpus, not 0) */}
      <div className="grid grid-cols-3 gap-2 rounded-xl px-3 py-2.5" style={{ background: 'var(--accent-bg)', border: '1px solid var(--accent-border)' }}>
        {[['Today', abbr(currentValue, sym)], ['Monthly SIP', sip > 0 ? `${sym}${sip.toLocaleString('en-IN')}` : 'None'], ['Return', `${rate}% a yr`]].map(([l, v]) => (
          <div key={l} className="min-w-0">
            <div className="text-[11px]" style={{ color: 'var(--accent2)' }}>{l}</div>
            <div className="text-[13.5px] font-semibold tabular-nums truncate" style={{ color: 'var(--text)' }}>{v}</div>
          </div>
        ))}
      </div>

      <Segmented label="Projection mode" violet value={mode} onChange={setMode}
        options={[{ value: 'grow', label: <span className="inline-flex items-center gap-1.5"><TrendingUp size={13} />Grow corpus</span> }, { value: 'swp', label: <span className="inline-flex items-center gap-1.5"><TrendingDown size={13} />Withdraw (SWP)</span> }]} />

      {mode === 'grow' ? (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Monthly SIP ({sym.trim()})</Label>
              <input type="number" inputMode="numeric" value={sip} onChange={e => setSip(Math.max(0, Number(e.target.value)))} className={`${ctrlInput} w-full`} style={{ background: '#fff' }} />
            </div>
            <div>
              <Label>Expected return % a year</Label>
              <input type="number" inputMode="decimal" value={rate} step={0.5} onChange={e => setRate(Number(e.target.value))} className={`${ctrlInput} w-full`} style={{ background: '#fff' }} />
            </div>
          </div>
          <div>
            <Label>Horizon</Label>
            <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
              {HORIZONS.map(h => (
                <button key={h} onClick={() => setHorizon(h)} aria-pressed={horizon === h} className="wl-chip flex-1 justify-center" style={{ height: 32 }}>{h} yrs</button>
              ))}
            </div>
          </div>
          <label className="flex items-center gap-2 text-[12.5px] font-medium cursor-pointer" style={{ color: 'var(--text2)' }}>
            <input type="checkbox" checked={inflation} onChange={e => setInflation(e.target.checked)} style={{ accentColor: 'var(--accent)' }} />
            Show in today&apos;s money (adjust for {inflRate}% inflation)
          </label>

          {/* Scenario tiles */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            {scenarios.map((s, i) => {
              const shown = inflation ? defl(s.value, horizon) : s.value
              const gain = shown - (inflation ? defl(sel.invested, horizon) : sel.invested)
              return (
                <motion.div key={s.key} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06, duration: 0.3 }}
                  className="rounded-2xl px-4 py-3" style={{ background: TINT[s.key].bg, border: `1px solid ${TINT[s.key].bd}` }}>
                  <div className="flex items-center gap-1.5 text-[12px] font-semibold" style={{ color: '#475569' }}>
                    <i className="w-2 h-2 rounded-full" style={{ background: s.color }} />{s.label}{s.key !== 'current' && <Sparkles size={11} style={{ color: s.color }} />}
                  </div>
                  <div className="text-[22px] font-bold tabular-nums leading-tight mt-1" style={{ color: 'var(--text)' }}>{abbr(shown, sym)}</div>
                  <div className="text-[11.5px] mt-0.5" style={{ color: 'var(--text3)' }}>
                    in {horizon} years{inflation ? " (today's money)" : ''} · <span style={{ color: '#16A34A' }}>+{abbr(gain, sym)}</span>
                  </div>
                </motion.div>
              )
            })}
          </div>

          <Chart title={`Projected corpus${inflation ? " (today's money)" : ''}`}>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={chartData} margin={{ top: 5, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  {(['current', 'step5', 'step10'] as const).map(k => (
                    <linearGradient key={k} id={`g-${k}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={SC[k]} stopOpacity={0.22} /><stop offset="100%" stopColor={SC[k]} stopOpacity={0} />
                    </linearGradient>
                  ))}
                </defs>
                <CartesianGrid stroke="var(--track)" vertical={false} />
                <XAxis dataKey="year" tickFormatter={(v: number) => `${v}y`} tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={(v: number) => abbr(v, sym).replace(' ', '')} tick={{ fontSize: 10, fill: '#94A3B8' }} width={52} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={tip} formatter={(v: any, n: any) => [abbr(Number(v), sym), n === 'current' ? 'Current SIP' : n === 'step5' ? 'Step-up 5%' : n === 'step10' ? 'Step-up 10%' : 'Invested']} labelFormatter={(l: any) => `Year ${l}`} />
                <Area type="monotone" dataKey="step10" stroke={SC.step10} strokeWidth={2} fill="url(#g-step10)" isAnimationActive={false} />
                <Area type="monotone" dataKey="step5" stroke={SC.step5} strokeWidth={2} fill="url(#g-step5)" isAnimationActive={false} />
                <Area type="monotone" dataKey="current" stroke={SC.current} strokeWidth={2.5} fill="url(#g-current)" isAnimationActive={false} />
                <Area type="monotone" dataKey="invested" stroke={SC.invested} strokeWidth={1.5} strokeDasharray="4 4" fill="none" isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </Chart>

          {/* Year by year */}
          <div className="rounded-2xl overflow-hidden" style={{ background: '#fff', border: '1px solid var(--line)' }}>
            <div className="px-4 py-2.5 text-[13px] font-semibold" style={{ color: 'var(--text)', borderBottom: '1px solid var(--line)' }}>Year by year</div>
            {HORIZONS.map((h, i) => {
              const rr = row(h)
              const v = (x: number) => abbr(inflation ? defl(x, h) : x, sym)
              return (
                <Row key={h} i={i}>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-semibold" style={{ color: 'var(--text)' }}>After {h} years</div>
                    <div className="text-[11.5px] truncate" style={{ color: 'var(--text3)' }}>put in {v(rr.invested)} · step-up 5% {v(rr.step5)} · 10% {v(rr.step10)}</div>
                  </div>
                  <div className="text-[14px] font-bold tabular-nums flex-shrink-0" style={{ color: SC.current }}>{v(rr.current)}</div>
                </Row>
              )
            })}
          </div>

          <p className="text-[11.5px] leading-snug" style={{ color: 'var(--text4)' }}>
            Estimates only: a steady {rate}% a year on your {abbr(currentValue, sym)} today. Step-up raises the monthly SIP once a year{inflation ? '; values are in today’s money' : ''}. Real returns go up and down.
          </p>
        </>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2.5">
            <div>
              <Label>Corpus ({sym.trim()})</Label>
              <input type="number" inputMode="numeric" value={swpCorpus} onChange={e => setSwpCorpus(Math.max(0, Number(e.target.value)))} className={`${ctrlInput} w-full`} style={{ background: '#fff' }} />
            </div>
            <div>
              <Label>Take out / month</Label>
              <input type="number" inputMode="numeric" value={swpWithdraw} onChange={e => setSwpWithdraw(Math.max(0, Number(e.target.value)))} className={`${ctrlInput} w-full`} style={{ background: '#fff' }} />
            </div>
            <div>
              <Label>Return % a year</Label>
              <input type="number" inputMode="decimal" value={rate} step={0.5} onChange={e => setRate(Number(e.target.value))} className={`${ctrlInput} w-full`} style={{ background: '#fff' }} />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            {[
              { label: 'This withdrawal lasts', value: lastsLabel.replace(' ✓', ''), color: lastMonths === Infinity ? '#16A34A' : 'var(--text)', note: '', ...TINT.current },
              { label: 'Safe forever, per month', value: abbr(safeForever, sym), color: 'var(--text)', note: 'takes out only the growth', ...TINT.step10 },
              { label: 'Lasts 20 years, per month', value: abbr(for20y, sym), color: 'var(--text)', note: 'uses up the corpus', ...TINT.step5 },
            ].map(c => (
              <div key={c.label} className="rounded-2xl px-4 py-3" style={{ background: c.bg, border: `1px solid ${c.bd}` }}>
                <div className="text-[12px] font-semibold" style={{ color: '#475569' }}>{c.label}</div>
                <div className="text-[22px] font-bold tabular-nums mt-0.5" style={{ color: c.color }}>{c.value}</div>
                {c.note && <div className="text-[11.5px]" style={{ color: 'var(--text3)' }}>{c.note}</div>}
              </div>
            ))}
          </div>

          <Chart title={`Corpus while taking out ${sym}${swpWithdraw.toLocaleString('en-IN')} a month`}>
            <ResponsiveContainer width="100%" height={210}>
              <AreaChart data={swpSeries} margin={{ top: 5, right: 8, left: 0, bottom: 0 }}>
                <defs><linearGradient id="g-swp" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={SC.swp} stopOpacity={0.22} /><stop offset="100%" stopColor={SC.swp} stopOpacity={0} /></linearGradient></defs>
                <CartesianGrid stroke="var(--track)" vertical={false} />
                <XAxis dataKey="year" tickFormatter={(v: number) => `${v}y`} tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={(v: number) => abbr(v, sym).replace(' ', '')} tick={{ fontSize: 10, fill: '#94A3B8' }} width={52} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={tip} formatter={(v: any) => [abbr(Number(v), sym), 'Corpus']} labelFormatter={(l: any) => `Year ${l}`} />
                <Area type="monotone" dataKey="value" stroke={SC.swp} strokeWidth={2.5} fill="url(#g-swp)" isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </Chart>

          <p className="text-[11.5px] leading-snug" style={{ color: 'var(--text4)' }}>
            SWP is a systematic withdrawal plan. Take out at most {abbr(safeForever, sym)} a month and the corpus keeps growing; more than that and it slowly runs down. Assumes a steady {rate}% a year.
          </p>
        </>
      )}
    </div>
  )
}
