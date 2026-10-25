import { ReactNode } from 'react'

// Design v2 tinted KPI tile (same look as components/ui/kit KpiTile).
// `accent` picks the tint: lavender, mint, peach, sky, or rose for warnings.
const TINT: Record<string, { bg: string; bd: string; ic: string }> = {
  sage:    { bg: '#F1EEFF', bd: '#E1DAFF', ic: '#7B63F0' },
  teal:    { bg: '#F1EEFF', bd: '#E1DAFF', ic: '#7B63F0' },
  purple:  { bg: '#F1EEFF', bd: '#E1DAFF', ic: '#7B63F0' },
  green:   { bg: '#E7F7EF', bd: '#CBEBDA', ic: '#2FB67C' },
  income:  { bg: '#E7F7EF', bd: '#CBEBDA', ic: '#2FB67C' },
  gold:    { bg: '#FFF2E2', bd: '#F8DDB8', ic: '#F29A2E' },
  blue:    { bg: '#E7F1FE', bd: '#CDE0F8', ic: '#3B8EF0' },
  rose:    { bg: '#FDECE8', bd: '#F6CFC6', ic: '#E4573D' },
  expense: { bg: '#FDECE8', bd: '#F6CFC6', ic: '#E4573D' },
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
  const t = TINT[accent] ?? TINT.sage
  return (
    <div className="rounded-2xl md:rounded-[20px] px-3.5 py-3 md:px-[18px] md:py-4 min-w-0" style={{ background: t.bg, border: `1px solid ${t.bd}` }}>
      <div className="flex items-center justify-between gap-2">
        <div className="text-[11px] md:text-[12px] font-semibold truncate" style={{ color: '#475569' }}>{label}</div>
        {icon && (
          <span className="w-6 h-6 md:w-[30px] md:h-[30px] rounded-full flex items-center justify-center flex-shrink-0 text-white [&_svg]:w-3.5 [&_svg]:h-3.5" style={{ background: t.ic }}>
            {icon}
          </span>
        )}
      </div>
      <div className="text-[18px] md:text-[24px] font-bold tabular-nums tracking-[-0.02em] mt-1.5 mb-[3px] truncate" style={{ color: 'var(--text)' }}>{value}</div>
      {sub && <div className="text-[11.5px] md:text-[12px]" style={{ color: 'var(--text3)' }}>{sub}</div>}
      {delta && (
        <div className="text-[11.5px] md:text-[12px] font-medium mt-0.5" style={{ color: positive ? '#16A34A' : '#DC2626' }}>
          {delta}
        </div>
      )}
    </div>
  )
}
