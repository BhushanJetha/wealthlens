'use client'
import { useMemo, useState } from 'react'
import { useViewStore } from '@/store/viewStore'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import AddGoalModal from '@/components/forms/AddGoalModal'
import LinkInvestmentModal from '@/components/forms/LinkInvestmentModal'
import {
  ChevronLeft, Edit2, Link2, Target, TrendingUp, Clock, CheckCircle2,
  AlertTriangle, BarChart2, Calculator, Layers, Lightbulb, Zap,
  Rocket, CalendarDays, FastForward,
} from 'lucide-react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, BarChart, Bar,
} from 'recharts'


const CAT_LABELS: Record<string, string> = {
  equity: 'Equity', mutual_fund: 'Mutual Funds', fixed_income: 'Fixed Income',
  gold: 'Gold', real_estate: 'Real Estate', retirement: 'Retirement',
  emergency: 'Emergency', general: 'General',
}
const CAT_RETURNS: Record<string, number> = {
  equity: 15, mutual_fund: 12, fixed_income: 7, gold: 8,
  real_estate: 10, retirement: 10, emergency: 5, general: 10,
}
const TYPE_LABELS: Record<string, string> = {
  stocks: 'Stocks', mutual_funds: 'MF', fixed_deposits: 'FD',
  recurring_deposits: 'RD', nps_accounts: 'NPS', lic_policies: 'LIC',
  gold_investments: 'Gold', bond_investments: 'Bonds', etf_investments: 'ETF',
}

function getInvCurrentValue(type: string, rec: any): number {
  if (type === 'stocks') return (rec.quantity ?? 0) * (rec.current_price ?? rec.avg_buy_price ?? 0)
  if (type === 'mutual_funds') return (rec.units ?? 0) * (rec.current_nav ?? rec.avg_nav ?? 0)
  if (type === 'fixed_deposits') return rec.principal ?? 0
  if (type === 'recurring_deposits') {
    const start = new Date(rec.start_date ?? rec.created_at)
    const months = Math.max(0, (new Date().getFullYear() - start.getFullYear()) * 12 + new Date().getMonth() - start.getMonth())
    return months * (rec.monthly_amount ?? 0)
  }
  if (type === 'nps_accounts') return rec.corpus_amount ?? rec.invested_amount ?? 0
  if (type === 'lic_policies') return rec.total_paid ?? 0
  if (type === 'gold_investments') return rec.quantity_grams && rec.current_price_per_gram ? rec.quantity_grams * rec.current_price_per_gram : rec.invested_amount ?? 0
  return rec.invested_amount ?? 0
}
function getInvName(type: string, rec: any): string {
  if (type === 'stocks') return `${rec.symbol ?? ''}`.trim() || 'Stock'
  if (type === 'mutual_funds') return rec.fund_name ?? 'Mutual Fund'
  if (type === 'etf_investments') return rec.etf_name ?? 'ETF'
  return rec.name ?? rec.bank_name ?? 'Investment'
}

function calcSIP(target: number, current: number, months: number, annualRate: number): number {
  if (months <= 0) return 0
  const r = annualRate / 100 / 12
  if (r === 0) return Math.max(0, (target - current) / months)
  const fvFactor = Math.pow(1 + r, months)
  const corpus = target - current * fvFactor
  if (corpus <= 0) return 0
  return corpus * r / (fvFactor - 1) / (1 + r)
}

type TabKey = 'overview' | 'trajectory' | 'calculator' | 'investments'
const TABS: { key: TabKey; label: string; icon: React.ElementType }[] = [
  { key: 'overview',    label: 'Overview',     icon: Target     },
  { key: 'trajectory',  label: 'Trajectory',   icon: BarChart2  },
  { key: 'calculator',  label: 'Calculator',   icon: Calculator },
  { key: 'investments', label: 'Investments',  icon: Layers     },
]

type AllInvestments = Record<string, any[]>

interface Props {
  goal: any
  linkedInvestments: { gi: any; record: any }[]
  allInvestments: AllInvestments
}

