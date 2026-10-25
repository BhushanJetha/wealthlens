'use client'
import { InsightBar, AiActions, PageHeader, HeroStat, KpiTile, Bars, Donut, ProgressRow } from '@/components/ui/kit'
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

  // Balance at each year end until the loan clears (today's EMI and rate)
  const balBars = useMemo(() => {
    const rows = amort.schedule
    if (!rows.length) return []
    const years = Math.ceil(rows.length / 12)
    const step = Math.max(1, Math.ceil(years / 10))
    const out = [{ label: 'Now', value: outstandingBal, hi: true, tip: `Now: ${money(outstandingBal)}` }]
    for (let y = step; y <= years; y += step) {
      const r = rows[Math.min(y * 12, rows.length) - 1]
      out.push({ label: `+${y}y`, value: Math.max(0, Number(r.balance) || 0), hi: true, tip: `In ${y} year${y === 1 ? '' : 's'}: ${money(Number(r.balance) || 0)}` })
    }
    return out
  }, [amort.schedule, outstandingBal])
  const dt = (d: string) => d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'
  const mon = (d: string) => /^\d{4}-\d{2}/.test(d ?? '') ? new Date(`${d.slice(0, 7)}-01`).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }) : d
  const short = (n: number) => { const a = Math.abs(n); return a >= 1e5 ? `${sym}${(n / 1e5).toFixed(2)}L` : a >= 1e3 ? `${sym}${(n / 1e3).toFixed(1)}K` : money(n) }
  const head = (text: React.ReactNode, action?: React.ReactNode) => (
    <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
      <div className="text-[12.5px]" style={{ color: 'var(--text3)' }}>{text}</div>
      {action}
    </div>
  )
  const addBtn = (label: string, onClick: () => void) => (
    <button onClick={onClick} className="wl-btn wl-btn-primary" style={{ height: 32 }}><Plus size={14} />{label}</button>
  )

  return (
    <div className="flex flex-col gap-3.5 md:gap-[18px] animate-fade-up">
      <div className="max-md:order-1">
        <Link href="/dashboard/loans" className="inline-flex items-center gap-1 text-[12.5px] font-semibold mb-1.5" style={{ color: 'var(--accent)' }}><ChevronLeft size={14} /> All loans</Link>
        <PageHeader title={loan.name} sub={`${loan.bank_name} · ${loan.interest_rate}% a year · ${loan.tenure_months}-month tenure`}
          actions={<button onClick={() => fileRef.current?.click()} disabled={importing} className="wl-btn" style={{ height: 34 }} title="Import from a loan statement PDF">
            {importing ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}Import statement</button>} />
        <input ref={fileRef} type="file" accept=".pdf,application/pdf" className="hidden" onChange={importStatement} />
        <button onClick={() => fileRef.current?.click()} disabled={importing} className="md:hidden wl-chip mt-2.5 gap-1.5" style={{ height: 32 }}>
          {importing ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}Import statement
        </button>
        {importMsg && <div className="text-[12.5px] mt-2" style={{ color: 'var(--text2)' }}>{importMsg}</div>}
      </div>

      {outstandingBal > 0 && emiVal > 0 && <div className="max-md:order-4"><InsightBar
        text={Number.isFinite(baseSim.months)
          ? `${money(outstandingBal)} left at ${loan.interest_rate}%. At ${money(emiVal)} a month it's paid off by ${payoffBase}, with about ${money(baseSim.interest)} of interest still to pay. Try the prepayment simulator to shorten it.`
          : `At ${money(emiVal)} a month the EMI doesn't cover the interest on ${money(outstandingBal)}, so the balance won't fall. Check the EMI and rate.`}
        prompt={`Explain my ${loan.name}: ${money(outstandingBal)} outstanding at ${loan.interest_rate}%, EMI ${money(emiVal)}, ${Number.isFinite(baseSim.months) ? `${baseSim.months} months and ${money(baseSim.interest)} interest left` : 'EMI below interest'}.`} /></div>}
      {outstandingBal > 0 && <div className="max-md:order-5"><AiActions actions={['Should I prepay this loan?', 'Should I refinance?']}
        context={`${loan.name} with ${loan.bank_name}: ${money(outstandingBal)} outstanding at ${loan.interest_rate}%, EMI ${money(emiVal)}.`} /></div>}

      <div className="max-md:contents grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-4">
        <HeroStat className="max-md:order-2" label="Outstanding" value={money(outstandingBal)}
          tone={Number.isFinite(baseSim.months) ? 'good' : 'bad'}
          delta={Number.isFinite(baseSim.months) ? `Paid off by ${payoffBase} · ${baseSim.months} EMIs to go` : "EMI doesn't cover the interest"}
          right={<span className="text-[11.5px]" style={{ color: 'var(--text3)' }}>Balance each year at today&apos;s EMI</span>}>
          {balBars.length > 1 && <Bars data={balBars} className="h-[110px] md:h-auto md:flex-1 md:min-h-[150px] mt-3" label={`Balance by year: ${balBars.map(b => b.tip).join(', ')}`} />}
        </HeroStat>

        <section className="wl-card max-md:order-6 px-4 md:px-5 py-4 md:py-[18px] flex flex-col gap-3">
          <h2 className="text-[14px] font-semibold" style={{ color: 'var(--text)' }}>Repayment so far</h2>
          <div className="flex items-center gap-4">
            <Donut size={96} label={`Principal paid ${money(amort.principalPaid)}, interest paid ${money(amort.interestPaid)}, principal left ${money(amort.remaining)}`}
              segments={[{ value: amort.principalPaid, color: '#2FB67C' }, { value: amort.interestPaid, color: '#EC5B8C' }, { value: amort.remaining, color: '#E6E3F5' }]}>
              <div className="text-[10.5px]" style={{ color: 'var(--text3)' }}>Repaid</div>
              <div className="text-[14px] font-bold" style={{ color: 'var(--text)' }}>{Math.round(princBarPaid)}%</div>
            </Donut>
            <div className="flex-1 min-w-0 flex flex-col gap-1.5 text-[12.5px]">
              {[['Principal paid', amort.principalPaid, '#2FB67C'], ['Interest paid', amort.interestPaid, '#EC5B8C'], ['Principal left', amort.remaining, '#B9B4D6']].map(([l, v, c]) => (
                <div key={l as string} className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 min-w-0" style={{ color: 'var(--text3)' }}><i className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: c as string }} /><span className="truncate">{l}</span></span>
                  <span className="font-semibold tabular-nums" style={{ color: 'var(--text)' }}>{money(v as number)}</span>
                </div>
              ))}
            </div>
          </div>
          <ProgressRow name="Interest paid" sub={`of ~${money(intTotal)} over the loan`} value={`${Math.round(intBarPaid)}%`} pct={intBarPaid} color="#EC5B8C" />
        </section>
      </div>

      <div className="max-md:order-3 grid grid-cols-2 lg:grid-cols-4 gap-2.5 md:gap-3.5">
        <KpiTile label="Current EMI" value={money(loan.emi_amount)} delta="a month" tint={2} icon={Coins} />
        <KpiTile label="EMIs paid" value={`${emisPaidCount} / ${emisPaidCount + amort.balanceTenor}`} delta={`${amort.balanceTenor} left`} tint={0} icon={CalendarClock} />
        <KpiTile label="Interest left" value={Number.isFinite(baseSim.interest) ? money(baseSim.interest) : '—'} delta="at today's EMI" tint={3} icon={TrendingDown} />
        <KpiTile label="Disbursed" value={money(effectiveDisbursed)} delta={Number(loan.sanctioned_amt) > 0 ? `of ${money(loan.sanctioned_amt)} sanctioned` : 'to date'} tint={1} icon={Landmark} />
      </div>

      {isHome && (
        <section className="wl-card max-md:order-6 px-4 md:px-5 py-4">
          <div className="flex items-center justify-between gap-2 mb-3">
            <h2 className="text-[14px] font-semibold flex items-center gap-2" style={{ color: 'var(--text)' }}><Home size={15} style={{ color: 'var(--accent)' }} />Property</h2>
            {!editCost && <button onClick={() => { setEditCost(true); setCostVal(String(loan.property_cost ?? '')) }} className="text-[12.5px] font-semibold flex items-center gap-1" style={{ color: 'var(--accent)' }}><Pencil size={12} />{propertyCost > 0 ? 'Edit value' : 'Set value'}</button>}
          </div>
          {editCost && (
            <div className="flex items-center gap-2 mb-3">
              <span className="text-[12.5px]" style={{ color: 'var(--text3)' }}>Property value {sym.trim()}</span>
              <input type="number" inputMode="numeric" value={costVal} onChange={e => setCostVal(e.target.value)} className="wl-input w-40" style={{ background: '#fff' }} autoFocus />
              <button onClick={saveCost} className="wl-btn wl-btn-primary" style={{ height: 34 }} aria-label="Save"><Check size={14} /></button>
              <button onClick={() => setEditCost(false)} className="wl-btn" style={{ height: 34 }} aria-label="Cancel"><X size={14} /></button>
            </div>
          )}
          <div className="grid grid-cols-3 gap-2">
            <Mini label="Value" value={propertyCost > 0 ? short(propertyCost) : '—'} color="var(--text)" />
            <Mini label="Own money" value={short(totalOwn)} color="#16A34A" />
            <Mini label="To fund" value={propertyCost > 0 ? short(outstandingToBuilder) : '—'} color="#B96A0B" />
          </div>
          <div className="mt-3">
            <div className="h-2.5 rounded-full overflow-hidden flex gap-[2px]" style={{ background: 'var(--track)' }}>
              <div style={{ width: `${barLoan}%`, background: '#3B8EF0' }} /><div style={{ width: `${barOwn}%`, background: '#2FB67C' }} />
            </div>
            <div className="flex gap-4 mt-1.5 text-[11.5px] flex-wrap" style={{ color: 'var(--text3)' }}>
              <span className="flex items-center gap-1.5"><i className="w-2 h-2 rounded-full" style={{ background: '#3B8EF0' }} />Loan {money(effectiveDisbursed)} ({propertyCost > 0 ? Math.round(fundLoanPct) : loanShare}%)</span>
              <span className="flex items-center gap-1.5"><i className="w-2 h-2 rounded-full" style={{ background: '#2FB67C' }} />Own {money(totalOwn)} ({propertyCost > 0 ? Math.round(fundOwnPct) : ownShare}%)</span>
            </div>
          </div>
        </section>
      )}

      {/* Tabs */}
      <div className="max-md:order-7 flex gap-1.5 overflow-x-auto no-scrollbar -mx-4 px-4 md:mx-0 md:px-0 max-md:sticky max-md:top-0 max-md:z-20 max-md:py-2 max-md:bg-[var(--canvas-m)]" role="tablist" aria-label="Loan sections">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} role="tab" aria-selected={tab === t.key} aria-pressed={tab === t.key}
            className="wl-chip flex-shrink-0 gap-1.5" style={{ height: 32 }}>
            <t.icon size={13} /> {t.label}
          </button>
        ))}
      </div>

      <section className="max-md:order-7 wl-card px-4 md:px-5 py-4 md:py-[18px]">
        {tab === 'plan' && (<>
          {head(<>Builder&apos;s slab-wise plan · funded <b style={{ color: 'var(--text)' }}>{money(planPaid)}</b>{planTotal > 0 ? ` of ${money(planTotal)}` : ''}</>, addBtn('Add slab', openPlanAdd))}
          {slabs.length === 0 ? (
            <Empty text="No payment plan yet. Add the builder's milestones (on booking, plinth, each floor slab…). As you record disbursements and your own payments, each slab is marked paid." />
          ) : (
            <div className="-mx-4 md:-mx-5 -mb-1">
              {planStatus.map((ps, i) => {
                const st = ps.status === 'paid' ? { c: '#1E8F5F', bg: '#E7F7EF', t: 'Paid' } : ps.status === 'partial' ? { c: '#B96A0B', bg: '#FFF2E2', t: 'Part paid' } : { c: 'var(--text3)', bg: 'var(--track)', t: 'Pending' }
                return (
                  <div key={ps.slab.id} className="flex items-center gap-3 px-4 md:px-5 py-2.5" style={{ borderTop: i ? '1px solid var(--track)' : '1px solid var(--line)' }}>
                    <span className="w-8 h-8 rounded-[10px] flex items-center justify-center flex-shrink-0" style={{ background: st.bg, color: st.c }}>
                      {ps.status === 'paid' ? <CheckCircle2 size={15} /> : <Circle size={15} />}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-semibold truncate" style={{ color: 'var(--text)' }}>{i + 1}. {ps.slab.milestone}{ps.slab.percentage ? <span className="font-normal" style={{ color: 'var(--text3)' }}> · {ps.slab.percentage}%</span> : ''}</div>
                      <div className="text-[11.5px] truncate" style={{ color: 'var(--text3)' }}>
                        {ps.paid === 0 ? 'Not funded yet' : [ps.fromLoan > 0 ? `loan ${money(ps.fromLoan)}` : null, ps.fromOwn > 0 ? `own ${money(ps.fromOwn)}` : null].filter(Boolean).join(' · ')}
                        {ps.gap > 0.5 && ps.paid > 0 ? ` · ${money(ps.gap)} to go` : ''}
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0 flex flex-col items-end gap-0.5">
                      <span className="text-[13px] font-semibold tabular-nums" style={{ color: 'var(--text)' }}>{money(ps.slab.amount)}</span>
                      <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: st.bg, color: st.c }}>{st.t}</span>
                    </div>
                    <span className="flex flex-col md:flex-row gap-0.5">
                      <IconBtn label="Edit slab" onClick={() => openPlanEdit(ps.slab)}><Pencil size={13} /></IconBtn>
                      <IconBtn label="Delete slab" danger onClick={() => delPlan(ps.slab.id)}><Trash2 size={13} /></IconBtn>
                    </span>
                  </div>
                )
              })}
              <div className="flex items-center justify-between px-4 md:px-5 py-2.5 text-[13px] font-semibold" style={{ borderTop: '1px solid var(--line)', background: '#FAFAFE' }}>
                <span style={{ color: 'var(--text)' }}>Total</span>
                <span className="tabular-nums" style={{ color: 'var(--text3)' }}>{money(planTotal)} · <b style={{ color: '#16A34A' }}>{money(planPaid)} paid</b></span>
              </div>
            </div>
          )}
          {planTotal > 0 && propertyCost > 0 && Math.abs(planTotal - propertyCost) > 1 && (
            <p className="text-[12px] mt-2" style={{ color: '#B96A0B' }}>The plan adds up to {money(planTotal)}, but the property value is {money(propertyCost)}. Adjust a slab or the property value.</p>
          )}
        </>)}

        {tab === 'own' && (<>
          {head(<>Down-payments from your own money · <b style={{ color: '#16A34A' }}>{money(totalOwn)}</b></>, addBtn('Add', () => openAdd('own_contribution')))}
          {contributions.length === 0 ? <Empty text="No own-money payments recorded yet." /> : <TxnList items={contributions} money={money} dt={dt} onDel={delTxn} onEdit={openEdit} />}
        </>)}

        {tab === 'loan' && (<>
          {head(<>Bank disbursements to date · <b style={{ color: 'var(--text)' }}>{money(effectiveDisbursed)}</b>{Number(loan.sanctioned_amt) > 0 ? ` of ${money(loan.sanctioned_amt)}` : ''}</>, addBtn('Add', () => openAdd('disbursement')))}
          {disbursements.length === 0 ? <Empty text="No disbursements yet. Add each tranche the bank releases, or import a loan statement." /> : <TxnList items={disbursements} money={money} dt={dt} onDel={delTxn} onEdit={openEdit} />}
        </>)}

        {tab === 'emi' && (
          emiPays.length === 0 ? <Empty text="No EMI payments recorded yet. Import a loan statement to pull in the EMIs you've paid." /> : (<>
            {head(<>{emiPays.length} EMIs paid · total <b style={{ color: '#16A34A' }}>{money(totalEmiPaid)}</b></>)}
            <div className="-mx-4 md:-mx-5 -mb-1">
              {emiPaged.map((t, i) => (
                <div key={t.id} className="flex items-center gap-3 px-4 md:px-5 py-2.5" style={{ borderTop: i ? '1px solid var(--track)' : '1px solid var(--line)' }}>
                  <span className="w-8 h-8 rounded-[10px] flex items-center justify-center flex-shrink-0" style={{ background: '#E7F7EF', color: '#1E8F5F' }}><CheckCircle2 size={15} /></span>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-semibold" style={{ color: 'var(--text)' }}>{dt(t.txn_date)}</div>
                    <div className="text-[11.5px] truncate" style={{ color: 'var(--text3)' }}>{t.note ?? 'EMI'}</div>
                  </div>
                  <span className="text-[13px] font-semibold tabular-nums" style={{ color: 'var(--text)' }}>{money(t.amount)}</span>
                  <IconBtn label="Delete EMI" danger onClick={() => delTxn(t.id)}><Trash2 size={13} /></IconBtn>
                </div>
              ))}
              {emiPays.length > emiSize && <Pagination total={emiPays.length} page={emiP} pageSize={emiSize} onPage={setEmiPage} onPageSize={s => { setEmiSize(s); setEmiPage(1) }} />}
            </div>
          </>)
        )}

        {tab === 'schedule' && (
          <div className="flex flex-col gap-4">
            {/* Prepayment simulator */}
            <div className="rounded-2xl p-3.5 md:p-4" style={{ background: 'var(--accent-bg)', border: '1px solid var(--accent-border)' }}>
              <div className="text-[14px] font-semibold flex items-center gap-1.5" style={{ color: 'var(--accent2)' }}><Sparkles size={15} /> Prepayment savings</div>
              <p className="text-[12.5px] mt-0.5 mb-3" style={{ color: 'var(--text3)' }}>See how much interest and time a little extra saves.</p>
              <div className="flex flex-col md:flex-row md:items-center gap-2.5 mb-3">
                <button onClick={() => setExtraYearly(v => !v)} aria-pressed={extraYearly} className="wl-chip gap-1.5 self-start" style={{ height: 34, background: extraYearly ? undefined : '#fff' }}>
                  {extraYearly ? <CheckCircle2 size={14} /> : <Circle size={14} />} One extra EMI a year
                </button>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[12.5px]" style={{ color: 'var(--text3)' }}>Extra a month {sym.trim()}</span>
                  <input type="number" inputMode="numeric" value={extraMonthly} onChange={e => setExtraMonthly(e.target.value)} placeholder="0" min="0" className="wl-input w-28" style={{ background: '#fff' }} />
                  {[5000, 10000, 25000].map(v => <button key={v} onClick={() => setExtraMonthly(String(v))} aria-pressed={extraMonthly === String(v)} className="wl-chip" style={{ height: 30, background: extraMonthly === String(v) ? undefined : '#fff' }}>{money(v)}</button>)}
                </div>
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                <Mini label="Interest saved" value={hasExtra ? money(interestSaved) : '—'} color="#16A34A" />
                <Mini label="Time saved" value={hasExtra && monthsSaved > 0 ? `${Math.floor(monthsSaved / 12)}y ${monthsSaved % 12}m` : '—'} color="#16A34A" />
                <Mini label="Paid off (today)" value={payoffBase} color="var(--text)" />
                <Mini label="Paid off (with extra)" value={hasExtra ? payoffWith : '—'} color="var(--accent2)" />
              </div>
              {hasExtra && (
                <p className="text-[12.5px] mt-3 leading-snug" style={{ color: 'var(--text2)' }}>
                  Paying {extraYearly ? `one extra EMI (${money(emiVal)}) a year` : ''}{extraYearly && extraM > 0 ? ' plus ' : ''}{extraM > 0 ? `${money(extraM)} extra a month` : ''} clears the loan by <b>{payoffWith}</b> instead of {payoffBase}, saving <b style={{ color: '#16A34A' }}>{money(interestSaved)}</b> of interest.
                </p>
              )}
              {!Number.isFinite(withSim.months) && hasExtra && <p className="text-[12px] mt-2" style={{ color: '#DC2626' }}>The EMI doesn&apos;t cover the interest. Check the EMI and rate.</p>}
            </div>

            {prepays.length > 0 && (
              <div>
                <h3 className="text-[14px] font-semibold mb-2 flex items-center gap-1.5" style={{ color: 'var(--text)' }}><PiggyBank size={15} style={{ color: 'var(--accent)' }} /> Prepayments made · {money(totalPrepay)}</h3>
                <TxnList items={prepays} money={money} dt={dt} onDel={delTxn} onEdit={openEdit} />
              </div>
            )}

            {amort.schedule.length > 0 && (
              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <h3 className="text-[14px] font-semibold" style={{ color: 'var(--text)' }}>Schedule · {amort.balanceTenor} EMIs left</h3>
                  <button onClick={() => openAdd('prepayment')} className="text-[12.5px] font-semibold flex items-center gap-1" style={{ color: 'var(--accent)' }}><Plus size={13} /> Record prepayment</button>
                </div>
                <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--line)' }}>
                  <div className="md:hidden">
                    {schedule.map((r, i) => (
                      <div key={r.n} className="flex items-center gap-3 px-3.5 py-2.5" style={{ borderTop: i ? '1px solid var(--track)' : undefined }}>
                        <span className="text-[11.5px] w-6 text-center tabular-nums" style={{ color: 'var(--text4)' }}>{r.n}</span>
                        <div className="flex-1 min-w-0">
                          <div className="text-[13px] font-semibold" style={{ color: 'var(--text)' }}>{mon(r.date)}</div>
                          <div className="text-[11.5px] tabular-nums truncate" style={{ color: 'var(--text3)' }}>
                            <span style={{ color: '#16A34A' }}>{short(r.principal)}</span> principal · <span style={{ color: '#DC2626' }}>{short(r.interest)}</span> interest
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <div className="text-[13px] font-semibold tabular-nums" style={{ color: 'var(--text)' }}>{money(r.emi)}</div>
                          <div className="text-[11px] tabular-nums" style={{ color: 'var(--text4)' }}>left {short(r.balance)}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="hidden md:block overflow-x-auto">
                    <table className="w-full text-[12.5px]">
                      <thead><tr style={{ background: '#FAFAFE', borderBottom: '1px solid var(--line)' }}>{['#', 'Month', 'EMI', 'Principal', 'Interest', 'Balance'].map(h => <th key={h} className="px-3 py-2 text-left text-[10.5px] font-semibold uppercase tracking-[0.05em]" style={{ color: 'var(--text4)' }}>{h}</th>)}</tr></thead>
                      <tbody>
                        {schedule.map(r => (
                          <tr key={r.n} style={{ borderBottom: '1px solid var(--track)' }}>
                            <td className="px-3 py-2 tabular-nums" style={{ color: 'var(--text4)' }}>{r.n}</td>
                            <td className="px-3 py-2" style={{ color: 'var(--text2)' }}>{mon(r.date)}</td>
                            <td className="px-3 py-2 tabular-nums font-semibold" style={{ color: 'var(--text)' }}>{money(r.emi)}</td>
                            <td className="px-3 py-2 tabular-nums" style={{ color: '#16A34A' }}>{money(r.principal)}</td>
                            <td className="px-3 py-2 tabular-nums" style={{ color: '#DC2626' }}>{money(r.interest)}</td>
                            <td className="px-3 py-2 tabular-nums" style={{ color: 'var(--text3)' }}>{money(r.balance)}</td>
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
              <div className="flex flex-col gap-2">
                {insightNotes.map((n, i) => (
                  <div key={i} className="flex items-start gap-2.5 rounded-xl px-3 py-2.5" style={{ background: '#FAFAFE', border: '1px solid var(--line)' }}>
                    <Sparkles size={14} className="flex-shrink-0 mt-0.5" style={{ color: 'var(--accent)' }} />
                    <span className="text-[12.5px] leading-snug" style={{ color: 'var(--text2)' }}>{n}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </section>

      {/* Add/edit txn modal */}
      {adding !== 'none' && (
        <div className="fixed inset-0 wl-sheet bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => !saving && closeModal()}>
          <div className="wl-sheet-panel rounded-2xl w-full max-w-md" onClick={e => e.stopPropagation()} style={{ background: '#fff', border: '1px solid var(--line)', boxShadow: '0 8px 40px rgba(0,0,0,0.15)' }}>
            <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: 'var(--line)' }}>
              <div className="text-[14px] font-bold" style={{ color: 'var(--text)' }}>{editingId ? 'Edit' : 'Add'} {adding === 'disbursement' ? 'Disbursement' : adding === 'own_contribution' ? 'Own Contribution' : 'Prepayment'}</div>
              <button onClick={closeModal} style={{ color: 'var(--text3)' }}><X size={16} /></button>
            </div>
            <div className="p-5 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-[11px] font-medium font-semibold mb-1" style={{ color: 'var(--text3)' }}>Date</label><input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} className="wl-input w-full text-[12px]" style={{ background: '#FAFAFE', border: '1px solid var(--line)', color: 'var(--text)' }} /></div>
                <div><label className="block text-[11px] font-medium font-semibold mb-1" style={{ color: 'var(--text3)' }}>Amount ({sym.trim()})</label><input type="number" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} autoFocus min="0" step="0.01" className="wl-input w-full text-[12px]" style={{ background: '#FAFAFE', border: '1px solid var(--line)', color: 'var(--text)' }} /></div>
              </div>
              <div><label className="block text-[11px] font-medium font-semibold mb-1" style={{ color: 'var(--text3)' }}>Note (optional)</label><input type="text" value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} placeholder="e.g. NEFT ref, builder demand 3" className="wl-input w-full text-[12px]" style={{ background: '#FAFAFE', border: '1px solid var(--line)', color: 'var(--text)' }} /></div>
              <div className="flex gap-3 pt-1">
                <button onClick={closeModal} className="wl-btn flex-1 justify-center" style={{ height: 42 }}>Cancel</button>
                <button onClick={saveTxn} disabled={saving || !form.amount} className="wl-btn wl-btn-primary flex-1 justify-center disabled:opacity-50" style={{ height: 42 }}>{saving ? <><Loader2 size={13} className="animate-spin" />Saving…</> : <><Check size={13} />Save</>}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Payment plan slab modal */}
      {planModal && (
        <div className="fixed inset-0 wl-sheet bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => !saving && setPlanModal(null)}>
          <div className="wl-sheet-panel rounded-2xl w-full max-w-md" onClick={e => e.stopPropagation()} style={{ background: '#fff', border: '1px solid var(--line)', boxShadow: '0 8px 40px rgba(0,0,0,0.15)' }}>
            <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: 'var(--line)' }}>
              <div className="text-[14px] font-bold" style={{ color: 'var(--text)' }}>{planModal === 'add' ? 'Add' : 'Edit'} plan slab</div>
              <button onClick={() => setPlanModal(null)} style={{ color: 'var(--text3)' }}><X size={16} /></button>
            </div>
            <div className="p-5 space-y-3">
              <div><label className="block text-[11px] font-medium font-semibold mb-1" style={{ color: 'var(--text3)' }}>Milestone</label><input type="text" value={planForm.milestone} onChange={e => setPlanForm({ ...planForm, milestone: e.target.value })} autoFocus placeholder="e.g. On Booking, Plinth, 3rd Floor Slab" className="wl-input w-full text-[12px]" style={{ background: '#FAFAFE', border: '1px solid var(--line)', color: 'var(--text)' }} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-[11px] font-medium font-semibold mb-1" style={{ color: 'var(--text3)' }}>% of property</label><input type="number" value={planForm.percentage}
                  onChange={e => {
                    const pct = e.target.value
                    // auto-fill amount from % of property value (still editable below)
                    const amt = propertyCost > 0 && Number(pct) > 0 ? String(Math.round(propertyCost * Number(pct) / 100)) : planForm.amount
                    setPlanForm({ ...planForm, percentage: pct, amount: amt })
                  }}
                  placeholder="10" className="wl-input w-full text-[12px]" style={{ background: '#FAFAFE', border: '1px solid var(--line)', color: 'var(--text)' }} /></div>
                <div><label className="block text-[11px] font-medium font-semibold mb-1" style={{ color: 'var(--text3)' }}>Amount ({sym.trim()})</label><input type="number" value={planForm.amount} onChange={e => setPlanForm({ ...planForm, amount: e.target.value })} placeholder="auto from %" className="wl-input w-full text-[12px]" style={{ background: '#FAFAFE', border: '1px solid var(--line)', color: 'var(--text)' }} /></div>
              </div>
              {propertyCost > 0
                ? <p className="text-[10px]" style={{ color: 'var(--text3)' }}>Amount auto-fills from % of {money(propertyCost)} — edit it if the builder's figure differs.</p>
                : <p className="text-[10px]" style={{ color: 'var(--gold)' }}>Set the property value (Own Contribution tab → Property cost) to auto-calc amounts from %.</p>}
              <div className="flex gap-3 pt-1">
                <button onClick={() => setPlanModal(null)} className="wl-btn flex-1 justify-center" style={{ height: 42 }}>Cancel</button>
                <button onClick={savePlan} disabled={saving || !planForm.milestone} className="wl-btn wl-btn-primary flex-1 justify-center disabled:opacity-50" style={{ height: 42 }}>{saving ? <><Loader2 size={13} className="animate-spin" />Saving…</> : <><Check size={13} />Save</>}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── sub-components ───────────────────────────────────────────────────────────
function Mini({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="rounded-xl px-3 py-2.5 min-w-0" style={{ background: '#fff', border: '1px solid var(--line)' }}>
      <div className="text-[11.5px] truncate" style={{ color: 'var(--text3)' }}>{label}</div>
      <div className="text-[14px] md:text-[15px] font-bold tabular-nums truncate" style={{ color }}>{value}</div>
    </div>
  )
}
function Empty({ text }: { text: string }) {
  return <p className="text-[12.5px] leading-snug rounded-xl px-4 py-5 text-center" style={{ color: 'var(--text3)', background: '#FAFAFE', border: '1.5px dashed var(--border2)' }}>{text}</p>
}
function IconBtn({ label, onClick, danger, children }: { label: string; onClick: () => void; danger?: boolean; children: React.ReactNode }) {
  return (
    <button onClick={onClick} title={label} aria-label={label}
      className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[var(--accent-bg)] transition-colors"
      style={{ color: danger ? '#DC2626' : 'var(--text3)' }}>{children}</button>
  )
}
// Dated payments (disbursements, own money, prepayments) as rows with edit/delete
function TxnList({ items, money, dt, onDel, onEdit }: { items: any[]; money: (n: number) => string; dt: (d: string) => string; onDel: (id: string) => void; onEdit?: (t: any) => void }) {
  const [page, setPage] = useState(1); const [pageSize, setPageSize] = useState(10)
  const p = Math.min(page, Math.max(1, Math.ceil(items.length / pageSize)))
  const paged = items.slice((p - 1) * pageSize, p * pageSize)
  return (
    <div className="-mx-4 md:-mx-5 -mb-1">
      {paged.map((t, i) => (
        <div key={t.id} className="flex items-center gap-3 px-4 md:px-5 py-2.5" style={{ borderTop: i ? '1px solid var(--track)' : '1px solid var(--line)' }}>
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-semibold" style={{ color: 'var(--text)' }}>{dt(t.txn_date)}</div>
            <div className="text-[11.5px] truncate" style={{ color: 'var(--text3)' }}>{t.note || 'No note'}</div>
          </div>
          <span className="text-[13px] font-semibold tabular-nums" style={{ color: 'var(--text)' }}>{money(t.amount)}</span>
          <span className="flex gap-0.5">
            {onEdit && <IconBtn label="Edit" onClick={() => onEdit(t)}><Pencil size={13} /></IconBtn>}
            <IconBtn label="Delete" danger onClick={() => onDel(t.id)}><Trash2 size={13} /></IconBtn>
          </span>
        </div>
      ))}
      {items.length > pageSize && <Pagination total={items.length} page={p} pageSize={pageSize} onPage={setPage} onPageSize={s => { setPageSize(s); setPage(1) }} />}
    </div>
  )
}
