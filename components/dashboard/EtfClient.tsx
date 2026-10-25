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


      <InvHoldings listTitle="Your ETFs" head={['ETF', 'Type', 'Return', 'Value']} chartLabel="Value by ETF"
        emptyMsg="No ETFs match your search." totalCount={base.length}
        search={search} onSearch={setSearch} searchPlaceholder="Search ETF, symbol or type…" sort={sort} onSort={setSort} sortOptions={SORT_OPTS}
        hero={{ label: 'Value today', value: `${sym}${Math.round(totalCurrent).toLocaleString('en-IN')}`, tone: Number(totalReturn) >= 0 ? 'good' : 'bad',
          delta: `${Number(totalReturn) >= 0 ? '▲' : '▼'} ${Math.abs(Number(totalReturn))}% on ${sym}${Math.round(totalInvested).toLocaleString('en-IN')} invested` }}
        tiles={[
          { label: 'Invested', value: `${sym}${Math.round(totalInvested).toLocaleString('en-IN')}`, delta: `${filtered.length} ETF${filtered.length === 1 ? '' : 's'}`, icon: IcWallet },
          { label: 'Gain', value: `${sym}${Math.round(totalCurrent - totalInvested).toLocaleString('en-IN')}`, delta: `${totalReturn}% overall`, tone: Number(totalReturn) >= 0 ? 'good' : 'bad', icon: IcUp },
        ]}
        items={filtered.map((x, i) => {
          const cur = Number(x.units || 0) * Number(x.current_price || x.avg_buy_price || 0)
          const inv = Number(x.invested_amount || 0)
          const ret = inv > 0 ? (cur - inv) / inv * 100 : 0
          const type = String(x.etf_type ?? 'equity')
          return {
            key: x.id ?? String(i), name: x.etf_name, color: ({ equity: '#16A34A', debt: '#3B8EF0', gold: '#D97706', index: '#7C3AED', international: '#DC2626' } as Record<string, string>)[x.etf_type] ?? '#16A34A',
            sub: [x.symbol, `${Number(x.units || 0).toFixed(2)} units`, x.holder_name && x.holder_name !== 'Self' ? x.holder_name : null].filter(Boolean).join(' · '),
            tag: type[0].toUpperCase() + type.slice(1), meta: pctText(ret), metaColor: pctColor(ret),
            value: cur, valueText: `${sym}${Math.round(cur).toLocaleString('en-IN')}`, valueSub: `${sym}${Math.round(inv).toLocaleString('en-IN')} invested`,
            onEdit: () => setEditItem({ ...x, _type: 'etf' }), onDelete: () => deleteItem(x.id),
          }
        })} />

      {showAdd   && <AddInvestmentModal onClose={() => setShowAdd(false)} defaultType="etf" />}
      {editItem  && <AddInvestmentModal onClose={() => setEditItem(null)} defaultType="etf" editData={editItem} />}
      {showPdf   && <PdfUploadModal onClose={() => setShowPdf(false)} investmentType="etf" />}
      {showVoice && <VoiceInputModal onClose={() => setShowVoice(false)} investmentType="etf" />}
      {showExcel && <ExcelUploadModal onClose={() => setShowExcel(false)} investmentType="etf" />}
    </InvPageShell>
  )
}
