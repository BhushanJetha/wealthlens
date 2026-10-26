'use client'
import { useState, useMemo, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useViewStore } from '@/store/viewStore'
import { useHolderStore } from '@/store/holderStore'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { Plus, Building2, ChevronLeft, Pencil, Trash2, Loader2 } from 'lucide-react'
import AddLoanModal from '@/components/forms/AddLoanModal'
import FilterBar from './FilterBar'
import Link from 'next/link'
import { PageHeader, InsightBar, AiActions, LearnStrip, HeroStat, KpiTile, Bars, EmptyState } from '@/components/ui/kit'
import { ListSearch } from '@/components/ui/list'
import LoanCard from './LoanCard'
import { simulatePayoff } from '@/lib/amortization'
import { CalendarClock, Percent, Flag, Landmark } from 'lucide-react'

function toINR(amt: number, cur: string, fx: number) { return cur === 'AED' ? amt * fx : amt }

// % of principal actually repaid — based on disbursed (not sanctioned), so a
// partly-disbursed under-construction loan doesn't show inflated "paid".
function paidPctOf(l: any): number {
  const base = Number(l.disbursed_amt) || Number(l.sanctioned_amt) || 0
  const repaid = Math.max(0, base - Number(l.outstanding_amt || 0))
  return base > 0 ? Math.round((repaid / base) * 100) : 0
}

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
  const { view, fxRate: FX } = useViewStore()
  const router   = useRouter()
  const supabase = createClient()

  const [showAdd,   setShowAdd]   = useState(false)
  const [editLoan,  setEditLoan]  = useState<any | null>(null)
  const [deleteId,  setDeleteId]  = useState<string | null>(null)
  const [deleting,  setDeleting]  = useState(false)
  const [extraPayments, setExtraPayments] = useState<Record<string,number>>({})
  const [search,    setSearch]    = useState('')
  const [sort,      setSort]      = useState('outstanding_desc')
  const [agg, setAgg] = useState<Record<string, { own: number; disb: number }>>({})
  const { selectedHolder } = useHolderStore()

  // Per-loan own-contribution / disbursement totals (from loan_transactions)
  useEffect(() => {
    const ids = loans.map(l => l.id).filter(Boolean)
    if (!ids.length) return
    ;(async () => {
      const { data } = await supabase.from('loan_transactions').select('loan_id, kind, amount').in('loan_id', ids)
      const m: Record<string, { own: number; disb: number }> = {}
      ;(data ?? []).forEach((t: any) => {
        ;(m[t.loan_id] ||= { own: 0, disb: 0 })
        if (t.kind === 'own_contribution') m[t.loan_id].own += Number(t.amount) || 0
        if (t.kind === 'disbursement') m[t.loan_id].disb += Number(t.amount) || 0
      })
      setAgg(m)
    })()
  }, [loans]) // eslint-disable-line

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
    const paidPct = paidPctOf
    return arr.sort((a, b) => {
      if (sort === 'outstanding_desc') return Number(b.outstanding_amt) - Number(a.outstanding_amt)
      if (sort === 'emi_desc')         return Number(b.emi_amount) - Number(a.emi_amount)
      if (sort === 'paid_desc')        return paidPct(b) - paidPct(a)
      return (a.name ?? '').localeCompare(b.name ?? '')
    })
  }, [base, search, sort])

  const conv = (amt: number, cur: string) => view === 'consolidated' ? toINR(amt, cur, FX) : amt
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

  // Balance at the end of each year until every loan is cleared (view currency)
  const payoff = useMemo(() => {
    const sims = filtered.map(l => ({ l, sim: simulatePayoff(Number(l.outstanding_amt) || 0, Number(l.interest_rate) || 0, Number(l.emi_amount) || 0, 0, 0) }))
    const months = Math.max(0, ...sims.map(x => Number.isFinite(x.sim.months) ? x.sim.months : 0))
    const years = Math.min(Math.ceil(months / 12), 30)
    const step = Math.max(1, Math.ceil(years / 10))
    const balAt = (l: any, m: number) => {
      let bal = Number(l.outstanding_amt) || 0
      const r = (Number(l.interest_rate) || 0) / 1200, emi = Number(l.emi_amount) || 0
      for (let i = 0; i < m && bal > 0; i++) bal = Math.max(0, bal - Math.max(emi - bal * r, 0))
      return conv(bal, l.currency)
    }
    const now = filtered.reduce((a, l) => a + conv(Number(l.outstanding_amt) || 0, l.currency), 0)
    const bars = [{ label: 'Now', value: now, hi: true, tip: `Now: ${sym}${Math.round(now).toLocaleString('en-IN')}` }]
    for (let y = step; y <= years; y += step) {
      const v = filtered.reduce((a, l) => a + balAt(l, y * 12), 0)
      bars.push({ label: `+${y}y`, value: v, hi: true, tip: `In ${y} year${y === 1 ? '' : 's'}: ${sym}${Math.round(v).toLocaleString('en-IN')}` })
    }
    const interest = sims.reduce((a, x) => a + (Number.isFinite(x.sim.interest) ? conv(x.sim.interest, x.l.currency) : 0), 0)
    const end = new Date(); end.setMonth(end.getMonth() + months)
    return { bars, interest, months, end: months > 0 ? end.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }) : '—' }
  }, [filtered, view, FX])

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
    <div className="flex flex-col gap-3.5 md:gap-[18px] animate-fade-up">
      <PageHeader title={title}
        sub={`${filtered.length} loan${filtered.length !== 1 ? 's' : ''} · ${sym}${Math.round(totalEMI).toLocaleString('en-IN')} EMI a month`}
        onAdd={() => setShowAdd(true)} addLabel={`Add ${title}`}
        actions={<button onClick={() => setShowAdd(true)} className="wl-btn wl-btn-primary" style={{ height: 34 }}><Plus size={14} />Add {title.toLowerCase()}</button>} />
      {filtered.length > 0 && <InsightBar
        text={`You owe ${sym}${Math.round(totalOutstanding).toLocaleString('en-IN')} on ${filtered.length === 1 ? 'this loan' : `these ${filtered.length} loans`} and have repaid ${totalSanctioned > 0 ? Math.max(0, Math.round((totalSanctioned - totalOutstanding) / totalSanctioned * 100)) : 0}% of what you borrowed. Open a loan to try an extra payment and see how much sooner it clears.`}
        prompt={`Explain my ${title} page. ${filtered.map((l: any) => `${l.name}: outstanding ${l.currency} ${l.outstanding_amt} at ${l.interest_rate}%, EMI ${l.emi_amount}`).join('; ')}.`} />}
      {filtered.length > 0 && <AiActions actions={['Best prepayment plan', 'Should I refinance?']}
        context={`${title}: ${filtered.map((l: any) => `${l.name} outstanding ${l.currency} ${l.outstanding_amt} at ${l.interest_rate}%, EMI ${l.emi_amount}`).join('; ')}.`} />}


      {base.length === 0 ? (
        <EmptyState message={`No ${title.toLowerCase()} yet. Add one to see your EMIs, payoff date and interest left.`}
          cta={`Add ${title.toLowerCase()}`} onCta={() => setShowAdd(true)} />
      ) : (<>
        <div className="grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-3.5 md:gap-4">
          <HeroStat label="Outstanding" value={`${sym}${Math.round(totalOutstanding).toLocaleString('en-IN')}`}
            delta={`${totalSanctioned > 0 ? Math.max(0, Math.round((totalSanctioned - totalOutstanding) / totalSanctioned * 100)) : 0}% repaid of ${sym}${Math.round(totalSanctioned).toLocaleString('en-IN')} borrowed`}
            tone="good" right={<span className="text-[11.5px]" style={{ color: 'var(--text3)' }}>Balance each year at current EMIs</span>}>
            {payoff.bars.length > 1 && <Bars data={payoff.bars} className="h-[110px] md:h-auto md:flex-1 md:min-h-[150px] mt-3"
              label={`Path to zero: ${payoff.bars.map(b => b.tip).join(', ')}`} />}
          </HeroStat>
          <div className="grid grid-cols-2 lg:grid-cols-1 gap-2.5 md:gap-3.5 lg:content-start">
            <KpiTile label="Monthly EMIs" value={`${sym}${Math.round(totalEMI).toLocaleString('en-IN')}`} tint={2} icon={CalendarClock}
              delta={`${filtered.length} loan${filtered.length === 1 ? '' : 's'}`} />
            <KpiTile label="Interest left" value={`${sym}${Math.round(payoff.interest).toLocaleString('en-IN')}`} tint={3} icon={Percent}
              delta="at current EMIs" />
            <KpiTile className="max-lg:col-span-2" label="Debt-free by" value={payoff.end} tint={1} icon={Flag}
              delta={payoff.months > 0 ? `${Math.floor(payoff.months / 12)} yr ${payoff.months % 12} mo to go` : 'Nothing outstanding'} />
          </div>
        </div>

        <section className="flex flex-col gap-2.5 md:gap-3">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2.5">
            <div className="px-0.5">
              <h2 className="text-[15px] md:text-[16px] font-semibold" style={{ color: 'var(--text)' }}>Your {title.toLowerCase()}</h2>
              <div className="text-[12px]" style={{ color: 'var(--text3)' }}>{filtered.length === base.length ? `${base.length} active` : `${filtered.length} of ${base.length}`} · tap a loan for its payoff plan</div>
            </div>
            {base.length > 1 && (
              <div className="md:w-[380px]">
                <ListSearch value={search} onChange={setSearch} placeholder="Search loan or bank…">
                  <select value={sort} onChange={e => setSort(e.target.value)} aria-label="Sort"
                    className="wl-input max-w-[44%]" style={{ width: 'auto', height: 36, background: '#fff' }}>
                    {LOAN_SORT_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </ListSearch>
              </div>
            )}
          </div>
          {filtered.length === 0 ? (
            <div className="wl-card text-center py-12 text-[13px]" style={{ color: 'var(--text3)' }}>No loans match your search.</div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5 md:gap-3.5">
              {filtered.map((loan: any, i: number) => (
                <LoanCard key={loan.id ?? i} loan={loan} onEdit={() => setEditLoan(loan)} onDelete={() => setDeleteId(loan.id)} />
              ))}
            </div>
          )}
        </section>
      </>)}

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
        <div className="fixed inset-0 wl-sheet bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="wl-sheet-panel rounded-2xl p-6 w-full max-w-sm"
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
      <LearnStrip title="EMI decoded: where your money goes" href="/dashboard/learn" />
    </div>
  )
}
