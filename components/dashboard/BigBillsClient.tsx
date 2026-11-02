'use client'
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarClock, HandCoins, PiggyBank, Receipt, TrendingUp } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { fmtCompact, fmtMoney } from '@/lib/format'
import { fmtDay } from '@/lib/insights'
import { spendCategories } from '@/lib/recurringGoals'
import { buildDues, safeToSpend } from '@/lib/moneyOverview'
import { declaredPayday } from '@/lib/incomePlans'
import { billTotals, coverBills, detectBills, setAsideBill, skipBill, whyMonthly, yearAhead, type Bill, type Cover, type FoundBill } from '@/lib/bigBills'
import { KpiTile, PageHeader, Panel, Segmented } from '@/components/ui/kit'
import { toast } from '@/components/ui/toaster'
import { useViewStore } from '@/store/viewStore'
import { AsideSheet, BillFormSheet, PaySheet, TEMPLATES, type BillDraft } from './BillSheets'

type Cur = 'AED' | 'INR'
interface Props {
  today: string; fx: number; bills: Bill[]; skips: string[]; ready: boolean
  transactions: any[]; accounts: any[]; loans: any[]; insurance: any[]; lic: any[]; mutualFunds: any[]; rds: any[]; plans: any[]; recurring: any[]
}
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const monOf = (ym: string) => MON[Number(ym.slice(5, 7)) - 1]
const everyText = (n: number) => (n === 12 ? 'every year' : n === 24 ? 'every 2 years' : `every ${n} months`)
const dueText = (days: number) => (days < 0 ? `${-days} day${days === -1 ? '' : 's'} late` : days === 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days`)
const CHIP: Record<Cover['state'], { bg: string; c: string }> = {
  ready: { bg: 'var(--pos-bg)', c: 'var(--pos-text)' },
  covered: { bg: 'var(--accent-bg)', c: 'var(--accent2)' },
  short: { bg: 'var(--amber-bg)', c: 'var(--amber-text)' },
}

export default function BigBillsClient(p: Props) {
  const router = useRouter()
  const { view } = useViewStore()
  const { today, bills, fx } = p
  const curs = (['INR', 'AED'] as Cur[]).filter(c => bills.some(b => b.currency === c))
  const [picked, setPicked] = useState<Cur | null>(null)
  const cur: Cur = view === 'uae' ? 'AED' : view === 'india' ? 'INR' : picked ?? curs[0] ?? 'INR'
  const [form, setForm] = useState<{ draft: BillDraft; bill: Bill | null } | null>(null)
  const [paying, setPaying] = useState<Bill | null>(null)
  const [aside, setAside] = useState<Bill | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const [openMonth, setOpenMonth] = useState<string | null>(null)
  const categories = useMemo(() => spendCategories(p.transactions), [p.transactions])

  // What's free in each currency, the same number as Home's Free to spend
  const spare = useMemo(() => {
    const free = (c: Cur) => {
      const v = c === 'AED' ? 'uae' as const : 'india' as const
      const dues = buildDues({ today, days: 35, view: v, txns: p.transactions, accounts: p.accounts, loans: p.loans, insurance: p.insurance, mutualFunds: p.mutualFunds, recurring: p.recurring, rds: p.rds, plans: p.plans, lic: p.lic, bills, answers: p.skips })
      return safeToSpend({ today, view: v, fx, accounts: p.accounts.filter(a => a.currency === c), dues, txns: p.transactions, payday: declaredPayday(p.plans, today, v, p.transactions), bills }).amount
    }
    return { AED: free('AED'), INR: free('INR') }
  }, [p.transactions, p.accounts, p.loans, p.insurance, p.lic, p.mutualFunds, p.recurring, p.rds, p.plans, bills, today, fx])
  const covers = useMemo(() => coverBills(bills, spare, p.accounts), [bills, spare, p.accounts])
  const found = useMemo(() => detectBills(p.transactions, bills, p.recurring, today, p.skips).filter(f => !hidden.has(f.key) && f.currency === cur), [p.transactions, bills, p.recurring, today, p.skips, hidden, cur])
  const months = useMemo(() => yearAhead(bills, cur, today), [bills, cur, today])

  const mine = bills.filter(b => b.currency === cur)
  const totals = billTotals(bills, cur)
  const money = (n: number) => fmtMoney(n, cur)
  const toFill = mine.filter(b => b.left > 0).length
  const dueSoon = mine.filter(b => b.days <= 30)
  const dueSoonSum = dueSoon.reduce((s, b) => s + b.amount, 0)
  const top = Math.max(...months.map(m => m.total), 0)
  const yearSum = months.reduce((s, m) => s + m.total, 0)
  const heaviest = [...months].sort((a, b) => b.total - a.total)[0]
  const billMonths = months.filter(m => m.total > 0)
  const even = billMonths.every(m => m.total === heaviest.total)
  const shownMonth = months.find(m => m.ym === openMonth) ?? null

  const blank = (o: Partial<BillDraft> = {}): BillDraft => ({ name: '', amount: '', currency: cur, due: '', every: 12, category: '', ...o })
  const addFound = (f: FoundBill) => setForm({ bill: null, draft: blank({ name: f.name, amount: String(f.amount), currency: f.currency, due: f.next, every: f.every, category: f.category, detectKey: f.key }) })
  const editBill = (b: Bill) => setForm({ bill: b, draft: blank({ name: b.name, amount: String(b.amount), currency: b.currency, due: b.due, every: b.every, category: b.category ?? '' }) })

  async function setAsideNow(b: Bill) {
    setBusy(b.key)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const err = user ? await setAsideBill(supabase, user.id, b, b.monthly, today) : 'Please sign in again.'
    setBusy(null)
    if (err) { toast(err, 'error'); return }
    toast(`${fmtMoney(b.monthly, b.currency)} set aside for ${b.name}`)
    router.refresh()
  }
  async function notABill(f: FoundBill) {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const err = user ? await skipBill(supabase, user.id, `detect:${f.key}`) : 'Please sign in again.'
    if (err) { toast(err, 'error'); return }
    setHidden(s => new Set(s).add(f.key))
  }

  return (
    <div className="flex flex-col gap-3.5">
      <PageHeader title="Big bills" sub="Bills that come every few months. Set a little aside each month and they stop hurting." onAdd={() => setForm({ bill: null, draft: blank() })} addLabel="Add a bill" />

      {!p.ready && (
        <div className="rounded-2xl px-4 py-3 text-[13px]" style={{ background: 'var(--amber-bg)', color: 'var(--amber-text)' }}>
          Run migration 041 in Supabase so “Not a bill”, “Later” and the price rise alert can be saved. Everything else works already.
        </div>
      )}

      {view === 'consolidated' && curs.length > 1 && <div><Segmented label="Currency" value={cur} onChange={(c: Cur) => setPicked(c)} options={[{ value: 'INR', label: 'India (₹)' }, { value: 'AED', label: 'UAE (AED)' }]} /></div>}

      {mine.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 md:gap-3.5">
          <KpiTile label="To set aside a month" value={fmtCompact(totals.monthly, cur)} delta={toFill === mine.length ? `for ${mine.length} bill${mine.length === 1 ? '' : 's'}` : `for ${toFill} of ${mine.length} bills`} icon={HandCoins} tint={0} />
          <KpiTile label="Set aside so far" value={fmtCompact(totals.saved, cur)} delta="Not in Free to spend" icon={PiggyBank} tint={1} />
          <KpiTile label="Due in 30 days" value={fmtCompact(dueSoonSum, cur)} delta={dueSoon.length ? `${dueSoon.length} bill${dueSoon.length === 1 ? '' : 's'}` : 'Nothing due'} icon={CalendarClock} tint={2} />
          <KpiTile label="Next bill" value={totals.next ? fmtCompact(totals.next.amount, cur) : '—'} delta={totals.next ? `${totals.next.name}, ${fmtDay(totals.next.due)}` : 'None yet'} icon={Receipt} tint={3} />
        </div>
      )}

      {mine.length > 0 && (
        <Panel title="The year ahead" right={<span className="text-[12px] tabular-nums" style={{ color: 'var(--text3)' }}>{money(yearSum)} in 12 months</span>}>
          <div className="grid grid-cols-12 gap-1 md:gap-2 mt-3" style={{ height: 150 }}>
            {months.map(m => (
              <button key={m.ym} type="button" onClick={() => setOpenMonth(openMonth === m.ym ? null : m.ym)} aria-pressed={openMonth === m.ym} disabled={!m.total}
                aria-label={`${monOf(m.ym)}: ${m.total ? money(m.total) : 'nothing due'}`} title={m.total ? `${monOf(m.ym)}: ${money(m.total)}` : undefined}
                className="flex flex-col items-center justify-end min-w-0 h-full rounded-lg disabled:cursor-default" style={{ background: openMonth === m.ym ? 'var(--accent-bg)' : undefined }}>
                {m.total > 0 && (m.heavy || m.total === top) && <span className="text-[10px] md:text-[11.5px] font-semibold tabular-nums whitespace-nowrap mb-1" style={{ color: 'var(--text)' }}>{fmtCompact(m.total, cur)}</span>}
                <span className="w-full max-w-[34px] rounded-t" style={{ height: m.total ? `${Math.max(6, m.total / top * 100)}px` : 2, background: !m.total ? 'var(--track)' : m.heavy ? 'var(--accent2)' : 'var(--accent)', opacity: m.total && !m.heavy ? .55 : 1 }} />
                <span className="text-[10.5px] md:text-[11.5px] mt-1.5" style={{ color: m.heavy ? 'var(--text)' : 'var(--text3)', fontWeight: m.heavy ? 600 : 400 }}>{monOf(m.ym)}</span>
              </button>
            ))}
          </div>
          {shownMonth ? (
            <ul className="mt-3 flex flex-col gap-1 text-[12.5px]">
              {shownMonth.items.map(i => <li key={i.name + i.date} className="flex justify-between gap-3"><span style={{ color: 'var(--text2)' }}>{i.name} · {fmtDay(i.date)}</span><span className="tabular-nums font-semibold" style={{ color: 'var(--text)' }}>{money(i.amount)}</span></li>)}
            </ul>
          ) : heaviest?.total > 0 && (
            <p className="mt-3 text-[12.5px] leading-snug" style={{ color: 'var(--text3)' }}>
              {even ? `${money(heaviest.total)} falls in ${billMonths.map(m => monOf(m.ym)).join(', ')}.` : `${monOf(heaviest.ym)} is your heaviest month: ${money(heaviest.total)} (${heaviest.items.slice(0, 3).map(i => i.name).join(', ')}).`} Tap a month to see what’s in it.
            </p>
          )}
        </Panel>
      )}

      {found.length > 0 && (
        <Panel title="We found these in your spending" right={<span className="text-[12px]" style={{ color: 'var(--text3)' }}>Are they bills?</span>}>
          <ul className="mt-1.5 grid md:grid-cols-2 gap-x-6">
            {found.map(f => (
              <li key={f.key} className="flex gap-2.5 items-center py-2.5 flex-wrap" style={{ borderTop: '1px solid #F1F5F9' }}>
                <span className="flex-1 min-w-[180px]">
                  <span className="block text-[13px] font-semibold" style={{ color: 'var(--text)' }}>{f.name} · {fmtMoney(f.amount, f.currency)} {everyText(f.every)}</span>
                  <span className="block text-[12px] mt-px" style={{ color: 'var(--text3)' }}>{f.why} Next around {fmtDay(f.next)}.</span>
                </span>
                <span className="flex gap-1.5 wl-hide-viewing">
                  <button onClick={() => addFound(f)} className="wl-btn wl-btn-primary" style={{ height: 30, fontSize: 12 }}>Add</button>
                  <button onClick={() => notABill(f)} className="wl-btn" style={{ height: 30, fontSize: 12 }}>Not a bill</button>
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {mine.length === 0 ? (
        <Panel title="Add your first big bill">
          <p className="mt-1.5 text-[13px] leading-snug" style={{ color: 'var(--text3)' }}>Your LIC and insurance premiums appear here by themselves once they’re on file. Add anything else that comes every few months:</p>
          <div className="flex flex-wrap gap-1.5 mt-3 wl-hide-viewing">
            {TEMPLATES.map(t => <button key={t.name} onClick={() => setForm({ bill: null, draft: blank({ name: t.name, every: t.every, category: t.category, currency: t.currency ?? cur }) })} className="wl-chip" style={{ height: 36 }}>{t.name}</button>)}
          </div>
        </Panel>
      ) : (
        <div className="grid md:grid-cols-2 gap-2.5 md:gap-3.5">
          {mine.map(b => <BillCard key={b.key} b={b} cover={covers[b.key]} busy={busy === b.key} onAside={() => setAsideNow(b)} onOther={() => setAside(b)} onPaid={() => setPaying(b)} onEdit={() => editBill(b)} />)}
        </div>
      )}

      {form && <BillFormSheet draft={form.draft} bill={form.bill} categories={categories} onClose={() => setForm(null)} />}
      {paying && <PaySheet bill={paying} accounts={p.accounts} categories={categories} txns={p.transactions} today={today} onClose={() => setPaying(null)} />}
      {aside && <AsideSheet bill={aside} today={today} onClose={() => setAside(null)} />}
    </div>
  )
}

function BillCard({ b, cover, busy, onAside, onOther, onPaid, onEdit }: { b: Bill; cover: Cover; busy: boolean; onAside: () => void; onOther: () => void; onPaid: () => void; onEdit: () => void }) {
  const money = (n: number) => fmtMoney(n, b.currency)
  const chip = CHIP[cover.state]
  const st = { height: 32, fontSize: 12.5 }
  return (
    <article className="wl-card p-4 md:p-[18px] flex flex-col gap-2.5 md:[&:last-child:nth-child(odd)]:col-span-2">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <h3 className="text-[14.5px] font-bold truncate" style={{ color: 'var(--text)' }}>{b.name}</h3>
          <div className="text-[12px] mt-px" style={{ color: 'var(--text3)' }}>{b.sub} · {everyText(b.every)}</div>
        </div>
        <div className="text-right flex-shrink-0">
          <div className="text-[15px] font-bold tabular-nums" style={{ color: 'var(--text)' }}>{money(b.amount)}</div>
          <div className="text-[12px] mt-px" style={{ color: b.days < 0 ? '#DC2626' : 'var(--text3)' }}>{fmtDay(b.due)} · {dueText(b.days)}</div>
        </div>
      </div>
      <div>
        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--track)' }} role="progressbar" aria-valuenow={Math.round(b.pct)} aria-valuemin={0} aria-valuemax={100} aria-label={`${b.name} set aside`}>
          <div className="h-full rounded-full" style={{ width: `${b.pct}%`, background: 'var(--accent)' }} />
        </div>
        <div className="flex items-center justify-between gap-2 mt-1.5 flex-wrap">
          <span className="text-[12px] tabular-nums" style={{ color: 'var(--text2)' }}>{money(Math.min(b.saved, b.amount))} of {money(b.amount)} set aside</span>
          <span className="text-[11.5px] font-semibold rounded-full px-2.5 py-[3px]" style={{ background: chip.bg, color: chip.c }}>
            {cover.state === 'ready' ? 'Ready' : cover.state === 'covered' ? 'Covered' : `Short by ${money(cover.short)}`}
          </span>
        </div>
      </div>
      <p className="text-[12.5px] leading-snug" style={{ color: 'var(--text3)' }}>{cover.state === 'short' ? cover.tip : b.left > 0 ? whyMonthly(b) : cover.tip}</p>
      {b.rise && (
        <p className="text-[12.5px] leading-snug flex items-center gap-1.5 font-medium" style={{ color: 'var(--amber-text)' }}>
          <TrendingUp size={14} className="flex-shrink-0" /> Up {b.rise.pct}% from {money(b.rise.from)}. Worth a call before you renew.
        </p>
      )}
      <div className="flex gap-1.5 flex-wrap mt-auto pt-1 wl-hide-viewing">
        {b.left > 0 && !b.doneThisMonth && <button onClick={onAside} disabled={busy} className="wl-btn wl-btn-primary disabled:opacity-60" style={st}>Set aside {money(b.monthly)}</button>}
        {b.doneThisMonth && b.left > 0 && <span className="text-[12px] self-center mr-1" style={{ color: 'var(--pos-text)' }}>Done this month ✓</span>}
        <button onClick={onOther} disabled={busy} className="wl-btn" style={st}>Other amount</button>
        <button onClick={onPaid} disabled={busy} className="wl-btn" style={st}>Paid</button>
        <button onClick={onEdit} disabled={busy} className="wl-btn" style={st}>Change</button>
      </div>
    </article>
  )
}
