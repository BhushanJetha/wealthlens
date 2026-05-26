'use client'
import { useState, useMemo } from 'react'
import { useViewStore } from '@/store/viewStore'
import MetricCard from '@/components/dashboard/MetricCard'
import { Plus, Building2, ArrowRight } from 'lucide-react'
import AddLoanModal from '@/components/forms/AddLoanModal'
import Link from 'next/link'

const FX = 22.80
function toINR(amt: number, cur: string) { return cur === 'AED' ? amt * FX : amt }

const LOAN_CATEGORIES = [
  { type: 'home_loan',    label: 'Home Loan',     color: '#3D7A58', href: '/dashboard/loans/home'     },
  { type: 'car_loan',     label: 'Car Loan',       color: '#3B7DD8', href: '/dashboard/loans/car'      },
  { type: 'bike_loan',    label: 'Bike Loan',      color: '#D4920A', href: '/dashboard/loans/car'      },
  { type: 'gold_loan',    label: 'Gold Loan',      color: '#B45309', href: '/dashboard/loans/gold'     },
  { type: 'loan_on_card', label: 'Loan on Card',   color: '#7C5CBF', href: '/dashboard/loans/card'     },
  { type: 'personal_loan',label: 'Personal Loan',  color: '#C96A3A', href: '/dashboard/loans/personal' },
  { type: 'other_loan',   label: 'Other Loan',     color: '#6B7280', href: '/dashboard/loans/other'    },
]

function fmt(n: number, sym: string) {
  if (Math.abs(n) >= 10000000) return `${sym}${(n/10000000).toFixed(2)}Cr`
  if (Math.abs(n) >= 100000)   return `${sym}${(n/100000).toFixed(2)}L`
  return `${sym}${Math.round(n).toLocaleString('en-IN')}`
}

