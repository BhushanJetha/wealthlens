'use client'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Plus, Upload, Mic, Sparkles, TrendingUp, Wallet, ChevronRight, type LucideIcon } from 'lucide-react'
import { useViewStore } from '@/store/viewStore'
import { useUiStore } from '@/store/uiStore'
import { useHolderStore } from '@/store/holderStore'
import { holderMatches } from '@/hooks/useFamily'
import { computeNetWorth, viewAmount, type Holdings } from '@/lib/netWorth'
import { buildHomeInsights, localToday, type Snapshot, type Attention } from '@/lib/insights'
import { goalCurrentValue } from '@/lib/goalProgress'
import { fmtMoney, fmtCompact } from '@/lib/format'
import { newGoalHref } from '@/lib/goalInterests'
import AddTransactionModal from '@/components/forms/AddTransactionModal'
import TransactionVoiceModal from '@/components/forms/TransactionVoiceModal'
import NotificationsPanel from '@/components/layout/NotificationsPanel'
import { MobileControls, SearchButton, AskAiButton } from '@/components/layout/MobileHeader'
import { buildDues, expectedIncome, balanceWarnings, safeToSpend } from '@/lib/moneyOverview'
import { spendRoom } from '@/lib/spendRoom'
import { nextWeek, homePlan, earnedIncoming, cashDues, usualSpendLeft } from '@/lib/homePlan'
import type { RecurringTxn } from '@/lib/recurring'
import PendingConfirms, { pendingCount, type Pending } from './PendingConfirms'
import IncomeChecks, { incomeCheckCount } from './IncomeChecks'
import { plannedIncoming, mergeExpected, declaredIncome, declaredPayday, type IncomePlan } from '@/lib/incomePlans'
import BillReminders, { billReminderCount } from './BillReminders'
import LandedChecks, { landedCheckCount } from './LandedChecks'
import type { Bill } from '@/lib/bigBills'
import { payFirstDue, type PayFirstMode } from '@/lib/plan'
import { buildGoals } from '@/lib/goalsView'
import { PayFirstRow } from './plan/PlanParts'
import { foundRegular, pendingCharges } from '@/lib/regular'
import HomeTrends from './HomeTrends'
import { FreeBanner, NextMonthCard, BudgetsCard, DueWeekCard, GoalRingsCard, LoansCard, NeedsYouBar } from './HomeNow'
import { useTodo } from './todo/useTodo'

interface Props {
  firstName: string | null
  today: string
  holdings: Holdings
  transactions: any[]
  insurance: any[]
  budgets: any[]
  goals: any[]
  goalInvestments: any[]
  snapshots: Snapshot[]
  historyReady: boolean
  goalInterests: string[]
  pending: Pending              // auto entries waiting for approval, and anything to confirm
  recurring: RecurringTxn[]
  bills: Bill[]
  billSkips: string[]
  contributions: any[]
  payFirst: PayFirstMode
  events: any[]; friends: any[]; splits: any[]; friendTxns: any[]
  plans: IncomePlan[]; plansReady: boolean; fx: number
}

const MONTHS_LONG = ['January','February','March','April','May','June','July','August','September','October','November','December']
const SEV_DOT: Record<Attention['severity'], string> = { high: '#DC2626', medium: '#D97706', low: '#6A55E8' }

