'use client'
import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useViewStore } from '@/store/viewStore'
import { Plus, Pencil, Trash2, Loader2, Landmark, CalendarClock, BadgeCheck, Percent, ChevronRight } from 'lucide-react'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import AddLoanModal from '@/components/forms/AddLoanModal'
import { useHolderStore } from '@/store/holderStore'
import { PageHeader, InsightBar, AiActions, KpiTile, Donut, ProgressRow, LearnStrip } from '@/components/ui/kit'
import Link from 'next/link'

function toINR(amt: number, cur: string, fx: number) { return cur === 'AED' ? amt * fx : amt }

// Fixed colour per loan type (colour follows the type)
const LOAN_CATEGORIES = [
  { type: 'home_loan',     label: 'Home loan',     color: '#6A55E8', href: '/dashboard/loans/home'     },
  { type: 'car_loan',      label: 'Car loan',      color: '#3B8EF0', href: '/dashboard/loans/car'      },
  { type: 'bike_loan',     label: 'Bike loan',     color: '#0891B2', href: '/dashboard/loans/car'      },
  { type: 'gold_loan',     label: 'Gold loan',     color: '#F29A2E', href: '/dashboard/loans/gold'     },
  { type: 'loan_on_card',  label: 'Loan on card',  color: '#EC5B8C', href: '/dashboard/loans/card'     },
  { type: 'personal_loan', label: 'Personal loan', color: '#2FB67C', href: '/dashboard/loans/personal' },
  { type: 'other_loan',    label: 'Other loan',    color: '#94A3B8', href: '/dashboard/loans/other'    },
]
const catOf = (l: any) => LOAN_CATEGORIES.find(c => c.type === (l.loan_type || 'home_loan')) ?? LOAN_CATEGORIES[6]

function fmt(n: number, sym: string) {
  if (Math.abs(n) >= 10000000) return `${sym}${(n/10000000).toFixed(2)}Cr`
  if (Math.abs(n) >= 100000)   return `${sym}${(n/100000).toFixed(2)}L`
  return `${sym}${Math.round(n).toLocaleString('en-IN')}`
}

// Month-by-month payoff of `bal` at `rate`% a year paying `pay` a month:
// months taken and total interest (null when the payment never clears it).
function payoff(bal: number, rate: number, pay: number) {
  const r = rate / 1200
  if (pay <= bal * r || pay <= 0) return null
  let b = bal, months = 0, interest = 0
  while (b > 0.5 && months < 600) { const i = b * r; interest += i; b = b + i - pay; months++ }
  return { months, interest }
}

