'use client'
// Money › Overview charts: spending by category (stacked, filled), where income
// came from (stacked columns) and money sent from the UAE to India (bars with
// the rate each month got).
import { useState } from 'react'
import { smoothPath, smoothBack, niceStep } from '@/lib/homeTrends'
import { useHover, chg, Tooltip, LegendChip, Axis, Labels, Dot, Card, ticksFor, type Pt } from '../charts/parts'

export interface Layer { key: string; label: string; color: string; values: number[] }

// ── Spending by category, one filled layer each, stacked ──
export function StackedSpend({ pts, layers, short, money, sub, foot }: {
  pts: Pt[]; layers: Layer[]; short: (n: number) => string; money: (n: number) => string; sub: string; foot?: React.ReactNode
}) {
  const [off, setOff] = useState<Record<string, boolean>>({})
  const hv = useHover()
  const n = pts.length, H = 240, BASE = 232, X = (i: number) => (n > 1 ? i / (n - 1) * 1000 : 500)
  const shown = layers.filter(l => !off[l.key])
  const tops: number[][] = []
  let acc = pts.map(() => 0)
  for (const l of shown) { acc = acc.map((x, i) => x + (l.values[i] ?? 0)); tops.push(acc) }
  const mx = Math.max(1, ...acc), step = niceStep(mx / 4), top = Math.ceil(mx / step) * step
  const Y = (x: number) => BASE - Math.max(0, x) / top * 216
  const ticks = ticksFor(top, step, Y, short)
  const line = (arr: number[]) => arr.map((x, i) => ({ x: X(i), y: Y(x) }))
  const peak = acc.reduce((b, x, i) => (x > acc[b] ? i : b), 0)
  const h = hv.h != null && hv.h < n ? hv.h : null
  const sum = (arr: number[]) => arr.reduce((s, x) => s + x, 0)
  return (
    <Card title="What you spent on, month by month" sub={sub}>
      <div role="group" aria-label="Categories shown" className="flex flex-wrap gap-1.5">
        {layers.map(l => <LegendChip key={l.key} on={!off[l.key]} toggle={() => setOff(o => ({ ...o, [l.key]: !o[l.key] }))} label={l.label} total={short(sum(l.values))}
          swatch={{ width: 12, height: 10, borderRadius: 3, background: l.color }} />)}
      </div>
      <div ref={hv.ref} onPointerMove={hv.move(n)} onPointerDown={hv.move(n)} onPointerLeave={hv.leave} className="relative ml-[52px] touch-pan-y" style={{ height: H }}>
        <Axis ticks={ticks} />
        <svg viewBox={`0 0 1000 ${H}`} preserveAspectRatio="none" className="absolute inset-0 w-full" style={{ height: H }} role="img"
          aria-label={`Spending by category: ${shown.map(l => `${l.label} ${short(sum(l.values))}`).join(', ')}`}>
          {n > 1 && shown.map((l, k) => {
            const lo = k === 0 ? line(pts.map(() => 0)) : line(tops[k - 1]), hi = line(tops[k])
            return <path key={l.key} d={`${smoothPath(hi)} ${smoothBack(lo)} Z`} fill={l.color} fillOpacity={0.62} stroke="#fff" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
          })}
        </svg>
        {n > 1 && acc[peak] > 0 && h == null && (
          <span className="absolute pointer-events-none text-[11.5px] font-semibold px-2 py-[3px] rounded-lg whitespace-nowrap bg-white"
            style={{ left: `${X(peak) / 10}%`, top: Y(acc[peak]) - 4, transform: `translate(${peak > n / 2 ? '-100%' : '0'}, -100%)`, color: 'var(--text)', border: '1px solid var(--line)' }}>{pts[peak].label} · {short(acc[peak])}</span>
        )}
        {h != null && (<>
          <div className="absolute top-0 pointer-events-none" style={{ left: `${X(h) / 10}%`, bottom: H - BASE, borderLeft: '1px dashed #9AA0B4' }} />
          {shown.length > 0 && <Dot left={X(h) / 10} top={Y(acc[h])} color="#14172B" />}
          <Tooltip left={X(h) / 10} title={`${pts[h].title} · ${money(acc[h])}`} rows={[...shown].reverse().map(l => ({ label: l.label, color: l.color, value: money(l.values[h] ?? 0), ch: chg(l.values, h, false) }))} />
        </>)}
      </div>
      <Labels pts={pts} />
      {foot}
    </Card>
  )
}

