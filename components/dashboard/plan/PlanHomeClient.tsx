'use client'
import { useMemo } from 'react'
import Link from 'next/link'
import { CalendarRange, ChevronRight, FlaskConical } from 'lucide-react'
import { fmtCompact, fmtMoney } from '@/lib/format'
import { fmtDay } from '@/lib/insights'
import { nextDate } from '@/lib/recurring'
import { spendByCategory } from '@/lib/budgets'
import { fixesFor, payFirstDue } from '@/lib/plan'
import type { PlanData } from '@/lib/planData'
import { PageHeader } from '@/components/ui/kit'
import { usePlanModel } from './usePlanModel'
import { CurSwitch, FixesCard, PayFirstRow } from './PlanParts'

const MON = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

// Plan › Overview: one month of income laid out: bills, goals, everyday
// spending and what's left, with the way into each part
export default function PlanHomeClient({ data }: { data: PlanData }) {
  const { cur, setCur, showSwitch, today, built, plan } = usePlanModel(data)
  const money = (n: number) => fmtMoney(n, cur), short = (n: number) => fmtCompact(n, cur)
  const month = MON[Number(today.slice(5, 7)) - 1]
  const daysLeft = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)), 0)).getUTCDate() - Number(today.slice(8, 10))

  const fixes = useMemo(() => fixesFor({ cur, today, items: built.items, short: plan.short, budgetRows: data.budgets, spent: spendByCategory(data.transactions, today.slice(0, 7), cur), links: data.links }),
    [cur, today, built, plan.short, data])
  const due = useMemo(() => payFirstDue({ mode: data.payFirst, cur, today, txns: data.transactions, items: built.items, links: data.links, saving: plan.saving, usualIncome: plan.income, fx: data.fx, answers: data.answers, contributions: data.contributions }),
    [data, cur, today, built, plan])

  // The four corners: next bill, goals on track, budgets left, what's coming
  const nextBill = useMemo(() => [
    ...data.recurring.filter(r => r.is_active && r.currency === cur && r.txn_type === 'expense').map(r => ({ name: r.merchant, date: nextDate(r, today), amount: Number(r.amount) })),
    ...data.bills.filter(b => b.currency === cur && b.days >= 0).map(b => ({ name: b.name, date: b.due, amount: b.amount })),
  ].sort((a, b) => a.date.localeCompare(b.date))[0], [data, cur, today])
  const oneOff = built.items.filter(it => it.goal.currency === cur && !it.rec && it.goal.status !== 'cancelled' && it.plan.status !== 'achieved')
  const onTrack = oneOff.filter(it => it.plan.status === 'on_track').length
  const event = data.events.filter(e => !e.closed_at && e.currency === cur && String(e.start_date) >= today).sort((a, b) => String(a.start_date).localeCompare(String(b.start_date)))[0]

  const parts = [
    { key: 'bills', label: 'Bills & EMIs', sub: `Rent and anything that repeats${plan.emis > 0 ? `, plus ${money(plan.emis)} of EMIs` : ''}`, amount: plan.bills + plan.emis, color: '#F2A65A', href: '/dashboard/bills' },
    { key: 'goals', label: 'Goals', sub: plan.goalRows.length ? `What your ${plan.goalRows.length} goal${plan.goalRows.length === 1 ? '' : 's'} need each month: ${plan.goalRows.slice(0, 3).map(r => r.goal.name).join(', ')}${plan.goalRows.length > 3 ? '…' : ''}` : 'No one-time goals yet', amount: plan.goals, color: '#3FBF8C', href: '/dashboard/goals' },
    { key: 'everyday', label: 'Everyday spending', sub: `Your budgets, or your usual spending where there's none · ${money(plan.everydaySpent)} spent so far`, amount: plan.everyday, color: '#6E8FF0', href: '/dashboard/budgets' },
  ]
  const income = Math.max(plan.income, 1)
  const widths = [...parts.map(p => Math.max(0, p.amount) / income * 100), Math.max(0, plan.left) / income * 100]
  const over = plan.left < 0

  return (
    <div className="flex flex-col gap-3.5 md:gap-[18px] animate-fade-up">
      <PageHeader title={`Your ${month} plan`} sub={`Where this month's income goes, in one place · ${daysLeft} day${daysLeft === 1 ? '' : 's'} left`}
        actions={<>
          <Link href="/dashboard/plan/year" className="wl-btn" style={{ height: 34 }}><CalendarRange size={14} />Year ahead</Link>
          <Link href="/dashboard/plan/what-if" className="wl-btn wl-btn-primary" style={{ height: 34 }}><FlaskConical size={14} />What if…</Link>
        </>} />
      {showSwitch && <CurSwitch cur={cur} onChange={setCur} />}

      <section className="rounded-[20px] md:rounded-[22px] px-5 md:px-7 py-5 md:py-6 text-white flex flex-col gap-4" style={{ background: 'linear-gradient(135deg, #3B2C8F, #6A55E8)' }}>
        <div className="flex flex-wrap justify-between items-end gap-4">
          <div>
            <div className="text-[11.5px] font-semibold uppercase tracking-[0.06em]" style={{ color: '#DAD3FF' }}>{over ? 'Planned more than comes in' : 'Left after everything is planned'}</div>
            <div className="text-[34px] md:text-[42px] font-bold tracking-[-0.02em] tabular-nums">{over ? '−' : ''}{money(Math.abs(plan.left))}</div>
            <div className="text-[13.5px]" style={{ color: '#E6E0FF' }}>{over ? 'Pick a fix below, or trim a budget' : 'Free to enjoy, or put towards a goal'} · from {money(plan.income)} {plan.incomeDeclared ? 'you declared' : 'usual income'}</div>
          </div>
          <div className="flex gap-2 md:hidden">
            <Link href="/dashboard/plan/year" className="rounded-xl px-3.5 h-10 flex items-center gap-1.5 text-[13px] font-semibold" style={{ background: 'rgba(255,255,255,.15)' }}><CalendarRange size={14} />Year</Link>
            <Link href="/dashboard/plan/what-if" className="rounded-xl px-3.5 h-10 flex items-center gap-1.5 text-[13px] font-semibold bg-white" style={{ color: '#3B2C8F' }}><FlaskConical size={14} />What if</Link>
          </div>
        </div>
        <div role="img" aria-label={`${money(plan.income)} split: ${parts.map(p => `${p.label} ${money(p.amount)}`).join(', ')}, left ${money(plan.left)}`} className="flex h-4 rounded-full overflow-hidden gap-[3px]" style={{ background: 'rgba(255,255,255,.15)' }}>
          {parts.map((p, i) => widths[i] > 0 && <div key={p.key} style={{ width: `${widths[i]}%`, background: p.color }} />)}
          {!over && widths[3] > 0 && <div style={{ width: `${widths[3]}%`, background: '#FFFFFF' }} />}
        </div>
      </section>

      {!plan.incomeDeclared && (
        <Link href="/dashboard/settings/income" className="wl-card px-4 py-3 flex items-center gap-3 text-[13px]" style={{ color: 'var(--text2)' }}>
          <span className="flex-1">Income is your usual of the last 3 months. <b style={{ color: 'var(--text)' }}>Tell us what you expect</b> for a sharper plan.</span><ChevronRight size={16} style={{ color: 'var(--text4)' }} />
        </Link>
      )}

      {due && (
        <section className="wl-card px-4 md:px-5 py-3">
          <h2 className="text-[14px] font-semibold" style={{ color: 'var(--text)' }}>Pay yourself first</h2>
          <ul className="mt-1"><PayFirstRow due={due} mode={data.payFirst} today={today} /></ul>
        </section>
      )}

      <section className="wl-card px-4 md:px-6 py-4 md:py-5">
        <h2 className="text-[15px] font-semibold" style={{ color: 'var(--text)' }}>How it adds up</h2>
        <p className="text-[12.5px] mt-0.5 mb-2" style={{ color: 'var(--text3)' }}>Tap a line to open its page.</p>
        <Link href="/dashboard/settings/income" className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 items-center py-3" style={{ borderTop: '1px solid var(--track)' }}>
          <span className="flex flex-col"><span className="text-[14px] font-semibold" style={{ color: 'var(--text)' }}>Came in</span><span className="text-[12.5px]" style={{ color: 'var(--text3)' }}>{plan.incomeDeclared ? 'What you declared you expect each month' : 'Your usual, last 3 months'}</span></span>
          <span className="text-[16px] font-bold tabular-nums" style={{ color: '#1E8F5F' }}>{money(plan.income)}</span>
        </Link>
        {parts.map(p => (
          <Link key={p.key} href={p.href} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 items-center py-3" style={{ borderTop: '1px solid var(--track)' }}>
            <span className="flex flex-col min-w-0"><span className="text-[14px] font-semibold flex items-center gap-2" style={{ color: 'var(--text)' }}><span className="w-2.5 h-2.5 rounded-[3px]" style={{ background: p.color }} />{p.label}</span><span className="text-[12.5px] truncate" style={{ color: 'var(--text3)' }}>{p.sub}</span></span>
            <span className="text-[16px] font-bold tabular-nums" style={{ color: 'var(--text)' }}>− {money(p.amount)}</span>
          </Link>
        ))}
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 items-center rounded-xl px-4 py-3 mt-1" style={{ background: over ? '#FDECE8' : 'var(--accent-bg)' }}>
          <span className="text-[14px] font-bold" style={{ color: over ? '#B42318' : 'var(--accent2)' }}>= Left</span>
          <span className="text-[18px] font-bold tabular-nums" style={{ color: over ? '#B42318' : 'var(--accent2)' }}>{over ? '−' : ''}{money(Math.abs(plan.left))}</span>
        </div>
      </section>

      {plan.short > 0 && fixes.length > 0 && <FixesCard fixes={fixes} short={plan.short} cur={cur} />}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 md:gap-3.5">
        <Link href="/dashboard/bills" className="wl-card px-4 py-4 flex flex-col gap-1">
          <span className="text-[11.5px] font-semibold uppercase tracking-[0.05em]" style={{ color: 'var(--text3)' }}>Bills</span>
          <span className="text-[18px] font-bold tabular-nums" style={{ color: 'var(--text)' }}>{short(plan.bills + plan.emis)}<span className="text-[12px] font-normal" style={{ color: 'var(--text3)' }}> a month</span></span>
          <span className="text-[12.5px]" style={{ color: 'var(--text3)' }}>{nextBill ? `Next: ${nextBill.name}, ${fmtDay(nextBill.date)}` : 'Nothing set up yet'}</span>
        </Link>
        <Link href="/dashboard/goals" className="wl-card px-4 py-4 flex flex-col gap-1">
          <span className="text-[11.5px] font-semibold uppercase tracking-[0.05em]" style={{ color: 'var(--text3)' }}>Goals</span>
          <span className="text-[18px] font-bold" style={{ color: 'var(--text)' }}>{oneOff.length ? `${onTrack} of ${oneOff.length} on track` : 'None yet'}</span>
          <span className="text-[12.5px]" style={{ color: plan.short > 0 ? 'var(--amber-text)' : 'var(--text3)' }}>{plan.short > 0 ? `${short(plan.short)} a month short` : oneOff.length ? 'Everything fits what you save' : 'Set your first goal'}</span>
        </Link>
        <Link href="/dashboard/budgets" className="wl-card px-4 py-4 flex flex-col gap-1">
          <span className="text-[11.5px] font-semibold uppercase tracking-[0.05em]" style={{ color: 'var(--text3)' }}>Budgets</span>
          <span className="text-[18px] font-bold tabular-nums" style={{ color: 'var(--text)' }}>{short(Math.max(0, plan.everyday - plan.everydaySpent))} left</span>
          <span className="text-[12.5px]" style={{ color: 'var(--text3)' }}>{daysLeft > 0 ? `About ${short(Math.max(0, plan.everyday - plan.everydaySpent) / daysLeft)} a day` : 'Month ends today'}</span>
        </Link>
        <Link href={event ? `/dashboard/events/${event.id}` : '/dashboard/events'} className="wl-card px-4 py-4 flex flex-col gap-1">
          <span className="text-[11.5px] font-semibold uppercase tracking-[0.05em]" style={{ color: 'var(--text3)' }}>Coming up</span>
          <span className="text-[18px] font-bold truncate" style={{ color: 'var(--text)' }}>{event ? event.name : 'No trips planned'}</span>
          <span className="text-[12.5px]" style={{ color: 'var(--text3)' }}>{event ? `${fmtDay(String(event.start_date))}${Number(event.budget) > 0 ? ` · ${short(Number(event.budget))} budget` : ''}` : 'Add a trip or function'}</span>
        </Link>
      </div>
    </div>
  )
}
