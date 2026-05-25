'use client'
import { useState } from 'react'
import { useViewStore } from '@/store/viewStore'
import MetricCard from '@/components/dashboard/MetricCard'
import { CreditCard, Plus, AlertTriangle, Clock } from 'lucide-react'
import AddAccountModal from '@/components/forms/AddAccountModal'


const FX = 22.80
function toINR(amt: number, cur: string) { return cur === 'AED' ? amt * FX : amt }

export default function CardsClient({ cards }: { cards: any[] }) {
  const { view } = useViewStore()
  const [showAdd, setShowAdd] = useState(false)

  const filtered = view === 'uae' ? cards.filter(c => c.currency === 'AED')
    : view === 'india' ? cards.filter(c => c.currency === 'INR') : cards

  const conv = (amt: number, cur: string) => view === 'consolidated' ? toINR(amt, cur) : amt
  const sym  = view === 'uae' ? 'AED ' : '₹'

  const totalBal   = filtered.reduce((a, c) => a + conv(Number(c.outstanding_bal ?? 0), c.currency), 0)
  const totalLimit = filtered.reduce((a, c) => a + conv(Number(c.credit_limit ?? 0), c.currency), 0)
  const totalMinDue= filtered.reduce((a, c) => a + conv(Number(c.minimum_due ?? 0), c.currency), 0)
  const overallUtil = totalLimit > 0 ? Math.round(totalBal / totalLimit * 100) : 0

  const today = new Date()

  return (
    <div className="space-y-5 animate-fade-up">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-white">Credit Cards & Liabilities</h1>
          <p className="text-xs text-slate-500 mt-0.5">{filtered.length} active cards</p>
        </div>
        <button onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-black text-[12px] font-bold"
          style={{ background: 'linear-gradient(135deg,#00C9A7,#4A90D9)' }}>
          <Plus size={14} /> Add Card
        </button>
      </div>

      {/* AI Alert */}
      {overallUtil > 30 && (
        <div className="flex items-start gap-3 bg-[#F4A535]/8 border border-[#F4A535]/20 rounded-xl px-4 py-3">
          <AlertTriangle size={15} className="text-[#F4A535] flex-shrink-0 mt-0.5" />
          <div className="text-[12px] text-slate-300">
            <strong className="text-[#F4A535]">Utilization Alert: </strong>
            Overall credit utilization is <strong>{overallUtil}%</strong>, above the recommended 30% threshold.
            {filtered.filter(c => Number(c.outstanding_bal)/Number(c.credit_limit) > 0.5).length > 0 &&
              ` ${filtered.filter(c => Number(c.outstanding_bal)/Number(c.credit_limit) > 0.5).length} card(s) exceed 50% — prioritize paying these down.`}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard label="Total Outstanding" value={`${sym}${Math.round(totalBal).toLocaleString('en-IN')}`}   accent="rose" />
        <MetricCard label="Total Credit Limit" value={`${sym}${Math.round(totalLimit).toLocaleString('en-IN')}`} accent="blue" />
        <MetricCard label="Minimum Due"        value={`${sym}${Math.round(totalMinDue).toLocaleString('en-IN')}`} accent="gold" />
        <MetricCard label="Overall Utilization" value={`${overallUtil}%`} delta={overallUtil > 30 ? '⚠ High' : '✓ Good'} positive={overallUtil <= 30} accent={overallUtil > 30 ? 'rose' : 'teal'} />
      </div>

      {filtered.length === 0 ? (
        <div className="bg-[#162032] border border-white/7 border-dashed rounded-xl py-16 text-center">
          <CreditCard size={32} className="mx-auto text-slate-700 mb-3" />
          <div className="text-slate-500 text-sm mb-4">No credit cards added yet</div>
          <button onClick={() => setShowAdd(true)} className="px-4 py-2 rounded-lg text-black text-[12px] font-bold" style={{ background: 'linear-gradient(135deg,#00C9A7,#4A90D9)' }}>
            Add Credit Card
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((card: any, i: number) => {
            const util = card.credit_limit > 0 ? Math.round(Number(card.outstanding_bal) / Number(card.credit_limit) * 100) : 0
            const lSym = card.currency === 'AED' ? 'AED ' : '₹'
            const daysLeft = card.due_date ? Math.ceil((new Date(card.due_date).getTime() - today.getTime()) / 86400000) : null
            const isUrgent = daysLeft !== null && daysLeft <= 5
            const isHigh   = util > 50
            const isMed    = util > 30

            return (
              <div key={i} className={`bg-[#162032] border rounded-xl p-5 relative overflow-hidden transition-all ${isHigh ? 'border-rose-500/25' : isMed ? 'border-[#F4A535]/20' : 'border-white/7'}`}>
                {/* Top accent */}
                <div className="absolute top-0 left-0 right-0 h-[2px]" style={{ background: isHigh ? '#E8556D' : isMed ? '#F4A535' : '#00C9A7' }} />

                {/* Due date badge */}
                {daysLeft !== null && (
                  <div className={`absolute top-4 right-4 flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-lg ${isUrgent ? 'bg-rose-500/15 text-rose-400' : 'bg-[#F4A535]/12 text-[#F4A535]'}`}>
                    <Clock size={10} /> {daysLeft}d to due {isUrgent ? '⚠' : ''}
                  </div>
                )}

                <div className="mb-4 pr-20">
                  <div className="text-[14px] font-bold text-white">{card.name}</div>
                  <div className="text-[11px] text-slate-500">{card.bank_name} · {card.country}</div>
                </div>

                {/* Utilization bar */}
                <div className="mb-4">
                  <div className="flex justify-between text-[10px] mb-1.5">
                    <span className="text-slate-500">Utilization</span>
                    <span className={`font-bold ${isHigh ? 'text-rose-400' : isMed ? 'text-[#F4A535]' : 'text-[#3CC68A]'}`}>{util}%</span>
                  </div>
                  <div className="h-2 bg-white/6 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{
                      width: `${Math.min(util, 100)}%`,
                      background: isHigh ? '#E8556D' : isMed ? '#F4A535' : '#3CC68A'
                    }} />
                  </div>
                </div>

                {/* Metrics grid */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-[#1E2D40] rounded-lg p-2.5">
                    <div className="text-[9px] text-slate-500 uppercase tracking-wider mb-1">Balance</div>
                    <div className="text-[13px] font-bold font-mono text-rose-400">{lSym}{Number(card.outstanding_bal ?? 0).toLocaleString('en-IN')}</div>
                  </div>
                  <div className="bg-[#1E2D40] rounded-lg p-2.5">
                    <div className="text-[9px] text-slate-500 uppercase tracking-wider mb-1">Limit</div>
                    <div className="text-[13px] font-bold font-mono text-white">{lSym}{Number(card.credit_limit ?? 0).toLocaleString('en-IN')}</div>
                  </div>
                  <div className="bg-[#1E2D40] rounded-lg p-2.5">
                    <div className="text-[9px] text-slate-500 uppercase tracking-wider mb-1">Min Due</div>
                    <div className="text-[13px] font-bold font-mono text-[#F4A535]">{lSym}{Number(card.minimum_due ?? 0).toLocaleString('en-IN')}</div>
                  </div>
                  <div className="bg-[#1E2D40] rounded-lg p-2.5">
                    <div className="text-[9px] text-slate-500 uppercase tracking-wider mb-1">Due Date</div>
                    <div className="text-[13px] font-bold text-white">{card.due_date ?? '—'}</div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
      {showAdd && <AddAccountModal onClose={() => setShowAdd(false)} type="credit_card" />}
    </div>
  )
}
