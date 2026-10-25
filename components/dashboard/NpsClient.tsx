'use client'
import InvHoldings, { fullDate, pctText, pctColor } from './InvHoldings'
import { Landmark as IcBank, TrendingUp as IcUp, Percent as IcPct, Wallet as IcWallet, Layers as IcLayers, CalendarClock as IcCal } from 'lucide-react'
import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import InvPageShell, { InvEmptyState } from './InvPageShell'
import AddInvestmentModal from '@/components/forms/AddInvestmentModal'
import { PdfUploadModal } from '@/components/forms/PdfUploadModal'
import { VoiceInputModal } from '@/components/forms/VoiceInputModal'
import { ExcelUploadModal } from '@/components/forms/ExcelUploadModal'
import FilterBar from './FilterBar'
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


      <InvHoldings listTitle="Your NPS accounts" head={['Account', 'Tier', 'Return', 'Corpus']} chartLabel="Corpus by account"
        emptyMsg="No NPS accounts match your search." totalCount={base.length}
        search={search} onSearch={setSearch} searchPlaceholder="Search name or fund manager…" sort={sort} onSort={setSort} sortOptions={SORT_OPTS}
        hero={{ label: 'Total corpus', value: `₹${Math.round(totalCorpus).toLocaleString('en-IN')}`, tone: Number(returnPct) >= 0 ? 'good' : 'bad',
          delta: `${Number(returnPct) >= 0 ? '▲' : '▼'} ${Math.abs(Number(returnPct))}% on ₹${Math.round(totalInvested).toLocaleString('en-IN')} invested` }}
        tiles={[
          { label: 'Invested', value: `₹${Math.round(totalInvested).toLocaleString('en-IN')}`, delta: `${filtered.length} account${filtered.length === 1 ? '' : 's'}`, icon: IcWallet },
          { label: 'Gain', value: `₹${Math.round(totalCorpus - totalInvested).toLocaleString('en-IN')}`, delta: `${returnPct}% overall`, tone: Number(returnPct) >= 0 ? 'good' : 'bad', icon: IcUp },
        ]}
        items={filtered.map((x, i) => {
          const inv = Number(x.invested_amount), corpus = Number(x.corpus_amount)
          const ret = inv > 0 ? (corpus - inv) / inv * 100 : 0
          const alloc = [['Equity', x.equity_allocation], ['Corp', x.corporate_bond_allocation], ['Govt', x.govt_securities_allocation]]
            .filter(([, v]) => Number(v) > 0).map(([k, v]) => `${k} ${Number(v)}%`).join(' / ')
          return {
            key: x.id ?? String(i), name: x.name, color: '#16A34A',
            sub: [x.fund_manager, alloc || null, x.holder_name && x.holder_name !== 'Self' ? x.holder_name : null].filter(Boolean).join(' · ') || undefined,
            tag: x.tier ?? 'Tier I', meta: pctText(ret), metaColor: pctColor(ret),
            value: corpus, valueText: `₹${Math.round(corpus).toLocaleString('en-IN')}`, valueSub: `₹${Math.round(inv).toLocaleString('en-IN')} invested`,
            onEdit: () => setEditItem({ ...x, _type: 'nps' }), onDelete: () => deleteItem(x.id),
          }
        })} />

      {showAdd   && <AddInvestmentModal onClose={() => setShowAdd(false)} defaultType="nps" />}
      {editItem  && <AddInvestmentModal onClose={() => setEditItem(null)} defaultType="nps" editData={editItem} />}
      {showPdf   && <PdfUploadModal onClose={() => setShowPdf(false)} investmentType="nps" />}
      {showVoice && <VoiceInputModal onClose={() => setShowVoice(false)} investmentType="nps" />}
      {showExcel && <ExcelUploadModal onClose={() => setShowExcel(false)} investmentType="nps" />}
    </InvPageShell>
  )
}