export default function DashboardClient(p: Props) {
  const router = useRouter()
  const { view, toMonth, fxRate: FX } = useViewStore()
  const { selectedHolder: holder } = useHolderStore()
  const { setUploadOpen, openAdvisor, openAdd } = useUiStore()
  const [modal, setModal] = useState<null | 'add' | 'voice'>(null)
  const [needsOpen, setNeedsOpen] = useState(false)
  const cur = view === 'uae' ? 'AED' : 'INR'
  const money = (n: number) => fmtMoney(n, cur)
  const short = (n: number) => fmtCompact(n, cur)

  // Browser-local "today" + greeting (set after mount so SSR markup matches)
  const [today, setToday] = useState(p.today)
  const [greeting, setGreeting] = useState('Welcome back')
  useEffect(() => {
    setToday(localToday())
    const h = new Date().getHours()
    setGreeting(h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening')
  }, [])

  // Onboarding hands off with ?start=upload|add so the chosen first step opens right away
  useEffect(() => {
    const start = new URLSearchParams(window.location.search).get('start')
    if (!start) return
    if (start === 'upload') setUploadOpen(true)
    else if (start === 'add') setModal('add')
    window.history.replaceState(null, '', window.location.pathname)
  }, [setUploadOpen])

  // The Topbar month picker chooses the month Home describes (its end month)
  const focusMonth = toMonth > today.slice(0, 7) ? today.slice(0, 7) : toMonth

  // Family filter: investments & loans follow the holder; bank accounts belong
  // to the account owner; transactions/insurance stay household-wide.
  const h = useMemo<Holdings>(() => {
    const f = (rows: any[]) => (rows ?? []).filter(r => holderMatches(r, holder))
    const ownerView = !holder || holder === 'Self'
    return {
      accounts: ownerView ? p.holdings.accounts : [], stocks: f(p.holdings.stocks), mutualFunds: f(p.holdings.mutualFunds),
      etf: f(p.holdings.etf), nps: f(p.holdings.nps), fixedDeposits: f(p.holdings.fixedDeposits),
      recurringDeposits: f(p.holdings.recurringDeposits), ppfEpf: f(p.holdings.ppfEpf), gold: f(p.holdings.gold),
      bonds: f(p.holdings.bonds), lic: f(p.holdings.lic), loans: f(p.holdings.loans),
    }
  }, [p.holdings, holder])

  const nw = useMemo(() => computeNetWorth(h, view, FX), [h, view, FX])
  const ins = useMemo(() => buildHomeInsights({
    view, fx: FX, today, focusMonth,
    txns: p.transactions,
    accounts: h.accounts, loans: h.loans, insurance: p.insurance,
    fixedDeposits: h.fixedDeposits, budgets: p.budgets,
    mutualFunds: h.mutualFunds, stocks: h.stocks,
    cash: nw.cash,
    invested: nw.investments,
  }), [view, FX, today, focusMonth, p, h, nw])
  // Goals: progress from linked investments (same as the Goals tab)
  const goals = useMemo(() => {
    const conv = (v: number, c: string) => view === 'consolidated' && c === 'AED' ? v * FX : v
    const all: Record<string, any[]> = {
      stocks: p.holdings.stocks, mutual_funds: p.holdings.mutualFunds, fixed_deposits: p.holdings.fixedDeposits,
      recurring_deposits: p.holdings.recurringDeposits, nps_accounts: p.holdings.nps, lic_policies: p.holdings.lic,
      gold_investments: p.holdings.gold, bond_investments: p.holdings.bonds, etf_investments: p.holdings.etf,
    }
    return (p.goals ?? [])
      .filter(g => (g.status ?? 'active') === 'active' && Number(g.target_amount) > 0)
      .filter(g => view === 'consolidated' || (view === 'uae' ? g.currency === 'AED' : g.currency !== 'AED'))
      .map(g => {
        const target = conv(Number(g.target_amount), g.currency ?? 'INR')
        const current = goalCurrentValue(g.id, p.goalInvestments ?? [], all, conv)
        return { ...g, target, current, pct: target > 0 ? Math.min(100, Math.round(current / target * 100)) : 0 }
      })
      .sort((a, b) => b.pct - a.pct).slice(0, 3)
  }, [p.goals, p.goalInvestments, p.holdings, view, FX])

  const isEmpty = p.transactions.length === 0 && nw.totalAssets === 0 && nw.totalLiab === 0
  const [y, m] = focusMonth.split('-').map(Number)
  const rangeLabel = `${MONTHS_LONG[m - 1]} ${y}`
  const viewLabel = view === 'uae' ? 'UAE · AED' : view === 'india' ? 'India · INR' : 'Consolidated · INR'
  const holderLabel = !holder ? 'Whole family' : holder === 'Self' ? (p.firstName || 'You') : holder
  const onAdded = () => router.refresh()

  // ── What matters now: free to spend, reminders, the plan ahead ──
  const reviewOk = useMemo(() => ({ today, view, FX }), [today, view, FX])
  const dueInp = { today, txns: p.transactions, accounts: h.accounts, loans: h.loans, insurance: p.insurance, mutualFunds: h.mutualFunds, recurring: p.recurring, rds: h.recurringDeposits, plans: p.plans, lic: h.lic, bills: p.bills, answers: p.billSkips }
  const dues = useMemo(() => buildDues({ ...dueInp, days: 45, view }), [reviewOk, p, h]) // eslint-disable-line react-hooks/exhaustive-deps
  const viewAccounts = useMemo(() => h.accounts.filter((a: any) => view === 'consolidated' || (view === 'uae' ? a.currency === 'AED' : a.currency !== 'AED')), [h.accounts, view])
  // Each account's warning counts any money reaching it; the totals count only real income
  const reachingAccounts = useMemo(() => expectedIncome(p.transactions, viewAccounts, today, 45), [p.transactions, viewAccounts, today])
  // What you declared, and the app's estimate for anything you haven't
  const incoming = useMemo(() => mergeExpected(plannedIncoming(p.plans, { today, view, fx: FX, txns: p.transactions, days: 45 }),
    expectedIncome(earnedIncoming(p.transactions, view, FX), viewAccounts, today, 45, { late: true }), p.plans, view), [p.plans, p.transactions, view, FX, viewAccounts, today])
  const warnings = useMemo(() => balanceWarnings(viewAccounts, dues, reachingAccounts, today, 7).filter(w => w.severity !== 'low'), [viewAccounts, dues, reachingAccounts, today])

  // Per currency on its own: dirhams can't pay in India
  const rooms = useMemo(() => (view === 'uae' ? ['AED'] as const : view === 'india' ? ['INR'] as const : ['AED', 'INR'] as const).map(c => {
    const v = c === 'AED' ? 'uae' as const : 'india' as const
    const s = safeToSpend({ today, view: v, fx: FX, accounts: h.accounts.filter((a: any) => a.currency === c), dues: buildDues({ ...dueInp, days: 35, view: v }), txns: p.transactions, payday: declaredPayday(p.plans, today, v, p.transactions), bills: p.bills })
    return { ...spendRoom({ today, cur: c, budgets: p.budgets, txns: p.transactions, safe: s.amount }), until: s.until, perDay: s.perDay, sts: s }
  }), [reviewOk, p, h]) // eslint-disable-line react-hooks/exhaustive-deps
  const toView = (n: number, c: string) => viewAmount(n, c, view, FX)
  const week = useMemo(() => nextWeek(today, dues, incoming, p.events), [today, dues, incoming, p.events])
  // What usual spending will still take from the bank this month
  const usual = useMemo(() => rooms.flatMap(r => usualSpendLeft({ today, cur: r.cur, lines: r.lines, txns: p.transactions, accounts: h.accounts, dues, recurring: p.recurring, answers: p.billSkips })), [rooms, today, p.transactions, h.accounts, dues, p.recurring, p.billSkips])
  const budgetsLeft = usual.reduce((s, u) => s + toView(u.amount, u.currency), 0)
  // Reminders and the total follow the country you're looking at
  const billsHere = useMemo(() => p.bills.filter(b => view === 'consolidated' || (view === 'uae' ? b.currency === 'AED' : b.currency === 'INR')), [p.bills, view])
  // Salary day: set aside each goal's share first (Goals › Pay yourself first)
  const payDue = useMemo(() => {
    if (p.payFirst === 'off' || !p.goals.length) return null
    const investments = { stocks: h.stocks, mutual_funds: h.mutualFunds, fixed_deposits: h.fixedDeposits, recurring_deposits: h.recurringDeposits, nps_accounts: h.nps,
      lic_policies: h.lic, gold_investments: h.gold, bond_investments: h.bonds, etf_investments: h.etf, ppf_epf_accounts: h.ppfEpf }
    const built = buildGoals({ goals: p.goals, links: p.goalInvestments ?? [], contributions: p.contributions, invTxns: [], accounts: p.holdings.accounts, loans: h.loans, transactions: p.transactions, investments, fx: FX }, today)
    for (const c of (view === 'uae' ? ['AED'] : view === 'india' ? ['INR'] : ['INR', 'AED']) as ('AED' | 'INR')[]) {
      const usual = declaredIncome(p.plans, c === 'AED' ? 'uae' : 'india', FX, p.transactions) ?? built.monthly[c].income
      const d = payFirstDue({ mode: p.payFirst, cur: c, today, txns: p.transactions, items: built.items, links: p.goalInvestments ?? [], saving: built.monthly[c].saved, usualIncome: usual, fx: FX, answers: p.billSkips, contributions: p.contributions })
      if (d) return d
    }
    return null
  }, [p, h, FX, today, view])
  const foundCount = useMemo(() => pendingCharges(foundRegular(p.transactions, p.recurring, today, p.billSkips, p.bills), p.billSkips)
    .filter(f => view === 'consolidated' || (view === 'uae' ? f.currency === 'AED' : f.currency === 'INR')).length, [p.transactions, p.recurring, today, p.billSkips, p.bills, view])
  const plan = useMemo(() => homePlan({ today, view, fx: FX, cash: nw.cash, dues, incoming, budgetsLeft, avgIncome: declaredIncome(p.plans, view, FX, p.transactions) ?? ins.trend.avgIncome, plans: p.plans,
    txns: p.transactions, accounts: h.accounts, loans: h.loans, insurance: p.insurance, mutualFunds: h.mutualFunds, rds: h.recurringDeposits ?? [], recurring: p.recurring, events: p.events, lic: h.lic, bills: p.bills, usual, answers: p.billSkips }),
    [today, view, FX, nw.cash, dues, incoming, budgetsLeft, ins.trend.avgIncome, p, h]) // eslint-disable-line react-hooks/exhaustive-deps
  const accName = (id: string | null) => h.accounts.find((a: any) => a.id === id)?.name ?? null
  // What needs you: the one To do list (lib/todo), the same as the bell and the To do page
  const todo = useTodo()
  // How many things need you, and the first few, for the one row on top
  const waiting = pendingCount(p.pending) + incomeCheckCount(p.plans, p.transactions, today, FX) + billReminderCount(billsHere, p.transactions, today, p.billSkips)
    + (foundCount > 0 ? 1 : 0) + landedCheckCount(p.transactions, today, FX) + (payDue ? 1 : 0)
  const needTitles = [...(pendingCount(p.pending) ? [`${pendingCount(p.pending)} to confirm`] : []), ...(payDue ? ['Pay yourself first'] : []), ...ins.attention.map(a => a.title)]


  return (
    <div className="max-w-[1280px] mx-auto flex flex-col gap-3.5 md:gap-[18px] animate-fade-up">
      {/* Header — desktop */}
      <div className="hidden md:flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-[24px] font-bold tracking-[-0.01em]" style={{ color: 'var(--text)' }}>
            {greeting}{p.firstName ? `, ${p.firstName}` : ''}
          </h1>
          <p className="text-[13px] mt-0.5" style={{ color: 'var(--text3)' }}>{viewLabel} · {holderLabel} · {rangeLabel}</p>
        </div>
        <div className="flex gap-2 wl-hide-viewing">
          <button onClick={() => openAdd()} className="wl-btn wl-btn-primary" style={{ height: 34 }}><Plus size={14} />Add</button>
          <button onClick={() => setUploadOpen(true)} className="wl-btn" style={{ height: 34 }}><Upload size={14} />Upload statement</button>
          <button onClick={() => setModal('voice')} className="wl-btn" style={{ height: 34 }}><Mic size={14} />Speak it</button>
        </div>
      </div>

      {/* Header — phones */}
      <div className="md:hidden flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[12.5px]" style={{ color: 'var(--text3)' }}>{greeting}</div>
          <div className="text-[20px] font-bold truncate" style={{ color: 'var(--text)' }}>{p.firstName || 'Welcome'}</div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <SearchButton />
          <NotificationsPanel round />
          <AskAiButton wide />
        </div>
      </div>
      <div className="md:hidden"><MobileControls actions={false} /></div>

      {isEmpty ? (<>
        <QuickActions openAdd={openAdd} upload={() => setUploadOpen(true)} voice={() => setModal('voice')} advisor={() => openAdvisor()} />
        <Onboarding onImport={() => setUploadOpen(true)} goalInterests={p.goalInterests} />
      </>) : (<>
      {/* What needs you: one row; the full list opens below it */}
      <NeedsYouBar items={todo.items} payDue={!!payDue} />
      <QuickActions openAdd={openAdd} upload={() => setUploadOpen(true)} voice={() => setModal('voice')} advisor={() => openAdvisor()} />
      {p.plansReady && p.plans.length === 0 && (
        <Link href="/dashboard/settings/income" className="wl-card px-4 py-3 flex items-center gap-3 wl-hide-viewing" style={{ background: '#F0EDFF', borderColor: '#DAD3FF' }}>
          <Wallet size={17} className="flex-shrink-0" style={{ color: 'var(--accent)' }} />
          <span className="flex-1 min-w-0 text-[13px]" style={{ color: 'var(--text)' }}><b>Tell us your income</b> so your plan is accurate. It takes a minute.</span>
          <ChevronRight size={16} className="flex-shrink-0" style={{ color: 'var(--accent)' }} />
        </Link>
      )}

      {/* The period you pick: tiles, money flows, where it went, what you own and owe, and next month's plan */}
      <HomeTrends view={view} fx={FX} today={today} live={{ nw: nw.netWorth, own: nw.totalAssets, owe: nw.totalLiab }}
        holderNote={holder ? 'trends are for the whole family' : null} side={<NextMonthCard plan={plan} money={money} />} />

      {/* Right now: doesn't change with the period */}
      <div className="flex flex-wrap items-baseline justify-between gap-2 mt-1">
        <h2 className="text-[17px] font-bold" style={{ color: 'var(--text)' }}>Right now</h2>
        <span className="text-[12.5px]" style={{ color: 'var(--text3)' }}>Doesn’t change with the period above</span>
      </div>
      <FreeBanner cards={rooms.map(r => ({ cur: r.cur, amount: r.sts.amount, cash: r.sts.cash, due: r.sts.dueBefore + r.sts.unlinked, reserved: r.sts.reserved, until: r.sts.until, perDay: r.sts.perDay, payday: r.sts.payday }))}
        endOfMonth={plan.rest.endOfMonth} afterUsual={plan.rest.budgetsLeft > 0 ? plan.rest.afterBudgets : null} days={plan.rest.days} money={money} />
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3.5 md:gap-4">
        <BudgetsCard lines={rooms.flatMap(r => r.lines.map(l => ({ ...l, cur: r.cur })))} />
        <DueWeekCard today={today} items={week.items} later={week.later} warnings={warnings} money={money}
          dueTotal={cashDues(week.out, h.accounts).reduce((s, d) => s + toView(d.amount, d.currency), 0)} />
        <GoalRingsCard goals={goals} short={short} />
        <LoansCard loans={h.loans} toView={toView} money={money} homes={p.holdings.otherAssets ?? []} today={today} />
      </div>
      </>)}

      {modal === 'add' && <AddTransactionModal onClose={() => setModal(null)} onAdded={onAdded} />}
      {modal === 'voice' && <TransactionVoiceModal onClose={() => { setModal(null); onAdded() }} />}
    </div>
  )
}

// Phones: the four things you do most
function QuickActions({ openAdd, upload, voice, advisor }: { openAdd: () => void; upload: () => void; voice: () => void; advisor: () => void }) {
  return (
    <div className="md:hidden grid grid-cols-4 gap-2 wl-hide-viewing">
      {([['Add', Plus, openAdd], ['Upload', Upload, upload], ['Speak', Mic, voice], ['Ask AI', Sparkles, advisor]] as [string, LucideIcon, () => void][]).map(([label, Icon, fn]) => (
        <button key={label} onClick={() => fn()} className="wl-card py-2.5 px-1 flex flex-col items-center gap-1 text-[11px] font-medium" style={{ color: 'var(--text2)' }}>
          <Icon size={18} style={{ color: 'var(--accent)' }} />{label}
        </button>
      ))}
    </div>
  )
}

// ─── Cards ────────────────────────────────────────────────────────────────────

function Card({ children, className = '', ...rest }: React.HTMLAttributes<HTMLElement>) {
  return <section className={`wl-card px-4 md:px-5 py-3.5 md:py-[18px] ${className}`} {...rest}>{children}</section>
}

function CardTitle({ id, children, right }: { id?: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <h2 id={id} className="text-[14px] font-semibold" style={{ color: 'var(--text)' }}>{children}</h2>
      {right}
    </div>
  )
}

function MoreLink({ href, children }: { href: string; children: React.ReactNode }) {
  return <Link href={href} className="text-[12.5px] font-semibold hover:underline" style={{ color: 'var(--accent)' }}>{children} →</Link>
}

function AttentionCard({ items, pending, accName, onImport, plans, txns, today, fx, bills, billSkips, accounts, foundCount, payDue, payFirst, className = '' }: { bills: Bill[]; billSkips: string[]; accounts: any[]; foundCount: number; payDue: any; payFirst: PayFirstMode; items: Attention[]; pending: Pending; accName: (id: string | null) => string | null; onImport: () => void; plans: IncomePlan[]; txns: any[]; today: string; fx: number; className?: string }) {
  const [all, setAll] = useState(false)
  const shown = all ? items : items.slice(0, 4)
  const waiting = pendingCount(pending) + incomeCheckCount(plans, txns, today, fx) + billReminderCount(bills, txns, today, billSkips) + (foundCount > 0 ? 1 : 0) + landedCheckCount(txns, today, fx) + (payDue ? 1 : 0)
  return (
    <Card aria-labelledby="att-title" className={`flex flex-col ${className}`}>
      <CardTitle id="att-title" right={items.length + waiting > 0 && (
        <span className="text-[11px] font-semibold px-2 py-[3px] rounded-full" style={{ background: '#FEF2F2', color: '#DC2626' }}>{items.length + waiting}</span>
      )}>Needs you</CardTitle>
      {items.length + waiting === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center py-8 gap-1.5">
          <div className="w-10 h-10 rounded-full flex items-center justify-center text-[18px]" style={{ background: 'var(--income-bg)', color: 'var(--income)' }}>✓</div>
          <div className="text-[14px] font-semibold mt-1" style={{ color: 'var(--text)' }}>You&apos;re all caught up</div>
          <div className="text-[12px]" style={{ color: 'var(--text3)' }}>No bills, renewals or missing statements right now.</div>
        </div>
      ) : (
        <ul className="mt-2.5">
          <BillReminders bills={bills} skips={billSkips} txns={txns} today={today} accounts={accounts} foundCount={foundCount} />
          {payDue && <PayFirstRow due={payDue} mode={payFirst} today={today} />}
          <LandedChecks txns={txns} today={today} fx={fx} />
          <IncomeChecks plans={plans} txns={txns} today={today} fx={fx} />
          <PendingConfirms pending={pending} accName={accName} />
          {shown.map(it => {
            const body = (<>
              <span className="w-2 h-2 rounded-full mt-[5px] flex-shrink-0" style={{ background: SEV_DOT[it.severity] }}
                aria-label={it.severity === 'high' ? 'Urgent' : it.severity === 'medium' ? 'Soon' : 'To do'} />
              <span className="flex-1 min-w-0">
                <span className="block text-[13px] font-semibold" style={{ color: 'var(--text)' }}>{it.title}</span>
                <span className="block text-[12px] mt-px" style={{ color: 'var(--text3)' }}>{it.detail}</span>
              </span>
              {(it.action === 'upload' || it.href) && (
                <>
                  <span className="hidden md:inline text-[12px] font-semibold whitespace-nowrap" style={{ color: 'var(--accent)' }}>
                    {it.action === 'upload' ? it.actionLabel : it.actionLabel ?? 'Open'}
                  </span>
                  <ChevronRight size={16} className="md:hidden flex-shrink-0 mt-0.5" style={{ color: 'var(--text4)' }} />
                </>
              )}
            </>)
            const cls = 'w-full flex gap-2.5 items-start py-[9px] text-left -mx-2 px-2 rounded-lg hover:bg-[#F5F3FE] transition-colors'
            return (
              <li key={it.id} style={{ borderTop: '1px solid #F1F5F9' }}>
                {it.action === 'upload' ? <button onClick={onImport} className={cls}>{body}</button>
                  : it.href ? <Link href={it.href} className={cls}>{body}</Link>
                  : <div className={cls}>{body}</div>}
              </li>
            )
          })}
        </ul>
      )}
      {items.length > 4 && (
        <button onClick={() => setAll(a => !a)} className="mt-1 text-[12px] font-semibold self-start" style={{ color: 'var(--accent)' }}>
          {all ? 'Show fewer' : `Show all ${items.length}`}
        </button>
      )}
    </Card>
  )
}

