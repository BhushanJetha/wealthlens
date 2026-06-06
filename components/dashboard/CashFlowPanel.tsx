'use client'
import { CalendarDays, Calendar } from 'lucide-react'
import { useViewStore } from '@/store/viewStore'

export function CashFlowPanel({ loans, insurance, sym }: { loans: any[]; insurance: any[]; sym: string }) {
  const { fxRate: FX } = useViewStore()
  const today = new Date()

  function toINR(amt: number, cur: string) { return cur === 'AED' ? amt * FX : amt }

  const next7: Array<{ name: string; amount: number; sym: string }> = []
  const next30: Array<{ name: string; amount: number; sym: string }> = []

  loans.forEach(l => {
    if (!l.next_emi_date) return
    const d = Math.ceil((new Date(l.next_emi_date).getTime() - today.getTime()) / 86400000)
    const entry = { name: `${l.name} EMI`, amount: Number(l.emi_amount), sym: l.currency === 'AED' ? 'AED ' : '₹' }
    if (d <= 7)  next7.push(entry)
    if (d <= 30) next30.push(entry)
  })

  insurance.forEach(p => {
    if (!p.next_premium_date) return
    const d = Math.ceil((new Date(p.next_premium_date).getTime() - today.getTime()) / 86400000)
    const entry = { name: p.policy_name, amount: Number(p.annual_premium), sym: p.currency === 'AED' ? 'AED ' : '₹' }
    if (d <= 7)  next7.push(entry)
    if (d <= 30) next30.push(entry)
  })

  const total7  = next7.reduce((a, i) => a + toINR(i.amount, i.sym === 'AED ' ? 'AED' : 'INR'), 0)
  const total30 = next30.reduce((a, i) => a + toINR(i.amount, i.sym === 'AED ' ? 'AED' : 'INR'), 0)

  return (
    <div className="wl-card p-4">
      <div className="text-[11px] font-bold uppercase tracking-wider mb-3" style={{ color: 'var(--text3)' }}>
        Predictive Cash Flow
      </div>
      <div className="grid grid-cols-2 gap-3">
        {[
          { icon: <CalendarDays size={11} />, label: 'Next 7 Days', total: total7, items: next7, color: 'var(--rose)' },
          { icon: <Calendar size={11} />,     label: 'Next 30 Days', total: total30, items: next30, color: 'var(--gold)' },
        ].map(({ icon, label, total, items, color }) => (
          <div key={label} className="rounded-xl p-3" style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}>
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-semibold mb-2" style={{ color: 'var(--text3)' }}>
              {icon} {label}
            </div>
            <div className="text-[20px] font-bold font-mono mb-2" style={{ color: 'var(--text)' }}>
              ₹{Math.round(total).toLocaleString('en-IN')}
            </div>
            <div className="space-y-1">
              {items.length === 0
                ? <div className="text-[11px]" style={{ color: 'var(--text3)' }}>No dues ✓</div>
                : items.map((item, i) => (
                    <div key={i} className="flex justify-between text-[10px]">
                      <span className="truncate" style={{ color: 'var(--text3)' }}>{item.name}</span>
                      <span className="font-mono font-semibold" style={{ color }}>{item.sym}{item.amount.toLocaleString('en-IN')}</span>
                    </div>
                  ))
              }
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
