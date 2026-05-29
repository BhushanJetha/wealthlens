'use client'
import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useViewStore } from '@/store/viewStore'
import MetricCard from '@/components/dashboard/MetricCard'
import { Plus, Building2, ArrowRight, Pencil, Trash2, Loader2, Users } from 'lucide-react'
import AddLoanModal from '@/components/forms/AddLoanModal'
import ManageFamilyModal from '@/components/forms/ManageFamilyModal'
import { useHolderStore } from '@/store/holderStore'
import Link from 'next/link'

const FX = 22.80
function toINR(amt: number, cur: string) { return cur === 'AED' ? amt * FX : amt }

const LOAN_CATEGORIES = [
  { type: 'home_loan',     label: 'Home Loan',     color: '#3D7A58', href: '/dashboard/loans/home'     },
  { type: 'car_loan',      label: 'Car Loan',       color: '#3B7DD8', href: '/dashboard/loans/car'      },
  { type: 'bike_loan',     label: 'Bike Loan',      color: '#D4920A', href: '/dashboard/loans/car'      },
  { type: 'gold_loan',     label: 'Gold Loan',      color: '#B45309', href: '/dashboard/loans/gold'     },
  { type: 'loan_on_card',  label: 'Loan on Card',   color: '#7C5CBF', href: '/dashboard/loans/card'     },
  { type: 'personal_loan', label: 'Personal Loan',  color: '#C96A3A', href: '/dashboard/loans/personal' },
  { type: 'other_loan',    label: 'Other Loan',     color: '#6B7280', href: '/dashboard/loans/other'    },
]

function fmt(n: number, sym: string) {
  if (Math.abs(n) >= 10000000) return `${sym}${(n/10000000).toFixed(2)}Cr`
  if (Math.abs(n) >= 100000)   return `${sym}${(n/100000).toFixed(2)}L`
  return `${sym}${Math.round(n).toLocaleString('en-IN')}`
}

