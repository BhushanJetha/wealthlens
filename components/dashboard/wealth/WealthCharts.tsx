'use client'
// Wealth › Overview: what net worth is made of, month by month — what you own
// stacked above zero by kind (property, investments, cash, gold) when the
// split is known, loans below zero, and net worth drawn through it.
import { useState } from 'react'
import { smoothPath, smoothBack, niceStep } from '@/lib/homeTrends'
import { pctChange } from '@/lib/period'
import { useHover, chg, Tooltip, LegendChip, Axis, Labels, Dot, Card, type Pt } from '../charts/parts'

export interface OwnLayer { key: string; label: string; color: string; values: (number | null)[] }

// Months before tracking have no figure: start at the first, bridge gaps between
function bridge(arr: (number | null)[]): (number | null)[] {
  const out = [...arr], n = arr.length
  for (let i = 0; i < n; i++) if (out[i] == null) {
    let p = i - 1; while (p >= 0 && out[p] == null) p--
    const q = arr.findIndex((x, k) => k > i && x != null)
    if (p >= 0 && q >= 0) out[i] = (out[p] as number) + ((arr[q] as number) - (out[p] as number)) * (i - p) / (q - p)
  }
  return out
}

export function NetWorthStack({ pts, layers, loans, nw, short, money, sub, foot }: {
  pts: Pt[]; layers: OwnLayer[]; loans: number[]; nw: (number | null)[]
  short: (n: number) => string; money: (n: number) => string; sub: string; foot?: React.ReactNode
}) {
  const [off, setOff] = useState<Record<string, boolean>>({})
  const hv = useHover()
  const n = pts.length, H = 290, X = (i: number) => (n > 1 ? i / (n - 1) * 1000 : 500)
  const L = layers.map(l => ({ ...l, values: bridge(l.values) })), NW = bridge(nw), LN = loans
  const shown = L.filter(l => !off[l.key])
  const has = (i: number) => L.some(l => l.values[i] != null)
  const tops: (number | null)[][] = []
  let acc: (number | null)[] = pts.map((_, i) => (has(i) ? 0 : null))
  for (const l of shown) { acc = acc.map((x, i) => (x == null ? null : x + (l.values[i] ?? 0))); tops.push(acc) }
  const onNw = !off.nw, onLn = !off.ln
  const vals = (arr: (number | null)[]) => arr.filter((x): x is number => x != null)
  const topR = Math.max(1, ...vals(acc), ...(onNw ? vals(NW) : [])), botR = onLn ? Math.max(0, ...LN) : 0
  const step = niceStep((topR + botR) / 5), top = Math.ceil(topR / step) * step, bot = Math.ceil(botR / step) * step, all = top + bot || 1
  const zero = 12 + 268 * top / all, Y = (x: number) => zero - x / all * 268
  const seg = (arr: (number | null)[]) => arr.map((x, i) => (x == null ? null : { x: X(i), y: Y(x) })).filter(Boolean) as { x: number; y: number }[]
  const k0 = acc.findIndex(x => x != null)
  const zeros = (from: number) => Array.from({ length: Math.max(0, n - from) }, (_, k) => ({ x: X(from + k), y: zero }))
  const ticks: { y: number; label: string; zero: boolean }[] = []
  for (let t = -bot; t <= top + 1; t += step) ticks.push({ y: Y(t), label: Math.abs(t) < 1 ? '0' : `${t < 0 ? '−' : ''}${short(Math.abs(t))}`, zero: Math.abs(t) < 1 })
  const last = (arr: (number | null)[]) => [...arr].reverse().find(x => x != null) ?? null
  const first = (arr: (number | null)[]) => arr.find(x => x != null) ?? null
  const since = (arr: (number | null)[], upGood: boolean) => { const f = first(arr), l = last(arr); if (f == null || l == null || !f) return undefined; const d = pctChange(l, f); return { t: `${d >= 0 ? '▲' : '▼'}${Math.abs(d).toFixed(0)}%`, good: (d >= 0) === upGood } }
  const h = hv.h != null && hv.h < n ? hv.h : null
  const nwLast = (() => { for (let i = n - 1; i >= 0; i--) if (NW[i] != null) return i; return -1 })()
  const tg = (k: string) => () => setOff(o => ({ ...o, [k]: !o[k] }))
  return (
    <Card title="What your net worth is made of" sub={sub}>
      <div role="group" aria-label="Shown on the chart" className="flex flex-wrap gap-1.5">
        <LegendChip on={onNw} toggle={tg('nw')} label="Net worth" total={last(NW) != null ? short(last(NW)!) : '—'} change={since(NW, true)} swatch={{ width: 16, height: 3, borderRadius: 2, background: '#14172B' }} />
        {L.map(l => <LegendChip key={l.key} on={!off[l.key]} toggle={tg(l.key)} label={l.label} total={last(l.values) != null ? short(last(l.values)!) : '—'} change={since(l.values, true)} swatch={{ width: 12, height: 10, borderRadius: 3, background: l.color }} />)}
        <LegendChip on={onLn} toggle={tg('ln')} label="Loans" total={short(LN[n - 1] ?? 0)} change={since(LN, false)} swatch={{ width: 12, height: 10, borderRadius: 3, background: '#DC2626', opacity: 0.6 }} />
      </div>
      {k0 < 0 && <p className="text-[12px] rounded-lg px-3 py-2" style={{ background: '#FAFAFE', color: 'var(--text3)' }}>What you own is saved each day you open WealthLens, so its history starts from your first visits. Loans are shown from their payments.</p>}
      <div ref={hv.ref} onPointerMove={hv.move(n)} onPointerDown={hv.move(n)} onPointerLeave={hv.leave} className="relative ml-[52px] touch-pan-y" style={{ height: H }}>
        <Axis ticks={ticks} />
        <svg viewBox={`0 0 1000 ${H}`} preserveAspectRatio="none" className="absolute inset-0 w-full" style={{ height: H }} role="img"
          aria-label={`Net worth ${first(NW) != null ? short(first(NW)!) : '—'} to ${last(NW) != null ? short(last(NW)!) : '—'}; ${shown.map(l => `${l.label} ${last(l.values) != null ? short(last(l.values)!) : '—'}`).join(', ')}; loans ${short(LN[n - 1] ?? 0)}`}>
          <defs><linearGradient id="wnLoan" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#F87171" stopOpacity={0.2} /><stop offset="100%" stopColor="#DC2626" stopOpacity={0.55} /></linearGradient></defs>
          {k0 >= 0 && n > 1 && shown.map((l, k) => {
            const lo = k === 0 ? zeros(k0) : seg(tops[k - 1]), hi = seg(tops[k])
            return hi.length > 1 && <path key={l.key} d={`${smoothPath(hi)} ${smoothBack(lo)} Z`} fill={l.color} fillOpacity={0.58} stroke="#fff" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
          })}
          {onLn && n > 1 && <path d={`${smoothPath(zeros(0))} ${smoothBack(LN.map((x, i) => ({ x: X(i), y: Y(-x) })))} Z`} fill="url(#wnLoan)" />}
          {onLn && n > 1 && <path d={smoothPath(LN.map((x, i) => ({ x: X(i), y: Y(-x) })))} fill="none" stroke="#DC2626" strokeWidth={2} vectorEffect="non-scaling-stroke" />}
          {onNw && nwLast >= 0 && seg(NW).length > 1 && <path d={smoothPath(seg(NW))} fill="none" stroke="#fff" strokeWidth={7} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />}
          {onNw && nwLast >= 0 && seg(NW).length > 1 && <path d={smoothPath(seg(NW))} fill="none" stroke="#14172B" strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />}
        </svg>
        <span className="absolute left-2.5 top-2.5 text-[11px] font-bold uppercase tracking-[.06em] pointer-events-none" style={{ color: '#0F766E' }}>You own</span>
        {onLn && bot > 0 && <span className="absolute left-2.5 text-[11px] font-bold uppercase tracking-[.06em] pointer-events-none" style={{ top: zero + 8, color: '#B4231A' }}>You owe</span>}
        {onNw && nwLast >= 0 && h == null && (<>
          <Dot left={X(nwLast) / 10} top={Y(NW[nwLast]!)} color="#14172B" />
          <span className="absolute pointer-events-none text-[12px] font-bold px-2 py-1 rounded-lg whitespace-nowrap text-white" style={{ left: `${X(nwLast) / 10}%`, top: Y(NW[nwLast]!), transform: `translate(${nwLast > n / 2 ? '-100%' : '0'}, -170%)`, background: '#14172B' }}>Net worth {short(NW[nwLast]!)}</span>
        </>)}
        {h != null && (<>
          <div className="absolute top-0 bottom-0 pointer-events-none" style={{ left: `${X(h) / 10}%`, borderLeft: '1px dashed #9AA0B4' }} />
          {onNw && NW[h] != null && <Dot left={X(h) / 10} top={Y(NW[h]!)} color="#14172B" />}
          {onLn && <Dot left={X(h) / 10} top={Y(-LN[h])} color="#DC2626" />}
          <Tooltip left={X(h) / 10} title={`${pts[h].title} · vs month before`} rows={[
            { label: 'Net worth', color: '#A79BFF', value: NW[h] != null ? money(NW[h]!) : '—', ch: chg(NW, h, true) },
            ...L.map(l => ({ label: l.label, color: l.color, value: l.values[h] != null ? money(l.values[h]!) : '—', ch: chg(l.values, h, true) })),
            { label: 'Loans', color: '#F87171', value: money(LN[h]), ch: chg(LN, h, false) },
          ]} />
        </>)}
      </div>
      <Labels pts={pts} />
      {foot}
    </Card>
  )
}
