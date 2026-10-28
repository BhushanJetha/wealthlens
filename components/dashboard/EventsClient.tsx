'use client'
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Plus, ChevronRight, CalendarRange, Wallet, Flag, Tags } from 'lucide-react'
import { fmtCompact, fmtMoney } from '@/lib/format'
import { fmtDay, localToday } from '@/lib/insights'
import { labelOf } from '@/lib/money'
import { EVENT_KINDS, eventKind, eventStats, eventSuggestions, yearSummary } from '@/lib/events'
import type { EventsData } from '@/lib/eventsData'
import { PageHeader, InsightBar, KpiTile, KpiGrid, Panel, ProgressRow } from '@/components/ui/kit'
import EventSheet from '@/components/forms/EventSheet'

const range = (e: any) => `${fmtDay(e.start_date)}${e.end_date !== e.start_date ? ` – ${fmtDay(e.end_date)}` : ''} ${String(e.end_date).slice(0, 4)}`
const STATUS: Record<string, { label: string; bg: string; c: string }> = {
  upcoming: { label: 'Coming up', bg: 'var(--accent-bg)', c: 'var(--accent2)' },
  live: { label: 'On now', bg: 'var(--pos-bg)', c: 'var(--pos-text)' },
  ended: { label: 'Wrap up', bg: 'var(--amber-bg)', c: 'var(--amber-text)' },
  done: { label: 'Done', bg: '#F1F5F9', c: 'var(--text3)' },
}

