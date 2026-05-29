'use client'
import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useViewStore } from '@/store/viewStore'
import { useHolderStore } from '@/store/holderStore'
import { createClient } from '@/lib/supabase/client'
import InvPageShell, { InvEmptyState } from './InvPageShell'
import AddInvestmentModal from '@/components/forms/AddInvestmentModal'
import { PdfUploadModal } from '@/components/forms/PdfUploadModal'
import { VoiceInputModal } from '@/components/forms/VoiceInputModal'
import { ExcelUploadModal } from '@/components/forms/ExcelUploadModal'
import FilterBar from './FilterBar'
import HolderFilter from './HolderFilter'
import { Pencil, Trash2 } from 'lucide-react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'

const COLORS = ['#3D7A58','#3B7DD8','#D4920A','#7C5CBF','#C96A3A']
const TYPE_COLORS: Record<string,string> = {
  equity: 'var(--sage)', debt: 'var(--blue)', gold: 'var(--gold)', index: 'var(--purple)', international: 'var(--rose)',
}

const SORT_OPTS = [
  { value: 'value_desc',   label: 'Value ↓' },
  { value: 'returns_desc', label: 'Returns ↓' },
  { value: 'invested_desc',label: 'Invested ↓' },
  { value: 'name_asc',     label: 'Name A–Z' },
]

const TYPE_CHIPS = [
  { value: 'equity',        label: 'Equity',        color: '#3D7A58' },
  { value: 'debt',          label: 'Debt',          color: '#3B7DD8' },
  { value: 'gold',          label: 'Gold',          color: '#D4920A' },
  { value: 'index',         label: 'Index',         color: '#7C5CBF' },
  { value: 'international', label: 'Intl',          color: '#C96A3A' },
]

