'use client'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { CreditCard, ChevronRight, Banknote, X, Check } from 'lucide-react'
import { useViewStore } from '@/store/viewStore'
import { useUiStore } from '@/store/uiStore'
import { createClient } from '@/lib/supabase/client'
import { fmtMoney, fmtCompact } from '@/lib/format'
import { viewAmount } from '@/lib/netWorth'
import { kindOf } from '@/lib/ledger'
import { prepareMoney } from '@/lib/money'
import { brandOf } from '@/lib/banks'
import { buildHomeInsights, localToday, fmtDay, daysBetween, nextCardDue, type Attention } from '@/lib/insights'
import { buildDues, expectedIncome, balanceWarnings, type Due } from '@/lib/moneyOverview'
import { findReviewItems, reviewCount } from '@/lib/review'
import { rankCards } from '@/lib/cardCycle'
import { GROUPS, type Category } from '@/lib/categories'
import { friendBalances, friendTotals } from '@/lib/friends'
import { moneyMonths, sumMonths, topGroups } from '@/lib/moneyTrends'
import { MONTH, mLabel, monthsUpTo, windowOf, sumOf, periodName, periodWord, rangeOf } from '@/lib/period'
import type { RecurringTxn } from '@/lib/recurring'
import PendingConfirms, { pendingCount, type Pending } from './PendingConfirms'
import IncomeChecks, { incomeCheckCount } from './IncomeChecks'
import BillReminders, { billReminderCount } from './BillReminders'
import LandedChecks, { landedCheckCount } from './LandedChecks'
import type { Bill } from '@/lib/bigBills'
import { foundRegular, pendingCharges } from '@/lib/regular'
import type { IncomePlan } from '@/lib/incomePlans'
import { PageHeader, Panel } from '@/components/ui/kit'
import { BankLogo } from '@/components/ui/BankCards'
import { usePeriod, PeriodChips, TrendTile, badgeOf, NONE, Card, type Pt } from './charts/parts'
import InsidePanel from './charts/Inside'
import { StackedSpend, IncomeColumns, RemitBars } from './money/MoneyCharts'

interface Props {
  today: string
  transactions: any[]; accounts: any[]; loans: any[]; insurance: any[]
  mutualFunds: any[]; fixedDeposits: any[]; budgets: any[]; rds?: any[]; plans?: IncomePlan[]
  pending: Pending               // repeating entries, EMIs and SIPs waiting for a confirm
  recurring: RecurringTxn[]
  lic?: any[]; bills?: Bill[]; billSkips?: string[]
  categories?: Category[]; friends?: any[]; splits?: any[]; friendTxns?: any[]
}

const SEV_DOT: Record<Attention['severity'], string> = { high: '#DC2626', medium: '#D97706', low: '#6A55E8' }
// Home's attention items that belong here; dues have their own list and the
// Review inbox covers uncategorised spends
const KEEP = (a: Attention) => /^(bud-|util$|quiet-)/.test(a.id)
const REST_COLOR = '#94A3B8'

