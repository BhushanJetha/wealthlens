import { ReactNode } from 'react'

const ACCENT: Record<string, { color: string; bg: string }> = {
  teal:    { color: 'var(--sage)',    bg: 'var(--sage-bg)' },
  sage:    { color: 'var(--sage)',    bg: 'var(--sage-bg)' },
  gold:    { color: 'var(--gold)',    bg: 'var(--gold-bg)' },
  rose:    { color: 'var(--rose)',    bg: 'var(--rose-bg)' },
  blue:    { color: 'var(--blue)',    bg: 'var(--blue-bg)' },
  purple:  { color: 'var(--purple)',  bg: 'var(--purple-bg)' },
  green:   { color: 'var(--income)',  bg: 'var(--income-bg)' },
  income:  { color: 'var(--income)',  bg: 'var(--income-bg)' },
  expense: { color: 'var(--expense)', bg: 'var(--expense-bg)' },
}

interface Props {
  label: string
  value: string
  delta?: string
  positive?: boolean
  accent?: string
  icon?: ReactNode
  sub?: string
}

export default function MetricCard({ label, value, delta, positive, accent = 'sage', icon, sub }: Props) {
  const a = ACCENT[accent] ?? ACCENT.sage
  return (
    <div className="wl-card p-4 relative overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-[3px] rounded-t-xl" style={{ background: a.color }} />
      <div className="flex items-start justify-between mb-3">
        <div className="text-[10px] uppercase tracking-[0.1em] font-semibold" style={{ color: 'var(--text3)' }}>{label}</div>
        {icon && (
          <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: a.bg, color: a.color }}>
            {icon}
          </div>
        )}
      </div>
      <div className="text-[22px] font-bold font-mono leading-tight" style={{ color: 'var(--text)' }}>{value}</div>
      {sub && <div className="text-[10px] mt-1" style={{ color: 'var(--text3)' }}>{sub}</div>}
      {delta && (
        <div className="text-[10px] font-semibold mt-1.5 flex items-center gap-1"
          style={{ color: positive ? 'var(--income)' : 'var(--expense)' }}>
          {delta}
        </div>
      )}
    </div>
  )
}
