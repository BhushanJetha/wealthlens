import { ReactNode } from 'react'

const ACCENT_COLORS: Record<string, string> = {
  teal:   '#00C9A7',
  gold:   '#F4A535',
  rose:   '#E8556D',
  blue:   '#4A90D9',
  purple: '#7C5CBF',
  green:  '#3CC68A',
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

export default function MetricCard({ label, value, delta, positive, accent = 'teal', icon, sub }: Props) {
  const color = ACCENT_COLORS[accent] ?? ACCENT_COLORS.teal
  return (
    <div className="bg-[#162032] border border-white/7 rounded-xl p-4 relative overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-[2px]" style={{ background: color }} />
      <div className="flex items-start justify-between mb-2">
        <div className="text-[10px] uppercase tracking-[0.1em] text-slate-500 font-semibold">{label}</div>
        {icon && <div className="text-slate-600">{icon}</div>}
      </div>
      <div className="text-[20px] font-bold font-mono text-white leading-tight">{value}</div>
      {sub && <div className="text-[10px] text-slate-500 mt-1">{sub}</div>}
      {delta && (
        <div className={`text-[10px] font-semibold mt-1.5 flex items-center gap-1 ${positive ? 'text-[#3CC68A]' : 'text-[#E8556D]'}`}>
          {delta}
        </div>
      )}
    </div>
  )
}