export default function LoansClient({ loans, familyMembers = [] }: { loans: any[]; familyMembers?: any[] }) {
  const { view } = useViewStore()
  const { selectedHolder, setSelectedHolder } = useHolderStore()
  const router   = useRouter()
  const supabase = createClient()

  const [showAdd,        setShowAdd]        = useState(false)
  const [editLoan,       setEditLoan]       = useState<any | null>(null)
  const [deleteId,       setDeleteId]       = useState<string | null>(null)
  const [deleting,       setDeleting]       = useState(false)
  const [showManageFamily, setShowManageFamily] = useState(false)

  const filtered = useMemo(() => {
    let base = loans
    if (view === 'uae')   base = base.filter(l => l.currency === 'AED')
    if (view === 'india') base = base.filter(l => l.currency === 'INR')
    if (selectedHolder)   base = base.filter(l => (l.holder_name ?? 'Self') === selectedHolder)
    return base
  }, [loans, view, selectedHolder])

  const conv = (amt: number, cur: string) => view === 'consolidated' ? toINR(amt, cur) : amt
  const sym  = view === 'uae' ? 'AED ' : '₹'

  const totalOutstanding = filtered.reduce((a,l) => a + conv(Number(l.outstanding_amt), l.currency), 0)
  const totalEMI         = filtered.reduce((a,l) => a + conv(Number(l.emi_amount), l.currency), 0)
  const totalSanctioned  = filtered.reduce((a,l) => a + conv(Number(l.sanctioned_amt), l.currency), 0)

  const byType = LOAN_CATEGORIES.map(cat => {
    const items = filtered.filter(l => (l.loan_type || 'home_loan') === cat.type)
    const outstanding = items.reduce((a,l) => a + conv(Number(l.outstanding_amt), l.currency), 0)
    const emi         = items.reduce((a,l) => a + conv(Number(l.emi_amount), l.currency), 0)
    return { ...cat, count: items.length, outstanding, emi }
  }).filter(c => c.count > 0 || true)

  async function handleDelete() {
    if (!deleteId) return
    setDeleting(true)
    await supabase.from('home_loans').update({ is_active: false }).eq('id', deleteId)
    setDeleting(false)
    setDeleteId(null)
    router.refresh()
  }

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

      {/* Member Filter */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[10px] font-semibold uppercase tracking-wider flex-shrink-0" style={{ color: 'var(--text3)' }}>Loans of:</span>
        {(['', 'Self', ...familyMembers.map((m: any) => m.name)] as string[]).map(name => (
          <button key={name || '__all'} onClick={() => setSelectedHolder(name)}
            className="px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all"
            style={{
              background: selectedHolder === name ? 'var(--sage)' : 'var(--bg2)',
              color: selectedHolder === name ? '#fff' : 'var(--text3)',
              border: `1px solid ${selectedHolder === name ? 'var(--sage)' : 'var(--border)'}`,
            }}>
            {name === '' ? 'All Members' : name}
          </button>
        ))}
        <button onClick={() => setShowManageFamily(true)}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-semibold"
          style={{ background: 'var(--bg2)', color: 'var(--text3)', border: '1px solid var(--border)' }}>
          <Users size={11} /> Manage
        </button>
      </div>

      {/* KPI Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <MetricCard label="Total Outstanding" value={fmt(totalOutstanding,sym)} accent="rose" />
        <MetricCard label="Monthly EMIs"      value={fmt(totalEMI,sym)}         accent="gold" />
        <MetricCard label="Total Sanctioned"  value={fmt(totalSanctioned,sym)}  accent="blue" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Category quick links */}
        <div className="wl-card p-4">
          <div className="text-[11px] font-bold uppercase tracking-wider mb-3"
            style={{ color: 'var(--text3)' }}>By Loan Category</div>
          <div className="space-y-2">
            {byType.map(cat => (
              <Link key={cat.type} href={cat.href}
                className="flex items-center justify-between p-2.5 rounded-lg transition-all group"
                style={{ background: 'var(--bg2)' }}>
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: cat.color }} />
                  <span className="text-[12px] font-semibold" style={{ color: 'var(--text)' }}>{cat.label}</span>
                  {cat.count > 0 && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold"
                      style={{ background: 'var(--border)', color: 'var(--text3)' }}>{cat.count}</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {cat.outstanding > 0 && (
                    <span className="text-[12px] font-mono font-bold" style={{ color: 'var(--text)' }}>
                      {fmt(cat.outstanding, sym)}
                    </span>
                  )}
                  <ArrowRight size={12} style={{ color: 'var(--text3)' }}
                    className="group-hover:translate-x-0.5 transition-transform" />
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* Active loans list with edit/delete */}
        <div className="wl-card p-4">
          <div className="text-[11px] font-bold uppercase tracking-wider mb-3"
            style={{ color: 'var(--text3)' }}>Active Loans</div>
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 gap-3">
              <Building2 size={28} style={{ color: 'var(--border2)' }} />
              <div className="text-[12px]" style={{ color: 'var(--text3)' }}>No loans added yet</div>
              <button onClick={() => setShowAdd(true)}
                className="px-3 py-1.5 rounded-lg text-white text-[11px] font-bold"
                style={{ background: 'var(--sage)' }}>Add Loan</button>
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.slice(0, 6).map((loan: any) => {
                const paidPct   = Math.round((Number(loan.sanctioned_amt) - Number(loan.outstanding_amt)) / Number(loan.sanctioned_amt) * 100)
                const lSym      = loan.currency === 'AED' ? 'AED ' : '₹'
                const catLabel  = LOAN_CATEGORIES.find(c => c.type === (loan.loan_type || 'home_loan'))?.label ?? 'Loan'
                const catColor  = LOAN_CATEGORIES.find(c => c.type === (loan.loan_type || 'home_loan'))?.color ?? '#6B7280'
                return (
                  <div key={loan.id} className="rounded-xl p-3"
                    style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}>
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1 min-w-0">
                        <div className="text-[12px] font-semibold truncate" style={{ color: 'var(--text)' }}>
                          {loan.name}
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                          <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold"
                            style={{ background: catColor + '18', color: catColor }}>{catLabel}</span>
                          <span className="text-[10px]" style={{ color: 'var(--text3)' }}>
                            {loan.interest_rate}% p.a.
                          </span>
                          {loan.holder_name && loan.holder_name !== 'Self' && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded font-semibold"
                              style={{ background: 'var(--blue-bg)', color: 'var(--blue)' }}>
                              {loan.holder_name}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 ml-2 shrink-0">
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                          style={{ background: 'var(--gold-bg)', color: 'var(--gold)' }}>
                          {paidPct}%
                        </span>
                        <button onClick={() => setEditLoan(loan)}
                          className="w-6 h-6 rounded-md flex items-center justify-center"
                          style={{ background: 'var(--blue-bg)', color: 'var(--blue)' }}
                          title="Edit loan">
                          <Pencil size={11} />
                        </button>
                        <button onClick={() => setDeleteId(loan.id)}
                          className="w-6 h-6 rounded-md flex items-center justify-center"
                          style={{ background: 'var(--rose-bg)', color: 'var(--rose)' }}
                          title="Delete loan">
                          <Trash2 size={11} />
                        </button>
                      </div>
                    </div>
                    <div className="h-1.5 rounded-full overflow-hidden mb-1" style={{ background: 'var(--border)' }}>
                      <div className="h-full rounded-full"
                        style={{ width: `${paidPct}%`, background: 'linear-gradient(90deg,var(--sage),var(--blue))' }} />
                    </div>
                    <div className="text-[10px]" style={{ color: 'var(--text3)' }}>
                      Outstanding: {lSym}{Number(loan.outstanding_amt).toLocaleString('en-IN')} · EMI: {lSym}{Number(loan.emi_amount).toLocaleString('en-IN')}/mo
                    </div>
                  </div>
                )
              })}
              {filtered.length > 6 && (
                <div className="text-[11px] text-center" style={{ color: 'var(--text3)' }}>
                  +{filtered.length - 6} more loans
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Category tile grid */}
      <div>
        <div className="text-[11px] font-bold uppercase tracking-wider mb-3"
          style={{ color: 'var(--text3)' }}>Manage by Loan Type</div>
        <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-7 gap-2">
          {LOAN_CATEGORIES.map(cat => (
            <Link key={cat.type} href={cat.href}
              className="wl-card p-3 flex flex-col items-center gap-1 text-center hover:shadow-md transition-shadow group">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center"
                style={{ background: cat.color + '18', color: cat.color }}>
                <Building2 size={13} />
              </div>
              <div className="text-[10px] font-semibold leading-tight" style={{ color: 'var(--text)' }}>
                {cat.label}
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* Add modal */}
      {showAdd && <AddLoanModal onClose={() => setShowAdd(false)} />}

      {/* Manage family */}
      {showManageFamily && <ManageFamilyModal onClose={() => setShowManageFamily(false)} />}

      {/* Edit modal */}
      {editLoan && (
        <AddLoanModal
          onClose={() => setEditLoan(null)}
          defaultLoanType={editLoan.loan_type ?? 'home_loan'}
          initialData={editLoan}
          loanId={editLoan.id}
        />
      )}

      {/* Delete confirmation */}
      {deleteId && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="rounded-2xl p-6 w-full max-w-sm"
            style={{ background: '#fff', border: '1px solid var(--border)', boxShadow: '0 8px 32px rgba(0,0,0,0.12)' }}>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                style={{ background: 'var(--rose-bg)' }}>
                <Trash2 size={18} style={{ color: 'var(--rose)' }} />
              </div>
              <h2 className="text-[15px] font-bold" style={{ color: 'var(--text)' }}>Delete Loan?</h2>
            </div>
            <p className="text-[13px] mb-5" style={{ color: 'var(--text2)' }}>
              This loan will be removed from your dashboard. Transaction history remains intact.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteId(null)}
                className="flex-1 py-2.5 rounded-lg text-[12px] font-semibold"
                style={{ border: '1px solid var(--border)', color: 'var(--text3)', background: 'var(--bg2)' }}>
                Cancel
              </button>
              <button onClick={handleDelete} disabled={deleting}
                className="flex-1 py-2.5 rounded-lg text-white text-[12px] font-bold flex items-center justify-center gap-2 disabled:opacity-50"
                style={{ background: 'var(--rose)' }}>
                {deleting ? <><Loader2 size={13} className="animate-spin" />Deleting…</> : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