export default function LoansClient({ loans }: { loans: any[]; familyMembers?: any[] }) {
  const { view, fxRate: FX } = useViewStore()
  const { selectedHolder } = useHolderStore()
  const router   = useRouter()
  const supabase = createClient()

  const [showAdd,  setShowAdd]  = useState(false)
  const [editLoan, setEditLoan] = useState<any | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  const filtered = useMemo(() => {
    let base = loans
    if (view === 'uae')   base = base.filter(l => l.currency === 'AED')
    if (view === 'india') base = base.filter(l => l.currency === 'INR')
    if (selectedHolder)   base = base.filter(l => (l.holder_name ?? 'Self') === selectedHolder)
    return base
  }, [loans, view, selectedHolder])

  const conv = (amt: number, cur: string) => view === 'consolidated' ? toINR(amt, cur, FX) : amt
  const sym  = view === 'uae' ? 'AED ' : '₹'
  const money = (n: number) => fmt(n, sym)

  const totalOutstanding = filtered.reduce((a,l) => a + conv(Number(l.outstanding_amt), l.currency), 0)
  const totalEMI         = filtered.reduce((a,l) => a + conv(Number(l.emi_amount), l.currency), 0)
  const totalSanctioned  = filtered.reduce((a,l) => a + conv(Number(l.sanctioned_amt), l.currency), 0)
  const paidPct   = totalSanctioned > 0 ? Math.max(0, (totalSanctioned - totalOutstanding) / totalSanctioned * 100) : 0
  const avgRate   = totalOutstanding > 0 ? filtered.reduce((a, l) => a + conv(Number(l.outstanding_amt), l.currency) * Number(l.interest_rate || 0), 0) / totalOutstanding : 0

  const byType = LOAN_CATEGORIES.map(cat => {
    const items = filtered.filter(l => catOf(l).type === cat.type)
    return { ...cat, count: items.length,
      outstanding: items.reduce((a,l) => a + conv(Number(l.outstanding_amt), l.currency), 0),
      emi: items.reduce((a,l) => a + conv(Number(l.emi_amount), l.currency), 0) }
  }).filter(c => c.count > 0)

  // Path to debt-free: every loan amortised at its current EMI, summed per month
  const path = useMemo(() => {
    const bal = filtered.map(l => ({ b: conv(Number(l.outstanding_amt), l.currency), r: Number(l.interest_rate || 0) / 1200, p: conv(Number(l.emi_amount), l.currency) }))
    const pts: { m: number; value: number }[] = []
    for (let m = 0; m <= 360; m++) {
      const total = bal.reduce((a, x) => a + Math.max(x.b, 0), 0)
      pts.push({ m, value: Math.round(total) })
      if (total <= 0) break
      bal.forEach(x => { if (x.b > 0) x.b = x.p > 0 ? x.b * (1 + x.r) - x.p : x.b })
    }
    const last = pts[pts.length - 1]
    const d = new Date(); d.setMonth(d.getMonth() + last.m)
    // Thin the series to ~monthly for short paths, quarterly beyond 5 years
    const step = pts.length > 60 ? 3 : 1
    return {
      series: pts.filter((_, i) => i % step === 0 || i === pts.length - 1).map(p => {
        const x = new Date(); x.setMonth(x.getMonth() + p.m)
        return { ...p, label: x.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }) }
      }),
      clears: last.value <= 0, freeBy: d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }),
    }
  }, [filtered, view, FX])

  // Prepayment insight on the costliest loan: 10% of its EMI extra each month
  const costliest = [...filtered].filter(l => Number(l.outstanding_amt) > 0 && Number(l.emi_amount) > 0)
    .sort((a, b) => Number(b.interest_rate || 0) - Number(a.interest_rate || 0))[0]
  const prepay = (() => {
    if (!costliest) return null
    const bal = Number(costliest.outstanding_amt), rate = Number(costliest.interest_rate || 0), emi = Number(costliest.emi_amount)
    const extra = Math.max(1000, Math.round(emi * 0.1 / 1000) * 1000)
    const now = payoff(bal, rate, emi), faster = payoff(bal, rate, emi + extra)
    if (!now || !faster || now.months <= faster.months || now.interest - faster.interest < 1) return null
    const lSym = costliest.currency === 'AED' ? 'AED ' : '₹'
    return { name: costliest.name, rate, extra: fmt(extra, lSym), months: now.months - faster.months, saved: fmt(now.interest - faster.interest, lSym) }
  })()
  const insight = filtered.length === 0
    ? 'No active loans. Add one to see your EMIs, payoff date and the best prepayment option.'
    : [
        `You owe ${money(totalOutstanding)} across ${filtered.length} loan${filtered.length === 1 ? '' : 's'} and pay ${money(totalEMI)} a month.`,
        prepay && `${prepay.name} (${prepay.rate}%) costs the most — ${prepay.extra} extra a month clears it ${prepay.months} month${prepay.months === 1 ? '' : 's'} sooner and saves about ${prepay.saved} in interest.`,
      ].filter(Boolean).join(' ')
  const aiContext = `My loans (${view}): ${filtered.map(l => `${l.name} ${catOf(l).label}, ${Number(l.interest_rate)}%, outstanding ${fmt(Number(l.outstanding_amt), l.currency === 'AED' ? 'AED ' : '₹')}, EMI ${fmt(Number(l.emi_amount), l.currency === 'AED' ? 'AED ' : '₹')}`).join('; ') || 'none'}. Total EMI ${money(totalEMI)}/month.`

  async function handleDelete() {
    if (!deleteId) return
    setDeleting(true)
    await supabase.from('home_loans').update({ is_active: false }).eq('id', deleteId)
    setDeleting(false)
    setDeleteId(null)
    router.refresh()
  }

  return (
    // Phones follow the design's order via max-md:order (hero chart first)
    <div className="flex flex-col gap-3.5 md:gap-[18px] animate-fade-up">
      <div className="max-md:order-1">
        <PageHeader title="Loans"
          sub={`${filtered.length} active loan${filtered.length !== 1 ? 's' : ''} · ${money(totalEMI)} EMI a month`}
          onAdd={() => setShowAdd(true)} addLabel="Add loan"
          actions={<button onClick={() => setShowAdd(true)} className="wl-btn wl-btn-primary" style={{ height: 34 }}><Plus size={14} />Add loan</button>} />
      </div>

      <div className="max-md:order-4"><InsightBar text={insight} prompt={`Explain my loans page in plain language. ${aiContext}`} /></div>
      {filtered.length > 0 && <div className="max-md:order-5"><AiActions actions={['Best prepayment plan', 'Should I refinance?']} context={aiContext} /></div>}

      <div className="max-md:order-3 grid grid-cols-2 lg:grid-cols-4 gap-2.5 md:gap-3.5">
        <KpiTile className="max-md:hidden" label="Outstanding" value={money(totalOutstanding)} delta={`of ${money(totalSanctioned)} borrowed`} tint={0} icon={Landmark} />
        <KpiTile label="Monthly EMIs" value={money(totalEMI)} delta={`${filtered.length} loan${filtered.length === 1 ? '' : 's'}`} tint={2} icon={CalendarClock} />
        <KpiTile label="Paid off" value={`${paidPct.toFixed(0)}%`} delta={`${money(Math.max(totalSanctioned - totalOutstanding, 0))} repaid`} tone={paidPct >= 50 ? 'good' : 'neutral'} tint={1} icon={BadgeCheck} />
        <KpiTile label="Average rate" value={`${avgRate.toFixed(2)}%`} delta="Weighted by balance" tint={3} icon={Percent} />
      </div>

      {filtered.length > 0 && (
        <div className="max-md:contents grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-4">
          <section className="wl-card max-md:order-2 px-4 md:px-5 py-4 md:py-[18px] flex flex-col">
            <div className="md:hidden">
              <div className="text-[10.5px] font-semibold uppercase tracking-[0.05em]" style={{ color: 'var(--text3)' }}>Outstanding</div>
              <div className="text-[30px] font-bold tabular-nums tracking-[-0.02em] my-0.5" style={{ color: 'var(--text)' }}>{money(totalOutstanding)}</div>
            </div>
            <div className="flex justify-between items-baseline gap-3">
              <h2 className="hidden md:block text-[14px] font-semibold" style={{ color: 'var(--text)' }}>Your path to debt-free</h2>
              <div className="text-[12px] font-medium" style={{ color: path.clears ? 'var(--pos-text)' : 'var(--amber-text)' }}>
                {path.clears ? `Debt-free by ${path.freeBy} at current EMIs` : 'Some EMIs don’t cover the interest — balances won’t clear'}
              </div>
            </div>
            <div className="h-[110px] md:h-auto md:flex-1 md:min-h-[220px] mt-2.5 md:mt-4 -mx-1" aria-label={`Projected total outstanding, ${path.clears ? `reaching zero by ${path.freeBy}` : 'not reaching zero'}`}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={path.series} margin={{ top: 4, right: 6, bottom: 0, left: 6 }}>
                  <defs>
                    <linearGradient id="loanFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0" stopColor="#6A55E8" stopOpacity={0.28} /><stop offset="1" stopColor="#6A55E8" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#94A3B8' }} tickLine={false} axisLine={false} minTickGap={40} />
                  <YAxis hide domain={[0, 'dataMax']} />
                  <Tooltip cursor={{ stroke: 'var(--border2)', strokeWidth: 1 }}
                    contentStyle={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 10, fontSize: 12, padding: '6px 10px' }}
                    formatter={(v: any) => [money(Number(v)), 'Outstanding']} />
                  <Area type="monotone" dataKey="value" stroke="#6A55E8" strokeWidth={2.5} fill="url(#loanFill)" isAnimationActive={false} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="wl-card max-md:order-6 px-4 md:px-5 py-4 md:py-[18px] flex flex-col gap-3">
            <h2 className="text-[14px] font-semibold" style={{ color: 'var(--text)' }}>By loan type</h2>
            <div className="hidden md:flex justify-center">
              <Donut segments={byType.map(c => ({ value: c.outstanding, color: c.color }))} size={128}
                label={`Outstanding by loan type: ${byType.map(c => `${c.label} ${money(c.outstanding)}`).join(', ')}`}>
                <div className="text-[10.5px]" style={{ color: 'var(--text3)' }}>Owed</div>
                <div className="text-[16px] font-bold" style={{ color: 'var(--text)' }}>{money(totalOutstanding)}</div>
              </Donut>
            </div>
            {byType.map(c => (
              <ProgressRow key={c.type} href={c.href} name={c.label} sub={`${c.count} · ${money(c.emi)}/mo`} value={money(c.outstanding)}
                right={`${totalOutstanding > 0 ? Math.round(c.outstanding / totalOutstanding * 100) : 0}%`}
                pct={totalOutstanding > 0 ? c.outstanding / totalOutstanding * 100 : 0} color={c.color} />
            ))}
          </section>
        </div>
      )}

      {/* Active loans */}
      <section className="wl-card max-md:order-7 px-4 md:px-5 py-3.5 md:py-[18px]">
        <h2 className="text-[14px] font-semibold mb-1.5" style={{ color: 'var(--text)' }}>Active loans</h2>
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 gap-3 text-center">
            <Landmark size={28} style={{ color: 'var(--border2)' }} />
            <div className="text-[13px]" style={{ color: 'var(--text3)' }}>No loans added yet</div>
            <button onClick={() => setShowAdd(true)} className="wl-btn wl-btn-primary">Add loan</button>
          </div>
        ) : (<>
          <div className="hidden md:grid grid-cols-[2fr_0.8fr_1fr_1fr_1.2fr_72px] gap-3 text-[11px] font-semibold uppercase tracking-[0.04em] py-2" style={{ color: 'var(--text3)', borderBottom: '1px solid var(--border)' }}>
            <span>Loan</span><span>Rate</span><span className="text-right">EMI</span><span className="text-right">Outstanding</span><span>Repaid</span><span />
          </div>
          {filtered.map((loan: any) => {
            const cat = catOf(loan)
            const sanctioned = Number(loan.sanctioned_amt)
            const repaid = sanctioned > 0 ? Math.max(0, Math.round((sanctioned - Number(loan.outstanding_amt)) / sanctioned * 100)) : 0
            const lSym = loan.currency === 'AED' ? 'AED ' : '₹'
            const actions = (
              <span className="flex items-center gap-1 justify-end">
                <button onClick={() => setEditLoan(loan)} aria-label={`Edit ${loan.name}`} title="Edit loan"
                  className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-[var(--accent-bg)]" style={{ color: 'var(--accent)' }}><Pencil size={13} /></button>
                <button onClick={() => setDeleteId(loan.id)} aria-label={`Delete ${loan.name}`} title="Delete loan"
                  className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-[var(--rose-bg)]" style={{ color: 'var(--rose)' }}><Trash2 size={13} /></button>
              </span>
            )
            return (
              <div key={loan.id} className="md:grid md:grid-cols-[2fr_0.8fr_1fr_1fr_1.2fr_72px] md:gap-3 md:items-center py-3 md:py-[11px] text-[13px]" style={{ borderBottom: '1px solid #F1F5F9' }}>
                <Link href={`/dashboard/loans/detail/${loan.id}`} className="flex items-center gap-2.5 min-w-0 group">
                  <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: cat.color }} />
                  <span className="min-w-0">
                    <span className="block font-semibold truncate group-hover:underline" style={{ color: 'var(--text)' }}>{loan.name}</span>
                    <span className="block text-[11.5px] truncate" style={{ color: 'var(--text4)' }}>
                      {cat.label}{loan.bank_name ? ` · ${loan.bank_name}` : ''}{loan.holder_name && loan.holder_name !== 'Self' ? ` · ${loan.holder_name}` : ''}
                    </span>
                  </span>
                  <ChevronRight size={14} className="md:hidden ml-auto flex-shrink-0" style={{ color: '#CBD5E1' }} />
                </Link>
                <span className="hidden md:block" style={{ color: 'var(--text3)' }}>{Number(loan.interest_rate)}%</span>
                <span className="hidden md:block text-right tabular-nums font-semibold" style={{ color: 'var(--text)' }}>{lSym}{Number(loan.emi_amount).toLocaleString('en-IN')}</span>
                <span className="hidden md:block text-right tabular-nums font-semibold" style={{ color: 'var(--text)' }}>{fmt(Number(loan.outstanding_amt), lSym)}</span>
                <span className="hidden md:flex items-center gap-2">
                  <span className="flex-1 h-1.5 rounded-full" style={{ background: 'var(--track)' }}><span className="block h-full rounded-full wl-grow" style={{ width: `${repaid}%`, background: cat.color }} /></span>
                  <span className="text-[11.5px] w-8 text-right tabular-nums" style={{ color: 'var(--text3)' }}>{repaid}%</span>
                </span>
                <span className="hidden md:block">{actions}</span>
                {/* Phone: figures + actions under the name */}
                <div className="md:hidden mt-2">
                  <div className="flex justify-between text-[12px]" style={{ color: 'var(--text3)' }}>
                    <span>{Number(loan.interest_rate)}% · EMI <b style={{ color: 'var(--text)' }}>{lSym}{Number(loan.emi_amount).toLocaleString('en-IN')}</b></span>
                    <span>Owe <b style={{ color: 'var(--text)' }}>{fmt(Number(loan.outstanding_amt), lSym)}</b></span>
                  </div>
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className="flex-1 h-1.5 rounded-full" style={{ background: 'var(--track)' }}><span className="block h-full rounded-full" style={{ width: `${repaid}%`, background: cat.color }} /></span>
                    <span className="text-[11px]" style={{ color: 'var(--text3)' }}>{repaid}% repaid</span>
                    {actions}
                  </div>
                </div>
              </div>
            )
          })}
        </>)}
      </section>

      <div className="max-md:order-8"><LearnStrip title="EMI decoded: where your money goes" href="/dashboard/learn" /></div>

      {/* Add modal */}
      {showAdd && <AddLoanModal onClose={() => setShowAdd(false)} />}

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
        <div className="fixed inset-0 wl-sheet bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="wl-sheet-panel rounded-2xl p-6 w-full max-w-sm"
            style={{ background: '#fff', border: '1px solid var(--border)', boxShadow: '0 24px 60px rgba(15,23,42,.3)' }}>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                style={{ background: 'var(--rose-bg)' }}>
                <Trash2 size={18} style={{ color: 'var(--rose)' }} />
              </div>
              <h2 className="text-[15px] font-bold" style={{ color: 'var(--text)' }}>Delete loan?</h2>
            </div>
            <p className="text-[13px] mb-5" style={{ color: 'var(--text2)' }}>
              This loan will be removed from your dashboard. Transaction history remains intact.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteId(null)}
                className="flex-1 py-2.5 rounded-lg text-[12.5px] font-semibold"
                style={{ border: '1px solid var(--border)', color: 'var(--text3)', background: 'var(--bg2)' }}>
                Cancel
              </button>
              <button onClick={handleDelete} disabled={deleting}
                className="flex-1 py-2.5 rounded-lg text-white text-[12.5px] font-bold flex items-center justify-center gap-2 disabled:opacity-50"
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
