'use client'
import Link from 'next/link'
import { Home, Car, Bike, Coins, CreditCard, User, Landmark, Pencil, Trash2, ArrowRight, type LucideIcon } from 'lucide-react'
import { simulatePayoff } from '@/lib/amortization'

// Fixed colour + icon per loan type (colour follows the type)
export const LOAN_TYPES: { type: string; label: string; color: string; icon: LucideIcon; href: string }[] = [
  { type: 'home_loan',     label: 'Home loan',     color: '#6A55E8', icon: Home,       href: '/dashboard/loans/home'     },
  { type: 'car_loan',      label: 'Car loan',      color: '#3B8EF0', icon: Car,        href: '/dashboard/loans/car'      },
  { type: 'bike_loan',     label: 'Bike loan',     color: '#0891B2', icon: Bike,       href: '/dashboard/loans/car'      },
  { type: 'gold_loan',     label: 'Gold loan',     color: '#F29A2E', icon: Coins,      href: '/dashboard/loans/gold'     },
  { type: 'loan_on_card',  label: 'Loan on card',  color: '#EC5B8C', icon: CreditCard, href: '/dashboard/loans/card'     },
  { type: 'personal_loan', label: 'Personal loan', color: '#2FB67C', icon: User,       href: '/dashboard/loans/personal' },
  { type: 'other_loan',    label: 'Other loan',    color: '#94A3B8', icon: Landmark,   href: '/dashboard/loans/other'    },
]
export const loanTypeOf = (l: any) => LOAN_TYPES.find(c => c.type === (l.loan_type || 'home_loan')) ?? LOAN_TYPES[6]

const fmtDay = (d: string) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })

// One loan as a card: the whole card opens the loan's detail page.
export default function LoanCard({ loan, onEdit, onDelete }: { loan: any; onEdit?: () => void; onDelete?: () => void }) {
  const t = loanTypeOf(loan)
  const sym = loan.currency === 'AED' ? 'AED ' : '₹'
  const money = (n: number) => `${sym}${Math.round(Number(n) || 0).toLocaleString(loan.currency === 'AED' ? 'en-US' : 'en-IN')}`
  const short = (n: number) => {
    const a = Math.abs(n)
    if (loan.currency !== 'AED' && a >= 1e7) return `${sym}${(n / 1e7).toFixed(2)}Cr`
    if (loan.currency !== 'AED' && a >= 1e5) return `${sym}${(n / 1e5).toFixed(2)}L`
    return money(n)
  }
  const out = Number(loan.outstanding_amt) || 0
  const base = Number(loan.disbursed_amt) || Number(loan.sanctioned_amt) || 0
  const repaid = base > 0 ? Math.max(0, Math.min(100, Math.round((base - out) / base * 100))) : 0
  const emi = Number(loan.emi_amount) || 0
  const sim = simulatePayoff(out, Number(loan.interest_rate) || 0, emi, 0, 0)
  const free = Number.isFinite(sim.months) && sim.months > 0
    ? (() => { const d = new Date(); d.setMonth(d.getMonth() + sim.months); return d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }) })() : null
  const emiNote = loan.emi_paid_on ? `last paid ${fmtDay(loan.emi_paid_on)}` : 'from loan details'
  const detail = `/dashboard/loans/detail/${loan.id}`
  const stop = (fn?: () => void) => (e: React.MouseEvent) => { e.preventDefault(); e.stopPropagation(); fn?.() }

  return (
    <Link href={detail} className="wl-card group block px-4 md:px-5 py-4 transition-[box-shadow,border-color] hover:shadow-lg hover:border-[var(--accent-border)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
      aria-label={`${loan.name}: ${money(out)} outstanding, open details`}>
      <div className="flex items-start gap-3">
        <span className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: t.color + '1A', color: t.color }}><t.icon size={18} /></span>
        <div className="flex-1 min-w-0">
          <div className="text-[14.5px] font-semibold truncate" style={{ color: 'var(--text)' }}>{loan.name}</div>
          <div className="text-[12px] truncate" style={{ color: 'var(--text3)' }}>{[loan.bank_name, t.label, `${Number(loan.interest_rate) || 0}% a year`].filter(Boolean).join(' · ')}</div>
        </div>
        {(onEdit || onDelete) && (
          <div className="flex items-center gap-0.5 -mr-1.5 -mt-1">
            {onEdit && <button onClick={stop(onEdit)} aria-label={`Edit ${loan.name}`} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[var(--accent-bg)]" style={{ color: 'var(--text3)' }}><Pencil size={14} /></button>}
            {onDelete && <button onClick={stop(onDelete)} aria-label={`Delete ${loan.name}`} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[#FDECE8]" style={{ color: '#DC2626' }}><Trash2 size={14} /></button>}
          </div>
        )}
      </div>

      <div className="flex items-end justify-between gap-3 mt-3.5">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.05em]" style={{ color: 'var(--text3)' }}>Left to pay</div>
          <div className="text-[22px] font-bold tabular-nums tracking-[-0.01em] leading-tight" style={{ color: 'var(--text)' }}>{short(out)}</div>
        </div>
        {base > 0 && <div className="text-[12px] text-right" style={{ color: 'var(--text3)' }}>of {short(base)} borrowed</div>}
      </div>
      <div className="mt-2 h-2 rounded-full overflow-hidden" style={{ background: 'var(--track)' }} role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={repaid} aria-label="Repaid">
        <div className="h-full rounded-full" style={{ width: `${Math.max(repaid, 2)}%`, background: t.color }} />
      </div>
      <div className="text-[11.5px] mt-1 font-medium" style={{ color: t.color }}>{repaid}% repaid</div>

      <div className="grid grid-cols-3 gap-2 mt-3">
        {[
          ['EMI', money(emi), emiNote],
          ['EMIs left', Number.isFinite(sim.months) ? String(sim.months) : '—', Number.isFinite(sim.months) ? `${Math.floor(sim.months / 12)}y ${sim.months % 12}m` : 'EMI below interest'],
          ['Debt-free', free ?? '—', free ? 'at this EMI' : 'check EMI'],
        ].map(([l, v, s]) => (
          <div key={l} className="rounded-xl px-2.5 py-2 min-w-0" style={{ background: '#FAFAFE', border: '1px solid var(--line)' }}>
            <div className="text-[11px]" style={{ color: 'var(--text3)' }}>{l}</div>
            <div className="text-[13.5px] font-bold tabular-nums truncate" style={{ color: 'var(--text)' }}>{v}</div>
            <div className="text-[10.5px] truncate" style={{ color: 'var(--text4)' }}>{s}</div>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between mt-3 pt-3" style={{ borderTop: '1px solid var(--track)' }}>
        <span className="text-[12.5px] font-semibold" style={{ color: 'var(--accent)' }}>View details &amp; payoff plan</span>
        <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" style={{ color: 'var(--accent)' }} />
      </div>
    </Link>
  )
}
