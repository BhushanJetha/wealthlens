'use client'
import { useState, useMemo, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useViewStore } from '@/store/viewStore'
import { createClient } from '@/lib/supabase/client'
import MetricCard from '@/components/dashboard/MetricCard'
import Pagination from '@/components/dashboard/Pagination'
import AddTransactionModal from '@/components/forms/AddTransactionModal'
import BankStatementUploadModal from '@/components/forms/BankStatementUploadModal'
import BillImageUploadModal from '@/components/forms/BillImageUploadModal'
import TransactionVoiceModal from '@/components/forms/TransactionVoiceModal'
import CreditCardUploadModal from '@/components/forms/CreditCardUploadModal'
import MessageParseModal from '@/components/forms/MessageParseModal'
import ManageCategoriesSheet from '@/components/forms/ManageCategoriesSheet'
import PaidBy from './PaidBy'
import { useCategoryStore } from '@/store/categoryStore'
import { colorOf as catColorOf } from '@/lib/categories'
import { isSpending, spendGroup, catOf, labelOf } from '@/lib/money'
import { toast } from '@/components/ui/toaster'

import { Upload, Image, Mic, PenLine, BarChart2, X, CreditCard, Pencil, Trash2, ChevronDown, Plus, Copy, Wallet, Banknote, MessageSquareText, Landmark, TrendingUp, CalendarDays, Settings2, Paperclip } from 'lucide-react'
import { openReceipt } from '@/lib/receipts'
import Link from 'next/link'
import { PageHeader, InsightBar, AiActions, KpiTile, HeroStat, Bars, Donut, ProgressRow, LearnStrip, PALETTE } from '@/components/ui/kit'
import { ListCard, ListRow, ListSearch, ChipFilter } from '@/components/ui/list'
import { addMonths, daysInMonth, localToday, fmtDay } from '@/lib/insights'
import { fmtCompact } from '@/lib/format'

const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

const TRANSFER_SUBTYPE_COLORS: Record<string,string> = {
  International: '#3B7DD8', Internal: '#7C5CBF', Family: '#3D7A58',
}
type Modal = 'none' | 'manual' | 'statement' | 'bill' | 'voice' | 'credit_card' | 'cash' | 'atm' | 'message'

function budgetColor(pct: number): string {
  if (pct >= 100) return 'var(--rose)'
  if (pct >= 75)  return 'var(--gold)'
  return 'var(--income)'
}

