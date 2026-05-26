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
import { Pencil, Trash2, Gem } from 'lucide-react'

const TYPE_COLORS: Record<string,string> = {
  physical: 'var(--gold)', sgb: 'var(--sage)', gold_etf: 'var(--blue)', gold_mf: 'var(--purple)',
}

export default function GoldClient({ data }: { data: any[] }) {
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

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total Invested', value: `${sym}${Math.round(totalInvested).toLocaleString('en-IN')}`, color: 'var(--blue)' },
          { label: 'Current Value',  value: `${sym}${Math.round(totalCurrent).toLocaleString('en-IN')}`,  color: 'var(--gold)' },
          { label: 'Returns',        value: `${Number(totalReturn)>=0?'+':''}${totalReturn}%`,             color: Number(totalReturn)>=0?'var(--income)':'var(--rose)' },
          { label: 'Total Grams',    value: `${totalGrams.toFixed(2)}g`,                                   color: 'var(--text)' },
        ].map(c => (
          <div key={c.label} className="wl-card p-3">
            <div className="text-[10px] uppercase tracking-wider mb-1" style={{ color: 'var(--text3)' }}>{c.label}</div>
            <div className="text-[17px] font-bold font-mono" style={{ color: c.color }}>{c.value}</div>
          </div>
        ))}
      </div>

      {filtered.length === 0 ? <InvEmptyState msg="No gold investments yet. Add physical gold, SGB, or gold ETFs." /> : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((g, i) => {
            const cur = g.current_price_per_gram && g.quantity_grams
              ? Number(g.current_price_per_gram) * Number(g.quantity_grams)
              : Number(g.invested_amount || 0)
            const inv = Number(g.invested_amount || 0)
            const ret = inv > 0 ? ((cur-inv)/inv*100).toFixed(1) : '0.0'
            const col = TYPE_COLORS[g.gold_type] || 'var(--gold)'
            return (
              <div key={g.id ?? i} className="wl-card p-4">
                <div className="flex justify-between items-start mb-2">
                  <div className="flex items-start gap-2">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: col + '18' }}>
                      <Gem size={14} style={{ color: col }} />
                    </div>
                    <div>
                      <div className="text-[13px] font-bold" style={{ color: 'var(--text)' }}>{g.name}</div>
                      <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold uppercase" style={{ background: col + '18', color: col }}>{g.gold_type?.replace('_',' ')}</span>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => setEditItem({ ...g, _type: 'gold' })} style={{ color:'var(--text3)' }}><Pencil size={12} /></button>
                    <button onClick={() => deleteItem(g.id)} style={{ color:'var(--rose)' }}><Trash2 size={12} /></button>
                  </div>
                </div>
                <div className="text-[20px] font-bold font-mono mb-1" style={{ color: 'var(--text)' }}>
                  {sym}{Math.round(cur).toLocaleString('en-IN')}
                </div>
                <div className="flex justify-between text-[10px]" style={{ color: 'var(--text3)' }}>
                  <span>Invested: {sym}{Math.round(inv).toLocaleString('en-IN')}</span>
                  <span className="font-bold" style={{ color: Number(ret)>=0?'var(--income)':'var(--rose)' }}>{Number(ret)>=0?'+':''}{ret}%</span>
                </div>
                {g.quantity_grams && (
                  <div className="text-[10px] mt-1" style={{ color: 'var(--text3)' }}>
                    {g.quantity_grams}g @ {sym}{g.buy_price_per_gram}/g
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {showAdd   && <AddInvestmentModal onClose={() => setShowAdd(false)} defaultType="gold" />}
      {editItem  && <AddInvestmentModal onClose={() => setEditItem(null)} defaultType="gold" editData={editItem} />}
      {showPdf   && <PdfUploadModal onClose={() => setShowPdf(false)} investmentType="gold" />}
      {showVoice && <VoiceInputModal onClose={() => setShowVoice(false)} investmentType="gold" />}
      {showExcel && <ExcelUploadModal onClose={() => setShowExcel(false)} investmentType="gold" />}
    </InvPageShell>
  )
}
