'use client'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Landmark, CalendarClock, ShoppingBag, CreditCard, ChevronRight, Banknote, X, Check, ArrowDownLeft, BarChart2, Plus,
} from 'lucide-react'
import { useViewStore } from '@/store/viewStore'
import { useUiStore } from '@/store/uiStore'
import { createClient } from '@/lib/supabase/client'
import { fmtMoney, fmtCompact } from '@/lib/format'
import { viewAmount } from '@/lib/netWorth'
import { kindOf } from '@/lib/ledger'
import { catOf, labelOf, isIncome as isIncomeIn } from '@/lib/money'
import { brandOf } from '@/lib/banks'
import { buildHomeInsights, localToday, fmtDay, daysBetween, type Attention } from '@/lib/insights'
import { buildDues, expectedIncome, balanceWarnings, safeToSpend, type Due } from '@/lib/moneyOverview'
import { PageHeader, InsightBar, KpiTile, KpiGrid, Panel, MoreLink } from '@/components/ui/kit'
import { BankLogo } from '@/components/ui/BankCards'

interface Props {
  today: string
  transactions: any[]; accounts: any[]; loans: any[]; insurance: any[]
  mutualFunds: any[]; fixedDeposits: any[]; budgets: any[]
}

const SEV_DOT: Record<Attention['severity'], string> = { high: '#DC2626', medium: '#D97706', low: '#6A55E8' }
const KIND_ICON: Record<Due['kind'], typeof Landmark> = { emi: Landmark, card: CreditCard, premium: CalendarClock, sip: BarChart2, bill: CalendarClock }
// Home's attention items that belong here; dues have their own list
const KEEP = (a: Attention) => /^(bud-|util$|uncat$|quiet-)/.test(a.id)

