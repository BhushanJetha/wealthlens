'use client'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Plus, BookOpen, Pause, Play, Trash2, ChevronRight, Sparkles, Trophy, PiggyBank, Lightbulb } from 'lucide-react'
import { useViewStore } from '@/store/viewStore'
import { useHolderStore } from '@/store/holderStore'
import { useUiStore } from '@/store/uiStore'
import { createClient } from '@/lib/supabase/client'
import { fmtCompact, fmtMoney } from '@/lib/format'
import { localToday, fmtDay } from '@/lib/insights'
import { HORIZON, PRIORITY, kindInfo, tracksCash, fundingPlan, overAllocated, horizonOf, type Horizon, type Cur } from '@/lib/goals'
import { goalIdeas, TEMPLATES } from '@/lib/goalIdeas'
import { buildGoals, type GoalItem } from '@/lib/goalsView'
import type { GoalsData } from '@/lib/goalsData'
import { PageHeader, InsightBar, Ring, Donut, Segmented } from '@/components/ui/kit'
import AddGoalModal, { type GoalDefaults } from '@/components/forms/AddGoalModal'
import { AddMoneySheet } from './GoalSheets'

const STATUS = {
  achieved: { label: 'Achieved', bg: 'var(--pos-bg)', c: 'var(--pos-text)' },
  on_track: { label: 'On track', bg: 'var(--pos-bg)', c: 'var(--pos-text)' },
  behind:   { label: 'Behind', bg: 'var(--amber-bg)', c: 'var(--amber-text)' },
  paused:   { label: 'Paused', bg: '#F1F5F9', c: 'var(--text3)' },
  new:      { label: 'Not started', bg: '#F1F5F9', c: 'var(--text3)' },
} as const
const LEVELS = [
  { name: 'Seed', emoji: '🌱', min: 0, color: '#6B7280' }, { name: 'Sprout', emoji: '🌿', min: 50, color: '#059669' },
  { name: 'Sapling', emoji: '🌳', min: 150, color: '#16A34A' }, { name: 'Tree', emoji: '💪', min: 300, color: '#2563EB' },
  { name: 'Forest', emoji: '🏆', min: 500, color: '#7C3AED' },
]
const monthYear = (m: number) => { const d = new Date(); d.setMonth(d.getMonth() + m); return d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }) }
const dateIn = (m: number) => { const d = new Date(); d.setMonth(d.getMonth() + m); return d.toISOString().slice(0, 10) }
const seenKey = (id: string) => `wl-goal-ms-${id}`
const dismissKey = (id: string) => `wl-goal-idea-${id}`
const ls = { get: (k: string) => { try { return localStorage.getItem(k) } catch { return null } }, set: (k: string, v: string) => { try { localStorage.setItem(k, v) } catch {} } }

type Nudge = { id: string; icon: string; tone: 'good' | 'warn' | 'info'; title: string; detail: string; action?: { label: string; run: () => void }; href?: string }

