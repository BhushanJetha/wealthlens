'use client'
import { useEffect, useMemo, useState } from 'react'
import { Landmark, CreditCard, Wallet, CircleHelp, ChevronDown, ChevronUp } from 'lucide-react'
import { useViewStore } from '@/store/viewStore'
import { useCategoryStore } from '@/store/categoryStore'
import { colorOf as catColorOf } from '@/lib/categories'
import { markUnitemisedCardBills } from '@/lib/money'
import { kindOf } from '@/lib/ledger'
import { cardLimits } from '@/lib/cardCycle'
import { fmtMoney, fmtCompact } from '@/lib/format'
import { accountFlows, type AccountFlow, type FlowKind, type FlowLine } from '@/lib/accountFlows'
import { PageHeader, InsightBar, KpiTile, KpiGrid, EmptyState } from '@/components/ui/kit'

// Colour by what a line is (spending lines use their category's colour)
const KIND_COLOR: Record<FlowKind, string> = {
  income: '#1E8F5F', spend: '#6A55E8', emi: '#F29A2E', invest: '#2FB67C', card: '#9333EA', move: '#94A3B8', payment: '#3B8EF0', refund: '#10B981',
}
const SPEND_SHOWN = 6

// Accounts report (Money › Reports): every bank account, cash wallet and card
// on its own, in its own currency — what came in, where it went, and what was
// charged to each card. Moves between your accounts show on both sides, once
// each (lib/accountFlows), so the picture adds up account by account.
export default function AccountsReportClient({ transactions, accounts, loans, fx }: { transactions: any[]; accounts: any[]; loans: any[]; fx: number }) {
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

  const flows = useMemo(() => {
    const cardIds = new Set(accounts.filter(a => kindOf(a) === 'card').map(a => a.id))
    const marked = markUnitemisedCardBills(transactions, cardIds)
    return accountFlows(accounts, marked, FX, d => { const m = d.slice(0, 7); return m >= fromMonth && m <= toMonth })
  }, [transactions, accounts, FX, fromMonth, toMonth])

  const shown = flows.filter(f => inView(f.account.currency ?? 'INR'))
  const isCard = (f: AccountFlow) => kindOf(f.account) === 'card'
  // Busiest first (compared in the view's currency, so dirham and rupee accounts sort together)
  const size = (f: AccountFlow) => toView(f.inTotal + f.outTotal, f.account.currency ?? 'INR')
  const banks = shown.filter(f => !isCard(f) && !f.account._unlinked).sort((a, b) => size(b) - size(a))
  const cards = shown.filter(isCard).sort((a, b) => size(b) - size(a))
  const unlinked = shown.filter(f => f.account._unlinked)
  // Active accounts with nothing in this period
  const quiet = accounts.filter(a => a.is_active !== false && inView(a.currency) && !flows.some(f => f.account.id === a.id))

  // Totals across accounts, in the view's currency
  const sum = (fs: AccountFlow[], side: 'ins' | 'outs', kinds: FlowKind[]) =>
    fs.reduce((s, f) => s + f[side].filter(l => kinds.includes(l.kind)).reduce((a, l) => a + toView(l.amount, f.account.currency), 0), 0)
  const income = sum([...banks, ...unlinked], 'ins', ['income'])
  const spentDirect = sum([...banks, ...unlinked], 'outs', ['spend'])
  const charged = sum(cards, 'outs', ['spend', 'emi'])
  const billsPaid = sum([...banks, ...unlinked], 'outs', ['card'])
  const incomeBy = [...banks, ...unlinked].map(f => ({ f, v: f.ins.filter(l => l.kind === 'income').reduce((a, l) => a + toView(l.amount, f.account.currency), 0) })).filter(x => x.v > 0).sort((a, b) => b.v - a.v)
  const spendBy = [...banks, ...unlinked, ...cards].map(f => ({ f, v: f.outs.filter(l => l.kind === 'spend' || (isCard(f) && l.kind === 'emi')).reduce((a, l) => a + toView(l.amount, f.account.currency), 0) })).filter(x => x.v > 0).sort((a, b) => b.v - a.v)
  const top = Math.max(1, ...incomeBy.map(x => x.v), ...spendBy.map(x => x.v))

  const summary = `${rangeLabel}: ${short(income)} came in${incomeBy.length ? ` across ${incomeBy.length} account${incomeBy.length === 1 ? '' : 's'}` : ''}. ${short(spentDirect)} was spent from bank & cash and ${short(charged)} charged to cards; ${short(billsPaid)} of card bills were paid.`

  if (!accounts.length) return (
    <div className="flex flex-col gap-3.5 md:gap-[18px] animate-fade-up">
      <PageHeader title="Accounts report" sub="Every account and card on its own" />
      <EmptyState message="Add your bank accounts and cards (or import a statement) to see what came into each one and where it went." />
    </div>
  )

  return (
    <div className="flex flex-col gap-3.5 md:gap-[18px] animate-fade-up">
      <PageHeader title="Accounts report" sub={`${rangeLabel} · every account and card on its own, in its own currency`} />
      <InsightBar text={summary} prompt={`Explain where my money went, account by account. ${summary}`} />

      <KpiGrid>
        <KpiTile label="Came in" value={short(income)} tint={1} icon={Landmark} delta="income, into your accounts" />
        <KpiTile label="Spent from bank & cash" value={short(spentDirect)} tint={0} icon={Wallet} delta="paid directly" />
        <KpiTile label="Charged to cards" value={short(charged)} tint={3} icon={CreditCard} delta="purchases and card-loan EMIs" />
        <KpiTile label="Card bills paid" value={short(billsPaid)} tint={2} icon={CreditCard} delta="from your banks — pays for card charges" />
      </KpiGrid>

      {/* The whole picture in two lists: where income landed, where spending happened */}
      {(incomeBy.length > 0 || spendBy.length > 0) && (
        <section className="wl-card px-4 md:px-5 py-4 md:py-[18px]">
          <h2 className="text-[14px] md:text-[15px] font-semibold" style={{ color: 'var(--text)' }}>At a glance · {rangeLabel}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4 mt-3">
            {[{ t: 'Income landed in', rows: incomeBy, c: '#1E8F5F' }, { t: 'Spending happened on', rows: spendBy, c: '#6A55E8' }].map(col => (
              <div key={col.t}>
                <div className="text-[11px] font-semibold uppercase tracking-[0.05em] mb-1.5" style={{ color: 'var(--text3)' }}>{col.t}</div>
                {col.rows.length === 0 ? <div className="text-[12.5px] py-2" style={{ color: 'var(--text4)' }}>Nothing in this period.</div> : col.rows.map(({ f, v }) => (
                  <a key={f.account.id} href={`#acc-${f.account.id}`} className="block py-1.5">
                    <div className="flex justify-between gap-3 text-[12.5px]">
                      <span className="truncate" style={{ color: 'var(--text2)' }}>{f.account.name}{isCard(f) ? ' · card' : ''}</span>
                      <span className="tabular-nums font-semibold" style={{ color: 'var(--text)' }}>{short(v)}</span>
                    </div>
                    <div className="h-1.5 rounded-full mt-1" style={{ background: 'var(--track)' }}><div className="h-full rounded-full" style={{ width: `${Math.max(v / top * 100, 1.5)}%`, background: col.c }} /></div>
                  </a>
                ))}
              </div>
            ))}
          </div>
        </section>
      )}

      {banks.length + unlinked.length > 0 && (
        <section className="flex flex-col gap-2.5">
          <h2 className="text-[15px] md:text-[16px] font-semibold px-0.5" style={{ color: 'var(--text)' }}>Bank &amp; cash</h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5 md:gap-4 items-start">
            {[...banks, ...unlinked].map(f => <AccountPanel key={f.account.id} f={f} colorOf={colorOf} />)}
          </div>
        </section>
      )}

      {cards.length > 0 && (
        <section className="flex flex-col gap-2.5">
          <h2 className="text-[15px] md:text-[16px] font-semibold px-0.5" style={{ color: 'var(--text)' }}>Credit cards</h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5 md:gap-4 items-start">
            {cards.map(f => <AccountPanel key={f.account.id} f={f} colorOf={colorOf} loans={loans} />)}
          </div>
        </section>
      )}

      {quiet.length > 0 && (
        <p className="text-[12px] px-0.5" style={{ color: 'var(--text4)' }}>No activity in {rangeLabel}: {quiet.map(a => a.name).join(', ')}.</p>
      )}

      <section className="rounded-[16px] px-4 md:px-5 py-3.5" style={{ background: '#FAFAFE', border: '1px solid var(--line)' }}>
        <div className="text-[11px] font-semibold uppercase tracking-[0.05em] mb-1.5" style={{ color: 'var(--text3)' }}>How this report counts</div>
        <ul className="text-[12.5px] leading-relaxed list-disc pl-4 grid md:grid-cols-2 gap-x-8" style={{ color: 'var(--text3)' }}>
          <li>Each account is in its own currency; the totals at the top use {view === 'consolidated' ? `₹ (AED at ₹${FX.toFixed(2)})` : 'the view’s currency'}.</li>
          <li>A move between your accounts shows on both: a card bill as “Card bill →” on the bank and “Paid from” on the card; money sent home as “Sent to India” and “Received from UAE”.</li>
          <li>Card purchases are spending on the card. The bill that pays them is a move from your bank — not spending again.</li>
          <li>The period is the one picked at the top of the page.</li>
        </ul>
      </section>
    </div>
  )
}

