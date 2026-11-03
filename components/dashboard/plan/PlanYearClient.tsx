'use client'
import { useMemo, useState } from 'react'
import { fmtCompact, fmtMoney } from '@/lib/format'
import { yearAheadPlan, type MonthState } from '@/lib/plan'
import type { PlanData } from '@/lib/planData'
import { PageHeader } from '@/components/ui/kit'
import { usePlanModel } from './usePlanModel'
import { CurSwitch } from './PlanParts'

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const STATE: Record<MonthState, { label: string; color: string; ink: string }> = {
  comfortable: { label: 'Comfortable', color: '#3FBF8C', ink: '#1E8F5F' },
  tight: { label: 'Tight', color: '#F2A65A', ink: '#B45309' },
  short: { label: 'Short', color: '#E5484D', ink: '#C9302C' },
}
const monthName = (ym: string) => `${MON[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`

// Plan › Year ahead: each month's expected income less what leaves the bank
// that month, so a tight month shows up early
export default function PlanYearClient({ data }: { data: PlanData }) {
  const { cur, setCur, showSwitch, today, plan } = usePlanModel(data)
  const money = (n: number) => fmtMoney(n, cur), short = (n: number) => fmtCompact(n, cur)
  const months = useMemo(() => yearAheadPlan({ cur, today, plan, txns: data.transactions, accounts: data.accounts, loans: data.loans, insurance: data.insurance,
    mutualFunds: data.investments.mutual_funds ?? [], rds: data.investments.recurring_deposits ?? [], recurring: data.recurring, lic: data.investments.lic_policies ?? [],
    bills: data.bills, answers: data.answers, events: data.events }), [cur, today, plan, data])
  const first = months.find(m => m.state !== 'comfortable')
  const [open, setOpen] = useState<string | null>(null)
  const shown = months.find(m => m.ym === (open ?? first?.ym)) ?? months[0]

  return (
    <div className="flex flex-col gap-3.5 md:gap-[18px] animate-fade-up">
      <PageHeader title="Your year ahead" sub="Each month's expected income, less what leaves your bank that month: bills, EMIs, big bills on their date, trips, goals and everyday spending." />
      {showSwitch && <CurSwitch cur={cur} onChange={setCur} />}

      {first ? (
        <div className="rounded-2xl px-4 py-3 flex flex-wrap items-center gap-3 justify-between" style={{ background: first.state === 'short' ? '#FDECE8' : 'var(--amber-bg)', color: STATE[first.state].ink }}>
          <span className="text-[13.5px]"><b>{monthName(first.ym)} is {STATE[first.state].label.toLowerCase()}:</b> {first.lines.filter(l => l.label !== 'Everyday spending' && l.label !== 'Goals').slice(0, 2).map(l => `${l.label} ${short(l.amount)}`).join(' and ') || 'spending is close to income'}. {first.left < 0 ? `About ${short(-first.left)} more than comes in.` : `Only ${short(first.left)} left.`} Set a little aside in the months before it.</span>
          <button onClick={() => setOpen(first.ym)} className="wl-btn" style={{ height: 34, fontSize: 12.5 }}>See what’s in it</button>
        </div>
      ) : (
        <div className="rounded-2xl px-4 py-3 text-[13.5px]" style={{ background: 'var(--pos-bg)', color: 'var(--pos-text)' }}><b>Every month looks comfortable.</b> Income covers what’s planned all year.</div>
      )}

      <div className="flex gap-4 flex-wrap text-[12.5px]" style={{ color: 'var(--text2)' }}>
        {(Object.keys(STATE) as MonthState[]).map(s => <span key={s} className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-[3px]" style={{ background: STATE[s].color }} />{STATE[s].label}</span>)}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5 md:gap-3">
        {months.map(m => {
          const st = STATE[m.state], on = shown?.ym === m.ym
          const extras = m.lines.filter(l => l.label !== 'Everyday spending' && l.label !== 'Goals')
          return (
            <button key={m.ym} onClick={() => setOpen(m.ym)} aria-pressed={on} className="wl-card px-3.5 py-3 text-left flex flex-col gap-1.5"
              style={{ borderColor: on ? 'var(--accent)' : m.state !== 'comfortable' ? st.color : undefined, borderWidth: on || m.state !== 'comfortable' ? 2 : undefined }}>
              <span className="flex justify-between gap-2 items-baseline"><span className="text-[14px] font-bold" style={{ color: 'var(--text)' }}>{monthName(m.ym)}</span>
                <span className="text-[12.5px] font-semibold tabular-nums" style={{ color: st.ink }}>{m.left < 0 ? '−' : '+'}{short(Math.abs(m.left))}</span></span>
              <span className="h-1.5 rounded-full" style={{ background: st.color }} />
              <span className="text-[11.5px] leading-snug line-clamp-2" style={{ color: 'var(--text3)' }}>{extras.length ? extras.slice(0, 2).map(l => `${l.label} ${short(l.amount)}`).join(' · ') : 'A normal month'}</span>
            </button>
          )
        })}
      </div>

      {shown && (
        <section className="wl-card px-4 md:px-5 py-4" aria-label={`${monthName(shown.ym)} in detail`}>
          <div className="flex justify-between items-baseline gap-2 flex-wrap">
            <h2 className="text-[15px] font-semibold" style={{ color: 'var(--text)' }}>{monthName(shown.ym)}</h2>
            <span className="text-[12.5px] font-semibold" style={{ color: STATE[shown.state].ink }}>{STATE[shown.state].label}</span>
          </div>
          <div className="flex justify-between py-2.5 text-[13.5px]" style={{ borderTop: '1px solid var(--track)', marginTop: 8 }}><span style={{ color: 'var(--text2)' }}>Expected income</span><span className="font-semibold tabular-nums" style={{ color: '#1E8F5F' }}>{money(shown.income)}</span></div>
          {shown.lines.map((l, i) => <div key={l.label + i} className="flex justify-between py-2.5 text-[13.5px]" style={{ borderTop: '1px solid var(--track)' }}><span style={{ color: 'var(--text2)' }}>{l.label}</span><span className="font-semibold tabular-nums" style={{ color: 'var(--text)' }}>− {money(l.amount)}</span></div>)}
          <div className="flex justify-between py-2.5 text-[14px] font-bold" style={{ borderTop: '1px solid var(--line)' }}><span>Left</span><span className="tabular-nums" style={{ color: STATE[shown.state].ink }}>{shown.left < 0 ? '−' : ''}{money(Math.abs(shown.left))}</span></div>
          <p className="text-[11.5px] mt-1" style={{ color: 'var(--text4)' }}>Big bills count in the month they’re paid. If you set aside for them each month (Plan › Bills), that money is already waiting.</p>
        </section>
      )}
    </div>
  )
}
