'use client'
import { useMemo, useState } from 'react'
import { useViewStore } from '@/store/viewStore'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import AddGoalModal from '@/components/forms/AddGoalModal'
import {
  Target, Plus, TrendingUp, CheckCircle2, Clock, AlertTriangle,
  Trophy, Star, Zap, ChevronRight, Pause, Trash2, BookOpen,
} from 'lucide-react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'


const CAT_ICONS: Record<string, string> = {
  equity: '📈', mutual_fund: '💹', fixed_income: '🏦', gold: '🥇',
  real_estate: '🏠', retirement: '🛡️', emergency: '🚨', general: '🎯',
}
const CAT_LABELS: Record<string, string> = {
  equity: 'Equity', mutual_fund: 'Mutual Funds', fixed_income: 'Fixed Income',
  gold: 'Gold', real_estate: 'Real Estate', retirement: 'Retirement',
  emergency: 'Emergency', general: 'General',
}

type Term = 'short' | 'mid' | 'long'

function getTerm(targetDate: string): Term {
  const months = Math.ceil((new Date(targetDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24 * 30))
  if (months <= 12) return 'short'
  if (months <= 36) return 'mid'
  return 'long'
}
function getDaysLeft(targetDate: string): number {
  return Math.ceil((new Date(targetDate).getTime() - Date.now()) / 86400000)
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

type AllInvestments = Record<string, any[]>

interface Props {
  goals: any[]
  goalInvestments: { goal_id: string; investment_type: string; investment_id: string }[]
  allInvestments: AllInvestments
}

const LEVELS = [
  { name: 'Seed',    emoji: '🌱', min: 0,   max: 49,  color: '#6B7280' },
  { name: 'Sprout',  emoji: '🌿', min: 50,  max: 149, color: '#059669' },
  { name: 'Sapling', emoji: '🌳', min: 150, max: 299, color: '#16A34A' },
  { name: 'Tree',    emoji: '💪', min: 300, max: 499, color: '#2563EB' },
  { name: 'Forest',  emoji: '🏆', min: 500, max: 9999, color: '#7C3AED' },
]

const BADGES = [
  { id: 'first_goal',    label: 'First Goal',      emoji: '🎯', cond: (g: any[], _: any) => g.length >= 1 },
  { id: 'planner',       label: 'Long Planner',    emoji: '📅', cond: (g: any[], _: any) => g.some((x: any) => getTerm(x.target_date) === 'long') },
  { id: 'achiever',      label: 'Achiever',        emoji: '✅', cond: (g: any[], e: any) => e.some((x: any) => x.pct >= 100) },
  { id: 'on_fire',       label: 'On Track x3',     emoji: '🔥', cond: (_: any[], e: any) => e.filter((x: any) => x.pct >= 50).length >= 3 },
  { id: 'diversified',   label: 'Diversified',     emoji: '🌈', cond: (g: any[], _: any) => new Set(g.map((x: any) => x.category)).size >= 3 },
  { id: 'five_goals',    label: 'Goal Setter',     emoji: '⭐', cond: (g: any[], _: any) => g.length >= 5 },
]

export default function GoalsClient({ goals, goalInvestments, allInvestments }: Props) {
  const { view, fxRate: FX } = useViewStore()
  const router = useRouter()
  const supabase = createClient()
  const [showAdd, setShowAdd] = useState(false)
  const [tab, setTab] = useState<'all' | Term>('all')
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  const toINR = (v: number, cur: string) => cur === 'AED' ? v * FX : v
  const conv = (v: number, cur: string) => view === 'consolidated' ? toINR(v, cur) : v
  const sym = view === 'uae' ? 'AED' : '₹'
  const fmt = (v: number) => `${sym}${Math.abs(v).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`

  // Filter goals by view
  const filteredGoals = useMemo(() =>
    goals.filter(g => view === 'uae' ? g.currency === 'AED' : view === 'india' ? g.currency === 'INR' : true)
  , [goals, view])

  // Enrich goals with current value from linked investments
  const enriched = useMemo(() => filteredGoals.map(goal => {
    const linked = goalInvestments.filter(gi => gi.goal_id === goal.id)
    let currentValue = 0
    linked.forEach(gi => {
      const records = allInvestments[gi.investment_type] ?? []
      const rec = records.find((r: any) => r.id === gi.investment_id)
      if (rec) {
        const raw = getInvCurrentValue(gi.investment_type, rec)
        currentValue += conv(raw, rec.currency ?? 'INR')
      }
    })
    const targetInView = conv(Number(goal.target_amount), goal.currency)
    const pct = targetInView > 0 ? Math.min((currentValue / targetInView) * 100, 100) : 0
    const term = getTerm(goal.target_date)
    const daysLeft = getDaysLeft(goal.target_date)
    const linked_count = linked.length
    return { ...goal, currentValue, targetInView, pct, term, daysLeft, linked_count }
  }), [filteredGoals, goalInvestments, allInvestments, view])

  // Gamification points
  const { pts, level, earnedBadges } = useMemo(() => {
    let p = 0
    goals.forEach(() => { p += 20 })
    enriched.forEach(g => {
      if (g.pct >= 25) p += 25
      if (g.pct >= 50) p += 25
      if (g.pct >= 75) p += 25
      if (g.pct >= 100 || g.status === 'achieved') p += 100
    })
    if (goals.length >= 3) p += 30
    const lvl = LEVELS.slice().reverse().find(l => p >= l.min) ?? LEVELS[0]
    const nextLvl = LEVELS[LEVELS.indexOf(lvl) + 1]
    const pctToNext = nextLvl ? Math.min(((p - lvl.min) / (nextLvl.min - lvl.min)) * 100, 100) : 100
    const earned = BADGES.filter(b => b.cond(goals, enriched))
    return { pts: p, level: { ...lvl, pctToNext, nextLvl }, earnedBadges: earned }
  }, [goals, enriched])

  // Stats
  const totalTarget = enriched.reduce((s, g) => s + g.targetInView, 0)
  const totalCurrent = enriched.reduce((s, g) => s + g.currentValue, 0)
  const achieved = enriched.filter(g => g.pct >= 100 || g.status === 'achieved').length
  const onTrack = enriched.filter(g => g.pct >= 50 && g.daysLeft > 0).length
  const behind = enriched.filter(g => g.pct < 50 && g.daysLeft < 365).length

  // Pie data for category distribution
  const catData = useMemo(() => {
    const map: Record<string, number> = {}
    enriched.forEach(g => { map[g.category] = (map[g.category] ?? 0) + g.targetInView })
    return Object.entries(map).map(([cat, val]) => ({ name: CAT_LABELS[cat] ?? cat, value: val, icon: CAT_ICONS[cat] ?? '🎯' }))
  }, [enriched])

  const PIE_COLORS = ['#16A34A','#2563EB','#D97706','#7C3AED','#E11D48','#0891B2','#DB2777','#059669']

  const displayed = tab === 'all' ? enriched : enriched.filter(g => g.term === tab)

  async function deleteGoal(id: string) {
    await supabase.from('goal_investments').delete().eq('goal_id', id)
    await supabase.from('goals').delete().eq('id', id)
    router.refresh()
    setConfirmDelete(null)
  }
  async function pauseGoal(id: string, current: string) {
    const newStatus = current === 'paused' ? 'active' : 'paused'
    await supabase.from('goals').update({ status: newStatus }).eq('id', id)
    router.refresh()
  }

  const TERM_LABELS = { short: 'Short Term', mid: 'Mid Term', long: 'Long Term' }
  const TERM_COLORS = { short: 'var(--gold)', mid: 'var(--blue)', long: 'var(--sage)' }
  const TERM_BG = { short: 'var(--gold-bg)', mid: 'var(--blue-bg)', long: 'var(--sage-bg)' }

  return (
    <div className="p-6 space-y-5 animate-fade-up">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[20px] font-bold" style={{ color: 'var(--text)' }}>Goals</h1>
          <p className="text-[12px] mt-0.5" style={{ color: 'var(--text3)' }}>Track your financial milestones and build wealth systematically</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/dashboard/goals/learn"
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-[12px] font-bold"
            style={{ background: 'var(--bg2)', color: 'var(--text2)' }}>
            <BookOpen size={13} /> Learn
          </Link>
          <button onClick={() => setShowAdd(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-white text-[12px] font-bold"
            style={{ background: 'var(--sage)' }}>
            <Plus size={14} /> New Goal
          </button>
        </div>
      </div>

      {/* Gamification Banner */}
      <div className="wl-card p-4 relative overflow-hidden" style={{ background: `linear-gradient(135deg, ${level.color}10 0%, ${level.color}05 100%)`, border: `1.5px solid ${level.color}30` }}>
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl flex-shrink-0"
            style={{ background: `${level.color}20`, border: `2px solid ${level.color}40` }}>
            {level.emoji}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[14px] font-bold" style={{ color: level.color }}>{level.name}</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold" style={{ background: `${level.color}20`, color: level.color }}>{pts} pts</span>
            </div>
            <div className="text-[11px] mb-2" style={{ color: 'var(--text3)' }}>
              {level.nextLvl ? `${level.nextLvl.min - pts} points to ${level.nextLvl.name} ${level.nextLvl.emoji}` : 'Maximum level achieved!'}
            </div>
            <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
              <div className="h-full rounded-full transition-all duration-700"
                style={{ width: `${level.pctToNext}%`, background: level.color }} />
            </div>
          </div>
          <div className="flex gap-1.5 flex-wrap justify-end max-w-[140px]">
            {earnedBadges.map(b => (
              <span key={b.id} title={b.label}
                className="text-lg cursor-help transition-transform hover:scale-125">{b.emoji}</span>
            ))}
          </div>
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Total Goals', value: String(enriched.length), icon: <Target size={14} />, accent: 'blue' },
          { label: 'Achieved', value: String(achieved), icon: <Trophy size={14} />, accent: 'sage' },
          { label: 'On Track', value: String(onTrack), icon: <TrendingUp size={14} />, accent: 'income' },
          { label: 'Behind Schedule', value: String(behind), icon: <AlertTriangle size={14} />, accent: behind > 0 ? 'rose' : 'sage' },
        ].map(c => (
          <div key={c.label} className="wl-card p-4 relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-[3px] rounded-t-xl" style={{ background: `var(--${c.accent})` }} />
            <div className="flex items-start justify-between mb-2">
              <div className="text-[10px] uppercase tracking-[0.1em] font-semibold" style={{ color: 'var(--text3)' }}>{c.label}</div>
              <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: `var(--${c.accent}-bg)`, color: `var(--${c.accent})` }}>{c.icon}</div>
            </div>
            <div className="text-[26px] font-bold font-mono" style={{ color: 'var(--text)' }}>{c.value}</div>
          </div>
        ))}
      </div>

      {/* Main content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Goals list */}
        <div className="lg:col-span-2 space-y-4">
          {/* Tabs */}
          <div className="flex gap-1 p-1 rounded-xl wl-tabs" style={{ background: 'var(--bg2)' }}>
            {(['all', 'short', 'mid', 'long'] as const).map(t => (
              <button key={t} onClick={() => setTab(t)}
                className="flex-1 py-1.5 rounded-lg text-[11px] font-semibold transition-all"
                style={tab === t ? { background: '#fff', color: 'var(--text)', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' } : { color: 'var(--text3)' }}>
                {t === 'all' ? 'All' : TERM_LABELS[t]}
                <span className="ml-1 text-[10px]">({t === 'all' ? enriched.length : enriched.filter(g => g.term === t).length})</span>
              </button>
            ))}
          </div>

          {displayed.length === 0 ? (
            <div className="wl-card p-10 text-center">
              <div className="text-4xl mb-3">🎯</div>
              <p className="text-[14px] font-semibold mb-1" style={{ color: 'var(--text)' }}>No goals yet</p>
              <p className="text-[12px] mb-4" style={{ color: 'var(--text3)' }}>Set your first financial goal and start tracking your progress</p>
              <button onClick={() => setShowAdd(true)}
                className="px-4 py-2 rounded-lg text-white text-[12px] font-bold"
                style={{ background: 'var(--sage)' }}>Create First Goal</button>
            </div>
          ) : (
            <div className="space-y-3">
              {displayed.map(goal => {
                const isAchieved = goal.pct >= 100 || goal.status === 'achieved'
                const isPaused = goal.status === 'paused'
                const daysStr = goal.daysLeft < 0 ? 'Overdue' : goal.daysLeft === 0 ? 'Today' : `${goal.daysLeft}d left`

                return (
                  <div key={goal.id}>
                    {/* Confirm delete overlay */}
                    {confirmDelete === goal.id && (
                      <div className="wl-card p-4 mb-1 flex items-center justify-between gap-3"
                        style={{ border: '1.5px solid var(--rose)', background: 'var(--rose-bg)' }}>
                        <span className="text-[12px] font-medium" style={{ color: 'var(--rose)' }}>
                          Delete &ldquo;{goal.name}&rdquo;? This cannot be undone.
                        </span>
                        <div className="flex gap-2 flex-shrink-0">
                          <button onClick={() => setConfirmDelete(null)}
                            className="px-3 py-1.5 rounded-lg text-[11px] font-semibold border"
                            style={{ borderColor: 'var(--border)', color: 'var(--text3)' }}>Cancel</button>
                          <button onClick={() => deleteGoal(goal.id)}
                            className="px-3 py-1.5 rounded-lg text-[11px] font-semibold text-white"
                            style={{ background: 'var(--rose)' }}>Delete</button>
                        </div>
                      </div>
                    )}

                    <div className="wl-card p-4 relative overflow-hidden"
                      style={isAchieved ? { border: '1.5px solid var(--income)', background: 'var(--income-bg)' } : undefined}>
                      {/* Term badge + action buttons */}
                      <div className="absolute top-3 right-3 flex gap-1.5 items-center">
                        <span className="text-[9px] px-2 py-0.5 rounded-full font-semibold"
                          style={{ background: TERM_BG[goal.term as Term], color: TERM_COLORS[goal.term as Term] }}>
                          {TERM_LABELS[goal.term as Term]}
                        </span>
                        <button onClick={e => { e.preventDefault(); pauseGoal(goal.id, goal.status) }}
                          title={isPaused ? 'Resume' : 'Pause'}
                          className="p-1 rounded-lg transition-colors hover:bg-[var(--bg2)]"
                          style={{ color: isPaused ? 'var(--sage)' : 'var(--text3)' }}>
                          <Pause size={12} />
                        </button>
                        <button onClick={e => { e.preventDefault(); setConfirmDelete(goal.id) }}
                          title="Delete goal"
                          className="p-1 rounded-lg transition-colors hover:bg-[var(--rose-bg)]"
                          style={{ color: 'var(--text3)' }}
                          onMouseEnter={e => (e.currentTarget.style.color = 'var(--rose)')}
                          onMouseLeave={e => (e.currentTarget.style.color = 'var(--text3)')}>
                          <Trash2 size={12} />
                        </button>
                      </div>

                      <Link href={`/dashboard/goals/${goal.id}`} className="block">
                        <div className="flex items-start gap-3 mb-3 pr-28">
                          <div className="w-10 h-10 rounded-xl flex items-center justify-center text-lg flex-shrink-0"
                            style={{ background: `${goal.color}20`, border: `1.5px solid ${goal.color}40` }}>
                            {goal.icon}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-[13px] font-bold truncate" style={{ color: 'var(--text)' }}>{goal.name}</div>
                            <div className="text-[11px] mt-0.5" style={{ color: 'var(--text3)' }}>
                              {CAT_LABELS[goal.category]} · {goal.linked_count} investment{goal.linked_count !== 1 ? 's' : ''} linked
                            </div>
                          </div>
                        </div>

                        {/* Progress bar */}
                        <div className="mb-2">
                          <div className="flex justify-between text-[10px] mb-1">
                            <span style={{ color: 'var(--text3)' }}>{fmt(goal.currentValue)}</span>
                            <span className="font-semibold" style={{ color: goal.color }}>{goal.pct.toFixed(1)}%</span>
                            <span style={{ color: 'var(--text3)' }}>{fmt(goal.targetInView)}</span>
                          </div>
                          <div className="h-2.5 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
                            <div className="h-full rounded-full transition-all duration-700"
                              style={{ width: `${goal.pct}%`, background: isAchieved ? 'var(--income)' : goal.color }} />
                          </div>
                        </div>

                        <div className="flex items-center justify-between mt-2">
                          <div className="flex items-center gap-1.5">
                            {isAchieved ? (
                              <span className="flex items-center gap-1 text-[10px] font-semibold" style={{ color: 'var(--income)' }}>
                                <CheckCircle2 size={12} /> Achieved!
                              </span>
                            ) : isPaused ? (
                              <span className="text-[10px] font-semibold" style={{ color: 'var(--text3)' }}>⏸ Paused</span>
                            ) : (
                              <span className="flex items-center gap-1 text-[10px]" style={{ color: goal.daysLeft < 90 ? 'var(--rose)' : 'var(--text3)' }}>
                                <Clock size={10} /> {daysStr}
                              </span>
                            )}
                          </div>
                          <span className="flex items-center gap-0.5 text-[10px] font-semibold" style={{ color: 'var(--text3)' }}>
                            View Details <ChevronRight size={10} />
                          </span>
                        </div>
                      </Link>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Right panel */}
        <div className="space-y-4">
          {/* Portfolio composition */}
          {catData.length > 0 && (
            <div className="wl-card p-4">
              <div className="text-[11px] font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--text3)' }}>Goal Composition</div>
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie data={catData} cx="50%" cy="50%" innerRadius={40} outerRadius={70} dataKey="value" paddingAngle={2}>
                    {catData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v: number) => fmt(v)} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-1.5 mt-2">
                {catData.map((d, i) => (
                  <div key={d.name} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                      <span className="text-[11px]" style={{ color: 'var(--text2)' }}>{d.icon} {d.name}</span>
                    </div>
                    <span className="text-[11px] font-mono font-semibold" style={{ color: 'var(--text)' }}>{fmt(d.value)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Overall progress */}
          <div className="wl-card p-4">
            <div className="text-[11px] font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--text3)' }}>Overall Progress</div>
            <div className="text-center py-3">
              <div className="relative inline-flex items-center justify-center w-24 h-24">
                <svg viewBox="0 0 100 100" className="w-24 h-24 -rotate-90">
                  <circle cx="50" cy="50" r="40" fill="none" stroke="var(--border)" strokeWidth="10" />
                  <circle cx="50" cy="50" r="40" fill="none" stroke="var(--sage)" strokeWidth="10"
                    strokeDasharray={`${totalTarget > 0 ? (totalCurrent / totalTarget) * 251.2 : 0} 251.2`}
                    strokeLinecap="round" />
                </svg>
                <div className="absolute text-center">
                  <div className="text-[16px] font-bold" style={{ color: 'var(--text)' }}>
                    {totalTarget > 0 ? ((totalCurrent / totalTarget) * 100).toFixed(0) : 0}%
                  </div>
                </div>
              </div>
              <div className="mt-2 text-[11px]" style={{ color: 'var(--text3)' }}>
                {fmt(totalCurrent)} of {fmt(totalTarget)}
              </div>
            </div>
          </div>

          {/* Quick tips */}
          <div className="wl-card p-4" style={{ background: 'var(--sage-bg)', border: '1px solid var(--income)' }}>
            <div className="flex items-center gap-2 mb-2">
              <Zap size={13} style={{ color: 'var(--sage)' }} />
              <span className="text-[11px] font-bold" style={{ color: 'var(--sage)' }}>Quick Tips</span>
            </div>
            <ul className="space-y-1.5">
              {[
                'Link your investments to see real progress',
                'Short-term goals need higher liquidity',
                'Long-term goals can take more equity risk',
                'Review goals quarterly for best results',
              ].map((tip, i) => (
                <li key={i} className="flex items-start gap-1.5 text-[10px]" style={{ color: 'var(--text2)' }}>
                  <Star size={9} className="mt-0.5 flex-shrink-0" style={{ color: 'var(--gold)' }} />
                  {tip}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {showAdd && <AddGoalModal onClose={() => setShowAdd(false)} allInvestments={allInvestments} />}
    </div>
  )
}
