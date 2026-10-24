'use client'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AreaChart, Area, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'
import { Plus, Upload, Mic, Sparkles, ChevronRight, TrendingUp, Wallet, Target, ExternalLink, type LucideIcon } from 'lucide-react'
import { useViewStore } from '@/store/viewStore'
import { useUiStore } from '@/store/uiStore'
import { useHolderStore } from '@/store/holderStore'
import { holderMatches } from '@/hooks/useFamily'
import { computeNetWorth, type Holdings } from '@/lib/netWorth'
import { buildHomeInsights, netWorthHistory, localToday, fmtDay, type Snapshot, type Attention, type HomeInsights } from '@/lib/insights'
import { healthScore, type Tone } from '@/lib/healthScore'
import { goalCurrentValue } from '@/lib/goalProgress'
import { fmtMoney, fmtCompact } from '@/lib/format'
import { newGoalHref } from '@/lib/goalInterests'
import AddTransactionModal from '@/components/forms/AddTransactionModal'
import TransactionVoiceModal from '@/components/forms/TransactionVoiceModal'

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
}

const MONTHS_LONG = ['January','February','March','April','May','June','July','August','September','October','November','December']
const TONE_COLOR: Record<Tone, string> = { good: 'var(--income)', warn: 'var(--gold)', bad: 'var(--expense)', none: 'var(--text3)' }
const SEV_DOT: Record<Attention['severity'], string> = { high: '#DC2626', medium: '#D97706', low: '#4F46E5' }

