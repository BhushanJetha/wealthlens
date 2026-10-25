'use client'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Repeat, CalendarRange, CalendarClock, TrendingUp } from 'lucide-react'
import { useViewStore } from '@/store/viewStore'
import { findRecurring, buildHomeInsights, addMonths, daysInMonth, daysBetween, localToday, fmtDay, type Recurring } from '@/lib/insights'
import { viewAmount } from '@/lib/netWorth'
import { labelOf } from '@/lib/money'
import { fmtMoney, fmtCompact } from '@/lib/format'
import { PageHeader, InsightBar, AiActions, LearnStrip, KpiTile, Panel, Donut, ProgressRow, Segmented, EmptyState, PALETTE, PALETTE_BG } from '@/components/ui/kit'

const ordinal = (n: number) => `${n}${n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th'}`

// Bills & subscriptions (design v2). Regular charges are detected from
// statements with the same rule as Home's insight (lib/insights findRecurring);
// card bills, EMIs and premiums come from the records you've added.
export default function BillsClient({ transactions, cards, loans, insurance }: { transactions: any[]; cards: any[]; loans: any[]; insurance: any[] }) {
  const router = useRouter()
  const { view, fxRate: FX } = useViewStore()
  const [today, setToday] = useState('')
  const [sort, setSort] = useState<'amount' | 'date'>('amount')
  useEffect(() => { setToday(localToday()) }, [])

  const cur = view === 'uae' ? 'AED' : 'INR'
  const money = (n: number) => fmtMoney(n, cur)
  const short = (n: number) => fmtCompact(n, cur)
  const inView = (c: string) => view === 'consolidated' || (view === 'uae' ? c === 'AED' : c === 'INR')
  const thisMonth = today.slice(0, 7)

  const bills = useMemo(() => !today ? [] : findRecurring(
    transactions.filter(t => t.txn_date && inView(t.currency)), thisMonth,
    t => viewAmount(Number(t.amount) || 0, t.currency, view, FX)), [transactions, view, FX, today])

  // Card bills, loan EMIs and premiums due in the next 30 days
  const scheduled = useMemo(() => !today ? [] : buildHomeInsights({
    view, fx: FX, today, focusMonth: thisMonth, txns: [], accounts: cards, loans, insurance,
    fixedDeposits: [], budgets: [], mutualFunds: [], stocks: [], cash: 0, invested: { value: 0, cost: 0 },
  }).upcoming.filter(u => u.kind === 'card' || u.kind === 'emi' || u.kind === 'premium'), [cards, loans, insurance, view, FX, today])

  // Next expected charge: this month if it hasn't shown up yet, else next month
  const dueOf = (r: Recurring) => {
    const ym = r.paidThisMonth ? addMonths(thisMonth, 1) : thisMonth
    return `${ym}-${String(Math.min(r.day, daysInMonth(ym))).padStart(2, '0')}`
  }
  const rows = bills.map(r => {
    const due = dueOf(r), days = today ? daysBetween(today, due) : 0
    return { ...r, due, days, late: !r.paidThisMonth && days < 0 }
  })
  const sorted = sort === 'amount' ? rows : [...rows].sort((a, b) => a.due.localeCompare(b.due))

  const monthly = bills.reduce((a, r) => a + r.med, 0)
  const rises = bills.filter(r => r.rose != null).sort((a, b) => (b.rose ?? 0) - (a.rose ?? 0))
  const comingUp = [
    ...scheduled.map(u => ({ id: u.id, date: u.date, label: u.label, sub: u.sub, amount: viewAmount(u.amount, u.currency, view, FX), est: false })),
    ...rows.filter(r => !r.late && r.days >= 0 && r.days <= 30).map(r => ({ id: `r-${r.key}`, date: r.due, label: r.name, sub: `${labelOf(r.category)} · expected`, amount: r.med, est: true })),
  ].sort((a, b) => a.date.localeCompare(b.date))
  const week = comingUp.filter(u => daysBetween(today, u.date) <= 7)

  // Category order follows monthly cost; colour follows the category
  const byCat = Object.entries(bills.reduce<Record<string, number>>((o, r) => { o[r.category] = (o[r.category] ?? 0) + r.med; return o }, {}))
    .sort((a, b) => b[1] - a[1])
  const catIdx = (c: string) => Math.min(Math.max(byCat.findIndex(([k]) => k === c), 0), PALETTE.length - 1)

  const listText = bills.map(r => `${r.name} ${money(r.med)}/month (${labelOf(r.category)})`).join(', ')
  const insight = bills.length
    ? `${bills.length} regular charge${bills.length === 1 ? '' : 's'} cost about ${money(monthly)} a month, or ${short(monthly * 12)} a year.`
      + (rises[0] ? ` ${rises[0].name}'s latest charge was ${rises[0].rose}% above usual.` : '')
      + (week.length ? ` ${week.length} payment${week.length === 1 ? ' is' : 's are'} due in the next 7 days.` : '')
    : `No regular charges spotted yet. We look for the same merchant at a steady amount in 3 of the last 4 months.`
      + (week.length ? ` ${week.length} card, loan or premium payment${week.length === 1 ? ' is' : 's are'} due in the next 7 days.` : '')

  if (today && bills.length === 0 && scheduled.length === 0) return (
    <div className="flex flex-col gap-3.5 md:gap-[18px] animate-fade-up">
      <PageHeader title="Bills & subscriptions" sub="Found in your statements, so you never miss a due date" />
      <EmptyState message="Bills show up here once a merchant charges you a steady amount in 3 of the last 4 months. Import a few months of bank or card statements, or add your cards, loans and policies."
        cta="Import statements" onCta={() => router.push('/dashboard/ingest')} />
    </div>
  )

  return (
    <div className="flex flex-col gap-3.5 md:gap-[18px] animate-fade-up">
      <PageHeader title="Bills & subscriptions" sub="Found in your statements, so you never miss a due date"
        actions={<button onClick={() => router.push('/dashboard/ingest')} className="wl-btn" style={{ height: 34 }}>Import statements</button>} />

      <InsightBar text={insight} prompt={`Explain my bills and subscriptions and point out anything worth reviewing. ${listText ? `Regular charges: ${listText}.` : ''}`} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 md:gap-3.5">
        <KpiTile label="Per month" value={short(monthly)} delta={`${bills.length} regular charge${bills.length === 1 ? '' : 's'}`} tint={0} icon={Repeat} />
        <KpiTile label="Per year" value={short(monthly * 12)} delta="at their usual amounts" tint={2} icon={CalendarRange} />
        <KpiTile label="Due in 7 days" value={week.length ? short(week.reduce((a, u) => a + u.amount, 0)) : '—'}
          delta={week.length ? `${week.length} payment${week.length === 1 ? '' : 's'}` : 'Nothing due this week'} tint={3} icon={CalendarClock} />
        <KpiTile label="Price rises" value={String(rises.length)} tint={1} icon={TrendingUp}
          tone={rises.length ? 'bad' : 'good'} delta={rises[0] ? `${rises[0].name} +${rises[0].rose}%` : 'None in the latest charges'} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-3.5 md:gap-4 items-start">
        <div className="flex flex-col gap-3.5 md:gap-4 min-w-0">
          <Panel title="Coming up · next 30 days">
            {comingUp.length === 0
              ? <p className="text-[12.5px] mt-2" style={{ color: 'var(--text3)' }}>Nothing due in the next 30 days.</p>
              : <div className="mt-1.5">
                {comingUp.map((u, i) => {
                  const d = daysBetween(today, u.date)
                  return (
                    <div key={u.id} className="flex items-center gap-3 py-2.5" style={{ borderTop: i ? '1px solid var(--track)' : undefined }}>
                      <div className="w-[42px] flex-shrink-0 text-center rounded-[10px] py-1" style={{ background: d <= 7 ? 'var(--accent-bg)' : 'var(--track)' }}>
                        <div className="text-[15px] font-bold leading-none" style={{ color: d <= 7 ? 'var(--accent2)' : 'var(--text)' }}>{Number(u.date.slice(8, 10))}</div>
                        <div className="text-[9.5px] font-semibold uppercase mt-0.5" style={{ color: 'var(--text3)' }}>{fmtDay(u.date).split(' ')[1]}</div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[13px] font-semibold truncate" style={{ color: 'var(--text)' }}>{u.label}</div>
                        <div className="text-[11.5px] truncate" style={{ color: 'var(--text3)' }}>{u.sub} · {d === 0 ? 'today' : d === 1 ? 'tomorrow' : `in ${d} days`}</div>
                      </div>
                      <div className="text-[13px] font-semibold tabular-nums whitespace-nowrap" style={{ color: 'var(--text)' }}>{u.est ? '~' : ''}{money(u.amount)}</div>
                    </div>
                  )
                })}
              </div>}
          </Panel>

          <Panel title="Regular charges" right={bills.length > 1 &&
            <Segmented label="Sort charges" value={sort} onChange={setSort} options={[{ value: 'amount', label: 'Amount' }, { value: 'date', label: 'Date' }]} />}>
            {bills.length === 0
              ? <p className="text-[12.5px] mt-2 leading-normal" style={{ color: 'var(--text3)' }}>None spotted yet. A charge shows up here once the same merchant bills a steady amount (within 15%) in 3 of the last 4 months.</p>
              : <div className="mt-1.5">
                {sorted.map((r, i) => (
                  <div key={r.key} className="flex items-center gap-3 py-2.5" style={{ borderTop: i ? '1px solid var(--track)' : undefined }}>
                    <span className="w-[34px] h-[34px] rounded-[10px] flex items-center justify-center flex-shrink-0 text-[14px] font-bold"
                      style={{ background: PALETTE_BG[catIdx(r.category)], color: PALETTE[catIdx(r.category)] }}>{r.name.trim()[0]?.toUpperCase()}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-semibold truncate" style={{ color: 'var(--text)' }}>{r.name}</div>
                      <div className="text-[11.5px] truncate" style={{ color: 'var(--text3)' }}>
                        {labelOf(r.category)} · {r.n} of last 4 months<span className="max-md:hidden"> · usually the {ordinal(r.day)}</span>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="text-[13px] font-semibold tabular-nums" style={{ color: 'var(--text)' }}>{money(r.med)}<span className="font-normal text-[11px]" style={{ color: 'var(--text4)' }}>/mo</span></div>
                      <div className="text-[11px] font-semibold" style={{ color: r.rose != null ? '#B96A0B' : r.late ? '#B96A0B' : r.paidThisMonth ? '#1E8F5F' : 'var(--text3)' }}>
                        {r.rose != null ? `↑ ${r.rose}% last charge` : r.paidThisMonth ? 'Paid this month' : r.late ? 'Not seen yet' : `Due ${fmtDay(r.due)}`}
                      </div>
                    </div>
                  </div>
                ))}
              </div>}
          </Panel>
        </div>

        <div className="flex flex-col gap-3.5 md:gap-4 min-w-0">
          {byCat.length > 0 && (
            <Panel title="By category">
              <div className="flex items-center gap-4 mt-3">
                <Donut size={112} label="Regular charges by category" segments={byCat.map(([c, v]) => ({ value: v, color: PALETTE[catIdx(c)] }))}>
                  <div className="text-[10.5px]" style={{ color: 'var(--text3)' }}>a month</div>
                  <div className="text-[14px] font-bold tabular-nums" style={{ color: 'var(--text)' }}>{short(monthly)}</div>
                </Donut>
                <div className="flex-1 min-w-0 flex flex-col gap-2.5">
                  {byCat.slice(0, 5).map(([c, v]) => (
                    <ProgressRow key={c} name={labelOf(c)} value={short(v)} pct={monthly > 0 ? v / monthly * 100 : 0} color={PALETTE[catIdx(c)]} />
                  ))}
                </div>
              </div>
            </Panel>
          )}
          <Panel title="How we find them">
            <p className="text-[12.5px] leading-normal mt-1.5" style={{ color: 'var(--text3)' }}>
              The same merchant, a steady amount (within 15%), in at least 3 of the last 4 complete months, and no more than twice a month.
              Transfers to family, investments and card bill payments aren&apos;t counted. Card bills, EMIs and premiums come from the cards, loans and policies you&apos;ve added.
            </p>
          </Panel>
        </div>
      </div>

      <AiActions actions={['Which subscriptions could I cancel?', 'How can I lower my bills?']}
        context={listText ? `My regular charges (usual monthly amount): ${listText}.` : 'No regular charges were detected in my statements.'} />
      <LearnStrip title="Statement date vs due date" href="/dashboard/cards/learn" />
    </div>
  )
}