// Goals (design v2): every goal tagged short / mid / long term and by type,
// in its own currency, valued from what funds it (lib/goals), checked against
// what you actually save (funding plan), with nudges and ideas to start more.
export default function GoalsClient({ data }: { data: GoalsData }) {
  const router = useRouter()
  const { view } = useViewStore()
  const { selectedHolder } = useHolderStore()
  const { openAdvisor } = useUiStore()
  const [today, setToday] = useState(data.today)
  useEffect(() => { setToday(localToday()) }, [])
  const [tab, setTab] = useState<'my' | 'ideas' | 'done'>('my')
  const [hz, setHz] = useState<'all' | Horizon>('all')
  const [adding, setAdding] = useState<GoalDefaults | null | undefined>(undefined)   // undefined = closed
  const [money, setMoney] = useState<{ goal: any; amount?: number } | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [, rerender] = useState(0)

  // Home's "set up this goal" chips land here with ?new=<goal name>
  useEffect(() => {
    const name = new URLSearchParams(window.location.search).get('new')?.slice(0, 80)
    if (!name) return
    setAdding({ name })
    window.history.replaceState(null, '', window.location.pathname)
  }, [])

  const built = useMemo(() => buildGoals(data, today), [data, today])
  const inView = (c: string) => view === 'consolidated' || (view === 'uae' ? c === 'AED' : c === 'INR')
  const mine = built.items.filter(it => inView(it.goal.currency) && it.goal.status !== 'cancelled' && (!selectedHolder || (it.goal.holder_name ?? '') === selectedHolder || !it.goal.holder_name))
  const live = mine.filter(it => it.plan.status !== 'achieved')
  const done = mine.filter(it => it.plan.status === 'achieved')
  const curs = (['INR', 'AED'] as Cur[]).filter(c => inView(c) && mine.some(it => it.goal.currency === c))
  const short = (n: number, c: string) => fmtCompact(n, c)

  // Funding plan per currency (what you save vs what goals need)
  const funding = useMemo(() => Object.fromEntries(curs.map(c => [c, fundingPlan(live.filter(it => it.goal.currency === c).map(it => ({ goal: it.goal, value: it.v.value, plan: it.plan })), built.monthly[c].saved)])) as Record<Cur, ReturnType<typeof fundingPlan>>,
    [live, curs, built]) // eslint-disable-line react-hooks/exhaustive-deps
  const topGoal = (c: Cur) => funding[c]?.rows[0]?.goal ?? live.find(it => it.goal.currency === c)?.goal

  // Ideas to start more goals (from your own numbers)
  const ideas = useMemo(() => goalIdeas({
    goals: data.goals, today, fx: data.fx, members: data.members, monthly: built.monthly, travel: built.travel, cash: built.cash, loans: built.loans,
  }).filter(i => inView(i.currency) && !ls.get(dismissKey(i.id))), [data, built, today, view]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Nudges ──
  const nudges: Nudge[] = []
  for (const it of mine) {
    const m = [100, 75, 50, 25].find(x => it.plan.pct >= x)
    if (m && Number(ls.get(seenKey(it.goal.id)) ?? 0) < m) nudges.push({ id: `ms-${it.goal.id}`, icon: m === 100 ? '🏆' : '🎉', tone: 'good',
      title: m === 100 ? `${it.goal.name} is fully funded!` : `${it.goal.name} passed ${m}%`, detail: `${short(it.v.value, it.goal.currency)} of ${short(it.plan.futureTarget, it.goal.currency)} — keep it going.`,
      action: { label: 'Nice!', run: () => { ls.set(seenKey(it.goal.id), String(m)); rerender(x => x + 1) } } })
  }
  for (const it of live.filter(it => it.plan.status === 'behind').sort((a, b) => a.plan.months - b.plan.months).slice(0, 2)) {
    const c = it.goal.currency, more = Math.max(0, it.plan.need - it.pace)
    nudges.push({ id: `behind-${it.goal.id}`, icon: '⏳', tone: 'warn', title: `${it.goal.name} is ${short(-it.plan.gap, c)} short at your pace`,
      detail: `Put in about ${short(more, c)} more a month${it.plan.reachAt != null && it.pace > 0 ? `, or it lands around ${monthYear(it.plan.reachAt)}` : ''}.`, href: `/dashboard/goals/${it.goal.id}` })
  }
  const linkedFds = new Set(data.links.filter(l => l.investment_type === 'fixed_deposits').map(l => l.investment_id))
  for (const fd of (data.investments.fixed_deposits ?? []).filter((f: any) => f.maturity_date && !linkedFds.has(f.id) && inView(f.currency ?? 'INR'))) {
    const days = Math.round((new Date(fd.maturity_date).getTime() - Date.now()) / 864e5), g = topGoal(fd.currency ?? 'INR')
    if (days < -15 || days > 45 || !g) continue
    nudges.push({ id: `fd-${fd.id}`, icon: '🏦', tone: 'info', title: `${fd.name} (${short(Number(fd.maturity_amt) || Number(fd.principal) || 0, fd.currency ?? 'INR')}) ${days < 0 ? 'has matured' : `matures ${fmtDay(fd.maturity_date)}`}`,
      detail: `Give it a purpose — count it towards ${g.name}.`,
      action: { label: `Link to ${g.name}`, run: () => link(g.id, 'fixed_deposits', fd.id) } })
  }
  for (const c of curs) {
    const g = topGoal(c), extra = built.extra[c]
    if (!g || extra <= 0) continue
    nudges.push({ id: `extra-${c}`, icon: '💸', tone: 'info', title: `About ${short(extra, c)} more income than usual this month`,
      detail: `A bonus or extra pay? Putting 30% towards ${g.name} keeps the rest guilt-free.`, action: { label: `Add ${short(extra * 0.3, c)} to ${g.name}`, run: () => setMoney({ goal: g, amount: extra * 0.3 }) } })
  }
  for (const it of live) {
    const eqPct = it.v.value > 0 ? it.v.equity / it.v.value * 100 : 0
    if (it.v.value > 0 && eqPct > it.plan.maxEquity + 15) nudges.push({ id: `risk-${it.goal.id}`, icon: '⚠️', tone: 'warn', title: `${it.goal.name} is ${Math.round(eqPct)}% in equity, due in ${it.plan.months} months`,
      detail: `For ${HORIZON[it.plan.horizon].label.toLowerCase()} goals keep equity under ~${it.plan.maxEquity}% — a market dip now could miss the date. Move some to FDs or debt funds.`, href: `/dashboard/goals/${it.goal.id}` })
  }
  for (const o of overAllocated(data.links)) {
    const rec = (data.investments[o.type] ?? []).find((r: any) => r.id === o.id)
    const g = data.links.find(l => l.investment_id === o.id)
    nudges.push({ id: `over-${o.id}`, icon: '🔀', tone: 'warn', title: `${rec?.fund_name ?? rec?.name ?? 'An investment'} is split ${Math.round(o.pct)}% across goals`,
      detail: 'Together the shares can be at most 100%, or the same money counts twice.', href: g ? `/dashboard/goals/${g.goal_id}` : undefined })
  }
  const unstarted = live.filter(it => it.plan.status === 'new')
  if (unstarted.length) nudges.push({ id: 'unstarted', icon: '🚀', tone: 'info', title: `${unstarted.length} goal${unstarted.length === 1 ? ' hasn’t' : 's haven’t'} started`,
    detail: `Link a fund or account, or add money — ${unstarted.slice(0, 2).map(it => it.goal.name).join(', ')}${unstarted.length > 2 ? '…' : ''}.`, href: `/dashboard/goals/${unstarted[0].goal.id}` })

  // ── Gamification ──
  const pts = data.goals.length * 20 + mine.reduce((a, it) => a + [25, 50, 75].filter(x => it.plan.pct >= x).length * 25 + (it.plan.status === 'achieved' ? 100 : 0), 0)
    + Math.min(data.contributions.filter(c => Number(c.amount) > 0).length, 20) * 10 + (data.goals.length >= 3 ? 30 : 0) + (data.links.length ? 15 : 0)
  const level = [...LEVELS].reverse().find(l => pts >= l.min) ?? LEVELS[0]
  const nextLevel = LEVELS[LEVELS.indexOf(level) + 1]

  // ── Actions ──
  async function act(id: string, fn: () => PromiseLike<{ error: any }>) {
    setBusy(id); setError('')
    const { error } = await fn()
    setBusy(null)
    if (error) setError(error.message); else router.refresh()
  }
  const supabase = createClient()
  const link = (goalId: string, type: string, id: string) => act(`link-${id}`, async () => {
    const { data: { user } } = await supabase.auth.getUser()
    return supabase.from('goal_investments').insert({ goal_id: goalId, user_id: user!.id, investment_type: type, investment_id: id, allocation_pct: 100 })
  })
  const update = (id: string, patch: Record<string, any>) => act(id, () => supabase.from('goals').update(patch).eq('id', id))
  const remove = (id: string) => act(id, async () => { await supabase.from('goal_investments').delete().eq('goal_id', id); return supabase.from('goals').delete().eq('id', id) })
  const fromIdea = (i: ReturnType<typeof goalIdeas>[number]): GoalDefaults => ({ name: i.name, kind: i.kind, target: i.target, currency: i.currency, months: i.months, track_cash: i.track_cash, holder_name: i.holder_name ?? null })

  const shownLive = live.filter(it => hz === 'all' || it.plan.horizon === hz)
  const byHz = (h: Horizon) => shownLive.filter(it => it.plan.horizon === h)
  const aiContext = `My goals (${view}): ${mine.map(it => `${it.goal.name} (${HORIZON[it.plan.horizon].label}, ${kindInfo(it.kind).label}) ${short(it.v.value, it.goal.currency)} of ${short(it.plan.futureTarget, it.goal.currency)} by ${it.goal.target_date}, needs ${short(it.plan.need, it.goal.currency)}/month, pace ${short(it.pace, it.goal.currency)}/month, ${STATUS[it.plan.status].label}`).join('; ') || 'none yet'}. `
    + curs.map(c => `Saves about ${short(built.monthly[c].saved, c)} a month in ${c}.`).join(' ')
  const insight = !mine.length
    ? 'No goals yet. Start with an emergency fund, then one goal for each thing you’re saving towards — the ideas below are built from your own numbers.'
    : curs.map(c => {
        const f = funding[c], cap = built.monthly[c].saved
        if (!f?.rows.length) return ''
        return cap <= 0 ? `Your ${c} goals need ${short(f.need, c)} a month, but there's no saving to fund them from yet.`
          : f.need <= cap ? `Your ${c} goals need ${short(f.need, c)} a month and you save about ${short(cap, c)} — it fits, with ${short(f.spare, c)} to spare.`
          : `Your ${c} goals need ${short(f.need, c)} a month; you save about ${short(cap, c)}. ${f.rows.filter(r => !r.fits).length} won't fit as they are — the funding plan shows what to change.`
      }).filter(Boolean).join(' ')

  const card = (it: GoalItem) => {
    const g = it.goal, p = it.plan, c = g.currency, info = kindInfo(it.kind), H = HORIZON[p.horizon], st = STATUS[p.status]
    const eqPct = it.v.value > 0 ? it.v.equity / it.v.value * 100 : 0
    const line = p.status === 'achieved' ? 'Reached 🎉' : p.status === 'paused' ? 'Paused — not counted in the funding plan'
      : p.status === 'new' ? `Needs ${short(p.need, c)}/mo — link a fund or add money to start`
      : p.status === 'on_track' ? `On track · ${short(it.pace, c)}/mo going in${p.gap > 0 ? ` · ${short(p.gap, c)} ahead` : ''}`
      : `${short(-p.gap, c)} short at ${short(it.pace, c)}/mo · needs ${short(p.need, c)}/mo`
    return (
      <div key={g.id} className="wl-card px-3.5 md:px-5 py-3 md:py-[18px] flex flex-col gap-2.5">
        {confirmDelete === g.id && (
          <div className="rounded-xl p-3 flex items-center justify-between gap-3" style={{ border: '1.5px solid var(--rose)', background: 'var(--rose-bg)' }}>
            <span className="text-[12px] font-medium" style={{ color: 'var(--rose)' }}>Delete “{g.name}”? Links and money added are removed too.</span>
            <div className="flex gap-2 flex-shrink-0">
              <button onClick={() => setConfirmDelete(null)} className="wl-btn" style={{ height: 28, fontSize: 12 }}>Cancel</button>
              <button onClick={() => { setConfirmDelete(null); remove(g.id) }} className="wl-btn" style={{ height: 28, fontSize: 12, background: 'var(--rose)', color: '#fff' }}>Delete</button>
            </div>
          </div>
        )}
        <div className="flex gap-3 items-center">
          <Link href={`/dashboard/goals/${g.id}`} className="flex gap-3 items-center flex-1 min-w-0">
            <span className="w-10 h-10 md:w-[46px] md:h-[46px] rounded-xl md:rounded-[14px] flex items-center justify-center flex-shrink-0 text-[19px]" style={{ background: info.color + '1F' }}>{g.icon && g.icon !== '🎯' ? g.icon : info.icon}</span>
            <span className="min-w-0">
              <span className="block text-[14px] md:text-[15px] font-semibold truncate" style={{ color: 'var(--text)' }}>{g.name}</span>
              <span className="block text-[11.5px] truncate" style={{ color: 'var(--text4)' }}>{info.label.split(' / ')[0]}{g.holder_name ? ` · for ${g.holder_name === 'Self' ? 'you' : g.holder_name}` : ''} · by {new Date(g.target_date).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}</span>
            </span>
          </Link>
          <span className="rounded-full px-2.5 py-[3px] text-[11px] font-semibold flex-shrink-0" style={{ background: st.bg, color: st.c }}>{st.label}</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <span className="rounded-full px-2 py-[2px] text-[10.5px] font-semibold" style={{ background: H.bg, color: H.color }}>{H.label}</span>
          {Number(g.priority) === 1 && <span className="rounded-full px-2 py-[2px] text-[10.5px] font-semibold" style={{ background: '#FDECE8', color: '#B4231A' }}>{PRIORITY[1]}</span>}
          {Number(g.priority) === 3 && <span className="rounded-full px-2 py-[2px] text-[10.5px] font-semibold" style={{ background: '#F1F5F9', color: 'var(--text3)' }}>{PRIORITY[3]}</span>}
          {tracksCash(g) && <span className="rounded-full px-2 py-[2px] text-[10.5px] font-semibold" style={{ background: '#E0F4F8', color: '#0E7490' }}>Bank & cash</span>}
          {it.v.value > 0 && eqPct > p.maxEquity + 15 && <span className="rounded-full px-2 py-[2px] text-[10.5px] font-semibold" style={{ background: '#FFF2E2', color: '#9A5B0B' }}>⚠ Too risky for its date</span>}
          {it.v.value > 0 && p.months > 84 && eqPct < 20 && <span className="rounded-full px-2 py-[2px] text-[10.5px] font-semibold" style={{ background: '#F0EDFF', color: 'var(--accent2)' }}>Could grow faster</span>}
        </div>
        <Link href={`/dashboard/goals/${g.id}`} className="block">
          <div className="flex justify-between items-baseline gap-2">
            <span className="text-[17px] md:text-[20px] font-bold tabular-nums" style={{ color: 'var(--text)' }}>{short(it.v.value, c)}</span>
            <span className="text-[12px]" style={{ color: 'var(--text3)' }}>of {short(p.futureTarget, c)}{p.inflation > 0 ? <span title={`${fmtMoney(Number(g.target_amount), c)} in today's money, with prices rising ${p.inflation}% a year`}> *</span> : null}</span>
          </div>
          <div className="h-[7px] md:h-[9px] rounded-full mt-2" style={{ background: 'var(--track)' }} role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(p.pct)} aria-label={`${g.name} progress`}>
            <div className="h-full rounded-full wl-grow" style={{ width: `${p.pct}%`, background: p.status === 'achieved' ? 'var(--pos)' : info.color }} />
          </div>
        </Link>
        <div className="flex justify-between items-center gap-2 text-[12px]">
          <span className="min-w-0 truncate" style={{ color: p.status === 'behind' ? 'var(--amber-text)' : 'var(--text3)' }}><b style={{ color: 'var(--text)' }}>{Math.round(p.pct)}%</b> · {line}</span>
          <span className="flex items-center gap-0.5 flex-shrink-0">
            {p.status !== 'achieved' && <button onClick={() => setMoney({ goal: g })} className="rounded-lg px-2 h-[26px] text-[11.5px] font-semibold flex items-center gap-1" style={{ background: 'var(--accent-bg)', color: 'var(--accent2)' }}><Plus size={12} />Add</button>}
            <button onClick={() => update(g.id, { status: g.status === 'paused' ? 'active' : 'paused' })} disabled={busy === g.id} title={g.status === 'paused' ? 'Resume goal' : 'Pause goal'} aria-label={g.status === 'paused' ? 'Resume goal' : 'Pause goal'}
              className="p-1.5 rounded-md hover:bg-[var(--bg2)]" style={{ color: g.status === 'paused' ? 'var(--accent)' : 'var(--text4)' }}>{g.status === 'paused' ? <Play size={12} /> : <Pause size={12} />}</button>
            <button onClick={() => setConfirmDelete(g.id)} title="Delete goal" aria-label="Delete goal" className="p-1.5 rounded-md hover:bg-[var(--rose-bg)]" style={{ color: 'var(--text4)' }}><Trash2 size={12} /></button>
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3.5 md:gap-[18px] animate-fade-up">
      <PageHeader title="Goals"
        sub={`${live.length} active · ${(['short', 'mid', 'long'] as Horizon[]).map(h => `${live.filter(it => it.plan.horizon === h).length} ${HORIZON[h].label.toLowerCase()}`).join(' · ')}`}
        onAdd={() => setAdding(null)} addLabel="New goal"
        actions={<>
          <Link href="/dashboard/goals/learn" className="wl-btn" style={{ height: 36 }}><BookOpen size={14} />Learn</Link>
          <button onClick={() => setAdding(null)} className="wl-btn wl-btn-primary" style={{ height: 36 }}><Plus size={14} />New goal</button>
        </>} />

      {/* Hero: per currency — goals never mix AED and ₹ */}
      <section className="relative overflow-hidden rounded-[22px] md:rounded-[24px] bg-hero text-white p-[18px] md:px-8 md:py-7 flex justify-between items-center gap-4" style={{ boxShadow: '0 14px 34px rgba(76,60,190,.25)' }}>
        <div aria-hidden className="absolute -right-10 -top-12 md:-right-[60px] md:-top-20 w-[150px] h-[150px] md:w-[260px] md:h-[260px] rounded-full" style={{ background: 'rgba(255,255,255,.07)' }} />
        <div className="relative min-w-0">
          <div className="text-[10.5px] md:text-[11px] font-semibold uppercase tracking-[0.07em]" style={{ color: '#CFC8FA' }}>Build your future</div>
          {curs.length === 0 ? (
            <div className="text-[20px] md:text-[26px] font-bold leading-tight my-1">Give your money a job</div>
          ) : curs.map(c => {
            const its = live.filter(it => it.goal.currency === c)
            const v = its.reduce((a, it) => a + it.v.value, 0), t = its.reduce((a, it) => a + it.plan.futureTarget, 0)
            return <div key={c} className="text-[19px] md:text-[26px] font-bold leading-[1.25] tracking-[-0.02em] mt-1">{short(v, c)} <span className="text-[13px] md:text-[15px] font-medium" style={{ color: '#E4DEFF' }}>saved of {short(t, c)}{curs.length > 1 ? (c === 'AED' ? ' · UAE goals' : ' · India goals') : ''}</span></div>
          })}
          <div className="flex gap-2 mt-3 flex-wrap">
            {[`${live.length} goal${live.length === 1 ? '' : 's'}`, `${live.filter(it => it.plan.status === 'on_track').length} on track`, ...curs.map(c => `${short(funding[c]?.need ?? 0, c)}/mo needed`), done.length ? `${done.length} achieved` : ''].filter(Boolean).map(t => (
              <span key={t} className="rounded-full px-[11px] py-1 text-[11.5px] font-semibold" style={{ background: 'rgba(255,255,255,.16)' }}>{t}</span>
            ))}
          </div>
        </div>
        <div className="relative flex-shrink-0">
          <Ring pct={live.length ? live.filter(it => it.plan.status === 'on_track').length / live.length * 100 : 0} size={112} stroke={3.2} color="#fff" track="rgba(255,255,255,.2)" label="Goals on track">
            <span className="text-[24px] font-bold leading-none">{live.filter(it => it.plan.status === 'on_track').length}/{live.length}</span>
            <span className="text-[10.5px] mt-0.5" style={{ color: '#DAD3FF' }}>on track</span>
          </Ring>
        </div>
      </section>

      <InsightBar text={insight} prompt={`Look at my goals and funding and tell me what to change first. ${aiContext}`} />

      {/* Needs you */}
      {nudges.length > 0 && (
        <section className="wl-card px-4 md:px-5 py-3.5 md:py-4">
          <h2 className="text-[14px] md:text-[15px] font-semibold" style={{ color: 'var(--text)' }}>Needs you</h2>
          <ul className="mt-1.5">
            {nudges.slice(0, 7).map(n => (
              <li key={n.id} className="flex items-start gap-3 py-2.5" style={{ borderTop: '1px solid var(--track)' }}>
                <span className="text-[18px] leading-none mt-0.5">{n.icon}</span>
                <span className="flex-1 min-w-0">
                  <span className="block text-[13px] font-semibold" style={{ color: n.tone === 'warn' ? 'var(--amber-text)' : n.tone === 'good' ? 'var(--pos-text)' : 'var(--text)' }}>{n.title}</span>
                  <span className="block text-[12px] mt-px" style={{ color: 'var(--text3)' }}>{n.detail}</span>
                </span>
                {n.action ? <button onClick={n.action.run} disabled={!!busy} className="wl-btn flex-shrink-0 disabled:opacity-60" style={{ height: 30, fontSize: 12 }}>{n.action.label}</button>
                  : n.href ? <Link href={n.href} className="flex-shrink-0 mt-0.5" style={{ color: 'var(--text4)' }} aria-label="Open"><ChevronRight size={16} /></Link> : null}
              </li>
            ))}
          </ul>
        </section>
      )}
      {error && <div className="rounded-xl px-4 py-2.5 text-[12.5px]" style={{ background: '#FDECE8', color: '#B4231A' }}>{error}</div>}

      <div className="flex flex-wrap gap-2.5 items-center">
        <div className="max-md:w-full">
          <Segmented violet full label="Goal lists" value={tab} onChange={setTab}
            options={[{ value: 'my', label: 'My goals' }, { value: 'ideas', label: `Ideas${ideas.length ? ` · ${ideas.length}` : ''}` }, { value: 'done', label: `Achieved${done.length ? ` · ${done.length}` : ''}` }]} />
        </div>
        {tab === 'my' && live.length > 0 && (
          <div className="flex gap-1.5 overflow-x-auto no-scrollbar max-md:-mx-4 max-md:px-4">
            {(['all', 'short', 'mid', 'long'] as const).map(t => (
              <button key={t} onClick={() => setHz(t)} aria-pressed={hz === t} className="wl-chip flex-shrink-0">
                {t === 'all' ? 'All' : HORIZON[t].label} · {t === 'all' ? live.length : live.filter(it => it.plan.horizon === t).length}
              </button>
            ))}
          </div>
        )}
      </div>

      {tab === 'my' && (
        <div className="grid grid-cols-1 lg:grid-cols-[1.8fr_1fr] gap-4 items-start">
          <div className="flex flex-col gap-4 min-w-0">
            {live.length === 0 ? (
              <div className="rounded-[14px] px-6 py-10 text-center bg-white" style={{ border: '1.5px dashed var(--border2)' }}>
                <div className="text-[34px]">🎯</div>
                <div className="text-[18px] font-bold mt-1" style={{ color: 'var(--text)' }}>{done.length ? 'Every goal is achieved — set your next one' : 'Give your money a job'}</div>
                <div className="text-[13.5px] mt-1.5 mb-[18px] max-w-md mx-auto" style={{ color: 'var(--text3)' }}>Pick a goal, a date and an amount — WealthLens works out the monthly amount and tracks progress from your investments and accounts.</div>
                <div className="flex gap-2.5 justify-center flex-wrap">
                  <button onClick={() => setAdding(null)} className="wl-btn wl-btn-primary" style={{ height: 40, padding: '0 18px' }}>Create a goal</button>
                  {ideas.length > 0 && <button onClick={() => setTab('ideas')} className="wl-btn" style={{ height: 40, padding: '0 18px' }}><Lightbulb size={14} />{ideas.length} ideas for you</button>}
                </div>
              </div>
            ) : (hz === 'all' ? (['short', 'mid', 'long'] as Horizon[]) : [hz]).map(h => byHz(h).length > 0 && (
              <section key={h} className="flex flex-col gap-2.5">
                <div className="flex items-baseline justify-between gap-3 px-0.5 flex-wrap">
                  <h2 className="text-[14px] md:text-[15px] font-semibold flex items-center gap-2" style={{ color: 'var(--text)' }}>
                    <span className="rounded-full px-2.5 py-[3px] text-[11px] font-semibold" style={{ background: HORIZON[h].bg, color: HORIZON[h].color }}>{HORIZON[h].label}</span>{HORIZON[h].range}
                  </h2>
                  <span className="text-[11.5px]" style={{ color: 'var(--text4)' }}>{HORIZON[h].fit}</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 md:gap-3.5">{byHz(h).map(card)}</div>
              </section>
            ))}
          </div>

          {/* Right column */}
          <div className="flex flex-col gap-3.5">
            {curs.map(c => {
              const f = funding[c], cap = built.monthly[c].saved
              if (!f?.rows.length) return null
              const pct = f.need > 0 ? Math.min(100, Math.max(cap, 0) / f.need * 100) : 100
              return (
                <section key={c} className="wl-card px-4 md:px-5 py-4" aria-label={`Funding plan ${c}`}>
                  <div className="flex items-baseline justify-between gap-2">
                    <h2 className="text-[14px] font-semibold flex items-center gap-1.5" style={{ color: 'var(--text)' }}><PiggyBank size={15} style={{ color: 'var(--accent)' }} />Funding plan{curs.length > 1 ? ` · ${c === 'AED' ? 'UAE' : 'India'}` : ''}</h2>
                    <span className="text-[11.5px]" style={{ color: 'var(--text4)' }}>a month</span>
                  </div>
                  <div className="text-[12.5px] mt-1.5" style={{ color: 'var(--text2)' }}>
                    You save about <b style={{ color: 'var(--text)' }}>{short(cap, c)}</b>; your goals need <b style={{ color: 'var(--text)' }}>{short(f.need, c)}</b>.
                  </div>
                  <div className="h-2 rounded-full mt-2" style={{ background: 'var(--track)' }}><div className="h-full rounded-full" style={{ width: `${pct}%`, background: pct >= 100 ? 'var(--pos)' : '#F29A2E' }} /></div>
                  <div className="text-[12px] mt-1.5 font-semibold" style={{ color: f.need <= cap ? 'var(--pos-text)' : 'var(--amber-text)' }}>
                    {cap <= 0 ? 'No monthly saving yet to fund goals from' : f.need <= cap ? `✓ It all fits — ${short(f.spare, c)} to spare` : `${short(f.need - cap, c)} a month short`}
                  </div>
                  <ul className="mt-2">
                    {f.rows.map(r => (
                      <li key={r.goal.id} className="py-2 text-[12.5px]" style={{ borderTop: '1px solid var(--track)' }}>
                        <div className="flex justify-between gap-2">
                          <Link href={`/dashboard/goals/${r.goal.id}`} className="font-semibold truncate" style={{ color: 'var(--text)' }}>{r.goal.name}</Link>
                          <span className="tabular-nums whitespace-nowrap" style={{ color: r.fits ? 'var(--text2)' : 'var(--amber-text)' }}>{short(r.given, c)}<span style={{ color: 'var(--text4)' }}> / {short(r.need, c)}</span></span>
                        </div>
                        {!r.fits && (
                          <div className="flex flex-wrap gap-1.5 mt-1.5">
                            {r.newMonths != null && r.newMonths > 0 && <button onClick={() => update(r.goal.id, { target_date: dateIn(r.newMonths!) })} disabled={busy === r.goal.id} className="wl-chip" style={{ height: 26, fontSize: 11 }}>Move to {monthYear(r.newMonths)}</button>}
                            {r.reachableToday > 0 && <button onClick={() => update(r.goal.id, { target_amount: Math.floor(r.reachableToday / (c === 'AED' ? 100 : 1000)) * (c === 'AED' ? 100 : 1000) })} disabled={busy === r.goal.id} className="wl-chip" style={{ height: 26, fontSize: 11 }}>Lower to {short(r.reachableToday, c)}</button>}
                            <button onClick={() => update(r.goal.id, { status: 'paused' })} disabled={busy === r.goal.id} className="wl-chip" style={{ height: 26, fontSize: 11 }}>Pause</button>
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                  <p className="text-[11px] mt-1.5 leading-snug" style={{ color: 'var(--text4)' }}>Saving = income − spending − EMIs, last 3 months (investing counts). Funded in order: emergency fund, then Must have → Nice to have, then nearest date.</p>
                </section>
              )
            })}

            {live.length > 0 && (() => {
              const hzRows = (['short', 'mid', 'long'] as Horizon[]).map(h => ({ h, n: live.filter(it => it.plan.horizon === h).length })).filter(x => x.n > 0)
              return (
                <section className="wl-card px-4 md:px-5 py-4">
                  <h2 className="text-[14px] font-semibold mb-3" style={{ color: 'var(--text)' }}>Your goals by time</h2>
                  <div className="flex gap-4 items-center">
                    <Donut segments={hzRows.map(x => ({ value: x.n, color: HORIZON[x.h].color }))} size={96} label={`Goals by horizon: ${hzRows.map(x => `${HORIZON[x.h].label} ${x.n}`).join(', ')}`} />
                    <div className="flex-1 min-w-0 flex flex-col gap-1.5">
                      {hzRows.map(x => (
                        <button key={x.h} onClick={() => setHz(x.h)} className="flex justify-between gap-2 text-[12px] text-left">
                          <span style={{ color: 'var(--text2)' }}><i className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ background: HORIZON[x.h].color }} />{HORIZON[x.h].label} <span style={{ color: 'var(--text4)' }}>· {HORIZON[x.h].range}</span></span>
                          <span className="font-semibold tabular-nums" style={{ color: 'var(--text)' }}>{x.n}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                  <p className="text-[11.5px] mt-3 leading-snug" style={{ color: 'var(--text4)' }}>A healthy mix: an emergency fund and one or two short-term goals, plus long-term goals that compounding can grow.</p>
                </section>
              )
            })()}

            <section className="wl-card px-4 md:px-5 py-3.5 flex items-center gap-3">
              <span className="w-10 h-10 rounded-xl flex items-center justify-center text-[20px] flex-shrink-0" style={{ background: `${level.color}1F` }}>{level.emoji}</span>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-semibold" style={{ color: 'var(--text)' }}>{level.name} · {pts} pts</div>
                <div className="h-1.5 rounded-full mt-1.5" style={{ background: 'var(--track)' }}><div className="h-full rounded-full" style={{ width: `${nextLevel ? Math.min(100, (pts - level.min) / (nextLevel.min - level.min) * 100) : 100}%`, background: level.color }} /></div>
                <div className="text-[11px] mt-1" style={{ color: 'var(--text4)' }}>
                  {nextLevel ? `${nextLevel.min - pts} pts to ${nextLevel.name}` : 'Top level reached'}{ideas[0] ? ` · next: “${ideas[0].name}” (+20)` : ''}
                </div>
              </div>
            </section>

            <section className="rounded-[18px] px-4 md:px-5 py-3.5" style={{ background: '#E7F7EF', border: '1px solid #CBEBDA' }}>
              <div className="text-[13px] font-semibold" style={{ color: '#14573D' }}>✦ Make your goals happen</div>
              <div className="text-[12.5px] leading-[1.55] mt-1" style={{ color: '#245C45' }}>Set up a SIP for each long-term goal and link it here — it then fills itself every month.</div>
              <button onClick={() => openAdvisor(`Optimise how I fund my goals from my monthly saving. ${aiContext}`)} className="mt-2.5 rounded-full px-4 py-2 text-[12.5px] font-semibold text-white" style={{ background: 'var(--pos)' }}>✦ Optimise my funding</button>
            </section>
          </div>
        </div>
      )}

      {tab === 'ideas' && (<>
        <div className="rounded-2xl px-4 md:px-5 py-3.5 flex items-start gap-3" style={{ background: 'var(--accent-bg)', border: '1px solid var(--accent-border)' }}>
          <Sparkles size={18} style={{ color: 'var(--accent)' }} className="flex-shrink-0 mt-0.5" />
          <div className="text-[13px] leading-snug" style={{ color: 'var(--accent2)' }}>
            <b>Give every rupee and dirham a job.</b> Each goal gets its own monthly amount and fills itself from the investments and accounts you link. These ideas come from your own spending, family and loans — tap one, change anything, save.
          </div>
        </div>
        {ideas.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5 md:gap-3.5">
            {ideas.map(i => {
              const info = kindInfo(i.kind)
              return (
                <div key={i.id} className="wl-card px-4 md:px-5 py-4 flex flex-col gap-2">
                  <div className="flex justify-between items-center gap-2">
                    <span className="w-10 h-10 rounded-xl flex items-center justify-center text-[19px]" style={{ background: info.color + '1F' }}>{info.icon}</span>
                    <span className="rounded-full px-2.5 py-[3px] text-[10.5px] font-semibold" style={{ background: HORIZON[horizonOf(i.months)].bg, color: HORIZON[horizonOf(i.months)].color }}>{HORIZON[horizonOf(i.months)].label}</span>
                  </div>
                  <div className="text-[15px] font-semibold" style={{ color: 'var(--text)' }}>{i.name}</div>
                  <div className="text-[12.5px] leading-snug flex-1" style={{ color: 'var(--text3)' }}>{i.why}</div>
                  <div className="text-[13px] font-semibold" style={{ color: 'var(--text)' }}>{fmtMoney(i.target, i.currency)} <span className="font-normal" style={{ color: 'var(--text3)' }}>by {monthYear(i.months)}</span></div>
                  <div className="flex gap-2 mt-1">
                    <button onClick={() => setAdding(fromIdea(i))} className="wl-btn wl-btn-primary flex-1" style={{ height: 36 }}>Create this goal</button>
                    <button onClick={() => { ls.set(dismissKey(i.id), '1'); rerender(x => x + 1) }} className="wl-btn" style={{ height: 36 }}>Not now</button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
        <h2 className="text-[15px] font-semibold mt-1 px-0.5" style={{ color: 'var(--text)' }}>Or start from a template</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5">
          {TEMPLATES.map(t => {
            const info = kindInfo(t.kind), c: Cur = view === 'uae' ? 'AED' : 'INR', [amt, months] = t[c]
            return (
              <button key={t.kind} onClick={() => setAdding({ name: t.name, kind: t.kind, target: amt, currency: c, months, track_cash: t.kind === 'emergency' })}
                className="wl-card px-3.5 py-3 text-left flex flex-col gap-1.5 transition-colors hover:border-[var(--accent-border)]">
                <span className="text-[22px]">{info.icon}</span>
                <span className="text-[13px] font-semibold" style={{ color: 'var(--text)' }}>{t.name}</span>
                <span className="text-[11.5px]" style={{ color: 'var(--text3)' }}>e.g. {short(amt, c)} in {months >= 12 ? `${Math.round(months / 12)} yr${months >= 24 ? 's' : ''}` : `${months} months`}</span>
              </button>
            )
          })}
        </div>
      </>)}

      {tab === 'done' && (
        done.length === 0 ? (
          <div className="wl-card px-5 py-10 text-center flex flex-col items-center gap-2">
            <Trophy size={28} style={{ color: '#D97706' }} />
            <div className="text-[15px] font-semibold" style={{ color: 'var(--text)' }}>Your achieved goals will live here</div>
            <div className="text-[12.5px]" style={{ color: 'var(--text3)' }}>Reach one, mark it achieved on its page, and it moves here with the date you did it.</div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5 md:gap-3.5">
            {done.map(it => (
              <Link key={it.goal.id} href={`/dashboard/goals/${it.goal.id}`} className="wl-card px-4 py-3.5 flex items-center gap-3">
                <span className="text-[24px]">🏆</span>
                <span className="flex-1 min-w-0">
                  <span className="block text-[14px] font-semibold truncate" style={{ color: 'var(--text)' }}>{it.goal.name}</span>
                  <span className="block text-[12px]" style={{ color: 'var(--text3)' }}>{short(Number(it.goal.target_amount), it.goal.currency)} · {it.goal.achieved_at ? `achieved ${fmtDay(it.goal.achieved_at)} ${it.goal.achieved_at.slice(0, 4)}` : 'fully funded'}</span>
                </span>
              </Link>
            ))}
            <button onClick={() => setTab('ideas')} className="wl-card px-4 py-3.5 flex items-center justify-center gap-2 text-[13px] font-semibold" style={{ color: 'var(--accent)', borderStyle: 'dashed' }}><Plus size={15} />Set your next goal</button>
          </div>
        )
      )}

      {adding !== undefined && <AddGoalModal onClose={() => setAdding(undefined)} defaults={adding ?? undefined} allInvestments={data.investments} accounts={data.accounts} members={data.members} />}
      {money && <AddMoneySheet goal={money.goal} amount={money.amount} onClose={() => setMoney(null)} onSaved={() => { setMoney(null); router.refresh() }} />}
    </div>
  )
}
