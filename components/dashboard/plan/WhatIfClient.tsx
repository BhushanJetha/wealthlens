'use client'
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { fmtCompact, fmtMoney } from '@/lib/format'
import { fmtDay } from '@/lib/insights'
import { buyBig, incomeChange, prepay, type GoalShift } from '@/lib/plan'
import { tracksCash, kindOf } from '@/lib/goals'
import type { PlanData } from '@/lib/planData'
import { PageHeader, Segmented } from '@/components/ui/kit'
import { usePlanModel } from './usePlanModel'
import { CurSwitch } from './PlanParts'

type Kind = 'buy' | 'income' | 'loan'
const num = (s: string) => Number(String(s).replace(/[^0-9.]/g, '')) || 0
const when = (d: string | null) => (d ? `${fmtDay(d)} ${d.slice(0, 4)}` : 'not reachable at this rate')

function Field({ label, value, onChange, hint }: { label: string; value: string; onChange: (v: string) => void; hint?: string }) {
  return (
    <label className="block">
      <span className="block text-[12px] font-semibold mb-1" style={{ color: 'var(--text2)' }}>{label}</span>
      <input inputMode="decimal" value={value} onChange={e => onChange(e.target.value.replace(/[^0-9.]/g, ''))} className="wl-input w-full" style={{ height: 44 }} />
      {hint && <span className="block text-[11.5px] mt-1" style={{ color: 'var(--text4)' }}>{hint}</span>}
    </label>
  )
}
function Shifts({ shifts }: { shifts: GoalShift[] }) {
  if (!shifts.length) return <p className="text-[13px]" style={{ color: 'var(--pos-text)' }}>Every goal stays on its date.</p>
  return (
    <ul>
      {shifts.map(s => (
        <li key={s.goal.id} className="flex justify-between gap-3 py-2.5 text-[13px]" style={{ borderTop: '1px solid var(--track)' }}>
          <span className="truncate" style={{ color: 'var(--text)' }}>{s.goal.name}</span>
          <span className="font-semibold whitespace-nowrap" style={{ color: s.now && s.now < s.was ? 'var(--pos-text)' : 'var(--amber-text)' }}>{when(s.was)} → {when(s.now)}</span>
        </li>
      ))}
    </ul>
  )
}
const Stat = ({ label, value, sub, ink }: { label: string; value: string; sub?: string; ink?: string }) => (
  <div className="rounded-xl px-3.5 py-3" style={{ background: '#FAFAFE', border: '1px solid var(--line)' }}>
    <div className="text-[11.5px]" style={{ color: 'var(--text3)' }}>{label}</div>
    <div className="text-[18px] font-bold tabular-nums mt-0.5" style={{ color: ink ?? 'var(--text)' }}>{value}</div>
    {sub && <div className="text-[11.5px] mt-0.5" style={{ color: 'var(--text3)' }}>{sub}</div>}
  </div>
)

