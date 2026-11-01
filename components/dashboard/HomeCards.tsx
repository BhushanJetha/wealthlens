'use client'
import Link from 'next/link'
import { ArrowDownLeft, ArrowUpRight, CalendarDays, ChevronRight, HandCoins } from 'lucide-react'
import { fmtCompact } from '@/lib/format'
import { fmtDay, daysBetween } from '@/lib/insights'
import type { Reminder, HomePlan } from '@/lib/homePlan'
import type { BalanceWarning } from '@/lib/moneyOverview'

const MON = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

// The first thing on Home: what's actually free to spend, per currency
// (dirhams can't pay in India). Tap for the detail on Money.
export interface FreeCard { cur: 'AED' | 'INR'; amount: number; cash: number; due: number; until: string; perDay: number | null; payday: boolean }
export function FreeToSpendCard({ cards, className = '' }: { cards: FreeCard[]; className?: string }) {
  return (
    <Link href="/dashboard/money" aria-label="Free to spend, open the detail" className={`block rounded-[18px] md:rounded-[20px] bg-review text-white px-4 md:px-[22px] py-4 md:py-5 ${className}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.06em]" style={{ color: '#DAD3FF' }}>Free to spend</span>
        <ChevronRight size={17} style={{ color: '#DAD3FF' }} />
      </div>
      <div className={`grid gap-4 mt-1.5 ${cards.length > 1 ? 'grid-cols-2' : ''}`}>
        {cards.map(c => (
          <div key={c.cur} className="min-w-0">
            <div className={`${cards.length > 1 ? 'text-[23px] md:text-[32px]' : 'text-[34px] md:text-[38px]'} font-bold tabular-nums tracking-[-0.02em] leading-tight truncate`}>{fmtCompact(c.amount, c.cur)}</div>
            <div className="text-[12.5px] mt-0.5" style={{ color: '#E6E0FF' }}>
              {cards.length > 1 && <>{c.cur === 'AED' ? 'UAE' : 'India'} · </>}{c.amount < 0 ? 'short' : 'until'} {fmtDay(c.until)}{c.perDay ? ` · ${fmtCompact(c.perDay, c.cur)}/day` : ''}
            </div>
            <div className="text-[11.5px] mt-1" style={{ color: '#CFC6FF' }}>{fmtCompact(c.cash, c.cur)} in bank &amp; cash − {fmtCompact(c.due, c.cur)} due</div>
          </div>
        ))}
      </div>
    </Link>
  )
}

const dayText = (today: string, d: string) => { const n = daysBetween(today, d); return n === 0 ? 'Today' : n === 1 ? 'Tomorrow' : fmtDay(d) }

// Reminders: what goes out, what comes in, and trips coming up
export function NextWeekCard({ today, items, warnings, dueTotal, inTotal, money, friends, className = '' }: {
  today: string; items: Reminder[]; warnings: BalanceWarning[]; dueTotal: number; inTotal: number; money: (n: number) => string
  friends: { receive: string | null; pay: string | null }; className?: string
}) {
  return (
    <section aria-labelledby="week-title" className={`wl-card px-4 md:px-5 py-3.5 md:py-[18px] flex flex-col ${className}`}>
      <div className="flex items-center justify-between gap-2">
        <h2 id="week-title" className="text-[14px] font-semibold" style={{ color: 'var(--text)' }}>Next 7 days</h2>
        <Link href="/dashboard/bills" className="text-[12.5px] font-semibold hover:underline" style={{ color: 'var(--accent)' }}>All bills →</Link>
      </div>
      <div className="grid grid-cols-2 gap-2 mt-2.5">
        <div className="rounded-xl px-3 py-2" style={{ background: '#FDF2F2' }}>
          <div className="text-[11px] font-medium" style={{ color: '#7F1D1D' }}>Going out</div>
          <div className="text-[16px] font-bold tabular-nums" style={{ color: 'var(--text)' }}>{money(dueTotal)}</div>
        </div>
        <div className="rounded-xl px-3 py-2" style={{ background: '#EEF9F3' }}>
          <div className="text-[11px] font-medium" style={{ color: '#14603F' }}>Coming in</div>
          <div className="text-[16px] font-bold tabular-nums" style={{ color: 'var(--text)' }}>{money(inTotal)}</div>
        </div>
      </div>
      <ul className="mt-2">
        {warnings.slice(0, 2).map(w => (
          <li key={w.id} style={{ borderTop: '1px solid #F1F5F9' }}>
            <Link href={w.href ?? '/dashboard/accounts'} className="flex gap-2.5 items-start py-2 -mx-2 px-2 rounded-lg hover:bg-[#F5F3FE]">
              <span className="w-2 h-2 rounded-full mt-[5px] flex-shrink-0" style={{ background: w.severity === 'high' ? '#DC2626' : '#D97706' }} />
              <span className="min-w-0"><span className="block text-[13px] font-semibold" style={{ color: w.severity === 'high' ? '#B91C1C' : 'var(--text)' }}>{w.title}</span>
                <span className="block text-[12px]" style={{ color: 'var(--text3)' }}>{w.detail}</span></span>
            </Link>
          </li>
        ))}
        {items.slice(0, 7).map(r => {
          const Icon = r.dir === 'in' ? ArrowDownLeft : r.dir === 'event' ? CalendarDays : ArrowUpRight
          return (
            <li key={r.id} style={{ borderTop: '1px solid #F1F5F9' }}>
              <Link href={r.href} className="flex gap-2.5 items-center py-2 -mx-2 px-2 rounded-lg hover:bg-[#F5F3FE]">
                <span className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: r.dir === 'in' ? '#E7F7EF' : r.dir === 'event' ? '#E7F1FE' : '#F0EDFF', color: r.dir === 'in' ? '#1E8F5F' : r.dir === 'event' ? '#1D5FA8' : '#5640D6' }}><Icon size={14} /></span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-medium truncate" style={{ color: 'var(--text)' }}>{r.label}</span>
                  <span className="block text-[11.5px] truncate" style={{ color: 'var(--text3)' }}>{dayText(today, r.date)} · {r.sub}</span>
                </span>
                {r.amount != null && <span className="text-[13px] font-semibold tabular-nums flex-shrink-0" style={{ color: r.dir === 'in' ? '#1E8F5F' : 'var(--text)' }}>{r.dir === 'in' ? '+' : ''}{fmtCompact(r.amount, r.currency)}</span>}
              </Link>
            </li>
          )
        })}
        {items.length === 0 && warnings.length === 0 && <li className="text-[12.5px] py-4 text-center" style={{ color: 'var(--text3)', borderTop: '1px solid #F1F5F9' }}>Nothing due in the next 7 days.</li>}
        {(friends.receive || friends.pay) && (
          <li style={{ borderTop: '1px solid #F1F5F9' }}>
            <Link href="/dashboard/money/friends" className="flex gap-2.5 items-center py-2 -mx-2 px-2 rounded-lg hover:bg-[#F5F3FE]">
              <span className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: '#FFF2E2', color: '#B45309' }}><HandCoins size={14} /></span>
              <span className="min-w-0 flex-1 text-[13px] font-medium" style={{ color: 'var(--text)' }}>
                {[friends.receive && `Friends owe you ${friends.receive}`, friends.pay && `you owe ${friends.pay}`].filter(Boolean).join(' · ')}
              </span>
              <ChevronRight size={15} style={{ color: 'var(--text4)' }} />
            </Link>
          </li>
        )}
      </ul>
    </section>
  )
}

const Line = ({ label, value, strong, ink }: { label: string; value: string; strong?: boolean; ink?: string }) => (
  <div className="flex justify-between gap-3 py-1.5 text-[12.5px]" style={{ borderTop: strong ? '1px solid var(--line)' : undefined }}>
    <span style={{ color: strong ? 'var(--text)' : 'var(--text3)', fontWeight: strong ? 600 : 400 }}>{label}</span>
    <span className="tabular-nums font-semibold" style={{ color: ink ?? 'var(--text)' }}>{value}</span>
  </div>
)

// Looking ahead: where this month should end, and what next month already owes
export function PlanCard({ plan, money, className = '' }: { plan: HomePlan; money: (n: number) => string; className?: string }) {
  const { rest, next } = plan
  const nextName = MON[Number(next.ym.slice(5)) - 1]
  const signed = (n: number) => `${n < 0 ? '−' : ''}${money(Math.abs(n))}`
  return (
    <section aria-labelledby="plan-title" className={`wl-card px-4 md:px-5 py-3.5 md:py-[18px] flex flex-col ${className}`}>
      <div className="flex items-center justify-between gap-2">
        <h2 id="plan-title" className="text-[14px] font-semibold" style={{ color: 'var(--text)' }}>Plan ahead</h2>
        <Link href="/dashboard/budgets" className="text-[12.5px] font-semibold hover:underline" style={{ color: 'var(--accent)' }}>Budgets →</Link>
      </div>
      <div className="grid md:grid-cols-2 gap-x-6 gap-y-3 mt-2">
        <div className="min-w-0">
          <div className="text-[12.5px] font-semibold mb-0.5" style={{ color: 'var(--text2)' }}>Rest of this month <span className="font-normal" style={{ color: 'var(--text4)' }}>· {rest.days} day{rest.days === 1 ? '' : 's'}</span></div>
          <Line label="Bank & cash now" value={money(rest.cash)} />
          <Line label="+ Should come in" value={money(rest.comingIn)} ink="#1E8F5F" />
          <Line label="− Due to go out" value={money(rest.dueOut)} />
          <Line label="= Month end, before other spending" value={signed(rest.endOfMonth)} strong ink={rest.endOfMonth < 0 ? '#DC2626' : undefined} />
          {rest.budgetsLeft > 0 && <Line label="If you use your budgets too" value={signed(rest.afterBudgets)} ink={rest.afterBudgets < 0 ? '#DC2626' : '#1E8F5F'} />}
        </div>
        <div className="min-w-0">
          <div className="text-[12.5px] font-semibold mb-0.5" style={{ color: 'var(--text2)' }}>{nextName}</div>
          {next.income > 0 && <Line label="Usual income" value={money(next.income)} ink="#1E8F5F" />}
          <Line label={`− Already committed · ${next.items.length}`} value={money(next.committed)} />
          {next.income > 0 && <Line label="= Left to plan" value={signed(next.toPlan)} strong ink={next.toPlan < 0 ? '#DC2626' : undefined} />}
          {next.items.length > 0 && (
            <div className="text-[11.5px] mt-1 leading-snug" style={{ color: 'var(--text3)' }}>
              Biggest: {next.items.slice(0, 3).map(i => `${i.label} ${fmtCompact(i.amount, i.currency)}`).join(' · ')}
            </div>
          )}
          {next.events.length > 0 && <div className="text-[11.5px] mt-1" style={{ color: '#1D5FA8' }}>Also in {nextName}: {next.events.map(e => e.name).join(', ')}</div>}
        </div>
      </div>
    </section>
  )
}
