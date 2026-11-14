'use client'
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarClock, Hand, HandCoins, Pause, Play, Plus, Receipt, Repeat, Trash2, TrendingUp, Wallet, Zap } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useViewStore } from '@/store/viewStore'
import { daysBetween, fmtDay } from '@/lib/insights'
import { labelOf } from '@/lib/money'
import { fmtCompact, fmtMoney } from '@/lib/format'
import { nextDate, suggestRepeats, type RecurringTxn } from '@/lib/recurring'
import { spendCategories } from '@/lib/recurringGoals'
import { buildDues, safeToSpend } from '@/lib/moneyOverview'
import { declaredPayday } from '@/lib/incomePlans'
import { billTotals, coverBills, setAsideBill, whyMonthly, yearAhead, type Bill, type Cover, type Holding } from '@/lib/bigBills'
import { answerCharge, answerNo, answerSame, answerSeparate, answersFor, entriesOf, foundRegular, historyCover, monthlyCommitted, pendingCharges, sameName, type FoundCharge } from '@/lib/regular'
import { AiActions, KpiTile, LearnStrip, PageHeader, Panel, Segmented } from '@/components/ui/kit'
import { toast } from '@/components/ui/toaster'
import AddTransactionModal from '@/components/forms/AddTransactionModal'
import { AsideSheet, BillFormSheet, PaySheet, TEMPLATES, type BillDraft } from './BillSheets'
import type { BuilderDue } from '@/lib/property'

