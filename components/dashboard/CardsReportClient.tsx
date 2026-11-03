'use client'
import { useEffect, useMemo, useState } from 'react'
import { CreditCard, Wallet, Tag, Landmark, ChevronDown, ChevronUp } from 'lucide-react'
import { useViewStore } from '@/store/viewStore'
import { useCategoryStore } from '@/store/categoryStore'
import { colorOf as catColorOf } from '@/lib/categories'
import { markUnitemisedCardBills, catOf, labelOf } from '@/lib/money'
import { kindOf } from '@/lib/ledger'
import { cardLimits } from '@/lib/cardCycle'
import { addMonths, fmtDay, localToday } from '@/lib/insights'
import { fmtMoney, fmtCompact } from '@/lib/format'
import { accountFlows, type AccountFlow } from '@/lib/accountFlows'
import { PageHeader, InsightBar, KpiTile, KpiGrid, EmptyState } from '@/components/ui/kit'

const monthsBetween = (a: string, b: string) => (Number(b.slice(0, 4)) - Number(a.slice(0, 4))) * 12 + Number(b.slice(5)) - Number(a.slice(5)) + 1

// Card spending (Money › Reports): what you bought on credit cards in the
// period picked at the top — on which card, on what, compared with the period
// before, and every charge. Card bills paid from a bank aren't spending again
// (lib/accountFlows); refunds and payments show on their own.
export default function CardsReportClient({ transactions, accounts, loans, fx }: { transactions: any[]; accounts: any[]; loans: any[]; fx: number }) {
  const { view, fromMonth, toMonth, fxRate } = useViewStore()
  const FX = fxRate || fx
  const { rows: categories, load } = useCategoryStore()
  useEffect(() => { load() }, [load])
  const colorOf = (c?: string) => (c ? catColorOf(categories, c) : '#6A55E8')

  const inView = (cur: string) => view === 'consolidated' || (view === 'uae' ? cur === 'AED' : cur !== 'AED')
  const toView = (n: number, cur: string) => view === 'consolidated' && cur === 'AED' ? n * FX : n
  const viewCur = view === 'uae' ? 'AED' : 'INR'
  const short = (n: number) => fmtCompact(n, viewCur)
  const mLabel = (m: string) => new Date(`${m}-01T00:00:00`).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })
  const rangeLabel = fromMonth === toMonth ? new Date(`${fromMonth}-01T00:00:00`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }) : `${mLabel(fromMonth)} – ${mLabel(toMonth)}`
  // The same number of months just before, to compare with
  const span = Math.max(1, monthsBetween(fromMonth, toMonth))
  const prevFrom = addMonths(fromMonth, -span), prevTo = addMonths(fromMonth, -1)
  const prevLabel = span === 1 ? mLabel(prevFrom).split(' ')[0] : 'the period before'
  // A month that's still running is compared with a whole one — say so
  const running = toMonth >= localToday().slice(0, 7)

  const marked = useMemo(() => markUnitemisedCardBills(transactions, new Set(accounts.filter(a => kindOf(a) === 'card').map(a => a.id))), [transactions, accounts])
  const flowsFor = (a: string, b: string) => accountFlows(accounts, marked, FX, d => { const m = d.slice(0, 7); return m >= a && m <= b })
    .filter(f => kindOf(f.account) === 'card' && inView(f.account.currency ?? 'INR'))
  const cards = useMemo(() => flowsFor(fromMonth, toMonth), [marked, accounts, FX, fromMonth, toMonth, view]) // eslint-disable-line react-hooks/exhaustive-deps
  const prev = useMemo(() => flowsFor(prevFrom, prevTo), [marked, accounts, FX, prevFrom, prevTo, view]) // eslint-disable-line react-hooks/exhaustive-deps

  const spentOf = (f: AccountFlow) => f.outs.filter(l => l.kind === 'spend' || l.kind === 'emi').reduce((a, l) => a + l.amount, 0)
  const paidOf = (f: AccountFlow) => f.ins.filter(l => l.kind === 'payment').reduce((a, l) => a + l.amount, 0)
  const rows = cards.map(f => ({ f, spent: spentOf(f), v: toView(spentOf(f), f.account.currency), prevV: toView(spentOf(prev.find(p => p.account.id === f.account.id) ?? { outs: [] } as any), f.account.currency) }))
    .filter(r => r.spent > 0 || r.f.ins.length > 0).sort((a, b) => b.v - a.v)
  const total = rows.reduce((a, r) => a + r.v, 0)
  const prevTotal = prev.reduce((a, f) => a + toView(spentOf(f), f.account.currency), 0)
  const paid = rows.reduce((a, r) => a + toView(paidOf(r.f), r.f.account.currency), 0)
  const change = prevTotal > 0 ? Math.round((total - prevTotal) / prevTotal * 100) : null
  // Across all cards, by category
  const byCat = new Map<string, number>()
  for (const r of rows) for (const l of r.f.outs) if (l.kind === 'spend') byCat.set(l.category ?? l.label, (byCat.get(l.category ?? l.label) ?? 0) + toView(l.amount, r.f.account.currency))
  const cats = Array.from(byCat.entries()).sort((a, b) => b[1] - a[1])
  const cardCount = accounts.filter(a => kindOf(a) === 'card' && a.is_active !== false && inView(a.currency)).length
  const top = rows[0]

  const summary = total > 0
    ? `${rangeLabel}: ${short(total)} spent on ${rows.filter(r => r.spent > 0).length} card${rows.filter(r => r.spent > 0).length === 1 ? '' : 's'}${top ? ` — most on ${top.f.account.name} (${short(top.v)}, ${Math.round(top.v / total * 100)}%)` : ''}.${cats[0] ? ` Biggest: ${labelOf(cats[0][0])} ${short(cats[0][1])}.` : ''}${change != null ? ` ${change > 0 ? `${change}% more` : change < 0 ? `${-change}% less` : 'the same'} than ${prevLabel}${running ? ' so far — this month is still running' : ''}.` : ''}`
    : `Nothing was charged to your cards in ${rangeLabel}.`

  if (!cardCount && !rows.length) return (
    <div className="flex flex-col gap-3.5 md:gap-[18px] animate-fade-up">
      <PageHeader title="Card spending" sub="What you buy on each credit card" />
      <EmptyState message="Add a credit card (or import a card statement) to see what you spend on each card, month by month." />
    </div>
  )

  return (
    <div className="flex flex-col gap-3.5 md:gap-[18px] animate-fade-up">
      <PageHeader title="Card spending" sub={`${rangeLabel} · what you bought on each credit card`} />
      <InsightBar text={summary} prompt={`Explain my credit card spending. ${summary}`} />

      <KpiGrid>
        <KpiTile label="Spent on cards" value={short(total)} tint={3} icon={CreditCard} tone={change == null ? 'neutral' : change > 10 ? 'bad' : 'good'}
          delta={change == null ? 'purchases and card-loan EMIs' : `${change > 0 ? '+' : ''}${change}% vs ${prevLabel}${running ? ' · so far' : ''}`} />
        <KpiTile label="Paid to cards" value={short(paid)} tint={1} icon={Landmark} delta="card bills paid from your banks" />
        <KpiTile label="Cards used" value={`${rows.filter(r => r.spent > 0).length} of ${cardCount || rows.length}`} tint={0} icon={Wallet} delta={top ? `most on ${top.f.account.name}` : '—'} />
        <KpiTile label="Biggest category" value={cats[0] ? labelOf(cats[0][0]) : '—'} tint={2} icon={Tag} delta={cats[0] ? `${short(cats[0][1])} · ${Math.round(cats[0][1] / Math.max(total, 1) * 100)}% of card spending` : '—'} />
      </KpiGrid>

      {rows.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5 md:gap-4 wl-even">
          <section className="wl-card px-4 md:px-5 py-4 md:py-[18px]">
            <h2 className="text-[14px] md:text-[15px] font-semibold" style={{ color: 'var(--text)' }}>By card</h2>
            {rows.map(r => {
              const cl = cardLimits(r.f.account, loans), d = r.prevV > 0 ? Math.round((r.v - r.prevV) / r.prevV * 100) : null
              return (
                <a key={r.f.account.id} href={`#card-${r.f.account.id}`} className="block mt-3">
                  <div className="flex justify-between gap-3 text-[13px]">
                    <span className="truncate font-semibold" style={{ color: 'var(--text)' }}>{r.f.account.name}</span>
                    <span className="tabular-nums font-semibold flex-shrink-0" style={{ color: 'var(--text)' }}>{short(r.v)} <span className="font-normal" style={{ color: 'var(--text4)' }}>· {total > 0 ? Math.round(r.v / total * 100) : 0}%</span></span>
                  </div>
                  <div className="h-2 rounded-full mt-1.5" style={{ background: 'var(--track)' }}><div className="h-full rounded-full" style={{ width: `${Math.max(r.v / Math.max(total, 1) * 100, 1.5)}%`, background: '#9333EA' }} /></div>
                  <div className="flex justify-between gap-3 text-[11.5px] mt-1" style={{ color: 'var(--text4)' }}>
                    <span>owed now {fmtMoney(Number(r.f.account.outstanding_bal) || 0, r.f.account.currency)}{cl.util != null ? ` · ${Math.round(cl.util)}% of limit` : ''}</span>
                    {d != null && <span style={{ color: d > 10 ? '#D9482F' : d < 0 ? '#1E8F5F' : 'var(--text4)' }}>{d > 0 ? '+' : ''}{d}% vs {prevLabel}</span>}
                  </div>
                </a>
              )
            })}
          </section>
          <section className="wl-card px-4 md:px-5 py-4 md:py-[18px]">
            <h2 className="text-[14px] md:text-[15px] font-semibold" style={{ color: 'var(--text)' }}>By category, all cards</h2>
            {cats.length === 0 && <div className="text-[12.5px] mt-3" style={{ color: 'var(--text4)' }}>No purchases on cards in this period.</div>}
            {cats.map(([c, v]) => (
              <div key={c} className="mt-3">
                <div className="flex justify-between gap-3 text-[13px]">
                  <span className="truncate" style={{ color: 'var(--text2)' }}>{labelOf(c)}</span>
                  <span className="tabular-nums font-semibold flex-shrink-0" style={{ color: 'var(--text)' }}>{short(v)} <span className="font-normal" style={{ color: 'var(--text4)' }}>· {Math.round(v / Math.max(total, 1) * 100)}%</span></span>
                </div>
                <div className="h-2 rounded-full mt-1.5" style={{ background: 'var(--track)' }}><div className="h-full rounded-full" style={{ width: `${Math.max(v / Math.max(cats[0][1], 1) * 100, 1.5)}%`, background: colorOf(c) }} /></div>
              </div>
            ))}
          </section>
        </div>
      )}

      {rows.length > 0 && (
        <section className="flex flex-col gap-2.5">
          <h2 className="text-[15px] md:text-[16px] font-semibold px-0.5" style={{ color: 'var(--text)' }}>Each card</h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5 md:gap-4 wl-even">
            {rows.map(r => <CardPanel key={r.f.account.id} f={r.f} loans={loans} colorOf={colorOf} />)}
          </div>
        </section>
      )}
      {rows.length === 0 && <div className="wl-card px-5 py-8 text-center text-[13px]" style={{ color: 'var(--text3)' }}>Nothing was charged to your cards in {rangeLabel}. Import a card statement, or pick another month at the top.</div>}

      <section className="rounded-[16px] px-4 md:px-5 py-3.5" style={{ background: '#FAFAFE', border: '1px solid var(--line)' }}>
        <div className="text-[11px] font-semibold uppercase tracking-[0.05em] mb-1.5" style={{ color: 'var(--text3)' }}>How this counts</div>
        <ul className="text-[12.5px] leading-relaxed list-disc pl-4 grid md:grid-cols-2 gap-x-8" style={{ color: 'var(--text3)' }}>
          <li>Spent on cards = what you bought on them, plus EMIs of loans billed to a card. Refunds and payments are shown, not taken off.</li>
          <li>Card bills paid from your banks pay for this spending — they’re in the Expense report under each bank, not counted again here.</li>
          <li>Each card is in its own currency; totals use {view === 'consolidated' ? `₹ (AED at ₹${FX.toFixed(2)})` : 'the view’s currency'}.</li>
          <li>The period is the one picked at the top of the page; it’s compared with the same number of months just before.</li>
        </ul>
      </section>
    </div>
  )
}

