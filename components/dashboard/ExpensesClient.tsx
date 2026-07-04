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

import { Search, Upload, Image, Mic, PenLine, BarChart2, ArrowRight, AlertTriangle, X, CreditCard, Pencil, Trash2, Check, BookOpen, ChevronDown, Plus } from 'lucide-react'
import Link from 'next/link'

const EXPENSE_CATS = ['All','Food','Shopping','Utilities','Transport','Health','Entertainment','Travel','Education','Subscription','Credit Card Payment','Loan on Card','EMI/Loan','Family Transfer','Transfer','Refund','Other']
const CAT_COLORS: Record<string,string> = {
  Food:'#D97706', Shopping:'#2563EB', Utilities:'#7C3AED', Transport:'#16A34A',
  Health:'#059669', Entertainment:'#E11D48', Travel:'#EA580C', Other:'#6B7280',
  Transfer:'#3B7DD8', Education:'#0284C7', Subscription:'#EC4899', Refund:'#10B981',
  'Credit Card Payment':'#9333EA', 'Family Transfer':'#0EA5E9',
  'Loan on Card':'#F59E0B', 'EMI/Loan':'#F97316',
}
const TRANSFER_SUBTYPE_COLORS: Record<string,string> = {
  International: '#3B7DD8', Internal: '#7C5CBF', Family: '#3D7A58',
}
type Modal = 'none' | 'manual' | 'statement' | 'bill' | 'voice' | 'credit_card'

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
  const [editTxn,      setEditTxn]      = useState<any | null>(null)
  const [editFields,   setEditFields]   = useState<any>({})
  const [editSaving,   setEditSaving]   = useState(false)
  const [openPanel,    setOpenPanel]    = useState<string | null>(null)
  const [deletingId,   setDeletingId]   = useState<string | null>(null)
  const [showAddMenu,  setShowAddMenu]  = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  const supabase = createClient()
  const router   = useRouter()

  const sym       = view === 'uae' ? 'AED ' : '₹'
  const toDisplay = (amt: number, cur: string) => view === 'consolidated' ? amt * (cur === 'AED' ? FX : 1) : amt
  const inRange   = (d: string) => { const m = d?.slice(0,7) ?? ''; return m >= fromMonth && m <= toMonth }

  useEffect(() => {
    fetch('/api/fx-rate').then(r => r.json()).then(d => { setLiveRate(d.rate); setRateDate(d.date) }).catch(() => {})
  }, [])

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setShowAddMenu(false)
    }
    if (showAddMenu) document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [showAddMenu])

  useEffect(() => {
    const thisMonth = new Date().toISOString().slice(0,7)
    supabase.from('budgets').select('*').eq('month_year', thisMonth)
      .then(({ data }) => setBudgets(data ?? []))
  }, [])

  function openEdit(txn: any) {
    setEditTxn(txn)
    setEditFields({
      txn_date:  txn.txn_date,
      merchant:  txn.merchant,
      category:  txn.category,
      amount:    txn.amount,
      txn_type:  txn.txn_type,
    })
  }

  async function saveEdit() {
    if (!editTxn) return
    setEditSaving(true)
    await fetch('/api/transactions', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: editTxn.id, ...editFields, amount: Math.abs(Number(editFields.amount)) }),
    })
    setEditSaving(false)
    setEditTxn(null)
    router.refresh()
  }

  async function deleteTxn(id: string) {
    setDeletingId(id)
    await fetch(`/api/transactions?id=${id}`, { method: 'DELETE' })
    setDeletingId(null)
    router.refresh()
  }

  const filtered = useMemo(() => {
    setPage(1)
    return transactions.filter(t => {
      if (view === 'uae'   && t.currency !== 'AED') return false
      if (view === 'india' && t.currency !== 'INR') return false
      if (cat !== 'All'   && t.category !== cat)    return false
      if (accFilter !== 'All' && t.account_id !== accFilter) return false
      if (search && !t.merchant?.toLowerCase().includes(search.toLowerCase())) return false
      return true
    })
  }, [transactions, view, cat, accFilter, search])

  const filteredForMonth    = useMemo(() => filtered.filter(t => inRange(t.txn_date)), [filtered, fromMonth, toMonth])
  const expensesForMonth        = filteredForMonth.filter(t => t.txn_type === 'expense')
  const loansForMonth           = filteredForMonth.filter(t => t.txn_type === 'loan')
  const ccPaymentsForMonth      = expensesForMonth.filter(t => t.category === 'Credit Card Payment')
  const realExpensesForMonth    = expensesForMonth.filter(t => t.category !== 'Credit Card Payment' && t.category !== 'Investment')
  const investmentsForMonth     = expensesForMonth.filter(t => t.category === 'Investment')

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
  }, [filteredForMonth, view])

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
    { key: 'credit_card', label: 'Credit Card PDF',  desc: 'Parse ENBD, Amex, ADCB CC statements', icon: CreditCard, color: '#2563EB' },
    { key: 'statement',   label: 'Bank Statement',   desc: 'Parse Wio, Emirates NBD, ADCB PDFs',   icon: Upload,     color: '#059669' },
    { key: 'bill',        label: 'Bill / Image',     desc: 'Scan a receipt or bill photo',          icon: Image,      color: '#D97706' },
    { key: 'voice',       label: 'Voice Entry',      desc: 'Speak your transaction aloud',          icon: Mic,        color: '#7C3AED' },
    { key: 'manual',      label: 'Manual Entry',     desc: 'Type in a transaction manually',        icon: PenLine,    color: '#16A34A' },
  ]

  const paged = filteredForMonth.slice((page-1)*pageSize, page*pageSize)

  return (
    <div className="space-y-5 animate-fade-up">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold" style={{ color:'var(--text)' }}>Expenses</h1>
          <p className="text-[12px] mt-0.5" style={{ color:'var(--text3)' }}>
            {view === 'uae' ? 'UAE · AED' : view === 'india' ? 'India · INR' : 'Consolidated · INR'} · {rangeLabel}
            {liveRate && (
              <span className="ml-2 font-mono" style={{ color:'var(--gold)' }}>
                · Live: 1 AED = ₹{liveRate.toFixed(2)}{rateDate ? ` (${rateDate})` : ''}
              </span>
            )}
          </p>
        </div>

        <div className="flex flex-col items-end gap-2 flex-shrink-0">
          {/* Secondary links */}
          <div className="flex gap-2">
            <Link href="/dashboard/expenses/report"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold border transition-all"
              style={{ background:'var(--bg2)', borderColor:'var(--border)', color:'var(--text3)' }}>
              <BarChart2 size={12} /> Annual Report
            </Link>
            <Link href="/dashboard/budgets/learn"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold border transition-all"
              style={{ background:'var(--sage-bg)', borderColor:'var(--sage)', color:'var(--sage)' }}>
              <BookOpen size={12} /> Learn Categories
            </Link>
          </div>

          {/* Primary add dropdown */}
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setShowAddMenu(v => !v)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-bold text-white shadow-sm transition-all hover:opacity-90"
              style={{ background:'var(--sage)' }}>
              <Plus size={15} />
              Add Transaction
              <ChevronDown size={13} style={{ transition:'transform 0.2s', transform: showAddMenu ? 'rotate(180deg)' : 'rotate(0deg)' }} />
            </button>

            {showAddMenu && (
              <div className="absolute right-0 top-full mt-2 w-72 rounded-2xl z-50 overflow-hidden"
                style={{ background:'#fff', border:'1px solid var(--border)', boxShadow:'0 8px 40px rgba(0,0,0,0.15)' }}>
                <div className="px-4 py-2.5 border-b text-[10px] uppercase tracking-wider font-bold"
                  style={{ borderColor:'var(--border)', color:'var(--text3)', background:'var(--bg2)' }}>
                  How would you like to add?
                </div>
                {addButtons.map(({ key, label, desc, icon: Icon, color }) => (
                  <button key={key}
                    onClick={() => { setActiveModal(key); setShowAddMenu(false) }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors border-b last:border-b-0"
                    style={{ borderColor:'var(--border)' }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#F9FAFB')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ background: color+'15', color }}>
                      <Icon size={17} />
                    </div>
                    <div className="min-w-0">
                      <div className="text-[12px] font-semibold" style={{ color:'var(--text)' }}>{label}</div>
                      <div className="text-[10px] leading-snug mt-0.5" style={{ color:'var(--text3)' }}>{desc}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Unified Financial Overview — primary card + clickable secondary panels */}
      {(() => {
        const panels = [
          { key: 'cc',     label: 'CC Payments',   color: '#9333EA', total: rangeCCPayments,  txns: ccPaymentsForMonth,  showInrEq: false, showCatBadge: false },
          { key: 'loan',   label: 'Loan Payments', color: '#F59E0B', total: rangeLoanPayments, txns: loansForMonth,      showInrEq: false, showCatBadge: true  },
          { key: 'invest', label: 'Investments',   color: '#10B981', total: rangeInvestments,  txns: investmentsForMonth, showInrEq: false, showCatBadge: false },
        ].filter(p => p.txns.length > 0)

        const activePanel = panels.find(p => p.key === openPanel) ?? null

        return (
          <>
            <div className="flex gap-3 flex-wrap">
              {/* Primary: Total Expenses */}
              <div className="wl-card p-5 relative overflow-hidden min-w-[180px] flex-1"
                style={{ borderTop: '3px solid var(--rose)' }}>
                <div className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--text3)' }}>
                  Expenses · {rangeLabel}
                </div>
                <div className="text-[28px] font-bold font-mono leading-none" style={{ color: 'var(--expense)' }}>
                  {sym}{Math.round(rangeExpenses).toLocaleString('en-IN')}
                </div>
                <div className="text-[10px] mt-2" style={{ color: 'var(--text3)' }}>
                  {realExpensesForMonth.length} transaction{realExpensesForMonth.length !== 1 ? 's' : ''}
                </div>
              </div>

              {/* Secondary: clickable summary panels */}
              {panels.map(p => (
                <button key={p.key} onClick={() => setOpenPanel(p.key)}
                  className="wl-card wl-summary-chip p-4 text-left relative overflow-hidden min-w-[140px] flex-1"
                  style={{ borderTop: `3px solid ${p.color}` }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.boxShadow = `0 8px 28px ${p.color}28` }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.boxShadow = '' }}>
                  <div className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: p.color }}>
                    {p.label}
                  </div>
                  <div className="text-[22px] font-bold font-mono leading-none" style={{ color: 'var(--text)' }}>
                    {sym}{Math.round(p.total).toLocaleString('en-IN')}
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-[10px]" style={{ color: 'var(--text3)' }}>
                      {p.txns.length} txn{p.txns.length !== 1 ? 's' : ''}
                    </span>
                    <ArrowRight size={11} style={{ color: p.color, opacity: 0.65 }} />
                  </div>
                </button>
              ))}
            </div>

            {/* Transaction detail popup */}
            {activePanel && (
              <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 wl-popup-overlay"
                style={{ background: 'rgba(0,0,0,0.45)' }}
                onClick={() => setOpenPanel(null)}>
                <div className="wl-popup-panel rounded-2xl shadow-2xl w-full max-w-md flex flex-col overflow-hidden"
                  style={{ background: 'var(--card)', border: '1px solid var(--border)', borderTop: `3px solid ${activePanel.color}`, maxHeight: '80vh' }}
                  onClick={e => e.stopPropagation()}>
                  <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-wider mb-0.5" style={{ color: activePanel.color }}>
                        {activePanel.label}
                      </div>
                      <div className="text-[24px] font-bold font-mono" style={{ color: 'var(--text)' }}>
                        {sym}{Math.round(activePanel.total).toLocaleString('en-IN')}
                      </div>
                      <div className="text-[11px]" style={{ color: 'var(--text3)' }}>
                        {activePanel.txns.length} transaction{activePanel.txns.length !== 1 ? 's' : ''} · {rangeLabel}
                      </div>
                    </div>
                    <button onClick={() => setOpenPanel(null)}
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
          </>
        )
      })()}

      {/* Budget alert popover */}
      {alertCat && (() => {
        const bs = getBudgetStatus(alertCat)
        if (!bs) return null
        const color = budgetColor(bs.pct)
        return (
          <div className="wl-card p-4 relative" style={{ border: `2px solid ${color}` }}>
            <button onClick={() => setAlertCat(null)} className="absolute top-3 right-3" style={{ color:'var(--text3)' }}><X size={14}/></button>
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
            <div className="mt-2 h-2 rounded-full overflow-hidden" style={{ background:'var(--bg2)' }}>
              <div className="h-full rounded-full" style={{ width:`${Math.min(bs.pct,100)}%`, background: color }} />
            </div>
            <div className="text-[10px] mt-1 font-semibold" style={{ color }}>{Math.round(bs.pct)}% of budget used</div>
          </div>
        )
      })()}

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color:'var(--text3)' }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search merchant…"
            className="wl-input pl-8 w-48" style={{ background:'var(--bg2)' }}
            onFocus={e=>(e.target.style.borderColor='var(--sage)')}
            onBlur={e=>(e.target.style.borderColor='var(--border)')} />
        </div>
        <div className="flex gap-1 flex-wrap">
          {EXPENSE_CATS.map(c => {
            const bs = c !== 'All' ? getBudgetStatus(c) : null
            const isOver = bs && bs.pct >= 100
            return (
              <button key={c} onClick={() => { setCat(c); if (isOver) setAlertCat(c) }}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-semibold border transition-all"
                style={cat === c
                  ? { background: CAT_COLORS[c] ?? 'var(--sage)', borderColor:'transparent', color:'#fff' }
                  : { background:'transparent', borderColor:'var(--border)', color:'var(--text3)' }}>
                {isOver && <AlertTriangle size={10} style={{ color: cat === c ? '#fff' : 'var(--rose)' }} />}
                {c}
              </button>
            )
          })}
        </div>
        <select value={accFilter} onChange={e => setAccFilter(e.target.value)}
          className="wl-input" style={{ background:'var(--bg2)', width:'auto' }}>
          <option value="All">All Accounts</option>
          {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </div>

      {/* Transaction table with pagination */}
      <div className="wl-card overflow-hidden">
        {filteredForMonth.length === 0 ? (
          <div className="text-center py-16 text-[13px]" style={{ color:'var(--text3)' }}>
            No transactions for {rangeLabel}. Add one using the buttons above.
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="overflow-x-auto hidden md:block">
              <table className="w-full text-[12px]">
                <thead>
                  <tr style={{ borderBottom:'1px solid var(--border)', background:'var(--bg2)' }}>
                    {['Date','Merchant / Label','Category','Account','Amount','Source',''].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-[10px] uppercase tracking-wider font-bold" style={{ color:'var(--text3)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {paged.map((t, i) => {
                    const isTransfer = t.txn_type === 'transfer'
                    const isLoan     = t.txn_type === 'loan'
                    const catColor   = isTransfer
                      ? (t.category === 'Family Transfer' ? '#0EA5E9' : TRANSFER_SUBTYPE_COLORS[t.sub_category] ?? '#3B7DD8')
                      : (CAT_COLORS[t.category] ?? '#6B7280')
                    const bs = !isTransfer && !isLoan && t.category !== 'Credit Card Payment' ? getBudgetStatus(t.category) : null
                    const amtColor   = bs
                      ? budgetColor(bs.pct)
                      : t.category === 'Credit Card Payment' ? '#9333EA'
                      : isLoan ? (CAT_COLORS[t.category] ?? '#F59E0B')
                      : isTransfer ? catColor : 'var(--expense)'
                    const lSym  = t.currency === 'AED' ? 'AED ' : '₹'
                    const inrEq = isTransfer && t.currency === 'AED' && liveRate
                      ? `≈ ₹${Math.round(Number(t.amount)*liveRate).toLocaleString('en-IN')}` : null
                    return (
                      <tr key={i} style={{ borderBottom:'1px solid var(--border)' }} className="hover:bg-stone-50 transition-colors">
                        <td className="px-4 py-3 font-mono text-[11px]" style={{ color:'var(--text3)' }}>{t.txn_date}</td>
                        <td className="px-4 py-3">
                          <div className="font-semibold" style={{ color:'var(--text)' }}>{t.merchant}</div>
                          {isTransfer && t.description && (
                            <div className="flex items-center gap-1 text-[10px] mt-0.5" style={{ color:'var(--text3)' }}>
                              <ArrowRight size={9} />{t.description}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => { if (bs) setAlertCat(alertCat === t.category ? null : t.category) }}
                            className="flex items-center gap-1">
                            <span className="px-2 py-0.5 rounded text-[10px] font-semibold" style={{ background:catColor+'18', color:catColor }}>
                              {isTransfer ? (t.category === 'Family Transfer' ? 'Family Transfer' : t.sub_category || t.category || 'Transfer') : t.category}
                            </span>
                            {bs && bs.pct >= 100 && <AlertTriangle size={11} style={{ color:'var(--rose)' }} />}
                            {bs && bs.pct >= 75 && bs.pct < 100 && <AlertTriangle size={11} style={{ color:'var(--gold)' }} />}
                          </button>
                        </td>
                        <td className="px-4 py-3 text-[11px]" style={{ color:'var(--text3)' }}>
                          {accounts.find(a => a.id === t.account_id)?.name ?? '—'}
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-bold font-mono" style={{ color: amtColor }}>
                            {lSym}{Number(t.amount).toLocaleString('en-IN')}
                          </div>
                          {inrEq && <div className="text-[10px] font-mono mt-0.5" style={{ color:'var(--text3)' }}>{inrEq}</div>}
                        </td>
                        <td className="px-4 py-3">
                          <span className="px-2 py-0.5 rounded text-[10px] font-semibold"
                            style={t.source === 'statement_upload' ? { background:'var(--income-bg)', color:'var(--income)' }
                              : t.source === 'voice'       ? { background:'var(--sage-bg)', color:'var(--sage)' }
                              : t.source === 'bill_upload' ? { background:'#FEF3C7', color:'#D97706' }
                              : { background:'var(--bg2)', color:'var(--text3)' }}>
                            {t.source === 'statement_upload' ? 'Parsed' : t.source === 'voice' ? 'Voice' : t.source === 'bill_upload' ? 'Bill Scan' : 'Manual'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            <button onClick={() => openEdit(t)} title="Edit"
                              className="p-1 rounded hover:bg-blue-50 transition-colors"
                              style={{ color: 'var(--blue)' }}>
                              <Pencil size={12} />
                            </button>
                            <button onClick={() => deleteTxn(t.id)} title="Delete"
                              disabled={deletingId === t.id}
                              className="p-1 rounded hover:bg-red-50 transition-colors disabled:opacity-40"
                              style={{ color: 'var(--rose)' }}>
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile card list */}
            <div className="md:hidden divide-y" style={{ borderColor:'var(--border)' }}>
              {paged.map((t, i) => {
                const isTransfer = t.txn_type === 'transfer'
                const isLoan     = t.txn_type === 'loan'
                const catColor   = isTransfer
                  ? (t.category === 'Family Transfer' ? '#0EA5E9' : TRANSFER_SUBTYPE_COLORS[t.sub_category] ?? '#3B7DD8')
                  : (CAT_COLORS[t.category] ?? '#6B7280')
                const bs = !isTransfer && !isLoan && t.category !== 'Credit Card Payment' ? getBudgetStatus(t.category) : null
                const amtColor = bs ? budgetColor(bs.pct)
                  : t.category === 'Credit Card Payment' ? '#9333EA'
                  : isLoan ? (CAT_COLORS[t.category] ?? '#F59E0B')
                  : isTransfer ? catColor : 'var(--expense)'
                const lSym  = t.currency === 'AED' ? 'AED ' : '₹'
                const inrEq = isTransfer && t.currency === 'AED' && liveRate
                  ? `≈ ₹${Math.round(Number(t.amount)*liveRate).toLocaleString('en-IN')}` : null
                const label = isTransfer ? (t.category === 'Family Transfer' ? 'Family Transfer' : t.sub_category || t.category || 'Transfer') : t.category
                const account = accounts.find((a:any) => a.id === t.account_id)?.name ?? null
                return (
                  <div key={i} className="flex items-start gap-3 px-3 py-3 active:bg-stone-50">
                    <div className="flex-1 min-w-0" onClick={() => openEdit(t)}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-[13px] truncate" style={{ color:'var(--text)' }}>{t.merchant}</span>
                        <span className="font-bold font-mono text-[13px] flex-shrink-0" style={{ color:amtColor }}>{lSym}{Number(t.amount).toLocaleString('en-IN')}</span>
                      </div>
                      <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold" style={{ background:catColor+'18', color:catColor }}>{label}</span>
                        {bs && bs.pct >= 75 && <AlertTriangle size={10} style={{ color: bs.pct >= 100 ? 'var(--rose)' : 'var(--gold)' }} />}
                        <span className="text-[10px] font-mono" style={{ color:'var(--text3)' }}>{t.txn_date}</span>
                        {account && <span className="text-[10px] truncate" style={{ color:'var(--text3)' }}>· {account}</span>}
                      </div>
                      {inrEq && <div className="text-[10px] font-mono mt-0.5" style={{ color:'var(--text3)' }}>{inrEq}</div>}
                    </div>
                    <div className="flex flex-col gap-1.5 flex-shrink-0">
                      <button onClick={() => openEdit(t)} className="p-1.5 rounded-lg" style={{ color:'var(--blue)', background:'var(--bg2)' }} aria-label="Edit"><Pencil size={13} /></button>
                      <button onClick={() => deleteTxn(t.id)} disabled={deletingId === t.id} className="p-1.5 rounded-lg disabled:opacity-40" style={{ color:'var(--rose)', background:'var(--bg2)' }} aria-label="Delete"><Trash2 size={13} /></button>
                    </div>
                  </div>
                )
              })}
            </div>
            <Pagination total={filteredForMonth.length} page={page} pageSize={pageSize}
              onPage={setPage} onPageSize={s => { setPageSize(s); setPage(1) }} />
          </>
        )}
      </div>

      {activeModal === 'manual'      && <AddTransactionModal onClose={() => setActiveModal('none')} />}
      {activeModal === 'statement'   && <BankStatementUploadModal onClose={() => setActiveModal('none')} />}
      {activeModal === 'bill'        && <BillImageUploadModal onClose={() => setActiveModal('none')} defaultType="expense" />}
      {activeModal === 'voice'       && <TransactionVoiceModal onClose={() => setActiveModal('none')} defaultType="expense" />}
      {activeModal === 'credit_card' && <CreditCardUploadModal onClose={() => setActiveModal('none')} />}

      {/* Edit transaction modal */}
      {editTxn && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="rounded-2xl w-full max-w-md"
            style={{ background:'#fff', border:'1px solid var(--border)', boxShadow:'0 8px 40px rgba(0,0,0,0.15)' }}>
            <div className="flex justify-between items-center px-5 py-4 border-b" style={{ borderColor:'var(--border)' }}>
              <div className="text-[14px] font-bold" style={{ color:'var(--text)' }}>Edit Transaction</div>
              <button onClick={() => setEditTxn(null)} style={{ color:'var(--text3)' }}><X size={16} /></button>
            </div>
            <div className="p-5 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] uppercase tracking-wider font-semibold mb-1" style={{ color:'var(--text3)' }}>Date</label>
                  <input type="date" value={editFields.txn_date}
                    onChange={e => setEditFields((f: any) => ({ ...f, txn_date: e.target.value }))}
                    className="wl-input w-full text-[12px]" style={{ background:'var(--bg2)', border:'1px solid var(--border)', color:'var(--text)' }} />
                </div>
                <div>
                  <label className="block text-[10px] uppercase tracking-wider font-semibold mb-1" style={{ color:'var(--text3)' }}>Amount</label>
                  <input type="number" value={editFields.amount} min="0" step="0.01"
                    onChange={e => setEditFields((f: any) => ({ ...f, amount: e.target.value }))}
                    className="wl-input w-full text-[12px]" style={{ background:'var(--bg2)', border:'1px solid var(--border)', color:'var(--text)' }} />
                </div>
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-wider font-semibold mb-1" style={{ color:'var(--text3)' }}>Merchant</label>
                <input type="text" value={editFields.merchant}
                  onChange={e => setEditFields((f: any) => ({ ...f, merchant: e.target.value }))}
                  className="wl-input w-full text-[12px]" style={{ background:'var(--bg2)', border:'1px solid var(--border)', color:'var(--text)' }} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] uppercase tracking-wider font-semibold mb-1" style={{ color:'var(--text3)' }}>Category</label>
                  <select value={editFields.category}
                    onChange={e => {
                      const cat = e.target.value
                      const autoType =
                        ['Transfer','Family Transfer','International Transfer','NRE Received','NRE to NRO','NRO to Family','Self Transfer','Loan Received','Loan Taken'].includes(cat) ? 'transfer'
                        : ['Loan on Card','EMI/Loan'].includes(cat) ? 'loan'
                        : ['Salary','Interest','Dividend','Rental','Bonus','Tax Refund','Freelance','Gift','NRI Transfer'].includes(cat) ? 'income'
                        : ['Food','Shopping','Utilities','Transport','Health','Entertainment','Travel','Education','Subscription'].includes(cat) ? 'expense'
                        : editFields.txn_type
                      setEditFields((f: any) => ({ ...f, category: cat, txn_type: autoType }))
                    }}
                    className="wl-input w-full text-[12px]" style={{ background:'var(--bg2)', border:'1px solid var(--border)', color:'var(--text)' }}>
                    <optgroup label="Spending">
                      {['Food','Shopping','Utilities','Transport','Health','Entertainment','Travel','Education','Subscription'].map(c => <option key={c}>{c}</option>)}
                    </optgroup>
                    <optgroup label="Income">
                      {['Salary','Interest','Dividend','Rental','Bonus','Tax Refund','Freelance','Gift','NRI Transfer'].map(c => <option key={c}>{c}</option>)}
                    </optgroup>
                    <optgroup label="Transfers">
                      {['Transfer','International Transfer','NRE Received','NRE to NRO','NRO to Family','Self Transfer','Family Transfer','Loan Received'].map(c => <option key={c}>{c}</option>)}
                    </optgroup>
                    <optgroup label="Payments">
                      <option>Credit Card Payment</option>
                    </optgroup>
                    <optgroup label="Loans">
                      {['Loan on Card','EMI/Loan','Loan Taken'].map(c => <option key={c}>{c}</option>)}
                    </optgroup>
                    <optgroup label="Other">
                      {['Investment','Refund','Other'].map(c => <option key={c}>{c}</option>)}
                    </optgroup>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] uppercase tracking-wider font-semibold mb-1" style={{ color:'var(--text3)' }}>Type</label>
                  <select value={editFields.txn_type}
                    onChange={e => setEditFields((f: any) => ({ ...f, txn_type: e.target.value }))}
                    className="wl-input w-full text-[12px]" style={{ background:'var(--bg2)', border:'1px solid var(--border)', color:'var(--text)' }}>
                    <option value="expense">Expense</option>
                    <option value="income">Income</option>
                    <option value="transfer">Transfer</option>
                    <option value="loan">Loan</option>
                  </select>
                  <div className="mt-1 text-[9px] leading-tight" style={{ color:'var(--text3)' }}>
                    Transfer = UAE→India, NRO→NRE · Loan = LOC/EMI
                  </div>
                </div>
              </div>
              <div className="flex gap-3 pt-1">
                <button onClick={() => setEditTxn(null)}
                  className="flex-1 py-2.5 rounded-lg border text-[12px] font-semibold"
                  style={{ borderColor:'var(--border)', color:'var(--text3)', background:'var(--bg2)' }}>
                  Cancel
                </button>
                <button onClick={saveEdit} disabled={editSaving}
                  className="flex-1 py-2.5 rounded-lg text-white text-[12px] font-bold flex items-center justify-center gap-2 disabled:opacity-40"
                  style={{ background:'var(--blue)' }}>
                  {editSaving ? <><span className="animate-spin">⏳</span> Saving…</> : <><Check size={13}/> Save Changes</>}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
