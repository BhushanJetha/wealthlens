'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft, Edit2, Plus, CalendarDays, PiggyBank, Repeat, Trash2, Pause, Play, CheckCircle2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { fmtMoney, fmtCompact } from '@/lib/format'
import { fmtDay, localToday } from '@/lib/insights'
import { REPEAT, PRIORITY, kindInfo, type Cur } from '@/lib/goals'
import { addMonths } from '@/lib/budgets'
import { occasionOf } from '@/lib/occasions'
import { datesAhead, prevDueDate, spendCategories, setAside, REC_STATUS } from '@/lib/recurringGoals'
import { isSpend, catOf } from '@/lib/money'
import type { GoalItem } from '@/lib/goalsView'
import type { GoalsData } from '@/lib/goalsData'
import { InsightBar, KpiTile, KpiGrid, Panel } from '@/components/ui/kit'
import AddGoalModal from '@/components/forms/AddGoalModal'
import { AddMoneySheet, RollSheet } from './GoalSheets'

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export const repeatLabel = (g: any) => REPEAT[Number(g.repeat_months)] ?? `Every ${g.repeat_months} months`
export const whenLabel = (days: number) => days < 0 ? `${-days} day${days === -1 ? '' : 's'} ago` : days === 0 ? 'today' : days === 1 ? 'tomorrow'
  : days <= 60 ? `in ${days} days` : `in ${Math.round(days / 30.4)} months`
export const iconOf = (it: GoalItem) => (it.goal.icon && it.goal.icon !== '🎯' ? it.goal.icon : kindInfo(it.kind).icon)

// The next 12 months at a glance: which festivals and payments fall when, and
// the biggest month — so it can be saved for, not paid from one salary
export function YearStrip({ items, today, fx }: { items: GoalItem[]; today: string; fx: number }) {
  const months = Array.from({ length: 12 }, (_, i) => addMonths(today.slice(0, 7), i))
  const by: Record<string, { it: GoalItem; date: string }[]> = {}
  for (const it of items) if (it.goal.status !== 'paused') for (const d of datesAhead(it.goal, today)) (by[d.slice(0, 7)] ??= []).push({ it, date: d })
  const sum = (m: string, c: Cur) => (by[m] ?? []).filter(x => x.it.goal.currency === c).reduce((s, x) => s + (Number(x.it.goal.target_amount) || 0), 0)
  const inInr = (m: string) => sum(m, 'INR') + sum(m, 'AED') * fx
  const big = months.filter(m => inInr(m) > 0).sort((a, b) => inInr(b) - inInr(a))[0]
  const total = (c: Cur) => months.reduce((s, m) => s + sum(m, c), 0)
  const totals = (['INR', 'AED'] as Cur[]).filter(c => total(c) > 0).map(c => fmtCompact(total(c), c)).join(' · ')
  if (!totals) return null
  return (
    <section className="wl-card px-4 md:px-5 py-4" aria-label="Your year ahead">
      <div className="flex items-baseline justify-between gap-2 flex-wrap">
        <h2 className="text-[14px] md:text-[15px] font-semibold flex items-center gap-1.5" style={{ color: 'var(--text)' }}><CalendarDays size={15} style={{ color: 'var(--accent)' }} />Your year ahead</h2>
        <span className="text-[11.5px]" style={{ color: 'var(--text4)' }}>{totals} over the next 12 months</span>
      </div>
      <div className="mt-3 flex md:grid md:grid-cols-12 gap-1.5 overflow-x-auto no-scrollbar max-md:-mx-4 max-md:px-4">
        {months.map((m, i) => {
          const xs = by[m] ?? [], [y, mo] = m.split('-')
          return (
            <div key={m} title={xs.map(x => `${x.it.goal.name} · ${fmtDay(x.date)} · ${fmtMoney(Number(x.it.goal.target_amount), x.it.goal.currency)}`).join('\n') || undefined}
              className="flex-shrink-0 w-[66px] md:w-auto rounded-xl px-1 py-2 flex flex-col items-center gap-1 text-center"
              style={{ background: xs.length ? 'var(--accent-bg)' : 'var(--bg2)', border: m === big ? '1.5px solid #F29A2E' : '1.5px solid transparent' }}>
              <span className="text-[11px] font-semibold" style={{ color: xs.length ? 'var(--accent2)' : 'var(--text4)' }}>{MON[Number(mo) - 1]}{i === 0 || mo === '01' ? ` ’${y.slice(2)}` : ''}</span>
              <span className="text-[15px] leading-none h-[17px] whitespace-nowrap" aria-hidden>{xs.slice(0, 2).map(x => iconOf(x.it)).join('')}{xs.length > 2 ? <span className="text-[10px] font-semibold align-top" style={{ color: 'var(--text3)' }}>+{xs.length - 2}</span> : null}</span>
              <span className="text-[10.5px] font-semibold tabular-nums leading-tight" style={{ color: 'var(--text)' }}>
                {(['INR', 'AED'] as Cur[]).filter(c => sum(m, c) > 0).map(c => <span key={c} className="block">{fmtCompact(sum(m, c), c)}</span>)}
                {!xs.length && <span style={{ color: 'var(--text4)' }}>—</span>}
              </span>
            </div>
          )
        })}
      </div>
      {big && <p className="text-[11.5px] mt-2.5 leading-snug" style={{ color: 'var(--text3)' }}>
        <b style={{ color: 'var(--text2)' }}>{MON[Number(big.slice(5, 7)) - 1]} is your biggest month</b> — {(by[big] ?? []).map(x => x.it.goal.name).join(', ')}. A little set aside every month means it never lands on one salary.
      </p>}
    </section>
  )
}