export default function ExpensesClient({ transactions, accounts }: { transactions: any[]; accounts: any[] }) {
  const { view, fromMonth, toMonth, fxRate: FX } = useViewStore()
  const [search,       setSearch]       = useState('')
  const [cat,          setCat]          = useState('All')
  const [accFilter,    setAccFilter]    = useState('All')
  const [activeModal,  setActiveModal]  = useState<Modal>('none')
  const [page,         setPage]         = useState(1)
  const [pageSize,     setPageSize]     = useState(20)
  const [liveRate,     setLiveRate]     = useState<number | null>(null)
  const [rateDate,     setRateDate]     = useState<string | null>(null)
  const [budgets,      setBudgets]      = useState<any[]>([])
  const [alertCat,     setAlertCat]     = useState<string | null>(null)
  const [editing,      setEditing]      = useState<{ txn: any; duplicate?: boolean } | null>(null)
  const [manageCats,   setManageCats]   = useState(false)
  const { rows: categories, load: loadCategories } = useCategoryStore()
  const [openPanel,    setOpenPanel]    = useState<string | null>(null)
  const [deletingId,   setDeletingId]   = useState<string | null>(null)
  const [showAddMenu,  setShowAddMenu]  = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const sheetRef = useRef<HTMLDivElement>(null)
  const [sharedText, setSharedText] = useState<string | null>(null)

  const supabase = createClient()
  const router   = useRouter()
  useEffect(() => { loadCategories() }, [loadCategories])

  const sym       = view === 'uae' ? 'AED ' : '₹'
  const toDisplay = (amt: number, cur: string) => view === 'consolidated' ? amt * (cur === 'AED' ? FX : 1) : amt
  const inRange   = (d: string) => { const m = d?.slice(0,7) ?? ''; return m >= fromMonth && m <= toMonth }

  useEffect(() => {
    fetch('/api/fx-rate').then(r => r.json()).then(d => { setLiveRate(d.rate); setRateDate(d.date) }).catch(() => {})
  }, [])

  // PWA share-target: on Android, "Share → WealthLens" of a bank SMS opens
  // /dashboard/expenses?text=… — auto-open the message parser with that text.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search)
    const shared = p.get('text') || p.get('title')
    if (shared) {
      setSharedText(shared)
      setActiveModal('message')
      window.history.replaceState({}, '', '/dashboard/expenses')
    }
  }, [])

  useEffect(() => {
    // The menu is a dropdown on desktop and a bottom sheet on phones
    function onClickOutside(e: MouseEvent) {
      const t = e.target as Node
      if (!menuRef.current?.contains(t) && !sheetRef.current?.contains(t)) setShowAddMenu(false)
    }
    if (showAddMenu) document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [showAddMenu])

  useEffect(() => {
    const thisMonth = new Date().toISOString().slice(0,7)
    supabase.from('budgets').select('*').eq('month_year', thisMonth)
      .then(({ data }) => setBudgets(data ?? []))
  }, [])

  const openEdit      = (txn: any) => setEditing({ txn })
  const openDuplicate = (txn: any) => setEditing({ txn, duplicate: true })

  async function deleteTxn(t: any) {
    if (!confirm(`Delete ${t.merchant || 'this transaction'}? This can’t be undone.`)) return
    setDeletingId(t.id)
    const res = await fetch(`/api/transactions?id=${t.id}`, { method: 'DELETE' })
    setDeletingId(null)
    toast(res.ok ? 'Transaction deleted' : 'Couldn’t delete it. Try again.', res.ok ? 'success' : 'error')
    router.refresh()
  }

  const filtered = useMemo(() => {
    setPage(1)
    return transactions.filter(t => {
      if (view === 'uae'   && t.currency !== 'AED') return false
      if (view === 'india' && t.currency !== 'INR') return false
      if (cat !== 'All'   && t.category !== cat && catOf(t) !== cat) return false
      if (accFilter !== 'All' && t.account_id !== accFilter) return false
      if (search && !t.merchant?.toLowerCase().includes(search.toLowerCase())) return false
      return true
    })
  }, [transactions, view, cat, accFilter, search])

  const filteredForMonth    = useMemo(() => filtered.filter(t => inRange(t.txn_date)), [filtered, fromMonth, toMonth])
  // Same split as Spending analysis and Reports (lib/money): spending = living
  // costs + money sent; loan repayments and investments have their own tiles;
  // card bills settle spend already counted
  const expensesForMonth        = filteredForMonth.filter(t => t.txn_type === 'expense')
  const loansForMonth           = filteredForMonth.filter(t => spendGroup(t) === 'loans')
  const ccPaymentsForMonth      = filteredForMonth.filter(t => t.category === 'Credit Card Payment')
  const realExpensesForMonth    = filteredForMonth.filter(isSpending)
  const investmentsForMonth     = filteredForMonth.filter(t => spendGroup(t) === 'invest')

  const rangeExpenses     = realExpensesForMonth.reduce((a, t) => a + toDisplay(Number(t.amount), t.currency), 0)
  const rangeCCPayments   = ccPaymentsForMonth.reduce((a, t) => a + toDisplay(Number(t.amount), t.currency), 0)
  const rangeLoanPayments = loansForMonth.reduce((a, t) => a + toDisplay(Number(t.amount), t.currency), 0)
  const rangeInvestments  = investmentsForMonth.reduce((a, t) => a + toDisplay(Number(t.amount), t.currency), 0)

  // Budget-aware: category totals for selected month
  const catMonthTotals = useMemo(() => {
    const m: Record<string,number> = {}
    filteredForMonth.filter(t => t.txn_type === 'expense')
      .forEach(t => { m[t.category] = (m[t.category] ?? 0) + toDisplay(Number(t.amount), t.currency) })
    return m
  }, [filteredForMonth, view, FX])

  const budgetMap = useMemo(() => {
    const m: Record<string, number> = {}
    budgets.forEach(b => { m[b.category] = Number(b.monthly_cap) })
    return m
  }, [budgets])

  function getBudgetStatus(category: string): { pct: number; cap: number; spent: number } | null {
    const cap = budgetMap[category]
    if (!cap) return null
    const spent = catMonthTotals[category] ?? 0
    return { pct: cap > 0 ? (spent / cap) * 100 : 0, cap, spent }
  }

  const rangeLabel = fromMonth === toMonth
    ? new Date(fromMonth+'-01').toLocaleDateString('en-GB',{month:'long',year:'numeric'})
    : `${new Date(fromMonth+'-01').toLocaleDateString('en-GB',{month:'short',year:'numeric'})} – ${new Date(toMonth+'-01').toLocaleDateString('en-GB',{month:'short',year:'numeric'})}`

  const addButtons: { key: Modal; label: string; desc: string; icon: React.ElementType; color: string }[] = [
    { key: 'message',     label: 'From SMS / Email', desc: 'Paste or share a bank alert — auto-fills', icon: MessageSquareText, color: '#0EA5E9' },
    { key: 'credit_card', label: 'Credit Card PDF',  desc: 'Parse ENBD, Amex, ADCB CC statements', icon: CreditCard, color: '#2563EB' },
    { key: 'statement',   label: 'Bank Statement',   desc: 'Parse Wio, Emirates NBD, ADCB PDFs',   icon: Upload,     color: '#059669' },
    { key: 'bill',        label: 'Bill / Image',     desc: 'Scan a receipt or bill photo',          icon: Image,      color: '#D97706' },
    { key: 'voice',       label: 'Voice Entry',      desc: 'Speak your transaction aloud',          icon: Mic,        color: '#7C3AED' },
    { key: 'manual',      label: 'Manual Entry',     desc: 'Type in a transaction manually',        icon: PenLine,    color: '#16A34A' },
    { key: 'cash',        label: 'Cash Expense',     desc: 'Log spending paid with cash',           icon: Wallet,     color: '#DB2777' },
    { key: 'atm',         label: 'ATM Withdrawal',   desc: 'Cash withdrawn from bank — tops up Cash', icon: Banknote,   color: '#0891B2' },
  ]

  const paged = filteredForMonth.slice((page-1)*pageSize, page*pageSize)

  // ── Design v2 summary: KPIs, monthly bars, category breakdown, insight ──
  const cur       = view === 'uae' ? 'AED' : 'INR'
  const short     = (n: number) => fmtCompact(n, cur)
  const money     = (n: number) => `${sym}${Math.round(n).toLocaleString('en-IN')}`
  const viewLabel = view === 'uae' ? 'UAE · AED' : view === 'india' ? 'India · INR' : 'Consolidated · INR'
  const isSpend   = isSpending
  const SENT_COLOR: Record<string, string> = { 'International Transfer': '#3B8EF0', Transfer: '#0EA5E9' }
  const colorOf = (rows: typeof categories, c: string) => SENT_COLOR[c] ?? catColorOf(rows, c)

  // Same-length period just before the selected one, for "vs previous"
  const spanMonths = (Number(toMonth.slice(0, 4)) - Number(fromMonth.slice(0, 4))) * 12 + Number(toMonth.slice(5)) - Number(fromMonth.slice(5)) + 1
  const prevFrom = addMonths(fromMonth, -spanMonths), prevTo = addMonths(fromMonth, -1)
  const prevLabel = spanMonths === 1 ? 'last month' : `the previous ${spanMonths} months`
  const prevSpend = useMemo(() => filtered
    .filter(t => { const m = t.txn_date?.slice(0, 7) ?? ''; return m >= prevFrom && m <= prevTo && isSpend(t) })
    .reduce((a, t) => a + toDisplay(Number(t.amount), t.currency), 0), [filtered, prevFrom, prevTo, view, FX])
  const spendChg   = prevSpend > 0 ? Math.round((rangeExpenses - prevSpend) / prevSpend * 1000) / 10 : null
  const spendDelta = spendChg != null ? `${spendChg > 0 ? '▲' : '▼'} ${Math.abs(spendChg)}% vs ${prevLabel}`
    : `${realExpensesForMonth.length} transaction${realExpensesForMonth.length === 1 ? '' : 's'}`
  const spendTone  = spendChg == null ? 'neutral' as const : spendChg > 0 ? 'bad' as const : 'good' as const

  // At least 6 months of bars ending at the selected month; the selection is highlighted
  const barMonths = useMemo(() => {
    const n = Math.min(Math.max(spanMonths, 6), 12)
    const months = Array.from({ length: n }, (_, i) => addMonths(toMonth, i - n + 1))
    const tot: Record<string, number> = {}
    filtered.forEach(t => {
      const m = t.txn_date?.slice(0, 7)
      if (m && m >= months[0] && m <= toMonth && isSpend(t)) tot[m] = (tot[m] ?? 0) + toDisplay(Number(t.amount), t.currency)
    })
    return months.map(m => ({
      label: MON[Number(m.slice(5)) - 1], value: tot[m] ?? 0, hi: m >= fromMonth && m <= toMonth,
      tip: `${MON[Number(m.slice(5)) - 1]} ${m.slice(0, 4)}: ${sym}${Math.round(tot[m] ?? 0).toLocaleString('en-IN')}`,
    }))
  }, [filtered, fromMonth, toMonth, spanMonths, view, FX])

  // Daily average over the days the period has had so far
  const periodDays = useMemo(() => {
    const today = localToday(), thisM = today.slice(0, 7)
    let d = 0
    for (let m = fromMonth; m <= toMonth; m = addMonths(m, 1)) d += m < thisM ? daysInMonth(m) : m === thisM ? Number(today.slice(8, 10)) : 0
    return Math.max(d, 1)
  }, [fromMonth, toMonth])
  const dailyAvg = rangeExpenses / periodDays

  // Category chips: only categories this period actually has, with counts
  const catOptions = useMemo(() => {
    const n: Record<string, number> = {}
    let all = 0
    transactions.forEach(t => {
      if (view === 'uae' && t.currency !== 'AED') return
      if (view === 'india' && t.currency !== 'INR') return
      if (!inRange(t.txn_date) || (accFilter !== 'All' && t.account_id !== accFilter)) return
      n[t.category] = (n[t.category] ?? 0) + 1; all++
    })
    if (cat !== 'All' && !n[cat]) n[cat] = 0
    return [{ key: 'All', label: 'All', count: all },
      ...Object.entries(n).sort((a, b) => b[1] - a[1]).map(([c, k]) => ({ key: c, label: c, count: k, warn: (getBudgetStatus(c)?.pct ?? 0) >= 100 }))]
  }, [transactions, view, accFilter, fromMonth, toMonth, cat, budgetMap, catMonthTotals])

  const catUsage = useMemo(() => {
    const n: Record<string, number> = {}
    transactions.forEach(t => { if (t.category) n[t.category] = (n[t.category] ?? 0) + 1 })
    return n
  }, [transactions])

  // Top five categories + "Other categories"
  const catRows = useMemo(() => {
    const m: Record<string, number> = {}
    realExpensesForMonth.forEach(t => { const c = catOf(t); m[c] = (m[c] ?? 0) + toDisplay(Number(t.amount), t.currency) })
    const rows = Object.entries(m).sort((a, b) => b[1] - a[1])
    const rest = rows.slice(5).reduce((a, r) => a + r[1], 0)
    return [...rows.slice(0, 5).map(([cat, v]) => ({ cat, v, color: colorOf(categories, cat) })), ...(rest > 0 ? [{ cat: 'Other categories', v: rest, color: '#CBD5E1' }] : [])]
  }, [filteredForMonth, view, FX, categories])

  const overBudget = Object.keys(budgetMap).filter(c => (catMonthTotals[c] ?? 0) > budgetMap[c])
  const top = catRows[0]
  const insight = realExpensesForMonth.length === 0
    ? `No spending recorded for ${rangeLabel} yet. Import a statement or add a transaction to see where your money goes.`
    : [
        top && `${top.cat} is your biggest category at ${short(top.v)} (${Math.round(top.v / rangeExpenses * 100)}% of spending).`,
        spendChg != null && `Spending is ${Math.abs(spendChg)}% ${spendChg >= 0 ? 'higher' : 'lower'} than ${prevLabel}.`,
        overBudget.length > 0 && `${overBudget.length} categor${overBudget.length === 1 ? 'y is' : 'ies are'} over budget.`,
      ].filter(Boolean).join(' ')
  const aiContext = `My expenses for ${rangeLabel} (${viewLabel}): ${money(rangeExpenses)} across ${realExpensesForMonth.length} transactions. `
    + `Top categories: ${catRows.map(r => `${r.cat} ${short(r.v)}`).join(', ') || 'none'}.`
    + (spendChg != null ? ` ${spendChg >= 0 ? 'Up' : 'Down'} ${Math.abs(spendChg)}% vs ${prevLabel}.` : '')
    + (overBudget.length ? ` Over budget: ${overBudget.join(', ')}.` : '')

  // Card bills, loan payments and investments: tap a tile to see the payments
  const panels = [
    { key: 'cc',     label: 'Card bills paid', color: '#9333EA', total: rangeCCPayments,   txns: ccPaymentsForMonth,  showInrEq: false, showCatBadge: false, icon: CreditCard },
    { key: 'loan',   label: 'Loan payments',   color: '#F59E0B', total: rangeLoanPayments, txns: loansForMonth,       showInrEq: false, showCatBadge: true,  icon: Landmark },
    { key: 'invest', label: 'Invested',        color: '#10B981', total: rangeInvestments,  txns: investmentsForMonth, showInrEq: false, showCatBadge: false, icon: TrendingUp },
  ]
  const activePanel = panels.find(p => p.key === openPanel && p.txns.length > 0) ?? null

  const addMenuList = (
    <>
      <div className="px-4 py-2.5 border-b text-[10px] uppercase tracking-wider font-bold"
        style={{ borderColor:'var(--line)', color:'var(--text3)', background:'var(--bg2)' }}>
        How would you like to add?
      </div>
      {addButtons.map(({ key, label, desc, icon: Icon, color }) => (
        <button key={key}
          onClick={() => { setActiveModal(key); setShowAddMenu(false) }}
          className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors border-b last:border-b-0 hover:bg-[#F7F6FD]"
          style={{ borderColor:'var(--line)' }}>
          <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: color+'15', color }}>
            <Icon size={17} />
          </div>
          <div className="min-w-0">
            <div className="text-[12.5px] font-semibold" style={{ color:'var(--text)' }}>{label}</div>
            <div className="text-[11px] leading-snug mt-0.5" style={{ color:'var(--text3)' }}>{desc}</div>
          </div>
        </button>
      ))}
    </>
  )

  return (
    // Phones follow the design's order (title · hero chart · KPIs · insight ·
    // AI actions · breakdown · filters · list · learn) via max-md:order.
    <div className="flex flex-col gap-3.5 md:gap-[18px] animate-fade-up">
      <div className="max-md:order-1">
        <PageHeader title="Expenses"
          sub={<>{viewLabel} · {rangeLabel}{liveRate && <span className="hidden sm:inline" style={{ color:'var(--amber-text)' }}> · 1 AED = ₹{liveRate.toFixed(2)}{rateDate ? ` (${rateDate})` : ''}</span>}</>}
          onAdd={() => setShowAddMenu(true)} addLabel="Add transaction"
          actions={<>
            <button onClick={() => setManageCats(true)} className="wl-btn" style={{ height: 34 }}><Settings2 size={14} />Categories</button>
            <Link href="/dashboard/expenses/report" className="wl-btn" style={{ height: 34 }}><BarChart2 size={14} />Annual report</Link>
            <div className="relative" ref={menuRef}>
              <button onClick={() => setShowAddMenu(v => !v)} aria-expanded={showAddMenu} aria-haspopup="menu"
                className="wl-btn wl-btn-primary" style={{ height: 34 }}>
                <Plus size={14} />Add transaction
                <ChevronDown size={13} style={{ transition:'transform 0.2s', transform: showAddMenu ? 'rotate(180deg)' : 'none' }} />
              </button>
              {showAddMenu && (
                <div className="hidden md:block absolute right-0 top-full mt-2 w-72 rounded-2xl z-50 overflow-hidden"
                  style={{ background:'#fff', border:'1px solid var(--line)', boxShadow:'0 18px 50px rgba(15,23,42,.2)' }}>
                  {addMenuList}
                </div>
              )}
            </div>
          </>} />
      </div>
      {showAddMenu && (
        <div className="md:hidden fixed inset-0 z-50 wl-sheet" onClick={() => setShowAddMenu(false)}>
          <div ref={sheetRef} className="wl-sheet-panel bg-white" onClick={e => e.stopPropagation()}>{addMenuList}</div>
        </div>
      )}

      <div className="max-md:order-4"><InsightBar text={insight} prompt={`Explain my expenses page in plain language. ${aiContext}`} /></div>
      <div className="max-md:order-5"><AiActions actions={['Find ways to save', 'Flag unusual spends']} context={aiContext} /></div>

      {/* Headline number + monthly bars (same card on desktop and phone) + where it went */}
      <div className="max-md:contents grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-4">
        <HeroStat className="max-md:order-2" label={`Spent · ${rangeLabel}`} value={money(rangeExpenses)} delta={spendDelta} tone={spendTone}
          right={<div className="flex gap-3.5 text-[11.5px]" style={{ color:'var(--text3)' }}>
            <span><i className="inline-block w-[9px] h-[9px] rounded-sm mr-1.5" style={{ background:'var(--accent)' }} />Selected period</span>
            <span><i className="inline-block w-[9px] h-[9px] rounded-sm mr-1.5" style={{ background:'#C9C2F5' }} />Earlier</span>
          </div>}>
          <Bars data={barMonths} className="h-[110px] md:h-auto md:flex-1 md:min-h-[200px] mt-2.5 md:mt-4" label={`Spending by month: ${barMonths.map(b => b.tip).join(', ')}`} />
        </HeroStat>

        <section className="wl-card max-md:order-6 px-4 md:px-5 py-4 md:py-[18px] flex flex-col gap-3">
          <h2 className="text-[14px] font-semibold" style={{ color:'var(--text)' }}>Where it went</h2>
          {catRows.length === 0 ? (
            <div className="text-[12.5px] py-6 text-center" style={{ color:'var(--text3)' }}>No spending in {rangeLabel}.</div>
          ) : (<>
            <div className="hidden md:flex justify-center">
              <Donut segments={catRows.map(r => ({ value: r.v, color: r.color }))} size={128}
                label={`Spending by category: ${catRows.map(r => `${r.cat} ${short(r.v)}`).join(', ')}`}>
                <div className="text-[10.5px]" style={{ color:'var(--text3)' }}>Spent</div>
                <div className="text-[16px] font-bold tracking-[-0.01em]" style={{ color:'var(--text)' }}>{short(rangeExpenses)}</div>
              </Donut>
            </div>
            {catRows.map(r => {
              const real = r.cat !== 'Other categories'
              const cap = real ? budgetMap[r.cat] : undefined
              const share = rangeExpenses > 0 ? r.v / rangeExpenses * 100 : 0
              const row = <ProgressRow name={labelOf(r.cat)} sub={cap ? `of ${short(cap)} budget` : undefined} value={short(r.v)} right={`${Math.round(share)}%`} pct={share} color={r.color} />
              return real
                ? <button key={r.cat} onClick={() => setCat(r.cat)} className="text-left" title={`Show only ${r.cat}`}>{row}</button>
                : <div key={r.cat}>{row}</div>
            })}
          </>)}
        </section>
      </div>

      {/* KPIs: same four tiles on both sizes */}
      <div className="max-md:order-3 grid grid-cols-2 lg:grid-cols-4 gap-2.5 md:gap-3.5">
        <KpiTile label="Daily average" value={money(dailyAvg)} tint={0} icon={CalendarDays}
          delta={`over ${periodDays} day${periodDays === 1 ? '' : 's'}`} />
        {panels.map((p, i) => (
          <KpiTile key={p.key} label={p.label} value={money(p.total)} tint={i + 1} icon={p.icon}
            delta={`${p.txns.length} payment${p.txns.length === 1 ? '' : 's'}${p.txns.length ? ' · view' : ''}`}
            onClick={p.txns.length ? () => setOpenPanel(p.key) : undefined} />
        ))}
      </div>

      {/* Card vs bank (UPI, transfers…) vs cash, from each expense's "Paid from" */}
      <div className="max-md:order-6">
        <PaidBy rows={realExpensesForMonth} accounts={accounts} amountOf={t => toDisplay(Number(t.amount), t.currency)} fmt={short}
          title={`How you paid · ${rangeLabel}`} />
      </div>

      {/* Transaction detail popup */}
      {activePanel && (
        <div className="fixed inset-0 wl-sheet z-50 flex items-end sm:items-center justify-center p-4 wl-popup-overlay"
          style={{ background: 'rgba(15,23,42,0.45)' }}
          onClick={() => setOpenPanel(null)}>
          <div className="wl-sheet-panel wl-popup-panel rounded-2xl shadow-2xl w-full max-w-md flex flex-col overflow-hidden"
            style={{ background: 'var(--card)', border: '1px solid var(--line)', borderTop: `3px solid ${activePanel.color}`, maxHeight: '80vh' }}
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: 'var(--line)' }}>
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider mb-0.5" style={{ color: activePanel.color }}>
                  {activePanel.label}
                </div>
                <div className="text-[24px] font-bold font-mono" style={{ color: 'var(--text)' }}>
                  {money(activePanel.total)}
                </div>
                <div className="text-[11px]" style={{ color: 'var(--text3)' }}>
                  {activePanel.txns.length} transaction{activePanel.txns.length !== 1 ? 's' : ''} · {rangeLabel}
                </div>
              </div>
              <button onClick={() => setOpenPanel(null)} aria-label="Close"
                className="p-2 rounded-xl transition-colors hover:bg-gray-100"
                style={{ color: 'var(--text3)' }}>
                <X size={16} />
              </button>
            </div>
            <div className="overflow-y-auto p-4 space-y-2">
              {activePanel.txns.map((t: any, i: number) => {
                const lSym    = t.currency === 'AED' ? 'AED ' : '₹'
                const inrEq   = activePanel.showInrEq && t.currency === 'AED' && liveRate
                  ? `≈ ₹${Math.round(Number(t.amount) * liveRate).toLocaleString('en-IN')}` : null
                const rowColor = activePanel.key === 'loan'
                  ? (t.category === 'Loan on Card' ? '#F59E0B' : '#F97316')
                  : activePanel.color
                return (
                  <div key={i} className="flex items-center justify-between rounded-xl px-3 py-2.5"
                    style={{ background: rowColor + '0D', border: `1px solid ${rowColor}25` }}>
                    <div className="min-w-0 mr-3">
                      <div className="text-[12px] font-semibold truncate" style={{ color: 'var(--text)' }}>{t.merchant}</div>
                      <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                        {activePanel.showCatBadge && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded font-semibold"
                            style={{ background: rowColor + '20', color: rowColor }}>
                            {t.category}
                          </span>
                        )}
                        <span className="text-[10px]" style={{ color: 'var(--text3)' }}>{t.txn_date}</span>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="font-mono font-bold text-[13px]" style={{ color: rowColor }}>
                        {lSym}{Number(t.amount).toLocaleString('en-IN')}
                      </div>
                      {inrEq && <div className="text-[10px] font-mono" style={{ color: 'var(--text3)' }}>{inrEq}</div>}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* Budget alert popover */}
      {alertCat && (() => {
        const bs = getBudgetStatus(alertCat)
        if (!bs) return null
        const color = budgetColor(bs.pct)
        return (
          <div className="wl-card max-md:order-7 p-4 relative" style={{ border: `2px solid ${color}` }}>
            <button onClick={() => setAlertCat(null)} className="absolute top-3 right-3" aria-label="Close" style={{ color:'var(--text3)' }}><X size={14}/></button>
            <div className="text-[12px] font-bold mb-2" style={{ color }}>
              {alertCat} · Budget Alert
            </div>
            <div className="grid grid-cols-3 gap-3 text-[11px]">
              <div><div style={{ color:'var(--text3)' }}>Budget</div><div className="font-mono font-bold" style={{ color:'var(--text)' }}>{sym}{Math.round(bs.cap).toLocaleString('en-IN')}</div></div>
              <div><div style={{ color:'var(--text3)' }}>Spent</div><div className="font-mono font-bold" style={{ color }}>{sym}{Math.round(bs.spent).toLocaleString('en-IN')}</div></div>
              <div><div style={{ color:'var(--text3)' }}>{bs.pct >= 100 ? 'Over by' : 'Remaining'}</div>
                <div className="font-mono font-bold" style={{ color: bs.pct >= 100 ? 'var(--rose)' : 'var(--income)' }}>
                  {sym}{Math.abs(Math.round(bs.spent - bs.cap)).toLocaleString('en-IN')}
                </div>
              </div>
            </div>
            <div className="mt-2 h-2 rounded-full overflow-hidden" style={{ background:'var(--track)' }}>
              <div className="h-full rounded-full" style={{ width:`${Math.min(bs.pct,100)}%`, background: color }} />
            </div>
            <div className="text-[10px] mt-1 font-semibold" style={{ color }}>{Math.round(bs.pct)}% of budget used</div>
          </div>
        )
      })()}

      {/* Transactions: search, account and category filters live in the card */}
      <ListCard className="max-md:order-9" title="Transactions"
        sub={`${filteredForMonth.length} in ${rangeLabel}${cat !== 'All' ? ` · ${cat}` : ''}`}
        head={['Merchant', 'Category', 'Date', 'Amount']}
        right={<button onClick={() => setManageCats(true)} className="wl-btn flex-shrink-0" style={{ height: 30, fontSize: 12 }}><Settings2 size={13} />Categories</button>}
        toolbar={<>
          <ListSearch value={search} onChange={setSearch} placeholder="Search…">
            <select value={accFilter} onChange={e => setAccFilter(e.target.value)} aria-label="Account"
              className="wl-input max-w-[44%] md:max-w-[220px]" style={{ background:'#fff', width:'auto', height: 36 }}>
              <option value="All">All accounts</option>
              {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </ListSearch>
          <ChipFilter label="Category" value={cat} options={catOptions}
            onChange={c => { setCat(c); if ((getBudgetStatus(c)?.pct ?? 0) >= 100) setAlertCat(c) }} />
        </>}
        empty={filteredForMonth.length === 0
          ? <div className="text-center py-12 text-[13px]" style={{ color:'var(--text3)', borderTop: '1px solid var(--line)' }}>
              No transactions{cat !== 'All' ? ` in ${cat}` : ''} for {rangeLabel}.
            </div>
          : undefined}
        footer={filteredForMonth.length > 0 && <div>
          <Pagination total={filteredForMonth.length} page={page} pageSize={pageSize}
            onPage={setPage} onPageSize={s => { setPageSize(s); setPage(1) }} />
        </div>}>
        {paged.map(t => {
          const isTransfer = t.txn_type === 'transfer'
          const isLoan     = t.txn_type === 'loan'
          const catColor   = isTransfer
            ? (t.category === 'Family Transfer' ? '#0EA5E9' : TRANSFER_SUBTYPE_COLORS[t.sub_category] ?? '#3B7DD8')
            : colorOf(categories, t.category)
          const bs = !isTransfer && !isLoan && t.category !== 'Credit Card Payment' ? getBudgetStatus(t.category) : null
          const lSym  = t.currency === 'AED' ? 'AED ' : '₹'
          const inrEq = t.currency === 'AED' && view !== 'uae' && liveRate
            ? `≈ ₹${Math.round(Number(t.amount) * liveRate).toLocaleString('en-IN')}` : undefined
          const label = isTransfer ? (t.category === 'Family Transfer' ? 'Family Transfer' : t.sub_category || t.category || 'Transfer') : t.category
          const account = accounts.find((a: any) => a.id === t.account_id)?.name ?? null
          return (
            <ListRow key={t.id} color={catColor} title={t.merchant}
              sub={[account, isTransfer && t.description && t.description !== t.merchant ? `→ ${t.description}` : null, t.holder_name ? `for ${t.holder_name === 'Self' ? 'you' : t.holder_name}` : null, t.tax_tag ? `tax ${t.tax_tag}` : null, t.receipt_path ? '📎 receipt' : null].filter(Boolean).join(' · ') || undefined}
              tag={label} warn={bs && bs.pct >= 75 ? `${t.category}: ${Math.round(bs.pct)}% of this month's budget used` : null}
              meta={fmtDay(t.txn_date)} amount={`−${lSym}${Number(t.amount).toLocaleString('en-IN')}`}
              amountColor={isSpending(t) || spendGroup(t) ? '#DC2626' : 'var(--text3)'}
              amountSub={inrEq ?? (!spendGroup(t) ? 'move · not spending' : undefined)}
              onOpen={() => openEdit(t)}
              actions={[
                { label: 'Edit', icon: Pencil, onClick: () => openEdit(t) },
                { label: 'Duplicate', icon: Copy, onClick: () => openDuplicate(t) },
                ...(t.receipt_path ? [{ label: 'View receipt', icon: Paperclip, onClick: () => { openReceipt(supabase, t.receipt_path) } }] : []),
                { label: 'Delete', icon: Trash2, onClick: () => deleteTxn(t), danger: true, disabled: deletingId === t.id },
              ]} />
          )
        })}
      </ListCard>

      <div className="max-md:order-10"><LearnStrip title="Why categories beat totals" href="/dashboard/expenses/learn" /></div>

      {activeModal === 'message'     && <MessageParseModal onClose={() => setActiveModal('none')} initialText={sharedText ?? ''} />}
      {activeModal === 'manual'      && <AddTransactionModal onClose={() => setActiveModal('none')} />}
      {activeModal === 'cash'        && <AddTransactionModal onClose={() => setActiveModal('none')} defaults={{ txn_type:'expense', account_id:'__cash__', currency: view === 'uae' ? 'AED' : 'INR' }} />}
      {activeModal === 'atm'         && <AddTransactionModal onClose={() => setActiveModal('none')} defaults={{ txn_type:'transfer', category:'ATM Withdrawal', sub_category:'ATM Withdrawal', account_id:'__cash__', merchant:'ATM Withdrawal', currency: view === 'uae' ? 'AED' : 'INR' }} />}
      {activeModal === 'statement'   && <BankStatementUploadModal onClose={() => setActiveModal('none')} />}
      {activeModal === 'bill'        && <BillImageUploadModal onClose={() => setActiveModal('none')} defaultType="expense" />}
      {activeModal === 'voice'       && <TransactionVoiceModal onClose={() => setActiveModal('none')} defaultType="expense" />}
      {activeModal === 'credit_card' && <CreditCardUploadModal onClose={() => setActiveModal('none')} />}

      {editing && <AddTransactionModal edit={editing} onClose={() => setEditing(null)} />}
      {manageCats && <ManageCategoriesSheet usage={catUsage} onClose={() => setManageCats(false)} onChanged={() => router.refresh()} />}
    </div>
  )
}
