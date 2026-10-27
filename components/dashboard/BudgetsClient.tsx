'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { Plus, Sparkles, Pencil, Lock, Unlock, Trash2, Wallet, Target, TrendingUp, PiggyBank, BarChart2 } from 'lucide-react'
import { useViewStore } from '@/store/viewStore'
import { useCategoryStore } from '@/store/categoryStore'
import { createClient } from '@/lib/supabase/client'
import { colorOf as catColorOf } from '@/lib/categories'
import { fmtMoney, fmtCompact } from '@/lib/format'
import { prepareMoney, isIncome, spendGroup, SPEND_GROUPS, type SpendGroup } from '@/lib/money'
import { addMonths, daysInMonth, localToday, ymOf } from '@/lib/insights'
import { viewAmount } from '@/lib/netWorth'
import { spendByCategory, budgetLines, budgetLabel, planMonthBudgets, NOT_PLANABLE, FIXED, type BudgetLine } from '@/lib/budgets'
import { PageHeader, InsightBar, AiActions, KpiTile, KpiGrid, Panel, Ring, LearnStrip, MoreLink } from '@/components/ui/kit'
import { ChipFilter } from '@/components/ui/list'
import { CategoryIcon } from '@/components/ui/CategoryIcon'
import { BudgetSheet, SuggestSheet, writeBudget } from './BudgetSheets'

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const STATUS = {
  over: { label: 'Over', color: '#DC2626', bg: '#FEF2F2' },
  near: { label: 'Near limit', color: '#D97706', bg: '#FFF7E6' },
  ok:   { label: 'On track', color: '#16A34A', bg: '#E7F7EF' },
} as const
const monLabel = (m: string) => `${MON[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`
// Budgets that a money-out group covers (Sent home is a move, shown with family)
const groupOf = (c: string): SpendGroup => spendGroup({ txn_type: c === 'EMI/Loan' ? 'loan' : 'expense', category: c }) ?? 'sent'
// This device's memory of what the automatic budgets may add this month
const seedKey = (cur: string, m: string) => `wl-budget-seeded-${cur}-${m}`
const deletedKey = (cur: string, cat: string, m: string) => `wl-budget-deleted-${cur}-${cat}-${m}`
const flag = (k: string) => { try { return !!localStorage.getItem(k) } catch { return false } }
const setFlag = (k: string) => { try { localStorage.setItem(k, '1') } catch {} }

