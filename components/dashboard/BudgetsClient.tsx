'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { Plus, Sparkles, Pencil, Lock, Unlock, Trash2, Wallet, Target, TrendingUp, PiggyBank, BarChart2, CalendarRange, Repeat, Users, CheckCircle2 } from 'lucide-react'
import { useViewStore } from '@/store/viewStore'
import { useCategoryStore } from '@/store/categoryStore'
import { useFamily } from '@/hooks/useFamily'
import { createClient } from '@/lib/supabase/client'
import { colorOf as catColorOf } from '@/lib/categories'
import { fmtMoney, fmtCompact } from '@/lib/format'
import { prepareMoney, spendGroup, SPEND_GROUPS, type SpendGroup } from '@/lib/money'
import { daysInMonth, localToday, fmtDay } from '@/lib/insights'
import {
  spendByCategory, budgetLines, budgetLabel, planMonthBudgets, carryIn, fundPlan, fundCover, weekOf, monthMoney, personSpend, addMonths,
  NOT_PLANABLE, FIXED, SAVINGS, PERSON, type BudgetLine, type Cur, type Fund,
} from '@/lib/budgets'
import { PageHeader, InsightBar, AiActions, KpiTile, KpiGrid, Panel, Ring, LearnStrip, MoreLink } from '@/components/ui/kit'
import { ChipFilter } from '@/components/ui/list'
import { CategoryIcon } from '@/components/ui/CategoryIcon'
import { BudgetSheet, SuggestSheet, SavingsSheet, PersonSheet, FundSheet, PlanNextSheet, writeBudget } from './BudgetSheets'

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const STATUS = {
  over: { label: 'Over', color: '#DC2626', bg: '#FEF2F2' },
  near: { label: 'Near limit', color: '#D97706', bg: '#FFF7E6' },
  ok:   { label: 'On track', color: '#16A34A', bg: '#E7F7EF' },
} as const
const monLabel = (m: string) => `${MON[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`
const groupOf = (c: string): SpendGroup => spendGroup({ txn_type: c === 'EMI/Loan' ? 'loan' : 'expense', category: c }) ?? 'sent'
const curName = (c: Cur) => (c === 'AED' ? 'UAE · AED' : 'India · ₹')

// This device's memory of what the automatic budgets may add this month
const seedKey = (cur: string, m: string) => `wl-budget-seeded-${cur}-${m}`
const deletedKey = (cur: string, cat: string, m: string) => `wl-budget-deleted-${cur}-${cat}-${m}`
const flag = (k: string) => { try { return !!localStorage.getItem(k) } catch { return false } }
const setFlag = (k: string) => { try { localStorage.setItem(k, '1') } catch {} }

type SheetState =
  | { kind: 'budget'; line: BudgetLine | null } | { kind: 'suggest' } | { kind: 'savings' } | { kind: 'plan' }
  | { kind: 'person'; row: any | null } | { kind: 'fund'; fund: Fund | null }

