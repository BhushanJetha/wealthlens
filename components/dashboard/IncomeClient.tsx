'use client'
import { useState, useMemo } from 'react'
import { useViewStore } from '@/store/viewStore'
import MetricCard from '@/components/dashboard/MetricCard'
import AddTransactionModal from '@/components/forms/AddTransactionModal'
import BankStatementUploadModal from '@/components/forms/BankStatementUploadModal'
import BillImageUploadModal from '@/components/forms/BillImageUploadModal'
import TransactionVoiceModal from '@/components/forms/TransactionVoiceModal'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'
import { Search, Upload, Image, Mic, PenLine, BarChart2 } from 'lucide-react'
import Link from 'next/link'

const INCOME_CATS = [
  'All', 'Salary', 'Dividend', 'Rental', 'Gift', 'Bonus', 'Tax Refund', 'Interest', 'Freelance', 'Other'
]

const CAT_COLORS: Record<string,string> = {
  Salary:      '#16A34A',
  Dividend:    '#2563EB',
  Rental:      '#7C3AED',
  Gift:        '#E11D48',
  Bonus:       '#D97706',
  'Tax Refund':'#059669',
  Interest:    '#0284C7',
  Freelance:   '#EA580C',
  Other:       '#6B7280',
}

const FX = 22.80
type Modal = 'none' | 'manual' | 'statement' | 'receipt' | 'voice'

