'use client'
import { useMemo } from 'react'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { fmtCompact, fmtMoney } from '@/lib/format'
import { fmtDay, daysBetween } from '@/lib/insights'
import { kindOf } from '@/lib/ledger'
import { spendByCategory, budgetLines, budgetLabel, FIXED } from '@/lib/budgets'
import { fixesFor, payFirstDue, yearAheadPlan } from '@/lib/plan'
import { buildDues } from '@/lib/moneyOverview'
import { planTax, LIMITS, type TaxInput } from '@/lib/tax'
import { MON, MONTH } from '@/lib/period'
import type { PlanData } from '@/lib/planData'
import { usePlanModel } from './usePlanModel'
import { CurSwitch, FixesCard, PayFirstRow } from './PlanParts'
import { TrendTile, GOOD, BAD, NONE, Card, type Pt } from '../charts/parts'
import InsidePanel from '../charts/Inside'
import { BalanceAhead, YearColumns } from './PlanCharts'
import TodoBar from '../todo/TodoBar'
import HelpButton from '@/components/ui/HelpButton'

const PART = { bills: '#F2A65A', everyday: '#6E8FF0', goals: '#3FBF8C', left: '#D9DCE6' }

// Plan › Overview: where the money is going next — this month's plan and how
// it's going, budgets running fast, what's due, goals, the bank balance at
// each month's end for a year, tax room, then a tile for each tab inside
// Plan. Every figure is the same as on the tab it opens (lib/plan, lib/budgets).
export default function PlanHomeClient({ data, tax }: { data: PlanData; tax?: TaxInput }) {
  const { cur, setCur, showSwitch, today, built, plan } = usePlanModel(data)
  const money = (n: number) => fmtMoney(n, cur), short = (n: number) => fmtCompact(n, cur)
  const ym = today.slice(0, 7), month = MONTH[Number(ym.slice(5)) - 1]
  const dim = new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5)), 0)).getUTCDate(), day = Number(today.slice(8, 10))
  const daysLeft = dim - day, pace = day / dim * 100
  const view = cur === 'AED' ? 'uae' as const : 'india' as const

  const fixes = useMemo(() => fixesFor({ cur, today, items: built.items, short: plan.short, budgetRows: data.budgets, spent: spendByCategory(data.transactions, ym, cur), links: data.links }),
    [cur, today, built, plan.short, data, ym])
  const due = useMemo(() => payFirstDue({ mode: data.payFirst, cur, today, txns: data.transactions, items: built.items, links: data.links, saving: plan.saving, usualIncome: plan.income, fx: data.fx, answers: data.answers, contributions: data.contributions }),
    [data, cur, today, built, plan])

  // What leaves the bank in the next 30 days, and before the month ends
  const dues = useMemo(() => buildDues({ today, days: 30, view, txns: data.transactions, accounts: data.accounts, loans: data.loans, insurance: data.insurance,
    mutualFunds: data.investments.mutual_funds ?? [], recurring: data.recurring, rds: data.investments.recurring_deposits ?? [], plans: data.plans,
    lic: data.investments.lic_policies ?? [], bills: data.bills, answers: data.answers, builder: data.builder }).filter(d => d.currency === cur), [data, today, view, cur])
  const due30 = dues.reduce((s, d) => s + d.amount, 0)
  const toComeThisMonth = dues.filter(d => d.date.slice(0, 7) === ym).reduce((s, d) => s + d.amount, 0)

  // The year ahead (Plan › Year ahead) and the bank balance at each month's end
  const year = useMemo(() => yearAheadPlan({ cur, today, plan, txns: data.transactions, accounts: data.accounts, loans: data.loans, insurance: data.insurance,
    mutualFunds: data.investments.mutual_funds ?? [], rds: data.investments.recurring_deposits ?? [], recurring: data.recurring, lic: data.investments.lic_policies ?? [],
    bills: data.bills, answers: data.answers, events: data.events, builder: data.builder }), [cur, today, plan, data])
  const cash = data.accounts.filter(a => kindOf(a) !== 'card' && a.currency === cur).reduce((s, a) => s + (Number(a.current_balance) || 0), 0)
  const bal: number[] = []
  year.forEach((m, i) => bal.push((i ? bal[i - 1] : cash) + (i ? m.left : m.left * daysLeft / dim)))
  const low = bal.reduce((b, x, i) => (x < bal[b] ? i : b), 0)
  const needs = built.monthly[cur]?.essentials ?? 0
  const pts: Pt[] = year.map(m => ({ label: MON[Number(m.ym.slice(5)) - 1], title: `End of ${MONTH[Number(m.ym.slice(5)) - 1]} ${m.ym.slice(0, 4)}`, ix: [], sel: false }))
  const extras = (m: typeof year[number]) => m.lines.filter(l => l.label !== 'Everyday spending' && l.label !== 'Goals')
  const bigOut = year.reduce((s, m) => s + extras(m).reduce((a, l) => a + l.amount, 0), 0)
  const tightest = [...year].sort((a, b) => a.left - b.left)[0]

  // Budgets running fast (fixed costs paid on a date have no pace)
  const lines = useMemo(() => budgetLines(data.budgets, spendByCategory(data.transactions, ym, cur), ym, cur, { rows: data.categories }).filter(l => !l.inside && l.cap > 0), [data, ym, cur])
  const flex = lines.filter(l => !FIXED.has(l.category))
  const fast = flex.filter(l => l.status === 'over' || l.pct > pace + 10)
  const watch = [...flex].sort((a, b) => (b.pct - pace) - (a.pct - pace)).slice(0, 4)
  const budgetSpent = flex.reduce((s, l) => s + l.spent, 0), budgetCap = flex.reduce((s, l) => s + l.cap, 0)

  // Goals in this currency (one-time ones; repeating set-asides are bills)
  const goals = built.items.filter(it => it.goal.currency === cur && !it.rec && it.goal.status !== 'cancelled' && it.plan.status !== 'achieved')
  const onTrack = goals.filter(it => it.plan.status === 'on_track' || it.plan.status === 'funded').length
  const savedForGoals = goals.reduce((s, it) => s + (it.v.value || 0), 0), goalTarget = goals.reduce((s, it) => s + (Number(it.goal.target_amount) || 0), 0)

  // Tax this financial year (India)
  const tp = useMemo(() => (tax ? planTax(tax, today) : null), [tax, today])
  const room80c = tp ? Math.max(0, LIMITS.c80 - tp.claim.c80) : 0
  const event = data.events.filter(e => !e.closed_at && e.currency === cur && String(e.start_date) >= today).sort((a, b) => String(a.start_date).localeCompare(String(b.start_date)))
  const income = Math.max(plan.income, 1), over = plan.left < 0

  const kpis = [
    { label: over ? 'Planned over income' : 'Left after the plan', color: '#6A55E8', dark: true,
      how: { rows: [[plan.incomeDeclared ? 'Income you expect' : 'Usual income (last 3 months)', money(plan.income)], ['− Bills & EMIs', money(plan.bills + plan.emis)], ['− Everyday spending', money(plan.everyday)], ['− Goals', money(plan.goals)]] as [string, string][],
        total: [over ? '= Short' : '= Left', money(plan.left)] as [string, string], note: 'Everyday spending is your budgets, or your usual spending where there’s no budget. A repeating bill in an everyday category is counted once, in Bills.' }, value: `${over ? '−' : ''}${short(Math.abs(plan.left))}`, sub: `From ${short(plan.income)} ${plan.incomeDeclared ? 'you expect' : 'usual income'}`, d: over ? { t: 'short', s: BAD } : { t: 'fits', s: GOOD }, spark: [], href: '/dashboard/plan',
      mini: { kind: 'split' as const, parts: [{ value: plan.bills + plan.emis, color: PART.bills }, { value: plan.everyday, color: PART.everyday }, { value: plan.goals, color: PART.goals }, { value: Math.max(0, plan.left), color: '#FFFFFF' }] } },
    { label: 'Budgets', color: '#6E8FF0', value: short(budgetSpent), sub: budgetCap > 0 ? `of ${short(budgetCap)} · ${daysLeft} day${daysLeft === 1 ? '' : 's'} left` : 'No budgets set this month', d: budgetCap === 0 ? { t: '—', s: NONE } : fast.length ? { t: `${fast.length} running fast`, s: BAD } : { t: 'on pace', s: GOOD }, spark: [], href: '/dashboard/budgets',
      mini: budgetCap > 0 ? { kind: 'progress' as const, pct: budgetSpent / budgetCap * 100, color: budgetSpent / budgetCap * 100 > pace + 10 ? '#F59E0B' : '#6E8FF0' } : undefined },
    { label: 'Bills, next 30 days', color: '#F2A65A', value: short(due30), sub: dues[0] ? `Next: ${dues[0].label}, ${daysBetween(today, dues[0].date) === 0 ? 'today' : fmtDay(dues[0].date)}` : 'Nothing due', d: { t: `${dues.length} due`, s: NONE }, spark: [], href: '/dashboard/bills',
      mini: dues.length ? { kind: 'bars' as const, values: dues.slice(0, 10).map(d => d.amount), color: '#F2A65A' } : undefined },
    { label: 'Goals', color: '#3FBF8C', value: short(plan.goals), sub: goals.length ? `a month · ${short(savedForGoals)} saved so far` : 'No goals yet', d: goals.length ? { t: `${onTrack} of ${goals.length} on track`, s: onTrack === goals.length ? GOOD : BAD } : { t: '—', s: NONE }, spark: [], href: '/dashboard/goals',
      mini: goalTarget > 0 ? { kind: 'progress' as const, pct: savedForGoals / goalTarget * 100, color: '#3FBF8C' } : undefined },
    { label: 'Lowest balance', color: '#2FB67C', value: short(bal[low] ?? cash), sub: year[low] ? `End of ${MONTH[Number(year[low].ym.slice(5)) - 1]}${needs > 0 ? ` · stays ${(bal[low] ?? 0) >= needs ? 'above' : 'below'} a month of needs` : ''}` : '', d: needs > 0 ? ((bal[low] ?? 0) >= needs ? { t: 'safe', s: GOOD } : { t: 'tight', s: BAD }) : { t: '—', s: NONE }, spark: bal, href: '/dashboard/plan/year' },
    { label: 'Tax-saving room', color: '#8B5CF6', value: tp ? fmtCompact(room80c, 'INR') : '—', sub: tp ? `Left under 80C · by 31 Mar` : 'India tax', d: tp ? { t: `FY ${tp.fy.start.slice(2, 4)}-${tp.fy.end.slice(2, 4)}`, s: NONE } : { t: '—', s: NONE }, spark: [], href: '/dashboard/tax',
      mini: tp ? { kind: 'progress' as const, pct: tp.claim.c80 / LIMITS.c80 * 100, color: '#8B5CF6' } : undefined },
  ]

  const parts = [
    { key: 'bills', label: 'Bills & EMIs', color: PART.bills, amount: plan.bills + plan.emis, right: toComeThisMonth > 0 ? `${short(toComeThisMonth)} still to go out` : 'All paid this month', pct: null as number | null, href: '/dashboard/bills' },
    { key: 'everyday', label: 'Everyday spending', color: PART.everyday, amount: plan.everyday, right: `${short(plan.everydaySpent)} spent of ${short(plan.everyday)}`, pct: plan.everyday > 0 ? plan.everydaySpent / plan.everyday * 100 : null, href: '/dashboard/budgets' },
    { key: 'goals', label: 'Goals', color: PART.goals, amount: plan.goals, right: plan.goalRows.length ? `${plan.goalRows.length} goal${plan.goalRows.length === 1 ? '' : 's'}` : 'No one-time goals', pct: null, href: '/dashboard/goals' },
  ]
  const widths = [...parts.map(p => Math.max(0, p.amount) / income * 100), Math.max(0, plan.left) / income * 100]
  // A month's label: its biggest payment that isn't there most months (an EMI every month says nothing)
  const seen: Record<string, number> = {}
  for (const m of year) for (const l of Array.from(new Set(extras(m).map(x => x.label)))) seen[l] = (seen[l] ?? 0) + 1
  const tagOf = (m: typeof year[number]) => { const e = extras(m).find(l => (seen[l.label] ?? 0) <= 4 && l.amount > plan.income * 0.1); return e ? `${e.label.split(' · ')[0]} ${short(e.amount)}` : null }

  const inside = [
    { title: 'Budgets', href: '/dashboard/budgets', value: flex.length ? `${flex.length - fast.length} of ${flex.length}` : '—', unit: flex.length ? 'on pace' : undefined, line: fast.length ? `${fast.slice(0, 2).map(l => budgetLabel(l.category)).join(' and ')} running fast` : flex.length ? 'Everything within its pace' : 'Set a budget to see its pace', mini: flex.length ? { kind: 'blocks' as const, colors: flex.slice(0, 12).map(l => (fast.includes(l) ? '#F59E0B' : '#6E8FF0')) } : undefined },
    { title: 'Bills', href: '/dashboard/bills', value: short(due30), unit: 'next 30 days', line: `${dues.length} due${data.bills.filter(b => b.currency === cur).length ? ` · ${data.bills.filter(b => b.currency === cur).length} big bill${data.bills.filter(b => b.currency === cur).length === 1 ? '' : 's'} set` : ''}`, mini: dues.length ? { kind: 'bars' as const, values: dues.slice(0, 10).map(d => d.amount), color: '#F2A65A' } : undefined },
    { title: 'Goals', href: '/dashboard/goals', value: short(savedForGoals), unit: `saved for ${goals.length} goal${goals.length === 1 ? '' : 's'}`, line: goals.find(it => it.plan.status === 'behind') ? `${goals.find(it => it.plan.status === 'behind')!.goal.name} is behind` : goals.length ? 'All on track' : 'Set your first goal', mini: goalTarget > 0 ? { kind: 'progress' as const, pct: savedForGoals / goalTarget * 100, color: '#3FBF8C' } : undefined },
    { title: 'Year ahead', href: '/dashboard/plan/year', value: short(bigOut), unit: 'set to go out', line: tightest && tightest.state !== 'comfortable' ? `${MONTH[Number(tightest.ym.slice(5)) - 1]} is ${tightest.state}` : 'Every month looks comfortable', mini: { kind: 'bars' as const, values: year.map(m => extras(m).reduce((a, l) => a + l.amount, 0)), color: '#F2A65A' } },
    { title: 'What if', href: '/dashboard/plan/what-if', value: 'Try a change', line: 'Prepay a loan, buy something big, earn more or less — see the effect first' },
    { title: 'Events & trips', href: '/dashboard/events', value: String(event.length), unit: 'coming up', line: event[0] ? `${event[0].name}, ${fmtDay(String(event[0].start_date))}${Number(event[0].budget) > 0 ? ` · ${short(Number(event[0].budget))}` : ''}` : 'Add a trip or function' },
    { title: 'Cash-flow forecast', href: '/dashboard/cashflow', value: short(bal[low] ?? cash), unit: 'lowest ahead', line: year[low] ? `End of ${MONTH[Number(year[low].ym.slice(5)) - 1]}` : 'Your balance, day by day', mini: { kind: 'spark' as const, values: bal, color: '#1E8A5C' } },
    { title: 'Tax planner', href: '/dashboard/tax', value: tp ? fmtCompact(room80c, 'INR') : '—', unit: '80C room left', line: tp ? `${tp.fy.label} · ${tp.monthsLeft} month${tp.monthsLeft === 1 ? '' : 's'} left` : 'India tax', mini: tp ? { kind: 'progress' as const, pct: tp.claim.c80 / LIMITS.c80 * 100, color: '#8B5CF6' } : undefined },
  ]

  return (
    <div className="flex flex-col gap-3.5 md:gap-[18px] animate-fade-up">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[13px]" style={{ color: 'var(--text3)' }}>Plan · {month}, day {day} of {dim}</div>
          <h1 className="text-[22px] md:text-[26px] font-bold tracking-[-0.02em]" style={{ color: 'var(--text)' }}>Where your money is going next<HelpButton /></h1>
        </div>
        {showSwitch && <CurSwitch cur={cur} onChange={setCur} />}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2.5 md:gap-3">
        {kpis.map((k, i) => <TrendTile key={k.label} {...k} gid={`pk${i}`} />)}
      </div>

      <TodoBar area="plan" />

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

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.6fr)_minmax(300px,1fr)] gap-3.5 md:gap-4 items-stretch">
        <Card title={`${month}’s plan`} sub={`${money(plan.income)} ${plan.incomeDeclared ? 'you expect' : 'usual income'} · tap a line to open its page`}
          right={<Link href="/dashboard/plan/what-if" className="text-[12.5px] font-semibold" style={{ color: 'var(--accent)' }}>What if…</Link>}>
          <div role="img" aria-label={`${money(plan.income)} split: ${parts.map(p => `${p.label} ${money(p.amount)}`).join(', ')}, left ${money(plan.left)}`} className="flex h-[26px] rounded-lg overflow-hidden gap-[2px]" style={{ background: '#F1F2F6' }}>
            {parts.map((p, i) => widths[i] > 0 && <div key={p.key} style={{ width: `${widths[i]}%`, background: p.color }} />)}
            {!over && widths[3] > 0 && <div style={{ width: `${widths[3]}%`, background: PART.left }} />}
          </div>
          <div className="flex flex-col">
            {parts.map(p => (
              <Link key={p.key} href={p.href} className="grid grid-cols-[150px_minmax(0,1fr)] md:grid-cols-[170px_minmax(0,1fr)_auto] gap-x-3 gap-y-1 items-center py-2.5 text-[13px]" style={{ borderTop: '1px solid var(--track)', color: 'var(--text)' }}>
                <span className="flex items-center gap-2 font-semibold"><i className="w-2.5 h-2.5 rounded-[3px]" style={{ background: p.color }} />{p.label}</span>
                <span className="relative h-2 rounded-full" style={{ background: '#EEF0F5' }}>
                  {p.pct != null && <span className="block h-2 rounded-full" style={{ width: `${Math.min(100, p.pct)}%`, background: p.pct > pace + 10 ? '#F59E0B' : p.color }} />}
                  {p.pct == null && <span className="block h-2 rounded-full" style={{ width: `${Math.min(100, p.amount / income * 100)}%`, background: p.color, opacity: 0.55 }} />}
                  {p.pct != null && <span className="absolute -top-[3px] -bottom-[3px]" style={{ left: `${pace}%`, borderLeft: '2px solid #14172B' }} aria-hidden="true" />}
                </span>
                <span className="col-span-2 md:col-span-1 text-right tabular-nums"><b>{money(p.amount)}</b> <span className="text-[12px]" style={{ color: 'var(--text3)' }}>· {p.right}</span></span>
              </Link>
            ))}
            <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 items-center rounded-xl px-4 py-3 mt-1" style={{ background: over ? '#FDECE8' : 'var(--accent-bg)' }}>
              <span className="text-[14px] font-bold" style={{ color: over ? '#B42318' : 'var(--accent2)' }}>= {over ? 'Short' : 'Left'}</span>
              <span className="text-[17px] font-bold tabular-nums" style={{ color: over ? '#B42318' : 'var(--accent2)' }}>{over ? '−' : ''}{money(Math.abs(plan.left))}</span>
            </div>
          </div>
          <p className="text-[12px]" style={{ color: 'var(--text3)' }}>The black mark is where you’d be at an even pace (day {day} of {dim}). Bills, EMIs and goals go out on their dates, so they have no pace.</p>
        </Card>

        <Card title="Budgets to watch" right={<Link href="/dashboard/budgets" className="text-[12.5px] font-semibold" style={{ color: 'var(--accent)' }}>{flex.length ? `All ${flex.length}` : 'Set budgets'}</Link>}>
          {watch.length === 0 ? <p className="text-[12.5px] py-6 text-center" style={{ color: 'var(--text3)' }}>No budgets for {month} yet. Set one and its pace shows here.</p> : (
            <div className="flex flex-col gap-3.5">
              {watch.map(l => {
                const ahead = l.spent - l.cap * pace / 100, isFast = l.status === 'over' || l.pct > pace + 10
                return (
                  <Link key={l.category} href={`/dashboard/expenses?from=${ym}&to=${ym}&cat=${encodeURIComponent(l.category)}`} className="block rounded-lg -mx-1.5 px-1.5 py-0.5 hover:bg-[#FAFAFE]">
                    <div className="flex justify-between gap-2 text-[13px]" style={{ color: 'var(--text)' }}><span className="truncate">{budgetLabel(l.category)}</span><span className="tabular-nums whitespace-nowrap"><b>{short(l.spent)}</b> <span style={{ color: 'var(--text3)' }}>of {short(l.cap)}</span></span></div>
                    <div className="relative h-2 rounded-full mt-1.5" style={{ background: '#EEF0F5' }}>
                      <div className="h-2 rounded-full" style={{ width: `${Math.min(100, l.pct)}%`, background: l.status === 'over' ? '#E5484D' : isFast ? '#F59E0B' : '#6E8FF0' }} />
                      <div className="absolute -top-[3px] -bottom-[3px]" style={{ left: `${pace}%`, borderLeft: '2px solid #14172B' }} aria-hidden="true" />
                    </div>
                    <div className="text-[11.5px] mt-1" style={{ color: l.status === 'over' ? '#B4231A' : isFast ? '#B45309' : '#15803D' }}>
                      {l.status === 'over' ? `Over by ${short(-l.left)}` : isFast ? `${short(ahead)} ahead of pace` : ahead < 0 ? `${short(-ahead)} under pace` : 'On pace'}
                    </div>
                  </Link>
                )
              })}
            </div>
          )}
        </Card>
      </div>

      {plan.short > 0 && fixes.length > 0 && <FixesCard fixes={fixes} short={plan.short} cur={cur} />}

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.6fr)_minmax(300px,1fr)] gap-3.5 md:gap-4 items-stretch">
        <BalanceAhead pts={pts} bal={bal} line={needs} short={short} money={money} notes={year.map(tagOf)}
          sub={`Today ${short(cash)} in your ${cur === 'AED' ? 'UAE' : 'India'} accounts, plus each month’s expected income, less what’s planned to leave (as on Year ahead)`} />
        <Card title="Due in the next 30 days" right={<Link href="/dashboard/bills" className="text-[12.5px] font-semibold" style={{ color: 'var(--accent)' }}>Bills</Link>}>
          {dues.length === 0 ? <p className="text-[12.5px] py-6 text-center" style={{ color: 'var(--text3)' }}>Nothing due in the next 30 days.</p> : (
            <ul>
              {dues.slice(0, 5).map(d => {
                const n = daysBetween(today, d.date)
                return (
                  <li key={d.id} style={{ borderTop: '1px solid #F1F5F9' }}>
                    <Link href={d.href ?? '/dashboard/bills'} className="flex items-center gap-3 py-2.5 -mx-2 px-2 rounded-lg hover:bg-[#F5F3FE]">
                      <span className="w-10 text-center flex-shrink-0 leading-tight">{n === 0 ? <span className="text-[11px] font-bold" style={{ color: '#B4231A' }}>TODAY</span> : <><b className="block text-[15px] tabular-nums" style={{ color: 'var(--text)' }}>{Number(d.date.slice(8, 10))}</b><span className="text-[10.5px] uppercase" style={{ color: 'var(--text3)' }}>{MON[Number(d.date.slice(5, 7)) - 1]}</span></>}</span>
                      <span className="flex-1 min-w-0"><span className="block text-[13px] font-semibold truncate" style={{ color: 'var(--text)' }}>{d.label}</span><span className="block text-[11.5px] truncate" style={{ color: 'var(--text3)' }}>{d.sub}</span></span>
                      <b className="text-[13px] tabular-nums whitespace-nowrap" style={{ color: 'var(--text)' }}>{fmtMoney(d.amount, d.currency)}</b>
                    </Link>
                  </li>
                )
              })}
              {dues.length > 5 && <li className="flex justify-between py-2.5 text-[12.5px]" style={{ borderTop: '1px solid #F1F5F9', color: 'var(--text3)' }}><span>+ {dues.length - 5} more</span><b className="tabular-nums" style={{ color: 'var(--text)' }}>{short(dues.slice(5).reduce((s, d) => s + d.amount, 0))}</b></li>}
            </ul>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5 md:gap-4 items-stretch">
        <Card title="Goals" right={<Link href="/dashboard/goals" className="text-[12.5px] font-semibold" style={{ color: 'var(--accent)' }}>All goals</Link>}>
          {goals.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-center gap-2 py-6 flex-1">
              <p className="text-[13px] font-semibold" style={{ color: 'var(--text)' }}>No goals in {cur === 'AED' ? 'dirhams' : 'rupees'} yet</p>
              <p className="text-[12.5px] max-w-xs" style={{ color: 'var(--text3)' }}>A goal turns a date and an amount into what to set aside each month, and it shows here with how it’s going.</p>
              <Link href="/dashboard/goals" className="wl-btn wl-btn-primary mt-1" style={{ height: 34 }}>Set a goal</Link>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {goals.slice(0, 4).map(it => {
                const pct = Math.max(0, Math.min(100, it.plan.pct)), ok = it.plan.status === 'on_track' || it.plan.status === 'funded', C = 2 * Math.PI * 18
                return (
                  <Link key={it.goal.id} href={`/dashboard/goals/${it.goal.id}`} className="flex items-center gap-3 -mx-2 px-2 py-1 rounded-lg hover:bg-[#F5F3FE]">
                    <svg viewBox="0 0 44 44" className="w-11 h-11 flex-shrink-0" aria-hidden="true"><circle cx="22" cy="22" r="18" fill="none" stroke="#EEF0F5" strokeWidth="6" /><circle cx="22" cy="22" r="18" fill="none" stroke={ok ? '#3FBF8C' : '#F59E0B'} strokeWidth="6" strokeLinecap="round" strokeDasharray={`${(pct / 100 * C).toFixed(1)} ${C.toFixed(1)}`} transform="rotate(-90 22 22)" /></svg>
                    <span className="flex-1 min-w-0 text-[13px]" style={{ color: 'var(--text)' }}><b className="truncate block">{it.goal.name}</b><span className="block text-[11.5px] truncate" style={{ color: 'var(--text3)' }}>{short(it.v.value)} of {short(Number(it.goal.target_amount) || 0)}{it.goal.target_date ? ` · ${MON[Number(String(it.goal.target_date).slice(5, 7)) - 1]} ${String(it.goal.target_date).slice(0, 4)}` : ''}{it.plan.need > 0 ? ` · ${short(it.plan.need)}/mo` : ''}</span></span>
                    <span className="text-[11px] font-semibold px-2 py-[2px] rounded-full whitespace-nowrap" style={ok ? GOOD : { background: '#FFF4DE', color: '#B45309' }}>{ok ? 'on track' : it.plan.status === 'new' ? 'not started' : 'behind'}</span>
                  </Link>
                )
              })}
            </div>
          )}
        </Card>

        <Card title="Tax this year" sub={tp ? `${tp.fy.label} · India income` : 'India income'} right={<Link href="/dashboard/tax" className="text-[12.5px] font-semibold" style={{ color: 'var(--accent)' }}>Tax planner</Link>}>
          {tp ? (<>
            <div className="flex flex-col gap-3">
              {[
                { k: '80C', label: '80C (PPF, ELSS, LIC, loan principal)', used: tp.claim.c80, cap: LIMITS.c80 },
                { k: '80D', label: '80D (health cover)', used: tp.claim.d80, cap: LIMITS.d80 },
                { k: '24b', label: '24(b) (home loan interest)', used: tp.claim.b24, cap: LIMITS.b24 },
                ...(tp.hasNps ? [{ k: 'nps', label: '80CCD(1B) (NPS)', used: tp.claim.ccd1b, cap: LIMITS.ccd1b }] : []),
              ].map(r => (
                <div key={r.k}>
                  <div className="flex justify-between gap-2 text-[13px]" style={{ color: 'var(--text)' }}><span className="truncate">{r.label}</span><span className="tabular-nums whitespace-nowrap"><b>{fmtCompact(r.used, 'INR')}</b> <span style={{ color: 'var(--text3)' }}>of {fmtCompact(r.cap, 'INR')}</span></span></div>
                  <div className="h-2 rounded-full mt-1.5" style={{ background: '#EEF0F5' }}><div className="h-2 rounded-full" style={{ width: `${Math.min(100, r.used / r.cap * 100)}%`, background: '#6A55E8' }} /></div>
                </div>
              ))}
            </div>
            <p className="text-[12.5px] rounded-[10px] px-3 py-2.5" style={{ background: '#F4F2FF', color: 'var(--text2)' }}>
              {room80c > 0 ? <>{fmtMoney(room80c, 'INR')} more under 80C, under the old regime, is up to <b style={{ color: 'var(--text)' }}>{fmtMoney(room80c * 0.312, 'INR')}</b> less tax at the 30% slab. {tp.daysLeft} days left in the year.</> : '80C is used in full this year.'}
            </p>
          </>) : <p className="text-[12.5px] py-6 text-center" style={{ color: 'var(--text3)' }}>Your tax picture shows here once your India investments are in.</p>}
        </Card>
      </div>

      <Card title="The year ahead" sub="Each month: what’s expected in, less what’s planned to go out. Above the line is left over, below is short."
        right={<Link href="/dashboard/plan/year" className="text-[12.5px] font-semibold" style={{ color: 'var(--accent)' }}>Year ahead</Link>}>
        <YearColumns pts={year.map(m => ({ label: MON[Number(m.ym.slice(5)) - 1], title: `${MONTH[Number(m.ym.slice(5)) - 1]} ${m.ym.slice(0, 4)}`, ix: [], sel: false }))}
          left={year.map(m => m.left)} tags={year.map(tagOf)} states={year.map(m => m.state)} short={short} money={money} />
        {tightest && tightest.state !== 'comfortable' && (
          <p className="text-[12.5px] rounded-[10px] px-3 py-2.5" style={{ background: tightest.state === 'short' ? '#FDECE8' : '#FFF4DE', color: 'var(--text2)' }}>
            <b style={{ color: 'var(--text)' }}>{MONTH[Number(tightest.ym.slice(5)) - 1]} is {tightest.state}</b>: {extras(tightest).slice(0, 2).map(l => `${l.label} ${short(l.amount)}`).join(' and ') || 'spending is planned above income'}. <Link href="/dashboard/plan/what-if" className="font-semibold" style={{ color: 'var(--accent)' }}>Try it in What if</Link>
          </p>
        )}
      </Card>

      <InsidePanel title="Inside Plan" items={inside} />
    </div>
  )
}
