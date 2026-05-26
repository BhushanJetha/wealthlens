'use client'
import { useState, useMemo } from 'react'
import { useViewStore } from '@/store/viewStore'
import MetricCard from '@/components/dashboard/MetricCard'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'
import { Search } from 'lucide-react'

const CATS = ['All','Food','Shopping','Utilities','Transport','Health','Entertainment','Travel','Education','Other']
const CAT_COLORS: Record<string,string> = {
  Food:'#D97706', Shopping:'#2563EB', Utilities:'#7C3AED', Transport:'#16A34A',
  Health:'#059669', Entertainment:'#E11D48', Travel:'#EA580C', Other:'#6B7280'
}
const FX = 22.80

export default function ExpensesClient({ transactions, accounts }: { transactions: any[]; accounts: any[] }) {
  const { view } = useViewStore()
  const [search, setSearch] = useState('')
  const [cat, setCat]       = useState('All')
  const [accFilter, setAccFilter] = useState('All')

  const sym = view === 'uae' ? 'AED ' : '₹'
  const toDisplay = (amt: number, cur: string) => view === 'consolidated' ? amt * (cur === 'AED' ? FX : 1) : amt

  const filtered = useMemo(() => transactions.filter(t => {
    if (view === 'uae'   && t.currency !== 'AED') return false
    if (view === 'india' && t.currency !== 'INR') return false
    if (cat !== 'All'   && t.category !== cat)    return false
    if (accFilter !== 'All' && t.account_id !== accFilter) return false
    if (search && !t.merchant?.toLowerCase().includes(search.toLowerCase())) return false
    return true
  }), [transactions, view, cat, accFilter, search])

  const total = filtered.reduce((a, t) => a + toDisplay(Number(t.amount), t.currency), 0)
  const thisMonth = new Date().toISOString().slice(0, 7)
  const thisMonthTotal = filtered.filter(t => t.txn_date?.startsWith(thisMonth)).reduce((a, t) => a + toDisplay(Number(t.amount), t.currency), 0)

  const catData = useMemo(() => {
    const cats: Record<string,number> = {}
    filtered.forEach(t => { cats[t.category] = (cats[t.category]??0) + toDisplay(Number(t.amount), t.currency) })
    return Object.entries(cats).map(([name, value]) => ({ name, value: Math.round(value) }))
  }, [filtered, view])

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

  const PIE_COLORS = ['#16A34A','#2563EB','#D97706','#E11D48','#7C3AED','#059669','#EA580C','#6B7280']

  return (
    <div className="space-y-5 animate-fade-up">
      <div>
        <h1 className="text-xl font-bold" style={{ color:'var(--text)' }}>Expenses</h1>
        <p className="text-[12px] mt-0.5" style={{ color:'var(--text3)' }}>
          {view === 'uae' ? 'UAE · AED' : view === 'india' ? 'India · INR' : 'Consolidated · INR'}
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard label="This Month"   value={`${sym}${Math.round(thisMonthTotal).toLocaleString('en-IN')}`} accent="rose" />
        <MetricCard label="Total Filtered" value={`${sym}${Math.round(total).toLocaleString('en-IN')}`}       accent="gold" />
        <MetricCard label="Transactions" value={`${filtered.length}`}                                          accent="blue" />
        <MetricCard label="Avg per Txn"  value={`${sym}${filtered.length > 0 ? Math.round(total/filtered.length).toLocaleString('en-IN') : 0}`} accent="teal" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Pie */}
        <div className="wl-card p-4">
          <div className="text-[11px] font-bold uppercase tracking-wider mb-3" style={{ color:'var(--text3)' }}>By Category</div>
          {catData.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={catData} dataKey="value" cx="50%" cy="50%" innerRadius={48} outerRadius={78} paddingAngle={2}>
                    {catData.map((_,i) => <Cell key={i} fill={PIE_COLORS[i%PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={{ background:'#fff', border:'1px solid var(--border)', borderRadius:8, fontSize:11 }}
                    formatter={(v:any)=>[`${sym}${Number(v).toLocaleString('en-IN')}`,'']} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-1 mt-1">
                {catData.slice(0,5).map((d,i) => (
                  <div key={i} className="flex items-center justify-between text-[11px]">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-sm" style={{ background: PIE_COLORS[i%PIE_COLORS.length] }} />
                      <span style={{ color:'var(--text2)' }}>{d.name}</span>
                    </div>
                    <span className="font-mono" style={{ color:'var(--text)' }}>{sym}{d.value.toLocaleString('en-IN')}</span>
                  </div>
                ))}
              </div>
            </>
          ) : <div className="text-center py-12 text-[13px]" style={{ color:'var(--text3)' }}>No data</div>}
        </div>

        {/* Bar chart */}
        <div className="lg:col-span-2 wl-card p-4">
          <div className="text-[11px] font-bold uppercase tracking-wider mb-3" style={{ color:'var(--text3)' }}>Month-over-Month</div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={monthlyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="month" tick={{ fill:'var(--text3)', fontSize:10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill:'var(--text3)', fontSize:10 }} axisLine={false} tickLine={false}
                tickFormatter={v => v >= 100000 ? `${(v/100000).toFixed(0)}L` : v >= 1000 ? `${(v/1000).toFixed(0)}K` : String(v)} />
              <Tooltip contentStyle={{ background:'#fff', border:'1px solid var(--border)', borderRadius:8, fontSize:11 }}
                formatter={(v:any) => [`${sym}${Number(v).toLocaleString('en-IN')}`, 'Spending']}
                labelStyle={{ color:'var(--text)' }} />
              <Bar dataKey="value" fill="var(--blue)" radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

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
          {CATS.map(c => (
            <button key={c} onClick={() => setCat(c)}
              className="px-3 py-1.5 rounded-lg text-[11px] font-semibold border transition-all"
              style={cat === c
                ? { background: CAT_COLORS[c] ?? 'var(--sage)', borderColor:'transparent', color:'#fff' }
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
        {filtered.length === 0
          ? <div className="text-center py-16 text-[13px]" style={{ color:'var(--text3)' }}>
              No transactions found. Upload a bank statement to get started.
            </div>
          : (
            <div className="overflow-x-auto">
              <table className="w-full text-[12px]">
                <thead>
                  <tr style={{ borderBottom:'1px solid var(--border)', background:'var(--bg2)' }}>
                    {['Date','Merchant','Category','Account','Amount','Source'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-[10px] uppercase tracking-wider font-bold" style={{ color:'var(--text3)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.slice(0, 100).map((t, i) => {
                    const c = CAT_COLORS[t.category] ?? '#6B7280'
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
                        <td className="px-4 py-3 font-bold font-mono" style={{ color:'var(--expense)' }}>
                          {t.currency === 'AED' ? 'AED ' : '₹'}{Number(t.amount).toLocaleString('en-IN')}
                        </td>
                        <td className="px-4 py-3">
                          <span className="px-2 py-0.5 rounded text-[10px] font-semibold"
                            style={t.source === 'statement_upload' ? { background:'var(--income-bg)', color:'var(--income)' } : { background:'var(--bg2)', color:'var(--text3)' }}>
                            {t.source === 'statement_upload' ? 'AI Parsed' : 'Manual'}
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
    </div>
  )
}
