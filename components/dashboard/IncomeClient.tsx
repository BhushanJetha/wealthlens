'use client'
import { useState, useMemo, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useViewStore } from '@/store/viewStore'
import MetricCard from '@/components/dashboard/MetricCard'
import AddTransactionModal from '@/components/forms/AddTransactionModal'
import BankStatementUploadModal from '@/components/forms/BankStatementUploadModal'
import BillImageUploadModal from '@/components/forms/BillImageUploadModal'
import TransactionVoiceModal from '@/components/forms/TransactionVoiceModal'

import Pagination from '@/components/dashboard/Pagination'
import { Search, PenLine, BarChart2, Plus, Pencil, Trash2, X, Check, Upload, Image, Mic, ChevronDown } from 'lucide-react'
import Link from 'next/link'

const INCOME_CATS = [
  'All', 'Salary', 'Dividend', 'Rental', 'Gift', 'Bonus', 'Tax Refund', 'Interest', 'Freelance', 'NRI Transfer', 'Other'
]

const CAT_COLORS: Record<string,string> = {
  Salary:         '#16A34A',
  Dividend:       '#2563EB',
  Rental:         '#7C3AED',
  Gift:           '#E11D48',
  Bonus:          '#D97706',
  'Tax Refund':   '#059669',
  Interest:       '#0284C7',
  Freelance:      '#EA580C',
  'NRI Transfer': '#0EA5E9',
  Other:          '#6B7280',
}
type Modal = 'none' | 'manual' | 'statement' | 'bill' | 'voice'

