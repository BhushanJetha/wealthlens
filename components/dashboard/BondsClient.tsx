'use client'
import InvHoldings, { fullDate, pctText, pctColor } from './InvHoldings'
import { Landmark as IcBank, TrendingUp as IcUp, Percent as IcPct, Wallet as IcWallet, Layers as IcLayers, CalendarClock as IcCal } from 'lucide-react'
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


      <InvHoldings listTitle="Your bonds" head={['Bond', 'Type', 'Return', 'Value']} chartLabel="Value by bond"
        emptyMsg="No bonds match your search." totalCount={base.length}
        search={search} onSearch={setSearch} searchPlaceholder="Search bonds…" sort={sort} onSort={setSort} sortOptions={SORT_OPTS}
        hero={{ label: 'Value today', value: `${sym}${Math.round(totalCurrent).toLocaleString('en-IN')}`, tone: Number(totalReturn) >= 0 ? 'good' : 'bad',
          delta: `${Number(totalReturn) >= 0 ? '▲' : '▼'} ${Math.abs(Number(totalReturn))}% on ${sym}${Math.round(totalInvested).toLocaleString('en-IN')} invested` }}
        tiles={[
          { label: 'Invested', value: `${sym}${Math.round(totalInvested).toLocaleString('en-IN')}`, delta: `${filtered.length} bond${filtered.length === 1 ? '' : 's'}`, icon: IcWallet },
          { label: 'Gain', value: `${sym}${Math.round(totalCurrent - totalInvested).toLocaleString('en-IN')}`, delta: `${totalReturn}% overall`, tone: Number(totalReturn) >= 0 ? 'good' : 'bad', icon: IcUp },
        ]}
        items={filtered.map((x, i) => {
          const cur = Number(x.current_value || x.invested_amount || 0)
          const inv = Number(x.invested_amount || 0)
          const ret = inv > 0 ? (cur - inv) / inv * 100 : 0
          const type = String(x.bond_type ?? 'bond').replace('_', ' ')
          return {
            key: x.id ?? String(i), name: x.name, color: ({ govt: '#3B8EF0', corporate: '#7C3AED', tax_free: '#16A34A', rbi_bonds: '#D97706', sgb: '#0891B2' } as Record<string, string>)[x.bond_type] ?? '#3B8EF0',
            sub: [x.quantity ? `${x.quantity} × ${sym}${Number(x.face_value || 0).toLocaleString('en-IN')}` : null, x.coupon_rate ? `${x.coupon_rate}% coupon` : null, x.holder_name && x.holder_name !== 'Self' ? x.holder_name : null].filter(Boolean).join(' · ') || undefined,
            tag: type.toUpperCase() === 'SGB' ? 'SGB' : type[0].toUpperCase() + type.slice(1),
            meta: pctText(ret), metaColor: pctColor(ret),
            value: cur, valueText: `${sym}${Math.round(cur).toLocaleString('en-IN')}`, valueSub: `${sym}${Math.round(inv).toLocaleString('en-IN')} invested`,
            onEdit: () => setEditItem({ ...x, _type: 'bond' }), onDelete: () => deleteItem(x.id),
          }
        })} />

      {showAdd   && <AddInvestmentModal onClose={() => setShowAdd(false)} defaultType="bond" />}
      {editItem  && <AddInvestmentModal onClose={() => setEditItem(null)} defaultType="bond" editData={editItem} />}
      {showPdf   && <PdfUploadModal onClose={() => setShowPdf(false)} investmentType="bond" />}
      {showVoice && <VoiceInputModal onClose={() => setShowVoice(false)} investmentType="bond" />}
      {showExcel && <ExcelUploadModal onClose={() => setShowExcel(false)} investmentType="bond" />}
    </InvPageShell>
  )
}