// Money › Overview: the money side in more depth than Home, for the period
// picked (the same chips as Home) — what came in and from where, what was
// spent and on what, card bills, money sent home, balances and friends —
// then a tile for each tab inside Money. Same rules as Home and Reports.
export default function MoneyOverviewClient(p: Props) {
  const router = useRouter()
  const { view, fxRate: FX } = useViewStore()
  const { setUploadOpen } = useUiStore()
  const cur = view === 'uae' ? 'AED' : 'INR'
  const money = (n: number) => fmtMoney(n, cur)
  const short = (n: number) => fmtCompact(n, cur)
  const [today, setToday] = useState(p.today)
  useEffect(() => { setToday(localToday()) }, [])
  const [period, setPeriod] = usePeriod()
  const [picking, setPicking] = useState<Due | null>(null)
  const plans = p.plans ?? []
  const rows = p.categories ?? []
  const bills = (p.bills ?? []).filter(b => view === 'consolidated' || (view === 'uae' ? b.currency === 'AED' : b.currency === 'INR')), billSkips = p.billSkips ?? []
  const foundCount = useMemo(() => pendingCharges(foundRegular(p.transactions, p.recurring, today, billSkips, p.bills ?? []), billSkips)
    .filter(f => view === 'consolidated' || (view === 'uae' ? f.currency === 'AED' : f.currency === 'INR')).length, [p.transactions, p.recurring, today, billSkips, p.bills, view])
  const confirms = pendingCount(p.pending) + incomeCheckCount(plans, p.transactions, today, FX) + billReminderCount(bills, p.transactions, today, billSkips) + (foundCount > 0 ? 1 : 0) + landedCheckCount(p.transactions, today, FX)

  const inView = (c: string) => view === 'consolidated' || (view === 'uae' ? c === 'AED' : c !== 'AED')
  const accounts = useMemo(() => p.accounts.filter(a => inView(a.currency)), [p.accounts, view]) // eslint-disable-line react-hooks/exhaustive-deps
  const banks = accounts.filter(a => kindOf(a) !== 'card')
  const cards = accounts.filter(a => kindOf(a) === 'card')

  // What needs you (Home's attention items that belong to Money, balance warnings, reviews)
  const ins = useMemo(() => buildHomeInsights({
    view, fx: FX, today, focusMonth: today.slice(0, 7),
    txns: p.transactions, accounts: p.accounts, loans: p.loans, insurance: p.insurance,
    fixedDeposits: p.fixedDeposits, budgets: p.budgets, mutualFunds: p.mutualFunds, stocks: [],
    cash: 0, invested: { value: 0, cost: 0 },
  }), [view, FX, today, p])
  const dues = useMemo(() => buildDues({ today, days: 35, view, txns: p.transactions, accounts: p.accounts, loans: p.loans, insurance: p.insurance, mutualFunds: p.mutualFunds, recurring: p.recurring, rds: p.rds, plans, lic: p.lic, bills: p.bills, answers: p.billSkips }),
    [today, view, p]) // eslint-disable-line react-hooks/exhaustive-deps
  const incoming = useMemo(() => expectedIncome(p.transactions, accounts, today, 35), [p.transactions, accounts, today])
  const warnings = useMemo(() => balanceWarnings(accounts, dues, incoming, today, 14), [accounts, dues, incoming, today])
  const toReview = useMemo(() => reviewCount(findReviewItems(p.transactions, { today, fx: FX, accounts: p.accounts })), [p.transactions, today, FX, p.accounts])
  const needs = [...warnings, ...ins.attention.filter(KEEP),
    ...(toReview ? [{ id: 'review', severity: 'low' as const, title: `${toReview} transaction${toReview === 1 ? '' : 's'} to review`,
      detail: 'Missing “Paid from”, vague categories or possible duplicates — fix them in a tap', href: '/dashboard/money/review' }] : [])]
  const unsure = dues.filter(d => daysBetween(today, d.date) <= 7 && !d.payFrom && (d.kind === 'emi' || d.kind === 'card'))
  const accName = (id: string | null) => p.accounts.find(a => a.id === id)?.name ?? null

  // Month by month, for the period picked (and the same length before it)
  const now = today.slice(0, 7)
  const months = useMemo(() => monthsUpTo(now, 25), [now])
  const cardIds = useMemo(() => new Set<string>(p.accounts.filter(a => kindOf(a) === 'card').map(a => a.id)), [p.accounts])
  const prepared = useMemo(() => prepareMoney(p.transactions, { fx: FX, cardIds }), [p.transactions, FX, cardIds])
  const mm = useMemo(() => moneyMonths(prepared, { months, view, fx: FX, rows, cardIds }), [prepared, months, view, FX, rows, cardIds])
  const w = windowOf(months, period, now)
  const [, to] = rangeOf(period, now)
  const cut = (a: number, b: number) => mm.slice(Math.max(0, a), b + 1)
  const c = sumMonths(cut(w.a, w.b)), pv = w.hasPrev ? sumMonths(cut(w.pa, w.pb)) : null
  const series = (f: (m: typeof mm[number]) => number) => w.chart.map(i => f(mm[i]))
  const pts: Pt[] = w.chart.map(i => ({ label: mLabel(months[i]), title: `${MONTH[Number(months[i].slice(5)) - 1]} ${months[i].slice(0, 4)}${months[i] === now ? ' (so far)' : ''}`, ix: [i], sel: w.len === 1 && i === w.b }))
  const word = periodWord(period, to)
  const thisBadge = period === 'this' ? { t: `${Number(today.slice(8, 10))} days in`, s: NONE } : null

  const cash = banks.reduce((s, a) => s + viewAmount(Number(a.current_balance) || 0, a.currency, view, FX), 0)
  const fb = useMemo(() => friendBalances(p.friends ?? [], p.splits ?? [], p.friendTxns ?? []), [p.friends, p.splits, p.friendTxns])
  const ft = friendTotals(fb)
  const inCur = (r: Record<'AED' | 'INR', number>) => view === 'uae' ? r.AED : view === 'india' ? r.INR : r.INR + r.AED * FX
  const owedToYou = inCur(ft.toReceive), youOwe = inCur(ft.toPay)
  const owers = fb.filter(b => inCur(b.owes) > 0)
  const uae = view === 'uae'
  const sent = uae ? c.sentAed : c.sentInr, sentPrev = pv ? (uae ? pv.sentAed : pv.sentInr) : null
  const avgRate = c.sentAed > 0 ? c.sentInr / c.sentAed : null
  const fmtA = (x: number) => fmtCompact(x, 'AED')

  const kpis = [
    { label: 'Came in', color: '#6A55E8', value: short(c.income), sub: w.len > 1 ? `About ${short(c.income / w.len)} a month` : 'Salary and other income', d: thisBadge ?? badgeOf(c.income, pv?.income, true), spark: series(m => m.income), href: '/dashboard/income' },
    { label: 'Spent', color: '#F29A2E', value: short(c.spent), sub: `+ ${short(c.emi)} in EMIs`, d: thisBadge ?? badgeOf(c.spent, pv?.spent, false), spark: series(m => m.spent), href: '/dashboard/expenses' },
    { label: 'Card bills paid', color: '#3B8EF0', value: short(c.cardBills), sub: 'A move: card spending is counted when you buy', d: { t: `${c.cardBillCount} bill${c.cardBillCount === 1 ? '' : 's'}`, s: NONE }, spark: series(m => m.cardBills), href: '/dashboard/cards' },
    { label: uae ? 'Sent to India' : 'From the UAE', color: '#8B5CF6', value: short(sent), sub: c.sentAed > 0 ? (uae ? `At ₹${avgRate!.toFixed(1)} a dirham on average` : `${fmtA(c.sentAed)} at ₹${avgRate!.toFixed(1)} a dirham`) : 'Nothing sent home in this period', d: thisBadge ?? badgeOf(sent, sentPrev, true), spark: series(m => (uae ? m.sentAed : m.sentInr)), href: '/dashboard/transfers' },
    { label: 'Bank & cash', color: '#2FB67C', value: short(cash), sub: `In ${banks.length} account${banks.length === 1 ? '' : 's'} today`, d: { t: 'today', s: NONE }, spark: [], href: '/dashboard/accounts', mini: banks.length > 0 ? { kind: 'split' as const, parts: banks.map((a, i) => ({ value: viewAmount(Number(a.current_balance) || 0, a.currency, view, FX), color: ['#2FB67C', '#16A34A', '#0F766E', '#34D399', '#065F46'][i % 5] })) } : undefined },
    { label: 'Friends owe you', color: '#EC5B8C', value: short(owedToYou), sub: youOwe > 0 ? `You owe ${short(youOwe)}` : owedToYou > 0 ? 'You owe nobody' : 'All settled', d: { t: `${owers.length} ${owers.length === 1 ? 'person' : 'people'}`, s: NONE }, spark: [], href: '/dashboard/money/friends', mini: owedToYou + youOwe > 0 ? { kind: 'split' as const, parts: [{ value: owedToYou, color: '#EC5B8C' }, { value: youOwe, color: '#D9DCE6' }] } : undefined },
  ]

  // Spending layers: the biggest categories over the chart's months, the rest together
  const chartMonths = w.chart.map(i => mm[i])
  const tg = topGroups(chartMonths, 5)
  const layers = [
    ...tg.keys.map(k => { const g = GROUPS.find(x => x.key === k); return { key: k, label: g?.label ?? 'Other', color: g?.color ?? REST_COLOR, values: chartMonths.map(m => m.groups[k] ?? 0) } }),
    ...(tg.rest ? [{ key: 'rest', label: 'Everything else', color: REST_COLOR, values: chartMonths.map(m => Object.entries(m.groups).filter(([k]) => !tg.keys.includes(k)).reduce((s, [, v]) => s + v, 0)) }] : []),
  ]
  // The category that rose most against the months before
  const rise = pv ? Object.entries(c.groups).map(([k, v]) => ({ k, v, p: pv.groups[k] ?? 0 })).filter(x => x.p > 0 && x.v > x.p && x.v - x.p > c.spent * 0.02)
    .sort((a, b) => (b.v - b.p) / b.p - (a.v - a.p) / a.p)[0] : undefined
  const needPct = c.spent > 0 ? Math.round(c.needs / c.spent * 100) : 0
  const incomeLayers = (['earned', 'returns', 'extra'] as const).map(k => { const g = GROUPS.find(x => x.key === k)!; return { key: k, label: k === 'earned' ? 'Earned (salary and work)' : g.label, color: g.color, values: chartMonths.map(m => m.incomeBy[k] ?? 0) } })
  const topShops = Object.values(c.merchants).sort((a, b) => b.amount - a.amount).slice(0, 8)
  const shopMax = Math.max(1, ...topShops.map(s => s.amount))
  const hasRemit = chartMonths.some(m => m.sentInr > 0 || m.sentAed > 0)

  // Inside Money
  const lastFull = mm[months.length - 2]
  const lastSaved = lastFull.income - lastFull.spent - lastFull.emi
  const nextIn = incoming[0]
  const inside = [
    { title: 'Expenses', href: '/dashboard/expenses', value: short(w.len > 1 ? c.spent / w.len : c.spent), unit: w.len > 1 ? 'a month' : word, line: `${c.count} entries ${word}${toReview ? ` · ${toReview} to review` : ''}`, mini: { kind: 'spark' as const, values: series(m => m.spent), color: '#F29A2E' } },
    { title: 'Income', href: '/dashboard/income', value: short(w.len > 1 ? c.income / w.len : c.income), unit: w.len > 1 ? 'a month' : word, line: nextIn ? `Next: ${nextIn.label}, ${fmtDay(nextIn.date)}` : 'No regular income found yet', mini: { kind: 'bars' as const, values: series(m => m.income), color: '#6A55E8' } },
    { title: 'Money flow', href: '/dashboard/transfers', value: short(sent), unit: uae ? 'sent home' : 'from the UAE', line: c.sentCount ? `${c.sentCount} transfer${c.sentCount === 1 ? '' : 's'}${avgRate ? ` · ₹${avgRate.toFixed(1)} a dirham` : ''}` : 'Transfers between your accounts and home', mini: { kind: 'bars' as const, values: series(m => (uae ? m.sentAed : m.sentInr)), color: '#8B5CF6' } },
    { title: 'Friends', href: '/dashboard/money/friends', value: short(owedToYou), unit: 'owed to you', line: owers[0] ? `${owers[0].friend.name} ${short(inCur(owers[0].owes))}${owers.length > 1 ? ` · ${owers.length - 1} more` : ''}` : 'Split a bill to track who owes what' },
    { title: 'Reports', href: '/dashboard/reports', value: MONTH[Number(months[months.length - 2].slice(5)) - 1], unit: 'ready', line: lastFull.income > 0 ? `Saved ${Math.round(lastSaved / lastFull.income * 100)}% · a statement for each account` : 'A statement for each account, every month', mini: lastFull.income > 0 ? { kind: 'progress' as const, pct: lastSaved / lastFull.income * 100, color: '#2FB67C' } : undefined },
  ]

  const viewLabel = view === 'uae' ? 'UAE · AED' : view === 'india' ? 'India · INR' : 'Both countries · INR'
  const isEmpty = p.transactions.length === 0 && p.accounts.length === 0

  if (isEmpty) return (
    <div className="flex flex-col gap-3.5 md:gap-[18px] animate-fade-up">
      <PageHeader title="Money" sub={viewLabel} />
      <div className="wl-card px-6 py-10 text-center flex flex-col items-center gap-3">
        <div className="text-[15px] font-semibold" style={{ color: 'var(--text)' }}>Add your accounts and a statement to see your money here</div>
        <div className="text-[13px] max-w-md" style={{ color: 'var(--text3)' }}>What came in, what you spent and on what, card bills and money sent home all come from your accounts and transactions.</div>
        <div className="flex gap-2 mt-1">
          <button onClick={() => setUploadOpen(true)} className="wl-btn wl-btn-primary" style={{ height: 36 }}>Import a statement</button>
          <Link href="/dashboard/accounts" className="wl-btn" style={{ height: 36 }}>Add accounts</Link>
        </div>
      </div>
    </div>
  )

  const needsCount = needs.length + unsure.length + confirms
  return (
    <div className="flex flex-col gap-3.5 md:gap-[18px] animate-fade-up">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[13px]" style={{ color: 'var(--text3)' }}>Money · {viewLabel}</div>
          <h1 className="text-[22px] md:text-[26px] font-bold tracking-[-0.02em]" style={{ color: 'var(--text)' }}>Where your money moves</h1>
          <p className="text-[12px]" style={{ color: 'var(--text3)' }}>{periodName(period)} · {w.len > 1 ? `${mLabel(months[w.a])} – ${mLabel(months[w.b])}` : `${MONTH[Number(months[w.b].slice(5)) - 1]} ${months[w.b].slice(0, 4)}${w.isNow ? ', so far' : ''}`}</p>
        </div>
        <PeriodChips value={period} onChange={setPeriod} />
      </div>

      {needsCount > 0 && (
        <Panel title="Needs you" right={<span className="text-[11px] font-semibold px-2 py-[3px] rounded-full" style={{ background: '#FEF2F2', color: '#DC2626' }}>{needsCount}</span>}>
          <ul className="mt-2">
            <BillReminders bills={bills} skips={billSkips} txns={p.transactions} today={today} accounts={p.accounts} foundCount={foundCount} />
            <LandedChecks txns={p.transactions} today={today} fx={FX} />
            <IncomeChecks plans={plans} txns={p.transactions} today={today} fx={FX} />
            <PendingConfirms pending={p.pending} accName={accName} />
            {needs.slice(0, 6).map(it => {
              const body = (<>
                <span className="w-2 h-2 rounded-full mt-[5px] flex-shrink-0" style={{ background: SEV_DOT[it.severity] }} aria-label={it.severity === 'high' ? 'Urgent' : it.severity === 'medium' ? 'Soon' : 'To do'} />
                <span className="flex-1 min-w-0">
                  <span className="block text-[13px] font-semibold" style={{ color: 'var(--text)' }}>{it.title}</span>
                  <span className="block text-[12px] mt-px" style={{ color: 'var(--text3)' }}>{it.detail}</span>
                </span>
                {(it.href || ('action' in it && it.action === 'upload')) && <ChevronRight size={16} className="flex-shrink-0 mt-0.5" style={{ color: 'var(--text4)' }} />}
              </>)
              const cls = 'w-full flex gap-2.5 items-start py-[9px] text-left -mx-2 px-2 rounded-lg hover:bg-[#F5F3FE] transition-colors'
              return (
                <li key={it.id} style={{ borderTop: '1px solid #F1F5F9' }}>
                  {'action' in it && it.action === 'upload' ? <button onClick={() => setUploadOpen(true)} className={cls}>{body}</button>
                    : it.href ? <Link href={it.href} className={cls}>{body}</Link> : <div className={cls}>{body}</div>}
                </li>
              )
            })}
            {unsure.map(d => (
              <li key={`u-${d.id}`} style={{ borderTop: '1px solid #F1F5F9' }}>
                <button onClick={() => setPicking(d)} className="w-full flex gap-2.5 items-start py-[9px] text-left -mx-2 px-2 rounded-lg hover:bg-[#F5F3FE] transition-colors">
                  <span className="w-2 h-2 rounded-full mt-[5px] flex-shrink-0" style={{ background: SEV_DOT.low }} aria-label="To do" />
                  <span className="flex-1 min-w-0">
                    <span className="block text-[13px] font-semibold" style={{ color: 'var(--text)' }}>Which account pays {d.label}?</span>
                    <span className="block text-[12px] mt-px" style={{ color: 'var(--text3)' }}>Pick it once, and you’ll be warned if that account runs short</span>
                  </span>
                  <span className="text-[12px] font-semibold whitespace-nowrap mt-px" style={{ color: 'var(--accent)' }}>Choose</span>
                </button>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2.5 md:gap-3">
        {kpis.map((k, i) => <TrendTile key={k.label} {...k} gid={`mk${i}`} />)}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] gap-3.5 md:gap-4 items-stretch">
        <StackedSpend pts={pts} layers={layers} short={short} money={money}
          sub={`Each layer is a category · ${w.len >= 3 ? `${mLabel(months[w.a])} – ${mLabel(months[w.b])}` : `the 6 months to ${mLabel(months[w.b])}`}${w.isNow ? ` · ${MONTH[Number(now.slice(5)) - 1]} so far` : ''}`}
          foot={c.spent > 0 && (
            <div className="grid grid-cols-3 gap-2 md:gap-2.5">
              <div className="rounded-xl px-3 py-2.5" style={{ background: '#EEF4FF' }}><div className="text-[11.5px]" style={{ color: '#1D4ED8' }}>Needs</div><div className="text-[14px] md:text-[16px] font-bold tabular-nums" style={{ color: 'var(--text)' }}>{short(c.needs)} · {needPct}%</div></div>
              <div className="rounded-xl px-3 py-2.5" style={{ background: '#FDF0F6' }}><div className="text-[11.5px]" style={{ color: '#9D174D' }}>Wants</div><div className="text-[14px] md:text-[16px] font-bold tabular-nums" style={{ color: 'var(--text)' }}>{short(c.wants)} · {100 - needPct}%</div></div>
              <div className="rounded-xl px-3 py-2.5" style={{ background: '#FFF4E6' }}><div className="text-[11.5px]" style={{ color: '#8A4F06' }}>Biggest rise</div><div className="text-[14px] md:text-[16px] font-bold truncate" style={{ color: 'var(--text)' }}>{rise ? `${GROUPS.find(g => g.key === rise.k)?.label ?? 'Other'} ▲ ${Math.round((rise.v - rise.p) / rise.p * 100)}%` : pv ? 'Nothing stood out' : '—'}</div></div>
            </div>
          )} />
        <Card title="Where you spent most" sub={`Shops and payees ${word}`}>
          {topShops.length === 0 ? <p className="text-[12.5px] py-8 text-center" style={{ color: 'var(--text3)' }}>No spending recorded in this period.</p> : (
            <div className="flex flex-col gap-2.5">
              {topShops.map(s => (
                <div key={s.name}>
                  <div className="flex justify-between gap-2 text-[13px]"><span className="truncate" style={{ color: 'var(--text)' }}>{s.name} <span className="text-[11.5px]" style={{ color: 'var(--text3)' }}>· {s.count}×</span></span><b className="tabular-nums" style={{ color: 'var(--text)' }}>{short(s.amount)}</b></div>
                  <div className="h-1.5 rounded-full mt-1" style={{ background: 'var(--track)' }}><div className="h-full rounded-full" style={{ width: `${s.amount / shopMax * 100}%`, background: '#F29A2E' }} /></div>
                </div>
              ))}
            </div>
          )}
          <Link href="/dashboard/expenses" className="text-[12.5px] font-semibold mt-auto" style={{ color: 'var(--accent)' }}>All transactions ›</Link>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3.5 md:gap-4 items-stretch">
        <IncomeColumns pts={pts} layers={incomeLayers} short={short} money={money} total={sumOf(series(m => m.income), 0, w.chart.length - 1)} />
        {hasRemit ? <RemitBars pts={pts} aed={series(m => m.sentAed)} inr={series(m => m.sentInr)} uaeView={uae} short={short} />
          : <Card title="UAE → India" sub="Money sent home"><p className="text-[12.5px] py-6 text-center" style={{ color: 'var(--text3)' }}>No transfers home in these months. They show here once a transfer to India is recorded.</p></Card>}

        <Card title="Accounts and cards" right={<Link href="/dashboard/accounts" className="text-[12.5px] font-semibold" style={{ color: 'var(--accent)' }}>All</Link>}>
          {(['AED', 'INR'] as const).map(cc => rankCards(cards, cc, today, p.loans ?? [])[0]).filter(Boolean).map(b => (
            <Link key={b.card.id} href="/dashboard/cards" className="flex items-center gap-2 rounded-lg px-3 py-2 text-[12px]" style={{ background: 'var(--accent-bg)', color: 'var(--accent2)' }}>
              <CreditCard size={13} className="flex-shrink-0" />
              <span className="flex-1 min-w-0 truncate">Best card today: <b>{b.card.name}</b></span>
              <span className="font-semibold whitespace-nowrap">{b.cycle.freeDays} days to pay</span>
            </Link>
          ))}
          <ul>
            {banks.map(a => {
              const bal = Number(a.current_balance) || 0
              const warn = warnings.find(x => x.accountId === a.id)
              return (
                <li key={a.id} style={{ borderTop: '1px solid #F1F5F9' }}>
                  <Link href="/dashboard/accounts" className="flex items-center gap-3 py-2.5 -mx-2 px-2 rounded-lg hover:bg-[#F5F3FE] transition-colors">
                    {kindOf(a) === 'cash'
                      ? <span className="w-[30px] h-[30px] rounded-[9px] flex items-center justify-center flex-shrink-0" style={{ background: '#E7F7EF', color: '#2FB67C' }}><Banknote size={15} /></span>
                      : <BankLogo brand={brandOf(a.bank_name, a.name)} />}
                    <span className="flex-1 min-w-0">
                      <span className="block text-[13px] font-semibold truncate" style={{ color: 'var(--text)' }}>{a.name}</span>
                      <span className="block text-[11.5px] truncate" style={{ color: warn ? SEV_DOT[warn.severity] : 'var(--text3)' }}>{warn ? warn.title.replace(`${a.name} `, '') : (a.bank_name ?? (kindOf(a) === 'cash' ? 'Cash' : 'Bank'))}</span>
                    </span>
                    <span className="text-[13px] font-semibold tabular-nums whitespace-nowrap" style={{ color: bal < 0 ? '#DC2626' : 'var(--text)' }}>{fmtMoney(bal, a.currency)}</span>
                  </Link>
                </li>
              )
            })}
            {cards.map(cd => {
              const owed = Number(cd.outstanding_bal) || 0, limit = Number(cd.credit_limit) || 0, due = nextCardDue(cd, today)
              return (
                <li key={cd.id} style={{ borderTop: '1px solid #F1F5F9' }}>
                  <Link href="/dashboard/cards" className="flex items-center gap-3 py-2.5 -mx-2 px-2 rounded-lg hover:bg-[#F5F3FE] transition-colors">
                    <BankLogo brand={brandOf(cd.bank_name, cd.name)} />
                    <span className="flex-1 min-w-0">
                      <span className="block text-[13px] font-semibold truncate" style={{ color: 'var(--text)' }}>{cd.name}</span>
                      <span className="block text-[11.5px] truncate" style={{ color: 'var(--text3)' }}>{limit > 0 ? `${Math.round(owed / limit * 100)}% of the limit used` : 'Card'}{due ? ` · due ${fmtDay(due)}` : ''}</span>
                      {limit > 0 && <span className="block h-1 rounded-full mt-1" style={{ background: 'var(--track)' }}><span className="block h-1 rounded-full" style={{ width: `${Math.min(100, owed / limit * 100)}%`, background: owed / limit > 0.3 ? '#F59E0B' : '#6A55E8' }} /></span>}
                    </span>
                    <span className="text-[13px] font-semibold tabular-nums whitespace-nowrap" style={{ color: 'var(--text)' }}>{fmtMoney(owed, cd.currency)}</span>
                  </Link>
                </li>
              )
            })}
            {banks.length + cards.length === 0 && <li className="text-[12.5px] py-6 text-center" style={{ color: 'var(--text3)' }}>No accounts in this view yet.</li>}
          </ul>
        </Card>
      </div>

      <InsidePanel title="Inside Money" items={inside} />

      {picking && <PayFromSheet due={picking} accounts={p.accounts} onClose={() => setPicking(null)} onSaved={() => { setPicking(null); router.refresh() }} />}
    </div>
  )
}

// One tap: which bank account pays this EMI / card bill (saved on the loan or card)
function PayFromSheet({ due, accounts, onClose, onSaved }: { due: Due; accounts: any[]; onClose: () => void; onSaved: () => void }) {
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')
  const options = accounts.filter(a => kindOf(a) === 'bank' && a.currency === due.currency)
  async function choose(id: string | null) {
    if (!due.owner) return
    setBusy(id ?? 'none'); setError('')
    const { error } = await createClient().from(due.owner.table).update({ pay_from_account_id: id }).eq('id', due.owner.id)
    setBusy(null)
    if (error) setError(/pay_from_account_id/.test(error.message) ? 'Run migration 027 in Supabase first, then try again.' : error.message)
    else onSaved()
  }
  return (
    <div className="fixed inset-0 wl-sheet z-50 flex items-center justify-center p-4" style={{ background: 'rgba(15,23,42,0.45)' }} onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={`Account that pays ${due.label}`}
        className="wl-sheet-panel w-full max-w-sm rounded-2xl overflow-hidden" style={{ background: 'var(--card)', border: '1px solid var(--line)' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-2">
          <div>
            <div className="text-[15px] font-bold" style={{ color: 'var(--text)' }}>Which account pays this?</div>
            <div className="text-[12px]" style={{ color: 'var(--text3)' }}>{due.label} · {fmtMoney(due.amount, due.currency)}</div>
          </div>
          <button onClick={onClose} aria-label="Close" className="p-2 -mr-2 rounded-xl hover:bg-gray-100" style={{ color: 'var(--text3)' }}><X size={16} /></button>
        </div>
        <div className="px-2 pb-2">
          {options.map(a => (
            <button key={a.id} onClick={() => choose(a.id)} disabled={!!busy}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left hover:bg-[#F7F6FD] disabled:opacity-60">
              <BankLogo brand={brandOf(a.bank_name, a.name)} />
              <span className="flex-1 min-w-0">
                <span className="block text-[13px] font-semibold truncate" style={{ color: 'var(--text)' }}>{a.name}</span>
                <span className="block text-[11.5px]" style={{ color: 'var(--text3)' }}>{fmtMoney(Number(a.current_balance) || 0, a.currency)}</span>
              </span>
              {due.payFrom === a.id && <Check size={16} style={{ color: 'var(--accent)' }} />}
              {busy === a.id && <span className="text-[11.5px]" style={{ color: 'var(--text3)' }}>Saving…</span>}
            </button>
          ))}
          {options.length === 0 && <div className="px-3 py-4 text-[12.5px]" style={{ color: 'var(--text3)' }}>No {due.currency} bank accounts yet — add one on Bank accounts.</div>}
          {due.payFromSource === 'set' && (
            <button onClick={() => choose(null)} disabled={!!busy} className="w-full px-3 py-2.5 text-[12.5px] font-semibold text-left rounded-xl hover:bg-[#F7F6FD]" style={{ color: 'var(--text3)' }}>
              Work it out from history instead
            </button>
          )}
        </div>
        {error && <div className="mx-5 mb-4 rounded-lg px-3 py-2 text-[12px]" style={{ background: '#FEF2F2', color: '#B91C1C' }}>{error}</div>}
      </div>
    </div>
  )
}
