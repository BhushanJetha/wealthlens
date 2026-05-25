'use client'
import { useState, useMemo } from 'react'
import { useViewStore } from '@/store/viewStore'
import MetricCard from '@/components/dashboard/MetricCard'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { Plus, Building2 } from 'lucide-react'
import AddLoanModal from '@/components/forms/AddLoanModal'

const FX = 22.80
function toINR(amt: number, cur: string) { return cur === 'AED' ? amt * FX : amt }

export default function LoansClient({ loans }: { loans: any[] }) {
  const { view } = useViewStore()
  const [showAdd, setShowAdd] = useState(false)
  const [extraPayments, setExtraPayments] = useState<Record<string, number>>({})

  const filtered = view === 'uae' ? loans.filter(l => l.currency === 'AED')
    : view === 'india' ? loans.filter(l => l.currency === 'INR') : loans

  const conv = (amt: number, cur: string) => view === 'consolidated' ? toINR(amt, cur) : amt
  const sym  = view === 'uae' ? 'AED ' : '₹'

  const totalOutstanding = filtered.reduce((a, l) => a + conv(Number(l.outstanding_amt), l.currency), 0)
  const totalEMI         = filtered.reduce((a, l) => a + conv(Number(l.emi_amount), l.currency), 0)
  const totalSanctioned  = filtered.reduce((a, l) => a + conv(Number(l.sanctioned_amt), l.currency), 0)
  const totalInterestPaid = filtered.reduce((a, l) => {
    const paidAmt = (Number(l.sanctioned_amt) - Number(l.outstanding_amt))
    const interestPaid = Number(l.emi_amount) * (l.months_paid ?? 0) - paidAmt
    return a + conv(Math.max(0, interestPaid), l.currency)
  }, 0)

  // Amortization schedule — next 12 months for first loan
  const amortData = useMemo(() => {
    const loan = filtered[0]
    if (!loan) return []
    const months: string[] = []
    for (let i = 0; i < 12; i++) {
      const d = new Date(); d.setMonth(d.getMonth() + i)
      months.push(d.toLocaleString('default', { month: 'short', year: '2-digit' }))
    }
    const rate = Number(loan.interest_rate) / 100 / 12
    let balance = Number(loan.outstanding_amt)
    return months.map(month => {
      const interest = Math.round(balance * rate)
      const principal = Math.round(Number(loan.emi_amount) - interest)
      balance = Math.max(0, balance - principal)
      return { month, principal: conv(principal, loan.currency), interest: conv(interest, loan.currency) }
    })
  }, [filtered, view])

  function calcInterestSaved(loan: any, extra: number): number {
    if (!extra) return 0
    const totalMonths = loan.tenure_months - (loan.months_paid ?? 0)
    return Math.round(extra * totalMonths * 0.3)
  }

  return (
    <div className="space-y-5 animate-fade-up">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-white">Home Loans</h1>
          <p className="text-xs text-slate-500 mt-0.5">Amortization · EMI Tracker · Payoff Simulation</p>
        </div>
        <button onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-black text-[12px] font-bold"
          style={{ background: 'linear-gradient(135deg,#00C9A7,#4A90D9)' }}>
          <Plus size={14} /> Add Loan
        </button>
      </div>

      {filtered.length === 0 ? (
        <EmptyLoans onAdd={() => setShowAdd(true)} />
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <MetricCard label="Total Outstanding" value={`${sym}${Math.round(totalOutstanding).toLocaleString('en-IN')}`} accent="rose" />
            <MetricCard label="Monthly EMIs"      value={`${sym}${Math.round(totalEMI).toLocaleString('en-IN')}`}        accent="gold" />
            <MetricCard label="Total Sanctioned"  value={`${sym}${Math.round(totalSanctioned).toLocaleString('en-IN')}`} accent="blue" />
            <MetricCard label="Interest Paid"     value={`${sym}${Math.round(totalInterestPaid).toLocaleString('en-IN')}`} accent="purple" />
          </div>

          {/* Each loan card */}
          {filtered.map((loan: any, i: number) => {
            const s = loan
            const lSym = loan.currency === 'AED' ? 'AED ' : '₹'
            const paidPct = Math.round((Number(s.sanctioned_amt) - Number(s.outstanding_amt)) / Number(s.sanctioned_amt) * 100)
            const monthsRemaining = s.tenure_months - (s.months_paid ?? 0)
            const extra = extraPayments[s.id] ?? 0
            const interestSaved = calcInterestSaved(s, extra)
            const monthsSaved = extra > 0 ? Math.round(interestSaved / Number(s.emi_amount) * 1.5) : 0

            return (
              <div key={i} className="bg-[#162032] border border-white/7 rounded-xl p-5 space-y-4">
                {/* Header */}
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <Building2 size={16} className="text-[#4A90D9]" />
                      <span className="text-[15px] font-bold text-white">{s.name}</span>
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5">{s.bank_name} · {s.interest_rate}% p.a. · {s.tenure_months}mo tenure</div>
                  </div>
                  <span className="text-[12px] font-bold px-3 py-1 rounded-lg bg-[#F4A535]/15 text-[#F4A535]">{paidPct}% paid off</span>
                </div>

                {/* Progress bar */}
                <div>
                  <div className="h-3 bg-white/6 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${paidPct}%`, background: 'linear-gradient(90deg, #00C9A7, #4A90D9)' }} />
                  </div>
                  <div className="flex justify-between text-[10px] text-slate-500 mt-1.5">
                    <span>{lSym}0</span>
                    <span>Outstanding: {lSym}{Number(s.outstanding_amt).toLocaleString('en-IN')}</span>
                    <span>{lSym}{Number(s.sanctioned_amt).toLocaleString('en-IN')}</span>
                  </div>
                </div>

                {/* Metrics */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { label: 'EMI', val: `${lSym}${Number(s.emi_amount).toLocaleString('en-IN')}` },
                    { label: 'Months Remaining', val: `${monthsRemaining} mo` },
                    { label: 'Months Paid', val: `${s.months_paid ?? 0}` },
                    { label: 'Next EMI', val: s.next_emi_date ?? '—' },
                  ].map(item => (
                    <div key={item.label} className="bg-[#1E2D40] rounded-lg p-3">
                      <div className="text-[9px] uppercase tracking-wider text-slate-500 font-bold mb-1">{item.label}</div>
                      <div className="text-[13px] font-bold font-mono text-white">{item.val}</div>
                    </div>
                  ))}
                </div>

                {/* Payoff simulator */}
                <div className="bg-[#1E2D40] rounded-lg p-4">
                  <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-3">Early Payoff Simulation</div>
                  <div className="flex items-center gap-4 flex-wrap">
                    <span className="text-[12px] text-slate-400">Extra monthly payment:</span>
                    <input type="range" min={0} max={Math.round(Number(s.emi_amount) * 0.5)} step={1000}
                      value={extra}
                      onChange={e => setExtraPayments(prev => ({ ...prev, [s.id]: Number(e.target.value) }))}
                      className="flex-1 max-w-[200px] accent-[#00C9A7]" />
                    <span className="text-[14px] font-bold font-mono text-[#00C9A7]">{lSym}{extra.toLocaleString()}</span>
                  </div>
                  {extra > 0 && (
                    <div className="mt-3 flex gap-4 text-[12px]">
                      <span className="text-slate-400">Interest saved: <strong className="text-[#3CC68A]">{lSym}{interestSaved.toLocaleString()}</strong></span>
                      <span className="text-slate-400">Loan ends: <strong className="text-[#00C9A7]">{monthsSaved} months earlier</strong></span>
                    </div>
                  )}
                </div>
              </div>
            )
          })}

          {/* Amortization chart */}
          {amortData.length > 0 && (
            <div className="bg-[#162032] border border-white/7 rounded-xl p-4">
              <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-3">Amortization — Next 12 Months</div>
              <div className="flex gap-4 mb-3 text-[11px]">
                <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-[#00C9A7]" />Principal</span>
                <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-[#E8556D]/70" />Interest</span>
              </div>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={amortData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="month" tick={{ fill:'#6A7F92', fontSize:10 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill:'#6A7F92', fontSize:10 }} axisLine={false} tickLine={false}
                    tickFormatter={v => v >= 100000 ? `${(v/100000).toFixed(0)}L` : v.toLocaleString()} />
                  <Tooltip contentStyle={{ background:'#1E2D40', border:'1px solid rgba(255,255,255,0.1)', borderRadius:8, fontSize:11 }}
                    formatter={(v:any, name:string) => [`${sym}${Number(v).toLocaleString('en-IN')}`, name]} />
                  <Bar dataKey="principal" name="Principal" stackId="a" fill="#00C9A7" radius={[0,0,0,0]} />
                  <Bar dataKey="interest"  name="Interest"  stackId="a" fill="rgba(232,85,109,0.7)" radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </>
      )}

      {showAdd && <AddLoanModal onClose={() => setShowAdd(false)} />}
    </div>
  )
}

function EmptyLoans({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="bg-[#162032] border border-white/7 border-dashed rounded-xl py-16 text-center">
      <Building2 size={32} className="mx-auto text-slate-700 mb-3" />
      <div className="text-slate-500 text-sm mb-4">No home loans added yet</div>
      <button onClick={onAdd} className="px-4 py-2 rounded-lg text-black text-[12px] font-bold" style={{ background: 'linear-gradient(135deg,#00C9A7,#4A90D9)' }}>
        Add Your First Loan
      </button>
    </div>
  )
}
