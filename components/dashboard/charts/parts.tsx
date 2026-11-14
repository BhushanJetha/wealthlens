'use client'
// Chart pieces shared by Home and the section overviews: the period chips,
// a tile with its trend, hover, tooltip, legend chips, axis and labels.
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { smoothPath } from '@/lib/homeTrends'
import { PERIODS, PERIOD_KEY, isPeriod, pctChange, type PeriodKey } from '@/lib/period'
import { MiniView, type Mini } from './Inside'

// ── One period for Home and every overview, saved on this device ──
const EVT = 'wl-period'
export function usePeriod(fallback: PeriodKey = 'm6'): [PeriodKey, (p: PeriodKey) => void] {
  const [p, setP] = useState<PeriodKey>(fallback)
  useEffect(() => {
    try { const s = localStorage.getItem(PERIOD_KEY); if (isPeriod(s)) setP(s) } catch {}
    const on = (e: Event) => { const d = (e as CustomEvent).detail; if (isPeriod(d)) setP(d) }
    window.addEventListener(EVT, on)
    return () => window.removeEventListener(EVT, on)
  }, [])
  const pick = (x: PeriodKey) => {
    setP(x)
    try { localStorage.setItem(PERIOD_KEY, x) } catch {}
    window.dispatchEvent(new CustomEvent(EVT, { detail: x }))
  }
  return [p, pick]
}
export function PeriodChips({ value, onChange }: { value: PeriodKey; onChange: (p: PeriodKey) => void }) {
  return (
    <div role="group" aria-label="Period" className="flex gap-1 p-1 rounded-[14px] bg-white overflow-x-auto no-scrollbar max-w-full" style={{ border: '1px solid var(--line)' }}>
      {PERIODS.map(([k, l]) => (
        <button key={k} onClick={() => onChange(k)} aria-pressed={value === k} className="h-9 px-3.5 rounded-[10px] text-[13px] whitespace-nowrap flex-shrink-0"
          style={value === k ? { background: 'var(--accent)', color: '#fff', fontWeight: 600 } : { color: 'var(--text2)' }}>{l}</button>
      ))}
    </div>
  )
}

// ── Badges for a change: good is green, bad is red, nothing to say is gray ──
export const GOOD = { background: '#E7F6EE', color: '#15803D' }, BAD = { background: '#FDECEA', color: '#B4231A' }, NONE = { background: '#F1F2F6', color: '#5F657A' }
export type Badge = { t: string; s: React.CSSProperties }
export const badgeOf = (cur: number, prev: number | null | undefined, upGood: boolean, digits = 0): Badge => {
  if (prev == null || !prev) return { t: '—', s: NONE }
  const d = pctChange(cur, prev), up = d >= 0
  return { t: `${up ? '▲' : '▼'} ${Math.abs(d).toFixed(digits)}%`, s: up === upGood ? GOOD : BAD }
}

// ── A tile: the figure, its change, and its trend ──
// With no trend to draw, a small bar (`mini`) sits where the line would be
export function TrendTile({ label, color, value, sub, d, spark, href, gid, dark, mini }: {
  label: string; color: string; value: string; sub: string; d: Badge; spark: number[]; href: string; gid: string; dark?: boolean; mini?: Mini
}) {
  const vals = spark.map((x, i) => ({ x: i, y: x })).filter(pt => Number.isFinite(pt.y))
  const lo = Math.min(...vals.map(pt => pt.y)), hi = Math.max(...vals.map(pt => pt.y)), r = hi - lo || 1, n = spark.length
  const P = vals.map(pt => ({ x: n > 1 ? pt.x * 100 / (n - 1) : 50, y: 26 - (pt.y - lo) / r * 20 }))
  const line = P.length > 1 ? smoothPath(P) : ''
  const stroke = dark ? '#B8ABFF' : color
  return (
    <Link href={href} className="wl-card flex flex-col gap-1 pt-3.5 px-3.5 md:px-4 overflow-hidden hover:shadow-md transition-shadow min-w-0"
      style={dark ? { background: '#14172B', borderColor: '#14172B' } : undefined}>
      <div className="flex items-center justify-between gap-1.5">
        <span className="inline-flex items-center gap-1.5 text-[12px] font-medium truncate" style={{ color: dark ? '#C9CBE0' : 'var(--text2)' }}>{!dark && <i className="w-2 h-2 rounded-[3px] flex-shrink-0" style={{ background: color }} />}{label}</span>
        <span className="text-[11px] font-semibold px-1.5 py-[2px] rounded-full whitespace-nowrap" style={dark ? { background: 'rgba(255,255,255,.12)', color: d.s.color === '#B4231A' ? '#FF9C93' : d.s.color === '#15803D' ? '#8EF0BF' : '#C9CBE0' } : d.s}>{d.t}</span>
      </div>
      <div className="text-[20px] md:text-[23px] font-bold tabular-nums tracking-[-0.02em] truncate" style={{ color: dark ? '#fff' : 'var(--text)' }}>{value}</div>
      <div className="text-[11.5px] leading-snug min-h-[30px]" style={{ color: dark ? '#C9CBE0' : 'var(--text3)' }}>{sub}</div>
      {!line && mini ? <div className="mt-auto pt-1 pb-3.5"><MiniView m={mini} /></div> : (
      <svg viewBox="0 0 100 30" preserveAspectRatio="none" className="block -mx-3.5 md:-mx-4 h-10" style={{ width: 'calc(100% + 2rem)' }} aria-hidden="true">
        <defs><linearGradient id={gid} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={stroke} stopOpacity={0.28} /><stop offset="100%" stopColor={stroke} stopOpacity={0} /></linearGradient></defs>
        {line && <path d={`${line} L${P[P.length - 1].x.toFixed(1)} 30 L${P[0].x.toFixed(1)} 30 Z`} fill={`url(#${gid})`} />}
        {line && <path d={line} fill="none" stroke={stroke} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />}
      </svg>)}
    </Link>
  )
}

