'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import InvPageShell, { InvEmptyState } from './InvPageShell'
import AddInvestmentModal from '@/components/forms/AddInvestmentModal'
import { PdfUploadModal } from '@/components/forms/PdfUploadModal'
import { VoiceInputModal } from '@/components/forms/VoiceInputModal'
import { ExcelUploadModal } from '@/components/forms/ExcelUploadModal'
import { Pencil, Trash2, TrendingUp, TrendingDown } from 'lucide-react'
import { useViewStore } from '@/store/viewStore'

export default function StocksClient({ data }: { data: any[] }) {
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

  const totalInvested = filtered.reduce((a, s) => a + s.quantity * s.avg_buy_price, 0)
  const totalCurrent  = filtered.reduce((a, s) => a + s.quantity * (s.current_price ?? s.avg_buy_price), 0)
  const totalReturn   = totalInvested > 0 ? ((totalCurrent - totalInvested) / totalInvested * 100).toFixed(2) : '0.00'
  const dailyPnL      = filtered.reduce((a, s) => a + (Number(s.daily_change ?? 0)), 0)

  async function deleteItem(id: string) {
    if (!confirm('Delete this stock entry?')) return
    await supabase.from('stocks').delete().eq('id', id)
    router.refresh()
  }

  const sym = (s: any) => s.currency === 'AED' ? 'AED ' : '₹'

  return (
    <InvPageShell title="Stocks" subtitle="Equity Positions · NSE / BSE" count={filtered.length}
      totalValue={`₹${Math.round(totalCurrent).toLocaleString('en-IN')}`}
      onAdd={() => setShowAdd(true)} onPdf={() => setShowPdf(true)} onVoice={() => setShowVoice(true)}
      onExcel={() => setShowExcel(true)}>

      {/* Summary */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'Total Invested',  value: `₹${Math.round(totalInvested).toLocaleString('en-IN')}`, color: 'var(--blue)' },
          { label: 'Current Value',   value: `₹${Math.round(totalCurrent).toLocaleString('en-IN')}`,  color: 'var(--sage)' },
          { label: 'Total Returns',   value: `${Number(totalReturn)>=0?'+':''}${totalReturn}%`,        color: Number(totalReturn)>=0?'var(--income)':'var(--rose)' },
          { label: 'Today\'s P&L',   value: `${dailyPnL>=0?'▲':'▼'} ₹${Math.abs(Math.round(dailyPnL)).toLocaleString('en-IN')}`, color: dailyPnL>=0?'var(--income)':'var(--rose)' },
        ].map(c => (
          <div key={c.label} className="wl-card p-3">
            <div className="text-[10px] uppercase tracking-wider mb-1" style={{ color: 'var(--text3)' }}>{c.label}</div>
            <div className="text-[17px] font-bold font-mono" style={{ color: c.color }}>{c.value}</div>
          </div>
        ))}
      </div>

      {/* Stock cards grid */}
      {filtered.length === 0 ? <InvEmptyState msg="No stocks yet. Click Add New or upload a statement." /> : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((s, i) => {
            const curVal = s.quantity * (s.current_price ?? s.avg_buy_price)
            const invVal = s.quantity * s.avg_buy_price
            const ret = invVal > 0 ? ((curVal-invVal)/invVal*100).toFixed(1) : '0.0'
            const isPos = Number(ret) >= 0
            return (
              <div key={s.id ?? i} className="wl-card p-4">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <div className="text-[13px] font-bold" style={{ color: 'var(--text)' }}>{s.name}</div>
                    <div className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text3)' }}>{s.exchange} · {s.sector ?? 'Equity'} · {s.currency}</div>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => setEditItem({ ...s, _type: 'stock' })} className="p-1 rounded" style={{ color: 'var(--text3)' }}><Pencil size={12} /></button>
                    <button onClick={() => deleteItem(s.id)} className="p-1 rounded" style={{ color: 'var(--rose)' }}><Trash2 size={12} /></button>
                  </div>
                </div>
                <div className="flex items-center justify-between mb-1">
                  <div className="text-[20px] font-bold font-mono" style={{ color: 'var(--text)' }}>{sym(s)}{Math.round(curVal).toLocaleString('en-IN')}</div>
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ background: isPos?'var(--income-bg)':'var(--rose-bg)', color: isPos?'var(--income)':'var(--rose)' }}>
                    {isPos?'+':''}{ret}%
                  </span>
                </div>
                <div className="flex justify-between text-[10px] mt-2" style={{ color: 'var(--text3)' }}>
                  <span>Qty: {s.quantity}</span>
                  <span>Avg: {sym(s)}{Number(s.avg_buy_price).toLocaleString('en-IN')}</span>
                  {s.current_price && <span style={{ color: isPos?'var(--income)':'var(--rose)' }}>{isPos?<TrendingUp size={10} className="inline"/>:<TrendingDown size={10} className="inline"/>} {sym(s)}{s.current_price.toLocaleString()}</span>}
                </div>
                {s.daily_change != null && (
                  <div className="text-[10px] mt-1 font-semibold" style={{ color: Number(s.daily_change)>=0?'var(--income)':'var(--rose)' }}>
                    Today: {Number(s.daily_change)>=0?'▲':'▼'} {sym(s)}{Math.abs(Number(s.daily_change)).toLocaleString()}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {showAdd   && <AddInvestmentModal onClose={() => setShowAdd(false)} defaultType="stock" />}
      {editItem  && <AddInvestmentModal onClose={() => setEditItem(null)} defaultType="stock" editData={editItem} />}
      {showPdf   && <PdfUploadModal onClose={() => setShowPdf(false)} investmentType="stock" />}
      {showVoice && <VoiceInputModal onClose={() => setShowVoice(false)} investmentType="stock" />}
      {showExcel && <ExcelUploadModal onClose={() => setShowExcel(false)} investmentType="stock" />}
    </InvPageShell>
  )
}
