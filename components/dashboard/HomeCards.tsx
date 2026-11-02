'use client'
import { useState } from 'react'
import Link from 'next/link'
import { Sheet } from './BillSheets'
import { ArrowDownLeft, ArrowUpRight, CalendarDays, ChevronRight, HandCoins, Receipt } from 'lucide-react'
import { billTotals, type Bill } from '@/lib/bigBills'
import { fmtCompact, fmtMoney } from '@/lib/format'
import { fmtDay, daysBetween } from '@/lib/insights'
import type { Reminder, HomePlan, PlanRow } from '@/lib/homePlan'
import type { BalanceWarning } from '@/lib/moneyOverview'

const MON = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

// The first thing on Home: what's actually free to spend, per currency
// (dirhams can't pay in India). Tap for the detail on Money.
export interface FreeCard { cur: 'AED' | 'INR'; amount: number; cash: number; due: number; reserved: number; until: string; perDay: number | null; payday: boolean }
export function FreeToSpendCard({ cards, className = '' }: { cards: FreeCard[]; className?: string }) {
  return (
    <Link href="/dashboard/money" aria-label="Free to spend, open the detail" className={`flex flex-col rounded-[18px] md:rounded-[20px] bg-review text-white px-4 md:px-[22px] py-4 md:py-5 ${className}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.06em]" style={{ color: '#DAD3FF' }}>Free to spend</span>
        <ChevronRight size={17} style={{ color: '#DAD3FF' }} />
      </div>
      <div className={`flex-1 grid gap-4 mt-1.5 content-center ${cards.length > 1 ? 'grid-cols-2' : ''}`}>
        {cards.map(c => (
          <div key={c.cur} className="min-w-0 flex flex-col gap-3 md:gap-4">
            <div>
              <div className={`${cards.length > 1 ? 'text-[23px] md:text-[38px]' : 'text-[34px] md:text-[44px]'} font-bold tabular-nums tracking-[-0.02em] leading-tight truncate`}>{fmtCompact(c.amount, c.cur)}</div>
              <div className="text-[12.5px] mt-0.5" style={{ color: '#E6E0FF' }}>{cards.length > 1 && <>{c.cur === 'AED' ? 'UAE' : 'India'} · </>}{c.amount < 0 ? 'short' : 'until'} {fmtDay(c.until)}</div>
            </div>
            <dl className="flex flex-col gap-1 rounded-xl px-3 py-2.5" style={{ background: 'rgba(255,255,255,.1)' }}>
              {([['Bank & cash', fmtCompact(c.cash, c.cur)], ['Due first', fmtCompact(c.due, c.cur)], ...(c.reserved > 0 ? [['Set aside', fmtCompact(c.reserved, c.cur)] as [string, string]] : []), ['Per day', c.perDay ? fmtCompact(c.perDay, c.cur) : '—']] as [string, string][]).map(([k, v]) => (
                <div key={k} className="flex justify-between gap-2 min-w-0">
                  <dt className="text-[11px] md:text-[12.5px] whitespace-nowrap" style={{ color: '#CFC6FF' }}>{k}</dt>
                  <dd className="text-[12px] md:text-[14px] font-semibold tabular-nums whitespace-nowrap">{v}</dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>
    </Link>
  )
}

// One line for Home: what the big bills ask of you each month, and what's next
export function BigBillsStrip({ bills }: { bills: Bill[] }) {
  if (!bills.length) return null
  const lines = (['INR', 'AED'] as const).map(c => ({ c, t: billTotals(bills, c) })).filter(x => x.t.count > 0)
  return (
    <Link href="/dashboard/bills" aria-label="Big bills, open the detail" className="wl-card flex items-center gap-3 px-4 py-3.5 md:px-5">
      <span className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'var(--accent-bg)', color: 'var(--accent)' }}><Receipt size={17} /></span>
      <span className="flex-1 min-w-0 flex flex-col gap-0.5">
        {lines.map(({ c, t }) => (
          <span key={c} className="text-[13px]" style={{ color: 'var(--text)' }}>
            <b>Big bills:</b> {t.monthly > 0 ? `${fmtMoney(t.monthly, c)} a month to set aside` : 'all set aside'}{t.next ? ` · next is ${t.next.name} on ${fmtDay(t.next.due)}` : ''}
          </span>
        ))}
      </span>
      <ChevronRight size={17} className="flex-shrink-0" style={{ color: 'var(--text4)' }} />
    </Link>
  )
}

const dayText = (today: string, d: string) => { const n = daysBetween(today, d); return n === 0 ? 'Today' : n === 1 ? 'Tomorrow' : fmtDay(d) }

function ReminderRow({ r, today }: { r: Reminder; today: string }) {
  const Icon = r.dir === 'in' ? ArrowDownLeft : r.dir === 'event' ? CalendarDays : ArrowUpRight
  return (
    <Link href={r.href} className="flex gap-2.5 items-center py-2 px-2 rounded-lg hover:bg-[#F5F3FE] min-w-0">
      <span className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: r.dir === 'in' ? '#E7F7EF' : r.dir === 'event' ? '#E7F1FE' : '#F0EDFF', color: r.dir === 'in' ? '#1E8F5F' : r.dir === 'event' ? '#1D5FA8' : '#5640D6' }}><Icon size={14} /></span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-medium truncate" style={{ color: 'var(--text)' }}>{r.label}</span>
        <span className="block text-[11.5px] truncate" style={{ color: 'var(--text3)' }}>{dayText(today, r.date)} · {r.sub}</span>
      </span>
      {r.amount != null && <span className="text-[13px] font-semibold tabular-nums flex-shrink-0" style={{ color: r.dir === 'in' ? '#1E8F5F' : 'var(--text)' }}>{r.dir === 'in' ? '+' : ''}{fmtCompact(r.amount, r.currency)}</span>}
    </Link>
  )
}

// Reminders, across the whole width: the week's totals, then each item. A quiet
// week is filled in with what comes after it.
export function NextWeekCard({ today, items, later, warnings, dueTotal, inTotal, money, friends, className = '' }: {
  today: string; items: Reminder[]; later: Reminder[]; warnings: BalanceWarning[]; dueTotal: number; inTotal: number; money: (n: number) => string
  friends: { receive: string | null; pay: string | null }; className?: string
}) {
  const showing = items.slice(0, 6), extra = later.slice(0, Math.max(0, 6 - showing.length))
  const friendText = [friends.receive && `Friends owe you ${friends.receive}`, friends.pay && `you owe ${friends.pay}`].filter(Boolean).join(' · ')
  return (
    <section aria-labelledby="week-title" className={`wl-card px-4 md:px-5 py-3.5 md:py-[18px] ${className}`}>
      <div className="flex items-center justify-between gap-2">
        <h2 id="week-title" className="text-[14px] font-semibold" style={{ color: 'var(--text)' }}>Next 7 days</h2>
        <Link href="/dashboard/bills" className="text-[12.5px] font-semibold hover:underline" style={{ color: 'var(--accent)' }}>All bills →</Link>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-[210px_1fr] gap-3 mt-2.5">
        <div className="grid grid-cols-2 lg:grid-cols-1 gap-2">
          <div className="rounded-xl px-3 py-2.5 flex flex-col justify-center" style={{ background: '#FDF2F2' }}>
            <div className="text-[11.5px] font-medium" style={{ color: '#7F1D1D' }}>Going out of your bank</div>
            <div className="text-[18px] font-bold tabular-nums" style={{ color: 'var(--text)' }}>{money(dueTotal)}</div>
          </div>
          <div className="rounded-xl px-3 py-2.5 flex flex-col justify-center" style={{ background: '#EEF9F3' }}>
            <div className="text-[11.5px] font-medium" style={{ color: '#14603F' }}>Coming in</div>
            <div className="text-[18px] font-bold tabular-nums" style={{ color: 'var(--text)' }}>{money(inTotal)}</div>
          </div>
        </div>
        <div className="min-w-0">
          {warnings.slice(0, 2).map(w => (
            <Link key={w.id} href={w.href ?? '/dashboard/accounts'} className="flex gap-2.5 items-start py-2 px-2 mb-1 rounded-lg" style={{ background: w.severity === 'high' ? '#FEF2F2' : '#FFF8EC' }}>
              <span className="w-2 h-2 rounded-full mt-[5px] flex-shrink-0" style={{ background: w.severity === 'high' ? '#DC2626' : '#D97706' }} />
              <span className="min-w-0 text-[13px] font-semibold" style={{ color: w.severity === 'high' ? '#B91C1C' : 'var(--text)' }}>{w.title}</span>
            </Link>
          ))}
          {showing.length === 0 && <div className="text-[12.5px] px-2 pb-1" style={{ color: 'var(--text3)' }}>Nothing due this week.{extra.length ? ' After that:' : ''}</div>}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4">
            {showing.map(r => <ReminderRow key={r.id} r={r} today={today} />)}
            {extra.map(r => <ReminderRow key={r.id} r={r} today={today} />)}
          </div>
          {friendText && (
            <Link href="/dashboard/money/friends" className="flex gap-2.5 items-center py-2 px-2 mt-1 rounded-lg hover:bg-[#F5F3FE]" style={{ borderTop: '1px solid #F1F5F9' }}>
              <span className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: '#FFF2E2', color: '#B45309' }}><HandCoins size={14} /></span>
              <span className="min-w-0 flex-1 text-[13px] font-medium" style={{ color: 'var(--text)' }}>{friendText}</span>
              <ChevronRight size={15} style={{ color: 'var(--text4)' }} />
            </Link>
          )}
        </div>
      </div>
    </section>
  )
}

const Line = ({ label, value, strong, ink, onOpen }: { label: string; value: string; strong?: boolean; ink?: string; onOpen?: () => void }) => {
  const body = (<>
    <span className={onOpen ? 'flex items-center gap-1 underline decoration-dotted underline-offset-2' : undefined} style={{ color: strong ? 'var(--text)' : 'var(--text3)', fontWeight: strong ? 600 : 400 }}>{label}{onOpen && <ChevronRight size={13} className="flex-shrink-0" />}</span>
    <span className="tabular-nums font-semibold flex-shrink-0" style={{ color: ink ?? 'var(--text)' }}>{value}</span>
  </>)
  const cls = 'flex justify-between gap-3 py-[7px] text-[12.5px] w-full text-left', st = { borderTop: strong ? '1px solid var(--line)' : undefined }
  return onOpen
    ? <button type="button" onClick={onOpen} aria-label={`${label}: ${value}. See what's in it`} className={cls} style={st}>{body}</button>
    : <div className={cls} style={st}>{body}</div>
}

// What's behind one of the plan's numbers
interface PlanDetail { title: string; intro: string; rows: PlanRow[]; total: string; foot?: { text: string; href: string; link: string } }
function PlanDetailSheet({ d, onClose }: { d: PlanDetail; onClose: () => void }) {
  return (
    <Sheet title={d.title} onClose={onClose}>
      <p className="text-[12.5px] leading-snug" style={{ color: 'var(--text3)' }}>{d.intro}</p>
      <ul>
        {d.rows.map((r, i) => (
          <li key={r.id} className="py-2.5" style={{ borderTop: i ? '1px solid var(--track)' : undefined }}>
            <div className="flex justify-between gap-3 text-[13px] font-semibold" style={{ color: 'var(--text)' }}>
              <span className="min-w-0">{r.label}</span><span className="tabular-nums flex-shrink-0">{fmtMoney(r.amount, r.currency)}</span>
            </div>
            <div className="text-[12px] leading-snug mt-0.5" style={{ color: 'var(--text3)' }}>{[r.date && fmtDay(r.date), r.why ?? r.sub].filter(Boolean).join(' · ')}</div>
            {r.seen && r.seen.length > 0 && <div className="text-[12px] leading-snug mt-0.5" style={{ color: 'var(--text3)' }}>Paid: {r.seen.map(s => `${fmtDay(s.date)} ${fmtMoney(s.amount, r.currency)}`).join(', ')}</div>}
          </li>
        ))}
      </ul>
      <div className="flex justify-between gap-3 text-[13.5px] font-bold pt-2.5" style={{ color: 'var(--text)', borderTop: '1px solid var(--line)' }}><span>Total</span><span className="tabular-nums">{d.total}</span></div>
      {d.foot && <p className="text-[12.5px] leading-snug" style={{ color: 'var(--text3)' }}>{d.foot.text} <Link href={d.foot.href} className="font-semibold underline" style={{ color: 'var(--accent)' }}>{d.foot.link}</Link></p>}
    </Sheet>
  )
}
const Column = ({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) => (
  <div className="min-w-0 rounded-[14px] px-3.5 py-3 flex flex-col" style={{ background: '#FAFAFE', border: '1px solid var(--line)' }}>
    <div className="text-[12.5px] font-semibold mb-1" style={{ color: 'var(--text)' }}>{title}{sub && <span className="font-normal" style={{ color: 'var(--text3)' }}> · {sub}</span>}</div>
    {children}
  </div>
)

// Looking ahead, across the whole width: where this month should end, what next
// month leaves to plan, and what's already committed.
export function PlanCard({ plan, money, className = '' }: { plan: HomePlan; money: (n: number) => string; className?: string }) {
  const { rest, next } = plan
  const [detail, setDetail] = useState<PlanDetail | null>(null)
  const BILLS_FOOT = { text: 'You can change these on', href: '/dashboard/bills', link: 'Plan › Bills' }
  const group = (g: { label: string; amount: number; items: PlanRow[] }, when: string) => setDetail({ title: g.label, intro: when, rows: g.items, total: money(g.amount), foot: /Rent/.test(g.label) ? BILLS_FOOT : undefined })
  const thisName = MON[(Number(next.ym.slice(5)) + 10) % 12], nextName = MON[Number(next.ym.slice(5)) - 1]
  const signed = (n: number) => `${n < 0 ? '−' : ''}${money(Math.abs(n))}`
  return (
    <section aria-labelledby="plan-title" className={`wl-card px-4 md:px-5 py-3.5 md:py-[18px] ${className}`}>
      <div className="flex items-center justify-between gap-2">
        <h2 id="plan-title" className="text-[14px] font-semibold" style={{ color: 'var(--text)' }}>Plan ahead</h2>
        <Link href="/dashboard/budgets" className="text-[12.5px] font-semibold hover:underline" style={{ color: 'var(--accent)' }}>Budgets →</Link>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-2.5">
        <Column title={`Rest of ${thisName}`} sub={`${rest.days} day${rest.days === 1 ? '' : 's'} left`}>
          <Line label="Bank & cash now" value={money(rest.cash)} />
          <details className="group">
            <summary className="list-none cursor-pointer flex justify-between gap-3 py-[7px] text-[12.5px]">
              <span className="flex items-center gap-1" style={{ color: 'var(--text3)' }}>+ Should come in <ChevronRight size={13} className="transition-transform group-open:rotate-90" /></span>
              <span className="tabular-nums font-semibold flex-shrink-0" style={{ color: '#1E8F5F' }}>{money(rest.comingIn)}</span>
            </summary>
            <div className="rounded-[10px] px-2.5 py-1.5 mb-1 text-[11.5px] leading-[1.45]" style={{ background: '#EEF9F3', color: '#14603F' }}>
              {rest.incoming.length === 0 && 'Nothing more is expected for the rest of this month.'}
              {rest.incoming.map(i => (
                <div key={i.id} className="py-1">
                  <div className="flex justify-between gap-2 font-semibold"><span className="min-w-0 truncate">{i.label}</span><span className="tabular-nums flex-shrink-0">{fmtCompact(i.amount, i.currency)}</span></div>
                  <div>
                    {i.declared
                      ? <>Declared by you · {i.late ? `expected ${i.whenText}, not recorded yet` : `on ${i.whenText}`}</>
                      : <>Estimate · {i.accountName} · {i.late ? `usually by the ${i.day}, not recorded yet` : `usually on the ${i.day}`} · seen in {i.months} of the last 3 months
                        {i.got ? ` · ${fmtCompact(i.got, i.currency)} already in, usual ${fmtCompact(i.usual ?? 0, i.currency)}` : ''}</>}
                  </div>
                </div>
              ))}
              {rest.incoming.length > 0 && <div className="pt-1" style={{ color: '#3F7A5E' }}>Not right? <Link href="/dashboard/settings/income" className="font-semibold underline">Set your expected income</Link>.</div>}
            </div>
          </details>
          {rest.dueGroups.map(g => <Line key={g.label} label={`− ${g.label}`} value={money(g.amount)} onOpen={() => group(g, `What's still due from your bank by the end of ${thisName}.`)} />)}
          {rest.sentHome > 0 && <Line label="− Usually sent to India" value={money(rest.sentHome)} />}
          <div className="mt-auto">
            <Line label="= Month end" value={signed(rest.endOfMonth)} strong ink={rest.endOfMonth < 0 ? '#DC2626' : undefined} />
            {rest.budgetsLeft > 0 && <Line label="After your usual spending" value={signed(rest.afterBudgets)} ink={rest.afterBudgets < 0 ? '#DC2626' : '#1E8F5F'}
              onOpen={() => setDetail({ title: 'Your usual spending', intro: `Month end ${signed(rest.endOfMonth)}, less ${money(rest.budgetsLeft)} your usual spending will still take from your bank in ${thisName}, leaves ${signed(rest.afterBudgets)}.`, rows: rest.usual, total: money(rest.budgetsLeft),
                foot: { text: 'From your budgets, or your last 3 months where there is no budget. Spending on a card isn’t here: it leaves through the card’s bill.', href: '/dashboard/budgets', link: 'Set a budget' } })} />}
          </div>
        </Column>
        <Column title={nextName} sub="estimate">
          <Line label="Usual income" value={money(next.income)} ink="#1E8F5F" />
          {next.groups.map(g => <Line key={g.label} label={`− ${g.label}`} value={money(g.amount)} onOpen={() => group(g, `What's expected from your bank in ${nextName}. Amounts are estimates.`)} />)}
          {next.sentHome > 0 && <Line label="− Usually sent to India" value={money(next.sentHome)} />}
          <div className="mt-auto">
            <Line label="= Left to plan" value={signed(next.toPlan)} strong ink={next.toPlan < 0 ? '#DC2626' : undefined} />
            {next.events.length > 0 && <div className="text-[11.5px] mt-0.5" style={{ color: '#1D5FA8' }}>Also coming: {next.events.map(e => e.name).join(', ')}</div>}
          </div>
        </Column>
        <Column title={`Committed in ${nextName}`}>
          {next.items.length === 0 && <div className="text-[12.5px] py-2" style={{ color: 'var(--text3)' }}>Nothing fixed yet. EMIs, SIPs, RDs, rent and card bills show here.</div>}
          {next.items.slice(0, 5).map(i => <Line key={i.id} label={i.label} value={fmtCompact(i.amount, i.currency)} />)}
          {next.items.length > 5 && <button type="button" onClick={() => setDetail({ title: `Committed in ${nextName}`, intro: `Everything ${nextName} is already committed to.`, rows: next.items, total: money(next.committed), foot: BILLS_FOOT })} className="text-[11.5px] mt-auto pt-1 text-left font-semibold underline" style={{ color: 'var(--accent)' }}>and {next.items.length - 5} more</button>}
        </Column>
      </div>
      {detail && <PlanDetailSheet d={detail} onClose={() => setDetail(null)} />}
    </section>
  )
}