export default function LoansClient({ loans }: { loans: any[] }) {
  const { view } = useViewStore()
  const [showAdd, setShowAdd] = useState(false)

  const filtered = useMemo(() => {
    if (view === 'uae')   return loans.filter(l => l.currency === 'AED')
    if (view === 'india') return loans.filter(l => l.currency === 'INR')
    return loans
  }, [loans, view])

  const conv  = (amt: number, cur: string) => view === 'consolidated' ? toINR(amt, cur) : amt
  const sym   = view === 'uae' ? 'AED ' : '₹'

  const totalOutstanding = filtered.reduce((a,l) => a + conv(Number(l.outstanding_amt), l.currency), 0)
  const totalEMI         = filtered.reduce((a,l) => a + conv(Number(l.emi_amount), l.currency), 0)
  const totalSanctioned  = filtered.reduce((a,l) => a + conv(Number(l.sanctioned_amt), l.currency), 0)

  const byType = LOAN_CATEGORIES.map(cat => {
    const items = filtered.filter(l => (l.loan_type || 'home_loan') === cat.type)
    const outstanding = items.reduce((a,l) => a + conv(Number(l.outstanding_amt), l.currency), 0)
    const emi         = items.reduce((a,l) => a + conv(Number(l.emi_amount), l.currency), 0)
    return { ...cat, count: items.length, outstanding, emi }
  }).filter(c => c.count > 0 || true)

  return (
    <div className="space-y-5 animate-fade-up">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--text)' }}>Loans</h1>
          <p className="text-[12px] mt-0.5" style={{ color: 'var(--text3)' }}>
            {filtered.length} active loan{filtered.length !== 1 ? 's' : ''} — select a category to manage
          </p>
        </div>
        <button onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-white text-[12px] font-bold"
          style={{ background: 'var(--sage)' }}>
          <Plus size={14} /> Add Loan
        </button>
      </div>

      {/* KPI Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <MetricCard label="Total Outstanding" value={fmt(totalOutstanding,sym)} accent="rose" />
        <MetricCard label="Monthly EMIs"      value={fmt(totalEMI,sym)}        accent="gold" />
        <MetricCard label="Total Sanctioned"  value={fmt(totalSanctioned,sym)} accent="blue" />
      </div>

      {/* Loan category quick links */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="wl-card p-4">
          <div className="text-[11px] font-bold uppercase tracking-wider mb-3" style={{ color: 'var(--text3)' }}>By Loan Category</div>
          <div className="space-y-2">
            {byType.map(cat => (
              <Link key={cat.type} href={cat.href}
                className="flex items-center justify-between p-2.5 rounded-lg transition-all group"
                style={{ background: 'var(--bg2)' }}>
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: cat.color }} />
                  <span className="text-[12px] font-semibold" style={{ color: 'var(--text)' }}>{cat.label}</span>
                  {cat.count > 0 && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold" style={{ background: 'var(--border)', color: 'var(--text3)' }}>{cat.count}</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {cat.outstanding > 0 && (
                    <span className="text-[12px] font-mono font-bold" style={{ color: 'var(--text)' }}>{fmt(cat.outstanding, sym)}</span>
                  )}
                  <ArrowRight size={12} style={{ color: 'var(--text3)' }} className="group-hover:translate-x-0.5 transition-transform" />
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* Active loans list */}
        <div className="wl-card p-4">
          <div className="text-[11px] font-bold uppercase tracking-wider mb-3" style={{ color: 'var(--text3)' }}>Active Loans</div>
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 gap-3">
              <Building2 size={28} style={{ color: 'var(--border2)' }} />
              <div className="text-[12px]" style={{ color: 'var(--text3)' }}>No loans added yet</div>
              <button onClick={() => setShowAdd(true)} className="px-3 py-1.5 rounded-lg text-white text-[11px] font-bold" style={{ background: 'var(--sage)' }}>Add Loan</button>
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.slice(0, 6).map((loan, i) => {
                const paidPct = Math.round((Number(loan.sanctioned_amt) - Number(loan.outstanding_amt)) / Number(loan.sanctioned_amt) * 100)
                const lSym = loan.currency === 'AED' ? 'AED ' : '₹'
                const catLabel = LOAN_CATEGORIES.find(c => c.type === (loan.loan_type || 'home_loan'))?.label ?? 'Loan'
                const catColor = LOAN_CATEGORIES.find(c => c.type === (loan.loan_type || 'home_loan'))?.color ?? '#6B7280'
                return (
                  <div key={loan.id ?? i} className="rounded-xl p-3" style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}>
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <div className="text-[12px] font-semibold" style={{ color: 'var(--text)' }}>{loan.name}</div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold" style={{ background: catColor + '18', color: catColor }}>{catLabel}</span>
                          <span className="text-[10px]" style={{ color: 'var(--text3)' }}>{loan.interest_rate}% p.a.</span>
                        </div>
                      </div>
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded" style={{ background: 'var(--gold-bg)', color: 'var(--gold)' }}>{paidPct}% paid</span>
                    </div>
                    <div className="h-1.5 rounded-full overflow-hidden mb-1" style={{ background: 'var(--border)' }}>
                      <div className="h-full rounded-full" style={{ width: `${paidPct}%`, background: 'linear-gradient(90deg,var(--sage),var(--blue))' }} />
                    </div>
                    <div className="text-[10px]" style={{ color: 'var(--text3)' }}>
                      Outstanding: {lSym}{Number(loan.outstanding_amt).toLocaleString('en-IN')} · EMI: {lSym}{Number(loan.emi_amount).toLocaleString('en-IN')}/mo
                    </div>
                  </div>
                )
              })}
              {filtered.length > 6 && (
                <div className="text-[11px] text-center" style={{ color: 'var(--text3)' }}>+{filtered.length - 6} more loans</div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Category cards */}
      <div>
        <div className="text-[11px] font-bold uppercase tracking-wider mb-3" style={{ color: 'var(--text3)' }}>Manage by Loan Type</div>
        <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-7 gap-2">
          {LOAN_CATEGORIES.map((cat, i) => (
            <Link key={cat.type} href={cat.href}
              className="wl-card p-3 flex flex-col items-center gap-1 text-center hover:shadow-md transition-shadow group">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: cat.color + '18', color: cat.color }}>
                <Building2 size={13} />
              </div>
              <div className="text-[10px] font-semibold leading-tight" style={{ color: 'var(--text)' }}>{cat.label}</div>
            </Link>
          ))}
        </div>
      </div>

      {showAdd && <AddLoanModal onClose={() => setShowAdd(false)} />}
    </div>
  )
}
