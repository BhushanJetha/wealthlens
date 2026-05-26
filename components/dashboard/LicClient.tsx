'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import InvPageShell, { InvEmptyState } from './InvPageShell'
import AddInvestmentModal from '@/components/forms/AddInvestmentModal'
import { PdfUploadModal } from '@/components/forms/PdfUploadModal'
import { VoiceInputModal } from '@/components/forms/VoiceInputModal'
import { ExcelUploadModal } from '@/components/forms/ExcelUploadModal'
import { Pencil, Trash2, Shield, Calendar } from 'lucide-react'
import { useViewStore } from '@/store/viewStore'

export default function LicClient({ data }: { data: any[] }) {
  const [showAdd, setShowAdd] = useState(false)
  const [showPdf, setShowPdf] = useState(false)
  const [showVoice, setShowVoice] = useState(false)
  const [showExcel, setShowExcel] = useState(false)
  const [editItem, setEditItem] = useState<any>(null)
  const router = useRouter()
  const supabase = createClient()
  const { view } = useViewStore()

  const filtered = view === 'uae'   ? data.filter(x => x.currency === 'AED' || x.country === 'UAE')
    : view === 'india' ? data.filter(x => x.currency === 'INR' || x.country === 'India')
    : data

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

      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Total Sum Assured', value: `₹${Math.round(totalSumAssured).toLocaleString('en-IN')}`, color: 'var(--sage)' },
          { label: 'Annual Premium', value: `₹${Math.round(totalPremium).toLocaleString('en-IN')}/yr`, color: 'var(--blue)' },
          { label: 'Total Paid', value: `₹${Math.round(totalPaid).toLocaleString('en-IN')}`, color: 'var(--income)' },
        ].map(c => (
          <div key={c.label} className="wl-card p-3">
            <div className="text-[10px] uppercase tracking-wider mb-1" style={{ color: 'var(--text3)' }}>{c.label}</div>
            <div className="text-[18px] font-bold font-mono" style={{ color: c.color }}>{c.value}</div>
          </div>
        ))}
      </div>

      {/* LIC Policy cards */}
      {filtered.length === 0 ? <InvEmptyState msg="No LIC policies yet. Click Add New or upload a statement." /> : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filtered.map((l, i) => {
            const daysToMaturity = l.maturity_date ? Math.ceil((new Date(l.maturity_date).getTime() - Date.now()) / 86400000) : null
            const daysToNext = l.next_premium_date ? Math.ceil((new Date(l.next_premium_date).getTime() - Date.now()) / 86400000) : null
            return (
              <div key={l.id ?? i} className="wl-card p-4">
                <div className="flex justify-between items-start mb-3">
                  <div className="flex items-start gap-2">
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background:'var(--sage-bg)' }}>
                      <Shield size={16} style={{ color:'var(--sage)' }} />
                    </div>
                    <div>
                      <div className="text-[13px] font-bold" style={{ color:'var(--text)' }}>{l.name}</div>
                      <div className="text-[10px]" style={{ color:'var(--text3)' }}>{l.plan_name ?? 'LIC Policy'} {l.policy_number ? `· ${l.policy_number}` : ''}</div>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => setEditItem({ ...l, _type: 'lic' })} className="p-1.5 rounded" style={{ color:'var(--text3)' }}><Pencil size={13} /></button>
                    <button onClick={() => deleteItem(l.id)} className="p-1.5 rounded" style={{ color:'var(--rose)' }}><Trash2 size={13} /></button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 text-[11px] mb-3">
                  <div>
                    <div style={{ color:'var(--text3)' }}>Sum Assured</div>
                    <div className="font-mono font-bold" style={{ color:'var(--sage)' }}>₹{Number(l.sum_assured).toLocaleString('en-IN')}</div>
                  </div>
                  <div>
                    <div style={{ color:'var(--text3)' }}>Annual Premium</div>
                    <div className="font-mono font-bold" style={{ color:'var(--text)' }}>₹{Number(l.annual_premium).toLocaleString('en-IN')}</div>
                  </div>
                  <div>
                    <div style={{ color:'var(--text3)' }}>Total Paid</div>
                    <div className="font-mono font-bold" style={{ color:'var(--income)' }}>₹{Number(l.total_paid??0).toLocaleString('en-IN')}</div>
                  </div>
                  <div>
                    <div style={{ color:'var(--text3)' }}>Bonus Accrued</div>
                    <div className="font-mono font-bold" style={{ color:'var(--gold)' }}>₹{Number(l.bonus_accrued??0).toLocaleString('en-IN')}</div>
                  </div>
                </div>

                <div className="text-[11px] space-y-1">
                  <div className="flex items-center gap-1.5" style={{ color: 'var(--text3)' }}>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold" style={{ background:'var(--sage-bg)', color:'var(--sage)' }}>{l.premium_frequency}</span>
                    <span>· {Number(l.premium_paid_years).toFixed(0)} yrs paid of {l.policy_term_years} yrs</span>
                  </div>
                  {daysToNext != null && (
                    <div className="flex items-center gap-1" style={{ color: daysToNext <= 15 ? 'var(--rose)' : 'var(--text3)' }}>
                      <Calendar size={10} />
                      Next premium: {l.next_premium_date} {daysToNext >= 0 ? `(in ${daysToNext} days)` : '(overdue)'}
                    </div>
                  )}
                  {daysToMaturity != null && (
                    <div className="flex items-center gap-1" style={{ color: 'var(--text3)' }}>
                      <Calendar size={10} />
                      Matures: {l.maturity_date} {daysToMaturity > 0 ? `(${Math.round(daysToMaturity/365.25)} yrs)` : '(matured)'}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {showAdd   && <AddInvestmentModal onClose={() => setShowAdd(false)} defaultType="lic" />}
      {editItem  && <AddInvestmentModal onClose={() => setEditItem(null)} defaultType="lic" editData={editItem} />}
      {showPdf   && <PdfUploadModal onClose={() => setShowPdf(false)} investmentType="lic" />}
      {showVoice && <VoiceInputModal onClose={() => setShowVoice(false)} investmentType="lic" />}
      {showExcel && <ExcelUploadModal onClose={() => setShowExcel(false)} investmentType="lic" />}
    </InvPageShell>
  )
}
