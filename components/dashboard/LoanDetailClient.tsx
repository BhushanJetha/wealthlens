'use client'
import { useMemo, useState, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { amortize, simulatePayoff } from '@/lib/amortization'
import Pagination from '@/components/dashboard/Pagination'
import {
  ChevronLeft, Building2, Plus, Trash2, Loader2, Pencil, Check, X,
  TrendingDown, Coins, Home, Wallet, CalendarClock, Upload,
  ListChecks, Landmark, Sparkles, CheckCircle2, Circle, PiggyBank,
} from 'lucide-react'

const todayISO = () => new Date().toISOString().slice(0, 10)

export default function LoanDetailClient({ loan, txns, plan = [] }: { loan: any; txns: any[]; plan?: any[] }) {
  const router = useRouter()
  const supabase = createClient()
  const sym = loan.currency === 'AED' ? 'AED ' : '₹'
  const money = (n: number) => `${sym}${Math.round(Number(n) || 0).toLocaleString('en-IN')}`
  const isHome = loan.loan_type === 'home_loan'

  const [tab, setTab] = useState<'plan' | 'own' | 'loan' | 'emi' | 'schedule'>(isHome ? 'plan' : 'loan')
  const [adding, setAdding] = useState<'none' | 'disbursement' | 'own_contribution' | 'prepayment'>('none')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState({ date: todayISO(), amount: '', note: '' })
  const [saving, setSaving] = useState(false)
  const [editCost, setEditCost] = useState(false)
  const [costVal, setCostVal] = useState(String(loan.property_cost ?? ''))
  const [emiPage, setEmiPage] = useState(1); const [emiSize, setEmiSize] = useState(10)
  const [schedPage, setSchedPage] = useState(1); const [schedSize, setSchedSize] = useState(12)
  const [importing, setImporting] = useState(false)
  const [importMsg, setImportMsg] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  // prepayment simulator
  const [extraYearly, setExtraYearly] = useState(false)
  const [extraMonthly, setExtraMonthly] = useState('')
  // payment plan modal
  const [planModal, setPlanModal] = useState<null | 'add' | string>(null)
  const [planForm, setPlanForm] = useState({ milestone: '', percentage: '', amount: '' })

  const disbursements = useMemo(() => txns.filter(t => t.kind === 'disbursement'), [txns])
  const contributions = useMemo(() => txns.filter(t => t.kind === 'own_contribution'), [txns])
  const prepays       = useMemo(() => txns.filter(t => t.kind === 'prepayment'), [txns])
  const totalPrepay   = prepays.reduce((a, t) => a + Number(t.amount), 0)
  const emiPays       = useMemo(() => [...txns.filter(t => t.kind === 'emi')].sort((a, b) => a.txn_date < b.txn_date ? 1 : -1), [txns])
  const totalEmiPaid  = emiPays.reduce((a, t) => a + Number(t.amount), 0)
  const totalDisbursedTxn = disbursements.reduce((a, t) => a + Number(t.amount), 0)
  const totalOwn = contributions.reduce((a, t) => a + Number(t.amount), 0)

  const effectiveDisbursed = totalDisbursedTxn > 0 ? totalDisbursedTxn : Number(loan.disbursed_amt) || Number(loan.sanctioned_amt) || 0

  const amort = useMemo(() => amortize({
    principal: effectiveDisbursed,
    annualRate: Number(loan.interest_rate) || 0,
    tenureMonths: Number(loan.tenure_months) || 0,
    emi: Number(loan.emi_amount) || 0,
    monthsPaid: Number(loan.months_paid) || 0,
    outstanding: Number(loan.outstanding_amt) || 0,
    startDate: loan.loan_start_date || undefined,
  }), [loan, effectiveDisbursed])

  const emisPaidCount = Math.max(emiPays.length, amort.emisPaid)
  const princBarPaid = amort.principal > 0 ? (amort.principalPaid / amort.principal) * 100 : 0
  const intTotal = amort.interestPaid + amort.totalInterest
  const intBarPaid = intTotal > 0 ? (amort.interestPaid / intTotal) * 100 : 0

  const propertyCost = Number(loan.property_cost) || 0
  const fundedTotal  = effectiveDisbursed + totalOwn
  const outstandingToBuilder = propertyCost > 0 ? Math.max(0, propertyCost - fundedTotal) : 0
  const fundLoanPct = propertyCost > 0 ? (effectiveDisbursed / propertyCost) * 100 : 0
  const fundOwnPct  = propertyCost > 0 ? (totalOwn / propertyCost) * 100 : 0
  const loanShare   = fundedTotal > 0 ? Math.round((effectiveDisbursed / fundedTotal) * 100) : 0
  const ownShare    = fundedTotal > 0 ? 100 - loanShare : 0
  const barLoan     = propertyCost > 0 ? Math.min(100, fundLoanPct) : loanShare
  const barOwn      = propertyCost > 0 ? Math.min(100, fundOwnPct) : ownShare

  // ── Payment plan: waterfall-allocate actual payments into the builder slabs ──
  const slabs = useMemo(() => [...plan].sort((a, b) => (a.slab_no ?? 0) - (b.slab_no ?? 0)), [plan])
  const planTotal = slabs.reduce((s, x) => s + (Number(x.amount) || 0), 0)
  const planStatus = useMemo(() => {
    const pays = [
      ...disbursements.map((d: any) => ({ date: d.txn_date, amt: Number(d.amount), src: 'loan' as const })),
      ...contributions.map((c: any) => ({ date: c.txn_date, amt: Number(c.amount), src: 'own' as const })),
    ].sort((a, b) => (a.date < b.date ? -1 : 1))
    let pi = 0, rem = pays[0]?.amt ?? 0
    return slabs.map(slab => {
      let need = Number(slab.amount) || 0, fromLoan = 0, fromOwn = 0
      while (need > 0.5 && pi < pays.length) {
        const take = Math.min(need, rem)
        if (pays[pi].src === 'loan') fromLoan += take; else fromOwn += take
        need -= take; rem -= take
        if (rem <= 0.5) { pi++; rem = pays[pi]?.amt ?? 0 }
      }
      const amt = Number(slab.amount) || 0
      const paid = amt - need
      return { slab, paid, gap: need, fromLoan, fromOwn, status: (paid >= amt - 0.5 && amt > 0) ? 'paid' : paid > 0 ? 'partial' : 'pending' }
    })
  }, [slabs, disbursements, contributions])
  const planPaid = planStatus.reduce((s, x) => s + x.paid, 0)

  // ── Prepayment simulator ────────────────────────────────────────────────────
  const outstandingBal = Number(loan.outstanding_amt) || amort.remaining || 0
  const emiVal = amort.emi
  const baseSim = useMemo(() => simulatePayoff(outstandingBal, Number(loan.interest_rate) || 0, emiVal, 0, 0), [outstandingBal, loan.interest_rate, emiVal])
  const extraM = Number(extraMonthly) || 0
  const extraA = extraYearly ? emiVal : 0
  const withSim = useMemo(() => simulatePayoff(outstandingBal, Number(loan.interest_rate) || 0, emiVal, extraM, extraA), [outstandingBal, loan.interest_rate, emiVal, extraM, extraA])
  const monthsSaved = Number.isFinite(withSim.months) ? Math.max(0, baseSim.months - withSim.months) : 0
  const interestSaved = Number.isFinite(withSim.interest) ? Math.max(0, baseSim.interest - withSim.interest) : 0
  const hasExtra = extraM > 0 || extraA > 0
  const payoffWith = (() => { const d = new Date(); d.setMonth(d.getMonth() + (Number.isFinite(withSim.months) ? withSim.months : baseSim.months)); return d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }) })()
  const payoffBase = (() => { const d = new Date(); d.setMonth(d.getMonth() + baseSim.months); return d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }) })()

  // ── Insights ────────────────────────────────────────────────────────────────
  const lifeInterest = amort.interestPaid + amort.totalInterest
  const interestPctOfPrincipal = amort.principal > 0 ? Math.round((lifeInterest / amort.principal) * 100) : 0
  const disbursedPct = Number(loan.sanctioned_amt) > 0 ? Math.round((effectiveDisbursed / Number(loan.sanctioned_amt)) * 100) : null
  const insightNotes: string[] = []
  if (disbursedPct != null && disbursedPct < 98) insightNotes.push(`Under construction: ${disbursedPct}% of the sanctioned amount disbursed. Your EMI will rise as more is drawn.`)
  if (interestPctOfPrincipal >= 40) insightNotes.push(`Over the full term you'll pay ${money(lifeInterest)} interest — about ${interestPctOfPrincipal}% of the principal. Even small prepayments cut this sharply.`)
  if (totalPrepay > 0) insightNotes.push(`You've prepaid ${money(totalPrepay)} so far — that directly reduces principal and total interest.`)

  // ── Handlers ────────────────────────────────────────────────────────────────
  async function importStatement(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (fileRef.current) fileRef.current.value = ''
    if (!file) return
    setImporting(true); setImportMsg(null)
    try {
      const fd = new FormData(); fd.append('file', file)
      const res = await fetch('/api/parse-loan-document', { method: 'POST', body: fd })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || 'Could not read the statement')
      const { data: { user } } = await supabase.auth.getUser()
      const seen = new Set(txns.map((t: any) => `${t.kind}|${t.txn_date}|${Math.round(Number(t.amount))}`))
      const tx = j.transactions || {}
      const incoming = [
        ...(tx.disbursements ?? []).map((d: any) => ({ kind: 'disbursement', ...d })),
        ...(tx.prepayments ?? []).map((d: any) => ({ kind: 'prepayment', ...d })),
        ...(tx.emis ?? []).map((d: any) => ({ kind: 'emi', ...d })),
      ].filter((r: any) => !seen.has(`${r.kind}|${r.txn_date}|${Math.round(Number(r.amount))}`))
      const rows = incoming.map((r: any) => ({ user_id: user!.id, loan_id: loan.id, kind: r.kind, txn_date: r.txn_date, amount: r.amount, note: r.note ?? null }))
      if (rows.length) await supabase.from('loan_transactions').insert(rows)
      const upd: Record<string, any> = {}
      const totalDisb = [...disbursements, ...rows.filter(r => r.kind === 'disbursement')].reduce((s, t: any) => s + Number(t.amount), 0)
      if (totalDisb > 0) upd.disbursed_amt = totalDisb
      if (j.data?.months_paid) upd.months_paid = Number(j.data.months_paid)
      if (j.data?.outstanding_amt) upd.outstanding_amt = Number(j.data.outstanding_amt)
      if (j.data?.emi_amount) upd.emi_amount = Number(j.data.emi_amount)
      if (j.data?.tenure_months) upd.tenure_months = Number(j.data.tenure_months)
      if (j.data?.interest_rate) upd.interest_rate = Number(j.data.interest_rate)
      if (j.data?.sanctioned_amt) upd.sanctioned_amt = Number(j.data.sanctioned_amt)
      if (j.data?.next_emi_date) upd.next_emi_date = j.data.next_emi_date
      if (Object.keys(upd).length) { try { await supabase.from('home_loans').update(upd).eq('id', loan.id) } catch {} }
      setImportMsg(rows.length ? `Imported ${rows.length} new transaction${rows.length !== 1 ? 's' : ''}.` : 'No new transactions found (already up to date).')
      router.refresh()
    } catch (err: any) { setImportMsg(err.message || 'Could not import the statement.') }
    setImporting(false)
  }

  function openAdd(kind: 'disbursement' | 'own_contribution' | 'prepayment') { setEditingId(null); setForm({ date: todayISO(), amount: '', note: '' }); setAdding(kind) }
  function openEdit(t: any) { setEditingId(t.id); setForm({ date: t.txn_date, amount: String(t.amount), note: t.note ?? '' }); setAdding(t.kind) }
  function closeModal() { setAdding('none'); setEditingId(null); setForm({ date: todayISO(), amount: '', note: '' }) }

  async function saveTxn() {
    const amt = Number(form.amount); if (!amt || amt <= 0) return
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (editingId) await supabase.from('loan_transactions').update({ txn_date: form.date, amount: amt, note: form.note || null }).eq('id', editingId)
    else await supabase.from('loan_transactions').insert({ user_id: user!.id, loan_id: loan.id, kind: adding, txn_date: form.date, amount: amt, note: form.note || null })
    if (adding === 'disbursement') {
      const others = disbursements.filter(d => d.id !== editingId).reduce((s, d) => s + Number(d.amount), 0)
      await supabase.from('home_loans').update({ disbursed_amt: others + amt }).eq('id', loan.id)
    }
    setSaving(false); closeModal(); router.refresh()
  }
  async function delTxn(id: string) { await supabase.from('loan_transactions').delete().eq('id', id); router.refresh() }
  async function saveCost() { await supabase.from('home_loans').update({ property_cost: Number(costVal) || null }).eq('id', loan.id); setEditCost(false); router.refresh() }

  function openPlanAdd() { setPlanForm({ milestone: '', percentage: '', amount: '' }); setPlanModal('add') }
  function openPlanEdit(s: any) { setPlanForm({ milestone: s.milestone ?? '', percentage: String(s.percentage ?? ''), amount: String(s.amount ?? '') }); setPlanModal(s.id) }
  async function savePlan() {
    const pct = Number(planForm.percentage) || 0
    const amount = Number(planForm.amount) || (propertyCost > 0 && pct > 0 ? Math.round(propertyCost * pct / 100) : 0)
    if (!planForm.milestone || amount <= 0) return
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    const payload: any = { milestone: planForm.milestone, percentage: pct || null, amount }
    try {
      if (planModal === 'add') await supabase.from('loan_payment_plan').insert({ user_id: user!.id, loan_id: loan.id, slab_no: slabs.length + 1, ...payload })
      else await supabase.from('loan_payment_plan').update(payload).eq('id', planModal)
    } catch {}
    setSaving(false); setPlanModal(null); router.refresh()
  }
  async function delPlan(id: string) { try { await supabase.from('loan_payment_plan').delete().eq('id', id) } catch {}; router.refresh() }

  const schedP = Math.min(schedPage, Math.max(1, Math.ceil(amort.schedule.length / schedSize)))
  const schedule = amort.schedule.slice((schedP - 1) * schedSize, schedP * schedSize)
  const emiP = Math.min(emiPage, Math.max(1, Math.ceil(emiPays.length / emiSize)))
  const emiPaged = emiPays.slice((emiP - 1) * emiSize, emiP * emiSize)

  const TABS: { key: typeof tab; label: string; icon: any }[] = [
    ...(isHome ? [{ key: 'plan' as const, label: 'Payment Plan', icon: ListChecks }, { key: 'own' as const, label: 'Own Contribution', icon: Wallet }] : []),
    { key: 'loan', label: 'Loan / Disbursements', icon: Landmark },
    { key: 'emi', label: 'EMIs Paid', icon: CalendarClock },
    { key: 'schedule', label: 'Schedule & Prepay', icon: TrendingDown },
  ]

  return (
    <div className="space-y-5 animate-fade-up">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <Link href="/dashboard/loans" className="flex items-center gap-1 text-[11px] mb-2" style={{ color: 'var(--sage)' }}><ChevronLeft size={13} /> All Loans</Link>
          <h1 className="text-xl font-bold flex items-center gap-2" style={{ color: 'var(--text)' }}><Building2 size={18} style={{ color: 'var(--blue)' }} /> {loan.name}</h1>
          <p className="text-[12px] mt-0.5" style={{ color: 'var(--text3)' }}>{loan.bank_name} · {loan.interest_rate}% p.a. · {loan.tenure_months} mo tenure</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => fileRef.current?.click()} disabled={importing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold border disabled:opacity-60"
            style={{ background: 'var(--sage-bg)', borderColor: 'var(--sage)', color: 'var(--sage)' }} title="Import from a loan statement PDF">
            {importing ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />} Import statement
          </button>
          <input ref={fileRef} type="file" accept=".pdf,application/pdf" className="hidden" onChange={importStatement} />
        </div>
      </div>
      {importMsg && <div className="text-[11px]" style={{ color: 'var(--text2)' }}>{importMsg}</div>}

      {/* Summary strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {isHome && <Stat label="Property Value" value={propertyCost > 0 ? money(propertyCost) : '— set below'} icon={Home} />}
        <Stat label="Sanctioned Amount" value={money(loan.sanctioned_amt)} />
        <Stat label="Loan Disbursed (to date)" value={money(effectiveDisbursed)} color="var(--blue)" />
        <Stat label="Loan Outstanding" value={money(loan.outstanding_amt)} color="var(--rose)" />
        {isHome && <Stat label="Outstanding to Builder" value={propertyCost > 0 ? money(outstandingToBuilder) : '—'} color="var(--gold)" />}
        {isHome && <Stat label="Own Contribution" value={money(totalOwn)} color="var(--income)" />}
        <Stat label="Current EMI" value={money(loan.emi_amount)} />
        <Stat label="EMIs Paid / Remaining" value={`${emisPaidCount} / ${amort.balanceTenor}`} icon={CalendarClock} />
      </div>

      {/* Repayment breakdown */}
      <div className="wl-card p-4">
        <div className="text-[11px] font-bold uppercase tracking-wider mb-3 flex items-center gap-1.5" style={{ color: 'var(--text3)' }}><TrendingDown size={12} /> Repayment Breakdown</div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          <Mini label="Principal Paid" value={money(amort.principalPaid)} color="var(--income)" />
          <Mini label="Interest Paid" value={money(amort.interestPaid)} color="var(--rose)" />
          <Mini label="Remaining Principal" value={money(amort.remaining)} color="var(--text2)" />
          {isHome && <Mini label="Own Contribution" value={money(totalOwn)} color="var(--blue)" />}
        </div>
        <div className="space-y-3">
          <div>
            <div className="flex justify-between text-[10px] mb-1" style={{ color: 'var(--text3)' }}><span>Principal: {money(amort.principalPaid)} paid</span><span>of {money(amort.principal)}</span></div>
            <div className="h-2.5 rounded-full overflow-hidden" style={{ background: 'var(--bg2)' }}><div className="h-full" style={{ width: `${Math.min(100, princBarPaid)}%`, background: 'var(--income)' }} /></div>
          </div>
          <div>
            <div className="flex justify-between text-[10px] mb-1" style={{ color: 'var(--text3)' }}><span>Interest: {money(amort.interestPaid)} paid</span><span>~{money(intTotal)} total cost</span></div>
            <div className="h-2.5 rounded-full overflow-hidden" style={{ background: 'var(--bg2)' }}><div className="h-full" style={{ width: `${Math.min(100, intBarPaid)}%`, background: 'var(--rose)' }} /></div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="wl-card overflow-hidden">
        <div className="flex border-b overflow-x-auto no-scrollbar" style={{ borderColor: 'var(--border)' }}>
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className="flex items-center gap-1.5 px-4 py-3 text-[12px] font-semibold whitespace-nowrap transition-all border-b-2"
              style={tab === t.key ? { borderColor: 'var(--sage)', color: 'var(--sage)', background: 'var(--sage-bg)' } : { borderColor: 'transparent', color: 'var(--text3)' }}>
              <t.icon size={13} /> {t.label}
            </button>
          ))}
        </div>

        <div className="p-4">
          {/* ── Payment plan tab ── */}
          {tab === 'plan' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="text-[12px]" style={{ color: 'var(--text3)' }}>
                  Builder's slab-wise plan · funded <b style={{ color: 'var(--text)' }}>{money(planPaid)}</b>{planTotal > 0 ? ` of ${money(planTotal)}` : ''}
                </div>
                <button onClick={openPlanAdd} className="flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1.5 rounded-lg" style={{ background: 'var(--sage)', color: '#fff' }}><Plus size={12} /> Add slab</button>
              </div>
              {slabs.length === 0 ? (
                <Empty text="No payment plan yet. Add the builder's milestones (e.g. On Booking 10%, Plinth 15%, each floor slab…). As you record disbursements & own contributions, each slab is marked paid automatically." />
              ) : (
                <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
                  <div className="overflow-x-auto">
                    <table className="w-full text-[12px]">
                      <thead>
                        <tr style={{ background: 'var(--bg2)', borderBottom: '1px solid var(--border)' }}>
                          {['#', 'Milestone', 'Amount', 'Paid', 'Funded from', 'Status', ''].map(h => <th key={h} className="px-3 py-2 text-left text-[10px] uppercase tracking-wider font-bold" style={{ color: 'var(--text3)' }}>{h}</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {planStatus.map((ps, i) => {
                          const c = ps.status === 'paid' ? 'var(--income)' : ps.status === 'partial' ? 'var(--gold)' : 'var(--text3)'
                          return (
                            <tr key={ps.slab.id} style={{ borderBottom: '1px solid var(--border)' }}>
                              <td className="px-3 py-2 font-mono" style={{ color: 'var(--text3)' }}>{i + 1}</td>
                              <td className="px-3 py-2 font-medium" style={{ color: 'var(--text)' }}>{ps.slab.milestone}{ps.slab.percentage ? <span className="text-[10px]" style={{ color: 'var(--text3)' }}> · {ps.slab.percentage}%</span> : ''}</td>
                              <td className="px-3 py-2 font-mono" style={{ color: 'var(--text)' }}>{money(ps.slab.amount)}</td>
                              <td className="px-3 py-2 font-mono" style={{ color: c }}>{money(ps.paid)}{ps.gap > 0.5 && ps.paid > 0 ? <span className="text-[10px]" style={{ color: 'var(--gold)' }}> (−{money(ps.gap)})</span> : ''}</td>
                              <td className="px-3 py-2 text-[10px]" style={{ color: 'var(--text3)' }}>
                                {ps.fromLoan > 0 && <span style={{ color: 'var(--blue)' }}>Loan {money(ps.fromLoan)}</span>}
                                {ps.fromLoan > 0 && ps.fromOwn > 0 && ' · '}
                                {ps.fromOwn > 0 && <span style={{ color: 'var(--income)' }}>Own {money(ps.fromOwn)}</span>}
                                {ps.paid === 0 && '—'}
                              </td>
                              <td className="px-3 py-2">
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: c + '18', color: c }}>
                                  {ps.status === 'paid' ? <CheckCircle2 size={10} /> : <Circle size={10} />}{ps.status === 'paid' ? 'Paid' : ps.status === 'partial' ? 'Partial' : 'Pending'}
                                </span>
                              </td>
                              <td className="px-3 py-2 text-right whitespace-nowrap">
                                <button onClick={() => openPlanEdit(ps.slab)} className="p-1 rounded mr-1" style={{ color: 'var(--blue)' }}><Pencil size={12} /></button>
                                <button onClick={() => delPlan(ps.slab.id)} className="p-1 rounded" style={{ color: 'var(--rose)' }}><Trash2 size={12} /></button>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                      <tfoot>
                        <tr style={{ background: 'var(--bg2)', borderTop: '2px solid var(--border)' }}>
                          <td className="px-3 py-2 font-bold" colSpan={2} style={{ color: 'var(--text)' }}>Total</td>
                          <td className="px-3 py-2 font-mono font-bold" style={{ color: 'var(--text)' }}>{money(planTotal)}</td>
                          <td className="px-3 py-2 font-mono font-bold" style={{ color: 'var(--income)' }}>{money(planPaid)}</td>
                          <td colSpan={3}></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              )}
              {planTotal > 0 && propertyCost > 0 && Math.abs(planTotal - propertyCost) > 1 && (
                <p className="text-[10px]" style={{ color: 'var(--gold)' }}>Note: plan total ({money(planTotal)}) differs from property value ({money(propertyCost)}). Adjust slabs or property cost.</p>
              )}
            </div>
          )}

          {/* ── Own contribution tab ── */}
          {tab === 'own' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="text-[12px]" style={{ color: 'var(--text3)' }}>Down-payments from your own funds · <b style={{ color: 'var(--income)' }}>{money(totalOwn)}</b></div>
                  {!editCost && <button onClick={() => { setEditCost(true); setCostVal(String(loan.property_cost ?? '')) }} className="text-[11px] flex items-center gap-1" style={{ color: 'var(--sage)' }}><Pencil size={11} /> Property cost</button>}
                </div>
                <button onClick={() => openAdd('own_contribution')} className="flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1.5 rounded-lg" style={{ background: 'var(--sage)', color: '#fff' }}><Plus size={12} /> Add</button>
              </div>
              {editCost && (
                <div className="flex items-center gap-2">
                  <span className="text-[12px]" style={{ color: 'var(--text3)' }}>Total property cost {sym}</span>
                  <input type="number" value={costVal} onChange={e => setCostVal(e.target.value)} className="wl-input text-[12px] w-40" style={{ background: 'var(--bg2)', border: '1px solid var(--border)', color: 'var(--text)' }} autoFocus />
                  <button onClick={saveCost} className="p-1.5 rounded-lg" style={{ background: 'var(--income-bg)', color: 'var(--income)' }}><Check size={14} /></button>
                  <button onClick={() => setEditCost(false)} className="p-1.5 rounded-lg" style={{ background: 'var(--bg2)', color: 'var(--text3)' }}><X size={14} /></button>
                </div>
              )}
              {/* Funding split */}
              <div className="rounded-xl p-3" style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}>
                <div className="h-3 rounded-full overflow-hidden flex" style={{ background: 'var(--card)' }}>
                  <div style={{ width: `${barLoan}%`, background: 'var(--blue)' }} /><div style={{ width: `${barOwn}%`, background: 'var(--income)' }} />
                </div>
                <div className="flex gap-4 mt-1.5 text-[10px]" style={{ color: 'var(--text3)' }}>
                  <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: 'var(--blue)' }} /> Loan {money(effectiveDisbursed)} ({propertyCost > 0 ? Math.round(fundLoanPct) : loanShare}%)</span>
                  <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: 'var(--income)' }} /> Own {money(totalOwn)} ({propertyCost > 0 ? Math.round(fundOwnPct) : ownShare}%)</span>
                  {propertyCost > 0 && outstandingToBuilder > 0 && <span>· Yet to fund {money(outstandingToBuilder)}</span>}
                </div>
              </div>
              {contributions.length === 0 ? <Empty text="No own-contribution entries yet." /> : <TxnTable items={contributions} money={money} onDel={delTxn} onEdit={openEdit} detailLabel="Note" />}
            </div>
          )}

          {/* ── Loan / disbursements tab ── */}
          {tab === 'loan' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-[12px]" style={{ color: 'var(--text3)' }}>Bank disbursements to date · <b style={{ color: 'var(--blue)' }}>{money(effectiveDisbursed)}</b>{Number(loan.sanctioned_amt) > 0 ? ` of ${money(loan.sanctioned_amt)} sanctioned` : ''}</div>
                <button onClick={() => openAdd('disbursement')} className="flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1.5 rounded-lg" style={{ background: 'var(--sage)', color: '#fff' }}><Plus size={12} /> Add</button>
              </div>
              {disbursements.length === 0 ? <Empty text="No disbursement entries yet — add each tranche the bank releases, or import a statement." /> : <TxnTable items={disbursements} money={money} onDel={delTxn} onEdit={openEdit} detailLabel="Particulars" />}
            </div>
          )}

          {/* ── EMIs paid tab ── */}
          {tab === 'emi' && (
            emiPays.length === 0 ? <Empty text="No EMI payments recorded yet — import a loan statement to pull in your paid EMIs." /> : (
              <div className="space-y-2">
                <div className="text-[12px] mb-1" style={{ color: 'var(--text3)' }}>{emiPays.length} EMIs paid · total <b style={{ color: 'var(--income)' }}>{money(totalEmiPaid)}</b></div>
                <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
                  <div className="overflow-x-auto">
                    <table className="w-full text-[12px]">
                      <thead><tr style={{ background: 'var(--bg2)', borderBottom: '1px solid var(--border)' }}>{['EMI', 'Date', 'Amount', ''].map(h => <th key={h} className="px-3 py-2 text-left text-[10px] uppercase tracking-wider font-bold" style={{ color: 'var(--text3)' }}>{h}</th>)}</tr></thead>
                      <tbody>
                        {emiPaged.map(t => (
                          <tr key={t.id} style={{ borderBottom: '1px solid var(--border)' }}>
                            <td className="px-3 py-2" style={{ color: 'var(--text2)' }}>{t.note ?? 'EMI'}</td>
                            <td className="px-3 py-2 font-mono" style={{ color: 'var(--text3)' }}>{t.txn_date}</td>
                            <td className="px-3 py-2 font-mono font-semibold" style={{ color: 'var(--income)' }}>{money(t.amount)}</td>
                            <td className="px-3 py-2 text-right"><button onClick={() => delTxn(t.id)} style={{ color: 'var(--rose)' }}><Trash2 size={12} /></button></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {emiPays.length > emiSize && <Pagination total={emiPays.length} page={emiP} pageSize={emiSize} onPage={setEmiPage} onPageSize={s => { setEmiSize(s); setEmiPage(1) }} />}
                </div>
              </div>
            )
          )}

          {/* ── Schedule & prepay tab ── */}
          {tab === 'schedule' && (
            <div className="space-y-4">
              {/* Prepayment simulator */}
              <div className="rounded-xl p-4" style={{ background: 'var(--sage-bg)', border: '1px solid var(--sage)' }}>
                <div className="text-[12px] font-bold flex items-center gap-1.5 mb-1" style={{ color: 'var(--sage)' }}><Sparkles size={14} /> Prepayment savings</div>
                <p className="text-[11px] mb-3" style={{ color: 'var(--text3)' }}>See how much interest and time you save by paying a little extra.</p>
                <div className="flex items-center gap-3 flex-wrap mb-3">
                  <button onClick={() => setExtraYearly(v => !v)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold border"
                    style={extraYearly ? { background: 'var(--sage)', borderColor: 'var(--sage)', color: '#fff' } : { background: 'var(--card)', borderColor: 'var(--border)', color: 'var(--text3)' }}>
                    {extraYearly ? <CheckCircle2 size={13} /> : <Circle size={13} />} +1 EMI every year
                  </button>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px]" style={{ color: 'var(--text3)' }}>+ extra / month {sym}</span>
                    <input type="number" value={extraMonthly} onChange={e => setExtraMonthly(e.target.value)} placeholder="0" min="0"
                      className="wl-input text-[12px] w-28" style={{ background: 'var(--card)', border: '1px solid var(--border)', color: 'var(--text)' }} />
                    {[5000, 10000, 25000].map(v => <button key={v} onClick={() => setExtraMonthly(String(v))} className="text-[10px] px-2 py-1 rounded" style={{ background: 'var(--card)', border: '1px solid var(--border)', color: 'var(--text3)' }}>{money(v)}</button>)}
                  </div>
                </div>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  <Mini label="Interest you'll save" value={hasExtra ? money(interestSaved) : '—'} color="var(--income)" />
                  <Mini label="Time saved" value={hasExtra && monthsSaved > 0 ? `${Math.floor(monthsSaved / 12)}y ${monthsSaved % 12}m` : '—'} color="var(--income)" />
                  <Mini label="Payoff without extra" value={`${payoffBase}`} color="var(--text2)" />
                  <Mini label="Payoff with extra" value={hasExtra ? payoffWith : '—'} color="var(--sage)" />
                </div>
                {hasExtra && (
                  <p className="text-[11px] mt-3" style={{ color: 'var(--text2)' }}>
                    Paying {extraYearly ? `one extra EMI (${money(emiVal)}) a year` : ''}{extraYearly && extraM > 0 ? ' + ' : ''}{extraM > 0 ? `${money(extraM)}/month extra` : ''} clears the loan by <b>{payoffWith}</b> instead of {payoffBase} — saving <b style={{ color: 'var(--income)' }}>{money(interestSaved)}</b> in interest and <b>{Math.floor(monthsSaved / 12)}y {monthsSaved % 12}m</b>.
                  </p>
                )}
                {!Number.isFinite(withSim.months) && hasExtra && <p className="text-[11px] mt-2" style={{ color: 'var(--rose)' }}>The EMI doesn't cover the interest — check the EMI/rate values.</p>}
              </div>

              {/* Past prepayments */}
              {prepays.length > 0 && (
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-wider mb-2 flex items-center gap-1.5" style={{ color: 'var(--text3)' }}><PiggyBank size={12} /> Prepayments made · {money(totalPrepay)}</div>
                  <TxnTable items={prepays} money={money} onDel={delTxn} onEdit={openEdit} detailLabel="Particulars" />
                </div>
              )}

              {/* Amortization schedule */}
              {amort.schedule.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--text3)' }}>Amortization Schedule — {amort.balanceTenor} EMIs left</div>
                    <button onClick={() => openAdd('prepayment')} className="text-[11px] flex items-center gap-1 font-semibold" style={{ color: 'var(--sage)' }}><Plus size={12} /> Record prepayment</button>
                  </div>
                  <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
                    <div className="overflow-x-auto">
                      <table className="w-full text-[12px]">
                        <thead><tr style={{ background: 'var(--bg2)', borderBottom: '1px solid var(--border)' }}>{['#', 'Month', 'EMI', 'Principal', 'Interest', 'Balance'].map(h => <th key={h} className="px-3 py-2 text-left text-[10px] uppercase tracking-wider font-bold" style={{ color: 'var(--text3)' }}>{h}</th>)}</tr></thead>
                        <tbody>
                          {schedule.map(r => (
                            <tr key={r.n} style={{ borderBottom: '1px solid var(--border)' }}>
                              <td className="px-3 py-2 font-mono" style={{ color: 'var(--text3)' }}>{r.n}</td>
                              <td className="px-3 py-2" style={{ color: 'var(--text2)' }}>{r.date}</td>
                              <td className="px-3 py-2 font-mono" style={{ color: 'var(--text)' }}>{money(r.emi)}</td>
                              <td className="px-3 py-2 font-mono" style={{ color: 'var(--income)' }}>{money(r.principal)}</td>
                              <td className="px-3 py-2 font-mono" style={{ color: 'var(--rose)' }}>{money(r.interest)}</td>
                              <td className="px-3 py-2 font-mono" style={{ color: 'var(--text3)' }}>{money(r.balance)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {amort.schedule.length > schedSize && <Pagination total={amort.schedule.length} page={schedP} pageSize={schedSize} onPage={setSchedPage} onPageSize={s => { setSchedSize(s); setSchedPage(1) }} pageSizeOptions={[12, 24, 60]} />}
                  </div>
                </div>
              )}

              {insightNotes.length > 0 && (
                <ul className="space-y-1.5">
                  {insightNotes.map((n, i) => <li key={i} className="text-[11px] flex gap-2" style={{ color: 'var(--text2)' }}><span style={{ color: 'var(--sage)' }}>•</span><span>{n}</span></li>)}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Add/edit txn modal */}
      {adding !== 'none' && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => !saving && closeModal()}>
          <div className="rounded-2xl w-full max-w-md" onClick={e => e.stopPropagation()} style={{ background: '#fff', border: '1px solid var(--border)', boxShadow: '0 8px 40px rgba(0,0,0,0.15)' }}>
            <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
              <div className="text-[14px] font-bold" style={{ color: 'var(--text)' }}>{editingId ? 'Edit' : 'Add'} {adding === 'disbursement' ? 'Disbursement' : adding === 'own_contribution' ? 'Own Contribution' : 'Prepayment'}</div>
              <button onClick={closeModal} style={{ color: 'var(--text3)' }}><X size={16} /></button>
            </div>
            <div className="p-5 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-[10px] uppercase tracking-wider font-semibold mb-1" style={{ color: 'var(--text3)' }}>Date</label><input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} className="wl-input w-full text-[12px]" style={{ background: 'var(--bg2)', border: '1px solid var(--border)', color: 'var(--text)' }} /></div>
                <div><label className="block text-[10px] uppercase tracking-wider font-semibold mb-1" style={{ color: 'var(--text3)' }}>Amount ({sym.trim()})</label><input type="number" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} autoFocus min="0" step="0.01" className="wl-input w-full text-[12px]" style={{ background: 'var(--bg2)', border: '1px solid var(--border)', color: 'var(--text)' }} /></div>
              </div>
              <div><label className="block text-[10px] uppercase tracking-wider font-semibold mb-1" style={{ color: 'var(--text3)' }}>Note (optional)</label><input type="text" value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} placeholder="e.g. NEFT ref, builder demand 3" className="wl-input w-full text-[12px]" style={{ background: 'var(--bg2)', border: '1px solid var(--border)', color: 'var(--text)' }} /></div>
              <div className="flex gap-3 pt-1">
                <button onClick={closeModal} className="flex-1 py-2.5 rounded-lg border text-[12px] font-semibold" style={{ borderColor: 'var(--border)', color: 'var(--text3)', background: 'var(--bg2)' }}>Cancel</button>
                <button onClick={saveTxn} disabled={saving || !form.amount} className="flex-1 py-2.5 rounded-lg text-white text-[12px] font-bold flex items-center justify-center gap-2 disabled:opacity-50" style={{ background: 'var(--sage)' }}>{saving ? <><Loader2 size={13} className="animate-spin" />Saving…</> : <><Check size={13} />Save</>}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Payment plan slab modal */}
      {planModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => !saving && setPlanModal(null)}>
          <div className="rounded-2xl w-full max-w-md" onClick={e => e.stopPropagation()} style={{ background: '#fff', border: '1px solid var(--border)', boxShadow: '0 8px 40px rgba(0,0,0,0.15)' }}>
            <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
              <div className="text-[14px] font-bold" style={{ color: 'var(--text)' }}>{planModal === 'add' ? 'Add' : 'Edit'} plan slab</div>
              <button onClick={() => setPlanModal(null)} style={{ color: 'var(--text3)' }}><X size={16} /></button>
            </div>
            <div className="p-5 space-y-3">
              <div><label className="block text-[10px] uppercase tracking-wider font-semibold mb-1" style={{ color: 'var(--text3)' }}>Milestone</label><input type="text" value={planForm.milestone} onChange={e => setPlanForm({ ...planForm, milestone: e.target.value })} autoFocus placeholder="e.g. On Booking, Plinth, 3rd Floor Slab" className="wl-input w-full text-[12px]" style={{ background: 'var(--bg2)', border: '1px solid var(--border)', color: 'var(--text)' }} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-[10px] uppercase tracking-wider font-semibold mb-1" style={{ color: 'var(--text3)' }}>% of property</label><input type="number" value={planForm.percentage}
                  onChange={e => {
                    const pct = e.target.value
                    // auto-fill amount from % of property value (still editable below)
                    const amt = propertyCost > 0 && Number(pct) > 0 ? String(Math.round(propertyCost * Number(pct) / 100)) : planForm.amount
                    setPlanForm({ ...planForm, percentage: pct, amount: amt })
                  }}
                  placeholder="10" className="wl-input w-full text-[12px]" style={{ background: 'var(--bg2)', border: '1px solid var(--border)', color: 'var(--text)' }} /></div>
                <div><label className="block text-[10px] uppercase tracking-wider font-semibold mb-1" style={{ color: 'var(--text3)' }}>Amount ({sym.trim()})</label><input type="number" value={planForm.amount} onChange={e => setPlanForm({ ...planForm, amount: e.target.value })} placeholder="auto from %" className="wl-input w-full text-[12px]" style={{ background: 'var(--bg2)', border: '1px solid var(--border)', color: 'var(--text)' }} /></div>
              </div>
              {propertyCost > 0
                ? <p className="text-[10px]" style={{ color: 'var(--text3)' }}>Amount auto-fills from % of {money(propertyCost)} — edit it if the builder's figure differs.</p>
                : <p className="text-[10px]" style={{ color: 'var(--gold)' }}>Set the property value (Own Contribution tab → Property cost) to auto-calc amounts from %.</p>}
              <div className="flex gap-3 pt-1">
                <button onClick={() => setPlanModal(null)} className="flex-1 py-2.5 rounded-lg border text-[12px] font-semibold" style={{ borderColor: 'var(--border)', color: 'var(--text3)', background: 'var(--bg2)' }}>Cancel</button>
                <button onClick={savePlan} disabled={saving || !planForm.milestone} className="flex-1 py-2.5 rounded-lg text-white text-[12px] font-bold flex items-center justify-center gap-2 disabled:opacity-50" style={{ background: 'var(--sage)' }}>{saving ? <><Loader2 size={13} className="animate-spin" />Saving…</> : <><Check size={13} />Save</>}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── sub-components ───────────────────────────────────────────────────────────
function Stat({ label, value, color, icon: Icon }: { label: string; value: string; color?: string; icon?: any }) {
  return (
    <div className="wl-card p-3">
      <div className="text-[10px] uppercase tracking-wider font-semibold mb-1 flex items-center gap-1" style={{ color: 'var(--text3)' }}>{Icon && <Icon size={11} />}{label}</div>
      <div className="text-[15px] font-bold font-mono" style={{ color: color ?? 'var(--text)' }}>{value}</div>
    </div>
  )
}
function Mini({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="rounded-xl p-3" style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}>
      <div className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--text3)' }}>{label}</div>
      <div className="text-[15px] font-bold font-mono" style={{ color }}>{value}</div>
    </div>
  )
}
function Empty({ text }: { text: string }) { return <p className="text-[11px] py-2" style={{ color: 'var(--text3)' }}>{text}</p> }
function TxnTable({ items, money, onDel, onEdit, detailLabel }: { items: any[]; money: (n: number) => string; onDel: (id: string) => void; onEdit?: (t: any) => void; detailLabel?: string }) {
  const [page, setPage] = useState(1); const [pageSize, setPageSize] = useState(10)
  const p = Math.min(page, Math.max(1, Math.ceil(items.length / pageSize)))
  const paged = items.slice((p - 1) * pageSize, p * pageSize)
  return (
    <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
      <div className="overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead>
            <tr style={{ background: 'var(--bg2)', borderBottom: '1px solid var(--border)' }}>
              <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wider font-bold" style={{ color: 'var(--text3)' }}>Date</th>
              <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wider font-bold" style={{ color: 'var(--text3)' }}>{detailLabel ?? 'Details'}</th>
              <th className="px-3 py-2 text-right text-[10px] uppercase tracking-wider font-bold" style={{ color: 'var(--text3)' }}>Amount</th>
              <th className="px-3 py-2" style={{ width: onEdit ? 64 : 32 }}></th>
            </tr>
          </thead>
          <tbody>
            {paged.map(t => (
              <tr key={t.id} style={{ borderBottom: '1px solid var(--border)' }} className="hover:bg-stone-50 transition-colors">
                <td className="px-3 py-2 font-mono whitespace-nowrap" style={{ color: 'var(--text3)' }}>{t.txn_date}</td>
                <td className="px-3 py-2 truncate" style={{ color: 'var(--text2)', maxWidth: 220 }}>{t.note || '—'}</td>
                <td className="px-3 py-2 text-right font-mono font-semibold whitespace-nowrap" style={{ color: 'var(--text)' }}>{money(t.amount)}</td>
                <td className="px-3 py-2 text-right whitespace-nowrap">
                  {onEdit && <button onClick={() => onEdit(t)} className="p-1 rounded mr-1" style={{ color: 'var(--blue)' }} title="Edit"><Pencil size={12} /></button>}
                  <button onClick={() => onDel(t.id)} className="p-1 rounded" style={{ color: 'var(--rose)' }} title="Delete"><Trash2 size={12} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {items.length > pageSize && <Pagination total={items.length} page={p} pageSize={pageSize} onPage={setPage} onPageSize={s => { setPageSize(s); setPage(1) }} />}
    </div>
  )
}
