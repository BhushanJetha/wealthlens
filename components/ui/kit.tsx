'use client'
import Link from 'next/link'
import { Plus, type LucideIcon } from 'lucide-react'
import { useUiStore } from '@/store/uiStore'

// Shared building blocks for design v2 (design/design_handoff_wealthlens).
// Desktop and phone sizes are both handled here so pages stay simple.

// ─── Palette ────────────────────────────────────────────────────────────────
// KPI tile tints, in the design's fixed order: lavender, mint, peach, sky.
export const TINTS = [
  { bg: '#F1EEFF', bd: '#E1DAFF', ic: '#7B63F0' },
  { bg: '#E7F7EF', bd: '#CBEBDA', ic: '#2FB67C' },
  { bg: '#FFF2E2', bd: '#F8DDB8', ic: '#F29A2E' },
  { bg: '#E7F1FE', bd: '#CDE0F8', ic: '#3B8EF0' },
] as const
// Category colours for charts and breakdowns, assigned in this order.
export const PALETTE = ['#6A55E8', '#2FB67C', '#F29A2E', '#3B8EF0', '#EC5B8C', '#94A3B8'] as const
// Matching soft backgrounds for icon chips.
export const PALETTE_BG = ['#F0EDFF', '#E7F7EF', '#FFF2E2', '#E7F1FE', '#FDECF2', '#F1F5F9'] as const

export type Tone = 'good' | 'bad' | 'neutral'
const TONE: Record<Tone, string> = { good: '#16A34A', bad: '#DC2626', neutral: '#64748B' }

// ─── KPI tile ───────────────────────────────────────────────────────────────
export function KpiTile({ label, value, delta, tone = 'neutral', tint = 0, icon: Icon, href, onClick, className = '' }: {
  label: string; value: React.ReactNode; delta?: React.ReactNode; tone?: Tone; tint?: number; icon?: LucideIcon
  href?: string; onClick?: () => void; className?: string
}) {
  const t = TINTS[tint % TINTS.length]
  const body = (
    <>
      <div className="flex justify-between items-center gap-2">
        <div className="text-[11px] md:text-[12px] font-semibold truncate" style={{ color: '#475569' }}>{label}</div>
        <span className="w-6 h-6 md:w-[30px] md:h-[30px] rounded-full flex items-center justify-center flex-shrink-0 text-white" style={{ background: t.ic }}>
          {Icon && <Icon size={14} strokeWidth={2.4} />}
        </span>
      </div>
      <div className="text-[18px] md:text-[24px] font-bold tracking-[-0.02em] tabular-nums mt-1.5 mb-[3px] truncate" style={{ color: 'var(--text)' }}>{value}</div>
      {delta != null && <div className="text-[11.5px] md:text-[12px] font-medium leading-snug" style={{ color: TONE[tone] }}>{delta}</div>}
    </>
  )
  const cls = `block text-left rounded-2xl md:rounded-[20px] px-3.5 py-3 md:px-[18px] md:py-4 min-w-0 ${className}`
  const lift = 'transition-transform hover:-translate-y-0.5'
  const style = { background: t.bg, border: `1px solid ${t.bd}` }
  return href ? <Link href={href} className={`${cls} ${lift}`} style={style}>{body}</Link>
    : onClick ? <button onClick={onClick} className={`${cls} ${lift} w-full`} style={style}>{body}</button>
    : <div className={cls} style={style}>{body}</div>
}

export function KpiGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 md:gap-3.5">{children}</div>
}

// ─── Cards ──────────────────────────────────────────────────────────────────
export function Panel({ title, right, children, className = '', ...rest }: {
  title?: React.ReactNode; right?: React.ReactNode; children?: React.ReactNode; className?: string
} & Omit<React.HTMLAttributes<HTMLElement>, 'title'>) {
  return (
    <section className={`wl-card px-4 md:px-5 py-3.5 md:py-[18px] ${className}`} {...rest}>
      {(title || right) && (
        <div className="flex items-center justify-between gap-2">
          {title && <h2 className="text-[14px] md:text-[15px] font-semibold" style={{ color: 'var(--text)' }}>{title}</h2>}
          {right}
        </div>
      )}
      {children}
    </section>
  )
}

export function MoreLink({ href, children }: { href: string; children: React.ReactNode }) {
  return <Link href={href} className="text-[12px] md:text-[12.5px] font-semibold hover:underline whitespace-nowrap" style={{ color: 'var(--accent)' }}>{children} →</Link>
}

