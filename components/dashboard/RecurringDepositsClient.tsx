'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import InvPageShell, { InvEmptyState } from './InvPageShell'
import AddInvestmentModal from '@/components/forms/AddInvestmentModal'
import { PdfUploadModal } from '@/components/forms/PdfUploadModal'
import { VoiceInputModal } from '@/components/forms/VoiceInputModal'
import { ExcelUploadModal } from '@/components/forms/ExcelUploadModal'
import { Pencil, Trash2 } from 'lucide-react'
import { useViewStore } from '@/store/viewStore'

export default function RecurringDepositsClient({ data }: { data: any[] }) {
  const [showAdd, setShowAdd] = useState(false)
  const [showPdf, setShowPdf] = useState(false)
  const [showVoice, setShowVoice] = useState(false)
  const [showExcel, setShowExcel] = useState(false)
  const [editItem, setEditItem] = useState<any>(null)
  const router = useRouter()
  const supabase = createClient()
  const { view } = useViewStore()
  const filtered = view === 'uae' ? data.filter(x => x.currency === 'AED' || x.country === 'UAE')
    : view === 'india' ? data.filter(x => x.currency === 'INR' || x.country === 'India')
    : data

  const totalMonthly   = filtered.reduce((a, r) => a + Number(r.monthly_amount), 0)
  const totalCommitted = filtered.reduce((a, r) => a + Number(r.monthly_amount) * r.tenure_months, 0)
  const totalPaid      = filtered.reduce((a, r) => a + Number(r.monthly_amount) * (r.months_paid ?? 0), 0)

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
      {filtered.length === 0 ? <InvEmptyState msg="No recurring deposits yet. Click Add New or upload a statement." /> : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((r, i) => {
            const pct = Math.min(100, Math.round(((r.months_paid ?? 0) / r.tenure_months) * 100))
            const sym = r.currency === 'AED' ? 'AED ' : '₹'
            return (
              <div key={r.id ?? i} className="wl-card p-4">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <div className="text-[13px] font-bold" style={{ color: 'var(--text)' }}>{r.name}</div>
                    <div className="text-[10px]" style={{ color: 'var(--text3)' }}>{r.bank_name} · {sym}{Number(r.monthly_amount).toLocaleString()}/mo · {r.interest_rate}%</div>
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
