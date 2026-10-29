'use client'
import { useEffect, useMemo, useState } from 'react'
import { ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from 'recharts'
import {
  Download, Printer, ChevronLeft, ChevronRight, ArrowDownLeft, Wallet, Landmark, TrendingUp, Globe,
  AlertTriangle, CheckCircle2, Info, ChevronDown, ChevronUp,
} from 'lucide-react'
import { useViewStore } from '@/store/viewStore'
import { useCategoryStore } from '@/store/categoryStore'
import { colorOf as catColorOf } from '@/lib/categories'
import { CategoryIcon } from '@/components/ui/CategoryIcon'
import { SPEND_GROUPS, spendGroup, catOf, labelOf, CC_BILL, isIncome, isRemitOut, prepareMoney, type SpendGroup, type View, cashOut, cashLeft } from '@/lib/money'
import { addMonths, daysInMonth, localToday } from '@/lib/insights'
import { fmtMoney, fmtCompact } from '@/lib/format'
import { PageHeader, InsightBar, AiActions, KpiTile, Segmented, EmptyState, type Tone } from '@/components/ui/kit'
import { isSpending } from '@/lib/money'
import PaidBy from './PaidBy'

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MONTH = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const mShort = (ym: string) => MON[Number(ym.slice(5, 7)) - 1]
const mLong = (ym: string) => `${MONTH[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`
const GROUP = Object.fromEntries(SPEND_GROUPS.map(g => [g.key, g])) as Record<SpendGroup, (typeof SPEND_GROUPS)[number]>
const SENT_COLOR: Record<string, string> = { 'International Transfer': '#3B8EF0', Transfer: '#0EA5E9' }

// One month's (or a merged period's) money in and out
type Agg = {
  income: number; living: number; sent: number; loans: number; invest: number; cc: number; home: number   // home = sent to India (a move)
  cats: Record<string, number>; loanBy: Record<string, number>; investBy: Record<string, number>; incomeBy: Record<string, number>
  moves: Record<string, number>     // money moving out that isn't spending: card bills, sent to India, NRE → NRO, ATM cash…
  movesIn: Record<string, number>   // money coming in that isn't income: loan cash, your own transfers, money from UAE
  events: Record<string, number>    // spending tagged to a trip or event (part of spending, by event id)
}
const emptyAgg = (): Agg => ({ income: 0, living: 0, sent: 0, loans: 0, invest: 0, cc: 0, home: 0, cats: {}, loanBy: {}, investBy: {}, incomeBy: {}, moves: {}, movesIn: {}, events: {} })
const addTo = (o: Record<string, number>, k: string, v: number) => { o[k] = (o[k] ?? 0) + v }
function merge(list: Agg[]): Agg {
  const a = emptyAgg()
  for (const m of list) {
    a.income += m.income; a.living += m.living; a.sent += m.sent; a.loans += m.loans; a.invest += m.invest; a.cc += m.cc; a.home += m.home
    for (const k of ['cats', 'loanBy', 'investBy', 'incomeBy', 'moves', 'movesIn', 'events'] as const) for (const [c, v] of Object.entries(m[k])) addTo(a[k], c, v)
  }
  return a
}
const spendingOf = (a: Agg) => a.living + a.sent
const outOf = (a: Agg) => a.living + a.sent + a.loans + a.invest
// Saved = income − spending − EMIs (money invested counts as saved). Same
// rule as Home: savings rate = saved ÷ income.
const keptOf = (a: Agg) => a.income - a.living - a.sent - a.loans
const pctChange = (a: number, b: number) => b > 0 ? Math.round((a - b) / b * 1000) / 10 : null

// What a move is called in "Money in & out" (and why it isn't spending or income)
const MOVE_OUT: Record<string, string> = { 'NRE to NRO': 'NRE → NRO', 'ATM Withdrawal': 'ATM cash', 'Self Transfer': 'To your other accounts', 'Loan on Card': 'Card loan EMIs', 'International Transfer': 'Sent to India' }
export const MOVE_WHY: Record<string, string> = {
  'Card bills paid': 'pays for card purchases already in Spending',
  'Sent to India': 'lands in NRE — India income in the India view',
  'NRE → NRO': 'between your India accounts',
  'ATM cash': 'what you buy with it is logged as cash spending',
  'To your other accounts': 'between your own accounts',
  'Card loan EMIs': 'billed to the card; the money was counted when it was spent',
}
const moveInOf = (t: any) => {
  const c = catOf(t)
  return /^Loan (Taken|Received|Disbursement)$/.test(c) ? 'Loan money received' : c === 'Self Transfer' ? 'From your other accounts'
    : ['NRE Received', 'Received from UAE', 'Inward Remittance', 'NRI Transfer'].includes(c) ? 'Received from UAE' : 'Other money in (not income)'
}
type Pay = { month: string; t: any; v: number; g: SpendGroup }
// Totals per month for the transactions in view (amounts in display currency)
function aggregate(txns: any[], inView: (c: string) => boolean, conv: (n: number, c: string) => number, view: View) {
  const map = new Map<string, Agg>()
  const pays: Pay[] = []
  for (const t of txns) {
    const m = t.txn_date?.slice(0, 7)
    if (!m || !inView(t.currency)) continue
    const v = conv(Number(t.amount) || 0, t.currency)
    if (!(v > 0)) continue
    let a = map.get(m); if (!a) { a = emptyAgg(); map.set(m, a) }
    if (isIncome(t, view)) { a.income += v; addTo(a.incomeBy, t.category || 'Other', v); continue }
    if (t.txn_type === 'income') { addTo(a.movesIn, moveInOf(t), v); continue }   // money from yourself / borrowing
    if (isRemitOut(t)) { a.home += v; addTo(a.moves, 'Sent to India', v); continue }   // UAE → India: a move, not spending
    if (catOf(t) === CC_BILL) { a.cc += v; addTo(a.moves, 'Card bills paid', v); continue }
    const g = spendGroup(t)
    if (!g) { if (catOf(t) !== 'Converted to EMI') addTo(a.moves, MOVE_OUT[catOf(t)] ?? labelOf(catOf(t)), v); continue }
    a[g] += v
    if (t.event_id && (g === 'living' || g === 'sent')) addTo(a.events, t.event_id, v)
    if (g === 'loans') addTo(a.loanBy, t.merchant || labelOf(catOf(t)), v)
    else if (g === 'invest') addTo(a.investBy, t.merchant || 'Investment', v)
    else { addTo(a.cats, catOf(t), v); pays.push({ month: m, t, v, g }) }
  }
  return { map, pays }
}

// Reports (design v2): a month or a year at a glance — money in, where it
// went (living costs, money sent, loan repayments, investments), which months
// and categories took the most, plus plain-language highlights and notes.
export default function ReportClient({ transactions: raw, accounts = [], events = [] }: { transactions: any[]; accounts?: any[]; events?: { id: string; name: string; kind: string }[] }) {
  const cardIds = useMemo(() => accounts.filter((a: any) => a.account_type === 'credit_card').map((a: any) => a.id), [accounts])
  const { view, toMonth, fxRate: FX, setDateRange } = useViewStore()
  const { rows: categories, load: loadCategories } = useCategoryStore()
  const [today, setToday] = useState('')
  const [mode, setMode] = useState<'month' | 'year'>('month')
  const [showAllCats, setShowAllCats] = useState(false)
  useEffect(() => { setToday(localToday()); loadCategories() }, [loadCategories])

  // Remittances paired (India income) and card bills checked — lib/money
  const cardSet = useMemo(() => new Set(cardIds), [cardIds])
  const transactions = useMemo(() => prepareMoney(raw, { fx: FX, cardIds: cardSet }), [raw, FX, cardSet])
  const cur = view === 'uae' ? 'AED' : 'INR'
  const money = (n: number) => fmtMoney(n, cur)
  const short = (n: number) => fmtCompact(n, cur)
  const axis = (n: number) => fmtCompact(n, cur).replace('AED ', '')
  const viewLabel = view === 'uae' ? 'UAE · AED' : view === 'india' ? 'India · INR' : 'Consolidated · INR'
  const inView = (c: string) => view === 'consolidated' || (view === 'uae' ? c === 'AED' : c !== 'AED')
  const conv = (n: number, c: string) => view === 'consolidated' && c === 'AED' ? n * FX : n

  const thisMonth = (today || new Date().toISOString()).slice(0, 7)
  const month = toMonth > thisMonth ? thisMonth : toMonth
  const [year, setYear] = useState(Number(month.slice(0, 4)))
  useEffect(() => { setYear(Number(month.slice(0, 4))) }, [month])
  const thisYear = Number(thisMonth.slice(0, 4))

  const colorFor = (c: string) => SENT_COLOR[c] ?? catColorOf(categories, c)
  const iconFor = (c: string) => categories.find(r => r.name === c)?.icon ?? (SENT_COLOR[c] ? 'hand-coins' : 'tag')

  // ── Per-month totals, computed once ──────────────────────────────────────
  const { byMonth, firstYear, payments } = useMemo(() => {
    const { map, pays } = aggregate(transactions, inView, conv, view)
    const first = Math.min(thisYear, ...Array.from(map.keys()).map(m => Number(m.slice(0, 4))))
    return { byMonth: map, firstYear: first, payments: pays }
  }, [transactions, view, FX, thisYear])
  const aggOf = (ms: string[]) => merge(ms.map(m => byMonth.get(m) ?? emptyAgg()))
  // The current month is still running: compare it with the same days of the
  // other month, not the whole of it
  const dayCut = today ? Number(today.slice(8, 10)) : 31
  const upToDay = (m: string) => aggregate(transactions.filter(t => t.txn_date?.slice(0, 7) === m && Number(t.txn_date.slice(8, 10)) <= dayCut), inView, conv, view).map.get(m) ?? emptyAgg()

  // ── The period on screen and what it's compared with ─────────────────────
  const yearMonths = (y: number) => Array.from({ length: 12 }, (_, i) => `${y}-${String(i + 1).padStart(2, '0')}`)
  const months = mode === 'month' ? [month] : yearMonths(year).filter(m => m <= thisMonth)
  const cmpMonths = mode === 'month' ? [addMonths(month, -1)] : months.map(m => `${Number(m.slice(0, 4)) - 1}${m.slice(4)}`)
  const partialYear = mode === 'year' && year === thisYear
  const periodLabel = mode === 'month' ? `${mLong(month)}${month === thisMonth ? ' so far' : ''}` : `${year}${partialYear ? ' so far' : ''}`
  const running = months.includes(thisMonth)
  const cmpLabel = mode === 'month'
    ? `${mShort(addMonths(month, -1))}${running ? ` 1–${dayCut}` : ''}`
    : partialYear ? `the same period of ${year - 1}` : String(year - 1)
  const P = useMemo(() => aggOf(months), [byMonth, months.join()])
  const C = useMemo(() => merge(cmpMonths.map((m, i) => months[i] === thisMonth ? upToDay(m) : byMonth.get(m) ?? emptyAgg())),
    [byMonth, cmpMonths.join(), months.join(), thisMonth, dayCut, transactions, view, FX])
  const spending = spendingOf(P), out = outOf(P), kept = keptOf(P)
  const rate = P.income > 0 ? Math.round(kept / P.income * 100) : null
  const sentHome = view === 'uae' ? P.home : 0                  // shown only in the UAE view
  const econLeft = P.income - out - sentHome                     // income less every outgoing (the split bar)
  // What's left in your bank & cash: card bills paid come off, not the card
  // charges they pay for (lib/money cashOut)
  const flow = useMemo(() => cashOut(transactions.filter(t => months.includes(String(t.txn_date).slice(0, 7)) && inView(t.currency)),
    { view, isCard: t => cardSet.has(t.account_id), amount: t => conv(Number(t.amount) || 0, t.currency) }), [transactions, months.join(), view, FX, cardSet])
  const leftOver = cashLeft(P.income, flow)

  // ── Chart: 12 months ending at the month (monthly) or the calendar year ──
  const chartMonths = mode === 'month' ? Array.from({ length: 12 }, (_, i) => addMonths(month, i - 11)) : yearMonths(year)
  const chart = chartMonths.map(m => {
    const a = byMonth.get(m) ?? emptyAgg(), future = m > thisMonth
    return { m, label: mShort(m), living: future ? null : a.living, sent: future ? null : a.sent, loans: future ? null : a.loans,
      invest: future ? null : a.invest, income: future ? null : a.income, out: outOf(a), spend: spendingOf(a) }
  })
  const past = chart.filter(r => r.m <= thisMonth && r.out > 0)
  const done = past.filter(r => r.m !== thisMonth)          // finished months
  const peak = past.length ? past.reduce((a, b) => (b.spend > a.spend ? b : a)) : null
  const low = done.length > 1 ? done.reduce((a, b) => (b.spend < a.spend ? b : a)) : null
  const avgSpend = done.length ? done.reduce((s, r) => s + r.spend, 0) / done.length : 0

  // ── Categories (living costs + money sent) ───────────────────────────────
  const catRows = Object.entries(P.cats).sort((a, b) => b[1] - a[1]).map(([c, v]) => ({
    c, v, share: spending > 0 ? v / spending * 100 : 0, chg: pctChange(v, C.cats[c] ?? 0), was: C.cats[c] ?? 0,
  }))
  const shownCats = showAllCats ? catRows : catRows.slice(0, 8)
  const periodPays = payments.filter(p => months.includes(p.month)).sort((a, b) => b.v - a.v)
  // Card purchases in the period (they're in Spending; the card bills paid for them are a move)
  const cardBuys = periodPays.filter(p => cardSet.has(p.t.account_id)).reduce((s, p) => s + p.v, 0)
  const eventRows = Object.entries(P.events).map(([id, v]) => ({ id, v, ev: events.find(e => e.id === id) })).sort((a, b) => b.v - a.v)
  const eventTotal = eventRows.reduce((s, r) => s + r.v, 0)
  const moveRows = Object.entries(P.moves).filter(([k]) => !(view !== 'uae' && k === 'Sent to India' && P.home === 0)).sort((a, b) => b[1] - a[1])
  const inRows = Object.entries(P.movesIn).sort((a, b) => b[1] - a[1])
  const unsorted = P.cats['Transfer'] ?? 0
  const topPays = periodPays.slice(0, 6)

  // ── Highlights: plain-language bullet notes ──────────────────────────────
  type Note = { tone: 'good' | 'warn' | 'info'; text: string }
  const notes: Note[] = []
  if (P.income > 0) notes.push(kept >= 0
    ? { tone: (rate ?? 0) >= 20 ? 'good' : 'warn', text: `You saved ${short(kept)} of the ${short(P.income)} that came in — a ${rate}% savings rate${(rate ?? 0) >= 20 ? ', above the 20% target' : ', below the 20% target'}${P.invest > 0 ? ` (${short(P.invest)} of it invested)` : ''}.` }
    : { tone: 'warn', text: `Spending and EMIs were ${short(-kept)} more than came in during ${periodLabel}.` })
  if (view === 'uae' && P.home > 0) notes.push({ tone: 'info', text: `${short(P.home)} was sent to India. It isn't spending — it's your money moving to NRE, and it shows as India income in the India view.` })
  if (view === 'consolidated' && P.home > 0) notes.push({ tone: 'info', text: `Money sent from UAE to India (${short(P.home)}) isn't counted again here — your UAE salary is already the income.` })
  if (P.cats['Card spending (not itemised)']) notes.push({ tone: 'warn', text: `${short(P.cats['Card spending (not itemised)'])} of card bills counted as spending because that month's card purchases weren't imported. Import the card statement to see where it went.` })
  if (catRows[0]) notes.push({ tone: 'info', text: `${labelOf(catRows[0].c)} was the biggest category at ${short(catRows[0].v)} (${Math.round(catRows[0].share)}% of spending)${catRows.length >= 3 ? `; with ${labelOf(catRows[1].c)} and ${labelOf(catRows[2].c)}, the top three made up ${Math.round(catRows[0].share + catRows[1].share + catRows[2].share)}%` : ''}.` })
  const mover = catRows.filter(r => r.was > 0 && Math.abs(r.v - r.was) >= Math.max(spending * 0.02, 1)).sort((a, b) => Math.abs(b.v - b.was) - Math.abs(a.v - a.was))[0]
  if (mover) notes.push({ tone: mover.v > mover.was ? 'warn' : 'good', text: `${labelOf(mover.c)} ${mover.v > mover.was ? 'rose' : 'fell'} ${Math.abs(mover.chg ?? 0)}% vs ${cmpLabel} (${mover.v > mover.was ? '+' : '−'}${short(Math.abs(mover.v - mover.was))}).` })
  if (mode === 'month' && peak && done.length >= 3) {
    const name = MONTH[Number(month.slice(5)) - 1]
    if (peak.m === month) notes.push({ tone: 'warn', text: `${name} ${running ? 'is already' : 'was'} your highest-spending month of the last ${past.length}.` })
    else if (!running && low?.m === month) notes.push({ tone: 'good', text: `${name} was your lowest-spending month of the last ${past.length}.` })
    else notes.push({ tone: 'info', text: `${running ? `With ${daysInMonth(month) - dayCut} days to go, spending so far is` : 'Spending was'} ${spending > avgSpend ? 'above' : 'below'} your monthly average of ${short(avgSpend)} (${spending > avgSpend ? '+' : '−'}${short(Math.abs(spending - avgSpend))}).` })
  }
  if (mode === 'year' && peak) notes.push({ tone: 'info', text: `Highest spending was in ${MONTH[Number(peak.m.slice(5)) - 1]} (${short(peak.spend)})${low ? `, lowest in ${MONTH[Number(low.m.slice(5)) - 1]} (${short(low.spend)})` : ''}. On average you spent ${short(avgSpend)} a month.` })
  if (mode === 'year') {
    const over = past.filter(r => (r.income ?? 0) > 0 && r.out > (r.income ?? 0))
    if (over.length) notes.push({ tone: 'warn', text: `In ${over.length} month${over.length === 1 ? '' : 's'} (${over.map(r => r.label).join(', ')}), more went out (spending, loans and investing) than came in.` })
  }
  if (P.loans > 0) notes.push({ tone: P.income > 0 && P.loans / P.income > 0.4 ? 'warn' : 'info', text: `Loan repayments took ${short(P.loans)}${P.income > 0 ? ` — ${Math.round(P.loans / P.income * 100)}% of income${P.loans / P.income > 0.4 ? ', above the 40% comfort level' : ''}` : ''}.` })
  if (P.invest > 0) notes.push({ tone: P.income > 0 && P.invest / P.income >= 0.15 ? 'good' : 'info', text: `You invested ${short(P.invest)}${P.income > 0 ? ` (${Math.round(P.invest / P.income * 100)}% of income${P.invest / P.income < 0.15 ? '; 15–20% builds wealth faster' : ''})` : ''}.` })
  else if (P.income > 0) notes.push({ tone: 'info', text: `Nothing was invested in ${periodLabel}. Even a small SIP each month adds up.` })
  if (P.sent > 0) notes.push({ tone: 'info', text: `${short(P.sent)} went to family or home (${Math.round(P.sent / Math.max(spending, 1) * 100)}% of spending).` })
  if (topPays[0]) notes.push({ tone: 'info', text: `Largest payment: ${topPays[0].t.merchant || labelOf(catOf(topPays[0].t))}, ${short(topPays[0].v)} on ${Number(topPays[0].t.txn_date.slice(8, 10))} ${mShort(topPays[0].month)}.` })
  if (P.cc > 0) notes.push({ tone: 'info', text: `${short(P.cc)} of card bills were paid. They aren't counted again — what you bought on the cards is already in its categories.` })

  const summary = out === 0 && P.income === 0
    ? `Nothing recorded for ${periodLabel} yet.`
    : `${periodLabel}: ${short(P.income)} came in; ${short(spending)} was spent, ${short(P.loans)} went on EMIs and ${short(P.invest)} into investments${sentHome > 0 ? `, and ${short(sentHome)} was sent to India` : ''}${P.income > 0 ? ` — you saved ${short(kept)} (${rate}%)` : ''}.`
  const aiContext = `${summary} Top categories: ${catRows.slice(0, 6).map(r => `${labelOf(r.c)} ${short(r.v)}`).join(', ') || 'none'}. Compared with ${cmpLabel}: spending ${short(spendingOf(C))}, loans ${short(C.loans)}, invested ${short(C.invest)}.`

  const step = (d: number) => {
    if (mode === 'month') { const m = addMonths(month, d); setDateRange(m, m) }
    else setYear(y => y + d)
  }
  const canNext = mode === 'month' ? month < thisMonth : year < thisYear
  const canPrev = mode === 'month' ? Number(month.slice(0, 4)) >= firstYear && month > `${firstYear}-01` : year > firstYear
  const openMonth = (m: string) => { if (m > thisMonth) return; setDateRange(m, m); setMode('month') }

  function exportCsv() {
    const rows = transactions.filter(t => months.includes(t.txn_date?.slice(0, 7)) && inView(t.currency))
      .map(t => {
        const g = isIncome(t, view) ? 'Income' : isRemitOut(t) ? 'Sent to India (move)' : catOf(t) === CC_BILL ? 'Card bill (move)' : spendGroup(t) ? GROUP[spendGroup(t)!].label : 'Move between your accounts'
        return [t.txn_date, `"${String(t.merchant ?? '').replace(/"/g, '""')}"`, `"${labelOf(catOf(t))}"`, g, t.amount, t.currency]
      })
    const csv = ['Date,Merchant,Category,Counted as,Amount,Currency', ...rows.map(r => r.join(','))].join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    a.download = `wealthlens-report-${mode === 'month' ? month : year}.csv`
    a.click()
  }

  const delta = (now: number, was: number, upIsGood = false): { text: string; tone: Tone } => {
    const p = pctChange(now, was)
    if (p == null) return { text: `vs ${short(was)} in ${cmpLabel}`, tone: 'neutral' }
    return { text: `${p > 0 ? '▲' : p < 0 ? '▼' : ''} ${Math.abs(p)}% vs ${cmpLabel}`, tone: p === 0 ? 'neutral' : (p > 0) === upIsGood ? 'good' : 'bad' }
  }
  const dIn = delta(P.income, C.income, true), dSp = delta(spending, spendingOf(C)), dLo = delta(P.loans, C.loans), dIv = delta(P.invest, C.invest, true)

  const controls = (
    <div className="flex items-center gap-2 flex-wrap">
      <Segmented label="Report period" value={mode} onChange={v => { setMode(v); setShowAllCats(false) }}
        options={[{ value: 'month', label: 'Monthly' }, { value: 'year', label: 'Yearly' }]} />
      <div className="inline-flex items-center rounded-xl bg-white" style={{ border: '1px solid var(--line)', height: 38 }}>
        <button onClick={() => step(-1)} disabled={!canPrev} aria-label="Previous" className="w-9 h-full flex items-center justify-center disabled:opacity-30" style={{ color: 'var(--text2)' }}><ChevronLeft size={16} /></button>
        <span className="px-1 min-w-[112px] text-center text-[13px] font-semibold tabular-nums" style={{ color: 'var(--text)' }}>{mode === 'month' ? mLong(month) : year}</span>
        <button onClick={() => step(1)} disabled={!canNext} aria-label="Next" className="w-9 h-full flex items-center justify-center disabled:opacity-30" style={{ color: 'var(--text2)' }}><ChevronRight size={16} /></button>
      </div>
    </div>
  )

  if (byMonth.size === 0) return (
    <div className="flex flex-col gap-3.5 md:gap-[18px] animate-fade-up">
      <PageHeader title="Money report" sub={viewLabel} />
      <EmptyState message="Reports fill in once you have transactions. Import a bank or card statement, or add a few expenses and your income." />
    </div>
  )

  const TipBox = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null
    const r = payload[0].payload
    return (
      <div className="rounded-xl px-3 py-2.5 text-[12px] bg-white shadow-lg min-w-[180px]" style={{ border: '1px solid var(--line)' }}>
        <div className="font-semibold mb-1" style={{ color: 'var(--text)' }}>{mLong(r.m)}</div>
        {SPEND_GROUPS.map(g => (r[g.key] ?? 0) > 0 && (
          <div key={g.key} className="flex items-center gap-2"><i className="w-2 h-2 rounded-sm" style={{ background: g.color }} />
            <span style={{ color: 'var(--text2)' }}>{g.label}</span><span className="ml-auto pl-3 tabular-nums font-medium">{short(r[g.key])}</span></div>
        ))}
        <div className="flex items-center gap-2 mt-1 pt-1" style={{ borderTop: '1px solid var(--track)' }}>
          <span style={{ color: 'var(--text3)' }}>Came in</span><span className="ml-auto tabular-nums font-semibold" style={{ color: '#16A34A' }}>{short(r.income ?? 0)}</span></div>
        <div className="text-[11px] mt-1" style={{ color: 'var(--accent)' }}>{r.m <= thisMonth ? 'Tap to open this month' : ''}</div>
      </div>
    )
  }

  const splitTotal = Math.max(P.income, out + sentHome)
  const split = [...SPEND_GROUPS.map(g => ({ key: g.key, label: g.label, color: g.color, v: P[g.key] })),
    ...(sentHome > 0 ? [{ key: 'home', label: 'Sent to India', color: '#0EA5E9', v: sentHome }] : []),
    { key: 'kept', label: 'Left over', color: '#CBD5E1', v: Math.max(econLeft, 0) }].filter(s => s.v > 0)

  return (
    <div className="flex flex-col gap-3.5 md:gap-[18px] animate-fade-up">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
        <PageHeader title="Money report" sub={`${viewLabel} · ${mode === 'month' ? 'one month at a glance' : 'the year month by month'}`} />
        <div className="flex items-center gap-2 flex-wrap">
          {controls}
          <button onClick={exportCsv} className="wl-btn no-print max-md:hidden" style={{ height: 38 }}><Download size={14} />CSV</button>
          <button onClick={() => window.print()} className="wl-btn no-print max-md:hidden" style={{ height: 38 }}><Printer size={14} />Print</button>
        </div>
      </div>

      <InsightBar text={summary} prompt={`Explain this money report in plain language. ${aiContext}`} />
      <AiActions actions={mode === 'month' ? ['Summarise my month', 'Where can I save?'] : ['Summarise my year', 'How do I save more next year?']} context={aiContext} />

      {/* Months chart (same card on both sizes) + where the income went */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-3.5 md:gap-4">
        <section className="wl-card px-4 md:px-5 py-4 md:py-[18px] flex flex-col">
          <div className="flex justify-between items-start gap-3">
            <div className="min-w-0">
              <div className="text-[10.5px] md:text-[11px] font-semibold uppercase tracking-[0.05em]" style={{ color: 'var(--text3)' }}>Money out · {periodLabel}</div>
              <div className="text-[30px] md:text-[32px] font-bold tabular-nums tracking-[-0.02em] leading-tight mt-0.5" style={{ color: 'var(--text)' }}>{money(out)}</div>
              <div className="text-[12px] md:text-[12.5px] font-medium" style={{ color: 'var(--text3)' }}>
                {short(spending)} spending · {short(P.loans)} loans · {short(P.invest)} invested
              </div>
            </div>
            <div className="hidden md:flex flex-wrap justify-end gap-x-3 gap-y-1 text-[11.5px] max-w-[260px]" style={{ color: 'var(--text3)' }}>
              {SPEND_GROUPS.map(g => <span key={g.key} className="flex items-center gap-1.5"><i className="w-[9px] h-[9px] rounded-sm" style={{ background: g.color }} />{g.short}</span>)}
              <span className="flex items-center gap-1.5"><i className="w-4 border-t-2 border-dashed" style={{ borderColor: '#16A34A' }} />Came in</span>
            </div>
          </div>
          <div className="h-[190px] md:h-auto md:flex-1 md:min-h-[230px] mt-3 -mx-1">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chart} margin={{ top: 6, right: 4, left: 0, bottom: 0 }} barCategoryGap="24%"
                onClick={(s: any) => { const r = chart[Number(s?.activeTooltipIndex)]; if (r) openMonth(r.m) }}>
                <CartesianGrid stroke="var(--track)" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 10.5, fill: '#94A3B8' }} axisLine={false} tickLine={false} interval={0} />
                <YAxis tickFormatter={axis} tick={{ fontSize: 10, fill: '#94A3B8' }} width={44} axisLine={false} tickLine={false} tickCount={4} />
                <Tooltip content={<TipBox />} cursor={{ fill: 'rgba(106,85,232,0.07)' }} />
                {SPEND_GROUPS.map(g => (
                  <Bar key={g.key} dataKey={g.key} stackId="out" fill={g.color} stroke="#fff" strokeWidth={1} isAnimationActive={false} style={{ cursor: 'pointer' }}>
                    {chart.map(r => <Cell key={r.m} fillOpacity={mode === 'month' && r.m !== month ? 0.35 : 1} />)}
                  </Bar>
                ))}
                <Line dataKey="income" stroke="#16A34A" strokeWidth={2} strokeDasharray="5 4" dot={{ r: 2.5, fill: '#16A34A', strokeWidth: 0 }} isAnimationActive={false} connectNulls={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <div className="md:hidden flex flex-wrap gap-x-3 gap-y-1 text-[11px] mt-2" style={{ color: 'var(--text3)' }}>
            {SPEND_GROUPS.map(g => <span key={g.key} className="flex items-center gap-1.5"><i className="w-2 h-2 rounded-sm" style={{ background: g.color }} />{g.short}</span>)}
            <span className="flex items-center gap-1.5"><i className="w-3.5 border-t-2 border-dashed" style={{ borderColor: '#16A34A' }} />Came in</span>
          </div>
          <div className="text-[11.5px] mt-2" style={{ color: 'var(--text4)' }}>
            {mode === 'month' ? 'The last 12 months. Tap a month to open it.' : 'Tap a month to open it.'}
            {peak ? ` Highest spending: ${MONTH[Number(peak.m.slice(5)) - 1]} ${peak.m.slice(0, 4)} (${short(peak.spend)}).` : ''}
          </div>
        </section>

        <section className="wl-card px-4 md:px-5 py-4 md:py-[18px] flex flex-col gap-3">
          <div>
            <h2 className="text-[14px] md:text-[15px] font-semibold" style={{ color: 'var(--text)' }}>Where your income went</h2>
            <div className="text-[12px] mt-0.5" style={{ color: 'var(--text3)' }}>{P.income > 0 ? `${money(P.income)} came in during ${periodLabel}` : `No income recorded for ${periodLabel}`}</div>
          </div>
          {splitTotal > 0 && (
            <div className="flex h-3.5 rounded-full overflow-hidden gap-[2px]" role="img" aria-label={split.map(s => `${s.label} ${short(s.v)}`).join(', ')}>
              {split.map(s => <div key={s.key} style={{ width: `${s.v / splitTotal * 100}%`, background: s.color }} title={`${s.label}: ${short(s.v)}`} />)}
            </div>
          )}
          <div className="flex flex-col">
            {[...SPEND_GROUPS.map(g => ({ key: g.key as string, label: g.label, color: g.color, v: P[g.key], icon: g.key === 'living' ? Wallet : g.key === 'sent' ? ArrowDownLeft : g.key === 'loans' ? Landmark : TrendingUp })),
              ...(sentHome > 0 ? [{ key: 'home', label: 'Sent to India (a move)', color: '#0EA5E9', v: sentHome, icon: Globe }] : [])].map((s, i) => (
              <div key={s.key} className="flex items-center gap-2.5 py-2" style={{ borderTop: i ? '1px solid var(--track)' : 'none' }}>
                <span className="w-7 h-7 rounded-[9px] flex items-center justify-center flex-shrink-0" style={{ background: s.color + '1A', color: s.color }}><s.icon size={14} /></span>
                <span className="flex-1 text-[13px]" style={{ color: 'var(--text2)' }}>{s.label}</span>
                <span className="text-[13px] font-semibold tabular-nums" style={{ color: 'var(--text)' }}>{short(s.v)}</span>
                <span className="w-11 text-right text-[11.5px] tabular-nums" style={{ color: 'var(--text4)' }}>{P.income > 0 ? `${Math.round(s.v / P.income * 100)}%` : ''}</span>
              </div>
            ))}
          </div>
          <div className="rounded-xl px-3.5 py-2.5 flex items-center justify-between gap-2 mt-auto" style={{ background: kept >= 0 ? '#E7F7EF' : '#FDECE8' }}>
            <div>
              <div className="text-[12.5px] font-semibold" style={{ color: kept >= 0 ? '#1E8F5F' : '#D9482F' }}>{kept >= 0 ? `Saved${P.invest > 0 ? ` (incl. ${short(P.invest)} invested)` : ''}` : 'Spent more than came in'}</div>
              {rate != null && <div className="text-[11.5px]" style={{ color: kept >= 0 ? '#1E8F5F' : '#D9482F' }}>Savings rate {rate}% · target 20%{kept >= 0 ? ` · ${short(Math.max(leftOver, 0))} left in the bank` : ''}</div>}
            </div>
            <span className="text-[18px] font-bold tabular-nums" style={{ color: kept >= 0 ? '#1E8F5F' : '#D9482F' }}>{short(Math.abs(kept))}</span>
          </div>
        </section>
      </div>

      {/* Four tiles, same on both sizes */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 md:gap-3.5">
        <KpiTile label="Came in" value={short(P.income)} delta={dIn.text} tone={dIn.tone} tint={1} icon={ArrowDownLeft} />
        <KpiTile label="Spending" value={short(spending)} delta={dSp.text} tone={dSp.tone} tint={0} icon={Wallet} href="/dashboard/expenses" />
        <KpiTile label="Loan repayments" value={short(P.loans)} delta={dLo.text} tone={dLo.tone} tint={2} icon={Landmark} href="/dashboard/loans" />
        <KpiTile label="Invested" value={short(P.invest)} delta={dIv.text} tone={dIv.tone} tint={3} icon={TrendingUp} href="/dashboard/investments" />
      </div>

      {/* Money in & out: every dirham and rupee — spending, and the moves that aren't spending */}
      <section className="wl-card px-4 md:px-5 py-4 md:py-[18px]" aria-label="Money in and out">
        <div className="flex items-baseline justify-between gap-2 flex-wrap">
          <h2 className="text-[14px] md:text-[15px] font-semibold" style={{ color: 'var(--text)' }}>Money in &amp; out</h2>
          <span className="text-[11.5px]" style={{ color: 'var(--text4)' }}>{periodLabel} · every transaction, counted once</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4 mt-3">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.05em] mb-1" style={{ color: 'var(--text3)' }}>Came in</div>
            {[['Income', P.income, true] as const, ...Object.entries(P.incomeBy).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, v]) => [labelOf(k), v, false] as const)].map(([k, v, main], i) => (
              <div key={`${k}-${i}`} className={`flex justify-between gap-3 py-1.5 text-[13px] ${main ? '' : 'pl-3'}`} style={{ borderTop: i ? '1px solid var(--track)' : 'none' }}>
                <span style={{ color: main ? 'var(--text)' : 'var(--text3)', fontWeight: main ? 600 : 400 }}>{k}</span><span className="tabular-nums" style={{ fontWeight: main ? 700 : 400, color: main ? 'var(--text)' : 'var(--text2)' }}>{short(v)}</span>
              </div>
            ))}
            {inRows.length > 0 && <>
              <div className="text-[11px] font-semibold uppercase tracking-[0.05em] mt-3 mb-1" style={{ color: 'var(--text4)' }}>Not income</div>
              {inRows.map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3 py-1.5 text-[12.5px]" style={{ borderTop: '1px solid var(--track)' }}>
                  <span style={{ color: 'var(--text3)' }}>{k}</span><span className="tabular-nums" style={{ color: 'var(--text3)' }}>{short(v)}</span>
                </div>
              ))}
            </>}
          </div>
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.05em] mb-1" style={{ color: 'var(--text3)' }}>Went out</div>
            {([
              ['Living costs', P.living, eventTotal > 0 ? `incl. ${short(eventTotal)} on trips & events` : 'by category below'],
              ['Family & others', P.sent, unsorted > 0 ? `incl. ${short(unsorted)} transfers to sort` : 'family support'],
              ['Loan EMIs', P.loans, ''], ['Invested', P.invest, 'counts as saving'],
            ] as const).filter(([, v]) => v > 0).map(([k, v, sub], i) => (
              <div key={k} className="flex justify-between gap-3 py-1.5" style={{ borderTop: i ? '1px solid var(--track)' : 'none' }}>
                <span className="min-w-0"><span className="block text-[13px] font-semibold" style={{ color: 'var(--text)' }}>{k}</span>{sub && <span className="block text-[11.5px]" style={{ color: 'var(--text4)' }}>{sub}</span>}</span>
                <span className="text-[13px] font-semibold tabular-nums" style={{ color: 'var(--text)' }}>{short(v)}</span>
              </div>
            ))}
            {moveRows.length > 0 && <>
              <div className="text-[11px] font-semibold uppercase tracking-[0.05em] mt-3 mb-1" style={{ color: 'var(--text4)' }}>Moves — not spending</div>
              {moveRows.map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3 py-1.5" style={{ borderTop: '1px solid var(--track)' }}>
                  <span className="min-w-0"><span className="block text-[12.5px]" style={{ color: 'var(--text2)' }}>{k}</span>
                    <span className="block text-[11px]" style={{ color: 'var(--text4)' }}>{k === 'Card bills paid' && cardBuys > 0 ? `card purchases this period: ${short(cardBuys)}, in Spending` : MOVE_WHY[k] ?? 'between your accounts'}</span></span>
                  <span className="text-[12.5px] tabular-nums" style={{ color: 'var(--text3)' }}>{short(v)}</span>
                </div>
              ))}
            </>}
          </div>
        </div>
        {eventRows.length > 0 && (
          <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--track)' }}>
            <div className="text-[11px] font-semibold uppercase tracking-[0.05em] mb-1.5" style={{ color: 'var(--text3)' }}>Trips & events in this period · part of Spending</div>
            <div className="flex flex-wrap gap-1.5">
              {eventRows.map(r => <a key={r.id} href={`/dashboard/events/${r.id}`} className="wl-chip" style={{ height: 30 }}>{r.ev?.name ?? 'A trip or event'} · {short(r.v)}</a>)}
            </div>
          </div>
        )}
        <div className="flex items-center justify-between gap-3 mt-3 pt-3" style={{ borderTop: '1.5px solid var(--line)' }}>
          <span><span className="block text-[13.5px] font-semibold" style={{ color: 'var(--text)' }}>Left in your accounts</span>
            <span className="block text-[11.5px]" style={{ color: 'var(--text4)' }}>Came in − spent from bank &amp; cash − card bills paid − EMIs − invested{sentHome > 0 ? ' − sent to India' : ''}{flow.onCards + flow.cardLoanEmis > 0 ? ` · ${short(flow.onCards + flow.cardLoanEmis)} charged to cards, paid through card bills` : ''}. Saved {short(Math.max(kept, 0))} ({rate ?? 0}%) = came in − spending − EMIs.</span></span>
          <span className="text-[16px] font-bold tabular-nums" style={{ color: leftOver >= 0 ? '#1E8F5F' : '#D9482F' }}>{leftOver < 0 ? '−' : ''}{short(Math.abs(leftOver))}</span>
        </div>
        {unsorted > 0 && <a href="/dashboard/money/review" className="block text-[12px] font-semibold mt-3" style={{ color: 'var(--accent)' }}>{short(unsorted)} of transfers aren’t sorted yet — they count as money sent until you say what they were →</a>}
      </section>

      {/* Categories + highlights */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_1fr] gap-3.5 md:gap-4 items-start">
        <section className="wl-card px-4 md:px-5 py-4 md:py-[18px]">
          <div className="flex justify-between items-baseline gap-2 mb-1">
            <h2 className="text-[14px] md:text-[15px] font-semibold" style={{ color: 'var(--text)' }}>Spending by category</h2>
            <span className="text-[11.5px]" style={{ color: 'var(--text4)' }}>change vs {cmpLabel}</span>
          </div>
          {catRows.length === 0 ? <div className="text-[12.5px] py-6 text-center" style={{ color: 'var(--text3)' }}>No spending in {periodLabel}.</div> : shownCats.map((r, i) => {
            const col = colorFor(r.c)
            return (
              <div key={r.c} className="flex items-center gap-3 py-2.5" style={{ borderTop: i ? '1px solid var(--track)' : 'none' }}>
                <span className="w-9 h-9 rounded-[10px] flex items-center justify-center flex-shrink-0" style={{ background: col + '1A', color: col }}><CategoryIcon icon={iconFor(r.c)} size={15} /></span>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between gap-2 text-[13px] mb-[5px]">
                    <span className="font-semibold truncate" style={{ color: 'var(--text)' }}>{i + 1}. {labelOf(r.c)}</span>
                    <span className="tabular-nums font-semibold whitespace-nowrap" style={{ color: 'var(--text)' }}>{short(r.v)} <span className="font-normal" style={{ color: 'var(--text4)' }}>{Math.round(r.share)}%</span></span>
                  </div>
                  <div className="h-1.5 rounded-full" style={{ background: 'var(--track)' }}><div className="h-full rounded-full" style={{ width: `${Math.max(r.share, 1)}%`, background: col }} /></div>
                </div>
                <span className="w-14 text-right text-[11.5px] font-semibold tabular-nums flex-shrink-0" style={{ color: r.chg == null ? 'var(--text4)' : r.chg > 0 ? '#D9482F' : '#1E8F5F' }}>
                  {r.chg == null ? 'new' : `${r.chg > 0 ? '+' : ''}${r.chg}%`}
                </span>
              </div>
            )
          })}
          {catRows.length > 8 && (
            <button onClick={() => setShowAllCats(v => !v)} className="w-full mt-1 pt-2.5 text-[12.5px] font-semibold flex items-center justify-center gap-1" style={{ color: 'var(--accent)', borderTop: '1px solid var(--track)' }}>
              {showAllCats ? <>Show fewer <ChevronUp size={14} /></> : <>Show all {catRows.length} categories <ChevronDown size={14} /></>}
            </button>
          )}
        </section>

        <div className="flex flex-col gap-3.5 md:gap-4">
        <section className="rounded-[20px] bg-ai px-4 md:px-[22px] py-4 md:py-[18px]" style={{ border: '1px solid #E1DAFF' }}>
          <div className="text-[10.5px] md:text-[11px] font-semibold uppercase tracking-[0.06em]" style={{ color: 'var(--accent2)' }}>✦ Highlights</div>
          <h2 className="text-[16px] md:text-[17px] font-bold mt-0.5 mb-1" style={{ color: 'var(--text)' }}>What {periodLabel} tells you</h2>
          {notes.map((n, i) => {
            const st = n.tone === 'good' ? { c: '#1E8F5F', bg: '#E7F7EF', I: CheckCircle2 } : n.tone === 'warn' ? { c: '#B96A0B', bg: '#FFF2E2', I: AlertTriangle } : { c: '#5640D6', bg: '#F0EDFF', I: Info }
            return (
              <div key={i} className="flex gap-3 items-start py-2.5" style={{ borderTop: '1px solid rgba(106,85,232,.12)' }}>
                <span className="w-7 h-7 rounded-[9px] flex items-center justify-center flex-shrink-0" style={{ background: st.bg, color: st.c }}><st.I size={14} /></span>
                <div className="text-[13px] leading-normal" style={{ color: 'var(--text2)' }}>{n.text}</div>
              </div>
            )
          })}
        </section>
        <PaidBy rows={transactions.filter(t => months.includes(String(t.txn_date).slice(0, 7)) && inView(t.currency) && isSpending(t))}
          accounts={accounts} amountOf={t => conv(Number(t.amount) || 0, t.currency)} fmt={short} />
        </div>
      </div>

      {mode === 'year' ? (<>
        {/* Month by month */}
        <section className="wl-card overflow-hidden">
          <div className="px-4 md:px-5 pt-4 md:pt-[18px] pb-3">
            <h2 className="text-[14px] md:text-[15px] font-semibold" style={{ color: 'var(--text)' }}>Month by month · {year}</h2>
            <div className="text-[12px] mt-0.5" style={{ color: 'var(--text3)' }}>Tap a month to open its report</div>
          </div>
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-[12.5px] tabular-nums">
              <thead><tr style={{ background: '#FAFAFE', borderTop: '1px solid var(--line)', borderBottom: '1px solid var(--line)' }}>
                {['Month', 'Came in', 'Living', 'Family', 'EMIs', 'Invested', 'Saved', 'Savings rate'].map((h, i) => (
                  <th key={h} className={`px-4 py-2 text-[10.5px] font-semibold uppercase tracking-[0.05em] ${i ? 'text-right' : 'text-left'}`} style={{ color: 'var(--text4)' }}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {chart.filter(r => r.m <= thisMonth).map(r => {
                  const a = byMonth.get(r.m) ?? emptyAgg(), k = keptOf(a), rr = a.income > 0 ? Math.round(k / a.income * 100) : null
                  return (
                    <tr key={r.m} onClick={() => openMonth(r.m)} className="cursor-pointer hover:bg-[#FAFAFE]" style={{ borderTop: '1px solid var(--track)' }}>
                      <td className="px-4 py-2.5 font-semibold" style={{ color: 'var(--text)' }}>{MONTH[Number(r.m.slice(5)) - 1]}
                        {peak?.m === r.m && <span className="ml-2 rounded-full px-1.5 py-px text-[10px] font-bold" style={{ background: '#FDECE8', color: '#D9482F' }}>HIGHEST</span>}
                        {low?.m === r.m && <span className="ml-2 rounded-full px-1.5 py-px text-[10px] font-bold" style={{ background: '#E7F7EF', color: '#1E8F5F' }}>LOWEST</span>}
                        {r.m === thisMonth && <span className="ml-2 rounded-full px-1.5 py-px text-[10px] font-bold" style={{ background: '#F0EDFF', color: '#5640D6' }}>SO FAR</span>}</td>
                      <td className="px-4 py-2.5 text-right" style={{ color: '#16A34A' }}>{a.income ? short(a.income) : '—'}</td>
                      {(['living', 'sent', 'loans', 'invest'] as const).map(g => <td key={g} className="px-4 py-2.5 text-right" style={{ color: 'var(--text2)' }}>{a[g] ? short(a[g]) : '—'}</td>)}
                      <td className="px-4 py-2.5 text-right font-semibold" style={{ color: k >= 0 ? '#1E8F5F' : '#D9482F' }}>{a.income || outOf(a) ? short(k) : '—'}</td>
                      <td className="px-4 py-2.5 text-right" style={{ color: rr == null ? 'var(--text4)' : rr >= 20 ? '#1E8F5F' : rr >= 0 ? '#B96A0B' : '#D9482F' }}>{rr == null ? '—' : `${rr}%`}</td>
                    </tr>
                  )
                })}
                <tr style={{ borderTop: '1.5px solid var(--line)', background: '#FAFAFE' }}>
                  <td className="px-4 py-2.5 font-bold" style={{ color: 'var(--text)' }}>{partialYear ? 'So far' : 'Year'}</td>
                  <td className="px-4 py-2.5 text-right font-bold" style={{ color: '#16A34A' }}>{short(P.income)}</td>
                  {(['living', 'sent', 'loans', 'invest'] as const).map(g => <td key={g} className="px-4 py-2.5 text-right font-bold" style={{ color: 'var(--text)' }}>{short(P[g])}</td>)}
                  <td className="px-4 py-2.5 text-right font-bold" style={{ color: kept >= 0 ? '#1E8F5F' : '#D9482F' }}>{short(kept)}</td>
                  <td className="px-4 py-2.5 text-right font-bold" style={{ color: 'var(--text)' }}>{rate == null ? '—' : `${rate}%`}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="md:hidden">
            {chart.filter(r => r.m <= thisMonth).reverse().map((r, i) => {
              const a = byMonth.get(r.m) ?? emptyAgg(), o = outOf(a), k = keptOf(a)
              return (
                <button key={r.m} onClick={() => openMonth(r.m)} className="w-full text-left px-4 py-3" style={{ borderTop: i ? '1px solid var(--track)' : '1px solid var(--line)' }}>
                  <div className="flex justify-between items-baseline gap-2">
                    <span className="text-[13.5px] font-semibold" style={{ color: 'var(--text)' }}>{MONTH[Number(r.m.slice(5)) - 1]}
                      {peak?.m === r.m && <span className="ml-2 rounded-full px-1.5 py-px text-[10px] font-bold" style={{ background: '#FDECE8', color: '#D9482F' }}>HIGHEST</span>}
                      {low?.m === r.m && <span className="ml-2 rounded-full px-1.5 py-px text-[10px] font-bold" style={{ background: '#E7F7EF', color: '#1E8F5F' }}>LOWEST</span>}
                      {r.m === thisMonth && <span className="ml-2 rounded-full px-1.5 py-px text-[10px] font-bold" style={{ background: '#F0EDFF', color: '#5640D6' }}>SO FAR</span>}</span>
                    <span className="text-[13.5px] font-bold tabular-nums" style={{ color: 'var(--text)' }}>{short(o)}</span>
                  </div>
                  <div className="flex h-1.5 rounded-full overflow-hidden gap-[2px] mt-1.5" style={{ background: 'var(--track)' }}>
                    {SPEND_GROUPS.map(g => a[g.key] > 0 && <div key={g.key} style={{ width: `${a[g.key] / Math.max(o, a.income, 1) * 100}%`, background: g.color }} />)}
                  </div>
                  <div className="flex justify-between text-[11.5px] mt-1 tabular-nums" style={{ color: 'var(--text3)' }}>
                    <span>In {short(a.income)}</span><span style={{ color: k >= 0 ? '#1E8F5F' : '#D9482F' }}>{k >= 0 ? 'Saved' : 'Over by'} {short(Math.abs(k))}</span>
                  </div>
                </button>
              )
            })}
          </div>
        </section>

        {/* Category × month heat map */}
        {catRows.length > 0 && (() => {
          const top = catRows.slice(0, 10)
          const ms = chart.filter(r => r.m <= thisMonth).map(r => r.m)
          return (
            <section className="wl-card overflow-hidden">
              <div className="px-4 md:px-5 pt-4 md:pt-[18px] pb-3">
                <h2 className="text-[14px] md:text-[15px] font-semibold" style={{ color: 'var(--text)' }}>Categories by month</h2>
                <div className="text-[12px] mt-0.5" style={{ color: 'var(--text3)' }}>Darker cells are that category’s bigger months</div>
              </div>
              <div className="overflow-x-auto pb-1">
                <table className="w-full text-[11.5px] tabular-nums" style={{ minWidth: 120 + ms.length * 64 }}>
                  <thead><tr style={{ background: '#FAFAFE', borderTop: '1px solid var(--line)', borderBottom: '1px solid var(--line)' }}>
                    <th className="sticky left-0 z-10 px-4 py-2 text-left text-[10.5px] font-semibold uppercase tracking-[0.05em]" style={{ color: 'var(--text4)', background: '#FAFAFE' }}>Category</th>
                    {ms.map(m => <th key={m} className="px-1 py-2 text-center text-[10.5px] font-semibold uppercase" style={{ color: 'var(--text4)' }}>{mShort(m)}</th>)}
                    <th className="px-4 py-2 text-right text-[10.5px] font-semibold uppercase tracking-[0.05em]" style={{ color: 'var(--text4)' }}>Total</th>
                  </tr></thead>
                  <tbody>
                    {top.map(r => {
                      const vals = ms.map(m => byMonth.get(m)?.cats[r.c] ?? 0), mx = Math.max(...vals, 1), col = colorFor(r.c)
                      return (
                        <tr key={r.c} style={{ borderTop: '1px solid var(--track)' }}>
                          <td className="sticky left-0 z-10 bg-white px-4 py-1.5 font-semibold whitespace-nowrap" style={{ color: 'var(--text)' }}>
                            <i className="inline-block w-2 h-2 rounded-sm mr-2 align-middle" style={{ background: col }} />{labelOf(r.c)}</td>
                          {vals.map((v, i) => {
                            const a = v > 0 ? 0.1 + 0.75 * v / mx : 0
                            return (
                              <td key={i} className="px-[3px] py-[3px]">
                                <div className="h-8 rounded-md flex items-center justify-center text-[10.5px] font-medium" title={`${labelOf(r.c)} · ${mLong(ms[i])}: ${short(v)}`}
                                  style={{ background: v > 0 ? `rgba(106,85,232,${a.toFixed(2)})` : '#F8FAFC', color: a > 0.5 ? '#fff' : v > 0 ? 'var(--text2)' : 'var(--text4)' }}>
                                  {v > 0 ? axis(v) : '·'}
                                </div>
                              </td>
                            )
                          })}
                          <td className="px-4 py-1.5 text-right font-semibold" style={{ color: 'var(--text)' }}>{short(r.v)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          )
        })()}
      </>) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5 md:gap-4 items-start">
          {/* Loans and investments for the month */}
          <section className="wl-card px-4 md:px-5 py-4 md:py-[18px]">
            <h2 className="text-[14px] md:text-[15px] font-semibold" style={{ color: 'var(--text)' }}>Loans and investments</h2>
            <div className="text-[12px] mb-1" style={{ color: 'var(--text3)' }}>Money that paid down debt or went to work</div>
            {[{ title: 'Loan repayments', total: P.loans, rows: P.loanBy, color: GROUP.loans.color, Icon: Landmark },
              { title: 'Investments', total: P.invest, rows: P.investBy, color: GROUP.invest.color, Icon: TrendingUp }].map(s => (
              <div key={s.title} className="mt-2">
                <div className="flex justify-between items-baseline py-1.5">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.05em]" style={{ color: 'var(--text3)' }}>{s.title}</span>
                  <span className="text-[13px] font-bold tabular-nums" style={{ color: s.color }}>{short(s.total)}</span>
                </div>
                {Object.keys(s.rows).length === 0 ? <div className="text-[12.5px] pb-2" style={{ color: 'var(--text4)' }}>None in {periodLabel}</div>
                  : Object.entries(s.rows).sort((a, b) => b[1] - a[1]).map(([name, v]) => (
                    <div key={name} className="flex items-center gap-2.5 py-2" style={{ borderTop: '1px solid var(--track)' }}>
                      <span className="w-7 h-7 rounded-[9px] flex items-center justify-center flex-shrink-0" style={{ background: s.color + '1A', color: s.color }}><s.Icon size={13} /></span>
                      <span className="flex-1 min-w-0 truncate text-[13px]" style={{ color: 'var(--text)' }}>{name}</span>
                      <span className="text-[13px] font-semibold tabular-nums" style={{ color: 'var(--text)' }}>{short(v)}</span>
                    </div>
                  ))}
              </div>
            ))}
          </section>

          {/* Biggest payments */}
          <section className="wl-card px-4 md:px-5 py-4 md:py-[18px]">
            <div className="flex justify-between items-baseline gap-2">
              <h2 className="text-[14px] md:text-[15px] font-semibold" style={{ color: 'var(--text)' }}>Biggest payments</h2>
              {topPays.length > 0 && spending > 0 && <span className="text-[11.5px]" style={{ color: 'var(--text4)' }}>{Math.round(topPays.reduce((a, p) => a + p.v, 0) / spending * 100)}% of spending</span>}
            </div>
            {topPays.length === 0 ? <div className="text-[12.5px] py-6 text-center" style={{ color: 'var(--text3)' }}>No payments in {periodLabel}.</div> : topPays.map((p, i) => {
              const c = catOf(p.t), col = colorFor(c)
              return (
                <div key={`${p.t.id}-${i}`} className="flex items-center gap-3 py-2.5" style={{ borderTop: i ? '1px solid var(--track)' : 'none' }}>
                  <span className="w-9 h-9 rounded-[10px] flex items-center justify-center flex-shrink-0" style={{ background: col + '1A', color: col }}><CategoryIcon icon={iconFor(c)} size={15} /></span>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-semibold truncate" style={{ color: 'var(--text)' }}>{p.t.merchant || labelOf(c)}</div>
                    <div className="text-[11.5px] truncate" style={{ color: 'var(--text4)' }}>{labelOf(c)} · {Number(p.t.txn_date.slice(8, 10))} {mShort(p.month)}</div>
                  </div>
                  <span className="text-[13.5px] font-bold tabular-nums" style={{ color: 'var(--text)' }}>{short(p.v)}</span>
                </div>
              )
            })}
          </section>
        </div>
      )}

      {/* How the numbers are counted */}
      <section className="rounded-[16px] px-4 md:px-5 py-3.5" style={{ background: '#FAFAFE', border: '1px solid var(--line)' }}>
        <div className="text-[11px] font-semibold uppercase tracking-[0.05em] mb-1.5" style={{ color: 'var(--text3)' }}>How this report counts</div>
        <ul className="text-[12.5px] leading-relaxed list-disc pl-4 grid md:grid-cols-2 gap-x-8" style={{ color: 'var(--text3)' }}>
          <li><b style={{ color: 'var(--text2)' }}>Spent</b> is living costs plus family support. <b style={{ color: 'var(--text2)' }}>EMIs</b> and <b style={{ color: 'var(--text2)' }}>investments</b> are shown on their own.</li>
          <li><b style={{ color: 'var(--text2)' }}>Saved</b> = came in − spent − EMIs, so money you invest counts as saved.</li>
          <li><b style={{ color: 'var(--text2)' }}>UAE → India</b> is your own money moving: in the India view it’s income when it lands in NRE; in All it isn’t counted again.</li>
          <li>Moves between your accounts (NRE → NRO, ATM cash, loans received) are never income or spending.</li>
          <li><b style={{ color: 'var(--text2)' }}>Card bills</b> aren’t counted — the purchases are — unless a month’s card purchases weren’t imported.</li>
          <li>{view === 'consolidated' ? `AED amounts are converted at ₹${FX.toFixed(2)} per AED.` : `Only ${view === 'uae' ? 'AED' : 'INR'} transactions are included in this view.`}</li>
        </ul>
      </section>
    </div>
  )
}