// Budgets (design v2), one currency at a time: UAE budgets in AED and India
// budgets in ₹ are planned separately — prices and needs differ, so nothing
// is converted. The All view switches between the two. Spending follows
// lib/money; caps adjust themselves or stay fixed (lib/budgets).
export default function BudgetsClient({ today: serverToday, budgets: initial, transactions, funds: initialFunds, fundsReady }: {
  today: string; budgets: any[]; transactions: any[]; funds: Fund[]; fundsReady: boolean
}) {
  const { view, toMonth, fxRate: FX } = useViewStore()
  const { rows: categories, load: loadCategories } = useCategoryStore()
  const { members } = useFamily()
  useEffect(() => { loadCategories() }, [loadCategories])
  const [today, setToday] = useState(serverToday)
  useEffect(() => { setToday(localToday()) }, [])
  const [budgets, setBudgets] = useState<any[]>(initial)
  useEffect(() => setBudgets(initial), [initial])
  const [funds, setFunds] = useState<Fund[]>(initialFunds)
  useEffect(() => setFunds(initialFunds), [initialFunds])
  const [filter, setFilter] = useState<'all' | 'over' | 'near' | 'ok'>('all')
  const [sheet, setSheet] = useState<SheetState | null>(null)
  const [error, setError] = useState('')
  const [busyFund, setBusyFund] = useState<string | null>(null)

  const thisMonth = today.slice(0, 7)
  const month = toMonth > thisMonth ? thisMonth : toMonth
  const isCurrent = month === thisMonth
  const dim = daysInMonth(month)
  const day = isCurrent ? Number(today.slice(8, 10)) : dim
  const daysLeft = isCurrent ? dim - day : 0
  const timePct = day / dim * 100

  // Which currency's budget: the view's, or (All view) the one you pick
  const [picked, setPicked] = useState<Cur>('INR')
  useEffect(() => { try { const c = localStorage.getItem('wl-budget-cur'); if (c === 'AED' || c === 'INR') setPicked(c) } catch {} }, [])
  const cur: Cur = view === 'uae' ? 'AED' : view === 'india' ? 'INR' : picked
  const pick = (c: Cur) => { setPicked(c); try { localStorage.setItem('wl-budget-cur', c) } catch {} }
  const money = (n: number) => fmtMoney(n, cur)
  const short = (n: number) => fmtCompact(n, cur)

  const merge = (prev: any[], saved: any[], removed: string[] = []) => {
    const next = prev.filter(b => !removed.includes(b.id))
    for (const nb of saved) { const i = next.findIndex(b => b.id === nb.id); if (i >= 0) next[i] = nb; else next.push(nb) }
    return next
  }

  // Keep this month's budgets right, both currencies, once per visit
  const ran = useRef(false)
  useEffect(() => {
    if (ran.current || !today) return
    ran.current = true
    const m = localToday().slice(0, 7)
    const plan = planMonthBudgets(budgets, transactions, m, (c, cat) => !flag(cat ? deletedKey(c, cat, m) : seedKey(c, m)))
    if (!plan.upserts.length && !plan.deletes.length) return
    ;(async () => {
      const supabase = createClient(), saved: any[] = []
      for (const u of plan.upserts) {
        const { data } = await writeBudget(supabase, { ...u, month_year: m, holder_name: u.holder_name ?? undefined })
        if (data) saved.push(data)
      }
      if (plan.deletes.length) await supabase.from('budgets').delete().in('id', plan.deletes)
      for (const c of Array.from(new Set(plan.upserts.map(u => u.currency)))) setFlag(seedKey(c, m))
      setBudgets(prev => merge(prev, saved, plan.deletes))
    })()
  }, [today]) // eslint-disable-line react-hooks/exhaustive-deps

  const colorOf = (c: string) => c === 'International Transfer' ? '#3B8EF0' : catColorOf(categories, c)
  const iconOf = (c: string) => categories.find(r => r.name === c)?.icon ?? (c === 'International Transfer' ? 'send' : 'tag')
  const planCats = useMemo(() => [...categories.filter(c => c.kind === 'expense' && !NOT_PLANABLE.has(c.name)).map(c => c.name), 'International Transfer'], [categories])
  const prepared = useMemo(() => prepareMoney(transactions, { fx: FX }), [transactions, FX])

  // ── This currency's month ──
  const build = (c: Cur, m: string) => {
    const spend = spendByCategory(transactions, m, c)
    const ls = budgetLines(budgets, spend, m, c, { carry: carryIn(budgets, transactions, m, c), cover: fundCover(funds, m, c) })
    return { spend, lines: ls, cap: ls.reduce((a, l) => a + l.cap, 0), spent: ls.reduce((a, l) => a + l.spent, 0) }
  }
  const { spend, lines, cap, spent } = useMemo(() => build(cur, month), [budgets, transactions, funds, cur, month]) // eslint-disable-line react-hooks/exhaustive-deps
  const both = useMemo(() => view === 'consolidated' ? (['AED', 'INR'] as Cur[]).map(c => ({ c, ...build(c, month) })) : [], [budgets, transactions, funds, view, month]) // eslint-disable-line react-hooks/exhaustive-deps
  const left = cap - spent
  const outside = Object.entries(spend).filter(([c]) => !lines.some(l => l.category === c) && !NOT_PLANABLE.has(c)).reduce((a, [, v]) => a + v, 0)
  const flex = lines.filter(l => !FIXED.has(l.category))
  const flexLeft = flex.reduce((a, l) => a + Math.max(l.left, 0), 0)
  const expectedNow = flex.reduce((a, l) => a + l.cap * day / dim, 0) + lines.filter(l => FIXED.has(l.category)).reduce((a, l) => a + l.spent, 0)
  const projected = !isCurrent ? spent : lines.reduce((a, l) => a + (FIXED.has(l.category) ? Math.max(l.spent, l.cap) : day > 0 ? l.spent / day * dim : l.spent), 0)
  const usedPct = cap > 0 ? spent / cap * 100 : 0
  const counts = { over: lines.filter(l => l.status === 'over').length, near: lines.filter(l => l.status === 'near').length, ok: lines.filter(l => l.status === 'ok').length }
  const shown = lines.filter(l => filter === 'all' || l.status === filter)

  // ── Income, save first ──
  const past = [1, 2, 3, 4, 5, 6].map(i => monthMoney(prepared, addMonths(month, -i), cur)).filter(x => x.income > 0)
  const incomeAvg = past.length ? past.reduce((a, x) => a + x.income, 0) / past.length : 0
  const typicalSaved = past.length ? past.slice(0, 3).reduce((a, x) => a + x.saved, 0) / Math.min(3, past.length) : 0
  const mm = monthMoney(prepared, month, cur)
  const savingsRow = budgets.find(b => b.month_year === month && (b.currency || 'INR') === cur && b.category === SAVINGS) ?? null
  const target = Number(savingsRow?.monthly_cap) || 0

  // ── Yearly costs ──
  const fundRows = funds.filter(f => f.currency === cur && f.is_active !== false).map(f => ({ f, p: fundPlan(f, today) })).sort((a, b) => a.f.due_date.localeCompare(b.f.due_date))
  const setAside = fundRows.reduce((a, r) => a + r.p.monthly, 0)

  // ── Income split ──
  const groups = SPEND_GROUPS.map(g => ({ key: g.key as string, label: g.label, color: g.color, cap: lines.filter(l => groupOf(l.category) === g.key).reduce((a, l) => a + l.base, 0) })).filter(g => g.cap > 0)
  if (setAside > 0) groups.push({ key: 'funds', label: 'Set aside for yearly costs', color: '#0891B2', cap: setAside })
  const planned = groups.reduce((a, g) => a + g.cap, 0)
  const unplanned = incomeAvg - planned
  const investCap = groups.find(g => g.key === 'invest')?.cap ?? 0

  // ── Per person ──
  const memberOpts = members.map(m => ({ value: m.relationship === 'self' ? 'Self' : m.name, label: m.relationship === 'self' ? 'You' : m.name }))
  const personRows = budgets.filter(b => b.month_year === month && (b.currency || 'INR') === cur && b.category === PERSON)
  const pSpend = personSpend(transactions, month, cur)

  // ── This week ──
  const wk = weekOf(today)
  const weekSpend = isCurrent ? spendByCategory(transactions, month, cur, wk.fromDay, wk.toDay) : {}
  const weekRows = isCurrent ? flex.filter(l => l.base > 0).map(l => ({ l, share: wk.share(l.base), spent: weekSpend[l.category] ?? 0 })).sort((a, b) => b.share - a.share).slice(0, 6) : []

  // ── History & grid ──
  const history = useMemo(() => {
    const cats = new Set(lines.map(l => l.category))
    return Array.from({ length: 12 }, (_, i) => addMonths(month, i - 11)).map(m => {
      const sp = spendByCategory(transactions, m, cur)
      const c = budgetLines(budgets, sp, m, cur).filter(l => cats.has(l.category)).reduce((a, l) => a + l.base, 0)
      return { m, cap: c, spent: Array.from(cats).reduce((a, k) => a + (sp[k] ?? 0), 0), budgeted: c > 0 }
    })
  }, [transactions, budgets, month, cur, lines])
  const histMax = Math.max(1, ...history.map(h => Math.max(h.cap, h.spent)))
  const grid = useMemo(() => {
    const months = Array.from({ length: 6 }, (_, i) => addMonths(month, i - 5))
    const per = months.map(m => ({ sp: spendByCategory(transactions, m, cur), ls: budgetLines(budgets, {}, m, cur) }))
    const cats = Array.from(new Set([...lines.map(l => l.category), ...Object.entries(spend).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([c]) => c)])).filter(c => !NOT_PLANABLE.has(c))
    return { months, cats, cell: (c: string, i: number) => ({ v: per[i].sp[c] ?? 0, cap: per[i].ls.find(l => l.category === c)?.base ?? 0 }) }
  }, [transactions, budgets, month, cur, lines, spend])

  // ── Actions ──
  async function toggleLock(l: BudgetLine) {
    setError('')
    const { data, error } = await createClient().from('budgets').update({ is_manual: !l.manual }).eq('id', l.row.id).select()
    if (error) { setError(error.message); return }
    setBudgets(prev => merge(prev, data ?? []))
  }
  async function remove(l: BudgetLine) {
    setError('')
    const { error } = await createClient().from('budgets').delete().eq('id', l.row.id)
    if (error) { setError(error.message); return }
    setFlag(deletedKey(cur, l.category, month))
    setBudgets(prev => merge(prev, [], [l.row.id]))
  }
  async function putAside(f: Fund, amount: number) {
    setBusyFund(f.id); setError('')
    let q = createClient().from('budget_funds').update({ saved: Number(f.saved || 0) + amount, last_saved_month: thisMonth }).eq('id', f.id)
    q = f.last_saved_month ? q.eq('last_saved_month', f.last_saved_month) : q.is('last_saved_month', null)
    const { data, error } = await q.select()
    setBusyFund(null)
    if (error) { setError(error.message); return }
    if (data?.[0]) setFunds(prev => prev.map(x => x.id === f.id ? data[0] as Fund : x))
  }
  async function nextYear(f: Fund) {
    setBusyFund(f.id); setError('')
    const [y, ...rest] = f.due_date.split('-')
    const { data, error } = await createClient().from('budget_funds').update({ saved: 0, last_saved_month: null, due_date: `${Number(y) + 1}-${rest.join('-')}` }).eq('id', f.id).select()
    setBusyFund(null)
    if (error) { setError(error.message); return }
    if (data?.[0]) setFunds(prev => prev.map(x => x.id === f.id ? data[0] as Fund : x))
  }

  const nextName = MON[Number(addMonths(month, 1).slice(5, 7)) - 1]
  const insight = lines.length === 0
    ? `No ${cur === 'AED' ? 'UAE (AED)' : 'India (₹)'} budgets yet. Tap “Suggest budgets” to start from your last 3 months, or add your own.`
    : [
        left >= 0
          ? `${short(left)} left of ${short(cap)}${isCurrent && daysLeft > 0 ? ` with ${daysLeft} day${daysLeft === 1 ? '' : 's'} to go — about ${short(flexLeft / Math.max(daysLeft, 1))} a day for flexible spending` : ''}.`
          : `${short(-left)} over your ${short(cap)} budget${isCurrent ? ` with ${daysLeft} days to go` : ''}.`,
        counts.over ? `${lines.filter(l => l.status === 'over').slice(0, 3).map(l => budgetLabel(l.category)).join(', ')} ${counts.over === 1 ? 'is' : 'are'} over.` : 'No category is over.',
        target > 0 ? `Saved so far ${short(Math.max(mm.saved, 0))} of your ${short(target)} target.` : '',
      ].filter(Boolean).join(' ')
  const ctx = `${curName(cur)} budgets for ${monLabel(month)}: ${short(spent)} spent of ${short(cap)}, day ${day} of ${dim}. `
    + lines.map(l => `${budgetLabel(l.category)} ${Math.round(l.spent)} of ${Math.round(l.cap)}`).join(', ') + `. Average income ${short(incomeAvg)}.`
  const smallLink = (onClick: () => void, children: React.ReactNode) =>
    <button onClick={onClick} className="text-[12px] font-semibold flex items-center gap-1" style={{ color: 'var(--accent)' }}>{children}</button>

  return (
    <div className="flex flex-col gap-3.5 md:gap-[18px] animate-fade-up">
      <PageHeader title="Budgets" sub={`${monLabel(month)} · ${curName(cur)}${isCurrent ? ` · day ${day} of ${dim}` : ''}`}
        onAdd={() => setSheet({ kind: 'budget', line: null })} addLabel="Add budget"
        actions={<>
          <Link href="/dashboard/analysis" className="wl-btn" style={{ height: 34 }}><BarChart2 size={14} />Analysis</Link>
          <button onClick={() => setSheet({ kind: 'plan' })} className="wl-btn" style={{ height: 34 }}><CalendarRange size={14} />Plan {nextName}</button>
          <button onClick={() => setSheet({ kind: 'suggest' })} className="wl-btn" style={{ height: 34 }}><Sparkles size={14} />Suggest budgets</button>
          <button onClick={() => setSheet({ kind: 'budget', line: null })} className="wl-btn wl-btn-primary" style={{ height: 34 }}><Plus size={14} />Add budget</button>
        </>} />

      {/* Two separate budgets: pick which one (All view) */}
      {view === 'consolidated' && (
        <div className="grid grid-cols-2 gap-2.5 md:gap-3.5" role="tablist" aria-label="Budget">
          {both.map(b => {
            const pct = b.cap > 0 ? b.spent / b.cap * 100 : 0, on = b.c === cur
            return (
              <button key={b.c} role="tab" aria-selected={on} onClick={() => pick(b.c)}
                className="rounded-2xl px-3.5 md:px-5 py-3 text-left transition-colors"
                style={on ? { background: 'var(--accent-bg)', border: '1.5px solid var(--accent)' } : { background: '#fff', border: '1px solid var(--line)' }}>
                <div className="text-[11px] md:text-[12px] font-semibold" style={{ color: on ? 'var(--accent2)' : 'var(--text3)' }}>{b.c === 'AED' ? 'UAE budget · AED' : 'India budget · ₹'}</div>
                <div className="text-[17px] md:text-[20px] font-bold tabular-nums mt-0.5" style={{ color: b.cap - b.spent < 0 ? '#DC2626' : 'var(--text)' }}>
                  {b.cap > 0 ? fmtCompact(Math.abs(b.cap - b.spent), b.c) : '—'}<span className="text-[11.5px] font-medium ml-1" style={{ color: 'var(--text3)' }}>{b.cap > 0 ? (b.cap - b.spent < 0 ? 'over' : 'left') : 'no budget'}</span>
                </div>
                {b.cap > 0 && <div className="h-1.5 rounded-full mt-1.5" style={{ background: 'var(--track)' }}><div className="h-full rounded-full" style={{ width: `${Math.min(pct, 100)}%`, background: pct > 100 ? '#DC2626' : 'var(--accent)' }} /></div>}
                <div className="text-[11px] mt-1" style={{ color: 'var(--text4)' }}>{b.cap > 0 ? `${fmtCompact(b.spent, b.c)} of ${fmtCompact(b.cap, b.c)} · ${Math.round(pct)}%` : 'Tap to set one up'}</div>
              </button>
            )
          })}
        </div>
      )}

      <InsightBar text={insight} prompt={`Explain my budget in plain language and tell me what to change. ${ctx}`} />
      <AiActions actions={['Where can I cut back?', `Plan ${nextName}’s budget`]} context={ctx} />

      {/* Month-end review prompt */}
      {isCurrent && (daysLeft <= 4 || day <= 3) && (
        <button onClick={() => setSheet({ kind: 'plan' })} className="rounded-2xl px-4 py-3 flex items-center gap-3 text-left" style={{ background: 'var(--accent-bg)', border: '1px solid var(--accent-border)' }}>
          <CalendarRange size={18} style={{ color: 'var(--accent)' }} className="flex-shrink-0" />
          <span className="flex-1 text-[13px]" style={{ color: 'var(--accent2)' }}>
            <b>{daysLeft <= 4 ? `${daysLeft === 0 ? 'Last day' : `${daysLeft} day${daysLeft === 1 ? '' : 's'} left`} — plan ${nextName}` : `New month — review ${MON[Number(addMonths(month, -1).slice(5, 7)) - 1]} and adjust`}.</b> See how each category went and set next month in one go.
          </span>
          <span className="text-[12.5px] font-semibold flex-shrink-0" style={{ color: 'var(--accent)' }}>Plan →</span>
        </button>
      )}

      {/* Left to spend + status */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-3.5 md:gap-4">
        <section className="wl-card px-4 md:px-6 py-4 md:py-5 flex flex-col">
          <div className="text-[10.5px] md:text-[11px] font-semibold uppercase tracking-[0.05em]" style={{ color: 'var(--text3)' }}>{left >= 0 ? 'Left to spend' : 'Over budget'}</div>
          <div className="text-[30px] md:text-[34px] font-bold tabular-nums tracking-[-0.02em] leading-tight" style={{ color: left < 0 ? '#DC2626' : 'var(--text)' }}>{money(Math.abs(left))}</div>
          <div className="text-[12.5px] font-medium" style={{ color: left < 0 ? '#DC2626' : 'var(--income)' }}>
            {cap === 0 ? 'No budgets yet' : isCurrent && daysLeft > 0 ? `About ${short(flexLeft / daysLeft)} a day for ${daysLeft} day${daysLeft === 1 ? '' : 's'} (flexible budgets)` : isCurrent ? 'Last day of the month' : 'Month closed'}
          </div>
          {cap > 0 && (<>
            <div className="relative h-3 rounded-full mt-4" style={{ background: 'var(--track)' }} role="meter" aria-valuenow={Math.round(usedPct)} aria-valuemin={0} aria-valuemax={100} aria-label={`${Math.round(usedPct)}% of budget used`}>
              <div className="h-full rounded-full wl-grow" style={{ width: `${Math.min(usedPct, 100)}%`, background: usedPct >= 100 ? '#DC2626' : usedPct > timePct + 10 ? '#F29A2E' : 'var(--accent)' }} />
              {isCurrent && <span className="absolute -top-1 -bottom-1 w-[2px] rounded-full" style={{ left: `${timePct}%`, background: 'var(--text2)' }} title={`Day ${day} of ${dim}`} />}
            </div>
            <div className="flex justify-between gap-3 text-[12px] mt-2 flex-wrap" style={{ color: 'var(--text3)' }}>
              <span><b style={{ color: 'var(--text)' }}>{money(spent)}</b> spent of {money(cap)} · {Math.round(usedPct)}%</span>
              {isCurrent && <span>The line marks today · by now you'd expect {short(expectedNow)}</span>}
            </div>
            {outside > 0 && <div className="text-[12px] mt-2.5 rounded-lg px-3 py-2" style={{ background: 'var(--bg2)', color: 'var(--text3)' }}>
              Plus {money(outside)} in categories without a budget — <button onClick={() => setSheet({ kind: 'suggest' })} className="font-semibold" style={{ color: 'var(--accent)' }}>add budgets</button></div>}
          </>)}
        </section>

        <section className="wl-card px-4 md:px-5 py-4 md:py-5 flex items-center gap-5">
          <Ring pct={usedPct} size={104} stroke={3.6} color={usedPct >= 100 ? '#DC2626' : 'var(--accent)'} label="Budget used">
            <div className="text-[20px] font-bold tabular-nums" style={{ color: 'var(--text)' }}>{Math.round(usedPct)}%</div>
            <div className="text-[10.5px]" style={{ color: 'var(--text3)' }}>used</div>
          </Ring>
          <div className="flex-1 flex flex-col gap-1.5">
            {(['over', 'near', 'ok'] as const).map(k => (
              <button key={k} onClick={() => setFilter(filter === k ? 'all' : k)} aria-pressed={filter === k}
                className="flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-[12.5px] transition-colors" style={{ background: filter === k ? STATUS[k].bg : 'transparent' }}>
                <span className="flex items-center gap-2" style={{ color: 'var(--text2)' }}><i className="w-2 h-2 rounded-full" style={{ background: STATUS[k].color }} />{STATUS[k].label}</span>
                <b className="tabular-nums" style={{ color: 'var(--text)' }}>{counts[k]}</b>
              </button>
            ))}
          </div>
        </section>
      </div>

      <KpiGrid>
        <KpiTile label="Budgeted" value={short(cap)} tint={0} icon={Target} delta={`${lines.length} categor${lines.length === 1 ? 'y' : 'ies'}`} />
        <KpiTile label="Spent" value={short(spent)} tint={3} icon={Wallet} tone={usedPct >= 100 ? 'bad' : 'neutral'} delta={`${Math.round(usedPct)}% of budget${outside > 0 ? ` · +${short(outside)} unbudgeted` : ''}`} />
        <KpiTile label={isCurrent ? 'Month-end at this pace' : 'Month total'} value={short(projected)} tint={2} icon={TrendingUp}
          tone={cap > 0 && projected > cap ? 'bad' : 'good'} delta={cap > 0 ? (projected > cap ? `${short(projected - cap)} over budget` : `${short(cap - projected)} under budget`) : '—'} />
        <KpiTile label={target > 0 ? 'Saved this month' : 'Not planned'} value={target > 0 ? short(Math.max(mm.saved, 0)) : incomeAvg > 0 ? short(Math.max(unplanned, 0)) : '—'} tint={1} icon={PiggyBank}
          tone={target > 0 ? (mm.saved >= target ? 'good' : 'neutral') : unplanned < 0 ? 'bad' : 'good'}
          delta={target > 0 ? `of your ${short(target)} target` : incomeAvg > 0 ? (unplanned >= 0 ? `${Math.round(unplanned / incomeAvg * 100)}% of income left to save` : `Plans are ${short(-unplanned)} above income`) : 'No income recorded yet'}
          onClick={() => setSheet({ kind: 'savings' })} />
      </KpiGrid>

      {error && <div className="rounded-xl px-4 py-2.5 text-[12.5px]" style={{ background: '#FDECE8', color: '#B4231A' }}>{error}</div>}

      {/* Category budgets */}
      <section className="wl-card overflow-hidden">
        <div className="px-4 md:px-5 pt-3.5 md:pt-[18px] pb-2.5 flex flex-col gap-2.5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-[14px] md:text-[15px] font-semibold" style={{ color: 'var(--text)' }}>Your {cur === 'AED' ? 'UAE' : 'India'} budgets</h2>
            <span className="text-[11.5px] hidden md:inline" style={{ color: 'var(--text4)' }}>Auto = adjusts each month · <Lock size={10} className="inline -mt-0.5" /> = fixed · <Repeat size={10} className="inline -mt-0.5" /> = rolls over</span>
          </div>
          {lines.length > 0 && <ChipFilter label="Show" value={filter} onChange={k => setFilter(k as any)}
            options={[{ key: 'all', label: 'All', count: lines.length }, { key: 'over', label: 'Over', count: counts.over, warn: counts.over > 0 }, { key: 'near', label: 'Near limit', count: counts.near }, { key: 'ok', label: 'On track', count: counts.ok }]} />}
        </div>
        {lines.length === 0 ? (
          <div className="px-5 pb-8 pt-4 text-center flex flex-col items-center gap-3">
            <div className="text-[13px] max-w-md" style={{ color: 'var(--text3)' }}>No {cur === 'AED' ? 'AED' : '₹'} budgets for {monLabel(month)}. Start from what you actually spend — suggestions use your last 3 months.</div>
            <div className="flex gap-2">
              <button onClick={() => setSheet({ kind: 'suggest' })} className="wl-btn wl-btn-primary" style={{ height: 36 }}><Sparkles size={14} />Suggest budgets</button>
              <button onClick={() => setSheet({ kind: 'budget', line: null })} className="wl-btn" style={{ height: 36 }}><Plus size={14} />Add one</button>
            </div>
          </div>
        ) : (
          <ul>
            {shown.map(l => {
              const fixed = FIXED.has(l.category), st = STATUS[l.status], c = colorOf(l.category)
              const ahead = isCurrent && !fixed && l.status !== 'over' && l.cap > 0 && l.pct > timePct + 10 && l.spent - l.cap * day / dim > 0
              const note = l.status === 'over' ? { t: `Over by ${money(-l.left)}`, c: STATUS.over.color }
                : ahead ? { t: `Ahead of pace — ${short(l.spent - l.cap * day / dim)} more than expected by today`, c: STATUS.near.color }
                : fixed && l.cap > 0 && l.spent >= l.cap * 0.98 ? { t: 'Paid for this month', c: STATUS.ok.color }
                : fixed && isCurrent && l.spent === 0 ? { t: 'Not paid yet this month', c: 'var(--text3)' }
                : { t: `${money(l.left)} left${isCurrent && daysLeft > 0 && !fixed ? ` · ${short(l.left / daysLeft)} a day` : ''}`, c: l.status === 'near' ? STATUS.near.color : 'var(--text3)' }
              return (
                <li key={l.category} style={{ borderTop: '1px solid var(--track)' }}>
                  <div className="flex items-center gap-3 px-4 md:px-5 py-3 cursor-pointer md:cursor-default hover:bg-[#FAFAFE] transition-colors"
                    onClick={() => { if (window.matchMedia('(max-width: 767px)').matches) setSheet({ kind: 'budget', line: l }) }}>
                    <span className="w-9 h-9 rounded-[11px] flex items-center justify-center flex-shrink-0" style={{ background: c + '1A', color: c }}><CategoryIcon icon={iconOf(l.category)} size={16} /></span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="flex items-center gap-1.5 min-w-0">
                          <span className="text-[13.5px] font-semibold truncate" style={{ color: 'var(--text)' }}>{budgetLabel(l.category)}</span>
                          {l.manual ? <Lock size={11} style={{ color: 'var(--text4)' }} aria-label="Fixed amount" className="flex-shrink-0" />
                            : <span className="text-[10px] font-semibold px-1.5 py-[1px] rounded-full flex-shrink-0" style={{ background: 'var(--accent-bg)', color: 'var(--accent2)' }}>Auto</span>}
                          {l.rollover && <Repeat size={11} style={{ color: 'var(--text4)' }} aria-label="Rolls over" className="flex-shrink-0" />}
                          {l.carry > 0 && <span className="hidden sm:inline text-[10.5px] font-semibold px-1.5 py-[1px] rounded-full flex-shrink-0" style={{ background: '#E7F7EF', color: '#1E7A50' }}>+{short(l.carry)} rolled over</span>}
                          {l.cover > 0 && <span className="hidden sm:inline text-[10.5px] font-semibold px-1.5 py-[1px] rounded-full flex-shrink-0" style={{ background: '#E0F4F8', color: '#0E7490' }}>+{short(l.cover)} from yearly fund</span>}
                        </span>
                        <span className="text-[13px] tabular-nums whitespace-nowrap"><b style={{ color: 'var(--text)' }}>{money(l.spent)}</b><span style={{ color: 'var(--text4)' }}> / {short(l.cap)}</span></span>
                      </div>
                      <div className="relative h-2 rounded-full mt-1.5" style={{ background: 'var(--track)' }}>
                        <div className="h-full rounded-full wl-grow" style={{ width: `${Math.min(Math.max(l.pct, l.spent > 0 ? 2 : 0), 100)}%`, background: l.status === 'over' ? STATUS.over.color : ahead || l.status === 'near' ? '#F29A2E' : c }} />
                        {isCurrent && !fixed && <span className="absolute -top-[3px] -bottom-[3px] w-[2px] rounded-full" style={{ left: `${timePct}%`, background: 'var(--text3)', opacity: .55 }} />}
                      </div>
                      <div className="flex justify-between gap-3 mt-1 text-[11.5px]">
                        <span className="truncate" style={{ color: note.c, fontWeight: l.status === 'over' || ahead ? 600 : 400 }}>{note.t}</span>
                        <span className="tabular-nums flex-shrink-0" style={{ color: st.color }}>{Math.round(l.pct)}%</span>
                      </div>
                    </div>
                    <div className="hidden md:flex items-center gap-0.5 flex-shrink-0">
                      <button onClick={() => setSheet({ kind: 'budget', line: l })} aria-label={`Edit ${budgetLabel(l.category)}`} title="Edit" className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[var(--accent-bg)]" style={{ color: 'var(--text3)' }}><Pencil size={14} /></button>
                      <button onClick={() => toggleLock(l)} aria-label={l.manual ? 'Let it adjust each month' : 'Keep this amount fixed'} title={l.manual ? 'Fixed amount — tap to let it adjust each month' : 'Adjusts each month — tap to keep this amount'}
                        className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[var(--accent-bg)]" style={{ color: l.manual ? 'var(--accent2)' : 'var(--text3)' }}>{l.manual ? <Lock size={14} /> : <Unlock size={14} />}</button>
                      <button onClick={() => remove(l)} aria-label={`Delete ${budgetLabel(l.category)} budget`} title="Delete" className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[#FEF2F2]" style={{ color: 'var(--text4)' }}><Trash2 size={14} /></button>
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5 md:gap-4 items-start">
        {/* Save first */}
        <Panel title="Save first" right={smallLink(() => setSheet({ kind: 'savings' }), target > 0 ? 'Change' : 'Set a target')}>
          {target > 0 ? (<>
            <div className="flex items-baseline justify-between gap-3 mt-2">
              <span className="text-[22px] font-bold tabular-nums" style={{ color: mm.saved >= target ? 'var(--income)' : 'var(--text)' }}>{money(Math.max(mm.saved, 0))}</span>
              <span className="text-[12.5px]" style={{ color: 'var(--text3)' }}>of {money(target)} target</span>
            </div>
            <div className="h-2 rounded-full mt-2" style={{ background: 'var(--track)' }}>
              <div className="h-full rounded-full wl-grow" style={{ width: `${Math.min(100, Math.max(mm.saved, 0) / target * 100)}%`, background: mm.saved >= target ? 'var(--income)' : 'var(--accent)' }} />
            </div>
            <p className="text-[12px] mt-2 mb-1.5 leading-snug" style={{ color: 'var(--text3)' }}>
              {mm.income === 0 ? 'No income in this month yet — it counts once it lands.'
                : mm.saved >= target ? `Target met — ${short(mm.saved - target)} extra so far.`
                : `${short(target - mm.saved)} to go. Income ${short(mm.income)} − spent ${short(mm.spent)} − EMIs ${short(mm.emi)}; investing (${short(mm.invest)}) counts as saving.`}
            </p>
            <MoreLink href="/dashboard/goals">Put it towards a goal</MoreLink>
          </>) : (
            <p className="text-[12.5px] mt-2 leading-snug" style={{ color: 'var(--text3)' }}>
              Decide what you'll save before planning what you'll spend.{typicalSaved > 0 ? ` You've saved about ${short(typicalSaved)} a month lately.` : ''} Set a target and this tracks it: income − spending − EMIs, with investing counted as saving.
            </p>
          )}
        </Panel>

        {/* This week */}
        <Panel title="This week" right={isCurrent ? <span className="text-[11.5px]" style={{ color: 'var(--text4)' }}>{fmtDay(`${month}-${String(wk.fromDay).padStart(2, '0')}`)} – today · {wk.daysLeft} day{wk.daysLeft === 1 ? '' : 's'} left</span> : undefined}>
          {!isCurrent ? <p className="text-[12.5px] mt-2" style={{ color: 'var(--text3)' }}>Shown for the current month.</p>
            : weekRows.length === 0 ? <p className="text-[12.5px] mt-2" style={{ color: 'var(--text3)' }}>Set budgets for everyday spending (food, transport, shopping) to see a weekly allowance.</p>
            : (<ul className="mt-2">
              {weekRows.map(({ l, share, spent: ws }) => {
                const pct = share > 0 ? ws / share * 100 : 0
                return (
                  <li key={l.category} className="py-1.5">
                    <div className="flex justify-between gap-2 text-[12.5px]">
                      <span className="font-semibold truncate" style={{ color: 'var(--text)' }}>{budgetLabel(l.category)}</span>
                      <span className="tabular-nums whitespace-nowrap" style={{ color: ws > share ? '#DC2626' : 'var(--text2)' }}>{short(ws)} <span style={{ color: 'var(--text4)' }}>/ {short(share)}</span></span>
                    </div>
                    <div className="h-1.5 rounded-full mt-1" style={{ background: 'var(--track)' }}><div className="h-full rounded-full" style={{ width: `${Math.min(pct, 100)}%`, background: pct > 100 ? '#DC2626' : colorOf(l.category) }} /></div>
                  </li>
                )
              })}
              <li className="text-[11.5px] mt-1.5" style={{ color: 'var(--text4)' }}>A week's share = the monthly budget × 7 ÷ {dim} days.</li>
            </ul>)}
        </Panel>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5 md:gap-4 items-start">
        {/* Yearly costs */}
        <Panel title="Yearly costs" right={fundsReady ? smallLink(() => setSheet({ kind: 'fund', fund: null }), <><Plus size={13} />Add</>) : undefined}>
          {!fundsReady ? <p className="text-[12.5px] mt-2" style={{ color: 'var(--text3)' }}>Run migration 029 in Supabase to plan yearly costs — school fees, insurance, flights home — a month at a time.</p>
            : fundRows.length === 0 ? (
              <p className="text-[12.5px] mt-2 leading-snug" style={{ color: 'var(--text3)' }}>School fees, insurance, flights home, festivals — add them here and put a share aside every month, so the big month isn't a shock. In the month it's due, what you've put aside is added to that category's budget.</p>
            ) : (<ul className="mt-1.5">
              {fundRows.map(({ f, p }) => (
                <li key={f.id} className="py-2.5" style={{ borderTop: '1px solid var(--track)' }}>
                  <div className="flex items-start justify-between gap-3">
                    <button onClick={() => setSheet({ kind: 'fund', fund: f })} className="min-w-0 text-left">
                      <span className="block text-[13px] font-semibold truncate" style={{ color: 'var(--text)' }}>{f.name}</span>
                      <span className="block text-[11.5px]" style={{ color: 'var(--text3)' }}>{money(Number(f.target))} due {fmtDay(f.due_date)}{f.category ? ` · ${budgetLabel(f.category)}` : ''}</span>
                    </button>
                    {p.isDue ? (
                      <button onClick={() => nextYear(f)} disabled={busyFund === f.id} className="wl-btn flex-shrink-0 disabled:opacity-60" style={{ height: 30, fontSize: 12 }}><CheckCircle2 size={13} />Paid · plan next year</button>
                    ) : p.left <= 0 ? (
                      <span className="text-[12px] font-semibold flex items-center gap-1 flex-shrink-0" style={{ color: 'var(--income)' }}><CheckCircle2 size={13} />All set aside</span>
                    ) : p.doneThisMonth ? (
                      <span className="text-[12px] font-semibold flex-shrink-0" style={{ color: 'var(--income)' }}>✓ Set aside this month</span>
                    ) : (
                      <button onClick={() => putAside(f, p.monthly)} disabled={busyFund === f.id} className="wl-btn wl-btn-primary flex-shrink-0 disabled:opacity-60" style={{ height: 30, fontSize: 12 }}>Set aside {short(p.monthly)}</button>
                    )}
                  </div>
                  <div className="h-1.5 rounded-full mt-2" style={{ background: 'var(--track)' }}><div className="h-full rounded-full wl-grow" style={{ width: `${p.pct}%`, background: '#0891B2' }} /></div>
                  <div className="flex justify-between text-[11px] mt-1" style={{ color: 'var(--text4)' }}>
                    <span>{money(Number(f.saved || 0))} put aside</span>
                    <span>{p.isDue ? 'due now' : p.left > 0 ? `${short(p.monthly)}/month for ${Math.max(p.monthsLeft, 1)} month${Math.max(p.monthsLeft, 1) === 1 ? '' : 's'}` : 'ready'}</span>
                  </div>
                </li>
              ))}
              <li className="text-[11.5px] pt-2" style={{ color: 'var(--text4)', borderTop: '1px solid var(--track)' }}>Set aside each month: <b style={{ color: 'var(--text2)' }}>{money(setAside)}</b> — keep it in savings, not your spending account.</li>
            </ul>)}
        </Panel>

        {/* Per person */}
        <Panel title="By person" right={memberOpts.length > 1 ? smallLink(() => setSheet({ kind: 'person', row: null }), <><Plus size={13} />Add</>) : undefined}>
          {memberOpts.length <= 1 ? (
            <p className="text-[12.5px] mt-2 leading-snug" style={{ color: 'var(--text3)' }}>Add family members (Settings → Family) to give each person a budget — kids, parents, a spouse. Expenses tagged “For” them count against it.</p>
          ) : personRows.length === 0 ? (
            <p className="text-[12.5px] mt-2 leading-snug" style={{ color: 'var(--text3)' }}>Give someone their own monthly budget. Everything you tag “For” them (when adding an expense) counts against it.</p>
          ) : (<ul className="mt-1.5">
            {personRows.map(r => {
              const s = pSpend[r.holder_name] ?? 0, c = Number(r.monthly_cap) || 0, pct = c > 0 ? s / c * 100 : 0
              const label = memberOpts.find(m => m.value === r.holder_name)?.label ?? r.holder_name
              return (
                <li key={r.id} className="py-2" style={{ borderTop: '1px solid var(--track)' }}>
                  <button onClick={() => setSheet({ kind: 'person', row: r })} className="w-full text-left">
                    <div className="flex justify-between gap-2 text-[13px]">
                      <span className="font-semibold flex items-center gap-1.5" style={{ color: 'var(--text)' }}><Users size={13} style={{ color: 'var(--text4)' }} />{label}</span>
                      <span className="tabular-nums" style={{ color: s > c ? '#DC2626' : 'var(--text2)' }}><b>{money(s)}</b><span style={{ color: 'var(--text4)' }}> / {short(c)}</span></span>
                    </div>
                    <div className="h-1.5 rounded-full mt-1.5" style={{ background: 'var(--track)' }}><div className="h-full rounded-full" style={{ width: `${Math.min(pct, 100)}%`, background: pct > 100 ? '#DC2626' : 'var(--accent)' }} /></div>
                    <div className="text-[11.5px] mt-1" style={{ color: s > c ? '#DC2626' : 'var(--text3)' }}>{s > c ? `Over by ${money(s - c)}` : `${money(c - s)} left`}</div>
                  </button>
                </li>
              )
            })}
          </ul>)}
        </Panel>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5 md:gap-4 items-start">
        {/* Income plan */}
        <Panel title="How your budget splits your income" right={past.length > 0 ? <span className="text-[11.5px]" style={{ color: 'var(--text4)' }}>{cur === 'AED' ? 'UAE' : 'India'} income · avg of {past.length} month{past.length === 1 ? '' : 's'}</span> : undefined}>
          {incomeAvg <= 0 ? (
            <p className="text-[12.5px] mt-2" style={{ color: 'var(--text3)' }}>{cur === 'AED' ? 'Add your UAE income (salary…)' : 'Add your India income — money you send home counts once it lands in NRE'} to see how much of it your budgets plan for.</p>
          ) : (<>
            <div className="text-[12.5px] mt-1.5" style={{ color: 'var(--text2)' }}>Average income <b style={{ color: 'var(--text)' }}>{money(incomeAvg)}</b> a month{target > 0 ? <> · save-first target <b style={{ color: 'var(--text)' }}>{money(target)}</b></> : null}</div>
            <div className="flex h-3 rounded-full overflow-hidden gap-[2px] mt-3" role="img"
              aria-label={[...groups.map(g => `${g.label} ${Math.round(g.cap / incomeAvg * 100)}%`), unplanned > 0 ? `Not planned ${Math.round(unplanned / incomeAvg * 100)}%` : ''].join(', ')}>
              {groups.map(g => <div key={g.key} style={{ width: `${g.cap / Math.max(incomeAvg, planned) * 100}%`, background: g.color }} />)}
              {unplanned > 0 && <div style={{ width: `${unplanned / incomeAvg * 100}%`, background: '#D9F2E5' }} />}
            </div>
            <ul className="mt-3">
              {groups.map(g => (
                <li key={g.key} className="flex items-center gap-2.5 py-1.5 text-[12.5px]">
                  <i className="w-2.5 h-2.5 rounded-[3px]" style={{ background: g.color }} />
                  <span className="flex-1" style={{ color: 'var(--text2)' }}>{g.label}</span>
                  <span className="tabular-nums font-semibold" style={{ color: 'var(--text)' }}>{short(g.cap)}</span>
                  <span className="w-10 text-right tabular-nums" style={{ color: 'var(--text4)' }}>{Math.round(g.cap / incomeAvg * 100)}%</span>
                </li>
              ))}
              <li className="flex items-center gap-2.5 py-1.5 text-[12.5px]" style={{ borderTop: '1px solid var(--track)' }}>
                <i className="w-2.5 h-2.5 rounded-[3px]" style={{ background: unplanned >= 0 ? '#9ED9BC' : '#DC2626' }} />
                <span className="flex-1 font-semibold" style={{ color: 'var(--text)' }}>{unplanned >= 0 ? 'Not planned — left to save' : 'Planned beyond income'}</span>
                <span className="tabular-nums font-semibold" style={{ color: unplanned >= 0 ? 'var(--income)' : '#DC2626' }}>{short(Math.abs(unplanned))}</span>
                <span className="w-10 text-right tabular-nums" style={{ color: 'var(--text4)' }}>{Math.round(Math.abs(unplanned) / incomeAvg * 100)}%</span>
              </li>
            </ul>
            <p className="text-[11.5px] mt-2 leading-snug" style={{ color: 'var(--text4)' }}>
              Saving planned: {short(Math.max(unplanned, 0) + investCap)} ({Math.round((Math.max(unplanned, 0) + investCap) / incomeAvg * 100)}% of income){target > 0 ? ` vs your ${short(target)} target` : ''} — what's not planned plus your investing budget.
            </p>
          </>)}
        </Panel>

        {/* Month by month */}
        <Panel title="Month by month" right={<span className="text-[11.5px]" style={{ color: 'var(--text4)' }}>these categories vs that month's budget</span>}>
          <div className="flex items-end gap-1.5 h-[150px] mt-4" role="img" aria-label={history.map(h => `${monLabel(h.m)}: ${short(h.spent)}${h.budgeted ? ` of ${short(h.cap)}` : ' (no budget)'}`).join(', ')}>
            {history.map(h => {
              const over = h.budgeted && h.spent > h.cap
              return (
                <div key={h.m} className="flex-1 h-full flex flex-col justify-end relative" title={`${monLabel(h.m)}: ${money(h.spent)}${h.budgeted ? ` of ${money(h.cap)}` : ' · no budget'}`}>
                  {h.budgeted && <span className="absolute left-0 right-0 h-[2px] rounded-full" style={{ bottom: `${h.cap / histMax * 100}%`, background: 'var(--text2)' }} />}
                  <div className="rounded-t-[4px] wl-grow" style={{ height: `${Math.max(h.spent / histMax * 100, h.spent > 0 ? 2 : 0)}%`, background: !h.budgeted ? '#DCD8EE' : over ? '#F2A3A3' : h.m === month ? 'var(--accent)' : '#B9AEF5' }} />
                </div>
              )
            })}
          </div>
          <div className="flex gap-1.5 mt-1.5">{history.map(h => <div key={h.m} className="flex-1 text-center text-[10px]" style={{ color: h.m === month ? 'var(--accent2)' : 'var(--text4)' }}>{MON[Number(h.m.slice(5)) - 1].slice(0, 1)}<span className="hidden md:inline">{MON[Number(h.m.slice(5)) - 1].slice(1)}</span></div>)}</div>
          <div className="flex gap-3.5 flex-wrap text-[11px] mt-2.5" style={{ color: 'var(--text3)' }}>
            <span className="flex items-center gap-1.5"><i className="w-3 h-[2px]" style={{ background: 'var(--text2)' }} />Budget</span>
            <span className="flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-[3px]" style={{ background: '#B9AEF5' }} />Within</span>
            <span className="flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-[3px]" style={{ background: '#F2A3A3' }} />Over</span>
            <span className="flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-[3px]" style={{ background: '#DCD8EE' }} />No budget that month</span>
          </div>
        </Panel>
      </div>

      {/* Category × month */}
      {grid.cats.length > 0 && (
        <section className="wl-card overflow-hidden">
          <div className="px-4 md:px-5 pt-3.5 md:pt-[18px] pb-2 flex items-baseline justify-between gap-2">
            <h2 className="text-[14px] md:text-[15px] font-semibold" style={{ color: 'var(--text)' }}>Category by month · {cur === 'AED' ? 'AED' : '₹'}</h2>
            <MoreLink href="/dashboard/reports">Full report</MoreLink>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]" style={{ minWidth: 620 }}>
              <thead>
                <tr>
                  <th className="text-left font-semibold px-4 md:px-5 py-2 text-[10.5px] uppercase tracking-[0.05em]" style={{ color: 'var(--text4)' }}>Category</th>
                  {grid.months.map(m => <th key={m} className="text-right font-semibold px-2 py-2 text-[10.5px] uppercase tracking-[0.05em]" style={{ color: m === month ? 'var(--accent2)' : 'var(--text4)' }}>{MON[Number(m.slice(5)) - 1]}</th>)}
                </tr>
              </thead>
              <tbody>
                {grid.cats.map(c => (
                  <tr key={c} style={{ borderTop: '1px solid var(--track)' }}>
                    <td className="px-4 md:px-5 py-2"><span className="flex items-center gap-2"><i className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: colorOf(c) }} /><span className="truncate" style={{ color: 'var(--text)' }}>{budgetLabel(c)}</span></span></td>
                    {grid.months.map((m, i) => {
                      const { v, cap: cp } = grid.cell(c, i)
                      const p = cp > 0 ? v / cp : null
                      const bg = p == null || v === 0 ? 'transparent' : p > 1 ? '#FDECEC' : p > 0.85 ? '#FFF4E0' : '#ECF8F1'
                      const fg = p == null ? 'var(--text2)' : p > 1 ? '#B91C1C' : p > 0.85 ? '#9A5B0B' : '#1E7A50'
                      return <td key={m} className="px-2 py-1.5 text-right tabular-nums"><span className="inline-block rounded-md px-1.5 py-0.5" style={{ background: bg, color: v ? fg : 'var(--text4)' }}
                        title={`${budgetLabel(c)} · ${monLabel(m)}: ${money(v)}${cp > 0 ? ` of ${money(cp)}` : ''}`}>{v ? short(v) : '—'}</span></td>
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 md:px-5 py-2.5 flex gap-3.5 flex-wrap text-[11px]" style={{ color: 'var(--text3)', borderTop: '1px solid var(--track)' }}>
            <span className="flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-[3px]" style={{ background: '#ECF8F1' }} />Within budget</span>
            <span className="flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-[3px]" style={{ background: '#FFF4E0' }} />Over 85%</span>
            <span className="flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-[3px]" style={{ background: '#FDECEC' }} />Over</span>
            <span>Plain = no budget that month</span>
          </div>
        </section>
      )}

      <LearnStrip title="Budgets are plans, not punishments" href="/dashboard/budgets/learn" />

      {sheet?.kind === 'budget' && <BudgetSheet line={sheet.line} cur={cur} cats={planCats} txns={transactions} month={month} iconOf={iconOf} colorOf={colorOf}
        onClose={() => setSheet(null)} onSaved={(rows, removed) => {
          if (removed.length && sheet.line) setFlag(deletedKey(cur, sheet.line.category, month))
          setBudgets(prev => merge(prev, rows, removed)); setSheet(null)
        }} />}
      {sheet?.kind === 'suggest' && <SuggestSheet cur={cur} txns={transactions} budgets={budgets} month={month}
        onClose={() => setSheet(null)} onSaved={rows => { setBudgets(prev => merge(prev, rows)); setSheet(null) }} />}
      {sheet?.kind === 'savings' && <SavingsSheet cur={cur} month={month} row={savingsRow} typical={typicalSaved}
        onClose={() => setSheet(null)} onSaved={(rows, removed) => { setBudgets(prev => merge(prev, rows, removed)); setSheet(null) }} />}
      {sheet?.kind === 'person' && <PersonSheet cur={cur} month={month} members={memberOpts} row={sheet.row}
        onClose={() => setSheet(null)} onSaved={(rows, removed) => { setBudgets(prev => merge(prev, rows, removed)); setSheet(null) }} />}
      {sheet?.kind === 'fund' && <FundSheet cur={cur} fund={sheet.fund} cats={planCats}
        onClose={() => setSheet(null)} onSaved={(f, removedId) => {
          setFunds(prev => removedId ? prev.filter(x => x.id !== removedId) : prev.some(x => x.id === f!.id) ? prev.map(x => x.id === f!.id ? f! : x) : [...prev, f!]); setSheet(null)
        }} />}
      {sheet?.kind === 'plan' && <PlanNextSheet cur={cur} txns={transactions} budgets={budgets} month={month} lines={lines}
        onClose={() => setSheet(null)} onSaved={rows => { setBudgets(prev => merge(prev, rows)); setSheet(null) }} />}
    </div>
  )
}