export default function GoalDetailClient({ goal, linkedInvestments, allInvestments }: Props) {
  const { view, fxRate: FX } = useViewStore()
  const router = useRouter()
  const supabase = createClient()
  const [tab, setTab] = useState<TabKey>('overview')
  const [showEdit, setShowEdit] = useState(false)
  const [showLink, setShowLink] = useState(false)
  const [sipRate, setSipRate] = useState(CAT_RETURNS[goal.category] ?? 10)
  const [simSIP, setSimSIP] = useState(0)
  const [adjustMonths, setAdjustMonths] = useState(0)
  const [savingDate, setSavingDate] = useState(false)
  const [showCelebration, setShowCelebration] = useState(true)

  const toINR = (v: number, cur: string) => cur === 'AED' ? v * FX : v
  const conv = (v: number, cur: string) => view === 'consolidated' ? toINR(v, cur) : v
  const sym = view === 'uae' ? 'AED' : '₹'
  const fmt = (v: number) => `${sym}${Math.abs(v).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
  const fmtC = (v: number) => `${sym}${Math.abs(v).toLocaleString('en-IN', { maximumFractionDigits: 0, minimumFractionDigits: 0 })}`

  const targetInView = conv(Number(goal.target_amount), goal.currency)
  const currentValue = useMemo(() => linkedInvestments.reduce((s, { gi, record }) => {
    const raw = conv(getInvCurrentValue(gi.investment_type, record), record.currency ?? 'INR')
    const alloc = (gi.allocation_pct ?? 100) / 100
    return s + raw * alloc
  }, 0), [linkedInvestments, view])

  const monthsLeft = Math.ceil((new Date(goal.target_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24 * 30))
  const daysLeft = Math.ceil((new Date(goal.target_date).getTime() - Date.now()) / 86400000)
  const pct = targetInView > 0 ? Math.min((currentValue / targetInView) * 100, 100) : 0
  const gap = Math.max(0, targetInView - currentValue)
  const isAchieved = pct >= 100 || goal.status === 'achieved'

  const monthlySIPNeeded = useMemo(() => calcSIP(targetInView, currentValue, monthsLeft, sipRate), [targetInView, currentValue, monthsLeft, sipRate])

  // Trajectory data — forward projection
  const trajectoryData = useMemo(() => {
    const pts: { label: string; required: number; atRate: number; withSIP: number; target: number }[] = []
    const n = Math.min(Math.max(monthsLeft, 6), 72)
    const r = sipRate / 100 / 12
    for (let m = 0; m <= n; m += Math.ceil(n / 24)) {
      const date = new Date()
      date.setMonth(date.getMonth() + m)
      const label = date.toLocaleDateString('en', { month: 'short', year: '2-digit' })
      const required = currentValue + (targetInView - currentValue) * (m / Math.max(monthsLeft, 1))
      const fvFactor = r > 0 ? Math.pow(1 + r, m) : 1
      const atRate = currentValue * fvFactor
      const sipFv = r > 0 ? monthlySIPNeeded * (fvFactor - 1) / r * (1 + r) : monthlySIPNeeded * m
      const withSIP = atRate + sipFv
      const simFv = r > 0 ? simSIP * (fvFactor - 1) / r * (1 + r) : simSIP * m
      pts.push({ label, required: Math.round(required), atRate: Math.round(atRate), withSIP: Math.round(withSIP + (simSIP > 0 ? simFv : 0)), target: Math.round(targetInView) })
    }
    return pts
  }, [currentValue, targetInView, monthsLeft, sipRate, monthlySIPNeeded, simSIP])

  // Milestones
  const milestones = [25, 50, 75, 100].map(p => ({
    pct: p,
    amount: (targetInView * p) / 100,
    achieved: pct >= p,
    label: p === 100 ? '🏆 Goal!' : `${p}%`,
  }))

  // Suggestions
  const suggestions = useMemo(() => {
    const list: string[] = []
    if (pct < 25 && monthsLeft < 12) list.push(`You need ${fmt(monthlySIPNeeded)}/month to reach this goal on time.`)
    if (linkedInvestments.length === 0) list.push('Link your investments to get accurate progress tracking.')
    if (pct < 50 && monthsLeft > 36) list.push(`At ${sipRate}% CAGR, a SIP of ${fmt(monthlySIPNeeded)}/month keeps you on track.`)
    if (goal.category === 'equity' && monthsLeft > 36) list.push('Long-term equity goals benefit from SIP through market cycles.')
    if (goal.category === 'emergency') list.push('Keep emergency funds in liquid FDs or savings accounts.')
    if (gap > 500000 && monthsLeft < 24) list.push('Consider increasing monthly investments or extending the target date.')
    if (list.length === 0) list.push(`Great progress! Keep investing ${fmt(monthlySIPNeeded)}/month to stay on track.`)
    return list.slice(0, 3)
  }, [pct, monthsLeft, linkedInvestments, monthlySIPNeeded, goal, gap])

  // SIP simulator — months to reach goal
  const simMonths = useMemo(() => {
    if (simSIP <= 0) return null
    const r = sipRate / 100 / 12
    let corpus = currentValue
    for (let m = 1; m <= 600; m++) {
      corpus = corpus * (1 + r) + simSIP
      if (corpus >= targetInView) return m
    }
    return null
  }, [simSIP, sipRate, currentValue, targetInView])

  // Adjusted target date for timeline slider
  const adjustedTargetDate = useMemo(() => {
    const d = new Date(goal.target_date)
    d.setMonth(d.getMonth() + adjustMonths)
    return d
  }, [goal.target_date, adjustMonths])
  const adjustedMonthsLeft = useMemo(() => {
    return Math.max(1, Math.ceil((adjustedTargetDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24 * 30)))
  }, [adjustedTargetDate])
  const adjustedSIP = useMemo(() =>
    calcSIP(targetInView, currentValue, adjustedMonthsLeft, sipRate),
    [targetInView, currentValue, adjustedMonthsLeft, sipRate]
  )

  async function saveAdjustedDate() {
    setSavingDate(true)
    const sbClient = createClient()
    await sbClient.from('goals').update({
      target_date: adjustedTargetDate.toISOString().slice(0, 10),
    }).eq('id', goal.id)
    router.refresh()
    setAdjustMonths(0)
    setSavingDate(false)
  }

  const linkedGIs = linkedInvestments.map(({ gi }) => gi)

  const termMonths = Math.ceil((new Date(goal.target_date).getTime() - new Date(goal.created_at).getTime()) / (1000 * 60 * 60 * 24 * 30))
  const term = termMonths <= 12 ? 'Short Term' : termMonths <= 36 ? 'Mid Term' : 'Long Term'
  const termColor = termMonths <= 12 ? 'var(--gold)' : termMonths <= 36 ? 'var(--blue)' : 'var(--sage)'
  const termBg = termMonths <= 12 ? 'var(--gold-bg)' : termMonths <= 36 ? 'var(--blue-bg)' : 'var(--sage-bg)'

  return (
    <div className="p-6 space-y-5 animate-fade-up">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2">
        <Link href="/dashboard/goals" className="flex items-center gap-1 text-[11px] font-medium hover:opacity-80 transition-opacity"
          style={{ color: 'var(--text3)' }}>
          <ChevronLeft size={13} /> Goals
        </Link>
        <span style={{ color: 'var(--border2)' }}>/</span>
        <span className="text-[11px] font-semibold truncate" style={{ color: 'var(--text)' }}>{goal.name}</span>
      </div>

      {/* Goal header card */}
      <div className="wl-card p-5 relative overflow-hidden"
        style={{ border: `1.5px solid ${goal.color}30`, background: `linear-gradient(135deg, ${goal.color}08 0%, transparent 60%)` }}>
        <div className="absolute top-4 right-4 flex items-center gap-2">
          <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold" style={{ background: termBg, color: termColor }}>{term}</span>
          {isAchieved && <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold" style={{ background: 'var(--income-bg)', color: 'var(--income)' }}>✓ Achieved</span>}
          <button onClick={() => setShowEdit(true)} className="p-1.5 rounded-lg transition-colors hover:bg-[var(--bg2)]" style={{ color: 'var(--text3)' }}>
            <Edit2 size={13} />
          </button>
        </div>

        <div className="flex items-start gap-4">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl flex-shrink-0"
            style={{ background: `${goal.color}20`, border: `2px solid ${goal.color}40` }}>{goal.icon}</div>
          <div className="flex-1 pr-16">
            <h1 className="text-[18px] font-bold" style={{ color: 'var(--text)' }}>{goal.name}</h1>
            {goal.description && <p className="text-[12px] mt-1" style={{ color: 'var(--text3)' }}>{goal.description}</p>}
            <div className="flex items-center gap-3 mt-2 flex-wrap">
              <span className="text-[11px]" style={{ color: 'var(--text3)' }}>{CAT_LABELS[goal.category]}</span>
              <span style={{ color: 'var(--border2)' }}>·</span>
              <span className="text-[11px]" style={{ color: isAchieved ? 'var(--income)' : daysLeft < 90 ? 'var(--rose)' : 'var(--text3)' }}>
                {daysLeft <= 0 ? 'Overdue' : `${daysLeft} days left`}
              </span>
              <span style={{ color: 'var(--border2)' }}>·</span>
              <span className="text-[11px]" style={{ color: 'var(--text3)' }}>by {new Date(goal.target_date).toLocaleDateString('en', { month: 'long', year: 'numeric' })}</span>
            </div>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mt-4">
          <div className="flex justify-between mb-1.5">
            <span className="text-[11px]" style={{ color: 'var(--text3)' }}>{fmt(currentValue)} invested</span>
            <span className="text-[13px] font-bold" style={{ color: goal.color }}>{pct.toFixed(1)}%</span>
            <span className="text-[11px]" style={{ color: 'var(--text3)' }}>{fmt(targetInView)} target</span>
          </div>
          <div className="h-3 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
            <div className="h-full rounded-full transition-all duration-700 relative overflow-hidden"
              style={{ width: `${pct}%`, background: isAchieved ? 'var(--income)' : goal.color }}>
              <div className="absolute inset-0 opacity-30"
                style={{ background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.5) 50%, transparent 100%)', animation: 'shimmer 2s infinite' }} />
            </div>
          </div>
          {gap > 0 && (
            <div className="text-[10px] mt-1 text-right" style={{ color: 'var(--text3)' }}>
              Gap: {fmt(gap)} remaining
            </div>
          )}
        </div>
      </div>

      {/* Celebration banner */}
      {showCelebration && pct >= 75 && !isAchieved && (
        <div className="wl-card p-4 flex items-center gap-4 relative overflow-hidden animate-fade-up"
          style={{ background: 'linear-gradient(135deg, #ECFDF5 0%, #D1FAE5 100%)', border: '1.5px solid #10B98140' }}>
          <div className="text-3xl animate-bounce">🎉</div>
          <div className="flex-1">
            <div className="text-[14px] font-bold" style={{ color: '#065F46' }}>
              You're {pct.toFixed(0)}% of the way there — keep going!
            </div>
            <div className="text-[11px] mt-0.5" style={{ color: '#047857' }}>
              {pct >= 90
                ? `Just ${fmt(gap)} left. You're almost there — finish strong!`
                : `At this rate, you're on track to hit your goal. Keep your SIP of ${fmt(monthlySIPNeeded)}/month going.`}
            </div>
          </div>
          <button onClick={() => setShowCelebration(false)} className="text-[18px] opacity-40 hover:opacity-80 flex-shrink-0">×</button>
        </div>
      )}
      {isAchieved && showCelebration && (
        <div className="wl-card p-5 text-center relative overflow-hidden animate-fade-up"
          style={{ background: 'linear-gradient(135deg, #FFFBEB 0%, #FEF3C7 100%)', border: '1.5px solid #D97706' }}>
          <div className="text-4xl mb-2">🏆</div>
          <div className="text-[18px] font-black mb-1" style={{ color: '#92400E' }}>Goal Achieved!</div>
          <div className="text-[12px]" style={{ color: '#B45309' }}>
            Congratulations! You reached {fmt(targetInView)}. Time to set your next goal!
          </div>
          <div className="flex justify-center gap-3 mt-4">
            <Link href="/dashboard/goals" className="px-4 py-2 rounded-xl text-white text-[12px] font-bold" style={{ background: '#D97706' }}>
              Set Next Goal
            </Link>
            <button onClick={() => setShowCelebration(false)} className="px-4 py-2 rounded-xl text-[12px] font-semibold" style={{ background: 'var(--bg2)', color: 'var(--text3)' }}>
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl wl-tabs" style={{ background: 'var(--bg2)' }}>
        {TABS.map(t => {
          const Icon = t.icon
          return (
            <button key={t.key} onClick={() => setTab(t.key)}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[11px] font-semibold transition-all"
              style={tab === t.key ? { background: '#fff', color: 'var(--text)', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' } : { color: 'var(--text3)' }}>
              <Icon size={12} />{t.label}
            </button>
          )
        })}
      </div>

      {/* Overview Tab */}
      {tab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2 space-y-4">
            {/* Key metrics */}
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'Monthly SIP Needed', value: fmt(monthlySIPNeeded), accent: 'blue' },
                { label: 'Months Remaining', value: String(Math.max(0, monthsLeft)), accent: monthsLeft < 6 ? 'rose' : 'gold' },
                { label: 'Target Return Rate', value: `${sipRate}% p.a.`, accent: 'sage' },
              ].map(c => (
                <div key={c.label} className="wl-card p-3 relative overflow-hidden">
                  <div className="absolute top-0 left-0 right-0 h-[2px] rounded-t-xl" style={{ background: `var(--${c.accent})` }} />
                  <div className="text-[9px] uppercase tracking-wider font-semibold mb-2" style={{ color: 'var(--text3)' }}>{c.label}</div>
                  <div className="text-[16px] font-bold font-mono" style={{ color: 'var(--text)' }}>{c.value}</div>
                </div>
              ))}
            </div>

            {/* Milestones */}
            <div className="wl-card p-4">
              <div className="text-[11px] font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--text3)' }}>Milestones</div>
              <div className="space-y-3">
                {milestones.map(m => (
                  <div key={m.pct} className="flex items-center gap-3">
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-[11px] font-bold`}
                      style={m.achieved ? { background: 'var(--income)', color: '#fff' } : { background: 'var(--border)', color: 'var(--text3)' }}>
                      {m.achieved ? '✓' : m.pct + '%'}
                    </div>
                    <div className="flex-1">
                      <div className="flex justify-between mb-0.5">
                        <span className="text-[11px] font-medium" style={{ color: m.achieved ? 'var(--income)' : 'var(--text)' }}>{m.label}</span>
                        <span className="text-[11px] font-mono" style={{ color: 'var(--text3)' }}>{fmt(m.amount)}</span>
                      </div>
                      <div className="h-1.5 rounded-full" style={{ background: 'var(--border)' }}>
                        <div className="h-full rounded-full transition-all"
                          style={{ width: `${Math.min((currentValue / m.amount) * 100, 100)}%`, background: m.achieved ? 'var(--income)' : goal.color }} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Suggestions */}
          <div className="space-y-4">
            <div className="wl-card p-4">
              <div className="flex items-center gap-2 mb-3">
                <Lightbulb size={13} style={{ color: 'var(--gold)' }} />
                <span className="text-[11px] font-bold" style={{ color: 'var(--text)' }}>Smart Suggestions</span>
              </div>
              <div className="space-y-3">
                {suggestions.map((s, i) => (
                  <div key={i} className="flex items-start gap-2 p-2.5 rounded-lg" style={{ background: 'var(--bg2)' }}>
                    <Zap size={11} className="flex-shrink-0 mt-0.5" style={{ color: 'var(--sage)' }} />
                    <p className="text-[11px]" style={{ color: 'var(--text2)' }}>{s}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="wl-card p-4">
              <div className="text-[11px] font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--text3)' }}>Goal Stats</div>
              <div className="space-y-2">
                {[
                  { label: 'Created', value: new Date(goal.created_at).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' }) },
                  { label: 'Target Date', value: new Date(goal.target_date).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' }) },
                  { label: 'Total Duration', value: `${termMonths} months` },
                  { label: 'Linked Investments', value: String(linkedInvestments.length) },
                ].map(r => (
                  <div key={r.label} className="flex justify-between items-center">
                    <span className="text-[11px]" style={{ color: 'var(--text3)' }}>{r.label}</span>
                    <span className="text-[11px] font-semibold" style={{ color: 'var(--text)' }}>{r.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Trajectory Tab */}
      {tab === 'trajectory' && (
        <div className="space-y-4">
          <div className="wl-card p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="text-[13px] font-bold" style={{ color: 'var(--text)' }}>Goal Projection</div>
                <div className="text-[11px] mt-0.5" style={{ color: 'var(--text3)' }}>Forward-looking projection based on {sipRate}% annual return</div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px]" style={{ color: 'var(--text3)' }}>Return Rate</span>
                <select value={sipRate} onChange={e => setSipRate(Number(e.target.value))}
                  className="rounded-lg px-2 py-1 text-[11px] focus:outline-none"
                  style={{ background: 'var(--bg2)', border: '1px solid var(--border)', color: 'var(--text)' }}>
                  {[5, 7, 8, 10, 12, 15, 18].map(r => <option key={r} value={r}>{r}%</option>)}
                </select>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={trajectoryData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#9CA3AF' }} />
                <YAxis tickFormatter={v => `${sym}${(v / 100000).toFixed(0)}L`} tick={{ fontSize: 10, fill: '#9CA3AF' }} width={48} />
                <Tooltip formatter={(v: number, name: string) => [fmt(v), name]}
                  contentStyle={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 8, fontSize: 11 }} />
                <ReferenceLine y={targetInView} stroke={goal.color} strokeDasharray="4 4" label={{ value: 'Target', fill: goal.color, fontSize: 10 }} />
                <Line dataKey="required" name="Required Path" stroke="#E5E7EB" strokeWidth={2} dot={false} strokeDasharray="4 4" />
                <Line dataKey="atRate" name="At Current Rate" stroke="#D97706" strokeWidth={2} dot={false} />
                <Line dataKey="withSIP" name="With SIP" stroke={goal.color} strokeWidth={2.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
            <div className="flex items-center justify-center gap-6 mt-2">
              {[
                { color: '#E5E7EB', label: 'Required Path', dashed: true },
                { color: '#D97706', label: 'At Current Rate' },
                { color: goal.color, label: 'With SIP' },
              ].map(l => (
                <div key={l.label} className="flex items-center gap-1.5">
                  <div className="w-6 h-0.5 rounded" style={{ background: l.color, borderTop: l.dashed ? '1.5px dashed' : undefined }} />
                  <span className="text-[10px]" style={{ color: 'var(--text3)' }}>{l.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Yearly breakdown table */}
          <div className="wl-card p-5">
            <div className="text-[12px] font-semibold mb-3" style={{ color: 'var(--text)' }}>Year-by-Year Projection</div>
            <div className="overflow-x-auto">
              <table className="w-full text-[11px]">
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    {['Year', 'At Current Rate', 'With SIP', 'Target', 'Gap'].map(h => (
                      <th key={h} className="py-2 text-left font-semibold" style={{ color: 'var(--text3)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: Math.min(Math.ceil(monthsLeft / 12) + 1, 10) }, (_, i) => {
                    const m = i * 12
                    const r = sipRate / 100 / 12
                    const fvF = r > 0 ? Math.pow(1 + r, m) : 1
                    const sipFv = r > 0 ? monthlySIPNeeded * (fvF - 1) / r * (1 + r) : monthlySIPNeeded * m
                    const atR = currentValue * fvF
                    const withS = atR + sipFv
                    const gap2 = targetInView - withS
                    const yr = new Date()
                    yr.setFullYear(yr.getFullYear() + i)
                    return (
                      <tr key={i} style={{ borderBottom: '1px solid var(--border)' }} className="hover:bg-[var(--bg2)]">
                        <td className="py-2 font-semibold" style={{ color: 'var(--text)' }}>{yr.getFullYear()}</td>
                        <td className="py-2 font-mono" style={{ color: 'var(--text2)' }}>{fmt(atR)}</td>
                        <td className="py-2 font-mono font-semibold" style={{ color: goal.color }}>{fmt(withS)}</td>
                        <td className="py-2 font-mono" style={{ color: 'var(--text3)' }}>{fmt(targetInView)}</td>
                        <td className="py-2 font-mono" style={{ color: gap2 <= 0 ? 'var(--income)' : 'var(--rose)' }}>
                          {gap2 <= 0 ? '✓ Achieved' : `-${fmt(gap2)}`}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Calculator Tab */}
      {tab === 'calculator' && (
        <div className="space-y-4">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="wl-card p-5">
            <div className="flex items-center gap-2 mb-4">
              <Calculator size={14} style={{ color: 'var(--blue)' }} />
              <span className="text-[13px] font-bold" style={{ color: 'var(--text)' }}>SIP Calculator</span>
            </div>

            <div className="space-y-4">
              <div className="p-3 rounded-xl" style={{ background: 'var(--bg2)' }}>
                <div className="flex justify-between text-[11px] mb-0.5">
                  <span style={{ color: 'var(--text3)' }}>Current Value</span>
                  <span className="font-bold font-mono" style={{ color: 'var(--text)' }}>{fmt(currentValue)}</span>
                </div>
                <div className="flex justify-between text-[11px] mb-0.5">
                  <span style={{ color: 'var(--text3)' }}>Target Amount</span>
                  <span className="font-bold font-mono" style={{ color: 'var(--text)' }}>{fmt(targetInView)}</span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span style={{ color: 'var(--text3)' }}>Gap</span>
                  <span className="font-bold font-mono" style={{ color: 'var(--rose)' }}>{fmt(gap)}</span>
                </div>
              </div>

              <div>
                <label className="block text-[10px] uppercase tracking-wider mb-2 font-semibold" style={{ color: 'var(--text3)' }}>Expected Annual Return: {sipRate}%</label>
                <input type="range" min={3} max={25} step={0.5} value={sipRate}
                  onChange={e => setSipRate(Number(e.target.value))}
                  className="w-full accent-[var(--sage)] cursor-pointer" />
                <div className="flex justify-between text-[9px] mt-0.5" style={{ color: 'var(--text3)' }}>
                  <span>3% (FD)</span><span>10% (MF)</span><span>15% (Equity)</span><span>25%</span>
                </div>
              </div>

              <div className="p-4 rounded-xl" style={{ background: `${goal.color}10`, border: `1.5px solid ${goal.color}30` }}>
                <div className="text-[10px] uppercase tracking-wider font-semibold mb-1" style={{ color: 'var(--text3)' }}>Monthly SIP Needed</div>
                <div className="text-[28px] font-bold font-mono" style={{ color: goal.color }}>
                  {monthlySIPNeeded <= 0 ? '✓ On Track!' : fmtC(monthlySIPNeeded)}
                </div>
                {monthlySIPNeeded > 0 && (
                  <div className="text-[10px] mt-1" style={{ color: 'var(--text3)' }}>per month for {monthsLeft} months at {sipRate}% p.a.</div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3 text-center">
                <div className="p-3 rounded-xl" style={{ background: 'var(--bg2)' }}>
                  <div className="text-[9px] uppercase tracking-wider font-semibold mb-1" style={{ color: 'var(--text3)' }}>Lump Sum Needed</div>
                  <div className="text-[14px] font-bold font-mono" style={{ color: 'var(--text)' }}>
                    {(() => {
                      const r = sipRate / 100 / 12
                      const n = monthsLeft
                      if (n <= 0 || gap <= 0) return '—'
                      const fv = r > 0 ? Math.pow(1 + r, n) : 1
                      return fmt(gap / fv)
                    })()}
                  </div>
                  <div className="text-[9px] mt-0.5" style={{ color: 'var(--text3)' }}>one-time today</div>
                </div>
                <div className="p-3 rounded-xl" style={{ background: 'var(--bg2)' }}>
                  <div className="text-[9px] uppercase tracking-wider font-semibold mb-1" style={{ color: 'var(--text3)' }}>Annual Investment</div>
                  <div className="text-[14px] font-bold font-mono" style={{ color: 'var(--text)' }}>
                    {fmt(monthlySIPNeeded * 12)}
                  </div>
                  <div className="text-[9px] mt-0.5" style={{ color: 'var(--text3)' }}>per year</div>
                </div>
              </div>
            </div>
          </div>

          {/* What-if simulator */}
          <div className="wl-card p-5">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp size={14} style={{ color: 'var(--gold)' }} />
              <span className="text-[13px] font-bold" style={{ color: 'var(--text)' }}>What-If Simulator</span>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-[10px] uppercase tracking-wider mb-2 font-semibold" style={{ color: 'var(--text3)' }}>If I invest this much monthly:</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[12px] font-semibold" style={{ color: 'var(--text3)' }}>{sym}</span>
                  <input type="number" value={simSIP || ''} onChange={e => setSimSIP(Number(e.target.value))} placeholder="Enter monthly amount"
                    className="w-full rounded-lg pl-7 pr-3 py-2.5 text-[13px] focus:outline-none font-mono"
                    style={{ background: 'var(--bg2)', border: '1px solid var(--border)', color: 'var(--text)' }}
                    onFocus={e => (e.target.style.borderColor = goal.color)}
                    onBlur={e => (e.target.style.borderColor = 'var(--border)')}
                  />
                </div>
              </div>

              {simSIP > 0 && (
                <div className="space-y-3">
                  <div className="p-4 rounded-xl" style={{ background: simMonths && simMonths <= monthsLeft ? 'var(--income-bg)' : 'var(--gold-bg)', border: `1px solid ${simMonths && simMonths <= monthsLeft ? 'var(--income)' : 'var(--gold)'}` }}>
                    {simMonths ? (
                      <>
                        <div className="text-[10px] uppercase tracking-wider font-semibold mb-1" style={{ color: 'var(--text3)' }}>Goal Achieved In</div>
                        <div className="text-[22px] font-bold font-mono" style={{ color: simMonths <= monthsLeft ? 'var(--income)' : 'var(--gold)' }}>
                          {simMonths} months
                        </div>
                        <div className="text-[10px] mt-1" style={{ color: 'var(--text3)' }}>
                          {simMonths <= monthsLeft
                            ? `✓ ${monthsLeft - simMonths} months ahead of target!`
                            : `${simMonths - monthsLeft} months after target date`}
                        </div>
                      </>
                    ) : (
                      <div className="text-[12px]" style={{ color: 'var(--text3)' }}>Amount too low to reach goal in 50 years</div>
                    )}
                  </div>

                  {/* Quick presets */}
                  <div>
                    <div className="text-[10px] uppercase tracking-wider font-semibold mb-2" style={{ color: 'var(--text3)' }}>Quick presets</div>
                    <div className="flex gap-2 flex-wrap">
                      {[Math.ceil(monthlySIPNeeded * 0.5), Math.ceil(monthlySIPNeeded), Math.ceil(monthlySIPNeeded * 1.5), Math.ceil(monthlySIPNeeded * 2)].filter(v => v > 0).map(v => (
                        <button key={v} onClick={() => setSimSIP(v)}
                          className="px-3 py-1.5 rounded-lg text-[10px] font-semibold border transition-all"
                          style={simSIP === v ? { background: goal.color, color: '#fff', borderColor: goal.color } : { borderColor: 'var(--border)', color: 'var(--text3)' }}>
                          {fmtC(v)}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {simSIP <= 0 && (
                <div className="text-center py-8" style={{ color: 'var(--text3)' }}>
                  <Calculator size={28} className="mx-auto mb-2 opacity-40" />
                  <p className="text-[11px]">Enter a monthly investment amount to see when you&apos;ll reach your goal</p>
                  <button onClick={() => setSimSIP(Math.ceil(monthlySIPNeeded))}
                    className="mt-3 px-3 py-1.5 rounded-lg text-[11px] font-semibold"
                    style={{ background: 'var(--sage-bg)', color: 'var(--sage)' }}>
                    Use recommended ({fmtC(monthlySIPNeeded)}/mo)
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>{/* closes inner grid */}

        {/* Adjust Timeline */}
        <div className="wl-card p-5 lg:col-span-2">
          <div className="flex items-center gap-2 mb-4">
            <CalendarDays size={14} style={{ color: goal.color }} />
            <span className="text-[13px] font-bold" style={{ color: 'var(--text)' }}>Adjust Goal Timeline</span>
            <span className="ml-auto text-[10px] px-2 py-0.5 rounded-full font-semibold"
              style={{ background: adjustMonths < 0 ? 'var(--income-bg)' : adjustMonths > 0 ? 'var(--gold-bg)' : 'var(--bg2)',
                       color: adjustMonths < 0 ? 'var(--income)' : adjustMonths > 0 ? 'var(--gold)' : 'var(--text3)' }}>
              {adjustMonths === 0 ? 'Current target' : adjustMonths < 0 ? `${Math.abs(adjustMonths)} months earlier` : `${adjustMonths} months later`}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
            <div className="p-3 rounded-xl text-center" style={{ background: 'var(--bg2)' }}>
              <div className="text-[10px] uppercase tracking-wider font-semibold mb-1" style={{ color: 'var(--text3)' }}>Current Target</div>
              <div className="text-[13px] font-bold" style={{ color: 'var(--text)' }}>
                {new Date(goal.target_date).toLocaleDateString('en', { month: 'short', year: 'numeric' })}
              </div>
              <div className="text-[10px]" style={{ color: 'var(--text3)' }}>{monthsLeft} months left</div>
            </div>
            <div className="p-3 rounded-xl text-center border-2" style={{ background: `${goal.color}08`, borderColor: `${goal.color}40` }}>
              <div className="text-[10px] uppercase tracking-wider font-semibold mb-1" style={{ color: 'var(--text3)' }}>Adjusted Target</div>
              <div className="text-[13px] font-bold" style={{ color: goal.color }}>
                {adjustedTargetDate.toLocaleDateString('en', { month: 'short', year: 'numeric' })}
              </div>
              <div className="text-[10px]" style={{ color: 'var(--text3)' }}>{adjustedMonthsLeft} months left</div>
            </div>
            <div className="p-3 rounded-xl text-center" style={{
              background: adjustedSIP < monthlySIPNeeded ? 'var(--income-bg)' : 'var(--rose-bg)',
            }}>
              <div className="text-[10px] uppercase tracking-wider font-semibold mb-1" style={{ color: 'var(--text3)' }}>New SIP Needed</div>
              <div className="text-[16px] font-bold font-mono" style={{
                color: adjustedSIP < monthlySIPNeeded ? 'var(--income)' : 'var(--rose)',
              }}>
                {adjustedSIP <= 0 ? '✓ On Track' : fmtC(adjustedSIP)}
              </div>
              {monthlySIPNeeded > 0 && adjustedSIP > 0 && (
                <div className="text-[10px]" style={{ color: adjustedSIP < monthlySIPNeeded ? 'var(--income)' : 'var(--rose)' }}>
                  {adjustedSIP < monthlySIPNeeded
                    ? `▼ ${fmtC(monthlySIPNeeded - adjustedSIP)} less/mo`
                    : `▲ ${fmtC(adjustedSIP - monthlySIPNeeded)} more/mo`}
                </div>
              )}
            </div>
          </div>

          <div className="mb-4">
            <div className="flex items-center justify-between mb-2 text-[11px]">
              <span className="flex items-center gap-1" style={{ color: 'var(--income)' }}>
                <FastForward size={11} /> Earlier
              </span>
              <span className="font-semibold" style={{ color: 'var(--text)' }}>
                {adjustMonths === 0 ? 'No change' : `${adjustMonths > 0 ? '+' : ''}${adjustMonths} months`}
              </span>
              <span style={{ color: 'var(--text3)' }}>Later →</span>
            </div>
            <input type="range" min={-24} max={24} step={1} value={adjustMonths}
              onChange={e => setAdjustMonths(Number(e.target.value))}
              className="w-full cursor-pointer" style={{ accentColor: goal.color }} />
            <div className="flex justify-between text-[9px] mt-1" style={{ color: 'var(--text3)' }}>
              <span>−24 months</span>
              <span>No change</span>
              <span>+24 months</span>
            </div>
          </div>

          <div className="flex gap-3">
            <div className="flex gap-2 flex-wrap">
              {[[-6, 'Meet 6mo early'], [-12, 'Meet 1yr early'], [6, 'Push 6mo later'], [12, 'Push 1yr later']].map(([m, label]) => (
                <button key={m} onClick={() => setAdjustMonths(m as number)}
                  className="px-3 py-1.5 rounded-lg text-[10px] font-semibold border transition-all"
                  style={adjustMonths === m
                    ? { background: goal.color, color: '#fff', borderColor: goal.color }
                    : { borderColor: 'var(--border)', color: 'var(--text3)' }}>
                  {label as string}
                </button>
              ))}
            </div>
            {adjustMonths !== 0 && (
              <button onClick={saveAdjustedDate} disabled={savingDate}
                className="ml-auto px-4 py-2 rounded-xl text-white text-[12px] font-bold flex items-center gap-1.5 disabled:opacity-50 flex-shrink-0"
                style={{ background: goal.color }}>
                {savingDate ? '…' : <><Rocket size={12} /> Apply Change</>}
              </button>
            )}
          </div>
        </div>
        </div>
      )}

      {/* Investments Tab */}
      {tab === 'investments' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-[12px]" style={{ color: 'var(--text3)' }}>{linkedInvestments.length} investments linked to this goal</p>
            <button onClick={() => setShowLink(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-white text-[12px] font-bold"
              style={{ background: 'var(--sage)' }}>
              <Link2 size={13} /> Manage Links
            </button>
          </div>

          {linkedInvestments.length === 0 ? (
            <div className="wl-card p-10 text-center">
              <Link2 size={28} className="mx-auto mb-3 opacity-30" />
              <p className="text-[14px] font-semibold mb-1" style={{ color: 'var(--text)' }}>No investments linked</p>
              <p className="text-[12px] mb-4" style={{ color: 'var(--text3)' }}>Link your existing investments to track real progress toward this goal</p>
              <button onClick={() => setShowLink(true)}
                className="px-4 py-2 rounded-lg text-white text-[12px] font-bold"
                style={{ background: 'var(--sage)' }}>Link Investments</button>
            </div>
          ) : (
            <div className="space-y-2">
              {linkedInvestments.map(({ gi, record }) => {
                const val = conv(getInvCurrentValue(gi.investment_type, record), record.currency ?? 'INR')
                const name = getInvName(gi.investment_type, record)
                const typeLabel = TYPE_LABELS[gi.investment_type] ?? gi.investment_type
                const contribPct = currentValue > 0 ? (val / currentValue) * 100 : 0
                return (
                  <div key={gi.id} className="wl-card p-4">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-9 h-9 rounded-xl flex items-center justify-center text-[10px] font-bold flex-shrink-0 text-white"
                        style={{ background: 'var(--sage)' }}>{typeLabel.slice(0, 2)}</div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[12px] font-semibold truncate" style={{ color: 'var(--text)' }}>{name}</div>
                        <div className="text-[10px]" style={{ color: 'var(--text3)' }}>{typeLabel} · {contribPct.toFixed(1)}% contribution</div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className="text-[13px] font-bold font-mono" style={{ color: 'var(--text)' }}>{fmt(val)}</div>
                        <div className="text-[10px]" style={{ color: 'var(--sage)' }}>{gi.allocation_pct ?? 100}% allocated</div>
                      </div>
                    </div>
                    <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
                      <div className="h-full rounded-full" style={{ width: `${Math.min(contribPct, 100)}%`, background: goal.color }} />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {showEdit && <AddGoalModal onClose={() => setShowEdit(false)} editData={goal} />}
      {showLink && (
        <LinkInvestmentModal
          goalId={goal.id}
          goal={goal}
          allInvestments={allInvestments}
          linked={linkedGIs}
          onClose={() => setShowLink(false)}
        />
      )}
    </div>
  )
}