export default function IncomeClient({ transactions, accounts }: { transactions: any[]; accounts: any[] }) {
  const { view, fromMonth, toMonth } = useViewStore()
  const [search, setSearch] = useState('')
  const [cat, setCat]       = useState('All')
  const [accFilter, setAccFilter] = useState('All')
  const [activeModal, setActiveModal] = useState<Modal>('none')

  const sym = view === 'uae' ? 'AED ' : '₹'
  const toDisplay = (amt: number, cur: string) => view === 'consolidated' ? amt * (cur === 'AED' ? FX : 1) : amt
  const inRange = (d: string) => { const m = d?.slice(0,7) ?? ''; return m >= fromMonth && m <= toMonth }

  const filtered = useMemo(() => transactions.filter(t => {
    if (view === 'uae'   && t.currency !== 'AED') return false
    if (view === 'india' && t.currency !== 'INR') return false
    if (cat !== 'All'   && t.category !== cat)    return false
    if (accFilter !== 'All' && t.account_id !== accFilter) return false
    if (search && !t.merchant?.toLowerCase().includes(search.toLowerCase())) return false
    return true
  }), [transactions, view, cat, accFilter, search])

  const filteredForMonth = filtered.filter(t => inRange(t.txn_date))
  const total = filtered.reduce((a, t) => a + toDisplay(Number(t.amount), t.currency), 0)
  const rangeTotal = filteredForMonth.reduce((a, t) => a + toDisplay(Number(t.amount), t.currency), 0)

  const catData = useMemo(() => {
    const cats: Record<string,number> = {}
    filteredForMonth.forEach(t => { cats[t.category] = (cats[t.category]??0) + toDisplay(Number(t.amount), t.currency) })
    return Object.entries(cats).map(([name, value]) => ({ name, value: Math.round(value) })).sort((a,b)=>b.value-a.value)
  }, [filtered, view, fromMonth, toMonth])

  const monthlyData = useMemo(() => {
    const months: Record<string,number> = {}
    for (let i = 5; i >= 0; i--) {
      const d = new Date(); d.setMonth(d.getMonth()-i)
      months[d.toISOString().slice(0,7)] = 0
    }
    filtered.forEach(t => {
      const m = t.txn_date?.slice(0,7)
      if (m && months[m] !== undefined) months[m] += toDisplay(Number(t.amount), t.currency)
    })
    const labels = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
    return Object.entries(months).map(([m, v]) => ({ month: labels[Number(m.slice(5))-1], value: Math.round(v) }))
  }, [filtered, view])

  const PIE_COLORS = Object.values(CAT_COLORS)

  const addButtons = [
    { key: 'statement' as Modal, label: 'Bank Statement', icon: Upload,  color: 'var(--blue)',    bg: 'var(--blue-bg)' },
    { key: 'receipt'   as Modal, label: 'Upload Receipt', icon: Image,   color: 'var(--gold)',    bg: 'var(--sage-bg)' },
    { key: 'voice'     as Modal, label: 'Voice Entry',    icon: Mic,     color: 'var(--income)',  bg: 'var(--income-bg)' },
    { key: 'manual'    as Modal, label: 'Manual Entry',   icon: PenLine, color: 'var(--sage)',    bg: 'var(--sage-bg)' },
  ]

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
        {/* Actions */}
        <div className="flex gap-2 flex-wrap justify-end items-center">
          <Link href="/dashboard/income/report"
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-semibold border transition-all"
            style={{ background: 'var(--bg2)', borderColor: 'var(--border)', color: 'var(--text3)' }}>
            <BarChart2 size={13} /> Annual Report
          </Link>
          {addButtons.map(({ key, label, icon: Icon, color, bg }) => (
            <button key={key} onClick={() => setActiveModal(key)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-semibold border transition-all"
              style={{ background: bg, borderColor: color + '40', color }}>
              <Icon size={13} />
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard label={rangeLabel}    value={`${sym}${Math.round(rangeTotal).toLocaleString('en-IN')}`} accent="income" />
        <MetricCard label="Total Filtered"   value={`${sym}${Math.round(total).toLocaleString('en-IN')}`}              accent="sage" />
        <MetricCard label="Transactions"     value={`${filteredForMonth.length}`}                                       accent="blue" />
        <MetricCard label="Avg per Entry"    value={`${sym}${filteredForMonth.length > 0 ? Math.round(rangeTotal/filteredForMonth.length).toLocaleString('en-IN') : 0}`} accent="gold" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* By source donut */}
        <div className="wl-card p-4">
          <div className="text-[11px] font-bold uppercase tracking-wider mb-3" style={{ color:'var(--text3)' }}>By Source · {rangeLabel}</div>
          {catData.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={catData} dataKey="value" cx="50%" cy="50%" innerRadius={48} outerRadius={78} paddingAngle={2}>
                    {catData.map((_,i) => <Cell key={i} fill={PIE_COLORS[i%PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={{ background:'#fff', border:'1px solid var(--border)', borderRadius:8, fontSize:11 }}
                    formatter={(v:any) => [`${sym}${Number(v).toLocaleString('en-IN')}`, '']} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-1.5 mt-1">
                {catData.slice(0,5).map((d,i) => (
                  <div key={i} className="flex items-center justify-between text-[11px]">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-sm" style={{ background: PIE_COLORS[i%PIE_COLORS.length] }} />
                      <span style={{ color:'var(--text2)' }}>{d.name}</span>
                    </div>
                    <span className="font-mono font-semibold" style={{ color:'var(--income)' }}>{sym}{d.value.toLocaleString('en-IN')}</span>
                  </div>
                ))}
              </div>
            </>
          ) : <div className="text-center py-12 text-[13px]" style={{ color:'var(--text3)' }}>No income for {rangeLabel}</div>}
        </div>

        {/* 6-month trend */}
        <div className="lg:col-span-2 wl-card p-4">
          <div className="text-[11px] font-bold uppercase tracking-wider mb-3" style={{ color:'var(--text3)' }}>Month-over-Month Income</div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={monthlyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="month" tick={{ fill:'var(--text3)', fontSize:10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill:'var(--text3)', fontSize:10 }} axisLine={false} tickLine={false}
                tickFormatter={v => v >= 100000 ? `${(v/100000).toFixed(0)}L` : v >= 1000 ? `${(v/1000).toFixed(0)}K` : String(v)} />
              <Tooltip contentStyle={{ background:'#fff', border:'1px solid var(--border)', borderRadius:8, fontSize:11 }}
                formatter={(v:any) => [`${sym}${Number(v).toLocaleString('en-IN')}`, 'Income']}
                labelStyle={{ color:'var(--text)' }} />
              <Bar dataKey="value" fill="var(--income)" radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
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

      {/* Table */}
      <div className="wl-card overflow-hidden">
        {filteredForMonth.length === 0
          ? <div className="text-center py-16 text-[13px]" style={{ color:'var(--text3)' }}>
              No income for {rangeLabel}. Add an entry using the buttons above.
            </div>
          : (
            <div className="overflow-x-auto">
              <table className="w-full text-[12px]">
                <thead>
                  <tr style={{ borderBottom:'1px solid var(--border)', background:'var(--bg2)' }}>
                    {['Date','Source','Category','Account','Amount','Entry'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-[10px] uppercase tracking-wider font-bold" style={{ color:'var(--text3)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredForMonth.slice(0, 100).map((t, i) => {
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
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )
        }
      </div>

      {/* Modals */}
      {activeModal === 'manual'    && <AddTransactionModal onClose={() => setActiveModal('none')} />}
      {activeModal === 'statement' && <BankStatementUploadModal onClose={() => setActiveModal('none')} />}
      {activeModal === 'receipt'   && <BillImageUploadModal onClose={() => setActiveModal('none')} defaultType="income" />}
      {activeModal === 'voice'     && <TransactionVoiceModal onClose={() => setActiveModal('none')} defaultType="income" />}
    </div>
  )
}
