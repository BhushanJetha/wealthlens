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
import { Pencil, Trash2, Clock } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { useViewStore } from '@/store/viewStore'
import { useHolderStore } from '@/store/holderStore'

const SORT_OPTS = [
  { value: 'principal_desc', label: 'Principal ↓' },
  { value: 'rate_desc',      label: 'Rate ↓' },
  { value: 'maturity_asc',   label: 'Matures Soon' },
  { value: 'name_asc',       label: 'Name A–Z' },
]

export default function FixedDepositsClient({ data }: { data: any[] }) {
  const [showAdd,   setShowAdd]   = useState(false)
  const [showPdf,   setShowPdf]   = useState(false)
  const [showVoice, setShowVoice] = useState(false)
  const [showExcel, setShowExcel] = useState(false)
  const [editItem,  setEditItem]  = useState<any>(null)
  const [search,    setSearch]    = useState('')
  const [sort,      setSort]      = useState('principal_desc')
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
    if (search) arr = arr.filter(f => `${f.name} ${f.bank_name ?? ''}`.toLowerCase().includes(search.toLowerCase()))
    return arr.sort((a, b) => {
      if (sort === 'principal_desc') return Number(b.principal) - Number(a.principal)
      if (sort === 'rate_desc')      return Number(b.interest_rate) - Number(a.interest_rate)
      if (sort === 'maturity_asc')   return new Date(a.maturity_date).getTime() - new Date(b.maturity_date).getTime()
      return (a.name ?? '').localeCompare(b.name ?? '')
    })
  }, [base, search, sort])

  const totalPrincipal = filtered.reduce((a, f) => a + Number(f.principal), 0)
  const totalInterest  = filtered.reduce((a, f) => { const mat = f.maturity_amt ?? (Number(f.principal)*(1+Number(f.interest_rate)/100)); return a + (mat - Number(f.principal)) }, 0)
  const avgRate = filtered.length > 0 ? (filtered.reduce((a, f) => a + Number(f.interest_rate), 0) / filtered.length).toFixed(2) : '0.00'

  const chartData = filtered.slice(0,8).map(f => ({ name: f.name?.slice(0,12), principal: Math.round(Number(f.principal)/1000), rate: Number(f.interest_rate) }))

  async function deleteItem(id: string) {
    if (!confirm('Delete this FD entry?')) return
    await supabase.from('fixed_deposits').delete().eq('id', id)
    router.refresh()
  }

  return (
    <InvPageShell title="Fixed Deposits" subtitle="Bank FDs · Term Deposits" count={filtered.length}
      totalValue={`₹${Math.round(totalPrincipal+totalInterest).toLocaleString('en-IN')}`}
      onAdd={() => setShowAdd(true)} onPdf={() => setShowPdf(true)} onVoice={() => setShowVoice(true)}
      onExcel={() => setShowExcel(true)}>


      <InvHoldings listTitle="Your deposits" head={['Deposit', 'Rate', 'Matures', 'Principal']} chartLabel="Principal by deposit"
        emptyMsg="No fixed deposits match your search." totalCount={base.length}
        search={search} onSearch={setSearch} searchPlaceholder="Search FD or bank…" sort={sort} onSort={setSort} sortOptions={SORT_OPTS}
        hero={{ label: 'Value at maturity', value: `₹${Math.round(totalPrincipal + totalInterest).toLocaleString('en-IN')}`, tone: 'good',
          delta: `+₹${Math.round(totalInterest).toLocaleString('en-IN')} interest on ₹${Math.round(totalPrincipal).toLocaleString('en-IN')}` }}
        tiles={[
          { label: 'Principal', value: `₹${Math.round(totalPrincipal).toLocaleString('en-IN')}`, delta: `${filtered.length} deposit${filtered.length === 1 ? '' : 's'}`, icon: IcBank },
          { label: 'Interest to earn', value: `+₹${Math.round(totalInterest).toLocaleString('en-IN')}`, delta: 'by maturity', tone: 'good', icon: IcUp },
          { label: 'Average rate', value: `${avgRate}%`, delta: 'per year', icon: IcPct },
        ]}
        items={filtered.map((x, i) => {
          const matAmt = x.maturity_amt ?? (Number(x.principal) * (1 + Number(x.interest_rate) / 100))
          const daysLeft = Math.ceil((new Date(x.maturity_date).getTime() - Date.now()) / 86400000)
          const s = x.currency === 'AED' ? 'AED ' : '₹'
          return {
            key: x.id ?? String(i), name: x.name, color: '#3B8EF0',
            sub: [x.bank_name, x.holder_name && x.holder_name !== 'Self' ? x.holder_name : null].filter(Boolean).join(' · '),
            tag: `${x.interest_rate}% p.a.`,
            meta: daysLeft > 0 ? fullDate(x.maturity_date) : 'Matured', metaColor: daysLeft > 0 && daysLeft <= 30 ? '#D97706' : undefined,
            value: Number(x.principal), valueText: `${s}${Number(x.principal).toLocaleString('en-IN')}`,
            valueSub: `+${s}${Math.round(matAmt - Number(x.principal)).toLocaleString('en-IN')} interest`,
            onEdit: () => setEditItem({ ...x, _type: 'fixed_deposit' }), onDelete: () => deleteItem(x.id),
          }
        })} />

      {showAdd   && <AddInvestmentModal onClose={() => setShowAdd(false)} defaultType="fixed_deposit" />}
      {editItem  && <AddInvestmentModal onClose={() => setEditItem(null)} defaultType="fixed_deposit" editData={editItem} />}
      {showPdf   && <PdfUploadModal onClose={() => setShowPdf(false)} investmentType="fixed_deposit" />}
      {showVoice && <VoiceInputModal onClose={() => setShowVoice(false)} investmentType="fixed_deposit" />}
      {showExcel && <ExcelUploadModal onClose={() => setShowExcel(false)} investmentType="fixed_deposit" />}
    </InvPageShell>
  )
}
