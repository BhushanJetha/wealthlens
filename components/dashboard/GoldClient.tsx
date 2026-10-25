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
import { Pencil, Trash2, Gem } from 'lucide-react'

const TYPE_COLORS: Record<string,string> = {
  physical: 'var(--gold)', sgb: 'var(--sage)', gold_etf: 'var(--blue)', gold_mf: 'var(--purple)',
}

const SORT_OPTS = [
  { value: 'value_desc',   label: 'Value ↓' },
  { value: 'returns_desc', label: 'Returns ↓' },
  { value: 'grams_desc',   label: 'Weight ↓' },
  { value: 'name_asc',     label: 'Name A–Z' },
]

const TYPE_CHIPS = [
  { value: 'physical', label: 'Physical',  color: '#D4920A' },
  { value: 'sgb',      label: 'SGB',       color: '#3D7A58' },
  { value: 'gold_etf', label: 'Gold ETF',  color: '#3B7DD8' },
  { value: 'gold_mf',  label: 'Gold MF',   color: '#7C5CBF' },
]

export default function GoldClient({ data }: { data: any[] }) {
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
    if (search)     arr = arr.filter(g => `${g.name} ${g.gold_type ?? ''}`.toLowerCase().includes(search.toLowerCase()))
    if (typeFilter) arr = arr.filter(g => g.gold_type === typeFilter)

    const curVal = (g: any) => g.current_price_per_gram && g.quantity_grams
      ? Number(g.current_price_per_gram) * Number(g.quantity_grams)
      : Number(g.invested_amount || 0)
    const invVal = (g: any) => Number(g.invested_amount || 0)
    const ret    = (g: any) => invVal(g) > 0 ? (curVal(g) - invVal(g)) / invVal(g) * 100 : 0

    return arr.sort((a, b) => {
      if (sort === 'value_desc')   return curVal(b) - curVal(a)
      if (sort === 'returns_desc') return ret(b) - ret(a)
      if (sort === 'grams_desc')   return Number(b.quantity_grams || 0) - Number(a.quantity_grams || 0)
      return (a.name ?? '').localeCompare(b.name ?? '')
    })
  }, [base, search, typeFilter, sort])

  const sym = view === 'uae' ? 'AED ' : '₹'
  const totalInvested = filtered.reduce((a, g) => a + Number(g.invested_amount || 0), 0)
  const totalCurrent  = filtered.reduce((a, g) => {
    if (g.current_price_per_gram && g.quantity_grams) return a + Number(g.current_price_per_gram) * Number(g.quantity_grams)
    return a + Number(g.invested_amount || 0)
  }, 0)
  const totalReturn   = totalInvested > 0 ? ((totalCurrent - totalInvested) / totalInvested * 100).toFixed(2) : '0.00'
  const totalGrams    = filtered.reduce((a, g) => a + Number(g.quantity_grams || 0), 0)

  async function deleteItem(id: string) {
    if (!confirm('Delete this gold entry?')) return
    await supabase.from('gold_investments').delete().eq('id', id)
    router.refresh()
  }

  return (
    <InvPageShell title="Gold" subtitle="Physical · SGB · Gold ETF · Gold MF" count={filtered.length}
      totalValue={`${sym}${Math.round(totalCurrent).toLocaleString('en-IN')}`}
      onAdd={() => setShowAdd(true)} onPdf={() => setShowPdf(true)} onVoice={() => setShowVoice(true)}
      onExcel={() => setShowExcel(true)}>


      <InvHoldings listTitle="Your gold" head={['Holding', 'Type', 'Return', 'Value']} chartLabel="Value by holding"
        emptyMsg="No gold investments match your search." totalCount={base.length}
        search={search} onSearch={setSearch} searchPlaceholder="Search gold…" sort={sort} onSort={setSort} sortOptions={SORT_OPTS}
        hero={{ label: 'Value today', value: `${sym}${Math.round(totalCurrent).toLocaleString('en-IN')}`, tone: Number(totalReturn) >= 0 ? 'good' : 'bad',
          delta: `${Number(totalReturn) >= 0 ? '▲' : '▼'} ${Math.abs(Number(totalReturn))}% on ${sym}${Math.round(totalInvested).toLocaleString('en-IN')} invested` }}
        tiles={[
          { label: 'Invested', value: `${sym}${Math.round(totalInvested).toLocaleString('en-IN')}`, delta: `${filtered.length} holding${filtered.length === 1 ? '' : 's'}`, icon: IcWallet },
          { label: 'Total weight', value: `${totalGrams.toFixed(2)} g`, delta: 'physical, SGB and funds', icon: IcLayers },
        ]}
        items={filtered.map((x, i) => {
          const cur = x.current_price_per_gram && x.quantity_grams ? Number(x.current_price_per_gram) * Number(x.quantity_grams) : Number(x.invested_amount || 0)
          const inv = Number(x.invested_amount || 0)
          const ret = inv > 0 ? (cur - inv) / inv * 100 : 0
          const type = String(x.gold_type ?? 'gold').replace('_', ' ')
          return {
            key: x.id ?? String(i), name: x.name, color: ({ physical: '#D97706', sgb: '#16A34A', gold_etf: '#3B8EF0', gold_mf: '#7C3AED' } as Record<string, string>)[x.gold_type] ?? '#D97706',
            sub: [x.quantity_grams ? `${x.quantity_grams} g at ${sym}${x.buy_price_per_gram}/g` : null, x.holder_name && x.holder_name !== 'Self' ? x.holder_name : null].filter(Boolean).join(' · ') || undefined,
            tag: type.toUpperCase() === 'SGB' ? 'SGB' : type[0].toUpperCase() + type.slice(1),
            meta: pctText(ret), metaColor: pctColor(ret),
            value: cur, valueText: `${sym}${Math.round(cur).toLocaleString('en-IN')}`, valueSub: `${sym}${Math.round(inv).toLocaleString('en-IN')} invested`,
            onEdit: () => setEditItem({ ...x, _type: 'gold' }), onDelete: () => deleteItem(x.id),
          }
        })} />

      {showAdd   && <AddInvestmentModal onClose={() => setShowAdd(false)} defaultType="gold" />}
      {editItem  && <AddInvestmentModal onClose={() => setEditItem(null)} defaultType="gold" editData={editItem} />}
      {showPdf   && <PdfUploadModal onClose={() => setShowPdf(false)} investmentType="gold" />}
      {showVoice && <VoiceInputModal onClose={() => setShowVoice(false)} investmentType="gold" />}
      {showExcel && <ExcelUploadModal onClose={() => setShowExcel(false)} investmentType="gold" />}
    </InvPageShell>
  )
}
