'use client'
// "Inside Money / Wealth / Plan": one tile per tab with its key number, a line
// about it and a small picture of it. Tap a tile to open the tab.
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { smoothPath } from '@/lib/homeTrends'

export type Mini =
  | { kind: 'spark'; values: number[]; color: string }
  | { kind: 'split'; parts: { value: number; color: string }[] }
  | { kind: 'progress'; pct: number; color: string }
  | { kind: 'blocks'; colors: string[] }
  | { kind: 'bars'; values: number[]; color: string }
export interface InsideItem { title: string; href: string; value: string; unit?: string; unitTone?: 'good' | 'bad'; line: string; mini?: Mini }

export function MiniView({ m }: { m: Mini }) {
  if (m.kind === 'spark') {
    const v = m.values.filter(Number.isFinite), lo = Math.min(...v), hi = Math.max(...v), r = hi - lo || 1, n = m.values.length
    const P = m.values.map((x, i) => ({ x: n > 1 ? i * 100 / (n - 1) : 50, y: 16 - (x - lo) / r * 13 })).filter(p => Number.isFinite(p.y))
    return P.length > 1 ? (
      <svg viewBox="0 0 100 18" preserveAspectRatio="none" className="w-full h-[18px]" aria-hidden="true">
        <path d={smoothPath(P)} fill="none" stroke={m.color} strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinecap="round" />
      </svg>
    ) : null
  }
  if (m.kind === 'bars') {
    const hi = Math.max(1, ...m.values), n = m.values.length
    return (
      <div className="flex items-end gap-[3px] h-[18px]" aria-hidden="true">
        {m.values.map((x, i) => <span key={i} className="flex-1 rounded-[2px]" style={{ height: `${Math.max(x > 0 ? 12 : 6, x / hi * 100)}%`, background: x > 0 ? m.color : '#EEF0F5', minWidth: 0, maxWidth: n < 6 ? 14 : undefined }} />)}
      </div>
    )
  }
  if (m.kind === 'progress') return (
    <div className="h-2 rounded-full" style={{ background: '#EEF0F5' }}><div className="h-2 rounded-full" style={{ width: `${Math.max(0, Math.min(100, m.pct))}%`, background: m.color }} /></div>
  )
  if (m.kind === 'blocks') return (
    <div className="flex gap-[3px]" aria-hidden="true">{m.colors.map((c, i) => <span key={i} className="flex-1 h-2 rounded-full" style={{ background: c }} />)}</div>
  )
  const sum = m.parts.reduce((s, p) => s + Math.max(0, p.value), 0) || 1
  return (
    <div className="flex gap-[2px] h-2 rounded-full overflow-hidden" aria-hidden="true">
      {m.parts.filter(p => p.value > 0).map((p, i) => <span key={i} style={{ width: `${p.value / sum * 100}%`, background: p.color }} />)}
    </div>
  )
}

export default function InsidePanel({ title, items }: { title: string; items: InsideItem[] }) {
  return (
    <section className="wl-card p-4 md:px-5 md:py-[18px] flex flex-col gap-3.5">
      <div className="flex justify-between items-baseline gap-2.5"><h2 className="text-[17px] font-bold" style={{ color: 'var(--text)' }}>{title}</h2><span className="text-[12.5px]" style={{ color: 'var(--text3)' }}>Tap one to open it</span></div>
      <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 md:gap-3 ${items.length === 5 ? 'xl:grid-cols-5' : items.length === 6 ? 'xl:grid-cols-6' : 'xl:grid-cols-4'}`}>
        {items.map(it => (
          <Link key={it.title} href={it.href} className="rounded-[14px] px-4 py-3.5 flex flex-col gap-1.5 hover:shadow-md transition-shadow min-w-0" style={{ border: '1px solid var(--line)', color: 'var(--text)' }}>
            <div className="flex justify-between items-center"><span className="text-[13.5px] font-semibold">{it.title}</span><ChevronRight size={15} style={{ color: 'var(--text4)' }} /></div>
            <div className="text-[19px] font-extrabold tabular-nums truncate">{it.value}{it.unit && <span className="text-[12px] font-medium ml-1" style={{ color: it.unitTone === 'good' ? '#15803D' : it.unitTone === 'bad' ? '#B4231A' : 'var(--text3)' }}>{it.unit}</span>}</div>
            <div className="text-[12px] leading-snug" style={{ color: 'var(--text3)' }}>{it.line}</div>
            {it.mini && <div className="mt-auto pt-1"><MiniView m={it.mini} /></div>}
          </Link>
        ))}
      </div>
    </section>
  )
}