// ── Where income came from: a column a month, split by kind ──
export function IncomeColumns({ pts, layers, short, money, total }: { pts: Pt[]; layers: Layer[]; short: (n: number) => string; money: (n: number) => string; total: number }) {
  const hv = useHover()
  const n = pts.length, H = 150
  const tot = pts.map((_, i) => layers.reduce((s, l) => s + (l.values[i] ?? 0), 0))
  const mx = Math.max(1, ...tot)
  const h = hv.h != null && hv.h < n ? hv.h : null
  const sums = layers.map(l => ({ ...l, sum: l.values.reduce((s, x) => s + x, 0) })).filter(l => l.sum > 0)
  return (
    <Card title="Where income came from" right={<b className="text-[15px] tabular-nums" style={{ color: 'var(--text)' }}>{short(total)}</b>}>
      <div ref={hv.ref} onPointerMove={hv.move(n)} onPointerDown={hv.move(n)} onPointerLeave={hv.leave} className="relative flex items-end gap-[6%] px-1 touch-pan-y" style={{ height: H }}>
        {pts.map((pt, i) => (
          <div key={i} className="flex-1 flex flex-col-reverse gap-[2px] min-w-0" style={{ height: `${tot[i] / mx * 100}%`, opacity: h == null || h === i ? 1 : 0.5 }}>
            {layers.map((l, k) => (l.values[i] ?? 0) > 0 && <span key={l.key} style={{ flex: l.values[i], background: l.color, borderRadius: k === layers.length - 1 || layers.slice(k + 1).every(x => !(x.values[i] > 0)) ? '4px 4px 0 0' : 0 }} />)}
          </div>
        ))}
        {h != null && <Tooltip left={(h + 0.5) / n * 100} title={`${pts[h].title} · ${money(tot[h])}`} rows={layers.filter(l => (l.values[h] ?? 0) > 0).map(l => ({ label: l.label, color: l.color, value: money(l.values[h]), ch: chg(l.values, h, true) }))} />}
      </div>
      <div className="flex px-1">{pts.map((pt, i) => <div key={i} className="flex-1 text-center text-[11px] min-w-0 whitespace-nowrap" style={{ color: 'var(--text3)' }}>{n <= 12 || i % 3 === 0 || i === n - 1 ? pt.label.split(' ')[0] : ''}</div>)}</div>
      <div className="flex flex-col">
        {sums.map(l => (
          <div key={l.key} className="flex items-center gap-2.5 min-h-[32px] text-[13px]" style={{ color: 'var(--text)' }}>
            <i className="w-2.5 h-2.5 rounded-[3px] flex-shrink-0" style={{ background: l.color }} /><span className="flex-1 min-w-0 truncate">{l.label}</span>
            <span className="text-[12px] w-10 text-right" style={{ color: 'var(--text3)' }}>{total > 0 ? Math.round(l.sum / total * 100) : 0}%</span>
            <b className="w-[72px] text-right tabular-nums font-semibold">{short(l.sum)}</b>
          </div>
        ))}
        {sums.length === 0 && <p className="text-[12.5px] py-4 text-center" style={{ color: 'var(--text3)' }}>No income recorded in this period.</p>}
      </div>
    </Card>
  )
}

// ── UAE → India: what was sent each month, with the rate it got ──
export function RemitBars({ pts, aed, inr, uaeView, short }: { pts: Pt[]; aed: number[]; inr: number[]; uaeView: boolean; short: (n: number) => string }) {
  const hv = useHover()
  const n = pts.length, H = 150
  const val = uaeView ? aed : inr, mx = Math.max(1, ...val)
  const rate = (i: number) => (aed[i] > 0 ? inr[i] / aed[i] : null)
  const totA = aed.reduce((s, x) => s + x, 0), totI = inr.reduce((s, x) => s + x, 0)
  const avg = totA > 0 ? totI / totA : null
  const fmtA = (x: number) => `AED ${Math.round(x).toLocaleString('en-US')}`
  const h = hv.h != null && hv.h < n ? hv.h : null
  return (
    <Card title="UAE → India" sub={totA > 0 ? `${fmtA(totA)} sent · ${short(totI)} landed` : `${short(totI)} landed in India`}>
      <div ref={hv.ref} onPointerMove={hv.move(n)} onPointerDown={hv.move(n)} onPointerLeave={hv.leave} className="relative flex items-end gap-[6%] px-1 pt-5 touch-pan-y" style={{ height: H }}>
        {pts.map((pt, i) => (
          <div key={i} className="flex-1 relative min-w-0" style={{ height: `${val[i] / mx * 100}%`, minHeight: val[i] > 0 ? 4 : 0, background: val[i] > 0 ? 'linear-gradient(180deg,#8B7BF0,#6A55E8)' : 'transparent', borderRadius: '4px 4px 0 0', opacity: h == null || h === i ? 1 : 0.5 }}>
            {rate(i) != null && n <= 12 && <span className="absolute left-1/2 -translate-x-1/2 -top-[17px] text-[10.5px] font-semibold tabular-nums whitespace-nowrap" style={{ color: 'var(--text2)' }}>{rate(i)!.toFixed(1)}</span>}
          </div>
        ))}
        {h != null && <Tooltip left={(h + 0.5) / n * 100} title={pts[h].title} rows={[
          ...(aed[h] > 0 ? [{ label: 'Sent', color: '#6A55E8', value: fmtA(aed[h]), ch: { t: '', c: '' } }] : []),
          { label: 'Landed', color: '#2FB67C', value: short(inr[h]), ch: { t: '', c: '' } },
          ...(rate(h) != null ? [{ label: 'Rate', color: '#C9CBE0', value: `₹${rate(h)!.toFixed(2)}`, ch: { t: '', c: '' } }] : []),
        ]} />}
      </div>
      <div className="flex px-1">{pts.map((pt, i) => <div key={i} className="flex-1 text-center text-[11px] min-w-0 whitespace-nowrap" style={{ color: 'var(--text3)' }}>{n <= 12 || i % 3 === 0 || i === n - 1 ? pt.label.split(' ')[0] : ''}</div>)}</div>
      <p className="text-[12.5px] rounded-[10px] px-3 py-2.5" style={{ background: '#F4F2FF', color: 'var(--text2)' }}>
        {avg != null ? <>You got <b style={{ color: 'var(--text)' }}>₹{avg.toFixed(2)}</b> a dirham on average. The label on each bar is that month’s rate.</> : 'Transfers here are what landed in India; the dirham side wasn’t recorded.'}
      </p>
    </Card>
  )
}
