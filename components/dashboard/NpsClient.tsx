'use client'
import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
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
import { useViewStore } from '@/store/viewStore'
import { useHolderStore } from '@/store/holderStore'

const ALLOC_COLORS = ['#3D7A58','#3B7DD8','#D4920A']

const SORT_OPTS = [
  { value: 'corpus_desc',  label: 'Corpus ↓' },
  { value: 'returns_desc', label: 'Returns ↓' },
  { value: 'name_asc',     label: 'Name A–Z' },
]

const TIER_CHIPS = [
  { value: 'Tier I',  label: 'Tier I',  color: '#3D7A58' },
  { value: 'Tier II', label: 'Tier II', color: '#3B7DD8' },
]

export default function NpsClient({ data }: { data: any[] }) {
  const [showAdd,    setShowAdd]    = useState(false)
  const [showPdf,    setShowPdf]    = useState(false)
  const [showVoice,  setShowVoice]  = useState(false)
  const [showExcel,  setShowExcel]  = useState(false)
  const [editItem,   setEditItem]   = useState<any>(null)
  const [search,     setSearch]     = useState('')
  const [sort,       setSort]       = useState('corpus_desc')
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
    if (search)     arr = arr.filter(n => `${n.name} ${n.fund_manager ?? ''}`.toLowerCase().includes(search.toLowerCase()))
    if (typeFilter) arr = arr.filter(n => n.tier === typeFilter)

    const retPct = (n: any) => Number(n.invested_amount) > 0
      ? (Number(n.corpus_amount) - Number(n.invested_amount)) / Number(n.invested_amount) * 100 : 0

    return arr.sort((a, b) => {
      if (sort === 'corpus_desc')  return Number(b.corpus_amount) - Number(a.corpus_amount)
      if (sort === 'returns_desc') return retPct(b) - retPct(a)
      return (a.name ?? '').localeCompare(b.name ?? '')
    })
  }, [base, search, typeFilter, sort])

  const totalCorpus   = filtered.reduce((a, n) => a + Number(n.corpus_amount), 0)
  const totalInvested = filtered.reduce((a, n) => a + Number(n.invested_amount), 0)
  const returnPct     = totalInvested > 0 ? ((totalCorpus - totalInvested) / totalInvested * 100).toFixed(2) : '0.00'

  async function deleteItem(id: string) {
    if (!confirm('Delete this NPS account?')) return
    await supabase.from('nps_accounts').delete().eq('id', id)
    router.refresh()
  }

  return (
    <InvPageShell title="NPS" subtitle="National Pension System · Tier I & II" count={filtered.length}
      totalValue={`₹${Math.round(totalCorpus).toLocaleString('en-IN')}`}
      onAdd={() => setShowAdd(true)} onPdf={() => setShowPdf(true)} onVoice={() => setShowVoice(true)}
      onExcel={() => setShowExcel(true)}>

      <HolderFilter />

      <FilterBar
        search={search} onSearch={setSearch}
        sort={sort} onSort={setSort} sortOptions={SORT_OPTS}
        chips={TIER_CHIPS} activeChip={typeFilter} onChip={setTypeFilter}
        resultCount={filtered.length} totalCount={base.length}
        searchPlaceholder="Search by name or fund manager…"
      />

      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Total Corpus',   value: `₹${Math.round(totalCorpus).toLocaleString('en-IN')}`,   color: 'var(--sage)' },
          { label: 'Total Invested', value: `₹${Math.round(totalInvested).toLocaleString('en-IN')}`, color: 'var(--blue)' },
          { label: 'Returns',        value: `${Number(returnPct)>=0?'+':''}${returnPct}%`,            color: Number(returnPct)>=0?'var(--income)':'var(--rose)' },
        ].map(c => (
          <div key={c.label} className="wl-card p-3">
            <div className="text-[10px] uppercase tracking-wider mb-1" style={{ color: 'var(--text3)' }}>{c.label}</div>
            <div className="text-[18px] font-bold font-mono" style={{ color: c.color }}>{c.value}</div>
          </div>
        ))}
      </div>

      {/* NPS Account cards */}
      {filtered.length === 0 ? <InvEmptyState msg="No NPS accounts match your filters." /> : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filtered.map((n, i) => {
            const allocData = [
              { name: 'Equity', value: Number(n.equity_allocation) },
              { name: 'Corp Bond', value: Number(n.corporate_bond_allocation) },
              { name: 'Govt Sec', value: Number(n.govt_securities_allocation) },
            ].filter(d => d.value > 0)
            const retAmt = Number(n.corpus_amount) - Number(n.invested_amount)
            const retP   = Number(n.invested_amount) > 0 ? ((retAmt / Number(n.invested_amount)) * 100).toFixed(1) : '0.0'
            return (
              <div key={n.id ?? i} className="wl-card p-4">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <div className="text-[14px] font-bold" style={{ color: 'var(--text)' }}>{n.name}</div>
                    <div className="text-[10px]" style={{ color: 'var(--text3)' }}>
                      {n.tier} · {n.fund_manager ?? 'Fund Manager'} {n.pran_number ? `· PRAN: ${n.pran_number}` : ''}
                    </div>
                    {n.holder_name && n.holder_name !== 'Self' && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded font-semibold mt-0.5 inline-block"
                        style={{ background: 'var(--blue-bg)', color: 'var(--blue)' }}>{n.holder_name}</span>
                    )}
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => setEditItem({ ...n, _type: 'nps' })} className="p-1.5 rounded" style={{ color: 'var(--text3)' }}><Pencil size={13} /></button>
                    <button onClick={() => deleteItem(n.id)} className="p-1.5 rounded" style={{ color: 'var(--rose)' }}><Trash2 size={13} /></button>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 text-[11px] mb-3">
                  <div><div style={{ color:'var(--text3)' }}>Corpus</div><div className="font-mono font-bold" style={{ color:'var(--sage)' }}>₹{Number(n.corpus_amount).toLocaleString('en-IN')}</div></div>
                  <div><div style={{ color:'var(--text3)' }}>Invested</div><div className="font-mono font-bold" style={{ color:'var(--text)' }}>₹{Number(n.invested_amount).toLocaleString('en-IN')}</div></div>
                  <div><div style={{ color:'var(--text3)' }}>Returns</div><div className="font-mono font-bold" style={{ color: Number(retP)>=0?'var(--income)':'var(--rose)' }}>{Number(retP)>=0?'+':''}{retP}%</div></div>
                </div>
                {allocData.length > 0 && (
                  <div className="flex items-center gap-3">
                    <ResponsiveContainer width={80} height={80}>
                      <PieChart>
                        <Pie data={allocData} dataKey="value" cx="50%" cy="50%" innerRadius={22} outerRadius={36} paddingAngle={2}>
                          {allocData.map((_,j) => <Cell key={j} fill={ALLOC_COLORS[j%ALLOC_COLORS.length]} />)}
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="text-[10px] space-y-0.5">
                      {allocData.map((d,j)=>(
                        <div key={j} className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-sm" style={{ background: ALLOC_COLORS[j%ALLOC_COLORS.length] }} />
                          <span style={{ color:'var(--text2)' }}>{d.name}: {d.value}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {showAdd   && <AddInvestmentModal onClose={() => setShowAdd(false)} defaultType="nps" />}
      {editItem  && <AddInvestmentModal onClose={() => setEditItem(null)} defaultType="nps" editData={editItem} />}
      {showPdf   && <PdfUploadModal onClose={() => setShowPdf(false)} investmentType="nps" />}
      {showVoice && <VoiceInputModal onClose={() => setShowVoice(false)} investmentType="nps" />}
      {showExcel && <ExcelUploadModal onClose={() => setShowExcel(false)} investmentType="nps" />}
    </InvPageShell>
  )
}
