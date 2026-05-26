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

  const totalBal    = filtered.reduce((a, c) => a + conv(Number(c.outstanding_bal ?? 0), c.currency), 0)
  const totalLimit  = filtered.reduce((a, c) => a + conv(Number(c.credit_limit ?? 0), c.currency), 0)
  const totalMinDue = filtered.reduce((a, c) => a + conv(Number(c.minimum_due ?? 0), c.currency), 0)
  const overallUtil = totalLimit > 0 ? Math.round(totalBal / totalLimit * 100) : 0

  const today = new Date()

  return (
    <div className="space-y-5 animate-fade-up">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--text)' }}>Credit Cards &amp; Liabilities</h1>
          <p className="text-[12px] mt-0.5" style={{ color: 'var(--text3)' }}>{filtered.length} active cards</p>
        </div>
        <button onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-white text-[12px] font-bold"
          style={{ background: 'var(--sage)' }}>
          <Plus size={14} /> Add Card
        </button>
      </div>

      {overallUtil > 30 && (
        <div className="flex items-start gap-3 rounded-xl px-4 py-3"
          style={{ background: 'var(--gold-bg)', border: '1px solid var(--gold)', color: 'var(--text2)' }}>
          <AlertTriangle size={15} className="flex-shrink-0 mt-0.5" style={{ color: 'var(--gold)' }} />
          <div className="text-[12px]">
            <strong style={{ color: 'var(--gold)' }}>Utilization Alert: </strong>
            Overall credit utilization is <strong>{overallUtil}%</strong>, above the recommended 30% threshold.
            {filtered.filter(c => Number(c.outstanding_bal) / Number(c.credit_limit) > 0.5).length > 0 &&
              ` ${filtered.filter(c => Number(c.outstanding_bal) / Number(c.credit_limit) > 0.5).length} card(s) exceed 50% — prioritize paying these down.`}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard label="Total Outstanding"  value={`${sym}${Math.round(totalBal).toLocaleString('en-IN')}`}   accent="rose" />
        <MetricCard label="Total Credit Limit" value={`${sym}${Math.round(totalLimit).toLocaleString('en-IN')}`} accent="blue" />
        <MetricCard label="Minimum Due"        value={`${sym}${Math.round(totalMinDue).toLocaleString('en-IN')}`} accent="gold" />
        <MetricCard label="Overall Utilization" value={`${overallUtil}%`}
          delta={overallUtil > 30 ? '⚠ High' : '✓ Good'} positive={overallUtil <= 30}
          accent={overallUtil > 30 ? 'rose' : 'teal'} />
      </div>

      {filtered.length === 0 ? (
        <div className="wl-card py-16 text-center" style={{ borderStyle: 'dashed' }}>
          <CreditCard size={32} className="mx-auto mb-3" style={{ color: 'var(--border2)' }} />
          <div className="text-[13px] mb-4" style={{ color: 'var(--text3)' }}>No credit cards added yet</div>
          <button onClick={() => setShowAdd(true)}
            className="px-4 py-2 rounded-lg text-white text-[12px] font-bold"
            style={{ background: 'var(--sage)' }}>
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
            const isHigh = util > 50
            const isMed  = util > 30

            const accentColor = isHigh ? 'var(--rose)' : isMed ? 'var(--gold)' : 'var(--income)'
            const borderColor = isHigh ? 'var(--rose)' : isMed ? 'var(--gold)' : 'var(--border)'

            return (
              <div key={i} className="wl-card p-5 relative overflow-hidden"
                style={{ borderColor }}>
                <div className="absolute top-0 left-0 right-0 h-[3px]" style={{ background: accentColor }} />

                {daysLeft !== null && (
                  <div className="absolute top-4 right-4 flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-lg"
                    style={isUrgent
                      ? { background: 'var(--rose-bg)', color: 'var(--rose)' }
                      : { background: 'var(--gold-bg)', color: 'var(--gold)' }}>
                    <Clock size={10} /> {daysLeft}d to due {isUrgent ? '⚠' : ''}
                  </div>
                )}

                <div className="mb-4 pr-20">
                  <div className="text-[14px] font-bold" style={{ color: 'var(--text)' }}>{card.name}</div>
                  <div className="text-[11px]" style={{ color: 'var(--text3)' }}>{card.bank_name} · {card.country}</div>
                </div>

                <div className="mb-4">
                  <div className="flex justify-between text-[10px] mb-1.5">
                    <span style={{ color: 'var(--text3)' }}>Utilization</span>
                    <span className="font-bold" style={{ color: accentColor }}>{util}%</span>
                  </div>
                  <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--bg2)' }}>
                    <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(util, 100)}%`, background: accentColor }} />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {[
                    { label: 'Balance',  val: `${lSym}${Number(card.outstanding_bal ?? 0).toLocaleString('en-IN')}`, color: 'var(--rose)' },
                    { label: 'Limit',    val: `${lSym}${Number(card.credit_limit ?? 0).toLocaleString('en-IN')}`,    color: 'var(--text)' },
                    { label: 'Min Due',  val: `${lSym}${Number(card.minimum_due ?? 0).toLocaleString('en-IN')}`,      color: 'var(--gold)' },
                    { label: 'Due Date', val: card.due_date ?? '—',                                                    color: 'var(--text)' },
                  ].map(item => (
                    <div key={item.label} className="rounded-lg p-2.5"
                      style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}>
                      <div className="text-[9px] uppercase tracking-wider mb-1" style={{ color: 'var(--text3)' }}>{item.label}</div>
                      <div className="text-[13px] font-bold font-mono" style={{ color: item.color }}>{item.val}</div>
                    </div>
                  ))}
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
