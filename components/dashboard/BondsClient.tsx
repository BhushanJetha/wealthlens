'use client'
import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useViewStore } from '@/store/viewStore'
import { createClient } from '@/lib/supabase/client'
import InvPageShell, { InvEmptyState } from './InvPageShell'
import AddInvestmentModal from '@/components/forms/AddInvestmentModal'
import { PdfUploadModal } from '@/components/forms/PdfUploadModal'
import { VoiceInputModal } from '@/components/forms/VoiceInputModal'
import { ExcelUploadModal } from '@/components/forms/ExcelUploadModal'
import { Pencil, Trash2 } from 'lucide-react'

const TYPE_COLORS: Record<string,string> = {
  govt: 'var(--blue)', corporate: 'var(--purple)', tax_free: 'var(--income)', rbi_bonds: 'var(--gold)', sgb: 'var(--sage)',
}

export default function BondsClient({ data }: { data: any[] }) {
  const [showAdd, setShowAdd] = useState(false)
  const [showPdf, setShowPdf] = useState(false)
  const [showVoice, setShowVoice] = useState(false)
  const [showExcel, setShowExcel] = useState(false)
  const [editItem, setEditItem] = useState<any>(null)
  const router = useRouter()
  const supabase = createClient()
  const { view } = useViewStore()

  const filtered = useMemo(() => {
    if (view === 'uae')   return data.filter(x => x.currency === 'AED' || x.country === 'UAE')
    if (view === 'india') return data.filter(x => x.currency === 'INR' || x.country === 'India')
    return data
  }, [data, view])

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

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Total Invested', value: `${sym}${Math.round(totalInvested).toLocaleString('en-IN')}`, color: 'var(--blue)' },
          { label: 'Current Value',  value: `${sym}${Math.round(totalCurrent).toLocaleString('en-IN')}`,  color: 'var(--sage)' },
          { label: 'Returns',        value: `${Number(totalReturn)>=0?'+':''}${totalReturn}%`,             color: Number(totalReturn)>=0?'var(--income)':'var(--rose)' },
        ].map(c => (
          <div key={c.label} className="wl-card p-3">
            <div className="text-[10px] uppercase tracking-wider mb-1" style={{ color: 'var(--text3)' }}>{c.label}</div>
            <div className="text-[17px] font-bold font-mono" style={{ color: c.color }}>{c.value}</div>
          </div>
        ))}
      </div>

      {filtered.length === 0 ? <InvEmptyState msg="No bonds yet. Add government, corporate or tax-free bonds." /> : (
        <div className="wl-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg2)' }}>
                  {['Bond Name','Type','Qty','Face Value','Coupon','Invested','Current Value','Returns',''].map(h=>(
                    <th key={h} className="px-4 py-3 text-left text-[10px] uppercase tracking-wider font-bold" style={{ color:'var(--text3)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((b, i) => {
                  const cur = Number(b.current_value || b.invested_amount || 0)
                  const inv = Number(b.invested_amount || 0)
                  const ret = inv > 0 ? ((cur-inv)/inv*100).toFixed(1) : '0.0'
                  const col = TYPE_COLORS[b.bond_type] || 'var(--blue)'
                  return (
                    <tr key={b.id ?? i} style={{ borderBottom: '1px solid var(--border)' }} className="hover:bg-stone-50">
                      <td className="px-4 py-3 font-semibold" style={{ color:'var(--text)' }}>{b.name}</td>
                      <td className="px-4 py-3"><span className="px-2 py-0.5 rounded text-[10px] uppercase font-semibold" style={{ background: col+'18', color: col }}>{b.bond_type?.replace('_',' ')}</span></td>
                      <td className="px-4 py-3 font-mono" style={{ color:'var(--text2)' }}>{b.quantity}</td>
                      <td className="px-4 py-3 font-mono" style={{ color:'var(--text2)' }}>{sym}{Number(b.face_value||0).toLocaleString('en-IN')}</td>
                      <td className="px-4 py-3 font-mono" style={{ color:'var(--text2)' }}>{b.coupon_rate ? `${b.coupon_rate}%` : '—'}</td>
                      <td className="px-4 py-3 font-mono" style={{ color:'var(--text3)' }}>{sym}{Math.round(inv).toLocaleString('en-IN')}</td>
                      <td className="px-4 py-3 font-mono font-bold" style={{ color:'var(--text)' }}>{sym}{Math.round(cur).toLocaleString('en-IN')}</td>
                      <td className="px-4 py-3 font-bold" style={{ color: Number(ret)>=0?'var(--income)':'var(--rose)' }}>{Number(ret)>=0?'+':''}{ret}%</td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1">
                          <button onClick={() => setEditItem({ ...b, _type: 'bond' })} style={{ color:'var(--text3)' }}><Pencil size={13}/></button>
                          <button onClick={() => deleteItem(b.id)} style={{ color:'var(--rose)' }}><Trash2 size={13}/></button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showAdd   && <AddInvestmentModal onClose={() => setShowAdd(false)} defaultType="bond" />}
      {editItem  && <AddInvestmentModal onClose={() => setEditItem(null)} defaultType="bond" editData={editItem} />}
      {showPdf   && <PdfUploadModal onClose={() => setShowPdf(false)} investmentType="bond" />}
      {showVoice && <VoiceInputModal onClose={() => setShowVoice(false)} investmentType="bond" />}
      {showExcel && <ExcelUploadModal onClose={() => setShowExcel(false)} investmentType="bond" />}
    </InvPageShell>
  )
}