// Gradient hero (net worth, goals): white text on the violet gradient.
export function HeroCard({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <section className={`relative overflow-hidden rounded-[22px] bg-hero shadow-hero text-white p-4 md:px-6 md:py-[22px] ${className}`}>{children}</section>
}

// Headline number + its chart in one white card, identical on desktop and
// phone (Spent, Income, Outstanding…). `right` = legend or a small control.
export function HeroStat({ label, value, delta, tone = 'neutral', right, children, className = '' }: {
  label: React.ReactNode; value: React.ReactNode; delta?: React.ReactNode; tone?: Tone
  right?: React.ReactNode; children?: React.ReactNode; className?: string
}) {
  return (
    <section className={`wl-card px-4 md:px-5 py-4 md:py-[18px] flex flex-col ${className}`}>
      <div className="flex justify-between items-start gap-3">
        <div className="min-w-0">
          <div className="text-[10.5px] md:text-[11px] font-semibold uppercase tracking-[0.05em]" style={{ color: 'var(--text3)' }}>{label}</div>
          <div className="text-[30px] md:text-[32px] font-bold tabular-nums tracking-[-0.02em] leading-tight mt-0.5" style={{ color: 'var(--text)' }}>{value}</div>
          {delta != null && <div className="text-[12px] md:text-[12.5px] font-medium" style={{ color: TONE[tone] }}>{delta}</div>}
        </div>
        {right && <div className="hidden md:flex flex-shrink-0 pt-0.5">{right}</div>}
      </div>
      {children}
    </section>
  )
}

// ─── Page header ────────────────────────────────────────────────────────────
// Desktop: title + sub left, action buttons right. Phone: title + round "+".
export function PageHeader({ title, sub, actions, onAdd, addLabel = 'Add' }: {
  title: React.ReactNode; sub?: React.ReactNode; actions?: React.ReactNode; onAdd?: () => void; addLabel?: string
}) {
  return (
    <div className="flex items-center md:items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-[22px] md:text-[24px] font-bold tracking-[-0.01em]" style={{ color: 'var(--text)' }}>{title}</h1>
        {sub && <p className="text-[12px] md:text-[13px] mt-0.5" style={{ color: 'var(--text3)' }}>{sub}</p>}
      </div>
      {actions && <div className="hidden md:flex items-center gap-2 flex-shrink-0">{actions}</div>}
      {onAdd && (
        <button onClick={onAdd} aria-label={addLabel}
          className="md:hidden w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-white" style={{ background: 'var(--accent)' }}>
          <Plus size={19} />
        </button>
      )}
    </div>
  )
}

// ─── AI hooks ───────────────────────────────────────────────────────────────
// "✦ insight · Explain this page" bar. Opens the advisor with a page prompt.
export function InsightBar({ text, prompt }: { text: React.ReactNode; prompt: string }) {
  const { openAdvisor } = useUiStore()
  return (
    <div className="rounded-xl px-3.5 md:px-4 py-[11px] md:py-3 flex flex-col md:flex-row gap-1.5 md:gap-2.5 md:items-center text-[12.5px] md:text-[13px] leading-[1.45]"
      style={{ background: 'var(--accent-bg)', border: '1px solid var(--accent-border)', color: 'var(--accent2)' }}>
      <span className="flex-1"><span className="font-bold mr-1.5">✦</span>{text}</span>
      <button onClick={() => openAdvisor(prompt)}
        className="self-start md:self-auto flex-shrink-0 md:rounded-full md:px-[13px] md:py-1.5 text-[12px] font-semibold md:text-white md:bg-[var(--accent)]">
        <span className="md:hidden" style={{ color: 'var(--accent)' }}>Explain this page →</span>
        <span className="hidden md:inline">✦ Explain this page</span>
      </button>
    </div>
  )
}

export function AiActions({ actions, context }: { actions: string[]; context: string }) {
  const { openAdvisor } = useUiStore()
  if (!actions.length) return null
  return (
    <div className="flex gap-2 flex-wrap items-center">
      <span className="text-[11px] font-semibold uppercase tracking-[0.05em]" style={{ color: 'var(--text3)' }}>AI actions</span>
      {actions.map(a => (
        <button key={a} onClick={() => openAdvisor(`${a}. ${context}`)}
          className="rounded-full px-[13px] py-1.5 text-[12px] font-semibold transition-colors hover:bg-[var(--accent-bg)]"
          style={{ border: '1px solid var(--accent-border)', background: '#fff', color: 'var(--accent2)' }}>
          ✦ {a}
        </button>
      ))}
    </div>
  )
}

// ─── Learn strip ────────────────────────────────────────────────────────────
export function LearnStrip({ title, href }: { title: string; href: string }) {
  return (
    <Link href={href} className="flex justify-between items-center gap-3 rounded-[14px] md:rounded-xl px-4 md:px-[18px] py-[13px] md:py-3.5 bg-white md:bg-[var(--bg2)] border border-[var(--line)] md:border-[var(--border)] transition-colors hover:border-[var(--accent-border)]">
      <span className="min-w-0">
        <span className="block text-[10.5px] md:text-[11px] font-semibold uppercase tracking-[0.05em]" style={{ color: 'var(--accent)' }}>Learn</span>
        <span className="block text-[13px] md:text-[14px] font-semibold mt-0.5" style={{ color: 'var(--text)' }}>{title}</span>
      </span>
      <span className="text-[13px] font-semibold flex-shrink-0" style={{ color: 'var(--accent)' }}>
        <span className="hidden md:inline">Start lesson </span>→
      </span>
    </Link>
  )
}

// ─── Charts ─────────────────────────────────────────────────────────────────
// Single-value ring (health score, budget used, goal progress).
export function Ring({ pct, size = 92, stroke = 3.5, color = 'var(--accent)', track = 'var(--accent-bg)', children, label }: {
  pct: number; size?: number; stroke?: number; color?: string; track?: string; children?: React.ReactNode; label?: string
}) {
  const p = Math.max(0, Math.min(100, pct))
  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }} role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(p)} aria-label={label}>
      <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
        <circle cx="18" cy="18" r="15.9155" fill="none" stroke={track} strokeWidth={stroke} />
        {p > 0 && <circle cx="18" cy="18" r="15.9155" fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" pathLength={100} strokeDasharray={`${p} ${100 - p}`} />}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">{children}</div>
    </div>
  )
}

