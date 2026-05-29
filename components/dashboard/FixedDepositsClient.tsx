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

      <HolderFilter />

      <FilterBar
        search={search} onSearch={setSearch}
        sort={sort} onSort={setSort} sortOptions={SORT_OPTS}
        resultCount={filtered.length} totalCount={base.length}
        searchPlaceholder="Search by FD name or bank…"
      />

      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Total Principal', value: `₹${Math.round(totalPrincipal).toLocaleString('en-IN')}`, color: 'var(--blue)' },
          { label: 'Total Interest', value: `+₹${Math.round(totalInterest).toLocaleString('en-IN')}`, color: 'var(--income)' },
          { label: 'Avg Rate', value: `${avgRate}% p.a.`, color: 'var(--gold)' },
        ].map(c => (
          <div key={c.label} className="wl-card p-3">
            <div className="text-[10px] uppercase tracking-wider mb-1" style={{ color: 'var(--text3)' }}>{c.label}</div>
            <div className="text-[18px] font-bold font-mono" style={{ color: c.color }}>{c.value}</div>
          </div>
        ))}
      </div>

      {/* Chart */}
      {chartData.length > 0 && (
        <div className="wl-card p-4">
          <div className="text-[11px] font-bold uppercase tracking-wider mb-3" style={{ color: 'var(--text3)' }}>Principal by FD (₹ thousands)</div>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="name" tick={{ fill:'var(--text3)', fontSize:10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill:'var(--text3)', fontSize:10 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:8, fontSize:11 }} formatter={(v:any)=>[`₹${v}K`,'Principal']} />
              <Bar dataKey="principal" fill="var(--blue)" radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* FD Cards */}
      {filtered.length === 0 ? <InvEmptyState msg="No fixed deposits match your filters." /> : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((f, i) => {
            const matAmt = f.maturity_amt ?? (Number(f.principal)*(1+Number(f.interest_rate)/100))
            const earned = matAmt - Number(f.principal)
            const daysLeft = Math.ceil((new Date(f.maturity_date).getTime() - Date.now()) / 86400000)
            const s = f.currency === 'AED' ? 'AED ' : '₹'
            return (
              <div key={f.id ?? i} className="wl-card p-4">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <div className="text-[13px] font-bold" style={{ color: 'var(--text)' }}>{f.name}</div>
                    <div className="text-[10px]" style={{ color: 'var(--text3)' }}>{f.bank_name} · {f.currency}</div>
                    {f.holder_name && f.holder_name !== 'Self' && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded font-semibold mt-0.5 inline-block"
                        style={{ background: 'var(--blue-bg)', color: 'var(--blue)' }}>{f.holder_name}</span>
                    )}
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => setEditItem({ ...f, _type: 'fixed_deposit' })} className="p-1 rounded" style={{ color: 'var(--text3)' }}><Pencil size={12} /></button>
                    <button onClick={() => deleteItem(f.id)} className="p-1 rounded" style={{ color: 'var(--rose)' }}><Trash2 size={12} /></button>
                  </div>
                </div>
                <div className="text-[11px] font-bold mb-2 px-2 py-0.5 rounded-full inline-block" style={{ background:'var(--gold-bg)', color:'var(--gold)' }}>{f.interest_rate}% p.a.</div>
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div>
                    <div style={{ color:'var(--text3)' }}>Principal</div>
                    <div className="font-mono font-bold" style={{ color:'var(--text)' }}>{s}{Number(f.principal).toLocaleString('en-IN')}</div>
                  </div>
                  <div>
                    <div style={{ color:'var(--text3)' }}>Interest</div>
                    <div className="font-mono font-bold" style={{ color:'var(--income)' }}>+{s}{Math.round(earned).toLocaleString('en-IN')}</div>
                  </div>
                </div>
                <div className="flex items-center gap-1 mt-2 text-[10px]" style={{ color: daysLeft < 30 ? 'var(--rose)' : 'var(--text3)' }}>
                  <Clock size={10} />
                  {daysLeft > 0 ? `Matures in ${daysLeft} days (${f.maturity_date})` : `Matured on ${f.maturity_date}`}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {showAdd   && <AddInvestmentModal onClose={() => setShowAdd(false)} defaultType="fixed_deposit" />}
      {editItem  && <AddInvestmentModal onClose={() => setEditItem(null)} defaultType="fixed_deposit" editData={editItem} />}
      {showPdf   && <PdfUploadModal onClose={() => setShowPdf(false)} investmentType="fixed_deposit" />}
      {showVoice && <VoiceInputModal onClose={() => setShowVoice(false)} investmentType="fixed_deposit" />}
      {showExcel && <ExcelUploadModal onClose={() => setShowExcel(false)} investmentType="fixed_deposit" />}
    </InvPageShell>
  )
}