// ── Hover, tooltip, legend, axis ──
export interface Pt { label: string; title: string; ix: number[]; sel: boolean }
export function useHover() {
  const [h, setH] = useState<number | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  const move = (n: number) => (e: React.PointerEvent) => {
    const r = ref.current?.getBoundingClientRect(); if (!r) return
    setH(Math.max(0, Math.min(n - 1, Math.floor((e.clientX - r.left) / r.width * n))))
  }
  return { h, ref, move, leave: () => setH(null) }
}
export const chg = (vals: (number | null)[], i: number, upGood: boolean) => {
  const pv = i > 0 ? vals[i - 1] : null, cv = vals[i]
  if (pv == null || !pv || cv == null) return { t: '', c: '#C9CBE0' }
  const d = pctChange(cv, pv)
  return { t: `${d >= 0 ? '+' : '−'}${Math.abs(d).toFixed(0)}%`, c: (d >= 0) === upGood ? '#7EE2A8' : '#FF9C93' }
}
export function Tooltip({ left, title, rows, foot }: { left: number; title: string; rows: { label: string; color: string; value: string; ch: { t: string; c: string } }[]; foot?: string }) {
  return (
    <div className="absolute top-1 z-10 pointer-events-none rounded-xl px-3 py-2.5 min-w-[196px]" style={{ left: `${left}%`, transform: left > 58 ? 'translateX(calc(-100% - 14px))' : 'translateX(14px)', background: '#14172B', color: '#fff', boxShadow: '0 10px 28px rgba(20,23,43,.22)' }}>
      <div className="text-[12px] font-bold mb-1.5">{title}</div>
      {rows.map(r => (
        <div key={r.label} className="flex items-center gap-2 text-[12px] leading-[1.75]">
          <i className="w-2 h-2 rounded-[2px] flex-shrink-0" style={{ background: r.color }} /><span className="flex-1" style={{ color: '#C9CBE0' }}>{r.label}</span>
          <b className="tabular-nums">{r.value}</b><span className="w-10 text-right text-[11px]" style={{ color: r.ch.c }}>{r.ch.t}</span>
        </div>
      ))}
      {foot && <div className="text-[11px] mt-1.5 pt-1.5" style={{ color: '#C9CBE0', borderTop: '1px solid rgba(255,255,255,.12)' }}>{foot}</div>}
    </div>
  )
}
export function LegendChip({ on, toggle, label, total, swatch, change }: { on: boolean; toggle: () => void; label: string; total: string; swatch: React.CSSProperties; change?: { t: string; good: boolean } }) {
  return (
    <button onClick={toggle} aria-pressed={on} className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-full text-[12.5px]"
      style={on ? { background: '#fff', border: '1px solid #D9DCE6', color: 'var(--text)' } : { background: '#F5F6FA', border: '1px dashed #D9DCE6', color: '#8A8FA3', textDecoration: 'line-through' }}>
      <span style={swatch} />{label}<b className="tabular-nums">{total}</b>
      {change && <span className="text-[11.5px] font-semibold" style={{ color: change.good ? '#15803D' : '#B4231A' }}>{change.t}</span>}
    </button>
  )
}
export const Axis = ({ ticks }: { ticks: { y: number; label: string; zero: boolean }[] }) => (<>
  {ticks.map(t => (
    <div key={t.y}>
      <div className="absolute left-0 right-0" style={{ top: t.y, borderTop: `1px ${t.zero ? 'solid #B9BDCB' : 'dashed #E9EBF1'}` }} />
      <div className="absolute w-[44px] text-right text-[10.5px] tabular-nums -translate-y-1/2" style={{ left: -52, top: t.y, color: '#8A8FA3' }}>{t.label}</div>
    </div>
  ))}
</>)
export const Labels = ({ pts }: { pts: Pt[] }) => (
  <div className="flex ml-[52px] mt-1">
    {pts.map((pt, i) => <div key={i} className="flex-1 min-w-0 text-center text-[11px] whitespace-nowrap" style={{ color: 'var(--text3)', fontWeight: pt.sel ? 700 : 400 }}>{pts.length <= 12 || i % 3 === 0 || i === pts.length - 1 ? pt.label : ''}</div>)}
  </div>
)
export const Dot = ({ left, top, color }: { left: number; top: number; color: string }) => (
  <span className="absolute w-3 h-3 -ml-1.5 -mt-1.5 rounded-full pointer-events-none" style={{ left: `${left}%`, top, background: color, border: '2.5px solid #fff', boxShadow: '0 1px 4px rgba(20,23,43,.25)' }} />
)

// ── A card section with a title, a line under it and something on the right ──
export function Card({ title, sub, right, children, className = '' }: { title: string; sub?: string; right?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`wl-card p-4 md:px-5 md:py-[18px] flex flex-col gap-3 min-w-0 ${className}`}>
      <div className="flex flex-wrap justify-between items-start gap-2.5">
        <div className="min-w-0"><h2 className="text-[15px] font-semibold" style={{ color: 'var(--text)' }}>{title}</h2>{sub && <p className="text-[12px] mt-0.5" style={{ color: 'var(--text3)' }}>{sub}</p>}</div>
        {right}
      </div>
      {children}
    </section>
  )
}
// A round-ish step for chart ticks, and the ticks themselves
export function ticksFor(top: number, step: number, Y: (x: number) => number, short: (n: number) => string) {
  return Array.from({ length: Math.round(top / step) + 1 }, (_, k) => ({ y: Y(k * step), label: k ? short(k * step) : '0', zero: k === 0 }))
}
