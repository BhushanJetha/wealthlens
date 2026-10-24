'use client'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import {
  ArrowUpRight, ArrowDownRight, AlertCircle, Clock, Info, CheckCircle2, AlertTriangle,
  Lightbulb, ChevronRight, Upload, Landmark, CreditCard, Shield, CalendarClock, Repeat,
  Target, TrendingUp, Wallet, type LucideIcon,
} from 'lucide-react'
import { useViewStore } from '@/store/viewStore'
import { useUiStore } from '@/store/uiStore'
import { computeNetWorth, groupAssets, type Holdings } from '@/lib/netWorth'
import { buildHomeInsights, netWorthHistory, localToday, fmtDay, type Snapshot, type Attention, type Insight, type Upcoming } from '@/lib/insights'
import { goalCurrentValue } from '@/lib/goalProgress'
import { fmtMoney, fmtCompact } from '@/lib/format'

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
}

const MONTHS_LONG = ['January','February','March','April','May','June','July','August','September','October','November','December']

export default function DashboardClient(p: Props) {
  const { view, toMonth, fxRate: FX } = useViewStore()
  const { setUploadOpen } = useUiStore()
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

  // The Topbar month picker chooses the month Home describes (its end month)
  const focusMonth = toMonth > today.slice(0, 7) ? today.slice(0, 7) : toMonth

  const nw = useMemo(() => computeNetWorth(p.holdings, view, FX), [p.holdings, view, FX])
  const groups = useMemo(() => groupAssets(nw.assetRows), [nw])
  const hist = useMemo(() => netWorthHistory(p.snapshots, view, today), [p.snapshots, view, today])

  const ins = useMemo(() => buildHomeInsights({
    view, fx: FX, today, focusMonth,
    txns: p.transactions,
    accounts: p.holdings.accounts, loans: p.holdings.loans, insurance: p.insurance,
    fixedDeposits: p.holdings.fixedDeposits, budgets: p.budgets,
    mutualFunds: p.holdings.mutualFunds, stocks: p.holdings.stocks,
    cash: nw.cash,
    invested: { value: nw.totalAssets - nw.cash, cost: nw.totalInvested - nw.cash },
  }), [view, FX, today, focusMonth, p, nw])

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
  const periodLabel = ins.isCurrent
    ? `${MONTHS_LONG[m - 1].slice(0, 3)} 1–${ins.dayCut} · this month so far`
    : `${MONTHS_LONG[m - 1]} ${y}`
  const dateLine = new Date(today + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })
  const viewLabel = view === 'uae' ? 'UAE · AED' : view === 'india' ? 'India · INR' : 'All · INR'

  return (
    <div className="max-w-[1280px] mx-auto space-y-4 sm:space-y-5 animate-fade-up">
      {/* Header */}
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-[22px] sm:text-[24px] font-bold tracking-tight" style={{ color: 'var(--text)' }}>
            {greeting}{p.firstName ? `, ${p.firstName}` : ''}
          </h1>
          <p className="text-[13px] mt-0.5" style={{ color: 'var(--text3)' }}>{dateLine} · {viewLabel}</p>
        </div>
      </div>

      {isEmpty ? <Onboarding onImport={() => setUploadOpen(true)} /> : (<>
      {/* Row 1: Net worth + Needs attention */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <NetWorthCard nw={nw} groups={groups} hist={hist} historyReady={p.historyReady} money={money} short={short} />
        <AttentionCard items={ins.attention} onImport={() => setUploadOpen(true)} />
      </div>

      {/* Row 2: KPI tiles */}
      <div>
        <div className="flex items-baseline justify-between mb-2">
          <h2 className="text-[14px] font-semibold" style={{ color: 'var(--text)' }}>Cash flow</h2>
          <span className="text-[12px]" style={{ color: 'var(--text3)' }}>{periodLabel}</span>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatTile label="Income" value={short(ins.income.value)} upIsGood
            delta={ins.income.comparable ? pctDelta(ins.income.value, ins.income.baseline) : null}
            sub={ins.income.baseline != null ? `Usual ${short(ins.income.baseline)} a month` : 'No earlier months yet'} />
          <StatTile label="Spent" value={short(ins.spend.value)} delta={pctDelta(ins.spend.value, ins.spend.baseline)} upIsGood={false}
            sub={ins.spend.baseline != null ? `Usual ${short(ins.spend.baseline)}${ins.isCurrent ? ' by now' : ''}` : 'No earlier months yet'} />
          <StatTile label="Saved" value={short(ins.saved.value)} upIsGood
            delta={ins.saved.comparable && ins.saved.rate != null && ins.saved.baselineRate != null ? { text: `${Math.abs(ins.saved.rate - ins.saved.baselineRate)} pts`, up: ins.saved.rate >= ins.saved.baselineRate } : null}
            sub={savedSub(ins, short)} />
          <RunwayTile months={ins.runway.months} cash={nw.cash} short={short} />
        </div>
      </div>

      {/* Row 3: Insights + Spending */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <InsightsCard items={ins.insights} />
        <SpendingCard rows={ins.categories} total={ins.spend.value} money={money} short={short} periodLabel={periodLabel} isCurrent={ins.isCurrent} />
      </div>

      {/* Row 4: Coming up + Goals */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <UpcomingCard items={ins.upcoming} today={today} />
        <GoalsCard goals={goals} short={short} />
      </div>
      </>)}
    </div>
  )
}

// ─── Pieces ───────────────────────────────────────────────────────────────────

// Mid-month, salary often hasn't landed yet — a savings % then is meaningless
// (e.g. "−229% of income"), so say what's still to come instead.
function savedSub(ins: ReturnType<typeof buildHomeInsights>, short: (n: number) => string) {
  const { income, saved, isCurrent } = ins
  const incomePending = isCurrent && income.baseline != null && income.value < 0.8 * income.baseline
  if (incomePending) return `Income still to come · usual ${short(income.baseline!)}`
  if (saved.rate == null) return 'No income recorded'
  return `${saved.rate}% of income${isCurrent ? ' so far' : ''}`
}

function pctDelta(value: number, base: number | null) {
  if (base == null || base <= 0) return null
  const p = Math.round((value - base) / base * 100)
  return { text: `${Math.abs(p)}%`, up: p >= 0 }
}

function Card({ children, className = '', ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return <section className={`wl-card p-4 sm:p-5 ${className}`} {...rest}>{children}</section>
}

function CardHeader({ id, title, right }: { id?: string; title: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 mb-3">
      <h2 id={id} className="text-[14px] font-semibold" style={{ color: 'var(--text)' }}>{title}</h2>
      {right}
    </div>
  )
}

function MoreLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="text-[12px] font-medium inline-flex items-center gap-0.5 hover:underline" style={{ color: 'var(--accent)' }}>
      {children} <ChevronRight size={13} />
    </Link>
  )
}

function NetWorthCard({ nw, groups, hist, historyReady, money, short }: {
  nw: ReturnType<typeof computeNetWorth>; groups: ReturnType<typeof groupAssets>
  hist: ReturnType<typeof netWorthHistory>; historyReady: boolean
  money: (n: number) => string; short: (n: number) => string
}) {
  const change = hist.ref ? nw.netWorth - hist.ref.value : null
  const changePct = hist.ref && hist.ref.value !== 0 ? Math.round((nw.netWorth - hist.ref.value) / Math.abs(hist.ref.value) * 1000) / 10 : null
  const up = (change ?? 0) >= 0
  // The live number replaces today's stored point so the line ends where the hero does
  const series = useMemo(() => {
    const s = hist.series.slice(0, -1)
    return [...s, { date: hist.series[hist.series.length - 1]?.date ?? 'today', value: Math.round(nw.netWorth) }]
  }, [hist.series, nw.netWorth])
  const total = groups.reduce((a, g) => a + g.value, 0)

  return (
    <Card className="lg:col-span-2" aria-labelledby="nw-title">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div id="nw-title" className="text-[13px] font-medium" style={{ color: 'var(--text3)' }}>Net worth</div>
          <div className="text-[34px] sm:text-[44px] leading-[1.1] font-bold tracking-tight mt-1" style={{ color: nw.netWorth < 0 ? 'var(--expense)' : 'var(--text)' }}>
            {money(nw.netWorth)}
          </div>
          <div className="mt-1.5 text-[13px] flex items-center gap-1.5 flex-wrap">
            {change != null ? (<>
              <span className="inline-flex items-center gap-0.5 font-semibold" style={{ color: up ? 'var(--income)' : 'var(--expense)' }}>
                {up ? <ArrowUpRight size={15} /> : <ArrowDownRight size={15} />}
                {short(Math.abs(change))}{changePct != null ? ` (${up ? '+' : '−'}${Math.abs(changePct)}%)` : ''}
              </span>
              <span style={{ color: 'var(--text3)' }}>since {fmtDay(hist.ref!.date)}</span>
            </>) : (
              <span style={{ color: 'var(--text3)' }}>
                {historyReady ? 'Tracking started — your trend appears after a few days.' : 'Run migration 023 in Supabase to start tracking net-worth history.'}
              </span>
            )}
          </div>
        </div>
        <div className="flex gap-5 text-[12px]">
          <div><div style={{ color: 'var(--text3)' }}>Assets</div><div className="font-semibold font-mono text-[14px] mt-0.5" style={{ color: 'var(--text)' }}>{short(nw.totalAssets)}</div></div>
          <div><div style={{ color: 'var(--text3)' }}>Liabilities</div><div className="font-semibold font-mono text-[14px] mt-0.5" style={{ color: 'var(--text)' }}>{short(nw.totalLiab)}</div></div>
        </div>
      </div>

      {series.length >= 2 && (
        <div className="h-[96px] -mx-1 mt-3" aria-label="Net worth over time">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={series} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
              <defs>
                <linearGradient id="nwFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#4F46E5" stopOpacity={0.14} />
                  <stop offset="100%" stopColor="#4F46E5" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="date" hide />
              <YAxis hide domain={['dataMin', 'dataMax']} />
              <Tooltip cursor={{ stroke: 'var(--border2)', strokeWidth: 1 }}
                contentStyle={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12, padding: '6px 10px' }}
                labelFormatter={(d: any) => d === 'today' ? 'Today' : fmtDay(String(d))}
                formatter={(v: any) => [money(Number(v)), 'Net worth']} />
              <Area type="monotone" dataKey="value" stroke="#4F46E5" strokeWidth={2} fill="url(#nwFill)" isAnimationActive={false}
                dot={false} activeDot={{ r: 4, stroke: '#fff', strokeWidth: 2, fill: '#4F46E5' }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* What it's made of */}
      {total > 0 && (
        <div className="mt-4">
          <div className="flex h-2.5 w-full gap-[2px]" role="img"
            aria-label={`Assets: ${groups.map(g => `${g.label} ${Math.round(g.value / total * 100)}%`).join(', ')}`}>
            {groups.map((g, i) => (
              <div key={g.key} title={`${g.label} · ${money(g.value)} (${Math.round(g.value / total * 100)}%)`}
                style={{ width: `${g.value / total * 100}%`, minWidth: 3, background: g.color,
                  borderRadius: `${i === 0 ? 4 : 0}px ${i === groups.length - 1 ? 4 : 0}px ${i === groups.length - 1 ? 4 : 0}px ${i === 0 ? 4 : 0}px` }} />
            ))}
          </div>
          <ul className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1.5">
            {groups.map(g => (
              <li key={g.key} className="flex items-center gap-2 text-[12px] min-w-0">
                <span className="w-2.5 h-2.5 rounded-[3px] flex-shrink-0" style={{ background: g.color }} />
                <span className="truncate" style={{ color: 'var(--text2)' }}>{g.label}</span>
                <span className="ml-auto font-mono font-medium" style={{ color: 'var(--text)' }}>{Math.round(g.value / total * 100)}%</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="mt-4 pt-3 flex justify-end" style={{ borderTop: '1px solid var(--border)' }}>
        <MoreLink href="/dashboard/net-worth">Net worth breakdown</MoreLink>
      </div>
    </Card>
  )
}

const SEV: Record<Attention['severity'], { icon: LucideIcon; color: string; bg: string; label: string }> = {
  high:   { icon: AlertCircle, color: 'var(--expense)', bg: 'var(--expense-bg)', label: 'Urgent' },
  medium: { icon: Clock,       color: 'var(--gold)',    bg: 'var(--gold-bg)',    label: 'Soon' },
  low:    { icon: Info,        color: 'var(--accent)',  bg: 'var(--accent-bg)',  label: 'To do' },
}

function AttentionCard({ items, onImport }: { items: Attention[]; onImport: () => void }) {
  const [all, setAll] = useState(false)
  const shown = all ? items : items.slice(0, 5)
  return (
    <Card aria-labelledby="att-title">
      <CardHeader id="att-title" title="Needs attention" right={items.length > 0 && (
        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ background: 'var(--accent-bg)', color: 'var(--accent2)' }}>{items.length}</span>
      )} />
      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center text-center py-8 gap-2">
          <CheckCircle2 size={28} style={{ color: 'var(--income)' }} />
          <div className="text-[14px] font-semibold" style={{ color: 'var(--text)' }}>You&apos;re all caught up</div>
          <div className="text-[12px]" style={{ color: 'var(--text3)' }}>No bills, renewals or missing statements right now.</div>
        </div>
      ) : (
        <ul className="-mx-1">
          {shown.map(it => {
            const s = SEV[it.severity]; const Icon = s.icon
            const action = it.action === 'upload'
              ? <button onClick={onImport} className="wl-btn wl-btn-sm"><Upload size={12} />{it.actionLabel}</button>
              : it.href ? <Link href={it.href} className="wl-btn wl-btn-sm">{it.actionLabel ?? 'Open'}</Link> : null
            return (
              <li key={it.id} className="flex items-start gap-3 px-1 py-2.5" style={{ borderTop: '1px solid var(--border)' }}>
                <span className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5" style={{ background: s.bg }} aria-label={s.label}>
                  <Icon size={14} style={{ color: s.color }} />
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-semibold leading-snug" style={{ color: 'var(--text)' }}>{it.title}</div>
                  <div className="text-[12px] leading-snug mt-0.5" style={{ color: 'var(--text3)' }}>{it.detail}</div>
                </div>
                <div className="flex-shrink-0">{action}</div>
              </li>
            )
          })}
        </ul>
      )}
      {items.length > 5 && (
        <button onClick={() => setAll(a => !a)} className="mt-1 text-[12px] font-medium" style={{ color: 'var(--accent)' }}>
          {all ? 'Show fewer' : `Show all ${items.length}`}
        </button>
      )}
    </Card>
  )
}

function StatTile({ label, value, delta, upIsGood, sub }: {
  label: string; value: string; delta: { text: string; up: boolean } | null; upIsGood: boolean; sub: string
}) {
  const good = delta ? delta.up === upIsGood : true
  return (
    <div className="wl-card p-4">
      <div className="text-[12.5px] font-medium" style={{ color: 'var(--text3)' }}>{label}</div>
      <div className="text-[22px] sm:text-[24px] font-bold tracking-tight mt-1 leading-tight" style={{ color: 'var(--text)' }}>{value}</div>
      <div className="mt-1.5 flex items-center gap-1.5 text-[12px] flex-wrap">
        {delta && (
          <span className="inline-flex items-center gap-0.5 font-semibold" style={{ color: good ? 'var(--income)' : 'var(--expense)' }}
            aria-label={`${delta.up ? 'Up' : 'Down'} ${delta.text} versus usual`}>
            {delta.up ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}{delta.text}
          </span>
        )}
        <span className="leading-snug" style={{ color: 'var(--text3)' }}>{sub}</span>
      </div>
    </div>
  )
}

function RunwayTile({ months, cash, short }: { months: number | null; cash: number; short: (n: number) => string }) {
  const pct = months != null ? Math.min(100, months / 6 * 100) : 0
  const color = months == null ? 'var(--border2)' : months >= 6 ? 'var(--income)' : months >= 3 ? 'var(--gold)' : 'var(--expense)'
  return (
    <div className="wl-card p-4">
      <div className="text-[12.5px] font-medium" style={{ color: 'var(--text3)' }}>Emergency fund</div>
      <div className="text-[22px] sm:text-[24px] font-bold tracking-tight mt-1 leading-tight" style={{ color: 'var(--text)' }}>
        {months != null ? `${months} mo` : '—'}
      </div>
      <div className="mt-2 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--bg2)' }}
        role="meter" aria-valuemin={0} aria-valuemax={6} aria-valuenow={months ?? 0} aria-label="Months of spending covered by cash, target 6">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
      </div>
      <div className="mt-1.5 text-[12px] leading-snug" style={{ color: 'var(--text3)' }}>{short(cash)} cash · target 6 months</div>
    </div>
  )
}

const TONE: Record<Insight['tone'], { icon: LucideIcon; color: string; bg: string }> = {
  good:    { icon: CheckCircle2,  color: 'var(--income)', bg: 'var(--income-bg)' },
  warn:    { icon: AlertTriangle, color: 'var(--gold)',   bg: 'var(--gold-bg)' },
  neutral: { icon: Lightbulb,     color: 'var(--accent)', bg: 'var(--accent-bg)' },
}

function InsightsCard({ items }: { items: Insight[] }) {
  return (
    <Card aria-labelledby="ins-title">
      <CardHeader id="ins-title" title="Insights" />
      {items.length === 0 ? (
        <div className="text-[12.5px] py-6 text-center" style={{ color: 'var(--text3)' }}>
          Insights appear once there are a couple of months of transactions.
        </div>
      ) : (
        <ul className="-mx-1">
          {items.slice(0, 6).map(it => {
            const t = TONE[it.tone]; const Icon = t.icon
            const body = (<>
              <span className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5" style={{ background: t.bg }}>
                <Icon size={14} style={{ color: t.color }} />
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-semibold leading-snug" style={{ color: 'var(--text)' }}>{it.title}</div>
                {it.detail && <div className="text-[12px] leading-snug mt-0.5" style={{ color: 'var(--text3)' }}>{it.detail}</div>}
              </div>
              {it.href && <ChevronRight size={15} className="flex-shrink-0 mt-1.5" style={{ color: 'var(--text4)' }} />}
            </>)
            return (
              <li key={it.id} style={{ borderTop: '1px solid var(--border)' }}>
                {it.href
                  ? <Link href={it.href} className="flex items-start gap-3 px-1 py-2.5 rounded-lg hover:bg-slate-50 transition-colors">{body}</Link>
                  : <div className="flex items-start gap-3 px-1 py-2.5">{body}</div>}
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}

function SpendingCard({ rows, total, money, short, periodLabel, isCurrent }: {
  rows: { cat: string; label: string; value: number; baseline: number | null }[]
  total: number; money: (n: number) => string; short: (n: number) => string; periodLabel: string; isCurrent: boolean
}) {
  const max = Math.max(1, ...rows.map(r => Math.max(r.value, r.baseline ?? 0)))
  const hasBase = rows.some(r => r.baseline != null && r.baseline > 0)
  return (
    <Card className="lg:col-span-2" aria-labelledby="sp-title">
      <CardHeader id="sp-title" title="Where your money went" right={<MoreLink href="/dashboard/expenses/report">Expense report</MoreLink>} />
      <div className="flex items-center gap-4 text-[12px] mb-3 flex-wrap" style={{ color: 'var(--text3)' }}>
        <span>{periodLabel} · <span className="font-semibold font-mono" style={{ color: 'var(--text)' }}>{money(total)}</span></span>
        {hasBase && (
          <span className="flex items-center gap-3 ml-auto">
            <span className="flex items-center gap-1.5"><span className="w-3 h-2 rounded-[2px]" style={{ background: '#4F46E5' }} />This month</span>
            <span className="flex items-center gap-1.5"><span className="w-[2px] h-3" style={{ background: 'var(--text)' }} />Usual{isCurrent ? ' by today' : ''}</span>
          </span>
        )}
      </div>
      {rows.length === 0 ? (
        <div className="text-[12.5px] py-8 text-center" style={{ color: 'var(--text3)' }}>No spending recorded for this period yet.</div>
      ) : (
        <ul className="space-y-3">
          {rows.map(r => {
            const diff = r.baseline != null && r.baseline > 0 ? Math.round((r.value - r.baseline) / r.baseline * 100) : null
            return (
              <li key={r.cat} className="grid grid-cols-[minmax(84px,140px)_1fr_auto] items-center gap-3"
                title={`${r.label}: ${money(r.value)}${r.baseline != null ? ` · usual ${money(r.baseline)}` : ''}`}>
                <span className="text-[12.5px] truncate" style={{ color: 'var(--text2)' }}>{r.label}</span>
                <div className="relative h-3">
                  <div className="absolute inset-y-0 left-0 rounded-r-[4px]" style={{ width: `${r.value / max * 100}%`, minWidth: 2, background: '#4F46E5' }} />
                  {r.baseline != null && r.baseline > 0 && (
                    <div className="absolute -top-[3px] -bottom-[3px] w-[2px] rounded-full" style={{ left: `calc(${r.baseline / max * 100}% - 1px)`, background: 'var(--text)' }} />
                  )}
                </div>
                <span className="text-right whitespace-nowrap">
                  <span className="text-[12.5px] font-semibold font-mono" style={{ color: 'var(--text)' }}>{short(r.value)}</span>
                  {diff != null && Math.abs(diff) >= 5 && (
                    <span className="ml-1.5 text-[11.5px] font-medium" style={{ color: diff > 0 ? 'var(--expense)' : 'var(--income)' }}>
                      {diff > 0 ? '+' : '−'}{Math.abs(diff)}%
                    </span>
                  )}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}

const KIND: Record<Upcoming['kind'], LucideIcon> = { emi: Landmark, card: CreditCard, premium: Shield, fd: CalendarClock, sip: Repeat }

function UpcomingCard({ items, today }: { items: Upcoming[]; today: string }) {
  const totals = items.filter(i => i.kind !== 'fd').reduce((acc, i) => { acc[i.currency] = (acc[i.currency] ?? 0) + i.amount; return acc }, {} as Record<string, number>)
  return (
    <Card className="lg:col-span-2" aria-labelledby="up-title">
      <CardHeader id="up-title" title="Coming up · next 30 days" right={Object.keys(totals).length > 0 && (
        <span className="text-[12px]" style={{ color: 'var(--text3)' }}>
          Out: {Object.entries(totals).map(([c, v]) => <span key={c} className="font-semibold font-mono ml-1" style={{ color: 'var(--text)' }}>{fmtMoney(v, c)}</span>)}
        </span>
      )} />
      {items.length === 0 ? (
        <div className="text-[12.5px] py-8 text-center" style={{ color: 'var(--text3)' }}>
          Nothing scheduled. EMIs, card bills, premiums, SIPs and FD maturities show up here.
        </div>
      ) : (
        <ul className="-mx-1">
          {items.slice(0, 8).map(it => {
            const Icon = KIND[it.kind]
            const d = new Date(it.date + 'T12:00:00')
            const isToday = it.date === today
            return (
              <li key={it.id} className="flex items-center gap-3 px-1 py-2.5" style={{ borderTop: '1px solid var(--border)' }}>
                <div className="w-11 text-center flex-shrink-0 rounded-lg py-1" style={{ background: isToday ? 'var(--accent-bg)' : 'var(--bg2)' }}>
                  <div className="text-[10px] font-semibold uppercase" style={{ color: isToday ? 'var(--accent2)' : 'var(--text3)' }}>{d.toLocaleDateString('en-GB', { month: 'short' })}</div>
                  <div className="text-[15px] font-bold leading-none mt-0.5" style={{ color: 'var(--text)' }}>{d.getDate()}</div>
                </div>
                <Icon size={15} className="flex-shrink-0" style={{ color: 'var(--text3)' }} />
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-medium truncate" style={{ color: 'var(--text)' }}>{it.label}</div>
                  <div className="text-[12px] truncate" style={{ color: 'var(--text3)' }}>{it.sub}</div>
                </div>
                <div className="text-[13px] font-semibold font-mono whitespace-nowrap" style={{ color: it.kind === 'fd' ? 'var(--income)' : 'var(--text)' }}>
                  {it.kind === 'fd' ? '+' : ''}{fmtMoney(it.amount, it.currency)}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}

function GoalsCard({ goals, short }: { goals: any[]; short: (n: number) => string }) {
  return (
    <Card aria-labelledby="goal-title">
      <CardHeader id="goal-title" title="Goals" right={goals.length > 0 && <MoreLink href="/dashboard/goals">All goals</MoreLink>} />
      {goals.length === 0 ? (
        <div className="flex flex-col items-center text-center py-6 gap-2">
          <Target size={26} style={{ color: 'var(--text4)' }} />
          <div className="text-[12.5px]" style={{ color: 'var(--text3)' }}>Set a goal and link investments to track progress automatically.</div>
          <Link href="/dashboard/goals" className="wl-btn wl-btn-sm mt-1">Create a goal</Link>
        </div>
      ) : (
        <ul className="space-y-4">
          {goals.map(g => (
            <li key={g.id}>
              <div className="flex items-baseline justify-between gap-2">
                <Link href={`/dashboard/goals/${g.id}`} className="text-[13px] font-semibold truncate hover:underline" style={{ color: 'var(--text)' }}>{g.name}</Link>
                <span className="text-[12px] font-semibold font-mono" style={{ color: 'var(--text)' }}>{g.pct}%</span>
              </div>
              <div className="mt-1.5 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--accent-bg)' }}
                role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={g.pct} aria-label={`${g.name} progress`}>
                <div className="h-full rounded-full" style={{ width: `${g.pct}%`, background: g.pct >= 100 ? 'var(--income)' : 'var(--accent)' }} />
              </div>
              <div className="mt-1 text-[11.5px] flex justify-between gap-2" style={{ color: 'var(--text3)' }}>
                <span className="truncate">{short(g.current)} of {short(g.target)}</span>
                {g.target_date && <span className="whitespace-nowrap">by {new Date(g.target_date + 'T12:00:00').toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}</span>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

function Onboarding({ onImport }: { onImport: () => void }) {
  const steps: { icon: LucideIcon; title: string; body: string; cta: React.ReactNode }[] = [
    { icon: Upload, title: 'Import a bank statement', body: 'PDF or Excel from any UAE or Indian bank. Transactions are read and categorised for you.',
      cta: <button onClick={onImport} className="wl-btn wl-btn-primary wl-btn-sm"><Upload size={12} />Import</button> },
    { icon: TrendingUp, title: 'Add your investments', body: 'Upload your CAMS / KFintech CAS to bring in every mutual fund with full history.',
      cta: <Link href="/dashboard/investments/mutual-funds" className="wl-btn wl-btn-sm">Open mutual funds</Link> },
    { icon: Wallet, title: 'Add accounts and cards', body: 'Balances and card limits power net worth, due-date reminders and utilisation alerts.',
      cta: <Link href="/dashboard/accounts" className="wl-btn wl-btn-sm">Add accounts</Link> },
  ]
  return (
    <Card>
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
    </Card>
  )
}
