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
import { useViewStore } from '@/store/viewStore'
import { useHolderStore } from '@/store/holderStore'

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
    const pct = (r: any) => Math.min(100, ((r.months_paid ?? 0) / r.tenure_months) * 100)
    return arr.sort((a, b) => {
      if (sort === 'monthly_desc')  return Number(b.monthly_amount) - Number(a.monthly_amount)
      if (sort === 'progress_desc') return pct(b) - pct(a)
      if (sort === 'maturity_asc')  return new Date(a.maturity_date).getTime() - new Date(b.maturity_date).getTime()
      return (a.name ?? '').localeCompare(b.name ?? '')
    })
  }, [base, search, sort])

  const totalMonthly   = filtered.reduce((a, r) => a + Number(r.monthly_amount), 0)
  const totalCommitted = filtered.reduce((a, r) => a + Number(r.monthly_amount) * r.tenure_months, 0)
  const totalPaid      = filtered.reduce((a, r) => a + (r.current_amount != null ? Number(r.current_amount) : Number(r.monthly_amount) * (r.months_paid ?? 0)), 0)

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

      <HolderFilter />

      <FilterBar
        search={search} onSearch={setSearch}
        sort={sort} onSort={setSort} sortOptions={SORT_OPTS}
        resultCount={filtered.length} totalCount={base.length}
        searchPlaceholder="Search by name or bank…"
      />

      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Monthly Commitment', value: `₹${Math.round(totalMonthly).toLocaleString('en-IN')}/mo`, color: 'var(--blue)' },
          { label: 'Total Committed', value: `₹${Math.round(totalCommitted).toLocaleString('en-IN')}`, color: 'var(--text)' },
          { label: 'Amount Paid', value: `₹${Math.round(totalPaid).toLocaleString('en-IN')}`, color: 'var(--income)' },
        ].map(c => (
          <div key={c.label} className="wl-card p-3">
            <div className="text-[10px] uppercase tracking-wider mb-1" style={{ color: 'var(--text3)' }}>{c.label}</div>
            <div className="text-[17px] font-bold font-mono" style={{ color: c.color }}>{c.value}</div>
          </div>
        ))}
      </div>

      {/* RD cards */}
      {filtered.length === 0 ? <InvEmptyState msg="No recurring deposits match your filters." /> : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((r, i) => {
            const pct = Math.min(100, Math.round(((r.months_paid ?? 0) / r.tenure_months) * 100))
            const s = r.currency === 'AED' ? 'AED ' : '₹'
            return (
              <div key={r.id ?? i} className="wl-card p-4">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <div className="text-[13px] font-bold" style={{ color: 'var(--text)' }}>{r.name}</div>
                    <div className="text-[10px]" style={{ color: 'var(--text3)' }}>{r.bank_name} · {s}{Number(r.monthly_amount).toLocaleString()}/mo · {r.interest_rate}%</div>
                    {r.holder_name && r.holder_name !== 'Self' && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded font-semibold mt-0.5 inline-block"
                        style={{ background: 'var(--blue-bg)', color: 'var(--blue)' }}>{r.holder_name}</span>
                    )}
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => setEditItem({ ...r, _type: 'recurring_deposit' })} className="p-1 rounded" style={{ color: 'var(--text3)' }}><Pencil size={12} /></button>
                    <button onClick={() => deleteItem(r.id)} className="p-1 rounded" style={{ color: 'var(--rose)' }}><Trash2 size={12} /></button>
                  </div>
                </div>
                <div className="flex justify-between text-[10px] mb-1.5" style={{ color: 'var(--text3)' }}>
                  <span>{r.months_paid ?? 0}/{r.tenure_months} months</span>
                  <span className="font-semibold" style={{ color: 'var(--sage)' }}>{pct}%</span>
                </div>
                <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--bg2)' }}>
                  <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: 'var(--sage)' }} />
                </div>
                <div className="text-[10px] mt-1.5" style={{ color: 'var(--text3)' }}>
                  Matures: {r.maturity_date}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {showAdd   && <AddInvestmentModal onClose={() => setShowAdd(false)} defaultType="recurring_deposit" />}
      {editItem  && <AddInvestmentModal onClose={() => setEditItem(null)} defaultType="recurring_deposit" editData={editItem} />}
      {showPdf   && <PdfUploadModal onClose={() => setShowPdf(false)} investmentType="recurring_deposit" />}
      {showVoice && <VoiceInputModal onClose={() => setShowVoice(false)} investmentType="recurring_deposit" />}
      {showExcel && <ExcelUploadModal onClose={() => setShowExcel(false)} investmentType="recurring_deposit" />}
    </InvPageShell>
  )
}