// Money overview (design v2 kit): safe to spend · what needs you · next 7 days
// · live balances · this month · recent. Every figure follows the same rules
// as Home and Reports (lib/money, lib/insights); balances are the ledger.
export default function MoneyOverviewClient(p: Props) {
  const router = useRouter()
  const { view, fxRate: FX } = useViewStore()
  const { openAdd, setUploadOpen } = useUiStore()
  const cur = view === 'uae' ? 'AED' : 'INR'
  const money = (n: number) => fmtMoney(n, cur)
  const short = (n: number) => fmtCompact(n, cur)
  const [today, setToday] = useState(p.today)
  useEffect(() => { setToday(localToday()) }, [])
  const [picking, setPicking] = useState<Due | null>(null)

  const inView = (c: string) => view === 'consolidated' || (view === 'uae' ? c === 'AED' : c !== 'AED')
  const accounts = useMemo(() => p.accounts.filter(a => inView(a.currency)), [p.accounts, view])
  const banks = accounts.filter(a => kindOf(a) !== 'card')
  const cards = accounts.filter(a => kindOf(a) === 'card')

  const ins = useMemo(() => buildHomeInsights({
    view, fx: FX, today, focusMonth: today.slice(0, 7),
    txns: p.transactions, accounts: p.accounts, loans: p.loans, insurance: p.insurance,
    fixedDeposits: p.fixedDeposits, budgets: p.budgets, mutualFunds: p.mutualFunds, stocks: [],
    cash: 0, invested: { value: 0, cost: 0 },
  }), [view, FX, today, p])

  const dues = useMemo(() => buildDues({ today, days: 35, view, txns: p.transactions, accounts: p.accounts, loans: p.loans, insurance: p.insurance, mutualFunds: p.mutualFunds }),
    [today, view, p])
  const incoming = useMemo(() => expectedIncome(p.transactions, accounts, today, 35), [p.transactions, accounts, today])
  const warnings = useMemo(() => balanceWarnings(accounts, dues, incoming, today, 14), [accounts, dues, incoming, today])
  const sts = useMemo(() => safeToSpend({ today, view, fx: FX, accounts, dues, txns: p.transactions }), [today, view, FX, accounts, dues, p.transactions])

  const week = dues.filter(d => daysBetween(today, d.date) <= 7)
  const weekIn = incoming.filter(i => daysBetween(today, i.date) <= 7)
  const dueWeek = week.reduce((s, d) => s + viewAmount(d.amount, d.currency, view, FX), 0)
  const owed = cards.reduce((s, c) => s + viewAmount(Number(c.outstanding_bal) || 0, c.currency, view, FX), 0)
  const needs = [...warnings, ...ins.attention.filter(KEEP)]
  const unsure = week.filter(d => !d.payFrom && (d.kind === 'emi' || d.kind === 'card'))

  const recent = useMemo(() => p.transactions.filter(t => inView(t.currency)).slice(0, 6), [p.transactions, view])
  const accName = (id: string | null) => p.accounts.find(a => a.id === id)?.name ?? null

  // This month (same rules as Reports: saved = income − spent − EMIs)
  const month = [
    { k: 'Income', v: ins.income.value, c: 'var(--income)' },
    { k: 'Spent', v: ins.spend.value, c: '#6A55E8' },
    { k: 'Loan EMIs', v: ins.saved.emi, c: '#F29A2E' },
    { k: 'Invested', v: ins.saved.invest, c: '#2FB67C' },
  ]
  const top = Math.max(1, ...month.map(m => m.v))
  const spendDelta = ins.spend.baseline != null && ins.spend.baseline > 0
    ? Math.round((ins.spend.value - ins.spend.baseline) / ins.spend.baseline * 100) : null

  const insight = sts.amount >= 0
    ? `${short(sts.amount)} is safe to spend until ${sts.payday ? 'payday, ' : ''}${fmtDay(sts.until)}${sts.perDay ? ` — about ${short(sts.perDay)} a day` : ''}. `
      + (week.length ? `${week.length} payment${week.length === 1 ? '' : 's'} due this week (${short(dueWeek)}).` : 'Nothing is due this week.')
      + (warnings[0] ? ` ${warnings[0].title}.` : '')
    : `Bank and cash are ${short(-sts.amount)} short of what's due by ${fmtDay(sts.until)}. ${warnings[0] ? warnings[0].title + '.' : 'Move money in or pay the smallest dues later.'}`
  const ctx = `Money overview (${view}): bank & cash ${money(sts.cash)}, due by ${sts.until} ${money(sts.dueBefore)}, safe to spend ${money(sts.amount)}. Due this week: ${week.map(d => `${d.label} ${fmtMoney(d.amount, d.currency)} on ${d.date}`).join('; ') || 'nothing'}. Warnings: ${needs.map(n => n.title).join('; ') || 'none'}.`

  const viewLabel = view === 'uae' ? 'UAE · AED' : view === 'india' ? 'India · INR' : 'Consolidated · INR'
  const isEmpty = p.transactions.length === 0 && p.accounts.length === 0

  if (isEmpty) return (
    <div className="flex flex-col gap-3.5 md:gap-[18px] animate-fade-up">
      <PageHeader title="Money" sub={viewLabel} />
      <div className="wl-card px-6 py-10 text-center flex flex-col items-center gap-3">
        <div className="text-[15px] font-semibold" style={{ color: 'var(--text)' }}>Add your accounts and a statement to see your money here</div>
        <div className="text-[13px] max-w-md" style={{ color: 'var(--text3)' }}>Balances, what’s due this week and how much is safe to spend all come from your accounts and transactions.</div>
        <div className="flex gap-2 mt-1">
          <button onClick={() => setUploadOpen(true)} className="wl-btn wl-btn-primary" style={{ height: 36 }}>Import a statement</button>
          <Link href="/dashboard/accounts" className="wl-btn" style={{ height: 36 }}>Add accounts</Link>
        </div>
      </div>
    </div>
  )

  return (
    <div className="flex flex-col gap-3.5 md:gap-[18px] animate-fade-up">
      <PageHeader title="Money" sub={`${viewLabel} · ${fmtDay(today)}`}
        actions={<Link href="/dashboard/reports" className="wl-btn" style={{ height: 34 }}><BarChart2 size={14} />Reports</Link>} />

      <InsightBar text={insight} prompt={`Explain my money overview in plain language and tell me what to do first. ${ctx}`} />

      {/* Safe to spend + what needs you */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.5fr] gap-3.5 md:gap-4">
        <section className="wl-card px-4 md:px-5 py-4 md:py-[18px] flex flex-col" aria-labelledby="sts">
          <div id="sts" className="text-[10.5px] md:text-[11px] font-semibold uppercase tracking-[0.05em]" style={{ color: 'var(--text3)' }}>Safe to spend</div>
          <div className="text-[30px] md:text-[32px] font-bold tabular-nums tracking-[-0.02em] leading-tight mt-0.5"
            style={{ color: sts.amount < 0 ? '#DC2626' : 'var(--text)' }}>{money(sts.amount)}</div>
          <div className="text-[12.5px] font-medium" style={{ color: sts.amount < 0 ? '#DC2626' : 'var(--income)' }}>
            {sts.amount < 0 ? `Short by ${fmtDay(sts.until)}` : `Until ${sts.payday ? 'payday · ' : ''}${fmtDay(sts.until)}${sts.perDay ? ` · ${short(sts.perDay)}/day` : ''}`}
          </div>
          <dl className="mt-3.5 flex flex-col text-[12.5px]">
            <div className="flex justify-between py-1.5"><dt style={{ color: 'var(--text3)' }}>Bank & cash now</dt><dd className="tabular-nums font-semibold" style={{ color: 'var(--text)' }}>{money(sts.cash)}</dd></div>
            <div className="flex justify-between py-1.5" style={{ borderTop: '1px solid var(--track)' }}>
              <dt style={{ color: 'var(--text3)' }}>Due by {fmtDay(sts.until)} <span style={{ color: 'var(--text4)' }}>· {sts.dueCount} payment{sts.dueCount === 1 ? '' : 's'}</span></dt>
              <dd className="tabular-nums font-semibold" style={{ color: 'var(--text)' }}>− {money(sts.dueBefore)}</dd>
            </div>
          </dl>
          <p className="mt-auto pt-3 text-[11.5px] leading-snug" style={{ color: 'var(--text4)' }}>
            {sts.payday ? 'Payday is the day your biggest income usually lands.' : 'No regular income found yet, so this looks 30 days ahead.'} Card spends count once, through the card’s bill.
          </p>
        </section>

        <Panel title="Needs you" right={needs.length > 0 && <span className="text-[11px] font-semibold px-2 py-[3px] rounded-full" style={{ background: '#FEF2F2', color: '#DC2626' }}>{needs.length}</span>}>
          {needs.length === 0 && unsure.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-center py-8 gap-1.5">
              <div className="w-10 h-10 rounded-full flex items-center justify-center text-[18px]" style={{ background: 'var(--income-bg)', color: 'var(--income)' }}>✓</div>
              <div className="text-[14px] font-semibold mt-1" style={{ color: 'var(--text)' }}>All clear</div>
              <div className="text-[12px]" style={{ color: 'var(--text3)' }}>Every account covers what’s due from it in the next two weeks.</div>
            </div>
          ) : (
            <ul className="mt-2">
              {needs.slice(0, 6).map(it => {
                const body = (<>
                  <span className="w-2 h-2 rounded-full mt-[5px] flex-shrink-0" style={{ background: SEV_DOT[it.severity] }}
                    aria-label={it.severity === 'high' ? 'Urgent' : it.severity === 'medium' ? 'Soon' : 'To do'} />
                  <span className="flex-1 min-w-0">
                    <span className="block text-[13px] font-semibold" style={{ color: 'var(--text)' }}>{it.title}</span>
                    <span className="block text-[12px] mt-px" style={{ color: 'var(--text3)' }}>{it.detail}</span>
                  </span>
                  {(it.href || ('action' in it && it.action === 'upload')) && <ChevronRight size={16} className="flex-shrink-0 mt-0.5" style={{ color: 'var(--text4)' }} />}
                </>)
                const cls = 'w-full flex gap-2.5 items-start py-[9px] text-left -mx-2 px-2 rounded-lg hover:bg-[#F5F3FE] transition-colors'
                return (
                  <li key={it.id} style={{ borderTop: '1px solid #F1F5F9' }}>
                    {'action' in it && it.action === 'upload' ? <button onClick={() => setUploadOpen(true)} className={cls}>{body}</button>
                      : it.href ? <Link href={it.href} className={cls}>{body}</Link> : <div className={cls}>{body}</div>}
                  </li>
                )
              })}
              {unsure.map(d => (
                <li key={`u-${d.id}`} style={{ borderTop: '1px solid #F1F5F9' }}>
                  <button onClick={() => setPicking(d)} className="w-full flex gap-2.5 items-start py-[9px] text-left -mx-2 px-2 rounded-lg hover:bg-[#F5F3FE] transition-colors">
                    <span className="w-2 h-2 rounded-full mt-[5px] flex-shrink-0" style={{ background: SEV_DOT.low }} aria-label="To do" />
                    <span className="flex-1 min-w-0">
                      <span className="block text-[13px] font-semibold" style={{ color: 'var(--text)' }}>Which account pays {d.label}?</span>
                      <span className="block text-[12px] mt-px" style={{ color: 'var(--text3)' }}>Pick it once, and you’ll be warned if that account runs short</span>
                    </span>
                    <span className="text-[12px] font-semibold whitespace-nowrap mt-px" style={{ color: 'var(--accent)' }}>Choose</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <KpiGrid>
        <KpiTile label="Bank & cash" value={short(sts.cash)} tint={0} icon={Landmark} href="/dashboard/accounts"
          delta={`${banks.length} account${banks.length === 1 ? '' : 's'}`} />
        <KpiTile label="Due in 7 days" value={short(dueWeek)} tint={2} icon={CalendarClock}
          delta={week.length ? `${week.length} payment${week.length === 1 ? '' : 's'}` : 'Nothing due'} />
        <KpiTile label="Spent this month" value={short(ins.spend.value)} tint={3} icon={ShoppingBag} href="/dashboard/expenses"
          tone={spendDelta == null ? 'neutral' : spendDelta > 10 ? 'bad' : 'good'}
          delta={spendDelta == null ? 'So far' : `${spendDelta > 0 ? '+' : ''}${spendDelta}% vs usual by today`} />
        <KpiTile label="Card bills owed" value={short(owed)} tint={1} icon={CreditCard} href="/dashboard/cards"
          delta={`${cards.length} card${cards.length === 1 ? '' : 's'}`} />
      </KpiGrid>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5 md:gap-4">
        {/* Next 7 days */}
        <Panel title="Next 7 days" right={<MoreLink href="/dashboard/bills">Bills</MoreLink>}>
          {week.length + weekIn.length === 0 ? (
            <div className="text-[12.5px] py-6 text-center" style={{ color: 'var(--text3)' }}>Nothing due in the next 7 days.</div>
          ) : (
            <ul className="mt-2">
              {[...week.map(d => ({ d, i: null as any })), ...weekIn.map(i => ({ d: null as Due | null, i }))]
                .sort((x, y) => (x.d?.date ?? x.i.date).localeCompare(y.d?.date ?? y.i.date))
                .map(({ d, i }) => {
                  const date = d?.date ?? i.date
                  const days = daysBetween(today, date)
                  const Icon = d ? KIND_ICON[d.kind] : ArrowDownLeft
                  const from = d?.payFrom ? accName(d.payFrom) : null
                  return (
                    <li key={d?.id ?? i.id} className="flex items-center gap-3 py-2.5" style={{ borderTop: '1px solid #F1F5F9' }}>
                      <span className="w-10 text-center flex-shrink-0">
                        <span className="block text-[15px] font-bold leading-none tabular-nums" style={{ color: 'var(--text)' }}>{date.slice(8, 10)}</span>
                        <span className="block text-[10.5px] mt-0.5" style={{ color: days <= 1 ? '#DC2626' : 'var(--text4)' }}>{days === 0 ? 'Today' : days === 1 ? 'Tmrw' : fmtDay(date).split(' ')[1]}</span>
                      </span>
                      <span className="w-8 h-8 rounded-[10px] flex items-center justify-center flex-shrink-0" style={d ? { background: '#F0EDFF', color: '#6A55E8' } : { background: '#E7F7EF', color: '#2FB67C' }}><Icon size={15} /></span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-[13px] font-semibold truncate" style={{ color: 'var(--text)' }}>{d ? d.label : `${i.label} (expected)`}</span>
                        <span className="block text-[11.5px] truncate" style={{ color: 'var(--text3)' }}>
                          {d ? (from ? <>From {from}{d.payFromSource === 'history' && <span className="hidden md:inline"> · as last time</span>}</> : d.sub) : `Into ${accName(i.accountId) ?? 'your account'} · usual amount`}
                        </span>
                      </span>
                      {d && (d.kind === 'emi' || d.kind === 'card') && (
                        <button onClick={() => setPicking(d)} className="hidden md:inline text-[11.5px] font-semibold" style={{ color: 'var(--accent)' }}>{from ? 'Change' : 'Set account'}</button>
                      )}
                      <span className="text-[13px] font-semibold tabular-nums whitespace-nowrap" style={{ color: d ? 'var(--text)' : 'var(--income)' }}>
                        {d ? fmtMoney(d.amount, d.currency) : `+${fmtMoney(i.amount, i.currency)}`}
                      </span>
                    </li>
                  )
                })}
            </ul>
          )}
        </Panel>

        {/* Live balances */}
        <Panel title="Balances" right={<MoreLink href="/dashboard/accounts">Accounts</MoreLink>}>
          <ul className="mt-2">
            {banks.map(a => {
              const bal = Number(a.current_balance) || 0
              const warn = warnings.find(w => w.accountId === a.id)
              return (
                <li key={a.id} style={{ borderTop: '1px solid #F1F5F9' }}>
                  <Link href={kindOf(a) === 'cash' ? '/dashboard/accounts' : '/dashboard/accounts'} className="flex items-center gap-3 py-2.5 -mx-2 px-2 rounded-lg hover:bg-[#F5F3FE] transition-colors">
                    {kindOf(a) === 'cash'
                      ? <span className="w-[30px] h-[30px] rounded-[9px] flex items-center justify-center flex-shrink-0" style={{ background: '#E7F7EF', color: '#2FB67C' }}><Banknote size={15} /></span>
                      : <BankLogo brand={brandOf(a.bank_name, a.name)} />}
                    <span className="flex-1 min-w-0">
                      <span className="block text-[13px] font-semibold truncate" style={{ color: 'var(--text)' }}>{a.name}</span>
                      <span className="block text-[11.5px] truncate" style={{ color: warn ? SEV_DOT[warn.severity] : 'var(--text3)' }}>
                        {warn ? warn.title.replace(`${a.name} `, '') : `${a.bank_name ?? (kindOf(a) === 'cash' ? 'Cash' : 'Bank')}${a._ledger?.count ? ` · ${a._ledger.count} since ${fmtDay(a._ledger.asOf ?? today)}` : ''}`}
                      </span>
                    </span>
                    <span className="text-[13px] font-semibold tabular-nums whitespace-nowrap" style={{ color: bal < 0 ? '#DC2626' : 'var(--text)' }}>{fmtMoney(bal, a.currency)}</span>
                  </Link>
                </li>
              )
            })}
            {cards.map(c => (
              <li key={c.id} style={{ borderTop: '1px solid #F1F5F9' }}>
                <Link href="/dashboard/cards" className="flex items-center gap-3 py-2.5 -mx-2 px-2 rounded-lg hover:bg-[#F5F3FE] transition-colors">
                  <BankLogo brand={brandOf(c.bank_name, c.name)} />
                  <span className="flex-1 min-w-0">
                    <span className="block text-[13px] font-semibold truncate" style={{ color: 'var(--text)' }}>{c.name}</span>
                    <span className="block text-[11.5px] truncate" style={{ color: 'var(--text3)' }}>Card · owed{c.due_date ? ` · due ${fmtDay(c.due_date)}` : ''}</span>
                  </span>
                  <span className="text-[13px] font-semibold tabular-nums whitespace-nowrap" style={{ color: 'var(--text)' }}>{fmtMoney(Number(c.outstanding_bal) || 0, c.currency)}</span>
                </Link>
              </li>
            ))}
            {banks.length + cards.length === 0 && <li className="text-[12.5px] py-6 text-center" style={{ color: 'var(--text3)' }}>No accounts in this view yet.</li>}
          </ul>
        </Panel>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.4fr] gap-3.5 md:gap-4">
        {/* This month */}
        <Panel title="This month so far" right={<MoreLink href="/dashboard/reports">Report</MoreLink>}>
          <div className="mt-3 flex flex-col gap-2.5">
            {month.map(m => (
              <div key={m.k}>
                <div className="flex justify-between text-[12.5px] mb-1">
                  <span style={{ color: 'var(--text2)' }}>{m.k}</span>
                  <span className="font-semibold tabular-nums" style={{ color: 'var(--text)' }}>{money(m.v)}</span>
                </div>
                <div className="h-1.5 rounded-full" style={{ background: 'var(--track)' }}>
                  <div className="h-full rounded-full wl-grow" style={{ width: `${Math.min(100, m.v / top * 100)}%`, background: m.c }} />
                </div>
              </div>
            ))}
            <div className="flex justify-between text-[13px] pt-2 mt-0.5" style={{ borderTop: '1px solid var(--track)' }}>
              <span className="font-semibold" style={{ color: 'var(--text)' }}>Saved</span>
              <span className="font-bold tabular-nums" style={{ color: ins.saved.value < 0 ? '#DC2626' : 'var(--income)' }}>{money(ins.saved.value)}</span>
            </div>
            <div className="text-[11.5px]" style={{ color: 'var(--text4)' }}>Saved = income − spent − EMIs. Investing counts as saving.</div>
          </div>
        </Panel>

        {/* Recent */}
        <Panel title="Recent" right={<MoreLink href="/dashboard/expenses">All transactions</MoreLink>}>
          <ul className="mt-2">
            {recent.map(t => {
              const inc = isIncomeIn(t, view) || t.txn_type === 'income'
              return (
                <li key={t.id} className="flex items-center gap-3 py-2.5" style={{ borderTop: '1px solid #F1F5F9' }}>
                  <span className="w-[30px] h-[30px] rounded-[9px] flex items-center justify-center flex-shrink-0 text-[13px] font-bold"
                    style={inc ? { background: '#E7F7EF', color: '#2FB67C' } : { background: '#F0EDFF', color: '#6A55E8' }}>
                    {String(t.merchant || catOf(t) || '?').trim()[0]?.toUpperCase()}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-[13px] font-semibold truncate" style={{ color: 'var(--text)' }}>{t.merchant || labelOf(catOf(t))}</span>
                    <span className="block text-[11.5px] truncate" style={{ color: 'var(--text3)' }}>{labelOf(catOf(t))} · {fmtDay(t.txn_date)}{accName(t.account_id) ? ` · ${accName(t.account_id)}` : ''}</span>
                  </span>
                  <span className="text-[13px] font-semibold tabular-nums whitespace-nowrap" style={{ color: inc ? 'var(--income)' : 'var(--text)' }}>
                    {inc ? '+' : ''}{fmtMoney(Number(t.amount) || 0, t.currency)}
                  </span>
                </li>
              )
            })}
            {recent.length === 0 && <li className="text-[12.5px] py-6 text-center" style={{ color: 'var(--text3)' }}>No transactions in this view yet.</li>}
          </ul>
          <button onClick={() => openAdd()} className="wl-btn mt-3 w-full justify-center" style={{ height: 34 }}><Plus size={14} />Add</button>
        </Panel>
      </div>

      {picking && <PayFromSheet due={picking} accounts={p.accounts} onClose={() => setPicking(null)} onSaved={() => { setPicking(null); router.refresh() }} />}
    </div>
  )
}

// One tap: which bank account pays this EMI / card bill (saved on the loan or card)
function PayFromSheet({ due, accounts, onClose, onSaved }: { due: Due; accounts: any[]; onClose: () => void; onSaved: () => void }) {
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')
  const options = accounts.filter(a => kindOf(a) === 'bank' && a.currency === due.currency)
  async function choose(id: string | null) {
    if (!due.owner) return
    setBusy(id ?? 'none'); setError('')
    const { error } = await createClient().from(due.owner.table).update({ pay_from_account_id: id }).eq('id', due.owner.id)
    setBusy(null)
    if (error) setError(/pay_from_account_id/.test(error.message) ? 'Run migration 027 in Supabase first, then try again.' : error.message)
    else onSaved()
  }
  return (
    <div className="fixed inset-0 wl-sheet z-50 flex items-center justify-center p-4" style={{ background: 'rgba(15,23,42,0.45)' }} onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={`Account that pays ${due.label}`}
        className="wl-sheet-panel w-full max-w-sm rounded-2xl overflow-hidden" style={{ background: 'var(--card)', border: '1px solid var(--line)' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-2">
          <div>
            <div className="text-[15px] font-bold" style={{ color: 'var(--text)' }}>Which account pays this?</div>
            <div className="text-[12px]" style={{ color: 'var(--text3)' }}>{due.label} · {fmtMoney(due.amount, due.currency)}</div>
          </div>
          <button onClick={onClose} aria-label="Close" className="p-2 -mr-2 rounded-xl hover:bg-gray-100" style={{ color: 'var(--text3)' }}><X size={16} /></button>
        </div>
        <div className="px-2 pb-2">
          {options.map(a => (
            <button key={a.id} onClick={() => choose(a.id)} disabled={!!busy}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left hover:bg-[#F7F6FD] disabled:opacity-60">
              <BankLogo brand={brandOf(a.bank_name, a.name)} />
              <span className="flex-1 min-w-0">
                <span className="block text-[13px] font-semibold truncate" style={{ color: 'var(--text)' }}>{a.name}</span>
                <span className="block text-[11.5px]" style={{ color: 'var(--text3)' }}>{fmtMoney(Number(a.current_balance) || 0, a.currency)}</span>
              </span>
              {due.payFrom === a.id && <Check size={16} style={{ color: 'var(--accent)' }} />}
              {busy === a.id && <span className="text-[11.5px]" style={{ color: 'var(--text3)' }}>Saving…</span>}
            </button>
          ))}
          {options.length === 0 && <div className="px-3 py-4 text-[12.5px]" style={{ color: 'var(--text3)' }}>No {due.currency} bank accounts yet — add one on Bank accounts.</div>}
          {due.payFromSource === 'set' && (
            <button onClick={() => choose(null)} disabled={!!busy} className="w-full px-3 py-2.5 text-[12.5px] font-semibold text-left rounded-xl hover:bg-[#F7F6FD]" style={{ color: 'var(--text3)' }}>
              Work it out from history instead
            </button>
          )}
        </div>
        {error && <div className="mx-5 mb-4 rounded-lg px-3 py-2 text-[12px]" style={{ background: '#FEF2F2', color: '#B91C1C' }}>{error}</div>}
      </div>
    </div>
  )
}
