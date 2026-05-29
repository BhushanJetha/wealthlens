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

const TYPE_COLORS: Record<string,string> = {
  govt: 'var(--blue)', corporate: 'var(--purple)', tax_free: 'var(--income)', rbi_bonds: 'var(--gold)', sgb: 'var(--sage)',
}

const SORT_OPTS = [
  { value: 'value_desc',   label: 'Value ↓' },
  { value: 'returns_desc', label: 'Returns ↓' },
  { value: 'coupon_desc',  label: 'Coupon ↓' },
  { value: 'name_asc',     label: 'Name A–Z' },
]

const TYPE_CHIPS = [
  { value: 'govt',       label: 'Govt',       color: '#3B7DD8' },
  { value: 'corporate',  label: 'Corporate',  color: '#7C5CBF' },
  { value: 'tax_free',   label: 'Tax-Free',   color: '#3D7A58' },
  { value: 'rbi_bonds',  label: 'RBI Bonds',  color: '#D4920A' },
  { value: 'sgb',        label: 'SGB',        color: '#2E7D52' },
]

export default function BondsClient({ data }: { data: any[] }) {
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
    if (search)     arr = arr.filter(b => `${b.name} ${b.bond_type ?? ''}`.toLowerCase().includes(search.toLowerCase()))
    if (typeFilter) arr = arr.filter(b => b.bond_type === typeFilter)

    const curVal = (b: any) => Number(b.current_value || b.invested_amount || 0)
    const invVal = (b: any) => Number(b.invested_amount || 0)
    const ret    = (b: any) => invVal(b) > 0 ? (curVal(b) - invVal(b)) / invVal(b) * 100 : 0

    return arr.sort((a, b) => {
      if (sort === 'value_desc')   return curVal(b) - curVal(a)
      if (sort === 'returns_desc') return ret(b) - ret(a)
      if (sort === 'coupon_desc')  return Number(b.coupon_rate || 0) - Number(a.coupon_rate || 0)
      return (a.name ?? '').localeCompare(b.name ?? '')
    })
  }, [base, search, typeFilter, sort])

  const sym = view === 'uae' ? 'AED ' : '₹'
  const totalInvested = filtered.reduce((a, b) => a + Number(b.invested_amount || 0), 0)
  const totalCurrent  = filtered.reduce((a, b) => a + Number(b.current_value || b.invested_amount || 0), 0)
  const totalReturn   = totalInvested > 0 ? ((totalCurrent - totalInvested) / totalInvested * 100).toFixed(2) : '0.00'

  async function deleteItem(id: string) {
    if (!confirm('Delete this bond entry?')) return
    await supabase.from('bond_investments').delete().eq('id', id)
    router.refresh()
  }

  return (
    <InvPageShell title="Bonds" subtitle="Govt · Corporate · Tax-Free · RBI" count={filtered.length}
      totalValue={`${sym}${Math.round(totalCurrent).toLocaleString('en-IN')}`}
      onAdd={() => setShowAdd(true)} onPdf={() => setShowPdf(true)} onVoice={() => setShowVoice(true)}
      onExcel={() => setShowExcel(true)}>

      <HolderFilter />

      <FilterBar
        search={search} onSearch={setSearch}
        sort={sort} onSort={setSort} sortOptions={SORT_OPTS}
        chips={TYPE_CHIPS} activeChip={typeFilter} onChip={setTypeFilter}
        resultCount={filtered.length} totalCount={base.length}
        searchPlaceholder="Search by bond name or type…"
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

      {filtered.length === 0 ? <InvEmptyState msg="No bonds match your filters." /> : (
        <div className="wl-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg2)' }}>
                  {['Bond Name','Type','Qty','Face Value','Coupon','Invested','Current Value','Returns',''].map(h=>(
                    <th key={h} className="px-4 py-3 text-left text-[10px] uppercase tracking-wider font-bold" style={{ color:'var(--text3)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((b, i) => {
                  const cur = Number(b.current_value || b.invested_amount || 0)
                  const inv = Number(b.invested_amount || 0)
                  const ret = inv > 0 ? ((cur-inv)/inv*100).toFixed(1) : '0.0'
                  const col = TYPE_COLORS[b.bond_type] || 'var(--blue)'
                  return (
                    <tr key={b.id ?? i} style={{ borderBottom: '1px solid var(--border)' }} className="hover:bg-stone-50">
                      <td className="px-4 py-3 font-semibold" style={{ color:'var(--text)' }}>
                        {b.name}
                        {b.holder_name && b.holder_name !== 'Self' && (
                          <span className="ml-1.5 text-[9px] px-1.5 py-0.5 rounded font-semibold"
                            style={{ background: 'var(--blue-bg)', color: 'var(--blue)' }}>{b.holder_name}</span>
                        )}
                      </td>
                      <td className="px-4 py-3"><span className="px-2 py-0.5 rounded text-[10px] uppercase font-semibold" style={{ background: col+'18', color: col }}>{b.bond_type?.replace('_',' ')}</span></td>
                      <td className="px-4 py-3 font-mono" style={{ color:'var(--text2)' }}>{b.quantity}</td>
                      <td className="px-4 py-3 font-mono" style={{ color:'var(--text2)' }}>{sym}{Number(b.face_value||0).toLocaleString('en-IN')}</td>
                      <td className="px-4 py-3 font-mono" style={{ color:'var(--text2)' }}>{b.coupon_rate ? `${b.coupon_rate}%` : '—'}</td>
                      <td className="px-4 py-3 font-mono" style={{ color:'var(--text3)' }}>{sym}{Math.round(inv).toLocaleString('en-IN')}</td>
                      <td className="px-4 py-3 font-mono font-bold" style={{ color:'var(--text)' }}>{sym}{Math.round(cur).toLocaleString('en-IN')}</td>
                      <td className="px-4 py-3 font-bold" style={{ color: Number(ret)>=0?'var(--income)':'var(--rose)' }}>{Number(ret)>=0?'+':''}{ret}%</td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1">
                          <button onClick={() => setEditItem({ ...b, _type: 'bond' })} style={{ color:'var(--text3)' }}><Pencil size={13}/></button>
                          <button onClick={() => deleteItem(b.id)} style={{ color:'var(--rose)' }}><Trash2 size={13}/></button>
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

      {showAdd   && <AddInvestmentModal onClose={() => setShowAdd(false)} defaultType="bond" />}
      {editItem  && <AddInvestmentModal onClose={() => setEditItem(null)} defaultType="bond" editData={editItem} />}
      {showPdf   && <PdfUploadModal onClose={() => setShowPdf(false)} investmentType="bond" />}
      {showVoice && <VoiceInputModal onClose={() => setShowVoice(false)} investmentType="bond" />}
      {showExcel && <ExcelUploadModal onClose={() => setShowExcel(false)} investmentType="bond" />}
    </InvPageShell>
  )
}
