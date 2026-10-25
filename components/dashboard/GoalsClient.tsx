'use client'
import { useEffect, useMemo, useState } from 'react'
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
import { getInvCurrentValue } from '@/lib/goalProgress'
import { GOAL_INTEREST_CATEGORY } from '@/lib/goalInterests'
import { PageHeader, Ring, Donut, Segmented, PALETTE } from '@/components/ui/kit'
import { useUiStore } from '@/store/uiStore'


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
  const [addDefaults, setAddDefaults] = useState<{ name: string; category: string } | undefined>()
  const [tab, setTab] = useState<'all' | Term>('all')
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [gtab, setGtab] = useState<'my' | 'suggested'>('my')
  const { openAdvisor } = useUiStore()

  // Home's "set up this goal" chips land here with ?new=<goal name>
  useEffect(() => {
    const name = new URLSearchParams(window.location.search).get('new')?.slice(0, 80)
    if (!name) return
    setAddDefaults({ name, category: GOAL_INTEREST_CATEGORY[name] ?? 'general' })
    setShowAdd(true)
    window.history.replaceState(null, '', window.location.pathname)
  }, [])

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

  const TERM_LABELS = { short: 'Short term', mid: 'Mid term', long: 'Long term' }
  const short = (v: number) => {
    const a = Math.abs(v)
    if (sym === '₹') return a >= 1e7 ? `₹${(v / 1e7).toFixed(2)}Cr` : a >= 1e5 ? `₹${(v / 1e5).toFixed(2)}L` : a >= 1e3 ? `₹${(v / 1e3).toFixed(1)}K` : `₹${Math.round(v)}`
    return a >= 1e6 ? `AED ${(v / 1e6).toFixed(2)}M` : a >= 1e3 ? `AED ${(v / 1e3).toFixed(1)}K` : `AED ${Math.round(v)}`
  }

  // On track = progress at least close to the share of time already used
  // (created → target date). Monthly = what's still needed per month.
  const withPlan = enriched.map(g => {
    const start = new Date(g.created_at ?? Date.now()).getTime(), end = new Date(g.target_date).getTime()
    const elapsed = end > start ? Math.min(Math.max((Date.now() - start) / (end - start), 0), 1) * 100 : 100
    const monthsLeft = Math.max(Math.ceil(g.daysLeft / 30.4), 1)
    const monthly = g.pct >= 100 ? 0 : Math.max(g.targetInView - g.currentValue, 0) / monthsLeft
    const status: 'done' | 'paused' | 'new' | 'ok' | 'behind' = g.pct >= 100 || g.status === 'achieved' ? 'done'
      : g.status === 'paused' ? 'paused'
      : g.currentValue <= 0 && g.linked_count === 0 ? 'new'
      : g.pct >= elapsed - 10 ? 'ok' : 'behind'
    return { ...g, monthly, status, eta: new Date(g.target_date).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }) }
  })
  const shown = tab === 'all' ? withPlan : withPlan.filter(g => g.term === tab)
  const okCount = withPlan.filter(g => g.status === 'ok' || g.status === 'done').length
  const perMonth = withPlan.filter(g => g.status !== 'paused').reduce((a, g) => a + g.monthly, 0)
  const overall = totalTarget > 0 ? Math.min(totalCurrent / totalTarget * 100, 100) : 0
  const CHIP: Record<string, { label: string; bg: string; c: string }> = {
    done:   { label: 'Achieved', bg: 'var(--pos-bg)', c: 'var(--pos-text)' },
    ok:     { label: 'On track', bg: 'var(--pos-bg)', c: 'var(--pos-text)' },
    behind: { label: 'Behind',   bg: 'var(--amber-bg)', c: 'var(--amber-text)' },
    paused: { label: 'Paused',   bg: '#F1F5F9', c: 'var(--text3)' },
    new:    { label: 'Not started', bg: '#F1F5F9', c: 'var(--text3)' },
  }

  // Tip: the goal that is furthest behind with the nearest deadline
  const lagging = withPlan.filter(g => g.status === 'behind').sort((a, b) => a.daysLeft - b.daysLeft)[0]
  const unstarted = withPlan.filter(g => g.status === 'new')
  const tip = lagging
    ? `${lagging.name} needs about ${short(lagging.monthly)} a month to land by ${lagging.eta}. Linking an investment or a SIP of that size keeps it on track.`
    : unstarted.length
      ? `${unstarted.length === withPlan.length ? 'None of your goals has' : `${unstarted.length} goal${unstarted.length === 1 ? ' has' : 's have'}`} an investment linked yet. Open a goal and link a fund, FD or SIP — progress then updates on its own.`
    : withPlan.length
      ? 'Every active goal is on pace. Review them each quarter and step up contributions when your income rises.'
      : 'Start with an emergency fund: three to six months of essential costs in an easy-access account.'
  const aiContext = `My goals (${view}): ${withPlan.map(g => `${g.name} ${short(g.currentValue)} of ${short(g.targetInView)} by ${g.eta}, ${CHIP[g.status].label.toLowerCase()}, needs ${short(g.monthly)}/month`).join('; ') || 'none yet'}.`

  // Suggestions for common goals the user hasn't set up yet (rule-based)
  // A goal counts as covered by its category or by its name (many are "General")
  const covered = (cat: string, re: RegExp) => goals.some(g => g.category === cat || re.test(String(g.name ?? '')))
  const SUGGEST = [
    !covered('emergency', /emergency|rainy/i) && { t: 'Emergency fund', cat: 'emergency', ic: '🚨', c: '#E4573D', bg: '#FDECE8', why: 'Covers job loss, medical bills or urgent travel home without touching investments.', rule: 'Rule of thumb: 6× monthly essentials' },
    !covered('retirement', /retire|pension/i) && { t: 'Retirement', cat: 'retirement', ic: '🛡️', c: '#6A55E8', bg: '#F0EDFF', why: 'The earlier you start, the more compounding does the work for you.', rule: 'Rule of thumb: 25× yearly expenses' },
    !covered('education', /educat|school|college|universit/i) && { t: 'Kids’ education', cat: 'general', ic: '🎓', c: '#3B8EF0', bg: '#E7F1FE', why: 'School and university fees rise faster than general prices.', rule: 'Plan for about 10% yearly fee inflation' },
    !covered('real_estate', /home|house|flat|apartment|property|villa/i) && { t: 'Buy a home', cat: 'real_estate', ic: '🏠', c: '#2FB67C', bg: '#E7F7EF', why: 'A down-payment goal keeps the loan, and the EMI, smaller.', rule: 'Aim for a 20% down payment' },
    !covered('travel', /travel|trip|vacation|holiday/i) && { t: 'Travel', cat: 'general', ic: '✈️', c: '#F29A2E', bg: '#FFF2E2', why: 'Saving ahead beats paying card interest after the trip.', rule: 'Price it, then divide by months to go' },
  ].filter(Boolean) as { t: string; cat: string; ic: string; c: string; bg: string; why: string; rule: string }[]
  const addSuggested = (name: string, category: string) => { setAddDefaults({ name, category }); setShowAdd(true) }

  return (
    <div className="flex flex-col gap-3.5 md:gap-[18px] animate-fade-up">
      <PageHeader title="Goals"
        sub={`${withPlan.filter(g => g.status !== 'done').length} active · funded from your monthly surplus`}
        onAdd={() => setShowAdd(true)} addLabel="New goal"
        actions={<>
          <Link href="/dashboard/goals/learn" className="wl-btn" style={{ height: 36, borderRadius: 10, fontSize: 13 }}><BookOpen size={14} />Learn</Link>
          <button onClick={() => setShowAdd(true)} className="wl-btn wl-btn-primary" style={{ height: 36, borderRadius: 10, fontSize: 13 }}><Plus size={14} />New goal</button>
        </>} />

      {/* Violet hero: saved vs target + overall ring */}
      <section className="relative overflow-hidden rounded-[22px] md:rounded-[24px] bg-hero text-white p-[18px] md:px-8 md:py-7 flex justify-between items-center gap-3 md:gap-6"
        style={{ boxShadow: '0 14px 34px rgba(76,60,190,.25)' }}>
        <div aria-hidden className="absolute -right-10 -top-12 md:-right-[60px] md:-top-20 w-[150px] h-[150px] md:w-[260px] md:h-[260px] rounded-full" style={{ background: 'rgba(255,255,255,.07)' }} />
        <div aria-hidden className="hidden md:block absolute right-[120px] -bottom-[110px] w-[220px] h-[220px] rounded-full" style={{ background: 'rgba(255,255,255,.06)' }} />
        <div className="relative min-w-0 max-w-[560px]">
          <div className="text-[10.5px] md:text-[11px] font-semibold uppercase tracking-[0.07em]" style={{ color: '#CFC8FA' }}>Build your future</div>
          <div className="text-[21px] md:text-[30px] font-bold leading-[1.2] tracking-[-0.02em] my-1 md:my-1.5">
            {short(totalCurrent)}<span className="hidden md:inline"> saved towards {short(totalTarget)}</span>
          </div>
          <div className="md:hidden text-[12px]" style={{ color: '#E4DEFF' }}>of {short(totalTarget)} · {okCount} of {withPlan.length} on track</div>
          <div className="hidden md:block text-[14px]" style={{ color: '#E4DEFF' }}>Set goals, track progress, make it happen.</div>
          <div className="hidden md:flex gap-2 mt-4 flex-wrap">
            {[`${withPlan.length} goal${withPlan.length === 1 ? '' : 's'}`, `${okCount} on track`, `${short(perMonth)} / month needed`].map(t => (
              <span key={t} className="rounded-full px-[13px] py-1.5 text-[12px] font-semibold" style={{ background: 'rgba(255,255,255,.16)' }}>{t}</span>
            ))}
          </div>
        </div>
        <div className="relative">
          <div className="md:hidden"><Ring pct={overall} size={70} stroke={3.4} color="#fff" track="rgba(255,255,255,.2)" label="Overall goal progress"><span className="text-[17px] font-bold">{Math.round(overall)}%</span></Ring></div>
          <div className="hidden md:block"><Ring pct={overall} size={128} stroke={3.2} color="#fff" track="rgba(255,255,255,.2)" label="Overall goal progress">
            <span className="text-[28px] font-bold leading-none">{Math.round(overall)}%</span>
            <span className="text-[11px] mt-0.5" style={{ color: '#DAD3FF' }}>overall</span>
          </Ring></div>
        </div>
      </section>

      <div className="flex flex-wrap gap-2.5 items-center">
        <div className="max-md:w-full">
          <Segmented violet full label="Goal lists" value={gtab} onChange={setGtab}
            options={[{ value: 'my', label: 'My goals' }, { value: 'suggested', label: `Suggested${SUGGEST.length ? ` · ${SUGGEST.length}` : ''}` }]} />
        </div>
        {gtab === 'my' && withPlan.length > 0 && (
          <div className="flex gap-1.5 overflow-x-auto no-scrollbar max-md:-mx-4 max-md:px-4">
            {(['all', 'short', 'mid', 'long'] as const).map(t => (
              <button key={t} onClick={() => setTab(t)} aria-pressed={tab === t} className="wl-chip flex-shrink-0">
                {t === 'all' ? 'All' : TERM_LABELS[t]} · {t === 'all' ? withPlan.length : withPlan.filter(g => g.term === t).length}
              </button>
            ))}
          </div>
        )}
      </div>

      {gtab === 'my' && (
        <div className="grid grid-cols-1 lg:grid-cols-[1.8fr_1fr] gap-4 items-start">
          {shown.length === 0 ? (
            <div className="rounded-[14px] px-6 py-12 text-center bg-white" style={{ border: '1.5px dashed var(--border2)' }}>
              <div className="w-[60px] h-[60px] rounded-[18px] mx-auto mb-3.5 flex items-center justify-center" style={{ background: 'var(--accent-bg)', color: 'var(--accent)' }}><Target size={26} /></div>
              <div className="text-[18px] font-bold" style={{ color: 'var(--text)' }}>{withPlan.length ? 'No goals in this range' : 'No goals yet'}</div>
              <div className="text-[13.5px] mt-1.5 mb-[18px]" style={{ color: 'var(--text3)' }}>Set a target and a date — linked investments track progress automatically.</div>
              <div className="flex gap-2.5 justify-center flex-wrap">
                <button onClick={() => setShowAdd(true)} className="wl-btn wl-btn-primary" style={{ height: 40, padding: '0 18px' }}>Create a goal</button>
                {SUGGEST.length > 0 && <button onClick={() => setGtab('suggested')} className="wl-btn" style={{ height: 40, padding: '0 18px' }}>See suggestions</button>}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 md:gap-3.5">
              {shown.map(g => {
                const chip = CHIP[g.status]
                const color = g.color || 'var(--accent)'
                return (
                  <div key={g.id} className="wl-card px-3.5 md:px-5 py-3 md:py-[18px] flex flex-col gap-2.5 md:gap-3">
                    {confirmDelete === g.id && (
                      <div className="rounded-xl p-3 flex items-center justify-between gap-3" style={{ border: '1.5px solid var(--rose)', background: 'var(--rose-bg)' }}>
                        <span className="text-[12px] font-medium" style={{ color: 'var(--rose)' }}>Delete “{g.name}”? This cannot be undone.</span>
                        <div className="flex gap-2 flex-shrink-0">
                          <button onClick={() => setConfirmDelete(null)} className="px-3 py-1.5 rounded-lg text-[11.5px] font-semibold border bg-white" style={{ borderColor: 'var(--border)', color: 'var(--text3)' }}>Cancel</button>
                          <button onClick={() => deleteGoal(g.id)} className="px-3 py-1.5 rounded-lg text-[11.5px] font-semibold text-white" style={{ background: 'var(--rose)' }}>Delete</button>
                        </div>
                      </div>
                    )}
                    <div className="flex gap-3 items-center">
                      <Link href={`/dashboard/goals/${g.id}`} className="flex gap-3 items-center flex-1 min-w-0">
                        <span className="w-10 h-10 md:w-[46px] md:h-[46px] rounded-xl md:rounded-[14px] flex items-center justify-center flex-shrink-0 text-[19px]"
                          style={{ background: `${g.color || '#6A55E8'}1F` }}>{g.icon || CAT_ICONS[g.category] || '🎯'}</span>
                        <span className="min-w-0">
                          <span className="block text-[14px] md:text-[15px] font-semibold truncate" style={{ color: 'var(--text)' }}>{g.name}</span>
                          <span className="block text-[11.5px] truncate" style={{ color: 'var(--text4)' }}>
                            {CAT_LABELS[g.category] ?? 'Goal'} · {g.linked_count} linked · {TERM_LABELS[g.term as Term]}
                          </span>
                        </span>
                      </Link>
                      <span className="rounded-full px-2.5 py-[3px] text-[11px] font-semibold flex-shrink-0" style={{ background: chip.bg, color: chip.c }}>{chip.label}</span>
                    </div>
                    <Link href={`/dashboard/goals/${g.id}`} className="block">
                      <div className="flex justify-between items-baseline gap-2">
                        <span className="text-[17px] md:text-[20px] font-bold tabular-nums" style={{ color: 'var(--text)' }}>{short(g.currentValue)}</span>
                        <span className="text-[12px]" style={{ color: 'var(--text3)' }}>of {short(g.targetInView)}</span>
                      </div>
                      <div className="h-[7px] md:h-[9px] rounded-full mt-2" style={{ background: 'var(--track)' }} role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(g.pct)} aria-label={`${g.name} progress`}>
                        <div className="h-full rounded-full wl-grow" style={{ width: `${g.pct}%`, background: g.status === 'done' ? 'var(--pos)' : color }} />
                      </div>
                    </Link>
                    <div className="flex justify-between items-center gap-2 text-[12px]" style={{ color: 'var(--text3)' }}>
                      <span><b style={{ color: 'var(--text)' }}>{Math.round(g.pct)}%</b>{g.monthly > 0 ? ` · ${short(g.monthly)}/mo needed` : ''}</span>
                      <span className="flex items-center gap-1">
                        By {g.eta}
                        <button onClick={() => pauseGoal(g.id, g.status)} title={g.status === 'paused' ? 'Resume goal' : 'Pause goal'} aria-label={g.status === 'paused' ? 'Resume goal' : 'Pause goal'}
                          className="ml-1 p-1 rounded-md hover:bg-[var(--bg2)]" style={{ color: g.status === 'paused' ? 'var(--accent)' : 'var(--text4)' }}><Pause size={12} /></button>
                        <button onClick={() => setConfirmDelete(g.id)} title="Delete goal" aria-label="Delete goal"
                          className="p-1 rounded-md hover:bg-[var(--rose-bg)] hover:text-[var(--rose)]" style={{ color: 'var(--text4)' }}><Trash2 size={12} /></button>
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Right column */}
          <div className="flex flex-col gap-3.5">
            <section className="rounded-[18px] md:rounded-[20px] px-4 md:px-5 py-3.5 md:py-[18px]" style={{ background: '#E7F7EF', border: '1px solid #CBEBDA' }}>
              <div className="flex gap-2.5 items-center mb-2">
                <span className="w-8 h-8 rounded-full flex items-center justify-center text-white text-[15px] font-bold" style={{ background: 'var(--pos)' }}>✦</span>
                <div className="text-[14px] font-semibold" style={{ color: '#14573D' }}>Money tip</div>
              </div>
              <div className="text-[12.5px] md:text-[13px] leading-[1.55]" style={{ color: '#245C45' }}>{tip}</div>
              <button onClick={() => openAdvisor(`Optimise how I fund my goals from my monthly surplus. ${aiContext}`)}
                className="mt-3 rounded-full px-4 py-2 text-[12.5px] font-semibold text-white" style={{ background: 'var(--pos)' }}>
                ✦ Optimise my funding
              </button>
            </section>

            {catData.length > 0 && (
              <section className="wl-card px-4 md:px-5 py-4">
                <h2 className="text-[14px] font-semibold mb-3" style={{ color: 'var(--text)' }}>Where your targets sit</h2>
                <div className="flex gap-4 items-center">
                  <Donut segments={catData.map((d, i) => ({ value: d.value, color: PALETTE[i % PALETTE.length] }))} size={104}
                    label={`Goal targets by type: ${catData.map(d => `${d.name} ${fmt(d.value)}`).join(', ')}`} />
                  <div className="flex-1 min-w-0 flex flex-col gap-1.5">
                    {catData.map((d, i) => (
                      <div key={d.name} className="flex justify-between gap-2 text-[12px]">
                        <span className="truncate" style={{ color: 'var(--text2)' }}><i className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ background: PALETTE[i % PALETTE.length] }} />{d.name}</span>
                        <span className="font-semibold tabular-nums" style={{ color: 'var(--text)' }}>{short(d.value)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            )}

            {withPlan.length > 0 && (
              <section className="wl-card px-4 md:px-5 py-3.5 flex items-center gap-3">
                <span className="w-10 h-10 rounded-xl flex items-center justify-center text-[20px] flex-shrink-0" style={{ background: `${level.color}1F` }}>{level.emoji}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-semibold" style={{ color: 'var(--text)' }}>{level.name} · {pts} pts</div>
                  <div className="h-1.5 rounded-full mt-1.5" style={{ background: 'var(--track)' }}><div className="h-full rounded-full" style={{ width: `${level.pctToNext}%`, background: level.color }} /></div>
                  <div className="text-[11px] mt-1" style={{ color: 'var(--text4)' }}>{level.nextLvl ? `${level.nextLvl.min - pts} pts to ${level.nextLvl.name}` : 'Top level reached'}</div>
                </div>
                <div className="flex gap-0.5 flex-wrap justify-end max-w-[90px]">
                  {earnedBadges.map(b => <span key={b.id} title={b.label} className="text-[16px]">{b.emoji}</span>)}
                </div>
              </section>
            )}
          </div>
        </div>
      )}

      {gtab === 'suggested' && (
        SUGGEST.length === 0 ? (
          <div className="wl-card px-5 py-8 text-center text-[13px]" style={{ color: 'var(--text3)' }}>You already have the common goals covered. Add your own with “New goal”.</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5 md:gap-3.5">
            {SUGGEST.map(x => (
              <div key={x.t} className="wl-card px-3.5 md:px-5 py-3.5 md:py-[18px] flex flex-col gap-2 md:gap-2.5">
                <div className="flex justify-between items-center gap-2">
                  <span className="w-10 h-10 md:w-11 md:h-11 rounded-xl md:rounded-[13px] flex items-center justify-center text-[19px]" style={{ background: x.bg }}>{x.ic}</span>
                  <span className="rounded-full px-2.5 py-[3px] text-[10.5px] font-semibold uppercase tracking-[0.04em]" style={{ background: 'var(--accent-bg)', color: 'var(--accent)' }}>✦ Suggested</span>
                </div>
                <div className="text-[14px] md:text-[15px] font-semibold" style={{ color: 'var(--text)' }}>{x.t}</div>
                <div className="text-[12px] md:text-[12.5px] leading-normal flex-1" style={{ color: 'var(--text3)' }}>{x.why}</div>
                <div className="text-[12px] md:text-[12.5px] font-semibold" style={{ color: 'var(--text)' }}>{x.rule}</div>
                <button onClick={() => addSuggested(x.t, x.cat)} className="h-[38px] rounded-[10px] text-[13px] font-semibold text-white mt-1" style={{ background: 'var(--accent)' }}>Add this goal</button>
              </div>
            ))}
          </div>
        )
      )}

      {showAdd && <AddGoalModal onClose={() => { setShowAdd(false); setAddDefaults(undefined) }} allInvestments={allInvestments} defaults={addDefaults} />}
    </div>
  )
}