// Goals picked during onboarding, offered as one-click "set up this goal"
function InterestChips({ interests }: { interests: string[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {interests.map(g => (
        <Link key={g} href={newGoalHref(g)} className="wl-chip gap-1" style={{ height: 28 }}><Plus size={12} />{g}</Link>
      ))}
    </div>
  )
}

function Onboarding({ onImport, goalInterests, className = '' }: { onImport: () => void; goalInterests: string[]; className?: string }) {
  const steps: { icon: LucideIcon; title: string; body: string; cta: React.ReactNode }[] = [
    { icon: Upload, title: 'Import a bank statement', body: 'PDF or Excel from any UAE or Indian bank. Transactions are read and categorised for you.',
      cta: <button onClick={onImport} className="wl-btn wl-btn-primary wl-btn-sm"><Upload size={12} />Import</button> },
    { icon: TrendingUp, title: 'Add your investments', body: 'Upload your CAMS / KFintech CAS to bring in every mutual fund with full history.',
      cta: <Link href="/dashboard/investments/mutual-funds" className="wl-btn wl-btn-sm">Open mutual funds</Link> },
    { icon: Wallet, title: 'Add accounts and cards', body: 'Balances and card limits power net worth, due-date reminders and utilisation alerts.',
      cta: <Link href="/dashboard/accounts" className="wl-btn wl-btn-sm">Add accounts</Link> },
  ]
  return (
    <Card className={className}>
      <h2 className="text-[16px] font-semibold" style={{ color: 'var(--text)' }}>Let&apos;s set up WealthLens</h2>
      <p className="text-[13px] mt-1" style={{ color: 'var(--text3)' }}>Three steps and Home fills in with your net worth, cash flow and what needs attention.</p>
      <ol className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
        {steps.map((s, i) => { const Icon = s.icon; return (
          <li key={s.title} className="rounded-xl p-4" style={{ border: '1px solid var(--border)' }}>
            <div className="flex items-center gap-2">
              <span className="w-7 h-7 rounded-lg flex items-center justify-center text-[12px] font-bold" style={{ background: 'var(--accent-bg)', color: 'var(--accent2)' }}>{i + 1}</span>
              <Icon size={15} style={{ color: 'var(--text3)' }} />
            </div>
            <div className="text-[13.5px] font-semibold mt-3" style={{ color: 'var(--text)' }}>{s.title}</div>
            <div className="text-[12px] mt-1 mb-3" style={{ color: 'var(--text3)' }}>{s.body}</div>
            {s.cta}
          </li>
        )})}
      </ol>
      {goalInterests.length > 0 && (
        <div className="mt-4 pt-4 flex flex-col md:flex-row md:items-center gap-2 md:gap-3" style={{ borderTop: '1px solid #F1F5F9' }}>
          <span className="text-[12.5px] font-semibold flex-shrink-0" style={{ color: 'var(--text2)' }}>Your goals — set a target:</span>
          <InterestChips interests={goalInterests} />
        </div>
      )}
    </Card>
  )
}