// One account or card: what came in, what went out (spending by category,
// then everything else), the net change and the balance now
function AccountPanel({ f, colorOf, loans = [] }: { f: AccountFlow; colorOf: (c?: string) => string; loans?: any[] }) {
  const [all, setAll] = useState(false)
  const a = f.account, card = kindOf(a) === 'card', cash = kindOf(a) === 'cash', cur = a.currency ?? 'INR'
  const m = (n: number) => fmtMoney(n, cur)
  const mc = (n: number) => fmtCompact(n, cur)
  const spend = f.outs.filter(l => l.kind === 'spend')
  const other = f.outs.filter(l => l.kind !== 'spend')
  const spendTotal = spend.reduce((s, l) => s + l.amount, 0)
  const Icon = a._unlinked ? CircleHelp : card ? CreditCard : cash ? Wallet : Landmark
  const tint = a._unlinked ? '#94A3B8' : card ? '#9333EA' : cash ? '#2FB67C' : '#3B8EF0'
  const cl = card ? cardLimits(a, loans) : null
  const paid = f.ins.filter(l => l.kind === 'payment').reduce((s, l) => s + l.amount, 0)
  const refunds = f.ins.filter(l => l.kind === 'refund').reduce((s, l) => s + l.amount, 0)
  const net = f.inTotal - f.outTotal

  const Row = ({ l, base }: { l: FlowLine; base: number }) => (
    <div className="py-1.5">
      <div className="flex justify-between gap-3 text-[12.5px]">
        <span className="truncate" style={{ color: 'var(--text2)' }}>{l.label}{l.count > 1 ? <span style={{ color: 'var(--text4)' }}> · {l.count}</span> : null}</span>
        <span className="tabular-nums font-semibold flex-shrink-0" style={{ color: 'var(--text)' }}>{m(l.amount)}</span>
      </div>
      <div className="h-1.5 rounded-full mt-1" style={{ background: 'var(--track)' }}>
        <div className="h-full rounded-full" style={{ width: `${Math.max(l.amount / Math.max(base, 1) * 100, 1.5)}%`, background: l.kind === 'spend' ? colorOf(l.category) : KIND_COLOR[l.kind] }} />
      </div>
    </div>
  )
  const Head = ({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) => (
    <div className="flex justify-between gap-3 mt-3 mb-0.5 text-[11px] font-semibold uppercase tracking-[0.05em]" style={{ color: 'var(--text3)' }}>
      <span>{children}</span>{right && <span className="tabular-nums normal-case tracking-normal text-[12px]">{right}</span>}
    </div>
  )
  // Phones show the short form (AED 25K) so three fit side by side
  const stat = (label: string, n: number, color = 'var(--text)', sign = '') => (
    <div className="rounded-xl px-2.5 md:px-3 py-2 min-w-0" style={{ background: '#FAFAFE', border: '1px solid var(--line)' }}>
      <div className="text-[11px]" style={{ color: 'var(--text4)' }}>{label}</div>
      <div className="text-[13px] md:text-[14px] font-bold tabular-nums truncate tracking-[-0.01em]" style={{ color }}>
        <span className="md:hidden">{sign}{mc(n)}</span><span className="hidden md:inline">{sign}{m(n)}</span>
      </div>
    </div>
  )

  return (
    <section id={`acc-${a.id}`} className="wl-card px-4 md:px-5 py-4 scroll-mt-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <span className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: tint + '1A', color: tint }}><Icon size={18} /></span>
          <div className="min-w-0">
            <div className="text-[14.5px] font-bold truncate" style={{ color: 'var(--text)' }}>{a.name}</div>
            <div className="text-[11.5px] truncate" style={{ color: 'var(--text4)' }}>{[a.bank_name && a.bank_name !== a.name ? a.bank_name : null, a.last_four ? `••${a.last_four}` : null, cur, a.is_active === false ? 'closed' : null].filter(Boolean).join(' · ')}</div>
          </div>
        </div>
        {!a._unlinked && (
          <div className="text-right flex-shrink-0">
            <div className="text-[11px]" style={{ color: 'var(--text4)' }}>{card ? 'Owed now' : 'Balance now'}</div>
            <div className="text-[14px] font-bold tabular-nums" style={{ color: 'var(--text)' }}>{m(Number(card ? a.outstanding_bal : a.current_balance) || 0)}</div>
            {cl?.util != null && <div className="text-[11px] tabular-nums" style={{ color: cl.util > 30 ? '#B96A0B' : 'var(--text4)' }}>{Math.round(cl.util)}% of limit</div>}
          </div>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2 mt-3">
        {card ? <>{stat('Charged', f.outTotal)}{stat('Paid', paid, '#3B8EF0')}{stat('Refunds', refunds, '#1E8F5F')}</>
          : <>{stat('Came in', f.inTotal, '#1E8F5F')}{stat('Went out', f.outTotal)}{stat('Net change', net, net >= 0 ? '#1E8F5F' : '#D9482F', net > 0 ? '+' : '')}</>}
      </div>

      {!card && f.ins.length > 0 && <><Head right={m(f.inTotal)}>Came in</Head>{f.ins.map(l => <Row key={l.key} l={l} base={f.inTotal} />)}</>}

      {spend.length > 0 && (<>
        <Head right={m(spendTotal)}>{card ? 'Charged by category' : 'Spent, by category'}</Head>
        {(all ? spend : spend.slice(0, SPEND_SHOWN)).map(l => <Row key={l.key} l={l} base={spendTotal} />)}
        {spend.length > SPEND_SHOWN && (
          <button onClick={() => setAll(v => !v)} className="text-[12px] font-semibold mt-1 flex items-center gap-1" style={{ color: 'var(--accent)' }}>
            {all ? <>Show fewer <ChevronUp size={13} /></> : <>All {spend.length} categories <ChevronDown size={13} /></>}
          </button>
        )}
        {f.merchants.length > 0 && <div className="text-[11.5px] mt-1.5" style={{ color: 'var(--text4)' }}>Biggest: {f.merchants.map(x => `${x.name} ${m(x.amount)}`).join(' · ')}</div>}
      </>)}

      {other.length > 0 && <><Head right={m(other.reduce((s, l) => s + l.amount, 0))}>{card ? 'Also on the card' : 'Other money out'}</Head>{other.map(l => <Row key={l.key} l={l} base={f.outTotal} />)}</>}

      {card && f.ins.length > 0 && <><Head right={m(f.inTotal)}>Payments &amp; credits</Head>{f.ins.map(l => <Row key={l.key} l={l} base={f.inTotal} />)}</>}

      {f.ins.length + f.outs.length === 0 && <div className="text-[12.5px] mt-3" style={{ color: 'var(--text4)' }}>Nothing in this period.</div>}
    </section>
  )
}
