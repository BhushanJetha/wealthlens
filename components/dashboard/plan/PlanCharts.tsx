'use client'
// Plan › Overview charts: the bank balance expected at each month's end, and
// each month's income less what's planned to leave (above or below zero).
import { smoothPath, niceStep } from '@/lib/homeTrends'
import { useHover, Tooltip, Axis, Labels, Dot, Card, type Pt } from '../charts/parts'

export function BalanceAhead({ pts, bal, line, short, money, sub, notes }: {
  pts: Pt[]; bal: number[]; line: number; short: (n: number) => string; money: (n: number) => string; sub: string; notes: (string | null)[]
}) {
  const hv = useHover()
  const n = pts.length, H = 220, BASE = 210, X = (i: number) => (n > 1 ? i / (n - 1) * 1000 : 500)
  const lo = Math.min(0, ...bal), hi = Math.max(1, ...bal, line)
  const step = niceStep((hi - lo) / 4), top = Math.ceil(hi / step) * step, bot = Math.floor(lo / step) * step
  const Y = (x: number) => BASE - (x - bot) / (top - bot || 1) * 196
  const ticks: { y: number; label: string; zero: boolean }[] = []
  for (let t = bot; t <= top + 1; t += step) ticks.push({ y: Y(t), label: Math.abs(t) < 1 ? '0' : `${t < 0 ? '−' : ''}${short(Math.abs(t))}`, zero: Math.abs(t) < 1 })
  const P = bal.map((x, i) => ({ x: X(i), y: Y(x) }))
  const low = bal.reduce((b, x, i) => (x < bal[b] ? i : b), 0)
  const h = hv.h != null && hv.h < n ? hv.h : null
  return (
    <Card title="Your bank balance ahead" sub={sub}>
      <div className="flex flex-wrap gap-1.5 text-[12px]" style={{ color: 'var(--text2)' }}>
        <span className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-full" style={{ border: '1px solid #D9DCE6' }}><i className="w-3 h-2.5 rounded-[3px]" style={{ background: '#2FB67C', opacity: 0.6 }} />Expected at each month’s end</span>
        {line > 0 && <span className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-full" style={{ border: '1px solid #D9DCE6' }}><i className="w-3.5" style={{ borderTop: '2px dashed #DC2626' }} />One month of needs · {short(line)}</span>}
      </div>
      <div ref={hv.ref} onPointerMove={hv.move(n)} onPointerDown={hv.move(n)} onPointerLeave={hv.leave} className="relative ml-[52px] touch-pan-y" style={{ height: H }}>
        <Axis ticks={ticks} />
        <svg viewBox={`0 0 1000 ${H}`} preserveAspectRatio="none" className="absolute inset-0 w-full" style={{ height: H }} role="img" aria-label={`Bank balance from ${short(bal[0] ?? 0)} to ${short(bal[n - 1] ?? 0)}; lowest ${short(bal[low] ?? 0)} at the end of ${pts[low]?.title ?? ''}`}>
          <defs><linearGradient id="pbFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#2FB67C" stopOpacity={0.45} /><stop offset="100%" stopColor="#2FB67C" stopOpacity={0.05} /></linearGradient></defs>
          {n > 1 && <path d={`${smoothPath(P)} L${X(n - 1).toFixed(1)} ${Y(Math.max(0, bot))} L${X(0).toFixed(1)} ${Y(Math.max(0, bot))} Z`} fill="url(#pbFill)" />}
          {n > 1 && <path d={smoothPath(P)} fill="none" stroke="#1E8A5C" strokeWidth={2.5} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />}
          {line > 0 && <path d={`M0 ${Y(line)} L1000 ${Y(line)}`} stroke="#DC2626" strokeWidth={1.5} strokeDasharray="6 5" vectorEffect="non-scaling-stroke" />}
        </svg>
        {h == null && n > 1 && (<>
          <Dot left={X(low) / 10} top={Y(bal[low])} color="#14172B" />
          <span className="absolute pointer-events-none text-[12px] font-semibold px-2 py-1 rounded-lg whitespace-nowrap text-white" style={{ left: `${X(low) / 10}%`, top: Y(bal[low]), transform: `translate(${low > n / 2 ? '-100%' : '0'}, ${Y(bal[low]) < 60 ? '30%' : '-150%'})`, background: '#14172B' }}>Lowest {short(bal[low])} · {pts[low].label}</span>
        </>)}
        {h != null && (<>
          <div className="absolute top-0 pointer-events-none" style={{ left: `${X(h) / 10}%`, bottom: H - BASE, borderLeft: '1px dashed #9AA0B4' }} />
          <Dot left={X(h) / 10} top={Y(bal[h])} color="#1E8A5C" />
          <Tooltip left={X(h) / 10} title={pts[h].title} rows={[{ label: 'Expected balance', color: '#2FB67C', value: money(bal[h]), ch: { t: '', c: '' } }]} foot={notes[h] ?? undefined} />
        </>)}
      </div>
      <Labels pts={pts} />
    </Card>
  )
}

// Each month: what's expected in less what's planned out. Above zero is left over, below is short.
export function YearColumns({ pts, left, tags, short, money, states }: {
  pts: Pt[]; left: number[]; tags: (string | null)[]; short: (n: number) => string; money: (n: number) => string; states: ('comfortable' | 'tight' | 'short')[]
}) {
  const hv = useHover()
  const n = pts.length, H = 200
  const hi = Math.max(1, ...left.map(Math.abs)), step = niceStep(hi / 2), top = Math.ceil(hi / step) * step
  const mid = H / 2, Y = (x: number) => mid - x / top * (mid - 14)
  const COL = { comfortable: '#3FBF8C', tight: '#F2A65A', short: '#E5484D' }
  const h = hv.h != null && hv.h < n ? hv.h : null
  return (
    <div>
      <div ref={hv.ref} onPointerMove={hv.move(n)} onPointerDown={hv.move(n)} onPointerLeave={hv.leave} className="relative ml-[52px] touch-pan-y" style={{ height: H }}>
        <Axis ticks={[{ y: Y(top), label: short(top), zero: false }, { y: mid, label: '0', zero: true }, { y: Y(-top), label: `−${short(top)}`, zero: false }]} />
        {left.map((x, i) => (
          <div key={i} className="absolute" style={{ left: `${(i + 0.18) / n * 100}%`, width: `${0.64 / n * 100}%`, top: x >= 0 ? Y(x) : mid, height: Math.max(2, Math.abs(Y(x) - mid)),
            background: COL[states[i]], borderRadius: x >= 0 ? '4px 4px 0 0' : '0 0 4px 4px', opacity: h == null || h === i ? 1 : 0.5 }} />
        ))}
        {tags.map((t, i) => t && n <= 12 && (
          <span key={`t${i}`} className="absolute text-[10.5px] font-semibold whitespace-nowrap pointer-events-none -translate-x-1/2 px-1 rounded" style={{ left: `${(i + 0.5) / n * 100}%`, top: left[i] >= 0 ? mid + 6 : mid - 20, color: 'var(--text2)', background: 'rgba(255,255,255,.85)' }}>{t}</span>
        ))}
        {h != null && <Tooltip left={(h + 0.5) / n * 100} title={pts[h].title} rows={[{ label: left[h] >= 0 ? 'Left over' : 'Short', color: COL[states[h]], value: money(left[h]), ch: { t: '', c: '' } }]} foot={tags[h] ? `Biggest: ${tags[h]}` : undefined} />}
      </div>
      <Labels pts={pts} />
    </div>
  )
}
