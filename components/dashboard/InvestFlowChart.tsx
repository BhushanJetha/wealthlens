'use client'
import { useMemo, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from 'recharts'
import { Segmented } from '@/components/ui/kit'
import { FLOW_KEYS, flowMonths, flowYears, type FlowKey, type FlowRow } from '@/lib/investFlows'

type Mode = 'month' | 'year'

const monthName = (k: string, long = false) => {
  const [y, m] = k.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('en-GB', long ? { month: 'long', year: 'numeric' } : { month: 'short' })
}

// Money put into investments each month (last 12) or each year, stacked by
// type. Tap / click a bar to see what went in that period.
export default function InvestFlowChart({ flows, colors, names, fmt, fmtAxis, className = '' }: {
  flows: Map<string, FlowRow>; colors: Record<FlowKey, string>; names: Record<FlowKey, string>
  fmt: (n: number) => string; fmtAxis: (n: number) => string; className?: string
}) {
  const [mode, setMode] = useState<Mode>('month')
  const [sel, setSel] = useState<number | null>(null)
  const thisYear = String(new Date().getFullYear())

  const rows = useMemo(() => {
    const base = mode === 'month' ? flowMonths(flows, 12) : flowYears(flows, 6)
    return base.map(r => ({
      ...r,
      // Month initials keep all 12 labels readable on a phone; the year shows in the detail below
      label: mode === 'year' ? r.key : monthName(r.key),
    }))
  }, [flows, mode])
  const present = FLOW_KEYS.filter(k => rows.some(r => r[k] > 0))
  const idx = sel != null && sel < rows.length ? sel : rows.length - 1
  const cur = rows[idx]
  const sum = rows.reduce((a, r) => a + r.total, 0)
  const periodName = (k: string) => mode === 'month' ? monthName(k, true) : k === thisYear ? `${k} so far` : k

  const summary = mode === 'month'
    ? `${fmt(rows[rows.length - 1]?.total ?? 0)} this month · ${fmt(sum / 12)} a month on average over the last year`
    : rows.length > 1
      ? `${fmt(rows[rows.length - 1].total)} so far this year · ${fmt(rows[rows.length - 2].total)} last year`
      : `${fmt(rows[rows.length - 1]?.total ?? 0)} so far this year`

  const Tip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null
    const r = payload[0].payload
    return (
      <div className="rounded-xl px-3 py-2.5 text-[12px] bg-white shadow-lg" style={{ border: '1px solid var(--line)' }}>
        <div className="font-semibold mb-1" style={{ color: 'var(--text)' }}>{periodName(r.key)} · {fmt(r.total)}</div>
        {FLOW_KEYS.filter(k => r[k] > 0).sort((a, b) => r[b] - r[a]).map(k => (
          <div key={k} className="flex items-center gap-2">
            <i className="w-2 h-2 rounded-sm" style={{ background: colors[k] }} />
            <span style={{ color: 'var(--text2)' }}>{names[k]}</span>
            <span className="ml-auto pl-3 tabular-nums font-medium" style={{ color: 'var(--text)' }}>{fmt(r[k])}</span>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className={`flex flex-col ${className}`}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="text-[13px] md:text-[13.5px] font-semibold" style={{ color: 'var(--text)' }}>Put in each {mode === 'month' ? 'month' : 'year'}</div>
          <div className="text-[11.5px] md:text-[12px] mt-0.5" style={{ color: 'var(--text3)' }}>{summary}</div>
        </div>
        <Segmented label="Show by" value={mode} onChange={v => { setMode(v); setSel(null) }}
          options={[{ value: 'month', label: 'Monthly' }, { value: 'year', label: 'Yearly' }]} />
      </div>

      {sum > 0 ? (<>
        <div className="h-[170px] md:h-auto md:flex-1 md:min-h-[190px] mt-3 -mx-1">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} margin={{ top: 4, right: 4, left: 0, bottom: 0 }} barCategoryGap={mode === 'month' ? '22%' : '35%'}
              onClick={(s: any) => { if (s?.activeTooltipIndex != null) setSel(Number(s.activeTooltipIndex)) }}>
              <CartesianGrid stroke="var(--track)" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#94A3B8' }} axisLine={false} tickLine={false} interval={0} />
              <YAxis tickFormatter={fmtAxis} tick={{ fontSize: 10, fill: '#94A3B8' }} width={40} axisLine={false} tickLine={false} tickCount={4} />
              <Tooltip content={<Tip />} cursor={{ fill: 'rgba(106,85,232,0.07)' }} />
              {present.map(k => (
                <Bar key={k} dataKey={k} name={names[k]} stackId="a" fill={colors[k]} stroke="#fff" strokeWidth={1} isAnimationActive={false} style={{ cursor: 'pointer' }}>
                  {rows.map((_, i) => <Cell key={i} fillOpacity={i === idx ? 1 : 0.45} />)}
                </Bar>
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* What went in the chosen period */}
        <div className="mt-3 rounded-xl px-3.5 py-3" style={{ background: '#FAFAFE', border: '1px solid var(--line)' }}>
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[12.5px] font-semibold" style={{ color: 'var(--text)' }}>{periodName(cur.key)}</span>
            <span className="text-[14px] font-bold tabular-nums" style={{ color: 'var(--text)' }}>{cur.total > 0 ? fmt(cur.total) : 'Nothing put in'}</span>
          </div>
          {cur.total > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {FLOW_KEYS.filter(k => cur[k] > 0).sort((a, b) => cur[b] - cur[a]).map(k => (
                <span key={k} className="rounded-full px-2 py-0.5 text-[11.5px] font-medium tabular-nums inline-flex items-center gap-1.5"
                  style={{ background: colors[k] + '1A', color: colors[k] }}>
                  <i className="w-1.5 h-1.5 rounded-full" style={{ background: colors[k] }} />{names[k]} {fmt(cur[k])}
                </span>
              ))}
            </div>
          )}
          <div className="text-[11px] mt-2" style={{ color: 'var(--text4)' }}>
            {mode === 'month' ? 'Tap a bar to see another month.' : 'Tap a bar to see another year.'} Funds and stocks use your recorded purchases; RDs, LIC, PPF/EPF and NPS follow their schedules.
          </div>
        </div>
      </>) : (
        <div className="mt-3 rounded-xl px-4 py-6 text-center text-[12.5px]" style={{ background: '#FAFAFE', border: '1px solid var(--line)', color: 'var(--text3)' }}>
          Nothing put in during this period yet. Record purchases with Buy, or import a CAS on Mutual funds to bring in your history.
        </div>
      )}
    </div>
  )
}
