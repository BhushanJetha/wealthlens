'use client'
import { useState } from 'react'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { fmtCompact, fmtMoney } from '@/lib/format'
import { fmtDay, daysBetween } from '@/lib/insights'
import type { HomePlan, Reminder } from '@/lib/homePlan'
import type { BalanceWarning } from '@/lib/moneyOverview'
import type { RoomLine } from '@/lib/spendRoom'
import { PlanDetailSheet, type FreeCard, type PlanDetail } from './HomeCards'
import { otherAssetValue } from '@/lib/otherAssets'

const MON = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const SHORT = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']
const Card = ({ title, right, children, className = '' }: { title: string; right?: React.ReactNode; children: React.ReactNode; className?: string }) => (
  <section className={`wl-card p-4 md:px-5 md:py-[18px] flex flex-col gap-3 min-w-0 ${className}`}>
    <div className="flex items-baseline justify-between gap-2"><h2 className="text-[15px] font-semibold" style={{ color: 'var(--text)' }}>{title}</h2>{right}</div>
    {children}
  </section>
)
const More = ({ href, children }: { href: string; children: React.ReactNode }) => <Link href={href} className="text-[12.5px] font-semibold hover:underline" style={{ color: 'var(--accent)' }}>{children}</Link>

// What's free to spend until payday, per currency (dirhams can't pay in India), and where the month should end
export function FreeBanner({ cards, endOfMonth, afterUsual, days, money }: { cards: FreeCard[]; endOfMonth: number; afterUsual: number | null; days: number; money: (n: number) => string }) {
  return (
    <Link href="/dashboard/money" aria-label="Free to spend, open the detail" className="rounded-[18px] px-4 md:px-[22px] py-4 md:py-5 flex flex-wrap items-stretch gap-4 md:gap-6 text-white" style={{ background: '#14172B' }}>
      {cards.map(c => (
        <div key={c.cur} className="flex-1 min-w-[150px]">
          <div className="text-[12.5px]" style={{ color: '#C9CBE0' }}>Free to spend{cards.length > 1 ? ` · ${c.cur === 'AED' ? 'UAE' : 'India'}` : ''} {c.amount < 0 ? '· short' : `until ${fmtDay(c.until)}`}</div>
          <div className="text-[28px] md:text-[34px] font-extrabold tabular-nums tracking-[-0.02em] leading-tight" style={{ color: c.amount < 0 ? '#FFB4A6' : '#fff' }}>{fmtMoney(c.amount, c.cur)}</div>
          <div className="text-[12.5px]" style={{ color: '#C9CBE0' }}>{c.perDay ? `About ${fmtCompact(c.perDay, c.cur)} a day` : ' '}</div>
          <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-2 text-[12px]" style={{ color: '#A9ACC6' }}>
            <span>Bank & cash <b className="text-white tabular-nums">{fmtCompact(c.cash, c.cur)}</b></span>
            <span>Due first <b className="text-white tabular-nums">{fmtCompact(c.due, c.cur)}</b></span>
            {c.reserved > 0 && <span>Set aside <b className="text-white tabular-nums">{fmtCompact(c.reserved, c.cur)}</b></span>}
          </div>
        </div>
      ))}
      <div className="flex-1 min-w-[200px] rounded-xl px-4 py-3 flex flex-col justify-center gap-1" style={{ background: 'rgba(255,255,255,.07)' }}>
        <div className="text-[12px]" style={{ color: '#C9CBE0' }}>Month end, in {days} day{days === 1 ? '' : 's'}</div>
        <div className="text-[20px] font-bold tabular-nums" style={{ color: endOfMonth < 0 ? '#FFB4A6' : '#fff' }}>{endOfMonth < 0 ? '−' : ''}{money(Math.abs(endOfMonth))}</div>
        {afterUsual != null && <div className="text-[12px]" style={{ color: afterUsual < 0 ? '#FFB4A6' : '#8EF0BF' }}>{afterUsual < 0 ? '−' : ''}{money(Math.abs(afterUsual))} after your usual spending</div>}
        <div className="text-[12px] font-semibold mt-1 inline-flex items-center gap-0.5" style={{ color: '#A79BFF' }}>See the detail<ChevronRight size={14} /></div>
      </div>
    </Link>
  )
}

