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
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import { useViewStore } from '@/store/viewStore'

const COLORS = ['#3D7A58','#D4920A','#3B7DD8','#C96A3A','#7C5CBF','#2E7D52']

export default function MutualFundsClient({ data }: { data: any[] }) {
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

  const totalInvested = filtered.reduce((a, m) => a + Number(m.invested_amount), 0)
  const totalCurrent  = filtered.reduce((a, m) => a + m.units * (m.current_nav ?? m.avg_nav), 0)
  const totalReturn   = totalInvested > 0 ? ((totalCurrent - totalInvested) / totalInvested * 100).toFixed(2) : '0.00'

  const typeBreakdown = filtered.reduce((acc: Record<string,number>, m) => { acc[m.fund_type] = (acc[m.fund_type]??0) + m.units*(m.current_nav??m.avg_nav); return acc }, {})
  const pieData = Object.entries(typeBreakdown).map(([name, value]) => ({ name: name.toUpperCase(), value: Math.round(value) }))

  async function deleteItem(id: string) {
    if (!confirm('Delete this mutual fund entry?')) return
    await supabase.from('mutual_funds').delete().eq('id', id)
    router.refresh()
  }

  return (
    <InvPageShell title="Mutual Funds" subtitle="Equity · Debt · Hybrid · ELSS" count={filtered.length}
      totalValue={`₹${Math.round(totalCurrent).toLocaleString('en-IN')}`}
      onAdd={() => setShowAdd(true)} onPdf={() => setShowPdf(true)} onVoice={() => setShowVoice(true)}
      onExcel={() => setShowExcel(true)} onEmail={() => window.open('/dashboard/investments?email=mutual_fund', '_self')}>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Total Invested', value: `₹${Math.round(totalInvested).toLocaleString('en-IN')}`, color: 'var(--blue)' },
          { label: 'Current Value', value: `₹${Math.round(totalCurrent).toLocaleString('en-IN')}`, color: 'var(--sage)' },
          { label: 'Returns', value: `${Number(totalReturn)>=0?'+':''}${totalReturn}%`, color: Number(totalReturn)>=0?'var(--income)':'var(--rose)' },
        ].map(c => (
          <div key={c.label} className="wl-card p-3">
            <div className="text-[10px] uppercase tracking-wider mb-1" style={{ color: 'var(--text3)' }}>{c.label}</div>
            <div className="text-[18px] font-bold font-mono" style={{ color: c.color }}>{c.value}</div>
          </div>
        ))}
      </div>

      {/* Charts row */}
      {data.length > 0 && pieData.length > 0 && (
        <div className="wl-card p-4">
          <div className="text-[11px] font-bold uppercase tracking-wider mb-3" style={{ color: 'var(--text3)' }}>Allocation by Fund Type</div>
          <div className="flex items-center gap-6">
            <ResponsiveContainer width={160} height={160}>
              <PieChart>
                <Pie data={pieData} dataKey="value" cx="50%" cy="50%" innerRadius={45} outerRadius={70} paddingAngle={2}>
                  {pieData.map((_,i) => <Cell key={i} fill={COLORS[i%COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:8, fontSize:11 }} formatter={(v:any)=>[`₹${Number(v).toLocaleString('en-IN')}`,'']} />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex flex-col gap-2">
              {pieData.map((d,i) => (
                <div key={i} className="flex items-center gap-2 text-[11px]">
                  <span className="w-2.5 h-2.5 rounded-sm" style={{ background: COLORS[i%COLORS.length] }} />
                  <span style={{ color: 'var(--text2)' }}>{d.name}</span>
                  <span className="font-mono" style={{ color: 'var(--text)' }}>₹{d.value.toLocaleString('en-IN')}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      {filtered.length === 0 ? <InvEmptyState msg="No mutual funds yet. Click Add New or upload a statement." /> : (
        <div className="wl-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg2)' }}>
                  {['Fund Name','Type','Units','Avg NAV','Current NAV','Invested','Current Value','Returns',''].map(h=>(
                    <th key={h} className="px-4 py-3 text-left text-[10px] uppercase tracking-wider font-bold" style={{ color: 'var(--text3)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((m, i) => {
                  const cur = m.units * (m.current_nav ?? m.avg_nav)
                  const inv = Number(m.invested_amount)
                  const ret = inv > 0 ? ((cur-inv)/inv*100).toFixed(1) : '0.0'
                  return (
                    <tr key={m.id ?? i} style={{ borderBottom: '1px solid var(--border)' }} className="hover:bg-stone-50 transition-colors">
                      <td className="px-4 py-3 font-semibold" style={{ color: 'var(--text)' }}>{m.fund_name}</td>
                      <td className="px-4 py-3"><span className="px-2 py-0.5 rounded text-[10px] uppercase font-semibold" style={{ background:'var(--blue-bg)', color:'var(--blue)' }}>{m.fund_type}</span></td>
                      <td className="px-4 py-3 font-mono" style={{ color: 'var(--text2)' }}>{Number(m.units).toFixed(3)}</td>
                      <td className="px-4 py-3 font-mono" style={{ color: 'var(--text2)' }}>₹{Number(m.avg_nav).toFixed(2)}</td>
                      <td className="px-4 py-3 font-mono" style={{ color: 'var(--text2)' }}>₹{Number(m.current_nav??m.avg_nav).toFixed(2)}</td>
                      <td className="px-4 py-3 font-mono" style={{ color: 'var(--text3)' }}>₹{Math.round(inv).toLocaleString('en-IN')}</td>
                      <td className="px-4 py-3 font-mono font-bold" style={{ color: 'var(--text)' }}>₹{Math.round(cur).toLocaleString('en-IN')}</td>
                      <td className="px-4 py-3 font-bold" style={{ color: Number(ret)>=0?'var(--income)':'var(--rose)' }}>{Number(ret)>=0?'+':''}{ret}%</td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1">
                          <button onClick={() => setEditItem({ ...m, _type: 'mutual_fund' })} className="p-1.5 rounded transition-colors" style={{ color: 'var(--text3)' }}><Pencil size={13} /></button>
                          <button onClick={() => deleteItem(m.id)} className="p-1.5 rounded transition-colors" style={{ color: 'var(--rose)' }}><Trash2 size={13} /></button>
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

      {showAdd    && <AddInvestmentModal onClose={() => setShowAdd(false)} defaultType="mutual_fund" />}
      {editItem   && <AddInvestmentModal onClose={() => setEditItem(null)} defaultType="mutual_fund" editData={editItem} />}
      {showPdf    && <PdfUploadModal onClose={() => setShowPdf(false)} investmentType="mutual_fund" />}
      {showVoice  && <VoiceInputModal onClose={() => setShowVoice(false)} investmentType="mutual_fund" />}
      {showExcel  && <ExcelUploadModal onClose={() => setShowExcel(false)} investmentType="mutual_fund" />}
    </InvPageShell>
  )
}