// One recurring goal's page: this round (set aside, then "spent it — start
// next"), the dates coming up, what it cost last time, and its history
export function RecurringDetail({ it, data, today }: { it: GoalItem; data: GoalsData; today: string }) {
  const router = useRouter()
  const [sheet, setSheet] = useState<null | 'edit' | 'money' | 'roll'>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const g = it.goal, r = it.rec!, cur: Cur = g.currency === 'AED' ? 'AED' : 'INR'
  const info = kindInfo(it.kind), st = REC_STATUS[r.status], target = Number(g.target_amount) || 0
  const money = (n: number) => fmtMoney(n, cur), short = (n: number) => fmtCompact(n, cur)
  const contributions = data.contributions.filter(c => c.goal_id === g.id)
  const occ = occasionOf(g.occasion)
  const ahead = datesAhead(g, today).slice(0, 4)
  const prev = prevDueDate(g)
  const lastSpent = g.spend_category ? data.transactions.filter(t => isSpend(t) && t.currency === cur && catOf(t) === g.spend_category && String(t.txn_date).slice(0, 7) === prev.slice(0, 7))
    .reduce((s, t) => s + (Number(t.amount) || 0), 0) : 0
  const step = cur === 'AED' ? 100 : 1000, planned = Math.ceil(lastSpent / step) * step
  const account = g.account_id ? data.accounts.find(a => a.id === g.account_id) : null
  const roll = r.status === 'passed' || r.status === 'ready'

  async function run(fn: () => PromiseLike<{ error: any }>) {
    setBusy(true); setError('')
    const { error } = await fn()
    setBusy(false)
    if (error) setError(error.message); else router.refresh()
  }
  const supabase = createClient()
  const putAside = () => run(async () => { const { data: { user } } = await supabase.auth.getUser(); return setAside(supabase, user!.id, [{ goal: g, amount: r.monthly }], localToday()) })
  const update = (patch: Record<string, any>) => run(() => supabase.from('goals').update(patch).eq('id', g.id))
  const deleteContribution = (id: string) => run(() => supabase.from('goal_contributions').delete().eq('id', id))

  const insight = r.status === 'paused' ? 'Paused — it’s left out of your monthly set-asides and the funding plan.'
    : r.status === 'passed' ? `${fmtDay(r.due)} has passed. Record what you spent and it starts saving for ${fmtDay(r.next)} ${r.next.slice(0, 4)} — anything left over stays in.`
    : r.status === 'ready' ? `All ${money(target)} is there for ${fmtDay(r.due)} 🎉 Spend it without touching your regular money; afterwards tap “Spent it” to start the next one.`
    : r.status === 'short' ? `${fmtDay(r.due)} is ${whenLabel(r.days)} and ${money(r.left)} is still to set aside${r.doneThisMonth ? '' : ' — put it in now'}.`
    : r.status === 'done' ? `${money(r.thisMonth)} set aside this month. ${money(r.monthly)} a month, ${r.slots} more time${r.slots === 1 ? '' : 's'}, and it’s all there by ${fmtDay(r.due)}.`
    : `Set aside ${money(r.monthly)} this month${r.slots > 1 ? ` and for ${r.slots - 1} more month${r.slots === 2 ? '' : 's'}` : ''} and the ${money(target)} is ready by ${fmtDay(r.due)}.`
  const ctx = `Recurring goal "${g.name}" (${repeatLabel(g)}, ${info.label}): ${money(r.saved)} put aside of ${money(target)} for ${r.due}; needs ${money(r.monthly)} a month for ${r.slots} months; ${Number(g.cycles_done) || 0} rounds done.${lastSpent ? ` Last time spent ${money(lastSpent)} on ${g.spend_category}.` : ''}`
  const chip = (text: React.ReactNode, style: React.CSSProperties = { background: '#F1F5F9', color: 'var(--text2)' }) => <span className="rounded-full px-2.5 py-[3px] text-[11px] font-semibold" style={style}>{text}</span>
  const primary = roll ? <button onClick={() => setSheet('roll')} className="wl-btn wl-btn-primary" style={{ height: 34 }}><CheckCircle2 size={14} />Spent it — start next</button>
    : r.status === 'paused' ? <button onClick={() => update({ status: 'active' })} disabled={busy} className="wl-btn wl-btn-primary" style={{ height: 34 }}><Play size={13} />Resume</button>
    : r.doneThisMonth && r.status !== 'short' ? <button onClick={() => setSheet('money')} className="wl-btn wl-btn-primary" style={{ height: 34 }}><Plus size={14} />Add money</button>
    : <button onClick={putAside} disabled={busy || r.monthly <= 0} className="wl-btn wl-btn-primary disabled:opacity-60" style={{ height: 34 }}><PiggyBank size={14} />Set aside {short(r.monthly)}</button>

  return (
    <div className="flex flex-col gap-3.5 md:gap-[18px] animate-fade-up">
      <Link href="/dashboard/goals" className="flex items-center gap-1 text-[12px] font-medium self-start" style={{ color: 'var(--text3)' }}><ChevronLeft size={14} />Goals</Link>

      <section className="wl-card px-4 md:px-6 py-4 md:py-5" style={{ background: `linear-gradient(135deg, ${info.color}0F 0%, #fff 55%)` }}>
        <div className="flex items-start gap-3.5">
          <span className="w-12 h-12 md:w-14 md:h-14 rounded-2xl flex items-center justify-center text-[24px] flex-shrink-0" style={{ background: info.color + '1F' }}>{iconOf(it)}</span>
          <div className="flex-1 min-w-0">
            <h1 className="text-[21px] md:text-[24px] font-bold tracking-[-0.01em]" style={{ color: 'var(--text)' }}>{g.name}</h1>
            {g.description && <p className="text-[12.5px] mt-0.5" style={{ color: 'var(--text3)' }}>{g.description}</p>}
            <div className="flex flex-wrap gap-1.5 mt-2">
              {chip(<><Repeat size={10} className="inline -mt-px mr-1" />{repeatLabel(g)}</>, { background: 'var(--accent-bg)', color: 'var(--accent2)' })}
              {chip(st.label, { background: st.bg, color: st.c })}
              {chip(info.label, { background: info.color + '1A', color: info.color })}
              {chip(PRIORITY[Number(g.priority ?? 2)])}
              {g.holder_name && chip(`For ${g.holder_name === 'Self' ? 'you' : g.holder_name}`)}
              {chip(`Next ${fmtDay(r.due)} ${r.due.slice(0, 4)} · ${whenLabel(r.days)}`)}
            </div>
          </div>
          <div className="hidden md:flex gap-2 flex-shrink-0">
            {primary}
            <button onClick={() => setSheet('edit')} className="wl-btn" style={{ height: 34 }}><Edit2 size={13} />Edit</button>
          </div>
        </div>
        <div className="mt-4">
          <div className="flex justify-between items-baseline gap-2">
            <span className="text-[24px] md:text-[28px] font-bold tabular-nums" style={{ color: 'var(--text)' }}>{money(r.saved)}</span>
            <span className="text-[12.5px]" style={{ color: 'var(--text3)' }}>of {money(target)} for {fmtDay(r.due)}</span>
          </div>
          <div className="h-3 rounded-full mt-2" style={{ background: 'var(--track)' }} role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(r.pct)} aria-label="Put aside so far">
            <div className="h-full rounded-full wl-grow" style={{ width: `${r.pct}%`, background: r.status === 'ready' ? 'var(--pos)' : info.color }} />
          </div>
        </div>
        <div className="md:hidden flex gap-2 mt-3 [&>button]:flex-1">
          {primary}
          <button onClick={() => setSheet('edit')} className="wl-btn" style={{ height: 34 }}><Edit2 size={13} />Edit</button>
        </div>
      </section>

      <InsightBar text={insight} prompt={`Help me plan this recurring cost. ${ctx}`} />
      {error && <div className="rounded-xl px-4 py-2.5 text-[12.5px]" style={{ background: '#FDECE8', color: '#B4231A' }}>{error}</div>}

      <KpiGrid>
        <KpiTile label="Put aside" value={short(r.saved)} tint={0} icon={PiggyBank} delta={`${Math.round(r.pct)}% of ${short(target)}`} />
        <KpiTile label="Set aside a month" value={r.monthly > 0 ? short(r.monthly) : '—'} tint={2} icon={Plus}
          delta={r.left <= 0 ? 'All there' : r.doneThisMonth ? `✓ ${short(r.thisMonth)} this month · ${r.slots} more` : `${r.slots} time${r.slots === 1 ? '' : 's'} before the date`} />
        <KpiTile label="Next date" value={`${fmtDay(r.due)}`} tint={3} icon={CalendarDays} tone={r.status === 'short' || r.status === 'passed' ? 'bad' : 'neutral'} delta={whenLabel(r.days)} />
        <KpiTile label="Rounds done" value={String(Number(g.cycles_done) || 0)} tint={1} icon={Repeat} delta={repeatLabel(g)} />
      </KpiGrid>

      <div className="grid grid-cols-1 lg:grid-cols-[1.3fr_1fr] gap-3.5 md:gap-4 items-start">
        <div className="flex flex-col gap-3.5 md:gap-4 min-w-0">
          <Panel title="How it works">
            <ol className="mt-2 flex flex-col gap-2 text-[12.5px] leading-snug" style={{ color: 'var(--text2)' }}>
              {[
                [`Each month`, r.left > 0 ? `set aside ${money(r.monthly)}${account ? ` in ${account.name}` : ' — tap “Set aside” when you move it to savings'}. Goals reminds you.` : 'nothing more to do — it’s all there.'],
                [`On ${fmtDay(r.due)}`, `spend it — that’s what it’s for${g.spend_category ? `. That month, what you’ve put aside is added to your ${g.spend_category} budget` : ''}.`],
                ['After', `tap “Spent it — start next”. Anything left over stays, and it starts saving for ${fmtDay(r.next)} ${r.next.slice(0, 4)}${occ?.next(r.due) ? ' (the date comes from the calendar)' : ''}.`],
              ].map(([k, v], i) => (
                <li key={i} className="flex gap-2.5 rounded-lg px-3 py-2" style={{ background: 'var(--bg2)' }}>
                  <span className="w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0" style={{ background: info.color + '24', color: info.color }}>{i + 1}</span>
                  <span><b style={{ color: 'var(--text)' }}>{k}</b> {v}</span>
                </li>
              ))}
            </ol>
            <div className="flex gap-2 mt-3 flex-wrap">
              <button onClick={() => setSheet('money')} className="wl-btn" style={{ height: 34 }}><Plus size={13} />Add another amount</button>
              {!roll && <button onClick={() => setSheet('roll')} className="wl-btn" style={{ height: 34 }}><CheckCircle2 size={13} />Spent it early</button>}
              <button onClick={() => update({ status: g.status === 'paused' ? 'active' : 'paused' })} disabled={busy} className="wl-btn" style={{ height: 34 }}>
                {g.status === 'paused' ? <><Play size={13} />Resume</> : <><Pause size={13} />Pause</>}
              </button>
            </div>
          </Panel>

          <Panel title="History" right={<button onClick={() => setSheet('money')} className="text-[12px] font-semibold flex items-center gap-1" style={{ color: 'var(--accent)' }}><Plus size={13} />Add</button>}>
            {!data.contributionsReady ? <p className="text-[12.5px] mt-2" style={{ color: 'var(--text3)' }}>Run migration 030 in Supabase to put money aside for goals.</p>
              : contributions.length === 0 ? <p className="text-[12.5px] mt-2" style={{ color: 'var(--text3)' }}>Nothing set aside yet. Each “Set aside” and each finished round shows here.</p> : (
              <ul className="mt-2">
                {contributions.slice(0, 24).map(c => (
                  <li key={c.id} className="flex items-center gap-3 py-2 text-[13px]" style={{ borderTop: '1px solid var(--track)' }}>
                    <span className="flex-1 min-w-0 truncate" style={{ color: 'var(--text2)' }}>{fmtDay(c.contrib_date)} {String(c.contrib_date).slice(0, 4)}{c.note ? ` · ${c.note}` : ''}</span>
                    <span className="font-semibold tabular-nums" style={{ color: Number(c.amount) < 0 ? '#DC2626' : 'var(--pos-text)' }}>{Number(c.amount) < 0 ? '−' : '+'}{money(Math.abs(Number(c.amount)))}</span>
                    <button onClick={() => deleteContribution(c.id)} disabled={busy} aria-label="Delete entry" className="p-1 rounded-md hover:bg-[var(--rose-bg)]" style={{ color: 'var(--text4)' }}><Trash2 size={12} /></button>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        <div className="flex flex-col gap-3.5 md:gap-4">
          <Panel title="Coming up">
            <ul className="mt-2">
              {ahead.map((d, i) => (
                <li key={d} className="flex justify-between gap-3 py-2 text-[13px]" style={{ borderTop: i ? '1px solid var(--track)' : undefined }}>
                  <span style={{ color: 'var(--text)' }}>{fmtDay(d)} {d.slice(0, 4)} <span style={{ color: 'var(--text4)' }}>· {whenLabel(Math.round((Date.parse(d) - Date.parse(today)) / 864e5))}</span></span>
                  <span className="font-semibold tabular-nums">{money(target)}</span>
                </li>
              ))}
              {!ahead.length && <li className="text-[12.5px] py-1" style={{ color: 'var(--text3)' }}>Next: {fmtDay(r.next)} {r.next.slice(0, 4)}</li>}
            </ul>
          </Panel>
          {g.spend_category && (
            <Panel title="Last time">
              <p className="text-[12.5px] mt-2 leading-snug" style={{ color: 'var(--text2)' }}>
                {lastSpent > 0 ? <>In {MON[Number(prev.slice(5, 7)) - 1]} {prev.slice(0, 4)} you spent <b style={{ color: 'var(--text)' }}>{money(lastSpent)}</b> on {g.spend_category.toLowerCase()} — the whole month, not just this.</>
                  : <>No {g.spend_category.toLowerCase()} spending recorded in {MON[Number(prev.slice(5, 7)) - 1]} {prev.slice(0, 4)}.</>}
              </p>
              {planned > target * 1.1 && <button onClick={() => update({ target_amount: planned })} disabled={busy} className="wl-chip mt-2" style={{ height: 28 }}>Plan {short(planned)} this time</button>}
            </Panel>
          )}
          {account && <Panel title="Kept in"><p className="text-[12.5px] mt-2" style={{ color: 'var(--text2)' }}>🏦 {account.name} · {money(it.v.account)} counts towards it.</p></Panel>}
        </div>
      </div>

      {sheet === 'edit' && <AddGoalModal editData={g} accounts={data.accounts} members={data.members} categories={spendCategories(data.transactions)} onClose={() => setSheet(null)} />}
      {sheet === 'money' && <AddMoneySheet goal={g} amount={r.monthly || undefined} onClose={() => setSheet(null)} onSaved={() => { setSheet(null); router.refresh() }} />}
      {sheet === 'roll' && <RollSheet goal={g} value={r.saved} onClose={() => setSheet(null)} onSaved={() => { setSheet(null); router.refresh() }} />}
    </div>
  )
}