// Vertical bars that rise from the baseline (design: 0.7s, 50ms stagger).
// Single series: `hi` bars take the accent, others soft lavender. Paired
// (`before` set): lavender "before" bar beside an accent "now" bar.
export function Bars({ data, className = 'h-[220px]', label }: {
  data: { label: string; value: number; before?: number; tip: string; hi?: boolean }[]; className?: string; label: string
}) {
  const max = Math.max(...data.map(d => Math.max(d.value, d.before ?? 0)), 1)
  const h = (v: number) => `${Math.max(v / max * 100, v > 0 ? 2 : 0)}%`
  return (
    <div className={`flex gap-1.5 md:gap-2.5 ${className}`} role="img" aria-label={label}>
      {data.map((d, i) => (
        <div key={i} className="flex-1 min-w-0 flex flex-col" title={d.tip}>
          <div className="flex-1 flex items-end justify-center gap-[3px]">
            {d.before != null && (
              <div className="w-[38%] max-w-[24px] rounded-t-[5px] wl-rise" style={{ height: h(d.before), background: '#C9C2F5', animationDelay: `${i * 50}ms` }} />
            )}
            <div className={`${d.before != null ? 'w-[38%] max-w-[24px]' : 'w-[44%] max-w-[26px]'} rounded-t-[5px] wl-rise`}
              style={{ height: h(d.value), background: d.hi || d.before != null ? 'var(--accent)' : '#C9C2F5', animationDelay: `${i * 50}ms` }} />
          </div>
          <div className="h-[16px] md:h-[22px] pt-1 md:pt-1.5 text-[9px] md:text-[11px] text-center truncate" style={{ color: 'var(--text4)' }}>{d.label}</div>
        </div>
      ))}
    </div>
  )
}