// Next month: what's expected in, where it goes, and what's left to plan — one bar
const PLAN_COLORS = ['#0F766E', '#C2410C', '#2FB67C', '#3B8EF0', '#DB2777', '#C98A0B', '#64748B']
export function NextMonthCard({ plan, money }: { plan: HomePlan; money: (n: number) => string }) {
  const { next } = plan
  const [detail, setDetail] = useState<PlanDetail | null>(null)
  const name = MON[Number(next.ym.slice(5)) - 1]
  const parts = [
    ...next.groups.map((g, i) => ({ label: g.label, amount: g.amount, color: PLAN_COLORS[i % PLAN_COLORS.length], open: () => setDetail({ title: g.label, intro: `What's expected from your bank in ${name}. Amounts are estimates.`, rows: g.items, total: money(g.amount), foot: /Rent/.test(g.label) ? { text: 'You can change these on', href: '/dashboard/bills', link: 'Plan › Bills' } : undefined }) })),
    ...(next.sentHome > 0 ? [{ label: 'Usually sent to India', amount: next.sentHome, color: '#64748B', open: undefined }] : []),
  ].filter(x => x.amount > 0)
  const left = next.toPlan, base = Math.max(next.income, parts.reduce((s, x) => s + x.amount, 0) + Math.max(0, left)) || 1
  return (
    <Card title={`${name} plan`} right={<More href="/dashboard/plan">Plan</More>}>
      <p className="text-[12px] -mt-2" style={{ color: 'var(--text3)' }}>{money(next.income)} usual income, and where it goes</p>
      <div className="flex gap-[2px] h-4" role="img" aria-label={[...parts.map(x => `${x.label} ${money(x.amount)}`), `left to plan ${money(left)}`].join(', ')}>
        {parts.map((x, i) => <div key={x.label} style={{ flex: `${x.amount / base} 1 0`, background: x.color, borderRadius: i === 0 ? '5px 0 0 5px' : 0 }} />)}
        {left > 0 && <div style={{ flex: `${left / base} 1 0`, background: 'var(--accent)', borderRadius: '0 5px 5px 0' }} />}
      </div>
      <div className="flex flex-col">
        {parts.map(x => {
          const row = (<><i className="w-2.5 h-2.5 rounded-[3px] flex-shrink-0" style={{ background: x.color }} /><span className="flex-1 min-w-0 truncate text-left">{x.label}</span><b className="tabular-nums">{money(x.amount)}</b>{x.open && <ChevronRight size={14} style={{ color: 'var(--text4)' }} />}</>)
          return x.open ? <button key={x.label} type="button" onClick={x.open} className="flex items-center gap-2.5 min-h-[34px] text-[13px] rounded-lg -mx-1.5 px-1.5 hover:bg-[#FAFAFE]" style={{ color: 'var(--text)' }}>{row}</button>
            : <div key={x.label} className="flex items-center gap-2.5 min-h-[34px] text-[13px] -mx-1.5 px-1.5" style={{ color: 'var(--text)' }}>{row}</div>
        })}
        <div className="flex items-center gap-2.5 min-h-[40px] text-[13.5px] mt-1 pt-1" style={{ borderTop: '1px solid var(--track)' }}>
          <i className="w-2.5 h-2.5 rounded-[3px] flex-shrink-0" style={{ background: left < 0 ? '#DC2626' : 'var(--accent)' }} />
          <span className="flex-1 font-semibold" style={{ color: 'var(--text)' }}>{left < 0 ? 'Short' : 'Left to plan'}</span>
          <b className="text-[16px] tabular-nums" style={{ color: left < 0 ? '#B4231A' : 'var(--accent2)' }}>{left < 0 ? '−' : ''}{money(Math.abs(left))}</b>
        </div>
        {next.events.length > 0 && <div className="text-[11.5px] mt-1" style={{ color: '#1D5FA8' }}>Also coming: {next.events.map((e: any) => e.name).join(', ')}</div>}
      </div>
      {detail && <PlanDetailSheet d={detail} onClose={() => setDetail(null)} />}
    </Card>
  )
}

