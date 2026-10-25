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
import { Pencil, Trash2, Shield, Calendar } from 'lucide-react'
import { useViewStore } from '@/store/viewStore'
import { useHolderStore } from '@/store/holderStore'

const SORT_OPTS = [
  { value: 'assured_desc', label: 'Sum Assured ↓' },
  { value: 'premium_desc', label: 'Premium ↓' },
  { value: 'next_due_asc', label: 'Due Soon' },
  { value: 'name_asc',     label: 'Name A–Z' },
]

const FREQ_CHIPS = [
  { value: 'annual',      label: 'Annual',      color: '#3D7A58' },
  { value: 'semi-annual', label: 'Semi-Annual',  color: '#3B7DD8' },
  { value: 'quarterly',   label: 'Quarterly',   color: '#D4920A' },
  { value: 'monthly',     label: 'Monthly',     color: '#7C5CBF' },
]

export default function LicClient({ data }: { data: any[] }) {
  const [showAdd,    setShowAdd]    = useState(false)
  const [showPdf,    setShowPdf]    = useState(false)
  const [showVoice,  setShowVoice]  = useState(false)
  const [showExcel,  setShowExcel]  = useState(false)
  const [editItem,   setEditItem]   = useState<any>(null)
  const [search,     setSearch]     = useState('')
  const [sort,       setSort]       = useState('assured_desc')
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
    if (search)     arr = arr.filter(l => `${l.name} ${l.plan_name ?? ''}`.toLowerCase().includes(search.toLowerCase()))
    if (typeFilter) arr = arr.filter(l => l.premium_frequency === typeFilter)
    return arr.sort((a, b) => {
      if (sort === 'assured_desc') return Number(b.sum_assured) - Number(a.sum_assured)
      if (sort === 'premium_desc') return Number(b.annual_premium) - Number(a.annual_premium)
      if (sort === 'next_due_asc') {
        const da = a.next_premium_date ? new Date(a.next_premium_date).getTime() : Infinity
        const db = b.next_premium_date ? new Date(b.next_premium_date).getTime() : Infinity
        return da - db
      }
      return (a.name ?? '').localeCompare(b.name ?? '')
    })
  }, [base, search, typeFilter, sort])

  const totalSumAssured = filtered.reduce((a, l) => a + Number(l.sum_assured), 0)
  const totalPremium    = filtered.reduce((a, l) => a + Number(l.annual_premium), 0)
  const totalPaid       = filtered.reduce((a, l) => a + Number(l.total_paid ?? 0), 0)

  async function deleteItem(id: string) {
    if (!confirm('Delete this LIC policy?')) return
    await supabase.from('lic_policies').delete().eq('id', id)
    router.refresh()
  }

  return (
    <InvPageShell title="LIC Policies" subtitle="Life Insurance Corporation · Endowment & Term" count={filtered.length}
      totalValue={`₹${Math.round(totalSumAssured).toLocaleString('en-IN')} assured`}
      onAdd={() => setShowAdd(true)} onPdf={() => setShowPdf(true)} onVoice={() => setShowVoice(true)}
      onExcel={() => setShowExcel(true)}>


      <InvHoldings listTitle="Your LIC policies" head={['Policy', 'Premium mode', 'Next premium', 'Sum assured']} chartLabel="Sum assured by policy"
        emptyMsg="No LIC policies match your search." totalCount={base.length}
        search={search} onSearch={setSearch} searchPlaceholder="Search policy or plan…" sort={sort} onSort={setSort} sortOptions={SORT_OPTS}
        hero={{ label: 'Total sum assured', value: `₹${Math.round(totalSumAssured).toLocaleString('en-IN')}`,
          delta: `₹${Math.round(totalPremium).toLocaleString('en-IN')} a year in premiums` }}
        tiles={[
          { label: 'Annual premium', value: `₹${Math.round(totalPremium).toLocaleString('en-IN')}`, delta: `${filtered.length} polic${filtered.length === 1 ? 'y' : 'ies'}`, icon: IcCal },
          { label: 'Paid so far', value: `₹${Math.round(totalPaid).toLocaleString('en-IN')}`, delta: 'across all policies', icon: IcWallet },
        ]}
        items={filtered.map((x, i) => {
          const daysToNext = x.next_premium_date ? Math.ceil((new Date(x.next_premium_date).getTime() - Date.now()) / 86400000) : null
          return {
            key: x.id ?? String(i), name: x.name, color: '#0891B2',
            sub: [x.plan_name, x.policy_number, x.maturity_date ? `matures ${fullDate(x.maturity_date)}` : null, x.holder_name && x.holder_name !== 'Self' ? x.holder_name : null].filter(Boolean).join(' · ') || undefined,
            tag: x.premium_frequency ?? 'Annually',
            meta: daysToNext == null ? '—' : daysToNext < 0 ? 'Overdue' : `${fullDate(x.next_premium_date)}`,
            metaColor: daysToNext != null && daysToNext < 0 ? '#DC2626' : daysToNext != null && daysToNext <= 15 ? '#D97706' : undefined,
            value: Number(x.sum_assured), valueText: `₹${Number(x.sum_assured).toLocaleString('en-IN')}`,
            valueSub: `₹${Number(x.annual_premium).toLocaleString('en-IN')}/yr`,
            onEdit: () => setEditItem({ ...x, _type: 'lic' }), onDelete: () => deleteItem(x.id),
          }
        })} />

      {showAdd   && <AddInvestmentModal onClose={() => setShowAdd(false)} defaultType="lic" />}
      {editItem  && <AddInvestmentModal onClose={() => setEditItem(null)} defaultType="lic" editData={editItem} />}
      {showPdf   && <PdfUploadModal onClose={() => setShowPdf(false)} investmentType="lic" />}
      {showVoice && <VoiceInputModal onClose={() => setShowVoice(false)} investmentType="lic" />}
      {showExcel && <ExcelUploadModal onClose={() => setShowExcel(false)} investmentType="lic" />}
    </InvPageShell>
  )
}