export default function DashboardClient(p: Props) {
  const router = useRouter()
  const { view, toMonth, fxRate: FX } = useViewStore()
  const { selectedHolder: holder } = useHolderStore()
  const { setUploadOpen, openAdvisor } = useUiStore()
  const [modal, setModal] = useState<null | 'add' | 'voice'>(null)
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
  const hist = useMemo(() => netWorthHistory(holder ? [] : p.snapshots, view, today), [p.snapshots, view, today, holder])

  const ins = useMemo(() => buildHomeInsights({
    view, fx: FX, today, focusMonth,
    txns: p.transactions,
    accounts: h.accounts, loans: h.loans, insurance: p.insurance,
    fixedDeposits: h.fixedDeposits, budgets: p.budgets,
    mutualFunds: h.mutualFunds, stocks: h.stocks,
    cash: nw.cash,
    invested: { value: nw.totalAssets - nw.cash, cost: nw.totalInvested - nw.cash },
  }), [view, FX, today, focusMonth, p, h, nw])

  const health = useMemo(() => {
    const conv = (v: number, c: string) => view === 'consolidated' ? (c === 'AED' ? v * FX : v) : (view === 'uae' ? (c === 'AED' ? v : 0) : (c === 'AED' ? 0 : v))
    return healthScore({
      savingsRate: ins.trend.savingsRate,
      runwayMonths: ins.runway.months,
      monthlyEmi: h.loans.reduce((a, l) => a + conv(Number(l.emi_amount) || 0, l.currency), 0),
      monthlyIncome: ins.trend.avgIncome,
      termCover: p.insurance.filter(x => x.policy_type === 'term_life').reduce((a, x) => a + conv(Number(x.sum_assured) || 0, x.currency), 0),
    })
  }, [ins, h.loans, p.insurance, view, FX])

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

  const review = weeklyReview(ins, health.score)
  const reviewPrompt = 'Write my weekly money review: what went well, what needs attention, and the single best next action.'

  return (
    <div className="max-w-[1280px] mx-auto flex flex-col gap-4 md:gap-[18px] animate-fade-up">
      {/* Header — desktop */}
      <div className="hidden md:flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-[24px] font-bold tracking-tight" style={{ color: 'var(--text)' }}>
            {greeting}{p.firstName ? `, ${p.firstName}` : ''}
          </h1>
          <p className="text-[13px] mt-0.5" style={{ color: 'var(--text3)' }}>{viewLabel} · {holderLabel} · {rangeLabel}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setModal('add')} className="wl-btn" style={{ height: 34 }}><Plus size={14} />Add transaction</button>
          <button onClick={() => setUploadOpen(true)} className="wl-btn" style={{ height: 34 }}><Upload size={14} />Upload statement</button>
          <button onClick={() => setModal('voice')} className="wl-btn wl-btn-primary" style={{ height: 34 }}><Mic size={14} />Speak it</button>
        </div>
      </div>

      {/* Header — phone */}
      <div className="md:hidden">
        <div className="text-[12.5px]" style={{ color: 'var(--text3)' }}>{greeting}</div>
        <div className="text-[20px] font-bold" style={{ color: 'var(--text)' }}>{p.firstName || 'Welcome'}</div>
      </div>
      <div className="md:hidden grid grid-cols-4 gap-2">
        {([
          ['Add', Plus, () => setModal('add')],
          ['Upload', Upload, () => setUploadOpen(true)],
          ['Speak', Mic, () => setModal('voice')],
          ['Ask AI', Sparkles, () => openAdvisor()],
        ] as [string, LucideIcon, () => void][]).map(([label, Icon, fn]) => (
          <button key={label} onClick={fn} className="wl-card py-2.5 flex flex-col items-center gap-1 text-[11px] font-medium" style={{ color: 'var(--text2)' }}>
            <Icon size={18} style={{ color: 'var(--accent)' }} />{label}
          </button>
        ))}
      </div>

      {isEmpty ? <Onboarding onImport={() => setUploadOpen(true)} goalInterests={p.goalInterests} /> : (<>
      {/* Weekly review */}
      <section className="rounded-xl px-4 md:px-[22px] py-4 md:py-[18px] flex flex-col md:flex-row gap-3 md:gap-4 md:items-center"
        style={{ background: '#312E81', color: '#fff' }}>
        <div className="flex-1">
          <div className="text-[11px] font-semibold uppercase tracking-[0.06em]" style={{ color: '#C7D2FE' }}>✦ Your weekly review</div>
          <p className="text-[13px] md:text-[14px] leading-relaxed mt-1.5" style={{ color: '#E0E7FF' }}>{review}</p>
        </div>
        <button onClick={() => openAdvisor(reviewPrompt)}
          className="self-start md:self-auto flex-shrink-0 rounded-full px-4 py-2 text-[12.5px] font-semibold"
          style={{ background: '#fff', color: '#312E81' }}>
          Ask AI for more
        </button>
      </section>

      {/* Row 1: Net worth + Needs attention */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-4">
        <NetWorthCard nw={nw} hist={hist} historyReady={p.historyReady} holderLabel={holder ? holderLabel : null}
          savingsRate={ins.trend.savingsRate} money={money} short={short} />
        <AttentionCard items={ins.attention} onImport={() => setUploadOpen(true)} />
      </div>

      {/* Row 2: Health, Goals, 30-day cash flow */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <HealthCard score={health.score} parts={health.parts} />
        <GoalsCard goals={goals} short={short} interests={p.goalInterests} />
        <CashFlowCard forecast={ins.forecast} short={short} money={money} />
      </div>

      {/* Row 3: News + Learn */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.3fr_1fr] gap-4">
        <NewsCard holdings={h} />
        <LearnCard ins={ins} hasSip={h.mutualFunds.some(x => x.has_sip)} />
      </div>
      </>)}

      {modal === 'add' && <AddTransactionModal onClose={() => setModal(null)} onAdded={onAdded} />}
      {modal === 'voice' && <TransactionVoiceModal onClose={() => { setModal(null); onAdded() }} />}
    </div>
  )
}

// Rule-based weekly summary; "Ask AI for more" hands the same question to the advisor
function weeklyReview(ins: HomeInsights, score: number) {
  const bits: string[] = []
  if (ins.trend.savingsRate != null) bits.push(`You're saving ${Math.max(ins.trend.savingsRate, 0)}% of income${ins.trend.savingsRate < 20 ? ' against a 20% target' : ', above the 20% target'}.`)
  const up = ins.insights.find(i => i.id === 'up')
  const pace = ins.insights.find(i => i.id === 'pace')
  if (up) bits.push(`${up.title}.`)
  else if (pace) bits.push(`${pace.title}.`)
  const urgent = ins.attention.filter(a => a.severity !== 'low').length
  bits.push(urgent ? `${urgent} item${urgent === 1 ? '' : 's'} need${urgent === 1 ? 's' : ''} attention this week.` : 'Nothing urgent this week.')
  bits.push(`Health score ${score}/100.`)
  return bits.join(' ')
}

// ─── Cards ────────────────────────────────────────────────────────────────────

function Card({ children, className = '', ...rest }: React.HTMLAttributes<HTMLElement>) {
  return <section className={`wl-card px-[18px] md:px-5 py-[18px] ${className}`} {...rest}>{children}</section>
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

function NetWorthCard({ nw, hist, historyReady, holderLabel, savingsRate, money, short }: {
  nw: ReturnType<typeof computeNetWorth>; hist: ReturnType<typeof netWorthHistory>; historyReady: boolean
  holderLabel: string | null; savingsRate: number | null; money: (n: number) => string; short: (n: number) => string
}) {
  const change = hist.ref ? nw.netWorth - hist.ref.value : null
  const changePct = hist.ref && hist.ref.value !== 0 ? Math.round(change! / Math.abs(hist.ref.value) * 1000) / 10 : null
  const up = (change ?? 0) >= 0
  // The live number replaces today's stored point so the line ends where the hero does
  const series = useMemo(() => {
    const s = hist.series.slice(0, -1)
    return [...s, { date: hist.series[hist.series.length - 1]?.date ?? 'today', value: Math.round(nw.netWorth) }]
  }, [hist.series, nw.netWorth])
  const labels = series.length >= 3 ? [series[0], series[Math.floor(series.length / 2)], series[series.length - 1]] : []

  return (
    <Card className="!px-[22px] !py-5" aria-labelledby="nw-title">
      <div id="nw-title" className="wl-eyebrow">Net worth{holderLabel ? ` · ${holderLabel}` : ''}</div>
      <div className="flex items-baseline gap-3 flex-wrap mt-1 mb-0.5">
        <div className="text-[30px] md:text-[34px] font-bold tracking-tight font-mono" style={{ color: nw.netWorth < 0 ? 'var(--expense)' : 'var(--text)', letterSpacing: '-0.02em' }}>
          {money(nw.netWorth)}
        </div>
        {change != null && (
          <div className="text-[13px] font-semibold" style={{ color: up ? 'var(--income)' : 'var(--expense)' }}>
            {up ? '▲' : '▼'} {short(Math.abs(change))}{changePct != null ? ` (${Math.abs(changePct)}%)` : ''} since {fmtDay(hist.ref!.date)}
          </div>
        )}
      </div>
      {change == null && (
        <div className="text-[12.5px]" style={{ color: 'var(--text3)' }}>
          {holderLabel ? 'Trend shows the whole family — switch to Family to see it.'
            : historyReady ? 'Tracking started — your trend appears after a few days.'
            : 'Run migration 023 in Supabase to start tracking net-worth history.'}
        </div>
      )}

      {series.length >= 2 && (
        <>
          <div className="h-[120px] md:h-[150px] mt-3 -mx-1" aria-label="Net worth over time">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={series} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
                <XAxis dataKey="date" hide />
                <YAxis hide domain={['dataMin', 'dataMax']} />
                <Tooltip cursor={{ stroke: 'var(--border2)', strokeWidth: 1 }}
                  contentStyle={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12, padding: '6px 10px' }}
                  labelFormatter={(d: any) => d === 'today' ? 'Today' : fmtDay(String(d))}
                  formatter={(v: any) => [money(Number(v)), 'Net worth']} />
                <Area type="monotone" dataKey="value" stroke="#4F46E5" strokeWidth={2.5} fill="#EEF2FF" fillOpacity={1} isAnimationActive={false}
                  dot={false} activeDot={{ r: 4, stroke: '#fff', strokeWidth: 2, fill: '#4F46E5' }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          {labels.length > 0 && (
            <div className="flex justify-between text-[11px] mt-1.5" style={{ color: 'var(--text4)' }}>
              {labels.map((l, i) => <span key={i}>{l.date === 'today' ? 'Today' : fmtDay(l.date)}</span>)}
            </div>
          )}
        </>
      )}

      <div className="grid grid-cols-3 gap-3 mt-3.5 pt-3.5" style={{ borderTop: '1px solid #F1F5F9' }}>
        {([
          ['Assets', short(nw.totalAssets), 'var(--text)'],
          ['Liabilities', short(nw.totalLiab), nw.totalLiab > 0 ? 'var(--expense)' : 'var(--text)'],
          ['Savings rate', savingsRate != null ? `${savingsRate}%` : '—', savingsRate == null ? 'var(--text3)' : savingsRate >= 20 ? 'var(--income)' : 'var(--gold)'],
        ] as const).map(([l, v, c]) => (
          <div key={l}>
            <div className="text-[11.5px]" style={{ color: 'var(--text3)' }}>{l}</div>
            <div className="text-[16px] font-semibold font-mono" style={{ color: c }}>{v}</div>
          </div>
        ))}
      </div>
      <div className="mt-3 flex justify-end"><MoreLink href="/dashboard/net-worth">Net worth breakdown</MoreLink></div>
    </Card>
  )
}

function AttentionCard({ items, onImport }: { items: Attention[]; onImport: () => void }) {
  const [all, setAll] = useState(false)
  const shown = all ? items : items.slice(0, 4)
  return (
    <Card aria-labelledby="att-title" className="flex flex-col">
      <CardTitle id="att-title" right={items.length > 0 && (
        <span className="text-[11px] font-semibold px-2 py-[3px] rounded-full" style={{ background: '#FEF2F2', color: '#DC2626' }}>{items.length}</span>
      )}>Needs attention</CardTitle>
      {items.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center py-8 gap-1.5">
          <div className="w-10 h-10 rounded-full flex items-center justify-center text-[18px]" style={{ background: 'var(--income-bg)', color: 'var(--income)' }}>✓</div>
          <div className="text-[14px] font-semibold mt-1" style={{ color: 'var(--text)' }}>You&apos;re all caught up</div>
          <div className="text-[12px]" style={{ color: 'var(--text3)' }}>No bills, renewals or missing statements right now.</div>
        </div>
      ) : (
        <ul className="mt-2.5">
          {shown.map(it => (
            <li key={it.id} className="flex gap-2.5 items-start py-[9px]" style={{ borderTop: '1px solid #F1F5F9' }}>
              <span className="w-2 h-2 rounded-full mt-[5px] flex-shrink-0" style={{ background: SEV_DOT[it.severity] }}
                aria-label={it.severity === 'high' ? 'Urgent' : it.severity === 'medium' ? 'Soon' : 'To do'} />
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-semibold" style={{ color: 'var(--text)' }}>{it.title}</div>
                <div className="text-[12px] mt-px" style={{ color: 'var(--text3)' }}>{it.detail}</div>
              </div>
              {it.action === 'upload'
                ? <button onClick={onImport} className="text-[12px] font-semibold whitespace-nowrap" style={{ color: 'var(--accent)' }}>{it.actionLabel}</button>
                : it.href ? <Link href={it.href} className="text-[12px] font-semibold whitespace-nowrap" style={{ color: 'var(--accent)' }}>{it.actionLabel ?? 'Open'}</Link> : null}
            </li>
          ))}
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

function HealthCard({ score, parts }: { score: number; parts: { label: string; value: string; tone: Tone }[] }) {
  return (
    <Card aria-labelledby="health-title">
      <CardTitle id="health-title" right={<MoreLink href="/dashboard/financial-health">Details</MoreLink>}>Financial health</CardTitle>
      <div className="flex flex-wrap gap-4 items-center mt-3">
        <div className="relative flex-shrink-0" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={score} aria-label="Financial health score">
          <svg viewBox="0 0 36 36" className="w-[84px] h-[84px] md:w-[92px] md:h-[92px] -rotate-90">
            <circle cx="18" cy="18" r="15.9155" fill="none" stroke="#EEF2FF" strokeWidth="3.5" />
            <circle cx="18" cy="18" r="15.9155" fill="none" stroke="#4F46E5" strokeWidth="3.5" strokeLinecap="round" strokeDasharray={`${score} ${100 - score}`} />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <div className="text-[24px] font-bold leading-none" style={{ color: 'var(--text)' }}>{score}</div>
            <div className="text-[10px] mt-0.5" style={{ color: 'var(--text3)' }}>of 100</div>
          </div>
        </div>
        <ul className="flex-1 flex flex-col gap-[7px] min-w-[170px]">
          {parts.map(pt => (
            <li key={pt.label} className="flex justify-between gap-2 text-[12px]">
              <span className="whitespace-nowrap" style={{ color: 'var(--text2)' }}>{pt.label}</span>
              <span className="font-semibold whitespace-nowrap" style={{ color: TONE_COLOR[pt.tone] }}>{pt.value}</span>
            </li>
          ))}
        </ul>
      </div>
    </Card>
  )
}

const GOAL_COLORS = ['#16A34A', '#E11D48', '#4F46E5']

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

function GoalsCard({ goals, short, interests }: { goals: any[]; short: (n: number) => string; interests: string[] }) {
  return (
    <Card aria-labelledby="goals-title" className="flex flex-col">
      <CardTitle id="goals-title" right={goals.length > 0 && <MoreLink href="/dashboard/goals">All goals</MoreLink>}>Goals</CardTitle>
      {goals.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center py-6 gap-2">
          <Target size={24} style={{ color: 'var(--text4)' }} />
          {interests.length > 0 ? (<>
            <div className="text-[12.5px]" style={{ color: 'var(--text3)' }}>Set a target for what you&apos;re working towards — linked investments track it automatically.</div>
            <div className="mt-1 flex justify-center"><InterestChips interests={interests} /></div>
          </>) : (<>
            <div className="text-[12.5px]" style={{ color: 'var(--text3)' }}>Set a goal and link investments to track it automatically.</div>
            <Link href="/dashboard/goals" className="wl-btn wl-btn-sm mt-1">Create a goal</Link>
          </>)}
        </div>
      ) : (
        <ul className="flex flex-col gap-3 mt-3">
          {goals.map((g, i) => (
            <li key={g.id}>
              <div className="flex justify-between text-[12.5px] mb-[5px] gap-2">
                <Link href={`/dashboard/goals/${g.id}`} className="font-semibold truncate hover:underline" style={{ color: 'var(--text)' }}>{g.name}</Link>
                <span style={{ color: 'var(--text3)' }}>{g.pct}%</span>
              </div>
              <div className="h-1.5 rounded-full" style={{ background: '#F1F5F9' }}
                role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={g.pct} aria-label={`${g.name} progress`}>
                <div className="h-full rounded-full" style={{ width: `${g.pct}%`, background: GOAL_COLORS[i % GOAL_COLORS.length] }} />
              </div>
              <div className="text-[11px] mt-1" style={{ color: 'var(--text4)' }}>{short(g.current)} of {short(g.target)}</div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

function CashFlowCard({ forecast, short, money }: { forecast: HomeInsights['forecast']; short: (n: number) => string; money: (n: number) => string }) {
  const shortfall = forecast ? forecast.low.value < 0 : false
  return (
    <Card aria-labelledby="cf-title">
      <CardTitle id="cf-title" right={forecast && (
        <span className="text-[11px] font-semibold" style={{ color: shortfall ? 'var(--expense)' : 'var(--income)' }}>
          {shortfall ? 'Shortfall ahead' : 'No shortfall'}
        </span>
      )}>30-day cash flow</CardTitle>
      {!forecast ? (
        <div className="text-[12.5px] py-8 text-center" style={{ color: 'var(--text3)' }}>Add bank balances and a few months of transactions to see a forecast.</div>
      ) : (
        <>
          <div className="h-[84px] mt-3 mb-1.5 -mx-1" aria-label="Projected balance for the next 30 days">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={forecast.points} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
                <XAxis dataKey="date" hide />
                <YAxis hide domain={['dataMin', 'dataMax']} />
                {shortfall && <ReferenceLine y={0} stroke="var(--border2)" strokeDasharray="3 3" />}
                <Tooltip cursor={{ stroke: 'var(--border2)', strokeWidth: 1 }}
                  contentStyle={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12, padding: '6px 10px' }}
                  labelFormatter={(d: any) => fmtDay(String(d))}
                  formatter={(v: any) => [money(Number(v)), 'Projected balance']} />
                <Line type="monotone" dataKey="value" stroke={shortfall ? '#DC2626' : '#16A34A'} strokeWidth={2.2} dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p className="text-[12px] leading-snug" style={{ color: 'var(--text3)' }}>
            Lowest point <b style={{ color: 'var(--text)' }}>{short(forecast.low.value)}</b> on {fmtDay(forecast.low.date)}
            {forecast.lowAfter ? `, after ${forecast.lowAfter}` : ''}. Estimate from your usual income and spending.
          </p>
          <div className="mt-2.5"><MoreLink href="/dashboard/cashflow">Full forecast</MoreLink></div>
        </>
      )}
    </Card>
  )
}

interface NewsItem { title: string; link: string; pubDate: string; source: string }

function timeAgo(iso: string) {
  const mins = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60000))
  if (!isFinite(mins)) return ''
  return mins < 60 ? `${mins}m` : mins < 1440 ? `${Math.round(mins / 60)}h` : `${Math.round(mins / 1440)}d`
}

function NewsCard({ holdings }: { holdings: Holdings }) {
  const terms = useMemo(() => Array.from(new Set([
    ...holdings.mutualFunds.map(f => String(f.fund_name || '').split(' ').slice(0, 2).join(' ')),
    ...holdings.stocks.map(s => String(s.name || s.symbol || '')),
  ].filter(t => t.length > 2))).slice(0, 12), [holdings])
  const [items, setItems] = useState<NewsItem[] | null>(null)

  useEffect(() => {
    let live = true
    fetch(`/api/market-news${terms.length ? `?terms=${encodeURIComponent(terms.join(','))}` : ''}`)
      .then(r => r.json()).then(d => { if (live) setItems((d.articles ?? []).slice(0, 3)) })
      .catch(() => { if (live) setItems([]) })
    return () => { live = false }
  }, [terms])

  const tagOf = (t: string) => terms.find(term => t.toLowerCase().includes(term.toLowerCase().split(' ')[0]))

  return (
    <Card aria-labelledby="news-title">
      <CardTitle id="news-title" right={<MoreLink href="/dashboard/investments/mutual-funds">More news</MoreLink>}>Market news for your holdings</CardTitle>
      {items === null ? (
        <ul className="mt-2">{[0, 1, 2].map(i => <li key={i} className="h-12 my-2 rounded-lg animate-pulse" style={{ background: 'var(--bg2)' }} />)}</ul>
      ) : items.length === 0 ? (
        <div className="text-[12.5px] py-6 text-center" style={{ color: 'var(--text3)' }}>No fresh headlines right now.</div>
      ) : (
        <ul className="mt-1.5">
          {items.map((a, i) => {
            const tag = tagOf(a.title)
            return (
              <li key={i} className="py-2.5" style={{ borderTop: '1px solid #F1F5F9' }}>
                <a href={a.link} target="_blank" rel="noopener noreferrer" className="group block">
                  <div className="text-[13.5px] font-semibold leading-snug group-hover:underline" style={{ color: 'var(--text)' }}>
                    {a.title} <ExternalLink size={11} className="inline -mt-0.5 opacity-50" />
                  </div>
                  <div className="text-[11.5px] mt-1 flex items-center gap-2 flex-wrap" style={{ color: 'var(--text3)' }}>
                    {a.source}{a.pubDate ? ` · ${timeAgo(a.pubDate)}` : ''}
                    {tag && <span className="text-[10.5px] font-semibold px-2 py-0.5 rounded-full" style={{ background: 'var(--accent-bg)', color: 'var(--accent2)' }}>Affects · {tag}</span>}
                  </div>
                </a>
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}

// Two lessons chosen from what's going on in the user's data
function LearnCard({ ins, hasSip }: { ins: HomeInsights; hasSip: boolean }) {
  const picks: { mod: string; color: string; title: string; why: string; href: string }[] = []
  const has = (prefix: string) => ins.attention.some(a => a.id.startsWith(prefix))
  if (has('card') || has('util')) picks.push({ mod: 'Credit cards', color: '#D97706', title: 'Statement date vs due date', why: has('card') ? 'Your card bill is due soon.' : 'Card utilisation is above 30%.', href: '/dashboard/cards/learn' })
  if (has('bud')) picks.push({ mod: 'Budgets', color: '#2563EB', title: 'Budgets are plans, not punishments', why: 'A category is over budget this month.', href: '/dashboard/budgets/learn' })
  if (hasSip) picks.push({ mod: 'Investments', color: '#16A34A', title: 'What a SIP really does', why: 'You invest through SIPs every month.', href: '/dashboard/learn' })
  if (ins.runway.months != null && ins.runway.months < 6) picks.push({ mod: 'Goals', color: '#7C3AED', title: 'Build a safety net first', why: `Your emergency fund covers ${ins.runway.months} months.`, href: '/dashboard/goals/learn' })
  picks.push({ mod: 'Expenses', color: '#4F46E5', title: 'Why categories beat totals', why: 'See where every dirham and rupee goes.', href: '/dashboard/expenses/learn' })

  return (
    <Card aria-labelledby="learn-title" className="flex flex-col gap-2.5">
      <CardTitle id="learn-title" right={<MoreLink href="/dashboard/learn">Learn hub</MoreLink>}>Learn, picked from your data</CardTitle>
      {picks.slice(0, 2).map(pk => (
        <Link key={pk.title} href={pk.href} className="block rounded-[10px] px-3.5 py-3 transition-colors hover:border-[var(--accent-border)]"
          style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}>
          <div className="text-[11px] font-semibold uppercase tracking-[0.05em]" style={{ color: pk.color }}>{pk.mod}</div>
          <div className="text-[13.5px] font-semibold my-0.5" style={{ color: 'var(--text)' }}>{pk.title}</div>
          <div className="text-[12px]" style={{ color: 'var(--text3)' }}>{pk.why}</div>
        </Link>
      ))}
    </Card>
  )
}

function Onboarding({ onImport, goalInterests }: { onImport: () => void; goalInterests: string[] }) {
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
      {goalInterests.length > 0 && (
        <div className="mt-4 pt-4 flex flex-col md:flex-row md:items-center gap-2 md:gap-3" style={{ borderTop: '1px solid #F1F5F9' }}>
          <span className="text-[12.5px] font-semibold flex-shrink-0" style={{ color: 'var(--text2)' }}>Your goals — set a target:</span>
          <InterestChips interests={goalInterests} />
        </div>
      )}
    </Card>
  )
}