// Plan › What if: try a big decision against your own numbers before making it.
// Nothing here is saved unless you choose to.
export default function WhatIfClient({ data }: { data: PlanData }) {
  const { cur, setCur, showSwitch, today, built, plan } = usePlanModel(data)
  const money = (n: number) => fmtMoney(n, cur), short = (n: number) => fmtCompact(n, cur)
  const [kind, setKind] = useState<Kind>('buy')
  const [f, setF] = useState({ name: 'New car', price: cur === 'AED' ? '90000' : '900000', upfront: cur === 'AED' ? '30000' : '300000', years: '5', rate: '9', pct: '10', loan: '', extra: cur === 'AED' ? '20000' : '100000' })
  const set = (p: Partial<typeof f>) => setF(x => ({ ...x, ...p }))
  // Money you could reach in an emergency: bank & cash in this currency
  const liquid = data.accounts.filter(a => a.currency === cur && a.account_type !== 'credit_card').reduce((s, a) => s + Math.max(0, Number(a.current_balance) || 0), 0)
  const essentials = built.monthly[cur].essentials
  const loans = data.loans.filter(l => (l.currency || 'INR') === cur && Number(l.outstanding_amt) > 0)
  const loan = loans.find(l => l.id === f.loan) ?? loans[0]
  const hasEmergency = built.items.some(it => it.goal.currency === cur && (tracksCash(it.goal) || kindOf(it.goal) === 'emergency'))

  const buy = useMemo(() => buyBig({ cur, today, plan, items: built.items, liquid, essentials, price: num(f.price), upfront: Math.min(num(f.upfront), num(f.price)), years: num(f.years) || 1, rate: num(f.rate) }), [cur, today, plan, built, liquid, essentials, f])
  const [down, setDown] = useState(false)
  const incSigned = useMemo(() => incomeChange({ cur, today, plan, items: built.items, pct: num(f.pct) * (down ? -1 : 1) }), [cur, today, plan, built, f.pct, down])
  const pre = useMemo(() => (loan ? prepay(loan, num(f.extra)) : null), [loan, f.extra])

  const waitDate = buy.waitMonths ? (() => { const d = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1 + buy.waitMonths, 1)); return d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }) })() : null

  return (
    <div className="flex flex-col gap-3.5 md:gap-[18px] animate-fade-up">
      <PageHeader title="What if…" sub="Try a big decision against your own numbers before you make it. Nothing is saved." />
      {showSwitch && <CurSwitch cur={cur} onChange={setCur} />}
      <div><Segmented label="Decision" value={kind} onChange={(k: Kind) => setKind(k)} options={[{ value: 'buy', label: 'Buy something big' }, { value: 'income', label: 'Income changes' }, ...(loans.length ? [{ value: 'loan' as Kind, label: 'Pay off a loan early' }] : [])]} /></div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.5fr] gap-3.5 md:gap-4 wl-even">
        <section className="wl-card px-4 md:px-5 py-4 flex flex-col gap-3">
          {kind === 'buy' && (<>
            <label className="block"><span className="block text-[12px] font-semibold mb-1" style={{ color: 'var(--text2)' }}>What</span>
              <input value={f.name} onChange={e => set({ name: e.target.value })} className="wl-input w-full" style={{ height: 44 }} /></label>
            <Field label="Price" value={f.price} onChange={v => set({ price: v })} hint={money(num(f.price))} />
            <Field label="Paid upfront" value={f.upfront} onChange={v => set({ upfront: v })} hint={`From your bank & cash · ${money(Math.min(num(f.upfront), num(f.price)))}`} />
            <div className="grid grid-cols-2 gap-2">
              <Field label="Loan years" value={f.years} onChange={v => set({ years: v })} />
              <Field label="Interest %" value={f.rate} onChange={v => set({ rate: v })} />
            </div>
          </>)}
          {kind === 'income' && (<>
            <div><Segmented label="Direction" value={down ? 'down' : 'up'} onChange={(v: string) => setDown(v === 'down')} options={[{ value: 'up', label: 'Goes up' }, { value: 'down', label: 'Goes down' }]} /></div>
            <Field label="By how much, %" value={f.pct} onChange={v => set({ pct: v })} hint={`${down ? '−' : '+'}${money(plan.income * num(f.pct) / 100)} a month`} />
            <p className="text-[12.5px] leading-snug" style={{ color: 'var(--text3)' }}>A raise, a new job, or a gap between jobs. Everything else stays as it is.</p>
          </>)}
          {kind === 'loan' && loan && (<>
            <label className="block"><span className="block text-[12px] font-semibold mb-1" style={{ color: 'var(--text2)' }}>Loan</span>
              <select value={loan.id} onChange={e => set({ loan: e.target.value })} className="wl-input w-full" style={{ height: 44 }}>
                {loans.map(l => <option key={l.id} value={l.id}>{l.name} · {short(Number(l.outstanding_amt))} left</option>)}
              </select></label>
            <Field label="Pay off now" value={f.extra} onChange={v => set({ extra: v })} hint={money(num(f.extra))} />
            <p className="text-[12.5px] leading-snug" style={{ color: 'var(--text3)' }}>Same EMI, fewer months. From your bank & cash: {money(liquid)} today.</p>
          </>)}
        </section>

        <section className="wl-card px-4 md:px-5 py-4 flex flex-col gap-3.5">
          {kind === 'buy' && (<>
            <div className="rounded-xl px-4 py-3" style={{ background: buy.ok ? 'var(--pos-bg)' : 'var(--amber-bg)', color: buy.ok ? 'var(--pos-text)' : 'var(--amber-text)' }}>
              <div className="text-[14.5px] font-bold">{buy.leftAfter < 0 ? 'This would cost more each month than you have left' : buy.ok ? 'You can afford it' : 'You can afford it, but it leaves you thin'}</div>
              <div className="text-[12.5px] mt-1 leading-snug">{buy.loan > 0 ? `A ${money(buy.emi)} EMI for ${num(f.years)} years, ${money(buy.interest)} of it interest. ` : ''}{buy.monthsAfter != null && buy.monthsAfter < 3 ? `Paying ${money(num(f.upfront))} upfront leaves ${buy.monthsAfter.toFixed(1)} months of spending in the bank.` : ''}</div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              <Stat label="EMI" value={buy.loan > 0 ? short(buy.emi) : '—'} sub={buy.loan > 0 ? `on a ${short(buy.loan)} loan` : 'no loan'} />
              <Stat label="Bank & cash covers" value={buy.monthsAfter != null ? `${buy.monthsAfter.toFixed(1)} months` : '—'} sub={buy.monthsBefore != null ? `was ${buy.monthsBefore.toFixed(1)}${hasEmergency ? '' : ' · aim for 6'}` : 'no spending history yet'} ink={buy.monthsAfter != null && buy.monthsAfter < 3 ? 'var(--amber-text)' : undefined} />
              <Stat label="Left each month" value={`${buy.leftAfter < 0 ? '−' : ''}${short(Math.abs(buy.leftAfter))}`} sub={`was ${short(plan.left)}`} ink={buy.leftAfter < 0 ? '#C9302C' : undefined} />
            </div>
            <div><h3 className="text-[13.5px] font-semibold mb-1" style={{ color: 'var(--text)' }}>Your goals</h3><Shifts shifts={buy.shifts} /></div>
            {waitDate && num(f.upfront) > 0 && (
              <div className="rounded-xl px-4 py-3" style={{ background: 'var(--accent-bg)', color: 'var(--accent2)' }}>
                <div className="text-[13px] font-semibold">A gentler way</div>
                <div className="text-[12.5px] mt-1 leading-snug">Save the {money(num(f.upfront))} upfront from what’s left each month: it’s ready by about {waitDate}, and your bank balance stays whole.</div>
              </div>
            )}
            <div className="flex gap-2 flex-wrap mt-auto wl-hide-viewing">
              <Link href={`/dashboard/goals?new=${encodeURIComponent(f.name || 'Big purchase')}`} className="wl-btn wl-btn-primary" style={{ height: 40 }}>Save as a goal</Link>
            </div>
          </>)}
          {kind === 'income' && (<>
            <div className="grid grid-cols-2 gap-2">
              <Stat label="Income a month" value={short(incSigned.income)} sub={`was ${short(plan.income)}`} />
              <Stat label="Left each month" value={`${incSigned.leftAfter < 0 ? '−' : ''}${short(Math.abs(incSigned.leftAfter))}`} sub={`was ${short(plan.left)}`} ink={incSigned.leftAfter < 0 ? '#C9302C' : undefined} />
            </div>
            <div><h3 className="text-[13.5px] font-semibold mb-1" style={{ color: 'var(--text)' }}>Your goals</h3><Shifts shifts={incSigned.shifts} /></div>
            <p className="text-[11.5px] mt-auto" style={{ color: 'var(--text4)' }}>Assumes the change all goes to (or comes out of) what you save each month.</p>
          </>)}
          {kind === 'loan' && loan && (pre ? (<>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              <Stat label="Months saved" value={String(pre.monthsSaved)} sub={`${pre.monthsLeft} months left after`} ink="var(--pos-text)" />
              <Stat label="Interest saved" value={short(pre.interestSaved)} ink="var(--pos-text)" />
              <Stat label="Bank & cash after" value={short(Math.max(0, liquid - num(f.extra)))} sub={essentials > 0 ? `${(Math.max(0, liquid - num(f.extra)) / essentials).toFixed(1)} months of spending` : undefined} ink={essentials > 0 && (liquid - num(f.extra)) / essentials < 3 ? 'var(--amber-text)' : undefined} />
            </div>
            <p className="text-[12.5px] leading-snug" style={{ color: 'var(--text3)' }}>Worth it when the loan’s interest is higher than what that money would earn, and you keep at least 3 months of spending in the bank.</p>
          </>) : <p className="text-[13px]" style={{ color: 'var(--text3)' }}>Add this loan’s outstanding amount, EMI and interest rate on its page to work this out.</p>)}
        </section>
      </div>
    </div>
  )
}
