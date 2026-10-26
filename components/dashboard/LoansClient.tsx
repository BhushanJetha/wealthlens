'use client'
import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useViewStore } from '@/store/viewStore'
import { Plus, Pencil, Trash2, Loader2, Landmark, CalendarClock, BadgeCheck, Percent, Flag } from 'lucide-react'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import AddLoanModal from '@/components/forms/AddLoanModal'
import { useHolderStore } from '@/store/holderStore'
import { PageHeader, InsightBar, AiActions, KpiTile, HeroStat, Donut, ProgressRow, LearnStrip } from '@/components/ui/kit'
import LoanCard, { LOAN_TYPES, loanTypeOf } from './LoanCard'
import Link from 'next/link'

function toINR(amt: number, cur: string, fx: number) { return cur === 'AED' ? amt * fx : amt }

const LOAN_CATEGORIES = LOAN_TYPES
const catOf = loanTypeOf

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

      {filtered.length > 0 && (
        <div className="max-md:contents grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-4">
          {/* Headline number + path to debt-free (same card on desktop and phone) */}
          <HeroStat className="max-md:order-2" label="Outstanding" value={money(totalOutstanding)}
            delta={path.clears ? `Debt-free by ${path.freeBy} at current EMIs` : 'Some EMIs don’t cover the interest — balances won’t clear'}
            tone={path.clears ? 'good' : 'bad'}
            right={<span className="text-[11.5px]" style={{ color: 'var(--text3)' }}>of {money(totalSanctioned)} borrowed</span>}>
            <div className="h-[110px] md:h-auto md:flex-1 md:min-h-[200px] mt-2.5 md:mt-4 -mx-1" aria-label={`Projected total outstanding, ${path.clears ? `reaching zero by ${path.freeBy}` : 'not reaching zero'}`}>
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
          </HeroStat>

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

      {/* KPIs: same four tiles on both sizes */}
      <div className="max-md:order-3 grid grid-cols-2 lg:grid-cols-4 gap-2.5 md:gap-3.5">
        <KpiTile label="Monthly EMIs" value={money(totalEMI)} delta={`${filtered.length} loan${filtered.length === 1 ? '' : 's'}`} tint={2} icon={CalendarClock} />
        <KpiTile label="Paid off" value={`${paidPct.toFixed(0)}%`} delta={`${money(Math.max(totalSanctioned - totalOutstanding, 0))} repaid`} tone={paidPct >= 50 ? 'good' : 'neutral'} tint={1} icon={BadgeCheck} />
        <KpiTile label="Average rate" value={`${avgRate.toFixed(2)}%`} delta="Weighted by balance" tint={3} icon={Percent} />
        <KpiTile label="Debt-free by" value={filtered.length && path.clears ? path.freeBy : '—'} delta={filtered.length ? 'at current EMIs' : 'No loans'} tint={0} icon={Flag} />
      </div>

      {/* Active loans: one card each — tap a card to open its payoff plan */}
      <section className="max-md:order-7 flex flex-col gap-2.5 md:gap-3">
        <div className="flex items-baseline justify-between gap-2 px-0.5">
          <h2 className="text-[15px] md:text-[16px] font-semibold" style={{ color: 'var(--text)' }}>Your loans</h2>
          {filtered.length > 0 && <span className="text-[12px]" style={{ color: 'var(--text3)' }}>Tap a loan for its payoff plan</span>}
        </div>
        {filtered.length === 0 ? (
          <div className="wl-card flex flex-col items-center justify-center py-10 gap-3 text-center">
            <Landmark size={28} style={{ color: 'var(--border2)' }} />
            <div className="text-[13px]" style={{ color: 'var(--text3)' }}>No loans added yet</div>
            <button onClick={() => setShowAdd(true)} className="wl-btn wl-btn-primary">Add loan</button>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5 md:gap-3.5">
            {[...filtered].sort((a, b) => conv(Number(b.outstanding_amt), b.currency) - conv(Number(a.outstanding_amt), a.currency)).map((loan: any) => (
              <LoanCard key={loan.id} loan={loan} onEdit={() => setEditLoan(loan)} onDelete={() => setDeleteId(loan.id)} />
            ))}
          </div>
        )}
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