// One card: what it was used for, where, and every charge
function CardPanel({ f, loans, colorOf }: { f: AccountFlow; loans: any[]; colorOf: (c?: string) => string }) {
  const [showAll, setShowAll] = useState(false)
  const a = f.account, cur = a.currency ?? 'INR'
  const m = (n: number) => fmtMoney(n, cur)
  const charges = f.outs.filter(l => l.kind === 'spend'), emis = f.outs.filter(l => l.kind === 'emi')
  const credits = f.ins
  const spent = charges.reduce((s, l) => s + l.amount, 0) + emis.reduce((s, l) => s + l.amount, 0)
  const paid = f.ins.filter(l => l.kind === 'payment').reduce((s, l) => s + l.amount, 0)
  const refunds = f.ins.filter(l => l.kind === 'refund').reduce((s, l) => s + l.amount, 0)
  const top = Math.max(1, ...charges.map(l => l.amount))
  const cl = cardLimits(a, loans)
  const list = [...charges, ...emis].flatMap(l => l.txns.map((t: any) => ({ t, l }))).sort((x, y) => String(y.t.txn_date).localeCompare(String(x.t.txn_date)))
  const shown = showAll ? list : list.slice(0, 8)
  return (
    <section id={`card-${a.id}`} className="wl-card px-4 md:px-5 py-4 scroll-mt-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <span className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: '#F3E8FF', color: '#7E22CE' }}><CreditCard size={18} /></span>
          <div className="min-w-0">
            <div className="text-[14.5px] font-bold truncate" style={{ color: 'var(--text)' }}>{a.name}</div>
            <div className="text-[11.5px] truncate" style={{ color: 'var(--text4)' }}>{[a.bank_name && a.bank_name !== a.name ? a.bank_name : null, a.last_four ? `••${a.last_four}` : null, cur].filter(Boolean).join(' · ')}</div>
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          <div className="text-[11px]" style={{ color: 'var(--text4)' }}>Owed now</div>
          <div className="text-[14px] font-bold tabular-nums" style={{ color: 'var(--text)' }}>{m(Number(a.outstanding_bal) || 0)}</div>
          {cl.util != null && <div className="text-[11px] tabular-nums" style={{ color: cl.util > 30 ? '#B96A0B' : 'var(--text4)' }}>{Math.round(cl.util)}% of limit</div>}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 mt-3">
        {[['Spent', spent, 'var(--text)'], ['Paid', paid, '#1D5FA8'], ['Refunds', refunds, '#1E8F5F']].map(([k, v, c]) => (
          <div key={k as string} className="rounded-xl px-2.5 md:px-3 py-2 min-w-0" style={{ background: '#FAFAFE', border: '1px solid var(--line)' }}>
            <div className="text-[11px]" style={{ color: 'var(--text4)' }}>{k}</div>
            <div className="text-[13px] md:text-[14px] font-bold tabular-nums truncate" style={{ color: c as string }}>
              <span className="md:hidden">{fmtCompact(v as number, cur)}</span><span className="hidden md:inline">{m(v as number)}</span>
            </div>
          </div>
        ))}
      </div>

      {charges.length > 0 && <>
        <div className="flex justify-between mt-3 mb-0.5 text-[11px] font-semibold uppercase tracking-[0.05em]" style={{ color: 'var(--text3)' }}><span>By category</span></div>
        {charges.map(l => (
          <div key={l.key} className="py-1.5">
            <div className="flex justify-between gap-3 text-[12.5px]">
              <span className="truncate" style={{ color: 'var(--text2)' }}>{l.label}<span style={{ color: 'var(--text4)' }}> · {l.count}</span></span>
              <span className="tabular-nums font-semibold flex-shrink-0" style={{ color: 'var(--text)' }}>{m(l.amount)}</span>
            </div>
            <div className="h-1.5 rounded-full mt-1" style={{ background: 'var(--track)' }}><div className="h-full rounded-full" style={{ width: `${Math.max(l.amount / top * 100, 1.5)}%`, background: colorOf(l.category) }} /></div>
          </div>
        ))}
        {f.merchants.length > 0 && <div className="text-[11.5px] mt-1" style={{ color: 'var(--text4)' }}>Biggest: {f.merchants.map(x => `${x.name} ${m(x.amount)}`).join(' · ')}</div>}
      </>}

      {(emis.length > 0 || credits.length > 0) && (
        <div className="mt-3">
          {emis.map(l => <div key={l.key} className="flex justify-between gap-3 py-1.5 text-[12.5px]" style={{ borderTop: '1px solid var(--track)' }}><span style={{ color: 'var(--text2)' }}>{l.label}</span><span className="tabular-nums">{m(l.amount)}</span></div>)}
          {credits.map(l => <div key={l.key} className="flex justify-between gap-3 py-1.5 text-[12.5px]" style={{ borderTop: '1px solid var(--track)' }}><span style={{ color: l.kind === 'payment' ? '#1D5FA8' : 'var(--text2)' }}>{l.label}</span><span className="tabular-nums" style={{ color: l.kind === 'payment' ? '#1D5FA8' : '#1E8F5F' }}>{m(l.amount)}</span></div>)}
        </div>
      )}

      {list.length > 0 && (
        <div className="mt-3 rounded-xl overflow-hidden" style={{ border: '1px solid var(--line)' }}>
          <div className="px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.05em]" style={{ background: '#FAFAFE', color: 'var(--text3)' }}>Charges · {list.length}</div>
          {shown.map(({ t, l }, i) => (
            <div key={`${t.id ?? i}-${l.key}`} className="flex items-center gap-3 px-3 py-2" style={{ borderTop: '1px solid var(--track)' }}>
              <span className="w-12 text-[11.5px] tabular-nums flex-shrink-0" style={{ color: 'var(--text4)' }}>{fmtDay(String(t.txn_date))}</span>
              <span className="flex-1 min-w-0">
                <span className="block text-[12.5px] truncate" style={{ color: 'var(--text)' }}>{t.merchant || labelOf(catOf(t))}</span>
                <span className="block text-[11px] truncate" style={{ color: 'var(--text4)' }}>{l.label}</span>
              </span>
              <span className="text-[12.5px] font-semibold tabular-nums flex-shrink-0" style={{ color: 'var(--text)' }}>{m(Number(t.amount) || 0)}</span>
            </div>
          ))}
          {list.length > 8 && (
            <button onClick={() => setShowAll(v => !v)} className="w-full py-2.5 text-[12px] font-semibold flex items-center justify-center gap-1" style={{ color: 'var(--accent)', borderTop: '1px solid var(--line)' }}>
              {showAll ? <>Show fewer <ChevronUp size={13} /></> : <>All {list.length} charges <ChevronDown size={13} /></>}
            </button>
          )}
        </div>
      )}
      {f.ins.length + f.outs.length === 0 && <div className="text-[12.5px] mt-3" style={{ color: 'var(--text4)' }}>Nothing in this period.</div>}
    </section>
  )
}