// This month's budgets, the fullest first
export function BudgetsCard({ lines }: { lines: (RoomLine & { cur: 'AED' | 'INR' })[] }) {
  const shown = lines.filter(l => !l.estimated && l.cap > 0).sort((a, b) => b.spent / b.cap - a.spent / a.cap).slice(0, 5)
  return (
    <Card title="Budgets" right={<More href="/dashboard/budgets">All</More>}>
      {shown.length === 0 ? <p className="text-[12.5px] py-3" style={{ color: 'var(--text3)' }}>No budgets this month. <Link href="/dashboard/budgets" className="font-semibold underline" style={{ color: 'var(--accent)' }}>Set one</Link> and see how it’s going here.</p> : (
        <div className="flex flex-col gap-3">
          {shown.map(l => {
            const r = l.spent / l.cap, color = r > 1 ? '#DC2626' : r >= 0.85 ? '#D97706' : 'var(--accent)'
            return (
              <div key={`${l.cur}${l.category}`}>
                <div className="flex justify-between gap-2 text-[13px]"><span className="truncate" style={{ color: 'var(--text)' }}>{l.category}</span>
                  <span className="tabular-nums flex-shrink-0" style={{ color: 'var(--text3)' }}><b style={{ color: r > 1 ? '#B4231A' : 'var(--text)' }}>{fmtCompact(l.spent, l.cur)}</b> / {fmtCompact(l.cap, l.cur)}</span></div>
                <div className="h-2 rounded-full mt-1.5" style={{ background: 'var(--track)' }} role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(r * 100)} aria-label={`${l.category} budget used`}>
                  <div className="h-full rounded-full" style={{ width: `${Math.min(100, r * 100)}%`, background: color }} />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </Card>
  )
}

// What's due in the next 7 days, with any balance that won't cover it
export function DueWeekCard({ today, items, later, warnings, dueTotal, money }: { today: string; items: Reminder[]; later: Reminder[]; warnings: BalanceWarning[]; dueTotal: number; money: (n: number) => string }) {
  const list = items.length ? items : later
  return (
    <Card title={items.length ? 'Due this week' : 'Coming up'} right={<span className="text-[12.5px] tabular-nums" style={{ color: 'var(--text3)' }}>{dueTotal > 0 ? `${money(dueTotal)} out` : ''}</span>}>
      {warnings.slice(0, 2).map(w => (
        <Link key={w.id} href={w.href ?? '/dashboard/accounts'} className="flex gap-2 items-start rounded-lg px-2.5 py-2 text-[12.5px] font-semibold" style={{ background: w.severity === 'high' ? '#FEF2F2' : '#FFF8EC', color: w.severity === 'high' ? '#B91C1C' : 'var(--text)' }}>
          <span className="w-2 h-2 rounded-full mt-[5px] flex-shrink-0" style={{ background: w.severity === 'high' ? '#DC2626' : '#D97706' }} />{w.title}
        </Link>
      ))}
      {list.length === 0 ? <p className="text-[12.5px] py-3" style={{ color: 'var(--text3)' }}>Nothing due in the next few weeks.</p> : (
        <div className="flex flex-col">
          {list.slice(0, 5).map(r => {
            const d = daysBetween(today, r.date)
            return (
              <Link key={r.id} href={r.href} className="flex items-center gap-3 min-h-[48px] rounded-lg -mx-1.5 px-1.5 hover:bg-[#FAFAFE]">
                <span className="w-[42px] text-center rounded-[10px] py-1 flex-shrink-0" style={{ background: r.dir === 'in' ? '#E7F7EF' : '#F0EDFF', color: r.dir === 'in' ? '#1E8F5F' : '#4B3BC4' }}>
                  <span className="block text-[10px] font-semibold">{d === 0 ? 'TODAY' : SHORT[Number(r.date.slice(5, 7)) - 1]}</span>
                  <span className="block text-[15px] font-bold leading-tight">{Number(r.date.slice(8, 10))}</span>
                </span>
                <span className="flex-1 min-w-0"><span className="block text-[13.5px] font-medium truncate" style={{ color: 'var(--text)' }}>{r.label}</span><span className="block text-[12px] truncate" style={{ color: 'var(--text3)' }}>{r.sub}</span></span>
                {r.amount != null && <b className="text-[13.5px] tabular-nums flex-shrink-0" style={{ color: r.dir === 'in' ? '#1E8F5F' : 'var(--text)' }}>{r.dir === 'in' ? '+' : ''}{fmtCompact(r.amount, r.currency)}</b>}
              </Link>
            )
          })}
        </div>
      )}
      <More href="/dashboard/bills">All bills</More>
    </Card>
  )
}

// Goals as rings
const RING = ['#2FB67C', '#3B8EF0', '#F29A2E']
export function GoalRingsCard({ goals, short }: { goals: { id: string; name: string; pct: number; current: number; target: number }[]; short: (n: number) => string }) {
  const C = 2 * Math.PI * 32
  return (
    <Card title="Goals" right={<More href="/dashboard/goals">All</More>}>
      {goals.length === 0 ? <p className="text-[12.5px] py-3" style={{ color: 'var(--text3)' }}>No goals yet. <Link href="/dashboard/goals" className="font-semibold underline" style={{ color: 'var(--accent)' }}>Set one</Link> and link what you save for it.</p> : (
        <div className="grid grid-cols-3 gap-2 text-center">
          {goals.slice(0, 3).map((g, i) => (
            <Link key={g.id} href={`/dashboard/goals/${g.id}`} className="flex flex-col items-center gap-1.5 min-w-0 rounded-xl py-1 hover:bg-[#FAFAFE]">
              <span className="relative w-[76px] h-[76px]">
                <svg viewBox="0 0 80 80" className="w-[76px] h-[76px]" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={g.pct} aria-label={`${g.name} progress`}>
                  <circle cx="40" cy="40" r="32" fill="none" stroke="var(--track)" strokeWidth="8" />
                  <circle cx="40" cy="40" r="32" fill="none" stroke={RING[i]} strokeWidth="8" strokeLinecap="round" strokeDasharray={`${(g.pct / 100 * C).toFixed(1)} ${C.toFixed(1)}`} transform="rotate(-90 40 40)" />
                </svg>
                <span className="absolute inset-0 flex items-center justify-center text-[15px] font-bold" style={{ color: 'var(--text)' }}>{g.pct}%</span>
              </span>
              <span className="text-[12.5px] font-semibold truncate max-w-full" style={{ color: 'var(--text)' }}>{g.name}</span>
              <span className="text-[11.5px]" style={{ color: 'var(--text3)' }}>{short(g.current)} of {short(g.target)}</span>
            </Link>
          ))}
        </div>
      )}
    </Card>
  )
}

// Each loan: what's left, how much is paid off, when it ends
export function LoansCard({ loans, toView, money, homes = [], today }: { loans: any[]; toView: (n: number, c: string) => number; money: (n: number) => string; homes?: any[]; today: string }) {
  const rows = loans.map(l => {
    const owed = Math.max(0, Number(l.outstanding_amt) || 0), drawn = Math.max(Number(l.disbursed_amt) || Number(l.sanctioned_amt) || 0, owed)
    const start = String(l.loan_start_date ?? ''), months = Number(l.tenure_months) || 0
    const end = /^\d{4}-\d{2}/.test(start) && months ? (() => { const t = Number(start.slice(0, 4)) * 12 + Number(start.slice(5, 7)) - 1 + months; return `${MON[t % 12].slice(0, 3)} ${Math.floor(t / 12)}` })() : null
    // The home it bought, and how much of it is yours
    const home = homes.find(h => h.loan_id === l.id), hv = home ? otherAssetValue(home, today).value : 0
    return { id: l.id, name: l.name || l.bank_name || 'Loan', cur: l.currency === 'AED' ? 'AED' : 'INR', owed, paid: drawn > 0 ? Math.round((drawn - owed) / drawn * 100) : 0, end,
      home: home && hv > 0 ? { id: home.id, name: home.name, pct: Math.max(0, Math.round((hv - owed) / hv * 100)) } : null }
  }).filter(r => r.owed > 0).sort((a, b) => toView(b.owed, b.cur) - toView(a.owed, a.cur))
  const emi = loans.reduce((s, l) => s + toView(Number(l.emi_amount) || 0, l.currency), 0)
  return (
    <Card title="Loans" right={emi > 0 ? <span className="text-[12.5px] tabular-nums" style={{ color: 'var(--text3)' }}>{money(emi)} a month</span> : <More href="/dashboard/loans">All</More>}>
      {rows.length === 0 ? <p className="text-[12.5px] py-3" style={{ color: 'var(--text3)' }}>No loans to repay.</p> : (
        <div className="flex flex-col gap-3.5">
          {rows.slice(0, 3).map(r => (
            <Link key={r.id} href={r.home ? `/dashboard/assets/${r.home.id}` : `/dashboard/loans/detail/${r.id}`} className="block rounded-lg -mx-1.5 px-1.5 py-0.5 hover:bg-[#FAFAFE]">
              <div className="flex justify-between gap-2 text-[13px]"><span className="font-medium truncate" style={{ color: 'var(--text)' }}>{r.name}</span><span className="flex-shrink-0" style={{ color: 'var(--text3)' }}><b style={{ color: 'var(--text)' }}>{fmtCompact(r.owed, r.cur)}</b> left</span></div>
              <div className="h-2 rounded-full mt-1.5" style={{ background: 'var(--track)' }}><div className="h-full rounded-full" style={{ width: `${Math.max(2, r.paid)}%`, background: '#2FB67C' }} /></div>
              <div className="text-[11.5px] mt-1" style={{ color: 'var(--text3)' }}>{r.paid}% paid off{r.end ? ` · ends ${r.end}` : ''}{r.home && <> · <b style={{ color: '#15803D' }}>{r.home.name} {r.home.pct}% yours</b></>}</div>
            </Link>
          ))}
        </div>
      )}
    </Card>
  )
}

// One row of what needs you; the full list opens below it
export function NeedsYouBar({ count, titles, open, onToggle }: { count: number; titles: string[]; open: boolean; onToggle: () => void }) {
  if (count === 0) return (
    <div className="flex items-center gap-2 text-[13px]" style={{ color: 'var(--text2)' }}>
      <span className="w-5 h-5 rounded-full inline-flex items-center justify-center text-[11px]" style={{ background: 'var(--income-bg)', color: 'var(--income)' }}>✓</span>You’re all caught up
    </div>
  )
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button onClick={onToggle} aria-expanded={open} className="inline-flex items-center gap-2 h-9 pl-1.5 pr-3 rounded-full text-[13px] font-semibold" style={{ background: '#14172B', color: '#fff' }}>
        <span className="min-w-[22px] h-[22px] px-1 rounded-full inline-flex items-center justify-center text-[11.5px] font-bold" style={{ background: '#DC2626' }}>{count}</span>
        Needs you<ChevronRight size={14} className="transition-transform" style={{ transform: open ? 'rotate(90deg)' : 'none' }} />
      </button>
      {!open && titles.slice(0, 3).map(t => (
        <button key={t} onClick={onToggle} className="inline-flex items-center h-9 px-3 rounded-full text-[13px] max-w-[280px] truncate bg-white" style={{ border: '1px solid var(--line)', color: 'var(--text)' }}>{t}</button>
      ))}
    </div>
  )
}
