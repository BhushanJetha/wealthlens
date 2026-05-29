'use client'
import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useViewStore } from '@/store/viewStore'
import { useHolderStore } from '@/store/holderStore'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { Plus, Building2, ChevronLeft, Pencil, Trash2, Loader2 } from 'lucide-react'
import AddLoanModal from '@/components/forms/AddLoanModal'
import FilterBar from './FilterBar'
import HolderFilter from './HolderFilter'
import Link from 'next/link'

const FX = 22.80
function toINR(amt: number, cur: string) { return cur === 'AED' ? amt * FX : amt }

const LOAN_SORT_OPTS = [
  { value: 'outstanding_desc', label: 'Outstanding ↓' },
  { value: 'emi_desc',         label: 'EMI ↓' },
  { value: 'paid_desc',        label: '% Paid ↓' },
  { value: 'name_asc',         label: 'Name A–Z' },
]

interface Props {
  loans: any[]
  title: string
  loanType: string
}

export default function LoanCategoryClient({ loans, title, loanType }: Props) {
  const { view } = useViewStore()
  const router   = useRouter()
  const supabase = createClient()

  const [showAdd,   setShowAdd]   = useState(false)
  const [editLoan,  setEditLoan]  = useState<any | null>(null)
  const [deleteId,  setDeleteId]  = useState<string | null>(null)
  const [deleting,  setDeleting]  = useState(false)
  const [extraPayments, setExtraPayments] = useState<Record<string,number>>({})
  const [search,    setSearch]    = useState('')
  const [sort,      setSort]      = useState('outstanding_desc')
  const { selectedHolder } = useHolderStore()

  const base = useMemo(() => {
    let arr = view === 'uae'   ? loans.filter(l => l.currency === 'AED')
            : view === 'india' ? loans.filter(l => l.currency === 'INR')
            : loans
    if (selectedHolder) arr = arr.filter(l => (l.holder_name ?? 'Self') === selectedHolder)
    return arr
  }, [loans, view, selectedHolder])

  const filtered = useMemo(() => {
    let arr = [...base]
    if (search) arr = arr.filter(l => `${l.name} ${l.bank_name ?? ''}`.toLowerCase().includes(search.toLowerCase()))
    const paidPct = (l: any) => Number(l.sanctioned_amt) > 0
      ? (Number(l.sanctioned_amt) - Number(l.outstanding_amt)) / Number(l.sanctioned_amt) * 100 : 0
    return arr.sort((a, b) => {
      if (sort === 'outstanding_desc') return Number(b.outstanding_amt) - Number(a.outstanding_amt)
      if (sort === 'emi_desc')         return Number(b.emi_amount) - Number(a.emi_amount)
      if (sort === 'paid_desc')        return paidPct(b) - paidPct(a)
      return (a.name ?? '').localeCompare(b.name ?? '')
    })
  }, [base, search, sort])

  const conv = (amt: number, cur: string) => view === 'consolidated' ? toINR(amt, cur) : amt
  const sym  = view === 'uae' ? 'AED ' : '₹'

  const totalOutstanding = filtered.reduce((a,l) => a + conv(Number(l.outstanding_amt), l.currency), 0)
  const totalEMI         = filtered.reduce((a,l) => a + conv(Number(l.emi_amount), l.currency), 0)
  const totalSanctioned  = filtered.reduce((a,l) => a + conv(Number(l.sanctioned_amt), l.currency), 0)

  const amortData = useMemo(() => {
    const loan = filtered[0]; if (!loan) return []
    const months: string[] = []
    for (let i = 0; i < 12; i++) {
      const d = new Date(); d.setMonth(d.getMonth() + i)
      months.push(d.toLocaleString('default', { month: 'short', year: '2-digit' }))
    }
    const rate = Number(loan.interest_rate) / 100 / 12
    let balance = Number(loan.outstanding_amt)
    return months.map(month => {
      const interest  = Math.round(balance * rate)
      const principal = Math.round(Number(loan.emi_amount) - interest)
      balance = Math.max(0, balance - principal)
      return { month, principal: conv(principal, loan.currency), interest: conv(interest, loan.currency) }
    })
  }, [filtered, view])

  async function handleDelete() {
    if (!deleteId) return
    setDeleting(true)
    await supabase.from('home_loans').update({ is_active: false }).eq('id', deleteId)
    setDeleting(false)
    setDeleteId(null)
    router.refresh()
  }

  function calcInterestSaved(loan: any, extra: number) {
    if (!extra) return 0
    const totalMonths = loan.tenure_months - (loan.months_paid ?? 0)
    return Math.round(extra * totalMonths * 0.3)
  }

  return (
    <div className="space-y-5 animate-fade-up">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <Link href="/dashboard/loans" className="flex items-center gap-1 text-[11px] mb-2" style={{ color: 'var(--sage)' }}>
            <ChevronLeft size={13} /> All Loans
          </Link>
          <h1 className="text-xl font-bold" style={{ color: 'var(--text)' }}>{title}</h1>
          <p className="text-[12px] mt-0.5" style={{ color: 'var(--text3)' }}>
            {filtered.length} loan{filtered.length !== 1 ? 's' : ''} · EMI Tracker · Payoff Simulation
          </p>
        </div>
        <button onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-white text-[12px] font-bold"
          style={{ background: 'var(--sage)' }}>
          <Plus size={14} /> Add {title}
        </button>
      </div>

      <HolderFilter />

      <FilterBar
        search={search} onSearch={setSearch}
        sort={sort} onSort={setSort} sortOptions={LOAN_SORT_OPTS}
        resultCount={filtered.length} totalCount={base.length}
        searchPlaceholder="Search by loan name or bank…"
      />

      {filtered.length === 0 ? (
        <div className="wl-card py-16 text-center" style={{ borderStyle: 'dashed' }}>
          <Building2 size={32} className="mx-auto mb-3" style={{ color: 'var(--border2)' }} />
          <div className="text-[13px] mb-4" style={{ color: 'var(--text3)' }}>No {title.toLowerCase()} added yet</div>
          <button onClick={() => setShowAdd(true)} className="px-4 py-2 rounded-lg text-white text-[12px] font-bold" style={{ background: 'var(--sage)' }}>
            Add Your First Loan
          </button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
            {[
              { label: 'Total Outstanding', value: `${sym}${Math.round(totalOutstanding).toLocaleString('en-IN')}`, bg: 'var(--rose-bg)', color: 'var(--rose)' },
              { label: 'Monthly EMIs',      value: `${sym}${Math.round(totalEMI).toLocaleString('en-IN')}`,        bg: 'var(--gold-bg)', color: 'var(--gold)' },
              { label: 'Total Sanctioned',  value: `${sym}${Math.round(totalSanctioned).toLocaleString('en-IN')}`, bg: 'var(--blue-bg)', color: 'var(--blue)' },
            ].map(c => (
              <div key={c.label} className="wl-card p-4">
                <div className="text-[10px] uppercase tracking-wider mb-1 font-semibold" style={{ color: 'var(--text3)' }}>{c.label}</div>
                <div className="text-[22px] font-bold font-mono" style={{ color: c.color }}>{c.value}</div>
              </div>
            ))}
          </div>

          {filtered.map((loan: any, i: number) => {
            const lSym = loan.currency === 'AED' ? 'AED ' : '₹'
            const paidPct = Math.round((Number(loan.sanctioned_amt) - Number(loan.outstanding_amt)) / Number(loan.sanctioned_amt) * 100)
            const monthsRem = loan.tenure_months - (loan.months_paid ?? 0)
            const extra = extraPayments[loan.id] ?? 0
            const interestSaved = calcInterestSaved(loan, extra)
            const monthsSaved = extra > 0 ? Math.round(interestSaved / Number(loan.emi_amount) * 1.5) : 0
            return (
              <div key={loan.id ?? i} className="wl-card p-5 space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Building2 size={16} style={{ color: 'var(--blue)' }} />
                      <span className="text-[15px] font-bold truncate" style={{ color: 'var(--text)' }}>{loan.name}</span>
                    </div>
                    <div className="text-[11px] mt-0.5" style={{ color: 'var(--text3)' }}>
                      {loan.bank_name} · {loan.interest_rate}% p.a. · {loan.tenure_months}mo tenure
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-[12px] font-bold px-2.5 py-1 rounded-lg"
                      style={{ background: 'var(--gold-bg)', color: 'var(--gold)' }}>{paidPct}% paid</span>
                    <button onClick={() => setEditLoan(loan)}
                      className="w-7 h-7 rounded-lg flex items-center justify-center transition-all"
                      style={{ background: 'var(--blue-bg)', color: 'var(--blue)' }}
                      title="Edit loan">
                      <Pencil size={13} />
                    </button>
                    <button onClick={() => setDeleteId(loan.id)}
                      className="w-7 h-7 rounded-lg flex items-center justify-center transition-all"
                      style={{ background: 'var(--rose-bg)', color: 'var(--rose)' }}
                      title="Delete loan">
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>

                <div>
                  <div className="h-2.5 rounded-full overflow-hidden" style={{ background: 'var(--bg2)' }}>
                    <div className="h-full rounded-full" style={{ width: `${paidPct}%`, background: 'linear-gradient(90deg,var(--sage),var(--blue))' }} />
                  </div>
                  <div className="flex justify-between text-[10px] mt-1" style={{ color: 'var(--text3)' }}>
                    <span>{lSym}0</span>
                    <span>Outstanding: {lSym}{Number(loan.outstanding_amt).toLocaleString('en-IN')}</span>
                    <span>{lSym}{Number(loan.sanctioned_amt).toLocaleString('en-IN')}</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { label: 'EMI',              val: `${lSym}${Number(loan.emi_amount).toLocaleString('en-IN')}` },
                    { label: 'Months Remaining', val: `${monthsRem} mo` },
                    { label: 'Months Paid',      val: `${loan.months_paid ?? 0}` },
                    { label: 'Next EMI',         val: loan.next_emi_date ?? '—' },
                  ].map(item => (
                    <div key={item.label} className="rounded-xl p-3" style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}>
                      <div className="text-[9px] uppercase tracking-wider font-bold mb-1" style={{ color: 'var(--text3)' }}>{item.label}</div>
                      <div className="text-[13px] font-bold font-mono" style={{ color: 'var(--text)' }}>{item.val}</div>
                    </div>
                  ))}
                </div>

                <div className="rounded-xl p-4" style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}>
                  <div className="text-[11px] font-bold uppercase tracking-wider mb-3" style={{ color: 'var(--text3)' }}>Early Payoff Simulation</div>
                  <div className="flex items-center gap-4 flex-wrap">
                    <span className="text-[12px]" style={{ color: 'var(--text2)' }}>Extra monthly payment:</span>
                    <input type="range" min={0} max={Math.round(Number(loan.emi_amount) * 0.5)} step={1000}
                      value={extra} onChange={e => setExtraPayments(prev => ({ ...prev, [loan.id]: Number(e.target.value) }))}
                      className="flex-1 max-w-[200px]" style={{ accentColor: 'var(--sage)' }} />
                    <span className="text-[14px] font-bold font-mono" style={{ color: 'var(--sage)' }}>{lSym}{extra.toLocaleString()}</span>
                  </div>
                  {extra > 0 && (
                    <div className="mt-3 flex gap-4 text-[12px]" style={{ color: 'var(--text3)' }}>
                      <span>Interest saved: <strong style={{ color: 'var(--income)' }}>{lSym}{interestSaved.toLocaleString()}</strong></span>
                      <span>Ends: <strong style={{ color: 'var(--sage)' }}>{monthsSaved} months earlier</strong></span>
                    </div>
                  )}
                </div>
              </div>
            )
          })}

          {amortData.length > 0 && (
            <div className="wl-card p-4">
              <div className="text-[11px] font-bold uppercase tracking-wider mb-3" style={{ color: 'var(--text3)' }}>Amortization — Next 12 Months</div>
              <div className="flex gap-4 mb-3 text-[11px]" style={{ color: 'var(--text3)' }}>
                <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm" style={{ background: 'var(--sage)' }} /> Principal</span>
                <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm" style={{ background: 'var(--rose)' }} /> Interest</span>
              </div>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={amortData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="month" tick={{ fill: 'var(--text3)', fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: 'var(--text3)', fontSize: 10 }} axisLine={false} tickLine={false}
                    tickFormatter={v => v >= 100000 ? `${(v/100000).toFixed(0)}L` : v.toLocaleString()} />
                  <Tooltip contentStyle={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 8, fontSize: 11 }}
                    formatter={(v: any, name: string) => [`${sym}${Number(v).toLocaleString('en-IN')}`, name]}
                    labelStyle={{ color: 'var(--text)' }} />
                  <Bar dataKey="principal" name="Principal" stackId="a" fill="var(--sage)" radius={[0,0,0,0]} />
                  <Bar dataKey="interest"  name="Interest"  stackId="a" fill="var(--rose)" radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </>
      )}

      {/* Add modal */}
      {showAdd && <AddLoanModal onClose={() => setShowAdd(false)} defaultLoanType={loanType} />}

      {/* Edit modal */}
      {editLoan && (
        <AddLoanModal
          onClose={() => setEditLoan(null)}
          defaultLoanType={editLoan.loan_type ?? loanType}
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