type Cur = 'AED' | 'INR'
type Filter = 'all' | 'monthly' | 'few'
interface Props {
  today: string; fx: number; bills: Bill[]; answers: string[]; ready: boolean; recurringReady: boolean
  builder?: BuilderDue[]      // your part of builder payments ahead (lib/property)
  transactions: any[]; accounts: any[]; loans: any[]; insurance: any[]; lic: any[]; mutualFunds: any[]; rds: any[]; plans: any[]; recurring: RecurringTxn[]
  holdings: Holding[]; goalLinks: any[]; contributions: any[]
}
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const monOf = (ym: string) => MON[Number(ym.slice(5, 7)) - 1]
const everyText = (n: number) => (n === 1 ? 'every month' : n === 12 ? 'every year' : n === 24 ? 'every 2 years' : `every ${n} months`)
const dueText = (days: number) => (days < 0 ? `${-days} day${days === -1 ? '' : 's'} late` : days === 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days`)
const CHIP: Record<Cover['state'], { bg: string; c: string }> = {
  ready: { bg: 'var(--pos-bg)', c: 'var(--pos-text)' },
  covered: { bg: 'var(--accent-bg)', c: 'var(--accent2)' },
  short: { bg: 'var(--amber-bg)', c: 'var(--amber-text)' },
}

// Bills (Plan): everything that leaves on a known date, in one list. Monthly
// entries and big bills differ only in the gap; what repeats in your statements is
// found by lib/regular and offered here.
export default function BillsClient(p: Props) {
  const router = useRouter()
  const supabase = createClient()
  const { view } = useViewStore()
  const { today, bills, fx, answers } = p
  const spendsOnly = useMemo(() => p.recurring.filter(r => r.txn_type === 'expense'), [p.recurring])
  const curs = (['INR', 'AED'] as Cur[]).filter(c => bills.some(b => b.currency === c) || p.recurring.some(r => r.currency === c))
  const [picked, setPicked] = useState<Cur | null>(null)
  const cur: Cur = view === 'uae' ? 'AED' : view === 'india' ? 'INR' : picked ?? curs[0] ?? 'INR'
  const [filter, setFilter] = useState<Filter>('all')
  const [form, setForm] = useState<{ draft: BillDraft; bill: Bill | null; repeat: RecurringTxn | null } | null>(null)
  const [paying, setPaying] = useState<Bill | null>(null)
  const [aside, setAside] = useState<Bill | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [other, setOther] = useState(false)
  const [openMonth, setOpenMonth] = useState<string | null>(null)
  const categories = useMemo(() => spendCategories(p.transactions), [p.transactions])
  const money = (n: number) => fmtMoney(n, cur)

  // What's free in each currency: the same number as Home's Free to spend
  const duesFor = (c: Cur, days: number) => buildDues({ today, days, builder: p.builder, view: c === 'AED' ? 'uae' : 'india', txns: p.transactions, accounts: p.accounts, loans: p.loans, insurance: p.insurance, mutualFunds: p.mutualFunds, recurring: p.recurring, rds: p.rds, plans: p.plans, lic: p.lic, bills, answers })
  const spare = useMemo(() => {
    const free = (c: Cur) => {
      const v = c === 'AED' ? 'uae' as const : 'india' as const
      return safeToSpend({ today, view: v, fx, accounts: p.accounts.filter(a => a.currency === c), dues: duesFor(c, 35), txns: p.transactions, payday: declaredPayday(p.plans, today, v, p.transactions), bills }).amount
    }
    return { AED: free('AED'), INR: free('INR') }
  }, [p, bills, today, fx]) // eslint-disable-line react-hooks/exhaustive-deps
  const covers = useMemo(() => coverBills(bills, spare, p.accounts), [bills, spare, p.accounts])
  const dues = useMemo(() => duesFor(cur, 30), [p, bills, cur, today]) // eslint-disable-line react-hooks/exhaustive-deps

  const found = useMemo(() => foundRegular(p.transactions, p.recurring, today, answers, bills).filter(f => f.currency === cur), [p.transactions, p.recurring, today, answers, bills, cur])
  const asking = pendingCharges(found, answers)
  const answered = found.filter(f => !asking.includes(f))
  const repeatsHere = spendsOnly.filter(r => r.currency === cur)
  const otherHere = p.recurring.filter(r => r.txn_type !== 'expense' && r.currency === cur)
  // What you add by hand that could repeat: money home and income (the rest is in Found)
  const handMade = useMemo(() => suggestRepeats(p.transactions.filter(t => t.currency === cur && t.txn_type !== 'expense'), p.recurring, today).slice(0, 3), [p.transactions, p.recurring, cur, today])
  const billsHere = bills.filter(b => b.currency === cur)
  const totals = billTotals(bills, cur)
  const committed = monthlyCommitted(cur, spendsOnly, bills, found)

  const repeatFew = repeatsHere.filter(r => (r.every_months || 1) > 1)
  const months = useMemo(() => yearAhead([...bills, ...repeatFew.filter(r => r.is_active).map(r => ({ key: `rep:${r.id}`, name: r.merchant, currency: r.currency, amount: Number(r.amount), due: nextDate(r, today), every: r.every_months, goal: null }) as unknown as Bill)], cur, today), [bills, repeatFew.length, cur, today]) // eslint-disable-line react-hooks/exhaustive-deps
  const top = Math.max(...months.map(m => m.total), 0), yearSum = months.reduce((s, m) => s + m.total, 0)
  const heaviest = [...months].sort((a, b) => b.total - a.total)[0]
  const billMonths = months.filter(m => m.total > 0), even = billMonths.every(m => m.total === heaviest.total)
  const shownMonth = months.find(m => m.ym === openMonth) ?? null

  const ym = today.slice(0, 7)
  const leftThisMonth = dues.filter(d => d.date.slice(0, 7) === ym && ['repeat', 'bill', 'premium'].includes(d.kind)).reduce((s, d) => s + d.amount, 0)
  const nextUp = [...repeatsHere.filter(r => r.is_active).map(r => ({ name: r.merchant, amount: Number(r.amount), date: nextDate(r, today) })), ...billsHere.filter(b => b.days >= 0).map(b => ({ name: b.name, amount: b.amount, date: b.due }))].sort((a, b) => a.date.localeCompare(b.date))[0]

  // The one list, soonest first
  const rows = [
    ...repeatsHere.map(r => ({ id: `r-${r.id}`, date: r.is_active ? nextDate(r, today) : '9999', few: (r.every_months || 1) > 1, repeat: r, bill: null as Bill | null })),
    ...billsHere.map(b => ({ id: b.key, date: b.due, few: true, repeat: null as RecurringTxn | null, bill: b })),
  ].filter(x => filter === 'all' || (filter === 'few') === x.few).sort((a, b) => a.date.localeCompare(b.date))
  const cover = useMemo(() => historyCover(p.transactions, cur, today), [p.transactions, cur, today])
  const monthName = (ym: string) => `${monOf(ym)} ${ym.slice(0, 4)}`
  const quick = TEMPLATES.filter(t => (!t.currency || t.currency === cur) && ![...repeatsHere.map(r => r.merchant), ...billsHere.map(b => b.name)].some(n => sameName(n, t.name)))
  const nFew = repeatFew.length + billsHere.length, nMonthly = repeatsHere.length - repeatFew.length

  const blank = (o: Partial<BillDraft> = {}): BillDraft => ({ name: '', amount: '', currency: cur, due: '', every: 1, category: '', accountId: '', ...o })
  const addFound = (f: FoundCharge) => setForm({ bill: null, repeat: null, draft: blank({ name: f.name, amount: String(f.med), currency: f.currency as Cur, due: f.next, every: f.every, category: f.category, accountId: f.account_id ?? '', found: true }) })
  const editBill = (b: Bill) => setForm({ bill: b, repeat: null, draft: blank({ name: b.name, amount: String(b.amount), currency: b.currency, due: b.due, every: b.every, category: b.category ?? '' }) })
  const editRepeat = (r: RecurringTxn) => setForm({ bill: null, repeat: r, draft: blank({ name: r.merchant, amount: String(r.amount), currency: r.currency as Cur, due: nextDate(r, today), every: r.every_months || 1, category: r.category, accountId: r.account_id ?? '' }) })

  const uid = async () => (await supabase.auth.getUser()).data.user?.id ?? null
  async function setAsideNow(b: Bill) {
    setBusy(b.key)
    const id = await uid()
    const err = id ? await setAsideBill(supabase, id, b, b.monthly, today) : 'Please sign in again.'
    setBusy(null)
    if (err) { toast(err, 'error'); return }
    toast(`${fmtMoney(b.monthly, b.currency)} set aside for ${b.name}`)
    router.refresh()
  }
  async function answer(f: FoundCharge, next: string | null) {
    setBusy(f.key)
    const id = await uid()
    const err = id ? await answerCharge(supabase, id, f.key, answers, next) : 'Please sign in again.'
    setBusy(null)
    if (err) { toast(err, 'error'); return }
    router.refresh()
  }
  async function patchRepeat(r: RecurringTxn, change: Partial<RecurringTxn>) {
    setBusy(r.id)
    const { error } = await supabase.from('recurring_txns').update(change).eq('id', r.id)
    setBusy(null)
    if (error) { toast(error.message, 'error'); return }
    router.refresh()
  }
  async function removeRepeat(r: RecurringTxn) {
    setBusy(r.id)
    const { error } = await supabase.from('recurring_txns').delete().eq('id', r.id)
    setBusy(null)
    if (error) { toast(error.message, 'error'); return }
    router.refresh()
  }
  async function adopt(s: ReturnType<typeof suggestRepeats>[number]) {
    setBusy(s.key)
    const id = await uid()
    if (!id) { setBusy(null); return }
    const { error } = await supabase.from('recurring_txns').insert({ user_id: id, merchant: s.merchant, category: s.category, sub_category: s.sub_category, txn_type: s.txn_type,
      amount: Math.round(s.amount * 100) / 100, currency: s.currency, account_id: s.account_id, counter_account_id: s.counter_account_id, day_of_month: s.day, every_months: 1, start_month: s.lastMonth, last_done_month: s.lastMonth, auto_add: false })
    setBusy(null)
    if (error) { toast(error.message, 'error'); return }
    router.refresh()
  }
  const accName = (id: string | null) => p.accounts.find(a => a.id === id)?.name ?? null
  const entries = entriesOf(spendsOnly, bills).filter(x => x.currency === cur)
  const listText = rows.slice(0, 12).map(x => x.bill ? `${x.bill.name} ${fmtMoney(x.bill.amount, x.bill.currency)} ${everyText(x.bill.every)}` : `${x.repeat!.merchant} ${fmtMoney(Number(x.repeat!.amount), x.repeat!.currency)} ${everyText(x.repeat!.every_months || 1)}`).join(', ')

  const foundRow = (f: FoundCharge) => {
    const b = busy === f.key, st = { height: 30, fontSize: 12 }, btn = 'wl-btn disabled:opacity-60', m = (n: number) => fmtMoney(n, f.currency)
    const note = f.state === 'looks' ? `Not counted: looks like your ${f.repeat.merchant} (${m(Number(f.repeat.amount))})`
      : f.state === 'same' ? `Not counted: the same as your ${f.repeat.merchant}` : f.state === 'no' ? 'Not counted: you said it isn’t regular'
      : f.every === 1 ? 'Counted in your plan as an estimate' : `Next around ${fmtDay(f.next)}. Not in your plan until you add it`
    return (
      <li key={f.key} className="flex gap-3 items-center py-2.5 flex-wrap md:flex-nowrap" style={{ borderTop: '1px solid var(--track)', opacity: f.state === 'no' || f.state === 'same' ? .72 : 1 }}>
        <span className="flex-1 min-w-0 max-md:basis-full">
          <span className="flex justify-between gap-3 text-[13px] font-semibold" style={{ color: 'var(--text)' }}>
            <span className="min-w-0 truncate">{f.name} · {everyText(f.every)}</span><span className="tabular-nums flex-shrink-0 md:hidden">{m(f.med)}</span>
          </span>
          <span className="block text-[11.5px] mt-0.5 leading-snug" style={{ color: 'var(--text3)' }}>{labelOf(f.category)} · {f.seen.slice(0, 3).map(s => `${fmtDay(s.date)} ${m(s.amount)}`).join(', ')}{f.rose ? ` · up ${f.rose}%` : ''}</span>
          <span className="block text-[11.5px] font-semibold mt-0.5" style={{ color: f.state === 'looks' ? 'var(--amber-text)' : 'var(--text2)' }}>{note}</span>
        </span>
        <span className="hidden md:block text-[13px] font-semibold tabular-nums flex-shrink-0" style={{ color: 'var(--text)' }}>{m(f.med)}</span>
        <span className="flex gap-1.5 flex-wrap items-center md:flex-shrink-0 md:justify-end wl-hide-viewing">
          {f.state === 'looks' && (<>
            <button onClick={() => answer(f, answerSame(f.key, f.repeat.id))} disabled={b} className={`${btn} wl-btn-primary`} style={st}>Yes, it’s my {f.repeat.merchant}</button>
            <button onClick={() => answer(f, answerSeparate(f.key))} disabled={b} className={btn} style={st}>No, it’s separate</button>
          </>)}
          {f.state === 'counted' && (<>
            <button onClick={() => addFound(f)} disabled={b} className={`${btn} wl-btn-primary`} style={st}>{f.every === 1 ? 'Add as monthly' : 'Add as big bill'}</button>
            {entries.length > 0 && (
              <select value="" disabled={b} onChange={e => e.target.value && answer(f, answerSame(f.key, e.target.value))} aria-label={`${f.name} is the same as`} className="wl-input" style={{ height: 30, fontSize: 12, width: 'auto', padding: '0 8px' }}>
                <option value="">Same as…</option>
                {entries.map(x => <option key={x.id} value={x.id}>{x.merchant}</option>)}
              </select>
            )}
            <button onClick={() => answer(f, answerNo(f.key))} disabled={b} className={btn} style={st}>Not regular</button>
          </>)}
          {answersFor(f.key, answers).length > 0 && f.state !== 'looks' && <button onClick={() => answer(f, null)} disabled={b} className={btn} style={st}>Undo</button>}
        </span>
      </li>
    )
  }

  return (
    <div className="flex flex-col gap-3.5 md:gap-[18px] animate-fade-up">
      <PageHeader title="Bills" sub="Everything that leaves on a known date. What repeats in your statements is found for you." actions={<>
          <button onClick={() => router.push('/dashboard/ingest')} className="wl-btn" style={{ height: 34 }}>Import statements</button>
          <button onClick={() => setForm({ bill: null, repeat: null, draft: blank() })} className="wl-btn wl-btn-primary wl-hide-viewing" style={{ height: 34 }}><Plus size={14} />Add a bill</button>
        </>} />

      <button onClick={() => setForm({ bill: null, repeat: null, draft: blank() })} className="md:hidden wl-btn wl-btn-primary w-full wl-hide-viewing" style={{ height: 44 }}><Plus size={16} />Add a bill</button>
      <div className="wl-show-viewing rounded-2xl px-4 py-3 text-[13px]" style={{ background: 'var(--accent-bg)', color: 'var(--accent2)' }}>
        You’re viewing a family member’s bills, so adding and changing are off. Switch back to your own view to add a bill.
      </div>

      {!p.ready && (
        <div className="rounded-2xl px-4 py-3 text-[13px]" style={{ background: 'var(--amber-bg)', color: 'var(--amber-text)' }}>
          Run migration 041 in Supabase so your answers below can be saved. Everything else works already.
        </div>
      )}
      {!p.recurringReady && (
        <div className="rounded-2xl px-4 py-3 text-[13px]" style={{ background: 'var(--amber-bg)', color: 'var(--amber-text)' }}>Run migration 027 in Supabase so monthly entries can be saved.</div>
      )}
      {view === 'consolidated' && curs.length > 1 && <div><Segmented label="Currency" value={cur} onChange={(c: Cur) => setPicked(c)} options={[{ value: 'INR', label: 'India (₹)' }, { value: 'AED', label: 'UAE (AED)' }]} /></div>}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 md:gap-3.5">
        <KpiTile label="Bills a month" value={fmtCompact(committed.total, cur)} delta={committed.aside > 0 ? `${fmtCompact(committed.aside, cur)} of it for big bills` : committed.spotted > 0 ? `${fmtCompact(committed.spotted, cur)} of it estimated` : 'From your bills'} icon={Wallet} tint={0} />
        <KpiTile label="Still due this month" value={fmtCompact(leftThisMonth, cur)} delta={leftThisMonth > 0 ? 'Bills and premiums' : 'Nothing more'} icon={CalendarClock} tint={2} />
        <KpiTile label="To set aside a month" value={fmtCompact(totals.monthly, cur)} delta={`${fmtCompact(totals.saved, cur)} set aside so far`} icon={HandCoins} tint={1} />
        <KpiTile label="Next bill" value={nextUp ? fmtCompact(nextUp.amount, cur) : '—'} delta={nextUp ? `${nextUp.name}, ${fmtDay(nextUp.date)}` : 'None yet'} icon={Receipt} tint={3} />
      </div>

      {(
        <Panel title="Found in your statements" right={asking.length > 0 ? <span className="text-[11px] font-semibold px-2 py-[3px] rounded-full" style={{ background: 'var(--amber-bg)', color: 'var(--amber-text)' }}>{asking.length} to review</span> : undefined}>
          <p className="text-[12px] mt-0.5 leading-snug" style={{ color: 'var(--text3)' }}>
            {cover.months > 0 ? `We've read ${cover.months} month${cover.months === 1 ? '' : 's'} of your ${cur === 'AED' ? 'UAE' : 'India'} spending (${monthName(cover.from!)} to ${monthName(cover.to!)}). ` : `There's no ${cur === 'AED' ? 'UAE' : 'India'} spending to read yet. `}
            A monthly bill shows up after 3 payments, and a bill every few months after 2 or 3. New ones appear here by themselves.
            {cover.months < 6 && <> <button onClick={() => router.push('/dashboard/ingest')} className="font-semibold underline" style={{ color: 'var(--accent)' }}>Import more statements</button> to find more sooner.</>}
          </p>
          {found.length === 0 && <p className="text-[13px] mt-2" style={{ color: 'var(--text2)' }}>Nothing new repeats yet. You can add anything you already know about below.</p>}
          {asking.length > 0 && <ul className="mt-1">{asking.map(foundRow)}</ul>}
          {answered.length > 0 && (
            <details className="mt-2">
              <summary className="text-[12px] font-semibold cursor-pointer" style={{ color: 'var(--accent)' }}>{answered.length} you’ve already answered</summary>
              <ul className="mt-1">{answered.map(foundRow)}</ul>
            </details>
          )}
        </Panel>
      )}

      <Panel title="Your bills" right={repeatsHere.length + billsHere.length > 0 ? <Segmented label="Show" value={filter} onChange={(v: Filter) => setFilter(v)} options={[{ value: 'all', label: 'All' }, { value: 'monthly', label: `Monthly ${nMonthly}` }, { value: 'few', label: `Few months ${nFew}` }]} /> : undefined}>
        {repeatsHere.length + billsHere.length === 0 ? (<>
          <p className="mt-1.5 text-[13px] leading-snug" style={{ color: 'var(--text3)' }}>Your LIC and insurance premiums appear here by themselves once they’re on file. Add anything else:</p>
          <div className="flex flex-wrap gap-1.5 mt-3 wl-hide-viewing">
            {TEMPLATES.map(t => <button key={t.name} onClick={() => setForm({ bill: null, repeat: null, draft: blank({ name: t.name, every: t.every, category: t.category, currency: t.currency ?? cur }) })} className="wl-chip" style={{ height: 36 }}>{t.name}</button>)}
          </div>
        </>) : rows.length === 0 ? (
          <p className="mt-2 text-[13px]" style={{ color: 'var(--text3)' }}>Nothing here for this filter.</p>
        ) : (
          ([['Every month', rows.filter(x => !x.few)], ['Every few months', rows.filter(x => x.few)]] as [string, typeof rows][]).filter(([, list]) => list.length > 0).map(([title, list]) => (
            <div key={title} className="mt-3">
              <h3 className="text-[12px] font-semibold" style={{ color: 'var(--text3)' }}>{title}</h3>
              <div className="grid md:grid-cols-2 gap-2.5 mt-1.5">
                {list.map(x => x.bill
                  ? <BigCard key={x.id} b={x.bill} cover={covers[x.bill.key]} busy={busy === x.bill.key} onAside={() => setAsideNow(x.bill!)} onOther={() => setAside(x.bill)} onPaid={() => setPaying(x.bill)} onEdit={() => editBill(x.bill!)} />
                  : <RepeatCard key={x.id} r={x.repeat!} today={today} account={accName(x.repeat!.account_id)} bankName={found.find(f => f.state === 'same' && f.repeat?.id === x.repeat!.id)?.name} busy={busy === x.repeat!.id}
                      onAuto={() => patchRepeat(x.repeat!, { auto_add: !x.repeat!.auto_add })} onPause={() => patchRepeat(x.repeat!, { is_active: !x.repeat!.is_active })} onEdit={() => editRepeat(x.repeat!)} onRemove={() => removeRepeat(x.repeat!)} />)}
              </div>
            </div>
          ))
        )}
        {repeatsHere.length + billsHere.length > 0 && quick.length > 0 && (
          <div className="mt-3 pt-3 wl-hide-viewing" style={{ borderTop: '1px solid var(--track)' }}>
            <div className="text-[12px] font-semibold mb-1.5" style={{ color: 'var(--text3)' }}>Add another</div>
            <div className="flex flex-wrap gap-1.5">
              {quick.map(t => <button key={t.name} onClick={() => setForm({ bill: null, repeat: null, draft: blank({ name: t.name, every: t.every, category: t.category, currency: t.currency ?? cur }) })} className="wl-chip" style={{ height: 34 }}>{t.name}</button>)}
              <button onClick={() => setForm({ bill: null, repeat: null, draft: blank() })} className="wl-chip" style={{ height: 34 }}><Plus size={13} />Something else</button>
            </div>
          </div>
        )}
      </Panel>

      <div className="grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-3.5 md:gap-[18px]">
        <Panel title="The year ahead" right={<span className="text-[12px] tabular-nums" style={{ color: 'var(--text3)' }}>{yearSum > 0 ? `${money(yearSum)} in big bills` : ''}</span>}>
          {yearSum === 0 ? <p className="mt-2 text-[13px]" style={{ color: 'var(--text3)' }}>Bills that come every few months show here, so you can see the heavy months early.</p> : (<>
            <div className="grid grid-cols-12 gap-1 md:gap-2 mt-3 h-[150px] lg:h-[215px]">
              {months.map(m => (
                <button key={m.ym} type="button" onClick={() => setOpenMonth(openMonth === m.ym ? null : m.ym)} aria-pressed={openMonth === m.ym} disabled={!m.total} aria-label={`${monOf(m.ym)}: ${m.total ? money(m.total) : 'nothing due'}`} title={m.total ? `${monOf(m.ym)}: ${money(m.total)}` : undefined}
                  className="flex flex-col items-center justify-end min-w-0 h-full rounded-lg disabled:cursor-default" style={{ background: openMonth === m.ym ? 'var(--accent-bg)' : undefined }}>
                  {m.total > 0 && (m.heavy || m.total === top) && <span className="text-[10px] md:text-[11.5px] font-semibold tabular-nums whitespace-nowrap mb-1" style={{ color: 'var(--text)' }}>{fmtCompact(m.total, cur)}</span>}
                  <span className="w-full max-w-[34px] rounded-t" style={{ height: m.total ? `${Math.max(5, m.total / top * 68)}%` : 2, background: !m.total ? 'var(--track)' : m.heavy || m.total === top ? 'var(--accent2)' : 'var(--accent)', opacity: m.total && !(m.heavy || m.total === top) ? .55 : 1 }} />
                  <span className="text-[10.5px] md:text-[11.5px] mt-1.5" style={{ color: m.heavy ? 'var(--text)' : 'var(--text3)', fontWeight: m.heavy ? 600 : 400 }}>{monOf(m.ym)}</span>
                </button>
              ))}
            </div>
            {shownMonth ? (
              <ul className="mt-3 flex flex-col gap-1 text-[12.5px]">
                {shownMonth.items.map(i => <li key={i.name + i.date} className="flex justify-between gap-3"><span style={{ color: 'var(--text2)' }}>{i.name} · {fmtDay(i.date)}</span><span className="tabular-nums font-semibold" style={{ color: 'var(--text)' }}>{money(i.amount)}</span></li>)}
              </ul>
            ) : (
              <p className="mt-3 text-[12.5px] leading-snug" style={{ color: 'var(--text3)' }}>
                {even ? `${money(heaviest.total)} falls in ${billMonths.map(m => monOf(m.ym)).join(', ')}.` : billMonths.filter(m => m.total === top).length > 1 ? `${billMonths.filter(m => m.total === top).map(m => monOf(m.ym)).join(', ')} are your heaviest months: ${money(top)} each.` : `${monOf(heaviest.ym)} is your heaviest month: ${money(heaviest.total)} (${heaviest.items.slice(0, 3).map(i => i.name).join(', ')}).`} Monthly bills aren’t shown here. Tap a month to see what’s in it.
              </p>
            )}
          </>)}
        </Panel>
        <Panel title="Coming up · next 30 days">
          {dues.length === 0 ? <p className="text-[12.5px] mt-2" style={{ color: 'var(--text3)' }}>Nothing due in the next 30 days.</p> : (
            <div className="mt-1.5">
              {dues.slice(0, 6).map((d, i) => (
                <div key={d.id} className="flex items-center gap-2.5 py-2" style={{ borderTop: i ? '1px solid var(--track)' : undefined }}>
                  <div className="flex-1 min-w-0">
                    <div className="text-[12.5px] font-semibold truncate" style={{ color: 'var(--text)' }}>{d.label}</div>
                    <div className="text-[11.5px] truncate" style={{ color: 'var(--text3)' }}>{fmtDay(d.date)} · {dueText(daysBetween(today, d.date))}</div>
                  </div>
                  <div className="text-[12.5px] font-semibold tabular-nums whitespace-nowrap" style={{ color: 'var(--text)' }}>{fmtMoney(d.amount, d.currency)}</div>
                </div>
              ))}
              {dues.length > 6 && <div className="text-[11.5px] pt-1.5" style={{ color: 'var(--text3)' }}>and {dues.length - 6} more, including EMIs and card bills</div>}
            </div>
          )}
        </Panel>
      </div>

      {(otherHere.length > 0 || handMade.length > 0) && (
        <Panel title="Repeating income and transfers" right={<button onClick={() => setOther(true)} className="wl-btn wl-hide-viewing" style={{ height: 30, fontSize: 12 }}>New</button>}>
          {otherHere.length > 0 && (
            <ul className="mt-1">
              {otherHere.map((r, i) => (
                <li key={r.id} className="flex items-center gap-3 py-2" style={{ borderTop: i ? '1px solid var(--track)' : undefined, opacity: r.is_active ? 1 : .55 }}>
                  <span className="flex-1 min-w-0">
                    <span className="block text-[13px] font-semibold truncate" style={{ color: 'var(--text)' }}>{r.merchant}</span>
                    <span className="block text-[11.5px] truncate" style={{ color: 'var(--text3)' }}>{labelOf(r.category)} · {r.is_active ? `next ${fmtDay(nextDate(r, today))}` : 'paused'}</span>
                  </span>
                  <span className="text-[13px] font-semibold tabular-nums" style={{ color: 'var(--text)' }}>{fmtMoney(Number(r.amount), r.currency)}</span>
                  <span className="flex gap-0.5 wl-hide-viewing">
                    <IconBtn label={r.is_active ? `Pause ${r.merchant}` : `Resume ${r.merchant}`} onClick={() => patchRepeat(r, { is_active: !r.is_active })}>{r.is_active ? <Pause size={14} /> : <Play size={14} />}</IconBtn>
                    <IconBtn label={`Delete ${r.merchant}`} onClick={() => removeRepeat(r)}><Trash2 size={14} /></IconBtn>
                  </span>
                </li>
              ))}
            </ul>
          )}
          {handMade.map(s => (
            <div key={s.key} className="flex items-center gap-3 py-2 wl-hide-viewing" style={{ borderTop: '1px solid var(--track)' }}>
              <div className="flex-1 min-w-0 text-[12.5px] truncate" style={{ color: 'var(--text2)' }}><b style={{ color: 'var(--text)' }}>{s.merchant}</b> · {fmtMoney(s.amount, s.currency)} · you add this by hand every month</div>
              <button onClick={() => adopt(s)} disabled={busy === s.key} className="wl-btn flex-shrink-0 disabled:opacity-60" style={{ height: 28, fontSize: 12 }}><Repeat size={12} />Repeat</button>
            </div>
          ))}
        </Panel>
      )}

      <AiActions actions={['Which subscriptions could I cancel?', 'How can I lower my bills?']} context={listText ? `My bills: ${listText}.` : 'No bills on file yet.'} />
      <LearnStrip title="Statement date vs due date" href="/dashboard/cards/learn" />

      {form && <BillFormSheet draft={form.draft} bill={form.bill} repeat={form.repeat} accounts={p.accounts} categories={categories} holdings={p.holdings} goalLinks={p.goalLinks} contributions={p.contributions} onClose={() => setForm(null)} />}
      {paying && <PaySheet bill={paying} accounts={p.accounts} categories={categories} txns={p.transactions} today={today} onClose={() => setPaying(null)} />}
      {aside && <AsideSheet bill={aside} today={today} onClose={() => setAside(null)} />}
      {other && <AddTransactionModal repeat onClose={() => { setOther(false); router.refresh() }} />}
    </div>
  )
}

const IconBtn = ({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) => (
  <button onClick={onClick} aria-label={label} title={label} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[var(--accent-bg)]" style={{ color: 'var(--text3)' }}>{children}</button>
)

function Head({ name, sub, amount, when, late }: { name: string; sub: string; amount: string; when: string; late?: boolean }) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex-1 min-w-0">
        <h3 className="text-[14.5px] font-bold truncate" style={{ color: 'var(--text)' }}>{name}</h3>
        <div className="text-[12px] mt-px truncate" style={{ color: 'var(--text3)' }}>{sub}</div>
      </div>
      <div className="text-right flex-shrink-0">
        <div className="text-[15px] font-bold tabular-nums" style={{ color: 'var(--text)' }}>{amount}</div>
        <div className="text-[12px] mt-px" style={{ color: late ? '#DC2626' : 'var(--text3)' }}>{when}</div>
      </div>
    </div>
  )
}

function RepeatCard({ r, today, account, bankName, busy, onAuto, onPause, onEdit, onRemove }: { r: RecurringTxn; today: string; account: string | null; bankName?: string; busy: boolean; onAuto: () => void; onPause: () => void; onEdit: () => void; onRemove: () => void }) {
  const next = nextDate(r, today), st = { height: 32, fontSize: 12.5 }
  return (
    <article className="rounded-[14px] p-3.5 flex flex-col gap-2 md:[&:last-child:nth-child(odd)]:col-span-2" style={{ border: '1px solid var(--line)', opacity: r.is_active ? 1 : .6 }}>
      <Head name={r.merchant} sub={`${labelOf(r.category)} · ${everyText(r.every_months || 1)}${account ? ` · ${account}` : ''}`} amount={fmtMoney(Number(r.amount), r.currency)} when={r.is_active ? `${fmtDay(next)} · ${dueText(daysBetween(today, next))}` : 'Paused'} />
      {bankName && <p className="text-[12px]" style={{ color: 'var(--text3)' }}>Your bank calls it {bankName}.</p>}
      <div className="flex gap-1.5 flex-wrap items-center mt-auto pt-1 wl-hide-viewing">
        <button onClick={onAuto} disabled={busy} title={r.auto_add ? 'Enters itself with no review. Tap to review each one' : 'Enters itself and waits for your approval. Tap to skip the review'} className="rounded-full px-2.5 h-8 text-[12px] font-semibold flex items-center gap-1"
          style={r.auto_add ? { background: '#E7F7EF', color: '#1E7A50' } : { background: 'var(--accent-bg)', color: 'var(--accent2)' }}>{r.auto_add ? <><Zap size={12} />Adds itself</> : <><Hand size={12} />Asks first</>}</button>
        <button onClick={onEdit} disabled={busy} className="wl-btn" style={st}>Change</button>
        <span className="flex-1" />
        <IconBtn label={r.is_active ? `Pause ${r.merchant}` : `Resume ${r.merchant}`} onClick={onPause}>{r.is_active ? <Pause size={14} /> : <Play size={14} />}</IconBtn>
        <IconBtn label={`Delete ${r.merchant}`} onClick={onRemove}><Trash2 size={14} /></IconBtn>
      </div>
    </article>
  )
}

function BigCard({ b, cover, busy, onAside, onOther, onPaid, onEdit }: { b: Bill; cover: Cover; busy: boolean; onAside: () => void; onOther: () => void; onPaid: () => void; onEdit: () => void }) {
  const money = (n: number) => fmtMoney(n, b.currency), chip = CHIP[cover.state], st = { height: 32, fontSize: 12.5 }
  return (
    <article className="rounded-[14px] p-3.5 flex flex-col gap-2 md:[&:last-child:nth-child(odd)]:col-span-2" style={{ border: '1px solid var(--line)' }}>
      <Head name={b.name} sub={`${b.sub} · ${everyText(b.every)}`} amount={money(b.amount)} when={`${fmtDay(b.due)} · ${dueText(b.days)}`} late={b.days < 0} />
      <div>
        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--track)' }} role="progressbar" aria-valuenow={Math.round(b.pct)} aria-valuemin={0} aria-valuemax={100} aria-label={`${b.name} set aside`}>
          <div className="h-full rounded-full" style={{ width: `${b.pct}%`, background: 'var(--accent)' }} />
        </div>
        <div className="flex items-center justify-between gap-2 mt-1.5 flex-wrap">
          <span className="text-[12px] tabular-nums" style={{ color: 'var(--text2)' }}>{money(Math.min(b.saved, b.amount))} of {money(b.amount)} set aside</span>
          <span className="text-[11.5px] font-semibold rounded-full px-2.5 py-[3px]" style={{ background: chip.bg, color: chip.c }}>{cover.state === 'ready' ? 'Ready' : cover.state === 'covered' ? 'Covered' : `Short by ${money(cover.short)}`}</span>
        </div>
      </div>
      <p className="text-[12.5px] leading-snug" style={{ color: 'var(--text3)' }}>{cover.state === 'short' ? cover.tip : b.left > 0 ? whyMonthly(b) : cover.tip}</p>
      {b.rise && <p className="text-[12.5px] leading-snug flex items-center gap-1.5 font-medium" style={{ color: 'var(--amber-text)' }}><TrendingUp size={14} className="flex-shrink-0" /> Up {b.rise.pct}% from {money(b.rise.from)}. Worth a call before you renew.</p>}
      <div className="flex gap-1.5 flex-wrap items-center mt-auto pt-1 wl-hide-viewing">
        {b.left > 0 && !b.doneThisMonth && <button onClick={onAside} disabled={busy} className="wl-btn wl-btn-primary disabled:opacity-60" style={st}>Set aside {money(b.monthly)}</button>}
        {b.doneThisMonth && b.left > 0 && <span className="text-[12px] mr-1" style={{ color: 'var(--pos-text)' }}>Done this month ✓</span>}
        <button onClick={onOther} disabled={busy} className="wl-btn" style={st}>Other amount</button>
        <button onClick={onPaid} disabled={busy} className="wl-btn" style={st}>Paid</button>
        <button onClick={onEdit} disabled={busy} className="wl-btn" style={st}>Change</button>
      </div>
    </article>
  )
}