export default function EtfClient({ data }: { data: any[] }) {
  const [showAdd,    setShowAdd]    = useState(false)
  const [showPdf,    setShowPdf]    = useState(false)
  const [showVoice,  setShowVoice]  = useState(false)
  const [showExcel,  setShowExcel]  = useState(false)
  const [editItem,   setEditItem]   = useState<any>(null)
  const [search,     setSearch]     = useState('')
  const [sort,       setSort]       = useState('value_desc')
  const [typeFilter, setTypeFilter] = useState('')
  const router    = useRouter()
  const supabase  = createClient()
  const { view }  = useViewStore()
  const { selectedHolder } = useHolderStore()

  const base = useMemo(() => {
    let arr = view === 'uae'   ? data.filter(x => x.currency === 'AED' || x.country === 'UAE')
            : view === 'india' ? data.filter(x => x.currency === 'INR' || x.country === 'India')
            : data
    if (selectedHolder) arr = arr.filter(x => (x.holder_name ?? 'Self') === selectedHolder)
    return arr
  }, [data, view, selectedHolder])

  const filtered = useMemo(() => {
    let arr = [...base]
    if (search)     arr = arr.filter(e => `${e.etf_name} ${e.symbol ?? ''} ${e.etf_type ?? ''}`.toLowerCase().includes(search.toLowerCase()))
    if (typeFilter) arr = arr.filter(e => e.etf_type === typeFilter)

    const curVal = (e: any) => Number(e.units || 0) * Number(e.current_price || e.avg_buy_price || 0)
    const invVal = (e: any) => Number(e.invested_amount || 0)
    const ret    = (e: any) => invVal(e) > 0 ? (curVal(e) - invVal(e)) / invVal(e) * 100 : 0

    return arr.sort((a, b) => {
      if (sort === 'value_desc')    return curVal(b) - curVal(a)
      if (sort === 'returns_desc')  return ret(b) - ret(a)
      if (sort === 'invested_desc') return invVal(b) - invVal(a)
      return (a.etf_name ?? '').localeCompare(b.etf_name ?? '')
    })
  }, [base, search, typeFilter, sort])

  const sym = view === 'uae' ? 'AED ' : '₹'
  const totalInvested = filtered.reduce((a, e) => a + Number(e.invested_amount || 0), 0)
  const totalCurrent  = filtered.reduce((a, e) => {
    const price = e.current_price || e.avg_buy_price || 0
    return a + Number(e.units || 0) * Number(price)
  }, 0)
  const totalReturn   = totalInvested > 0 ? ((totalCurrent - totalInvested) / totalInvested * 100).toFixed(2) : '0.00'

  const typeBreakdown = filtered.reduce((acc: Record<string,number>, e) => {
    const val = Number(e.units || 0) * Number(e.current_price || e.avg_buy_price || 0)
    acc[e.etf_type || 'equity'] = (acc[e.etf_type || 'equity'] || 0) + val
    return acc
  }, {})
  const pieData = Object.entries(typeBreakdown).map(([name, value]) => ({ name: name.toUpperCase(), value: Math.round(value) }))

  async function deleteItem(id: string) {
    if (!confirm('Delete this ETF entry?')) return
    await supabase.from('etf_investments').delete().eq('id', id)
    router.refresh()
  }

  return (
    <InvPageShell title="ETFs" subtitle="Equity · Debt · Gold · Index · International" count={filtered.length}
      totalValue={`${sym}${Math.round(totalCurrent).toLocaleString('en-IN')}`}
      onAdd={() => setShowAdd(true)} onPdf={() => setShowPdf(true)} onVoice={() => setShowVoice(true)}
      onExcel={() => setShowExcel(true)}>

      <HolderFilter />

      <FilterBar
        search={search} onSearch={setSearch}
        sort={sort} onSort={setSort} sortOptions={SORT_OPTS}
        chips={TYPE_CHIPS} activeChip={typeFilter} onChip={setTypeFilter}
        resultCount={filtered.length} totalCount={base.length}
        searchPlaceholder="Search by ETF name, symbol or type…"
      />

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Total Invested', value: `${sym}${Math.round(totalInvested).toLocaleString('en-IN')}`, color: 'var(--blue)' },
          { label: 'Current Value',  value: `${sym}${Math.round(totalCurrent).toLocaleString('en-IN')}`,  color: 'var(--sage)' },
          { label: 'Returns',        value: `${Number(totalReturn)>=0?'+':''}${totalReturn}%`,             color: Number(totalReturn)>=0?'var(--income)':'var(--rose)' },
        ].map(c => (
          <div key={c.label} className="wl-card p-3">
            <div className="text-[10px] uppercase tracking-wider mb-1" style={{ color: 'var(--text3)' }}>{c.label}</div>
            <div className="text-[17px] font-bold font-mono" style={{ color: c.color }}>{c.value}</div>
          </div>
        ))}
      </div>

      {pieData.length > 0 && (
        <div className="wl-card p-4">
          <div className="text-[11px] font-bold uppercase tracking-wider mb-3" style={{ color: 'var(--text3)' }}>Allocation by ETF Type</div>
          <div className="flex items-center gap-6">
            <ResponsiveContainer width={140} height={140}>
              <PieChart>
                <Pie data={pieData} dataKey="value" cx="50%" cy="50%" innerRadius={38} outerRadius={62} paddingAngle={2}>
                  {pieData.map((_,i) => <Cell key={i} fill={COLORS[i%COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={{ background:'#fff', border:'1px solid var(--border)', borderRadius:8, fontSize:11 }}
                  formatter={(v:any)=>[`${sym}${Number(v).toLocaleString('en-IN')}`,'']} />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex flex-col gap-2">
              {pieData.map((d,i) => (
                <div key={i} className="flex items-center gap-2 text-[11px]">
                  <span className="w-2.5 h-2.5 rounded-sm" style={{ background: COLORS[i%COLORS.length] }} />
                  <span style={{ color:'var(--text2)' }}>{d.name}</span>
                  <span className="font-mono" style={{ color:'var(--text)' }}>{sym}{d.value.toLocaleString('en-IN')}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {filtered.length === 0 ? <InvEmptyState msg="No ETFs match your filters." /> : (
        <div className="wl-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg2)' }}>
                  {['ETF Name','Symbol','Type','Units','Avg Price','Current Price','Invested','Current Value','Returns',''].map(h=>(
                    <th key={h} className="px-3 py-3 text-left text-[10px] uppercase tracking-wider font-bold" style={{ color:'var(--text3)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((e, i) => {
                  const price = Number(e.current_price || e.avg_buy_price || 0)
                  const cur   = Number(e.units || 0) * price
                  const inv   = Number(e.invested_amount || 0)
                  const ret   = inv > 0 ? ((cur-inv)/inv*100).toFixed(1) : '0.0'
                  const col   = TYPE_COLORS[e.etf_type] || 'var(--sage)'
                  return (
                    <tr key={e.id ?? i} style={{ borderBottom:'1px solid var(--border)' }} className="hover:bg-stone-50">
                      <td className="px-3 py-3 font-semibold" style={{ color:'var(--text)' }}>
                        {e.etf_name}
                        {e.holder_name && e.holder_name !== 'Self' && (
                          <span className="ml-1.5 text-[9px] px-1.5 py-0.5 rounded font-semibold"
                            style={{ background: 'var(--blue-bg)', color: 'var(--blue)' }}>{e.holder_name}</span>
                        )}
                      </td>
                      <td className="px-3 py-3 font-mono text-[11px]" style={{ color:'var(--text3)' }}>{e.symbol}</td>
                      <td className="px-3 py-3"><span className="px-1.5 py-0.5 rounded text-[10px] uppercase font-semibold" style={{ background: col+'18', color: col }}>{e.etf_type}</span></td>
                      <td className="px-3 py-3 font-mono" style={{ color:'var(--text2)' }}>{Number(e.units||0).toFixed(2)}</td>
                      <td className="px-3 py-3 font-mono" style={{ color:'var(--text2)' }}>{sym}{Number(e.avg_buy_price||0).toFixed(2)}</td>
                      <td className="px-3 py-3 font-mono" style={{ color:'var(--text2)' }}>{e.current_price ? `${sym}${Number(e.current_price).toFixed(2)}` : '—'}</td>
                      <td className="px-3 py-3 font-mono" style={{ color:'var(--text3)' }}>{sym}{Math.round(inv).toLocaleString('en-IN')}</td>
                      <td className="px-3 py-3 font-mono font-bold" style={{ color:'var(--text)' }}>{sym}{Math.round(cur).toLocaleString('en-IN')}</td>
                      <td className="px-3 py-3 font-bold" style={{ color: Number(ret)>=0?'var(--income)':'var(--rose)' }}>{Number(ret)>=0?'+':''}{ret}%</td>
                      <td className="px-3 py-3">
                        <div className="flex gap-1">
                          <button onClick={() => setEditItem({ ...e, _type: 'etf' })} style={{ color:'var(--text3)' }}><Pencil size={13}/></button>
                          <button onClick={() => deleteItem(e.id)} style={{ color:'var(--rose)' }}><Trash2 size={13}/></button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showAdd   && <AddInvestmentModal onClose={() => setShowAdd(false)} defaultType="etf" />}
      {editItem  && <AddInvestmentModal onClose={() => setEditItem(null)} defaultType="etf" editData={editItem} />}
      {showPdf   && <PdfUploadModal onClose={() => setShowPdf(false)} investmentType="etf" />}
      {showVoice && <VoiceInputModal onClose={() => setShowVoice(false)} investmentType="etf" />}
      {showExcel && <ExcelUploadModal onClose={() => setShowExcel(false)} investmentType="etf" />}
    </InvPageShell>
  )
}