// Budgets (design v2): what's left this month and the daily pace, every
// category on one line (AED and ₹ caps together), how the budget splits your
// income, and how each month went. Spending follows lib/money, like Spending
// analysis; caps can adjust themselves (lib/budgets) or stay fixed.
export default function BudgetsClient({ today: serverToday, budgets: initial, transactions }: { today: string; budgets: any[]; transactions: any[] }) {
  const { view, toMonth, fxRate: FX } = useViewStore()
  const { rows: categories, load: loadCategories } = useCategoryStore()
  useEffect(() => { loadCategories() }, [loadCategories])
  const [today, setToday] = useState(serverToday)
  useEffect(() => { setToday(localToday()) }, [])
  const [budgets, setBudgets] = useState<any[]>(initial)
  useEffect(() => setBudgets(initial), [initial])
  const [filter, setFilter] = useState<'all' | 'over' | 'near' | 'ok'>('all')
  const [sheet, setSheet] = useState<{ line: BudgetLine | null } | null>(null)
  const [suggest, setSuggest] = useState(false)
  const [error, setError] = useState('')

  const cur = view === 'uae' ? 'AED' : 'INR'
  const money = (n: number) => fmtMoney(n, cur)
  const short = (n: number) => fmtCompact(n, cur)
  const thisMonth = today.slice(0, 7)
  const month = toMonth > thisMonth ? thisMonth : toMonth
  const isCurrent = month === thisMonth
  const dim = daysInMonth(month)
  const day = isCurrent ? Number(today.slice(8, 10)) : dim
  const daysLeft = isCurrent ? dim - day : 0
  const timePct = day / dim * 100

  const merge = (prev: any[], saved: any[], removed: string[] = []) => {
    const next = prev.filter(b => !removed.includes(b.id))
    for (const nb of saved) { const i = next.findIndex(b => b.id === nb.id); if (i >= 0) next[i] = nb; else next.push(nb) }
    return next
  }

  // Keep this month's budgets right (lib/budgets planMonthBudgets): once per visit
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
        const { data } = await writeBudget(supabase, { ...u, month_year: m })
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

  const spend = useMemo(() => spendByCategory(transactions, month, view, FX), [transactions, month, view, FX])
  const lines = useMemo(() => budgetLines(budgets, spend, month, view, FX), [budgets, spend, month, view, FX])
  const cap = lines.reduce((a, l) => a + l.cap, 0)
  const spent = lines.reduce((a, l) => a + l.spent, 0)
  const left = cap - spent
  const outside = Object.entries(spend).filter(([c]) => !lines.some(l => l.category === c) && !NOT_PLANABLE.has(c)).reduce((a, [, v]) => a + v, 0)
  const flex = lines.filter(l => !FIXED.has(l.category))
  const flexLeft = flex.reduce((a, l) => a + Math.max(l.left, 0), 0)
  const expectedNow = flex.reduce((a, l) => a + l.cap * day / dim, 0) + lines.filter(l => FIXED.has(l.category)).reduce((a, l) => a + l.spent, 0)
  // Month-end: fixed costs at their cap (or what was paid), flexible ones at today's pace
  const projected = !isCurrent ? spent : lines.reduce((a, l) => a + (FIXED.has(l.category) ? Math.max(l.spent, l.cap) : day > 0 ? l.spent / day * dim : l.spent), 0)
  const usedPct = cap > 0 ? spent / cap * 100 : 0
  const counts = { over: lines.filter(l => l.status === 'over').length, near: lines.filter(l => l.status === 'near').length, ok: lines.filter(l => l.status === 'ok').length }
  const shown = lines.filter(l => filter === 'all' || l.status === filter)

  // Income to plan against: average of the last 6 complete months that had income
  const income = useMemo(() => {
    const rows = prepareMoney(transactions, { fx: FX }).filter(t => isIncome(t, view))
    const by: Record<string, number> = {}
    for (const t of rows) {
      const m = ymOf(t.txn_date)
      if (m >= month || m < addMonths(month, -6)) continue
      by[m] = (by[m] ?? 0) + viewAmount(Number(t.amount) || 0, t.currency, view, FX)
    }
    const vals = Object.values(by).filter(v => v > 0)
    return { avg: vals.length ? vals.reduce((a, v) => a + v, 0) / vals.length : 0, months: vals.length }
  }, [transactions, FX, view, month])
  const groups = SPEND_GROUPS.map(g => ({ ...g, cap: lines.filter(l => groupOf(l.category) === g.key).reduce((a, l) => a + l.cap, 0) })).filter(g => g.cap > 0)
  const unplanned = income.avg - cap
  const investCap = groups.find(g => g.key === 'invest')?.cap ?? 0

  // Month by month: spending in today's budget categories, against that
  // month's own budget for them (where it had one)
  const history = useMemo(() => {
    const cats = new Set(lines.map(l => l.category))
    return Array.from({ length: 12 }, (_, i) => addMonths(month, i - 11)).map(m => {
      const sp = spendByCategory(transactions, m, view, FX)
      const c = budgetLines(budgets, sp, m, view, FX).filter(l => cats.has(l.category)).reduce((a, l) => a + l.cap, 0)
      return { m, cap: c, spent: Array.from(cats).reduce((a, k) => a + (sp[k] ?? 0), 0), budgeted: c > 0 }
    })
  }, [transactions, budgets, month, view, FX, lines])
  const histMax = Math.max(1, ...history.map(h => Math.max(h.cap, h.spent)))

  // Category × month (last 6), tinted against that month's own cap
  const grid = useMemo(() => {
    const months = Array.from({ length: 6 }, (_, i) => addMonths(month, i - 5))
    const per = months.map(m => ({ m, sp: spendByCategory(transactions, m, view, FX), ls: budgetLines(budgets, {}, m, view, FX) }))
    const cats = Array.from(new Set([...lines.map(l => l.category), ...Object.entries(spend).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([c]) => c)]))
      .filter(c => !NOT_PLANABLE.has(c))
    return { months, cats, cell: (c: string, i: number) => ({ v: per[i].sp[c] ?? 0, cap: per[i].ls.find(l => l.category === c)?.cap ?? 0 }) }
  }, [transactions, budgets, month, view, FX, lines, spend])

  async function toggleLock(l: BudgetLine) {
    setError('')
    const ids = l.rows.map(b => b.id)
    const { data, error } = await createClient().from('budgets').update({ is_manual: !l.manual }).in('id', ids).select()
    if (error) { setError(error.message); return }
    setBudgets(prev => merge(prev, data ?? []))
  }
  async function remove(l: BudgetLine) {
    setError('')
    const ids = l.rows.map(b => b.id)
    const { error } = await createClient().from('budgets').delete().in('id', ids)
    if (error) { setError(error.message); return }
    // Remembered so the automatic budgets don't bring it back this month
    for (const b of l.rows) setFlag(deletedKey(b.currency || 'INR', l.category, month))
    setBudgets(prev => merge(prev, [], ids))
  }

  const viewLabel = view === 'uae' ? 'UAE · AED' : view === 'india' ? 'India · INR' : 'All · in ₹'
  const insight = lines.length === 0
    ? 'No budgets yet. Tap “Suggest budgets” to start from your last 3 months, or add your own.'
    : [
        left >= 0
          ? `${short(left)} left of ${short(cap)}${isCurrent && daysLeft > 0 ? ` with ${daysLeft} day${daysLeft === 1 ? '' : 's'} to go — about ${short(flexLeft / Math.max(daysLeft, 1))} a day for flexible spending` : ''}.`
          : `${short(-left)} over your ${short(cap)} budget${isCurrent ? ` with ${daysLeft} days to go` : ''}.`,
        counts.over ? `${lines.filter(l => l.status === 'over').slice(0, 3).map(l => budgetLabel(l.category)).join(', ')} ${counts.over === 1 ? 'is' : 'are'} over.` : 'No category is over.',
        isCurrent && cap > 0 ? `At this pace you'll finish near ${short(projected)}.` : '',
      ].filter(Boolean).join(' ')
  const ctx = `Budgets for ${monLabel(month)} (${view}): ${short(spent)} spent of ${short(cap)}, day ${day} of ${dim}. `
    + lines.map(l => `${budgetLabel(l.category)} ${Math.round(l.spent)} of ${Math.round(l.cap)}`).join(', ') + `. Average income ${short(income.avg)}.`

  return (
    <div className="flex flex-col gap-3.5 md:gap-[18px] animate-fade-up">
      <PageHeader title="Budgets" sub={`${monLabel(month)} · ${viewLabel}${isCurrent ? ` · day ${day} of ${dim}` : ''}`}
        onAdd={() => setSheet({ line: null })} addLabel="Add budget"
        actions={<>
          <Link href="/dashboard/analysis" className="wl-btn" style={{ height: 34 }}><BarChart2 size={14} />Spending analysis</Link>
          <button onClick={() => setSuggest(true)} className="wl-btn" style={{ height: 34 }}><Sparkles size={14} />Suggest budgets</button>
          <button onClick={() => setSheet({ line: null })} className="wl-btn wl-btn-primary" style={{ height: 34 }}><Plus size={14} />Add budget</button>
        </>} />

      <InsightBar text={insight} prompt={`Explain my budgets in plain language and tell me what to change. ${ctx}`} />
      <AiActions actions={['Where can I cut back?', 'Plan next month’s budget']} context={ctx} />

      {/* Left to spend + status */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-3.5 md:gap-4">
        <section className="wl-card px-4 md:px-6 py-4 md:py-5 flex flex-col">
          <div className="flex justify-between items-start gap-3">
            <div>
              <div className="text-[10.5px] md:text-[11px] font-semibold uppercase tracking-[0.05em]" style={{ color: 'var(--text3)' }}>{left >= 0 ? 'Left to spend' : 'Over budget'}</div>
              <div className="text-[30px] md:text-[34px] font-bold tabular-nums tracking-[-0.02em] leading-tight" style={{ color: left < 0 ? '#DC2626' : 'var(--text)' }}>{money(Math.abs(left))}</div>
              <div className="text-[12.5px] font-medium" style={{ color: left < 0 ? '#DC2626' : 'var(--income)' }}>
                {cap === 0 ? 'No budgets yet' : isCurrent && daysLeft > 0 ? `About ${short(flexLeft / daysLeft)} a day for ${daysLeft} day${daysLeft === 1 ? '' : 's'} (flexible budgets)` : isCurrent ? 'Last day of the month' : 'Month closed'}
              </div>
            </div>
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
              Plus {money(outside)} in categories without a budget — <button onClick={() => setSuggest(true)} className="font-semibold" style={{ color: 'var(--accent)' }}>add budgets</button></div>}
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
                className="flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-[12.5px] transition-colors"
                style={{ background: filter === k ? STATUS[k].bg : 'transparent' }}>
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
        <KpiTile label="Not planned" value={income.avg > 0 ? short(Math.max(unplanned, 0)) : '—'} tint={1} icon={PiggyBank}
          tone={unplanned < 0 ? 'bad' : 'good'} delta={income.avg > 0 ? (unplanned >= 0 ? `${Math.round(unplanned / income.avg * 100)}% of income left to save` : `Budgets are ${short(-unplanned)} above income`) : 'No income recorded yet'} />
      </KpiGrid>

      {error && <div className="rounded-xl px-4 py-2.5 text-[12.5px]" style={{ background: '#FDECE8', color: '#B4231A' }}>{error}</div>}

      {/* Category budgets */}
      <section className="wl-card overflow-hidden">
        <div className="px-4 md:px-5 pt-3.5 md:pt-[18px] pb-2.5 flex flex-col gap-2.5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-[14px] md:text-[15px] font-semibold" style={{ color: 'var(--text)' }}>Your budgets</h2>
            <span className="text-[11.5px] hidden md:inline" style={{ color: 'var(--text4)' }}>Auto = adjusts each month · <Lock size={10} className="inline -mt-0.5" /> = fixed amount</span>
          </div>
          {lines.length > 0 && <ChipFilter label="Show" value={filter} onChange={k => setFilter(k as any)}
            options={[{ key: 'all', label: 'All', count: lines.length }, { key: 'over', label: 'Over', count: counts.over, warn: counts.over > 0 }, { key: 'near', label: 'Near limit', count: counts.near }, { key: 'ok', label: 'On track', count: counts.ok }]} />}
        </div>
        {lines.length === 0 ? (
          <div className="px-5 pb-8 pt-4 text-center flex flex-col items-center gap-3">
            <div className="text-[13px] max-w-md" style={{ color: 'var(--text3)' }}>No budgets for {monLabel(month)}. Start from what you actually spend — suggestions use your last 3 months.</div>
            <div className="flex gap-2">
              <button onClick={() => setSuggest(true)} className="wl-btn wl-btn-primary" style={{ height: 36 }}><Sparkles size={14} />Suggest budgets</button>
              <button onClick={() => setSheet({ line: null })} className="wl-btn" style={{ height: 36 }}><Plus size={14} />Add one</button>
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
              const both = l.caps.AED != null && l.caps.INR != null
              return (
                <li key={l.category} className="group" style={{ borderTop: '1px solid var(--track)' }}>
                  <div className="flex items-center gap-3 px-4 md:px-5 py-3 cursor-pointer md:cursor-default hover:bg-[#FAFAFE] transition-colors"
                    onClick={() => { if (window.matchMedia('(max-width: 767px)').matches) setSheet({ line: l }) }}>
                    <span className="w-9 h-9 rounded-[11px] flex items-center justify-center flex-shrink-0" style={{ background: c + '1A', color: c }}><CategoryIcon icon={iconOf(l.category)} size={16} /></span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="flex items-center gap-1.5 min-w-0">
                          <span className="text-[13.5px] font-semibold truncate" style={{ color: 'var(--text)' }}>{budgetLabel(l.category)}</span>
                          {l.manual ? <Lock size={11} style={{ color: 'var(--text4)' }} aria-label="Fixed amount" className="flex-shrink-0" />
                            : <span className="text-[10px] font-semibold px-1.5 py-[1px] rounded-full flex-shrink-0" style={{ background: 'var(--accent-bg)', color: 'var(--accent2)' }}>Auto</span>}
                          {both && view === 'consolidated' && <span className="hidden sm:inline text-[10.5px] flex-shrink-0" style={{ color: 'var(--text4)' }}>AED {l.caps.AED!.toLocaleString('en-US')} + ₹{l.caps.INR!.toLocaleString('en-IN')}</span>}
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
                      <button onClick={() => setSheet({ line: l })} aria-label={`Edit ${budgetLabel(l.category)}`} title="Edit" className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[var(--accent-bg)]" style={{ color: 'var(--text3)' }}><Pencil size={14} /></button>
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
        {/* Income plan */}
        <Panel title="How your budget splits your income" right={income.months > 0 ? <span className="text-[11.5px]" style={{ color: 'var(--text4)' }}>avg of {income.months} month{income.months === 1 ? '' : 's'}</span> : undefined}>
          {income.avg <= 0 ? (
            <p className="text-[12.5px] mt-2" style={{ color: 'var(--text3)' }}>Add your income (salary, rent received…) to see how much of it your budgets plan for, and what's left to save.</p>
          ) : (<>
            <div className="text-[12.5px] mt-1.5" style={{ color: 'var(--text2)' }}>Average income <b style={{ color: 'var(--text)' }}>{money(income.avg)}</b> a month</div>
            <div className="flex h-3 rounded-full overflow-hidden gap-[2px] mt-3" role="img"
              aria-label={[...groups.map(g => `${g.label} ${Math.round(g.cap / income.avg * 100)}%`), unplanned > 0 ? `Not planned ${Math.round(unplanned / income.avg * 100)}%` : ''].join(', ')}>
              {groups.map(g => <div key={g.key} style={{ width: `${g.cap / Math.max(income.avg, cap) * 100}%`, background: g.color }} />)}
              {unplanned > 0 && <div style={{ width: `${unplanned / income.avg * 100}%`, background: '#D9F2E5' }} />}
            </div>
            <ul className="mt-3">
              {groups.map(g => (
                <li key={g.key} className="flex items-center gap-2.5 py-1.5 text-[12.5px]">
                  <i className="w-2.5 h-2.5 rounded-[3px]" style={{ background: g.color }} />
                  <span className="flex-1" style={{ color: 'var(--text2)' }}>{g.label}</span>
                  <span className="tabular-nums font-semibold" style={{ color: 'var(--text)' }}>{short(g.cap)}</span>
                  <span className="w-10 text-right tabular-nums" style={{ color: 'var(--text4)' }}>{Math.round(g.cap / income.avg * 100)}%</span>
                </li>
              ))}
              <li className="flex items-center gap-2.5 py-1.5 text-[12.5px]" style={{ borderTop: '1px solid var(--track)' }}>
                <i className="w-2.5 h-2.5 rounded-[3px]" style={{ background: unplanned >= 0 ? '#9ED9BC' : '#DC2626' }} />
                <span className="flex-1 font-semibold" style={{ color: 'var(--text)' }}>{unplanned >= 0 ? 'Not planned — left to save' : 'Planned beyond income'}</span>
                <span className="tabular-nums font-semibold" style={{ color: unplanned >= 0 ? 'var(--income)' : '#DC2626' }}>{short(Math.abs(unplanned))}</span>
                <span className="w-10 text-right tabular-nums" style={{ color: 'var(--text4)' }}>{Math.round(Math.abs(unplanned) / income.avg * 100)}%</span>
              </li>
            </ul>
            <p className="text-[11.5px] mt-2 leading-snug" style={{ color: 'var(--text4)' }}>
              Saving planned: {short(Math.max(unplanned, 0) + investCap)} ({Math.round((Math.max(unplanned, 0) + investCap) / income.avg * 100)}% of income) — what's not planned plus your investing budget. Investing counts as saving.
            </p>
          </>)}
        </Panel>

        {/* Month by month */}
        <Panel title="Month by month" right={<span className="text-[11.5px]" style={{ color: 'var(--text4)' }}>spent vs that month's budget</span>}>
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
            <h2 className="text-[14px] md:text-[15px] font-semibold" style={{ color: 'var(--text)' }}>Category by month</h2>
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
                    <td className="px-4 md:px-5 py-2">
                      <span className="flex items-center gap-2"><i className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: colorOf(c) }} /><span className="truncate" style={{ color: 'var(--text)' }}>{budgetLabel(c)}</span></span>
                    </td>
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

      {sheet && <BudgetSheet line={sheet.line} cats={planCats} txns={transactions} month={month} view={view} iconOf={iconOf} colorOf={colorOf}
        onClose={() => setSheet(null)} onSaved={(rows, removed) => {
          for (const b of budgets.filter(b => removed.includes(b.id))) setFlag(deletedKey(b.currency || 'INR', b.category, month))
          setBudgets(prev => merge(prev, rows, removed)); setSheet(null)
        }} />}
      {suggest && <SuggestSheet txns={transactions} budgets={budgets} month={month} view={view}
        onClose={() => setSuggest(false)} onSaved={rows => { setBudgets(prev => merge(prev, rows)); setSuggest(false) }} />}
    </div>
  )
}
