'use client'
import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Segmented } from '@/components/ui/kit'
import { addMonths, daysInMonth } from '@/lib/insights'

export type Span = 'all' | 'week' | 'day' | 'dates'
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const WD = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const pad = (n: number) => String(n).padStart(2, '0')
export const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10)
export const daysIncl = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 864e5) + 1
const weekday = (d: string) => (new Date(`${d}T00:00:00Z`).getUTCDay() + 6) % 7          // Monday = 0
export const mondayOf = (d: string) => addDays(d, -weekday(d))
const dayMon = (d: string) => `${Number(d.slice(8))} ${MON[Number(d.slice(5, 7)) - 1]}`

// Weeks of a month, Monday to Sunday, cut to the month
export function weeksOf(month: string) {
  const first = `${month}-01`, last = `${month}-${pad(daysInMonth(month))}`
  const out: { from: string; to: string }[] = []
  for (let s = first; s <= last; s = addDays(mondayOf(s), 7)) {
    const e = addDays(mondayOf(s), 6)
    out.push({ from: s, to: e > last ? last : e })
  }
  return out
}

// Expenses › When: the whole selected period, one week, one day (from a
// calendar showing each day's spending) or your own dates — inside the months
// picked at the top of the app
export default function ExpenseSpanPicker({ fromMonth, toMonth, today, dayTotals, span, dFrom, dTo, onPick, short }: {
  fromMonth: string; toMonth: string; today: string; dayTotals: Record<string, number>
  span: Span; dFrom: string; dTo: string; onPick: (span: Span, from: string, to: string) => void; short: (n: number) => string
}) {
  const rangeStart = `${fromMonth}-01`, rangeEnd = `${toMonth}-${pad(daysInMonth(toMonth))}`
  const lastDay = today < rangeEnd ? (today < rangeStart ? rangeStart : today) : rangeEnd
  // The month the week chips and the calendar show
  const [month, setMonth] = useState(lastDay.slice(0, 7))
  useEffect(() => { setMonth((dFrom || lastDay).slice(0, 7)) }, [fromMonth, toMonth]) // eslint-disable-line react-hooks/exhaustive-deps
  const months = Array.from({ length: (Number(toMonth.slice(0, 4)) - Number(fromMonth.slice(0, 4))) * 12 + Number(toMonth.slice(5)) - Number(fromMonth.slice(5)) + 1 }, (_, i) => addMonths(fromMonth, i))

  function choose(s: Span) {
    if (s === 'all') return onPick('all', '', '')
    if (s === 'day') return onPick('day', lastDay, lastDay)
    if (s === 'week') { const w = weeksOf(lastDay.slice(0, 7)).find(x => x.from <= lastDay && x.to >= lastDay)!; return onPick('week', w.from, w.to) }
    onPick('dates', lastDay.slice(0, 7) + '-01' < rangeStart ? rangeStart : `${lastDay.slice(0, 7)}-01`, lastDay)
  }
  const sum = (a: string, b: string) => Object.entries(dayTotals).reduce((s, [d, v]) => (d >= a && d <= b ? s + v : s), 0)
  const monthNav = months.length > 1 && (span === 'week' || span === 'day') && (
    <div className="flex items-center gap-1">
      <button onClick={() => setMonth(addMonths(month, -1))} disabled={month <= fromMonth} aria-label="Previous month" className="w-8 h-8 rounded-lg flex items-center justify-center disabled:opacity-30" style={{ color: 'var(--text2)' }}><ChevronLeft size={16} /></button>
      <span className="text-[12.5px] font-semibold w-[72px] text-center" style={{ color: 'var(--text)' }}>{MON[Number(month.slice(5)) - 1]} {month.slice(0, 4)}</span>
      <button onClick={() => setMonth(addMonths(month, 1))} disabled={month >= toMonth} aria-label="Next month" className="w-8 h-8 rounded-lg flex items-center justify-center disabled:opacity-30" style={{ color: 'var(--text2)' }}><ChevronRight size={16} /></button>
    </div>
  )
  const max = Math.max(1, ...Object.entries(dayTotals).filter(([d]) => d.startsWith(month)).map(([, v]) => v))
  const lead = weekday(`${month}-01`)

  return (
    <section className="wl-card px-4 md:px-5 py-3.5 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-[13px] font-semibold" style={{ color: 'var(--text)' }}>When</span>
          <Segmented label="Show" value={span} onChange={choose} options={[
            { value: 'all', label: months.length > 1 ? 'Whole period' : 'Whole month' }, { value: 'week', label: 'Week' }, { value: 'day', label: 'Day' }, { value: 'dates', label: 'Dates' },
          ]} />
        </div>
        {monthNav}
      </div>

      {span === 'week' && (
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar -mx-1 px-1">
          {weeksOf(month).map(w => {
            const on = dFrom === w.from && dTo === w.to, future = w.from > today
            return (
              <button key={w.from} onClick={() => onPick('week', w.from, w.to)} disabled={future} aria-pressed={on}
                className="flex-shrink-0 rounded-xl px-3 py-2 text-left disabled:opacity-40" style={{ border: `1.5px solid ${on ? 'var(--accent)' : 'var(--line)'}`, background: on ? 'var(--accent-bg)' : '#fff', minWidth: 104 }}>
                <span className="block text-[12.5px] font-semibold whitespace-nowrap" style={{ color: on ? 'var(--accent2)' : 'var(--text)' }}>{w.from === w.to ? dayMon(w.from) : `${Number(w.from.slice(8))}–${dayMon(w.to)}`}</span>
                <span className="block text-[11.5px] tabular-nums" style={{ color: 'var(--text3)' }}>{future ? 'Ahead' : sum(w.from, w.to) > 0 ? short(sum(w.from, w.to)) : 'Nothing'}</span>
              </button>
            )
          })}
        </div>
      )}

      {span === 'day' && (
        <div>
          <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold mb-1" style={{ color: 'var(--text4)' }}>{WD.map(d => <span key={d}>{d}</span>)}</div>
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: lead }, (_, i) => <span key={`b${i}`} />)}
            {Array.from({ length: daysInMonth(month) }, (_, i) => {
              const d = `${month}-${pad(i + 1)}`, v = dayTotals[d] ?? 0, on = dFrom === d && dTo === d
              const off = d > today || d < rangeStart || d > rangeEnd
              const tint = v > 0 ? 0.08 + 0.32 * (v / max) : 0
              return (
                <button key={d} onClick={() => onPick('day', d, d)} disabled={off} aria-pressed={on} aria-label={`${dayMon(d)}: ${v > 0 ? short(v) : 'nothing spent'}`}
                  className="rounded-lg py-1.5 md:py-2 flex flex-col items-center disabled:opacity-30"
                  style={{ border: `1.5px solid ${on ? 'var(--accent)' : 'transparent'}`, background: on ? 'var(--accent-bg)' : v > 0 ? `rgba(106,85,232,${tint})` : 'var(--bg2)' }}>
                  <span className="text-[12.5px] font-semibold" style={{ color: 'var(--text)' }}>{i + 1}</span>
                  <span className="text-[10px] tabular-nums leading-tight truncate max-w-full px-0.5" style={{ color: v > 0 ? 'var(--text2)' : 'var(--text4)' }}>{v > 0 ? short(v).replace(/^AED\s/, '') : '·'}</span>
                </button>
              )
            })}
          </div>
          <p className="text-[11.5px] mt-1.5" style={{ color: 'var(--text4)' }}>Darker days are where you spent more. Tap one to see just that day.</p>
        </div>
      )}

      {span === 'dates' && (
        <div className="flex items-end gap-2 flex-wrap">
          <label className="block"><span className="block text-[11.5px] font-semibold mb-1" style={{ color: 'var(--text3)' }}>From</span>
            <input type="date" value={dFrom} min={rangeStart} max={dTo || rangeEnd} onChange={e => e.target.value && onPick('dates', e.target.value, dTo < e.target.value ? e.target.value : dTo)} className="wl-input" style={{ height: 38 }} /></label>
          <label className="block"><span className="block text-[11.5px] font-semibold mb-1" style={{ color: 'var(--text3)' }}>To</span>
            <input type="date" value={dTo} min={dFrom || rangeStart} max={rangeEnd} onChange={e => e.target.value && onPick('dates', dFrom > e.target.value ? e.target.value : dFrom, e.target.value)} className="wl-input" style={{ height: 38 }} /></label>
          <span className="text-[12px] pb-2.5" style={{ color: 'var(--text3)' }}>Within {months.length > 1 ? 'the months' : 'the month'} picked at the top. For other months, change it there.</span>
        </div>
      )}
    </section>
  )
}
