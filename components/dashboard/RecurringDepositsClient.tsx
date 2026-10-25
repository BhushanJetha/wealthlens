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
import { useViewStore } from '@/store/viewStore'
import { useHolderStore } from '@/store/holderStore'
import { rdPaidIn, rdInstalments } from '@/lib/netWorth'

const SORT_OPTS = [
  { value: 'monthly_desc',  label: 'Monthly ↓' },
  { value: 'progress_desc', label: 'Progress ↓' },
  { value: 'maturity_asc',  label: 'Matures Soon' },
  { value: 'name_asc',      label: 'Name A–Z' },
]

export default function RecurringDepositsClient({ data }: { data: any[] }) {
  const [showAdd,   setShowAdd]   = useState(false)
  const [showPdf,   setShowPdf]   = useState(false)
  const [showVoice, setShowVoice] = useState(false)
  const [showExcel, setShowExcel] = useState(false)
  const [editItem,  setEditItem]  = useState<any>(null)
  const [search,    setSearch]    = useState('')
  const [sort,      setSort]      = useState('monthly_desc')
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
    if (search) arr = arr.filter(r => `${r.name} ${r.bank_name ?? ''}`.toLowerCase().includes(search.toLowerCase()))
    const pct = (r: any) => Math.min(100, (rdInstalments(r) / r.tenure_months) * 100)
    return arr.sort((a, b) => {
      if (sort === 'monthly_desc')  return Number(b.monthly_amount) - Number(a.monthly_amount)
      if (sort === 'progress_desc') return pct(b) - pct(a)
      if (sort === 'maturity_asc')  return new Date(a.maturity_date).getTime() - new Date(b.maturity_date).getTime()
      return (a.name ?? '').localeCompare(b.name ?? '')
    })
  }, [base, search, sort])

  const totalMonthly   = filtered.reduce((a, r) => a + Number(r.monthly_amount), 0)
  const totalCommitted = filtered.reduce((a, r) => a + Number(r.monthly_amount) * r.tenure_months, 0)
  // Same paid-in rule as Net worth and the Investments overview
  const totalPaid      = filtered.reduce((a, r) => a + rdPaidIn(r), 0)

  async function deleteItem(id: string) {
    if (!confirm('Delete this RD entry?')) return
    await supabase.from('recurring_deposits').delete().eq('id', id)
    router.refresh()
  }

  return (
    <InvPageShell title="Recurring Deposits" subtitle="Monthly SIPs · Bank RDs" count={filtered.length}
      totalValue={`₹${Math.round(totalPaid).toLocaleString('en-IN')} paid`}
      onAdd={() => setShowAdd(true)} onPdf={() => setShowPdf(true)} onVoice={() => setShowVoice(true)}
      onExcel={() => setShowExcel(true)}>


      <InvHoldings listTitle="Your recurring deposits" head={['Deposit', 'Rate', 'Progress', 'Paid in']} chartLabel="Paid in by deposit"
        emptyMsg="No recurring deposits match your search." totalCount={base.length}
        search={search} onSearch={setSearch} searchPlaceholder="Search name or bank…" sort={sort} onSort={setSort} sortOptions={SORT_OPTS}
        hero={{ label: 'Paid in so far', value: `₹${Math.round(totalPaid).toLocaleString('en-IN')}`,
          delta: `of ₹${Math.round(totalCommitted).toLocaleString('en-IN')} committed (${totalCommitted > 0 ? Math.round(totalPaid / totalCommitted * 100) : 0}%)` }}
        tiles={[
          { label: 'Monthly commitment', value: `₹${Math.round(totalMonthly).toLocaleString('en-IN')}`, delta: 'a month', icon: IcCal },
          { label: 'Total committed', value: `₹${Math.round(totalCommitted).toLocaleString('en-IN')}`, delta: 'over the full tenure', icon: IcLayers },
        ]}
        items={filtered.map((x, i) => {
          const s = x.currency === 'AED' ? 'AED ' : '₹'
          const paid = rdPaidIn(x)
          return {
            key: x.id ?? String(i), name: x.name, color: '#16A34A',
            sub: [x.bank_name, x.maturity_date ? `matures ${fullDate(x.maturity_date)}` : null, x.holder_name && x.holder_name !== 'Self' ? x.holder_name : null].filter(Boolean).join(' · '),
            tag: `${x.interest_rate}% p.a.`, meta: `${rdInstalments(x)}/${x.tenure_months} months`,
            value: paid, valueText: `${s}${Math.round(paid).toLocaleString('en-IN')}`,
            valueSub: `${s}${Number(x.monthly_amount).toLocaleString('en-IN')}/mo`,
            onEdit: () => setEditItem({ ...x, _type: 'recurring_deposit' }), onDelete: () => deleteItem(x.id),
          }
        })} />

      {showAdd   && <AddInvestmentModal onClose={() => setShowAdd(false)} defaultType="recurring_deposit" />}
      {editItem  && <AddInvestmentModal onClose={() => setEditItem(null)} defaultType="recurring_deposit" editData={editItem} />}
      {showPdf   && <PdfUploadModal onClose={() => setShowPdf(false)} investmentType="recurring_deposit" />}
      {showVoice && <VoiceInputModal onClose={() => setShowVoice(false)} investmentType="recurring_deposit" />}
      {showExcel && <ExcelUploadModal onClose={() => setShowExcel(false)} investmentType="recurring_deposit" />}
    </InvPageShell>
  )
}