// Events & trips (design v2): a trip, a function at home, a festival, a home
// project — each with its own budget, its spending tagged to it (expenses keep
// their category, so nothing doubles up), totalled by year.
export default function EventsClient({ data }: { data: EventsData }) {
  const router = useRouter()
  const today = localToday()
  const years = useMemo(() => Array.from(new Set([today.slice(0, 4), ...data.events.map(e => String(e.start_date).slice(0, 4))])).sort().reverse(), [data.events, today])
  const [year, setYear] = useState(years[0])
  const [adding, setAdding] = useState<null | { kind?: any }>(null)
  const y = useMemo(() => yearSummary(data.events, data.txns, data.fx, today, year), [data, year, today])
  const inr = (n: number) => fmtCompact(n, 'INR')
  const live = data.events.map(e => ({ e, s: eventStats(e, data.txns, data.fx, today) })).filter(x => x.s.status === 'live')
  const toSort = data.events.filter(e => !e.closed_at).map(e => ({ e, n: eventSuggestions(e, data.txns).length })).filter(x => x.n > 0)
  const toWrap = data.events.map(e => ({ e, s: eventStats(e, data.txns, data.fx, today) })).filter(x => x.s.status === 'ended')
  const last = yearSummary(data.events, data.txns, data.fx, today, String(Number(year) - 1))

  const insight = !data.ready ? 'Run migration 034 in Supabase to track trips, functions and festivals — each with its own budget, totalled by year.'
    : !y.count ? `No trips or events in ${year} yet. Create one before you go — then tag what you spend (dates inside it are tagged for you).`
    : `${year}: ${y.count} trip${y.count === 1 ? '' : 's'} & event${y.count === 1 ? '' : 's'}, ${inr(y.total)} in all${y.byCategory[0] ? ` — most on ${labelOf(y.byCategory[0].name).toLowerCase()}` : ''}.${last.count ? ` ${year === today.slice(0, 4) ? 'Last year' : String(Number(year) - 1)}: ${inr(last.total)}.` : ''}${y.budgetedCount ? ` ${y.overBudget} of ${y.budgetedCount} went over budget.` : ''}`

  return (
    <div className="flex flex-col gap-3.5 md:gap-[18px] animate-fade-up">
      <PageHeader title="Events & trips" sub="Trips, functions at home, festivals — each with its own budget, totalled by year"
        onAdd={data.ready ? () => setAdding({}) : undefined} addLabel="New"
        actions={data.ready ? <button onClick={() => setAdding({})} className="wl-btn wl-btn-primary" style={{ height: 36 }}><Plus size={14} />New trip or event</button> : undefined} />
      <InsightBar text={insight} prompt={`Help me plan and budget my trips and functions. ${insight}`} />

      <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
        {years.map(yr => <button key={yr} onClick={() => setYear(yr)} aria-pressed={year === yr} className="wl-chip flex-shrink-0">{yr}</button>)}
      </div>

      <KpiGrid>
        <KpiTile label={`Spent in ${year}`} value={inr(y.total)} tint={0} icon={Wallet} delta={last.count ? `${y.total >= last.total ? '▲' : '▼'} ${inr(Math.abs(y.total - last.total))} vs ${Number(year) - 1}` : 'on trips & events'} />
        <KpiTile label="Trips & events" value={String(y.count)} tint={1} icon={CalendarRange} delta={y.byKind.filter(k => k.value > 0).map(k => `${eventKind(k.kind).icon} ${inr(k.value)}`).slice(0, 3).join(' · ') || '—'} />
        <KpiTile label="Over budget" value={y.budgetedCount ? `${y.overBudget} of ${y.budgetedCount}` : '—'} tint={2} icon={Flag} tone={y.overBudget ? 'bad' : 'neutral'} delta={y.budgetedCount ? 'with a budget set' : 'Set a budget when you create one'} />
        <KpiTile label="To tag" value={String(toSort.reduce((s, x) => s + x.n, 0))} tint={3} icon={Tags} delta={toSort.length ? `${toSort.length} event${toSort.length === 1 ? '' : 's'} with spending in their dates` : 'All tagged'} />
      </KpiGrid>

      {(live.length > 0 || toWrap.length > 0 || toSort.length > 0) && (
        <section className="wl-card px-4 md:px-5 py-3.5">
          <h2 className="text-[14px] md:text-[15px] font-semibold" style={{ color: 'var(--text)' }}>Needs you</h2>
          <ul className="mt-1">
            {live.map(({ e, s }) => (
              <li key={`l-${e.id}`}><Link href={`/dashboard/events/${e.id}`} className="flex items-start gap-3 py-2.5" style={{ borderTop: '1px solid var(--track)' }}>
                <span className="text-[18px]">{eventKind(e.kind).icon}</span>
                <span className="flex-1 min-w-0"><span className="block text-[13px] font-semibold" style={{ color: 'var(--pos-text)' }}>{e.name} — day {s.dayNo} of {s.days}</span>
                  <span className="block text-[12px]" style={{ color: 'var(--text3)' }}>{fmtMoney(s.spent, e.currency)} spent{s.budget ? ` of ${fmtMoney(s.budget, e.currency)}` : ''}{s.perDayLeft != null ? ` · ${fmtMoney(s.perDayLeft, e.currency)} a day left` : ''}</span></span>
                <ChevronRight size={16} style={{ color: 'var(--text4)' }} /></Link></li>
            ))}
            {toSort.filter(x => !live.some(l => l.e.id === x.e.id)).map(({ e, n }) => (
              <li key={`s-${e.id}`}><Link href={`/dashboard/events/${e.id}`} className="flex items-start gap-3 py-2.5" style={{ borderTop: '1px solid var(--track)' }}>
                <span className="text-[18px]">🏷️</span>
                <span className="flex-1 min-w-0"><span className="block text-[13px] font-semibold" style={{ color: 'var(--text)' }}>{n} expense{n === 1 ? '' : 's'} may belong to {e.name}</span>
                  <span className="block text-[12px]" style={{ color: 'var(--text3)' }}>Spent in its dates (or booked before it) and not tagged yet.</span></span>
                <ChevronRight size={16} style={{ color: 'var(--text4)' }} /></Link></li>
            ))}
            {toWrap.map(({ e, s }) => (
              <li key={`w-${e.id}`}><Link href={`/dashboard/events/${e.id}`} className="flex items-start gap-3 py-2.5" style={{ borderTop: '1px solid var(--track)' }}>
                <span className="text-[18px]">🧾</span>
                <span className="flex-1 min-w-0"><span className="block text-[13px] font-semibold" style={{ color: 'var(--amber-text)' }}>Wrap up {e.name}</span>
                  <span className="block text-[12px]" style={{ color: 'var(--text3)' }}>{fmtMoney(s.spent, e.currency)} in all{s.budget ? ` — ${s.left >= 0 ? `${fmtMoney(s.left, e.currency)} under` : `${fmtMoney(-s.left, e.currency)} over`} budget` : ''}. Close it, and plan next time.</span></span>
                <ChevronRight size={16} style={{ color: 'var(--text4)' }} /></Link></li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-3.5 md:gap-4 items-start">
        <div className="flex flex-col gap-2.5 min-w-0">
          {!data.ready ? null : y.items.length === 0 ? (
            <div className="wl-card px-5 py-8 text-center flex flex-col items-center gap-3">
              <div className="text-[30px]">✈️ 🎉 🪔</div>
              <div className="text-[15px] font-semibold" style={{ color: 'var(--text)' }}>Track your next trip or function</div>
              <div className="text-[12.5px] max-w-md" style={{ color: 'var(--text3)' }}>Give it dates and a budget. Everything you spend in those dates is tagged to it, and at the end you see exactly what it cost — by category, person and day.</div>
              <div className="flex flex-wrap gap-1.5 justify-center">
                {EVENT_KINDS.slice(0, 4).map(k => <button key={k.key} onClick={() => setAdding({ kind: k.key })} className="wl-chip" style={{ height: 32 }}><span>{k.icon}</span>{k.label}</button>)}
              </div>
            </div>
          ) : y.items.map(({ ev, s }) => {
            const k = eventKind(ev.kind), st = STATUS[s.status]
            return (
              <Link key={ev.id} href={`/dashboard/events/${ev.id}`} className="wl-card px-4 md:px-5 py-3.5 flex flex-col gap-2">
                <div className="flex items-center gap-3">
                  <span className="w-10 h-10 rounded-xl flex items-center justify-center text-[19px] flex-shrink-0" style={{ background: k.color + '1F' }}>{k.icon}</span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-[14px] font-semibold truncate" style={{ color: 'var(--text)' }}>{ev.name}</span>
                    <span className="block text-[11.5px] truncate" style={{ color: 'var(--text4)' }}>{k.label} · {range(ev)}{ev.place ? ` · ${ev.place}` : ''}</span>
                  </span>
                  <span className="rounded-full px-2.5 py-[3px] text-[11px] font-semibold flex-shrink-0" style={{ background: st.bg, color: st.c }}>{st.label}</span>
                </div>
                <div className="flex justify-between items-baseline gap-2">
                  <span className="text-[17px] font-bold tabular-nums" style={{ color: 'var(--text)' }}>{fmtMoney(s.spent, ev.currency)}</span>
                  <span className="text-[12px]" style={{ color: s.budget && s.left < 0 ? '#DC2626' : 'var(--text3)' }}>{s.budget ? `of ${fmtMoney(s.budget, ev.currency)}${s.left < 0 ? ` · ${fmtMoney(-s.left, ev.currency)} over` : ''}` : `${s.count} expense${s.count === 1 ? '' : 's'}`}</span>
                </div>
                {s.budget > 0 && <div className="h-[7px] rounded-full" style={{ background: 'var(--track)' }}><div className="h-full rounded-full" style={{ width: `${Math.min(100, s.pct ?? 0)}%`, background: (s.pct ?? 0) > 100 ? '#DC2626' : k.color }} /></div>}
              </Link>
            )
          })}
        </div>

        <div className="flex flex-col gap-3.5 md:gap-4">
          {y.byCategory.length > 0 && (
            <Panel title={`Where it went in ${year}`}>
              <div className="mt-2.5 flex flex-col gap-2.5">
                {y.byCategory.slice(0, 7).map(c => <ProgressRow key={c.name} name={labelOf(c.name)} value={inr(c.value)} right={`${Math.round(c.value / (y.total || 1) * 100)}%`} pct={c.value / (y.total || 1) * 100} color="#6A55E8" />)}
              </div>
            </Panel>
          )}
          <Panel title="How it works">
            <ul className="mt-2 flex flex-col gap-1.5 text-[12.5px] leading-snug" style={{ color: 'var(--text2)' }}>
              <li>• <b>A tag, not a category.</b> A dinner on the trip stays “Food” and is tagged to the trip — so it’s counted once, and shows both in Food and in the trip.</li>
              <li>• <b>Its own budget.</b> Trip and function spending is kept out of your monthly budgets (those measure everyday living), but it always counts in what you spent and saved.</li>
              <li>• <b>Plan ahead.</b> Big ones that come round every year (the trip home, Diwali) work best with a recurring goal — save a little each month, then link the goal here.</li>
            </ul>
          </Panel>
        </div>
      </div>

      {adding && <EventSheet goals={data.goals} defaults={{ kind: adding.kind }} onClose={() => setAdding(null)}
        onSaved={id => { setAdding(null); if (id) router.push(`/dashboard/events/${id}`); else router.refresh() }} />}
    </div>
  )
}