// Multi-segment donut for breakdowns; segments in PALETTE order.
export function Donut({ segments, size = 128, stroke = 5, children, label }: {
  segments: { value: number; color: string }[]; size?: number; stroke?: number; children?: React.ReactNode; label?: string
}) {
  const total = segments.reduce((a, s) => a + Math.max(0, s.value), 0)
  let off = 0
  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }} role="img" aria-label={label}>
      <svg viewBox="0 0 42 42" className="w-full h-full -rotate-90">
        <circle cx="21" cy="21" r="15.9155" fill="none" stroke="var(--track)" strokeWidth={stroke} />
        {total > 0 && segments.map((s, i) => {
          const pct = Math.max(0, s.value) / total * 100
          // 0.6 gap between segments so neighbours stay distinct
          const el = <circle key={i} cx="21" cy="21" r="15.9155" fill="none" stroke={s.color} strokeWidth={stroke} pathLength={100}
            strokeDasharray={`${Math.max(pct - 0.6, 0)} ${100 - Math.max(pct - 0.6, 0)}`} strokeDashoffset={-off} />
          off += pct
          return el
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">{children}</div>
    </div>
  )
}

export function ProgressRow({ name, sub, value, right, pct, color = 'var(--accent)', href }: {
  name: React.ReactNode; sub?: React.ReactNode; value?: React.ReactNode; right?: React.ReactNode; pct: number; color?: string; href?: string
}) {
  const body = (
    <>
      <div className="flex justify-between gap-2 text-[12.5px] mb-[5px]">
        <span className="font-semibold truncate" style={{ color: 'var(--text)' }}>{name}{sub && <span className="font-normal ml-1" style={{ color: 'var(--text4)' }}>{sub}</span>}</span>
        <span className="tabular-nums whitespace-nowrap" style={{ color: 'var(--text)' }}>{value}{right && <span className="ml-1" style={{ color: 'var(--text3)' }}>{right}</span>}</span>
      </div>
      <div className="h-1.5 rounded-full" style={{ background: 'var(--track)' }}>
        <div className="h-full rounded-full wl-grow" style={{ width: `${Math.max(0, Math.min(100, pct))}%`, background: color }} />
      </div>
    </>
  )
  return href ? <Link href={href} className="block hover:opacity-90">{body}</Link> : <div>{body}</div>
}

// ─── Controls ───────────────────────────────────────────────────────────────
// Segmented control. `violet`: selected = filled violet (desktop page toggles);
// default: selected = white pill on a soft track (phone, compare toggles).
export function Segmented<T extends string>({ options, value, onChange, violet, full, label }: {
  options: { value: T; label: React.ReactNode }[]; value: T; onChange: (v: T) => void; violet?: boolean; full?: boolean; label: string
}) {
  return (
    <div role="radiogroup" aria-label={label} className={`${full ? 'flex' : 'inline-flex'} p-1 rounded-xl`} style={{ background: violet ? '#E9E6F8' : '#E8EAF0' }}>
      {options.map(o => {
        const on = o.value === value
        return (
          <button key={o.value} role="radio" aria-checked={on} onClick={() => onChange(o.value)}
            className={`${full ? 'flex-1' : ''} px-4 py-[7px] rounded-lg text-[13px] whitespace-nowrap transition-all`}
            style={on
              ? violet ? { background: 'var(--accent)', color: '#fff', fontWeight: 600 } : { background: '#fff', color: 'var(--text)', fontWeight: 600, boxShadow: '0 1px 2px rgba(0,0,0,.12)' }
              : { color: 'var(--text3)', fontWeight: 500 }}>
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

// ─── Page states ────────────────────────────────────────────────────────────
export function EmptyState({ message, cta, onCta, onImport }: { message: string; cta?: string; onCta?: () => void; onImport?: () => void }) {
  return (
    <div className="rounded-[14px] px-6 py-10 md:py-[60px] text-center bg-white" style={{ border: '1.5px dashed var(--border2)' }}>
      <div className="w-[60px] h-[60px] rounded-[18px] mx-auto mb-3.5 flex items-center justify-center" style={{ background: 'var(--accent-bg)', color: 'var(--accent)' }}><Plus size={28} /></div>
      <div className="text-[18px] font-bold" style={{ color: 'var(--text)' }}>Nothing here yet</div>
      <div className="text-[13.5px] leading-normal mt-1.5 mb-[18px] mx-auto max-w-[380px]" style={{ color: 'var(--text3)' }}>{message}</div>
      <div className="flex gap-2.5 justify-center flex-wrap">
        {cta && onCta && <button onClick={onCta} className="wl-btn wl-btn-primary" style={{ height: 40, padding: '0 18px', fontSize: 13.5 }}>{cta}</button>}
        {onImport && <button onClick={onImport} className="wl-btn" style={{ height: 40, padding: '0 18px', fontSize: 13.5 }}>Import a statement</button>}
      </div>
    </div>
  )
}

export function ErrorState({ what, onRetry }: { what: string; onRetry: () => void }) {
  return (
    <div role="alert" className="rounded-[14px] p-6 flex gap-4 items-center flex-wrap" style={{ border: '1px solid #FECACA', background: '#FEF2F2' }}>
      <span className="w-10 h-10 rounded-full flex items-center justify-center text-white text-[20px] font-bold flex-shrink-0" style={{ background: '#DC2626' }}>!</span>
      <div className="flex-1 min-w-[160px]">
        <div className="text-[15px] font-semibold" style={{ color: '#991B1B' }}>We could not load {what}</div>
        <div className="text-[13px] mt-0.5 leading-snug" style={{ color: '#B91C1C' }}>Check your connection. Your data is safe — nothing was changed.</div>
      </div>
      <button onClick={onRetry} className="h-[38px] px-[18px] rounded-[9px] text-[13px] font-semibold bg-white" style={{ border: '1px solid #FECACA', color: '#991B1B' }}>Retry</button>
    </div>
  )
}

export function SkeletonPage() {
  const block = 'rounded-xl animate-pulse'
  return (
    <div className="flex flex-col gap-3 md:gap-[18px]" aria-busy="true" aria-label="Loading">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">{[0, 1, 2, 3].map(i => <div key={i} className={`${block} h-[78px] md:h-[92px]`} style={{ background: '#E8EBF0' }} />)}</div>
      <div className={`${block} h-[160px] md:h-[260px]`} style={{ background: '#E8EBF0' }} />
      <div className={`${block} h-[120px] md:h-[180px]`} style={{ background: '#E8EBF0' }} />
    </div>
  )
}
