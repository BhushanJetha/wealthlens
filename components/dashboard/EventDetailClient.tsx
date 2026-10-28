'use client'
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronLeft, Edit2, Plus, Wallet, Flag, CalendarDays, ListChecks, X, CheckCircle2, Target } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { fmtMoney } from '@/lib/format'
import { fmtDay, localToday } from '@/lib/insights'
import { labelOf } from '@/lib/money'
import { eventKind, eventStats, eventSuggestions } from '@/lib/events'
import type { EventsData } from '@/lib/eventsData'
import { InsightBar, KpiTile, KpiGrid, Panel, ProgressRow, Bars } from '@/components/ui/kit'
import EventSheet from '@/components/forms/EventSheet'
import AddTransactionModal from '@/components/forms/AddTransactionModal'
import AddGoalModal from '@/components/forms/AddGoalModal'

const PERSON = (n: string) => (n === 'Self' ? 'Me' : n)

// One trip or event (design v2): what it cost against its own budget, by
// category, person and day; spending in its dates to tag in one tap; its
// expenses; and a wrap-up that closes it and plans next time.
export default function EventDetailClient({ id, data }: { id: string; data: EventsData }) {
  const router = useRouter()
  const today = localToday()
  const ev = data.events.find(e => e.id === id)!
  const k = eventKind(ev.kind), cur = ev.currency === 'AED' ? 'AED' : 'INR'
  const s = useMemo(() => eventStats(ev, data.txns, data.fx, today), [ev, data, today])
  const sugg = useMemo(() => eventSuggestions(ev, data.txns), [ev, data.txns])
  const [pick, setPick] = useState<Set<string>>(() => new Set(sugg.filter(t => t.txn_date >= ev.start_date).map(t => t.id)))
  const [sheet, setSheet] = useState<null | 'edit' | 'add' | 'goal'>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const money = (n: number) => fmtMoney(n, cur)
  const goal = ev.goal_id ? data.goals.find(g => g.id === ev.goal_id) : null
  const conv = (t: any) => (t.currency === cur ? Number(t.amount) : cur === 'INR' ? Number(t.amount) * data.fx : Number(t.amount) / data.fx)

  async function run(fn: () => PromiseLike<{ error: any }>) {
    setBusy(true); setError('')
    const { error } = await fn()
    setBusy(false)
    if (error) setError(/event_id|spend_events/.test(error.message) ? 'Run migration 034 in Supabase to tag expenses.' : error.message); else router.refresh()
  }
  const supabase = createClient()
  const tag = (ids: string[]) => run(() => supabase.from('transactions').update({ event_id: ev.id }).in('id', ids))
  const untag = (tid: string) => run(() => supabase.from('transactions').update({ event_id: null }).eq('id', tid))
  const wrapUp = () => run(() => supabase.from('spend_events').update({ closed_at: today }).eq('id', ev.id))
  const reopen = () => run(() => supabase.from('spend_events').update({ closed_at: null }).eq('id', ev.id))

  const repeatsYearly = ev.kind === 'trip' || ev.kind === 'festival'
  const nextYear = `${Number(String(ev.start_date).slice(0, 4)) + 1}${String(ev.start_date).slice(4)}`
  const step = cur === 'AED' ? 100 : 1000, planAmount = Math.ceil(s.spent / step) * step
  const insight = s.status === 'upcoming' ? `Starts ${fmtDay(ev.start_date)}. ${s.budget ? `Budget ${money(s.budget)} — about ${money(s.budget / s.days)} a day.` : 'Set a budget so you can see how it’s going while you’re there.'} Book flights or tickets now? Tag them here too.`
    : s.status === 'live' ? `Day ${s.dayNo} of ${s.days}: ${money(s.spent)} spent${s.budget ? ` of ${money(s.budget)}${s.perDayLeft != null ? ` — ${money(s.perDayLeft)} a day left` : ''}` : ''}. New expenses in these dates are tagged here by themselves.`
    : `${money(s.spent)} in all${s.budget ? ` — ${s.left >= 0 ? `${money(s.left)} under` : `${money(-s.left)} over`} budget (${Math.round(s.pct ?? 0)}%)` : ''}${s.byCategory[0] ? `; most on ${labelOf(s.byCategory[0].name).toLowerCase()} (${money(s.byCategory[0].value)})` : ''}.`

  return (
    <div className="flex flex-col gap-3.5 md:gap-[18px] animate-fade-up">
      <Link href="/dashboard/events" className="flex items-center gap-1 text-[12px] font-medium self-start" style={{ color: 'var(--text3)' }}><ChevronLeft size={14} />Events & trips</Link>
      <section className="wl-card px-4 md:px-6 py-4 md:py-5" style={{ background: `linear-gradient(135deg, ${k.color}12 0%, #fff 55%)` }}>
        <div className="flex items-start gap-3.5">
          <span className="w-12 h-12 md:w-14 md:h-14 rounded-2xl flex items-center justify-center text-[24px] flex-shrink-0" style={{ background: k.color + '1F' }}>{k.icon}</span>
          <div className="flex-1 min-w-0">
            <h1 className="text-[21px] md:text-[24px] font-bold tracking-[-0.01em]" style={{ color: 'var(--text)' }}>{ev.name}</h1>
            <div className="text-[12.5px] mt-0.5" style={{ color: 'var(--text3)' }}>{k.label} · {fmtDay(ev.start_date)}{ev.end_date !== ev.start_date ? ` – ${fmtDay(ev.end_date)}` : ''} {String(ev.end_date).slice(0, 4)}{ev.place ? ` · ${ev.place}` : ''}{s.days > 1 ? ` · ${s.days} days` : ''}</div>
            {ev.notes && <div className="text-[12.5px] mt-1" style={{ color: 'var(--text2)' }}>{ev.notes}</div>}
          </div>
          <div className="hidden md:flex gap-2 flex-shrink-0">
            <button onClick={() => setSheet('add')} className="wl-btn wl-btn-primary" style={{ height: 34 }}><Plus size={14} />Add expense</button>
            <button onClick={() => setSheet('edit')} className="wl-btn" style={{ height: 34 }}><Edit2 size={13} />Edit</button>
          </div>
        </div>
        {s.budget > 0 && (
          <div className="mt-4">
            <div className="flex justify-between items-baseline"><span className="text-[24px] font-bold tabular-nums" style={{ color: 'var(--text)' }}>{money(s.spent)}</span><span className="text-[12.5px]" style={{ color: 'var(--text3)' }}>of {money(s.budget)}</span></div>
            <div className="h-3 rounded-full mt-2" style={{ background: 'var(--track)' }}><div className="h-full rounded-full" style={{ width: `${Math.min(100, s.pct ?? 0)}%`, background: (s.pct ?? 0) > 100 ? '#DC2626' : k.color }} /></div>
          </div>
        )}
        <div className="md:hidden flex gap-2 mt-3 [&>button]:flex-1">
          <button onClick={() => setSheet('add')} className="wl-btn wl-btn-primary" style={{ height: 36 }}><Plus size={14} />Add expense</button>
          <button onClick={() => setSheet('edit')} className="wl-btn" style={{ height: 36 }}><Edit2 size={13} />Edit</button>
        </div>
      </section>

      <InsightBar text={insight} prompt={`Look at my ${k.label.toLowerCase()} "${ev.name}" and tell me what to learn for next time. ${insight} By category: ${s.byCategory.map(c => `${c.name} ${money(c.value)}`).join(', ')}.`} />
      {error && <div className="rounded-xl px-4 py-2.5 text-[12.5px]" style={{ background: '#FDECE8', color: '#B4231A' }}>{error}</div>}

      <KpiGrid>
        <KpiTile label="Spent" value={money(s.spent)} tint={0} icon={Wallet} delta={`${s.count} expense${s.count === 1 ? '' : 's'}${s.currencies.length > 1 ? ' · AED and ₹ at today’s rate' : ''}`} />
        <KpiTile label={s.left >= 0 ? 'Left in budget' : 'Over budget'} value={s.budget ? money(Math.abs(s.left)) : '—'} tint={2} icon={Flag} tone={!s.budget ? 'neutral' : s.left >= 0 ? 'good' : 'bad'} delta={s.budget ? `budget ${money(s.budget)}` : 'No budget set'} />
        <KpiTile label={s.status === 'live' ? 'A day, left' : 'A day'} value={s.status === 'live' && s.perDayLeft != null ? money(s.perDayLeft) : money(s.spent / Math.max(1, s.status === 'live' ? s.dayNo : s.days))} tint={3} icon={CalendarDays} delta={s.status === 'live' ? `day ${s.dayNo} of ${s.days}` : `over ${s.days} day${s.days === 1 ? '' : 's'}`} />
        <KpiTile label="To tag" value={String(sugg.length)} tint={1} icon={ListChecks} delta={sugg.length ? 'in its dates, not tagged yet' : 'All tagged'} />
      </KpiGrid>

      <div className="grid grid-cols-1 lg:grid-cols-[1.5fr_1fr] gap-3.5 md:gap-4 items-start">
        <div className="flex flex-col gap-3.5 md:gap-4 min-w-0">
          {sugg.length > 0 && (
            <Panel title="Did these belong to it?" right={<button onClick={() => tag(Array.from(pick))} disabled={busy || !pick.size} className="wl-btn wl-btn-primary disabled:opacity-60" style={{ height: 32, fontSize: 12.5 }}>Tag {pick.size}</button>}>
              <p className="text-[12px] mt-1" style={{ color: 'var(--text3)' }}>Spent in its dates{ev.kind === 'trip' ? ', and flight or hotel bookings in the 90 days before' : ''} — rent, EMIs and bills are left out.</p>
              <ul className="mt-1.5">
                {sugg.map(t => (
                  <li key={t.id} className="flex items-center gap-3 py-2" style={{ borderTop: '1px solid var(--track)' }}>
                    <input type="checkbox" checked={pick.has(t.id)} onChange={e => setPick(p => { const n = new Set(p); if (e.target.checked) n.add(t.id); else n.delete(t.id); return n })} className="accent-[var(--accent)] w-4 h-4" aria-label={`Tag ${t.merchant}`} />
                    <span className="flex-1 min-w-0"><span className="block text-[13px] truncate" style={{ color: 'var(--text)' }}>{t.merchant}</span>
                      <span className="block text-[11.5px]" style={{ color: 'var(--text4)' }}>{fmtDay(t.txn_date)} · {labelOf(t.category)}{t.txn_date < ev.start_date ? ' · booked before' : ''}</span></span>
                    <span className="text-[13px] font-semibold tabular-nums">{fmtMoney(Number(t.amount), t.currency)}</span>
                  </li>
                ))}
              </ul>
            </Panel>
          )}

          <Panel title={`Expenses · ${s.count}`} right={<button onClick={() => setSheet('add')} className="text-[12px] font-semibold flex items-center gap-1" style={{ color: 'var(--accent)' }}><Plus size={13} />Add</button>}>
            {s.rows.length === 0 ? <p className="text-[12.5px] mt-2" style={{ color: 'var(--text3)' }}>Nothing tagged yet. Add an expense here, or pick “{ev.name}” under Trip / event when you add one — in its dates it’s picked for you.</p> : (
              <ul className="mt-1.5">
                {s.rows.map(t => (
                  <li key={t.id} className="flex items-center gap-3 py-2" style={{ borderTop: '1px solid var(--track)' }}>
                    <span className="flex-1 min-w-0"><span className="block text-[13px] truncate" style={{ color: 'var(--text)' }}>{t.merchant}</span>
                      <span className="block text-[11.5px]" style={{ color: 'var(--text4)' }}>{fmtDay(t.txn_date)} · {labelOf(t.category)}{t.holder_name ? ` · ${PERSON(t.holder_name)}` : ''}</span></span>
                    <span className="text-right"><span className="block text-[13px] font-semibold tabular-nums">{fmtMoney(Number(t.amount), t.currency)}</span>
                      {t.currency !== cur && <span className="block text-[10.5px]" style={{ color: 'var(--text4)' }}>≈ {money(conv(t))}</span>}</span>
                    <button onClick={() => untag(t.id)} disabled={busy} aria-label={`Untag ${t.merchant}`} title="Not part of this" className="p-1 rounded-md hover:bg-[var(--bg2)]" style={{ color: 'var(--text4)' }}><X size={13} /></button>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        <div className="flex flex-col gap-3.5 md:gap-4">
          {s.byCategory.length > 0 && (
            <Panel title="By category">
              <div className="mt-2.5 flex flex-col gap-2.5">{s.byCategory.map(c => <ProgressRow key={c.name} name={labelOf(c.name)} value={money(c.value)} right={`${Math.round(c.value / (s.spent || 1) * 100)}%`} pct={c.value / (s.spent || 1) * 100} color={k.color} />)}</div>
            </Panel>
          )}
          {s.byDay.length > 1 && (
            <Panel title="By day">
              <Bars data={s.byDay.map(d => ({ label: fmtDay(d.date), value: d.value, tip: `${fmtDay(d.date)}: ${money(d.value)}` }))} className="h-[120px] mt-3" label={`Spending by day: ${s.byDay.map(d => `${fmtDay(d.date)} ${money(d.value)}`).join(', ')}`} />
            </Panel>
          )}
          {s.byPerson.length > 1 && (
            <Panel title="By person">
              <ul className="mt-2 flex flex-col gap-1.5 text-[12.5px]">{s.byPerson.map(p => <li key={p.name} className="flex justify-between"><span style={{ color: 'var(--text2)' }}>{PERSON(p.name)}</span><span className="font-semibold tabular-nums">{money(p.value)}</span></li>)}</ul>
            </Panel>
          )}
          {goal && (
            <Link href={`/dashboard/goals/${goal.id}`} className="wl-card px-4 py-3 flex items-center gap-3">
              <Target size={18} style={{ color: 'var(--accent)' }} />
              <span className="flex-1 text-[12.5px]" style={{ color: 'var(--text2)' }}>Saved for in <b style={{ color: 'var(--text)' }}>{goal.name}</b> ({fmtMoney(Number(goal.target_amount), goal.currency)})</span>
            </Link>
          )}
          <Panel title={s.status === 'done' ? 'Wrapped up' : 'Wrap up'}>
            {s.status === 'done' ? (<>
              <p className="text-[12.5px] mt-2" style={{ color: 'var(--text2)' }}>Closed {fmtDay(ev.closed_at)}. {s.budget ? (s.left >= 0 ? `Came in ${money(s.left)} under budget.` : `Went ${money(-s.left)} over budget.`) : ''}</p>
              <button onClick={reopen} disabled={busy} className="text-[12px] font-semibold mt-1.5" style={{ color: 'var(--accent)' }}>Reopen</button>
            </>) : (<>
              <p className="text-[12.5px] mt-2 leading-snug" style={{ color: 'var(--text3)' }}>When it’s over and everything is tagged, close it — it stops picking up new expenses and joins the year’s total.</p>
              <button onClick={wrapUp} disabled={busy || s.status === 'upcoming'} className="wl-btn mt-2.5 disabled:opacity-50" style={{ height: 34 }}><CheckCircle2 size={14} />Close it</button>
            </>)}
            {repeatsYearly && s.spent > 0 && (
              <div className="mt-3 rounded-xl px-3 py-2.5 text-[12.5px]" style={{ background: 'var(--accent-bg)', color: 'var(--accent2)' }}>
                It cost {money(s.spent)}. Save for next year’s a little each month instead of paying it in one go.
                <button onClick={() => setSheet('goal')} className="block font-semibold mt-1">Plan next year’s · {money(planAmount)} →</button>
              </div>
            )}
          </Panel>
        </div>
      </div>

      {sheet === 'edit' && <EventSheet event={ev} goals={data.goals} onClose={() => setSheet(null)} onSaved={nid => { setSheet(null); if (nid) router.refresh(); else router.push('/dashboard/events') }} />}
      {sheet === 'add' && <AddTransactionModal onClose={() => { setSheet(null); router.refresh() }}
        defaults={{ txn_type: 'expense', event_id: ev.id, currency: cur, txn_date: today >= ev.start_date && today <= ev.end_date ? today : ev.start_date }} />}
      {sheet === 'goal' && <AddGoalModal onClose={() => setSheet(null)} stay
        defaults={{ name: ev.name.replace(/\b20\d\d\b/, '').replace(/\s+/g, ' ').trim() || ev.name, kind: ev.kind === 'trip' ? 'travel' : 'celebration', target: planAmount, currency: cur,
          repeat_months: 12, date: nextYear, spend_category: s.byCategory[0]?.name }} />}
    </div>
  )
}
