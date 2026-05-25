'use client'
import { useState, useMemo } from 'react'
import { useViewStore } from '@/store/viewStore'
import MetricCard from '@/components/dashboard/MetricCard'
import { SpendingPieChart } from '@/components/charts/SpendingPieChart'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { Search, Filter, Download } from 'lucide-react'

const CATS = ['All','Food','Shopping','Utilities','Transport','Health','Entertainment','Travel','Education','Other']
const CAT_COLORS: Record<string, string> = { Food:'#F4A535',Shopping:'#4A90D9',Utilities:'#7C5CBF',Transport:'#00C9A7',Health:'#3CC68A',Entertainment:'#E8556D',Travel:'#FF8C42',Other:'#6A7F92' }
const FX = 22.80

export default function ExpensesClient({ transactions, accounts }: { transactions: any[]; accounts: any[] }) {
  const { view } = useViewStore()
  const [search, setSearch] = useState('')
  const [cat, setCat] = useState('All')
  const [accFilter, setAccFilter] = useState('All')

  const sym = view === 'uae' ? 'AED ' : '₹'
  const toDisplay = (amt: number, cur: string) => view === 'consolidated' ? amt * (cur === 'AED' ? FX : 1) : amt

  const filtered = useMemo(() => {
    return transactions.filter(t => {
      if (view === 'uae'    && t.currency !== 'AED') return false
      if (view === 'india'  && t.currency !== 'INR') return false
      if (cat !== 'All'    && t.category !== cat) return false
      if (accFilter !== 'All' && t.account_id !== accFilter) return false
      if (search && !t.merchant.toLowerCase().includes(search.toLowerCase()) && !t.description?.toLowerCase().includes(search.toLowerCase())) return false
      return true
    })
  }, [transactions, view, cat, accFilter, search])

  const total = filtered.reduce((a, t) => a + toDisplay(Number(t.amount), t.currency), 0)
  const thisMonth = new Date().toISOString().slice(0, 7)
  const thisMonthTotal = filtered.filter(t => t.txn_date?.startsWith(thisMonth)).reduce((a, t) => a + toDisplay(Number(t.amount), t.currency), 0)

  const catData = useMemo(() => {
    const cats: Record<string, number> = {}
    filtered.forEach(t => { cats[t.category] = (cats[t.category] ?? 0) + toDisplay(Number(t.amount), t.currency) })
    return Object.entries(cats).map(([name, value]) => ({ name, value: Math.round(value) }))
  }, [filtered, view])

  // Last 6 months bar
  const monthlyData = useMemo(() => {
    const months: Record<string, number> = {}
    for (let i = 5; i >= 0; i--) {
      const d = new Date(); d.setMonth(d.getMonth() - i)
      months[d.toISOString().slice(0, 7)] = 0
    }
    filtered.forEach(t => {
      const m = t.txn_date?.slice(0, 7)
      if (m && months[m] !== undefined) months[m] += toDisplay(Number(t.amount), t.currency)
    })
    return Object.entries(months).map(([m, v]) => ({ month: m.slice(5) + '/' + m.slice(2,4), value: Math.round(v) }))
  }, [filtered, view])

  return (
    <div className="space-y-5 animate-fade-up">
      <div>
        <h1 className="text-lg font-bold text-white">Expenses</h1>
        <p className="text-xs text-slate-500 mt-0.5">{view === 'uae' ? 'UAE · AED' : view === 'india' ? 'India · INR' : 'Consolidated · INR'}</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard label="This Month" value={`${sym}${Math.round(thisMonthTotal).toLocaleString('en-IN')}`} accent="rose" />
        <MetricCard label="Total Filtered" value={`${sym}${Math.round(total).toLocaleString('en-IN')}`} accent="gold" />
        <MetricCard label="Transactions" value={`${filtered.length}`} accent="blue" />
        <MetricCard label="Avg per Txn" value={`${sym}${filtered.length > 0 ? Math.round(total/filtered.length).toLocaleString('en-IN') : 0}`} accent="teal" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-[#162032] border border-white/7 rounded-xl p-4">
          <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-3">By Category</div>
          {catData.length > 0 ? <SpendingPieChart data={catData} /> : <div className="text-slate-600 text-sm text-center py-12">No data</div>}
        </div>
        <div className="lg:col-span-2 bg-[#162032] border border-white/7 rounded-xl p-4">
          <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-3">Month-over-Month</div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={monthlyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="month" tick={{ fill:'#6A7F92', fontSize:10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill:'#6A7F92', fontSize:10 }} axisLine={false} tickLine={false} tickFormatter={v => v >= 100000 ? `${(v/100000).toFixed(0)}L` : v.toLocaleString()} />
              <Tooltip contentStyle={{ background:'#1E2D40', border:'1px solid rgba(255,255,255,0.1)', borderRadius:8, fontSize:11 }}
                formatter={(v:any) => [`${sym}${Number(v).toLocaleString('en-IN')}`, 'Spending']} />
              <Bar dataKey="value" fill="#4A90D9" radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search merchant…"
            className="bg-[#162032] border border-white/10 rounded-lg pl-8 pr-3 py-2 text-[12px] text-white placeholder-slate-600 focus:outline-none focus:border-[#00C9A7] transition-colors w-48" />
        </div>
        <div className="flex gap-1 flex-wrap">
          {CATS.map(c => (
            <button key={c} onClick={() => setCat(c)}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold border transition-all ${cat === c ? 'border-transparent text-black' : 'bg-[#162032] border-white/10 text-slate-400 hover:text-white'}`}
              style={cat === c ? { background: CAT_COLORS[c] ?? '#00C9A7' } : {}}>
              {c}
            </button>
          ))}
        </div>
        <select value={accFilter} onChange={e => setAccFilter(e.target.value)}
          className="bg-[#162032] border border-white/10 rounded-lg px-3 py-2 text-[12px] text-white focus:outline-none focus:border-[#00C9A7]">
          <option value="All">All Accounts</option>
          {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="bg-[#162032] border border-white/7 rounded-xl overflow-hidden">
        {filtered.length === 0
          ? <div className="text-slate-600 text-center py-16">No transactions found. Upload a bank statement to get started.</div>
          : (
            <div className="overflow-x-auto">
              <table className="w-full text-[12px]">
                <thead><tr className="bg-[#1E2D40]">
                  {['Date','Merchant','Category','Account','Amount','Source'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-[10px] uppercase tracking-wider text-slate-500 font-bold">{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {filtered.slice(0, 100).map((t, i) => (
                    <tr key={i} className="border-t border-white/5 hover:bg-white/2 transition-colors">
                      <td className="px-4 py-3 text-slate-400 font-mono">{t.txn_date}</td>
                      <td className="px-4 py-3 font-semibold text-white">{t.merchant}</td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold" style={{ background: (CAT_COLORS[t.category]??'#6A7F92')+'22', color: CAT_COLORS[t.category]??'#6A7F92' }}>
                          {t.category}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-500 text-[11px]">{accounts.find(a => a.id === t.account_id)?.name ?? '—'}</td>
                      <td className="px-4 py-3 font-bold font-mono text-[#E8556D]">{t.currency === 'AED' ? 'AED ' : '₹'}{Number(t.amount).toLocaleString('en-IN')}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] ${t.source === 'statement_upload' ? 'bg-[#00C9A7]/15 text-[#00C9A7]' : 'bg-white/8 text-slate-400'}`}>
                          {t.source === 'statement_upload' ? 'AI Parsed' : 'Manual'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        }
      </div>
    </div>
  )
}
