'use client'
import { useMemo, useState } from 'react'
import { daysInMonth } from '@/lib/insights'

// Sequential ramp (one hue, light → dark) for "how much was spent that day"
const RAMP = ['#E6E1FD', '#C9C0FA', '#A595F4', '#7F6AEC', '#5640D6']
const EMPTY = '#F1F5F9'
const WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// Daily spending calendar for one month: each day shaded by what was spent
// (living costs and family — EMIs and investing would swamp it), darker =
// a bigger day for that month. Tap a day for what went out.
export default function SpendCalendar({ rows, month, today, value, short, className = '' }: {
  rows: any[]; month: string; today: string
  value: (t: any) => number; short: (n: number) => string; className?: string
}) {
  const [sel, setSel] = useState<number | null>(null)
  const dim = daysInMonth(month)
  const [y, m] = month.split('-').map(Number)
  const lead = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7          // Monday first
  const lastDay = today.slice(0, 7) === month ? Number(today.slice(8, 10)) : dim

  const days = useMemo(() => {
    const out = Array.from({ length: dim }, () => ({ total: 0, txns: [] as any[] }))
    for (const t of rows) {
      if (t.txn_date?.slice(0, 7) !== month) continue
      const d = out[Number(t.txn_date.slice(8, 10)) - 1]
      if (!d) continue
      const v = value(t); d.total += v; d.txns.push({ ...t, _v: v })
    }
    out.forEach(d => d.txns.sort((a, b) => b._v - a._v))
    return out
  }, [rows, month, dim, value])

  // Shaded by rank among the month's spending days, so one big day (rent)
  // doesn't wash the rest out
  const spendDays = days.map(d => d.total).filter(v => v > 0).sort((a, b) => a - b)
  const shade = (v: number) => {
    if (v <= 0 || !spendDays.length) return EMPTY
    const below = spendDays.filter(x => x < v).length
    return RAMP[Math.min(RAMP.length - 1, Math.floor(below / spendDays.length * RAMP.length))]
  }
  const past = days.slice(0, lastDay)
  const spent = past.reduce((a, d) => a + d.total, 0)
  const noSpend = past.filter(d => d.total <= 0).length
  const busiest = past.reduce((b, d, i) => (d.total > (past[b]?.total ?? 0) ? i : b), 0)
  const weekend = past.reduce((a, d, i) => a + ([5, 6].includes((lead + i) % 7) ? d.total : 0), 0)
  const label = (i: number) => `${i + 1} ${MON[m - 1]}`
  const chosen = sel != null ? days[sel] : null

  return (
    <section className={`wl-card px-4 md:px-6 py-4 md:py-5 ${className}`} aria-labelledby="cal-title">
      <div className="flex justify-between items-baseline gap-2">
        <h2 id="cal-title" className="text-[14px] md:text-[15px] font-semibold" style={{ color: 'var(--text)' }}>Day by day</h2>
        <span className="text-[11.5px]" style={{ color: 'var(--text3)' }}>Living costs and family · {MON[m - 1]} {y}</span>
      </div>
      {spent > 0 && (
        <p className="text-[12.5px] mt-1 leading-snug" style={{ color: 'var(--text2)' }}>
          Busiest: <b>{label(busiest)}</b> ({short(past[busiest].total)}) · {noSpend} no-spend day{noSpend === 1 ? '' : 's'} · weekends {Math.round(weekend / spent * 100)}% of spending
        </p>
      )}

      <div className="grid grid-cols-7 gap-[3px] md:gap-1 mt-3" role="grid" aria-label={`Spending by day, ${MON[m - 1]} ${y}`}>
        {WEEK.map(w => <div key={w} className="text-center text-[10.5px] font-semibold pb-0.5" style={{ color: 'var(--text4)' }}>{w.slice(0, 1)}<span className="hidden md:inline">{w.slice(1)}</span></div>)}
        {Array.from({ length: lead }, (_, i) => <div key={`b${i}`} />)}
        {days.map((d, i) => {
          const future = i + 1 > lastDay
          const bg = future ? 'transparent' : shade(d.total)
          const dark = !future && d.total > 0 && RAMP.indexOf(bg) >= 3
          const text = `${label(i)}: ${future ? 'still to come' : d.total > 0 ? `${short(d.total)}${d.txns[0] ? `, most on ${d.txns[0].merchant}` : ''}` : 'no spending'}`
          return (
            <button key={i} type="button" onClick={() => setSel(sel === i ? null : i)} disabled={future}
              aria-label={text} title={text} aria-pressed={sel === i}
              className="relative rounded-[6px] md:rounded-lg h-[38px] md:h-[52px] flex flex-col items-start justify-between p-1 md:p-1.5 text-left transition-shadow disabled:cursor-default"
              style={{ background: bg, border: future ? '1px dashed var(--line)' : '2px solid ' + (sel === i ? 'var(--accent2)' : 'transparent') }}>
              <span className="text-[10px] md:text-[11px] font-semibold leading-none" style={{ color: dark ? '#fff' : 'var(--text3)' }}>{i + 1}</span>
              {!future && d.total > 0 && (
                <span className="hidden md:block text-[10.5px] font-semibold tabular-nums leading-none truncate max-w-full" style={{ color: dark ? '#fff' : 'var(--text)' }}>{short(d.total)}</span>
              )}
            </button>
          )
        })}
      </div>

      <div className="flex items-center justify-end gap-1.5 mt-2.5 text-[10.5px]" style={{ color: 'var(--text4)' }} aria-hidden>
        Less
        {[EMPTY, ...RAMP].map(c => <span key={c} className="w-3 h-3 rounded-[3px]" style={{ background: c }} />)}
        More
      </div>

      {chosen && sel != null && (
        <div className="mt-3 rounded-xl px-3.5 py-2.5" style={{ background: 'var(--bg2)' }}>
          <div className="flex justify-between text-[12.5px] font-semibold" style={{ color: 'var(--text)' }}>
            <span>{label(sel)}</span><span className="tabular-nums">{short(chosen.total)}</span>
          </div>
          {chosen.txns.length === 0
            ? <div className="text-[12px] mt-1" style={{ color: 'var(--text3)' }}>Nothing spent — a no-spend day.</div>
            : chosen.txns.slice(0, 5).map((t: any) => (
              <div key={t.id} className="flex justify-between gap-3 text-[12px] mt-1" style={{ color: 'var(--text2)' }}>
                <span className="truncate">{t.merchant} <span style={{ color: 'var(--text4)' }}>· {t.category}</span></span>
                <span className="tabular-nums flex-shrink-0">{short(t._v)}</span>
              </div>
            ))}
          {chosen.txns.length > 5 && <div className="text-[11.5px] mt-1" style={{ color: 'var(--text4)' }}>+{chosen.txns.length - 5} more</div>}
        </div>
      )}
    </section>
  )
}
