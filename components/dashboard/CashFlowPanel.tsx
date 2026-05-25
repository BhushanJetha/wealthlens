'use client'
import { CalendarDays, Calendar } from 'lucide-react'

export function CashFlowPanel({ loans, insurance, sym }: { loans: any[]; insurance: any[]; sym: string }) {
  const today = new Date()
  const FX = 22.80

  function toINR(amt: number, cur: string) { return cur === 'AED' ? amt * FX : amt }

  const next7: Array<{ name: string; amount: number; sym: string }> = []
  const next30: Array<{ name: string; amount: number; sym: string }> = []

  loans.forEach(l => {
    if (!l.next_emi_date) return
    const d = Math.ceil((new Date(l.next_emi_date).getTime() - today.getTime()) / 86400000)
    const entry = { name: `${l.name} EMI`, amount: Number(l.emi_amount), sym: l.currency === 'AED' ? 'AED ' : '₹' }
    if (d <= 7) next7.push(entry)
    if (d <= 30) next30.push(entry)
  })

  insurance.forEach(p => {
    if (!p.next_premium_date) return
    const d = Math.ceil((new Date(p.next_premium_date).getTime() - today.getTime()) / 86400000)
    const entry = { name: `${p.policy_name}`, amount: Number(p.annual_premium), sym: p.currency === 'AED' ? 'AED ' : '₹' }
    if (d <= 7) next7.push(entry)
    if (d <= 30) next30.push(entry)
  })

  const total7  = next7.reduce((a, i) => a + toINR(i.amount, i.sym === 'AED ' ? 'AED' : 'INR'), 0)
  const total30 = next30.reduce((a, i) => a + toINR(i.amount, i.sym === 'AED ' ? 'AED' : 'INR'), 0)

  return (
    <div className="bg-[#162032] border border-white/7 rounded-xl p-4">
      <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-3">Predictive Cash Flow</div>
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-[#1E2D40] rounded-lg p-3">
          <div className="flex items-center gap-1.5 text-[10px] text-slate-500 uppercase tracking-wider font-semibold mb-2">
            <CalendarDays size={11} /> Next 7 Days
          </div>
          <div className="text-[22px] font-bold font-mono text-white">₹{Math.round(total7).toLocaleString('en-IN')}</div>
          <div className="mt-2 space-y-1">
            {next7.length === 0
              ? <div className="text-[11px] text-slate-600">No dues in 7 days ✓</div>
              : next7.map((item, i) => (
                <div key={i} className="flex justify-between text-[10px]">
                  <span className="text-slate-500 truncate">{item.name}</span>
                  <span className="text-rose-400 font-mono font-semibold">{item.sym}{item.amount.toLocaleString('en-IN')}</span>
                </div>
              ))
            }
          </div>
        </div>
        <div className="bg-[#1E2D40] rounded-lg p-3">
          <div className="flex items-center gap-1.5 text-[10px] text-slate-500 uppercase tracking-wider font-semibold mb-2">
            <Calendar size={11} /> Next 30 Days
          </div>
          <div className="text-[22px] font-bold font-mono text-white">₹{Math.round(total30).toLocaleString('en-IN')}</div>
          <div className="mt-2 space-y-1">
            {next30.length === 0
              ? <div className="text-[11px] text-slate-600">No dues in 30 days ✓</div>
              : next30.map((item, i) => (
                <div key={i} className="flex justify-between text-[10px]">
                  <span className="text-slate-500 truncate">{item.name}</span>
                  <span className="text-[#F4A535] font-mono font-semibold">{item.sym}{item.amount.toLocaleString('en-IN')}</span>
                </div>
              ))
            }
          </div>
        </div>
      </div>
    </div>
  )
}