export default function IncomeClient({ transactions, accounts, transfers = [] }: { transactions: any[]; accounts: any[]; transfers?: any[] }) {
  const { view, fromMonth, toMonth, fxRate: FX } = useViewStore()
  const [search, setSearch] = useState('')
  const [cat, setCat]       = useState('All')
  const [accFilter, setAccFilter] = useState('All')
  const [activeModal, setActiveModal] = useState<Modal>('none')
  const [page,        setPage]        = useState(1)
  const [pageSize,    setPageSize]    = useState(20)
  const [editTxn,     setEditTxn]     = useState<any | null>(null)
  const [editFields,  setEditFields]  = useState<any>({})
  const [editSaving,  setEditSaving]  = useState(false)
  const [deletingId,  setDeletingId]  = useState<string | null>(null)
  const [showAddMenu, setShowAddMenu] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const router = useRouter()

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setShowAddMenu(false)
    }
    if (showAddMenu) document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [showAddMenu])

  const addButtons: { key: Modal; label: string; desc: string; icon: React.ElementType; color: string }[] = [
    { key: 'statement', label: 'Bank Statement',  desc: 'Parse a bank statement PDF for credits', icon: Upload,  color: '#059669' },
    { key: 'bill',      label: 'Receipt / Image',  desc: 'Scan a salary slip or receipt photo',    icon: Image,   color: '#D97706' },
    { key: 'voice',     label: 'Voice Entry',      desc: 'Speak your income aloud',                 icon: Mic,     color: '#7C3AED' },
    { key: 'manual',    label: 'Manual Entry',     desc: 'Type in an income entry manually',        icon: PenLine, color: '#16A34A' },
  ]

  function openEdit(t: any) {
    setEditTxn(t)
    setEditFields({ txn_date: t.txn_date, merchant: t.merchant, category: t.category, amount: t.amount, txn_type: t.txn_type ?? 'income' })
  }
  async function saveEdit() {
    if (!editTxn) return
    setEditSaving(true)
    await fetch('/api/transactions', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: editTxn.id, ...editFields, amount: Math.abs(Number(editFields.amount)) }),
    })
    setEditSaving(false); setEditTxn(null); router.refresh()
  }
  async function deleteTxn(id: string) {
    if (!confirm('Delete this income entry?')) return
    setDeletingId(id)
    await fetch(`/api/transactions?id=${id}`, { method: 'DELETE' })
    setDeletingId(null); router.refresh()
  }

  const sym = view === 'uae' ? 'AED ' : '₹'
  const toDisplay = (amt: number, cur: string) => view === 'consolidated' ? amt * (cur === 'AED' ? FX : 1) : amt
  const inRange = (d: string) => { const m = d?.slice(0,7) ?? ''; return m >= fromMonth && m <= toMonth }

  const filtered = useMemo(() => { setPage(1); return transactions.filter(t => {
    if (view === 'uae'   && t.currency !== 'AED') return false
    if (view === 'india' && t.currency !== 'INR') return false
    if (cat !== 'All'   && t.category !== cat)    return false
    if (accFilter !== 'All' && t.account_id !== accFilter) return false
    if (search && !t.merchant?.toLowerCase().includes(search.toLowerCase())) return false
    return true
  }) }, [transactions, view, cat, accFilter, search])

  const filteredForMonth = filtered.filter(t => inRange(t.txn_date))
  const total = filtered.reduce((a, t) => a + toDisplay(Number(t.amount), t.currency), 0)
  const rangeTotal = filteredForMonth.reduce((a, t) => a + toDisplay(Number(t.amount), t.currency), 0)

  const rangeLabel = fromMonth === toMonth
    ? new Date(fromMonth + '-01').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
    : `${new Date(fromMonth + '-01').toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })} – ${new Date(toMonth + '-01').toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}`

  return (
    <div className="space-y-5 animate-fade-up">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold" style={{ color:'var(--text)' }}>Income</h1>
          <p className="text-[12px] mt-0.5" style={{ color:'var(--text3)' }}>
            {view === 'uae' ? 'UAE · AED' : view === 'india' ? 'India · INR' : 'Consolidated · INR'} · {rangeLabel}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/dashboard/income/report"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold border transition-all"
            style={{ background: 'var(--bg2)', borderColor: 'var(--border)', color: 'var(--text3)' }}>
            <BarChart2 size={12} /> Annual Report
          </Link>
          <div className="relative" ref={menuRef}>
            <button onClick={() => setShowAddMenu(v => !v)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-[13px] font-bold text-white shadow-sm hover:opacity-90 transition-all"
              style={{ background: 'var(--income)' }}>
              <Plus size={14} /> Add Income
              <ChevronDown size={13} style={{ transition: 'transform 0.2s', transform: showAddMenu ? 'rotate(180deg)' : 'rotate(0deg)' }} />
            </button>
            {showAddMenu && (
              <div className="absolute right-0 top-full mt-2 w-72 rounded-2xl z-50 overflow-hidden"
                style={{ background: '#fff', border: '1px solid var(--border)', boxShadow: '0 8px 40px rgba(0,0,0,0.15)' }}>
                <div className="px-4 py-2.5 border-b text-[10px] uppercase tracking-wider font-bold"
                  style={{ borderColor: 'var(--border)', color: 'var(--text3)', background: 'var(--bg2)' }}>
                  How would you like to add?
                </div>
                {addButtons.map(({ key, label, desc, icon: Icon, color }) => (
                  <button key={key}
                    onClick={() => { setActiveModal(key); setShowAddMenu(false) }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors border-b last:border-b-0"
                    style={{ borderColor: 'var(--border)' }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#F9FAFB')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: color + '15', color }}>
                      <Icon size={17} />
                    </div>
                    <div className="min-w-0">
                      <div className="text-[12px] font-semibold" style={{ color: 'var(--text)' }}>{label}</div>
                      <div className="text-[10px] leading-snug mt-0.5" style={{ color: 'var(--text3)' }}>{desc}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard label={rangeLabel}    value={`${sym}${Math.round(rangeTotal).toLocaleString('en-IN')}`} accent="income" />
        <MetricCard label="Total Filtered"   value={`${sym}${Math.round(total).toLocaleString('en-IN')}`}              accent="sage" />
        <MetricCard label="Transactions"     value={`${filteredForMonth.length}`}                                       accent="blue" />
        <MetricCard label="Avg per Entry"    value={`${sym}${filteredForMonth.length > 0 ? Math.round(rangeTotal/filteredForMonth.length).toLocaleString('en-IN') : 0}`} accent="gold" />
      </div>

      {/* Income source breakdown */}
      <div className="wl-card p-4">
        <div className="text-[11px] font-bold uppercase tracking-wider mb-3" style={{ color:'var(--text3)' }}>Income Sources</div>
        <div className="flex flex-wrap gap-2">
          {INCOME_CATS.slice(1).map(src => {
            const total = filtered.filter(t => inRange(t.txn_date) && t.category === src)
              .reduce((a, t) => a + toDisplay(Number(t.amount), t.currency), 0)
            const col = CAT_COLORS[src] ?? '#6B7280'
            return (
              <div key={src} className="flex flex-col items-center justify-center p-3 rounded-xl min-w-[100px] border"
                style={{ background: col + '10', borderColor: col + '30' }}>
                <div className="text-[11px] font-semibold" style={{ color: col }}>{src}</div>
                <div className="text-[13px] font-bold font-mono mt-1" style={{ color: 'var(--text)' }}>
                  {total > 0 ? `${sym}${Math.round(total).toLocaleString('en-IN')}` : '—'}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color:'var(--text3)' }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search source…"
            className="wl-input pl-8 w-48" style={{ background:'var(--bg2)' }}
            onFocus={e=>(e.target.style.borderColor='var(--sage)')}
            onBlur={e=>(e.target.style.borderColor='var(--border)')} />
        </div>
        <div className="flex gap-1 flex-wrap">
          {INCOME_CATS.map(c => (
            <button key={c} onClick={() => setCat(c)}
              className="px-3 py-1.5 rounded-lg text-[11px] font-semibold border transition-all"
              style={cat === c
                ? { background: CAT_COLORS[c] ?? 'var(--income)', borderColor:'transparent', color:'#fff' }
                : { background:'transparent', borderColor:'var(--border)', color:'var(--text3)' }}>
              {c}
            </button>
          ))}
        </div>
        <select value={accFilter} onChange={e => setAccFilter(e.target.value)}
          className="wl-input" style={{ background:'var(--bg2)', width:'auto' }}>
          <option value="All">All Accounts</option>
          {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </div>

      {/* Table with pagination */}
      <div className="wl-card overflow-hidden">
        {filteredForMonth.length === 0 ? (
          <div className="text-center py-16 text-[13px]" style={{ color:'var(--text3)' }}>
            No income for {rangeLabel}. Add an entry using the buttons above.
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="overflow-x-auto hidden md:block">
              <table className="w-full text-[12px]">
                <thead>
                  <tr style={{ borderBottom:'1px solid var(--border)', background:'var(--bg2)' }}>
                    {['Date','Source','Category','Account','Amount','Entry','Actions'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-[10px] uppercase tracking-wider font-bold" style={{ color:'var(--text3)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredForMonth.slice((page-1)*pageSize, page*pageSize).map((t, i) => {
                    const c = CAT_COLORS[t.category] ?? '#16A34A'
                    return (
                      <tr key={i} style={{ borderBottom:'1px solid var(--border)' }} className="hover:bg-stone-50 transition-colors">
                        <td className="px-4 py-3 font-mono text-[11px]" style={{ color:'var(--text3)' }}>{t.txn_date}</td>
                        <td className="px-4 py-3 font-semibold" style={{ color:'var(--text)' }}>{t.merchant}</td>
                        <td className="px-4 py-3">
                          <span className="px-2 py-0.5 rounded text-[10px] font-semibold" style={{ background:c+'18', color:c }}>
                            {t.category}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-[11px]" style={{ color:'var(--text3)' }}>{accounts.find(a => a.id === t.account_id)?.name ?? '—'}</td>
                        <td className="px-4 py-3 font-bold font-mono" style={{ color:'var(--income)' }}>
                          +{t.currency === 'AED' ? 'AED ' : '₹'}{Number(t.amount).toLocaleString('en-IN')}
                        </td>
                        <td className="px-4 py-3">
                          <span className="px-2 py-0.5 rounded text-[10px] font-semibold"
                            style={t.source === 'statement_upload' ? { background:'var(--income-bg)', color:'var(--income)' }
                              : t.source === 'voice' ? { background:'var(--sage-bg)', color:'var(--sage)' }
                              : t.source === 'bill_upload' ? { background:'#FEF3C7', color:'#D97706' }
                              : { background:'var(--bg2)', color:'var(--text3)' }}>
                            {t.source === 'statement_upload' ? 'AI Parsed'
                              : t.source === 'voice' ? 'Voice'
                              : t.source === 'bill_upload' ? 'Receipt Scan'
                              : 'Manual'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            <button onClick={() => openEdit(t)} title="Edit"
                              className="p-1 rounded hover:bg-blue-50 transition-colors" style={{ color: 'var(--blue)' }}>
                              <Pencil size={12} />
                            </button>
                            <button onClick={() => deleteTxn(t.id)} title="Delete" disabled={deletingId === t.id}
                              className="p-1 rounded hover:bg-red-50 transition-colors disabled:opacity-40" style={{ color: 'var(--rose)' }}>
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
              {filteredForMonth.slice((page-1)*pageSize, page*pageSize).map((t, i) => {
                const c = CAT_COLORS[t.category] ?? '#16A34A'
                const account = accounts.find((a:any) => a.id === t.account_id)?.name ?? null
                return (
                  <div key={i} className="flex items-start gap-3 px-3 py-3 active:bg-stone-50">
                    <div className="flex-1 min-w-0" onClick={() => openEdit(t)}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-[13px] truncate" style={{ color:'var(--text)' }}>{t.merchant}</span>
                        <span className="font-bold font-mono text-[13px] flex-shrink-0" style={{ color:'var(--income)' }}>+{t.currency === 'AED' ? 'AED ' : '₹'}{Number(t.amount).toLocaleString('en-IN')}</span>
                      </div>
                      <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold" style={{ background:c+'18', color:c }}>{t.category}</span>
                        <span className="text-[10px] font-mono" style={{ color:'var(--text3)' }}>{t.txn_date}</span>
                        {account && <span className="text-[10px] truncate" style={{ color:'var(--text3)' }}>· {account}</span>}
                      </div>
                    </div>
                    <div className="flex flex-col gap-1.5 flex-shrink-0">
                      <button onClick={() => openEdit(t)} className="p-1.5 rounded-lg" style={{ color:'var(--blue)', background:'var(--bg2)' }} aria-label="Edit"><Pencil size={13} /></button>
                      <button onClick={() => deleteTxn(t.id)} disabled={deletingId === t.id} className="p-1.5 rounded-lg disabled:opacity-40" style={{ color:'var(--rose)', background:'var(--bg2)' }} aria-label="Delete"><Trash2 size={13} /></button>
                    </div>
                  </div>
                )
              })}
            </div>
            <Pagination
              total={filteredForMonth.length}
              page={page}
              pageSize={pageSize}
              onPage={setPage}
              onPageSize={s => { setPageSize(s); setPage(1) }}
            />
          </>
        )}
      </div>

      {/* UAE → India Remittances (NRI view) */}
      {(() => {
        const remittances = transfers.filter(t => inRange(t.txn_date))
        if (remittances.length === 0 || view === 'uae') return null
        const totalINR = remittances.reduce((a, t) =>
          a + (t.currency === 'AED' ? Number(t.amount) * FX : Number(t.amount)), 0)
        const totalAED = remittances
          .filter(t => t.currency === 'AED')
          .reduce((a, t) => a + Number(t.amount), 0)
        return (
          <div className="wl-card overflow-hidden">
            <div className="px-4 py-3 border-b flex items-center justify-between"
              style={{ borderColor: 'var(--border)', background: '#EFF6FF' }}>
              <div>
                <div className="text-[13px] font-bold flex items-center gap-1.5" style={{ color: '#1D4ED8' }}>
                  ✈️ UAE → India Remittances
                </div>
                <div className="text-[10px] mt-0.5" style={{ color: '#6B86C5' }}>
                  International transfers sent to India · {rangeLabel}
                </div>
              </div>
              <div className="text-right">
                <div className="text-[14px] font-black font-mono" style={{ color: '#1D4ED8' }}>
                  ₹{Math.round(totalINR).toLocaleString('en-IN')}
                </div>
                {totalAED > 0 && (
                  <div className="text-[10px] font-mono" style={{ color: '#6B86C5' }}>
                    AED {totalAED.toLocaleString('en-IN')} sent
                  </div>
                )}
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[11px]">
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg2)' }}>
                    {['Date','Label','Amount','INR Equiv','Recipient'].map(h => (
                      <th key={h} className="px-4 py-2.5 text-left text-[9px] uppercase tracking-wider font-bold"
                        style={{ color: 'var(--text3)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {remittances.map((t, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}
                      className="hover:bg-blue-50 transition-colors">
                      <td className="px-4 py-2.5 font-mono text-[10px]" style={{ color: 'var(--text3)' }}>{t.txn_date}</td>
                      <td className="px-4 py-2.5 font-semibold" style={{ color: 'var(--text)' }}>{t.merchant}</td>
                      <td className="px-4 py-2.5 font-mono font-bold" style={{ color: '#2563EB' }}>
                        {t.currency === 'AED'
                          ? `AED ${Number(t.amount).toLocaleString('en-IN')}`
                          : `₹${Number(t.amount).toLocaleString('en-IN')}`}
                      </td>
                      <td className="px-4 py-2.5 font-mono font-semibold" style={{ color: 'var(--income)' }}>
                        {t.currency === 'AED'
                          ? `₹${Math.round(Number(t.amount) * FX).toLocaleString('en-IN')}`
                          : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-[10px]" style={{ color: 'var(--text3)' }}>
                        {t.description || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      })()}

      {activeModal === 'manual'    && <AddTransactionModal onClose={() => setActiveModal('none')} />}
      {activeModal === 'statement' && <BankStatementUploadModal onClose={() => setActiveModal('none')} />}
      {activeModal === 'bill'      && <BillImageUploadModal onClose={() => setActiveModal('none')} defaultType="income" />}
      {activeModal === 'voice'     && <TransactionVoiceModal onClose={() => setActiveModal('none')} defaultType="income" />}

      {/* Edit income modal */}
      {editTxn && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="rounded-2xl w-full max-w-md" style={{ background:'#fff', border:'1px solid var(--border)', boxShadow:'0 8px 40px rgba(0,0,0,0.15)' }}>
            <div className="flex justify-between items-center px-5 py-4 border-b" style={{ borderColor:'var(--border)' }}>
              <div className="text-[14px] font-bold" style={{ color:'var(--text)' }}>Edit Income</div>
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
                <label className="block text-[10px] uppercase tracking-wider font-semibold mb-1" style={{ color:'var(--text3)' }}>Source</label>
                <input type="text" value={editFields.merchant}
                  onChange={e => setEditFields((f: any) => ({ ...f, merchant: e.target.value }))}
                  className="wl-input w-full text-[12px]" style={{ background:'var(--bg2)', border:'1px solid var(--border)', color:'var(--text)' }} />
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-wider font-semibold mb-1" style={{ color:'var(--text3)' }}>Category</label>
                <select value={editFields.category}
                  onChange={e => setEditFields((f: any) => ({ ...f, category: e.target.value }))}
                  className="wl-input w-full text-[12px]" style={{ background:'var(--bg2)', border:'1px solid var(--border)', color:'var(--text)' }}>
                  {INCOME_CATS.slice(1).map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div className="flex gap-3 pt-1">
                <button onClick={() => setEditTxn(null)}
                  className="flex-1 py-2.5 rounded-lg border text-[12px] font-semibold"
                  style={{ borderColor:'var(--border)', color:'var(--text3)', background:'var(--bg2)' }}>Cancel</button>
                <button onClick={saveEdit} disabled={editSaving}
                  className="flex-1 py-2.5 rounded-lg text-white text-[12px] font-bold flex items-center justify-center gap-2 disabled:opacity-40"
                  style={{ background:'var(--income)' }}>
                  {editSaving ? 'Saving…' : <><Check size={13}/> Save Changes</>}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
