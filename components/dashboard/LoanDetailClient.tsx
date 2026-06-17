'use client'
import { useMemo, useState, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { amortize } from '@/lib/amortization'
import {
  ChevronLeft, Building2, Plus, Trash2, Loader2, Pencil, Check, X,
  TrendingDown, Coins, Home, Wallet, CalendarClock, Upload,
} from 'lucide-react'

const todayISO = () => new Date().toISOString().slice(0, 10)

export default function LoanDetailClient({ loan, txns }: { loan: any; txns: any[] }) {
  const router = useRouter()
  const supabase = createClient()
  const sym = loan.currency === 'AED' ? 'AED ' : '₹'
  const money = (n: number) => `${sym}${Math.round(Number(n) || 0).toLocaleString('en-IN')}`
  const isHome = loan.loan_type === 'home_loan'

  const [adding, setAdding] = useState<'none' | 'disbursement' | 'own_contribution' | 'prepayment'>('none')
  const [form, setForm] = useState({ date: todayISO(), amount: '', note: '' })
  const [saving, setSaving] = useState(false)
  const [editCost, setEditCost] = useState(false)
  const [costVal, setCostVal] = useState(String(loan.property_cost ?? ''))
  const [showAllSched, setShowAllSched] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importMsg, setImportMsg] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

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
      ].filter((r: any) => !seen.has(`${r.kind}|${r.txn_date}|${Math.round(Number(r.amount))}`))
      const rows = incoming.map((r: any) => ({ user_id: user!.id, loan_id: loan.id, kind: r.kind, txn_date: r.txn_date, amount: r.amount, note: r.note ?? null }))
      if (rows.length) await supabase.from('loan_transactions').insert(rows)

      const upd: Record<string, any> = {}
      const totalDisb = [...disbursements, ...rows.filter(r => r.kind === 'disbursement')].reduce((s, t: any) => s + Number(t.amount), 0)
      if (totalDisb > 0) upd.disbursed_amt = totalDisb
      if (j.data?.months_paid)     upd.months_paid     = Number(j.data.months_paid)
      if (j.data?.outstanding_amt) upd.outstanding_amt = Number(j.data.outstanding_amt)
      if (j.data?.emi_amount)      upd.emi_amount      = Number(j.data.emi_amount)
      if (Object.keys(upd).length) { try { await supabase.from('home_loans').update(upd).eq('id', loan.id) } catch {} }

      setImportMsg(rows.length ? `Imported ${rows.length} new transaction${rows.length !== 1 ? 's' : ''}.` : 'No new transactions found (already up to date).')
      router.refresh()
    } catch (err: any) {
      setImportMsg(err.message || 'Could not import the statement.')
    }
    setImporting(false)
  }

  const disbursements = useMemo(() => txns.filter(t => t.kind === 'disbursement'), [txns])
  const contributions = useMemo(() => txns.filter(t => t.kind === 'own_contribution'), [txns])
  const prepays       = useMemo(() => txns.filter(t => t.kind === 'prepayment'), [txns])
  const totalPrepay   = prepays.reduce((a, t) => a + Number(t.amount), 0)
  const totalDisbursedTxn = disbursements.reduce((a, t) => a + Number(t.amount), 0)
  const totalOwn = contributions.reduce((a, t) => a + Number(t.amount), 0)

  const effectiveDisbursed = totalDisbursedTxn > 0
    ? totalDisbursedTxn
    : Number(loan.disbursed_amt) || Number(loan.sanctioned_amt) || 0

  const amort = useMemo(() => amortize({
    principal: effectiveDisbursed,
    annualRate: Number(loan.interest_rate) || 0,
    tenureMonths: Number(loan.tenure_months) || 0,
    emi: Number(loan.emi_amount) || 0,
    monthsPaid: Number(loan.months_paid) || 0,
    outstanding: Number(loan.outstanding_amt) || 0,
    startDate: loan.loan_start_date || undefined,
  }), [loan, effectiveDisbursed])

  const paidPct = amort.emisTotal > 0 ? Math.round((amort.emisPaid / amort.emisTotal) * 100) : 0
  const princBarPaid = amort.principal > 0 ? (amort.principalPaid / amort.principal) * 100 : 0
  const intTotal = amort.interestPaid + amort.totalInterest
  const intBarPaid = intTotal > 0 ? (amort.interestPaid / intTotal) * 100 : 0

  // Home funding breakup
  const propertyCost = Number(loan.property_cost) || 0
  const fundLoanPct = propertyCost > 0 ? (effectiveDisbursed / propertyCost) * 100 : 0
  const fundOwnPct  = propertyCost > 0 ? (totalOwn / propertyCost) * 100 : 0
  const fundGap     = Math.max(0, propertyCost - effectiveDisbursed - totalOwn)

  async function saveTxn() {
    const amt = Number(form.amount)
    if (!amt || amt <= 0) return
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('loan_transactions').insert({
      user_id: user!.id, loan_id: loan.id, kind: adding,
      txn_date: form.date, amount: amt, note: form.note || null,
    })
    if (adding === 'disbursement') {
      await supabase.from('home_loans').update({ disbursed_amt: totalDisbursedTxn + amt }).eq('id', loan.id)
    }
    setSaving(false); setAdding('none'); setForm({ date: todayISO(), amount: '', note: '' })
    router.refresh()
  }

  async function delTxn(id: string) {
    await supabase.from('loan_transactions').delete().eq('id', id)
    router.refresh()
  }

  async function saveCost() {
    await supabase.from('home_loans').update({ property_cost: Number(costVal) || null }).eq('id', loan.id)
    setEditCost(false); router.refresh()
  }

  const breakup: [string, any][] = loan.cost_breakup && typeof loan.cost_breakup === 'object'
    ? Object.entries(loan.cost_breakup) : []

  const schedule = showAllSched ? amort.schedule : amort.schedule.slice(0, 12)

  return (
    <div className="space-y-5 animate-fade-up">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <Link href="/dashboard/loans" className="flex items-center gap-1 text-[11px] mb-2" style={{ color: 'var(--sage)' }}>
            <ChevronLeft size={13} /> All Loans
          </Link>
          <h1 className="text-xl font-bold flex items-center gap-2" style={{ color: 'var(--text)' }}>
            <Building2 size={18} style={{ color: 'var(--blue)' }} /> {loan.name}
          </h1>
          <p className="text-[12px] mt-0.5" style={{ color: 'var(--text3)' }}>
            {loan.bank_name} · {loan.interest_rate}% p.a. · {loan.tenure_months} mo tenure
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => fileRef.current?.click()} disabled={importing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold border disabled:opacity-60"
            style={{ background: 'var(--sage-bg)', borderColor: 'var(--sage)', color: 'var(--sage)' }}
            title="Import disbursements, prepayments & EMIs from a loan statement PDF">
            {importing ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />} Import statement
          </button>
          <input ref={fileRef} type="file" accept=".pdf,application/pdf" className="hidden" onChange={importStatement} />
          <span className="text-[12px] font-bold px-3 py-1.5 rounded-lg" style={{ background: 'var(--gold-bg)', color: 'var(--gold)' }}>{paidPct}% repaid</span>
        </div>
      </div>
      {importMsg && <div className="text-[11px]" style={{ color: 'var(--text2)' }}>{importMsg}</div>}

      {/* Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Sanctioned"   value={money(loan.sanctioned_amt)} />
        <Stat label="Disbursed"    value={money(effectiveDisbursed)} />
        <Stat label="Outstanding"  value={money(loan.outstanding_amt)} color="var(--rose)" />
        <Stat label="EMI"          value={money(loan.emi_amount)} />
        <Stat label="Balance Tenor" value={`${amort.balanceTenor} mo`} icon={CalendarClock} />
        <Stat label="EMIs Paid"    value={`${amort.emisPaid} / ${amort.emisTotal}`} />
        <Stat label="Loan Start"   value={loan.loan_start_date ?? '—'} />
        <Stat label="Next EMI"     value={loan.next_emi_date ?? '—'} />
      </div>

      {/* Repayment split */}
      <div className="wl-card p-4">
        <div className="text-[11px] font-bold uppercase tracking-wider mb-3 flex items-center gap-1.5" style={{ color: 'var(--text3)' }}>
          <TrendingDown size={12} /> Repayment Breakdown
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
          <Mini label="Principal Paid"   value={money(amort.principalPaid)} color="var(--income)" />
          <Mini label="Interest Paid"    value={money(amort.interestPaid)}  color="var(--rose)" />
          <Mini label="Remaining Principal" value={money(amort.remaining)}  color="var(--text2)" />
        </div>

        <div className="space-y-3">
          <div>
            <div className="flex justify-between text-[10px] mb-1" style={{ color: 'var(--text3)' }}>
              <span>Principal: {money(amort.principalPaid)} paid</span><span>of {money(amort.principal)}</span>
            </div>
            <div className="h-2.5 rounded-full overflow-hidden" style={{ background: 'var(--bg2)' }}>
              <div className="h-full" style={{ width: `${Math.min(100, princBarPaid)}%`, background: 'var(--income)' }} />
            </div>
          </div>
          <div>
            <div className="flex justify-between text-[10px] mb-1" style={{ color: 'var(--text3)' }}>
              <span>Interest: {money(amort.interestPaid)} paid</span><span>~{money(intTotal)} total cost</span>
            </div>
            <div className="h-2.5 rounded-full overflow-hidden" style={{ background: 'var(--bg2)' }}>
              <div className="h-full" style={{ width: `${Math.min(100, intBarPaid)}%`, background: 'var(--rose)' }} />
            </div>
          </div>
        </div>
        <p className="text-[10px] mt-3" style={{ color: 'var(--text3)' }}>
          Paid so far: <b>{money(amort.principalPaid + amort.interestPaid)}</b> · est. interest still to pay: <b>{money(amort.totalInterest)}</b>
        </p>
      </div>

      {/* Disbursements */}
      <Section title="Disbursements" total={money(effectiveDisbursed)} onAdd={() => { setAdding('disbursement'); setForm({ date: todayISO(), amount: '', note: '' }) }} icon={Coins}>
        {disbursements.length === 0 ? (
          <Empty text={loan.disbursed_amt ? `${money(loan.disbursed_amt)} disbursed (no itemised entries). Add disbursements to track partial/staged payouts.` : 'No disbursement entries yet — add when the bank releases funds (supports multiple/staged disbursals).'} />
        ) : (
          <Rows items={disbursements} money={money} onDel={delTxn} />
        )}
        {adding === 'disbursement' && <AddRow form={form} setForm={setForm} onSave={saveTxn} onCancel={() => setAdding('none')} saving={saving} sym={sym} />}
      </Section>

      {/* Prepayments */}
      <Section title="Prepayments" total={money(totalPrepay)} onAdd={() => { setAdding('prepayment'); setForm({ date: todayISO(), amount: '', note: '' }) }} icon={Coins}>
        {prepays.length === 0
          ? <Empty text="Part-prepayments you've made (lump-sum payments that reduce principal). Import a statement or add them here." />
          : <Rows items={prepays} money={money} onDel={delTxn} />}
        {adding === 'prepayment' && <AddRow form={form} setForm={setForm} onSave={saveTxn} onCancel={() => setAdding('none')} saving={saving} sym={sym} />}
      </Section>

      {/* Home loan funding */}
      {isHome && (
        <div className="wl-card p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="text-[11px] font-bold uppercase tracking-wider flex items-center gap-1.5" style={{ color: 'var(--text3)' }}>
              <Home size={12} /> Property Funding
            </div>
            {!editCost && (
              <button onClick={() => { setEditCost(true); setCostVal(String(loan.property_cost ?? '')) }}
                className="text-[11px] flex items-center gap-1" style={{ color: 'var(--sage)' }}><Pencil size={11} /> Property cost</button>
            )}
          </div>

          {editCost ? (
            <div className="flex items-center gap-2 mb-3">
              <span className="text-[12px]" style={{ color: 'var(--text3)' }}>Total property cost {sym}</span>
              <input type="number" value={costVal} onChange={e => setCostVal(e.target.value)}
                className="wl-input text-[12px] w-40" style={{ background: 'var(--bg2)', border: '1px solid var(--border)', color: 'var(--text)' }} autoFocus />
              <button onClick={saveCost} className="p-1.5 rounded-lg" style={{ background: 'var(--income-bg)', color: 'var(--income)' }}><Check size={14} /></button>
              <button onClick={() => setEditCost(false)} className="p-1.5 rounded-lg" style={{ background: 'var(--bg2)', color: 'var(--text3)' }}><X size={14} /></button>
            </div>
          ) : propertyCost > 0 ? (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
                <Mini label="Property Cost" value={money(propertyCost)} color="var(--text)" />
                <Mini label="Loan Funded" value={`${money(effectiveDisbursed)} · ${Math.round(fundLoanPct)}%`} color="var(--blue)" />
                <Mini label="Own Contribution" value={`${money(totalOwn)} · ${Math.round(fundOwnPct)}%`} color="var(--income)" />
                <Mini label="Yet to Fund" value={money(fundGap)} color={fundGap > 0 ? 'var(--gold)' : 'var(--text3)'} />
              </div>
              <div className="h-3 rounded-full overflow-hidden flex" style={{ background: 'var(--bg2)' }}>
                <div style={{ width: `${Math.min(100, fundLoanPct)}%`, background: 'var(--blue)' }} />
                <div style={{ width: `${Math.min(100, fundOwnPct)}%`, background: 'var(--income)' }} />
              </div>
              <div className="flex gap-4 mt-1.5 text-[10px]" style={{ color: 'var(--text3)' }}>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: 'var(--blue)' }} /> Loan</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: 'var(--income)' }} /> Own funds</span>
                {fundGap > 0 && <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }} /> Unfunded</span>}
              </div>
            </>
          ) : (
            <Empty text="Set the total property cost to see how much is funded by the loan vs your own contribution." />
          )}

          {breakup.length > 0 && (
            <div className="mt-3 pt-3 border-t grid grid-cols-2 sm:grid-cols-3 gap-2" style={{ borderColor: 'var(--border)' }}>
              {breakup.map(([k, v]) => (
                <div key={k} className="text-[11px] flex justify-between">
                  <span style={{ color: 'var(--text3)' }}>{k}</span>
                  <span className="font-mono" style={{ color: 'var(--text)' }}>{money(Number(v))}</span>
                </div>
              ))}
            </div>
          )}

          {/* Own contributions */}
          <div className="mt-4 pt-3 border-t" style={{ borderColor: 'var(--border)' }}>
            <div className="flex items-center justify-between mb-2">
              <div className="text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5" style={{ color: 'var(--text3)' }}>
                <Wallet size={11} /> Own Contributions ({money(totalOwn)})
              </div>
              <button onClick={() => { setAdding('own_contribution'); setForm({ date: todayISO(), amount: '', note: '' }) }}
                className="text-[11px] flex items-center gap-1 font-semibold" style={{ color: 'var(--sage)' }}><Plus size={12} /> Add</button>
            </div>
            {contributions.length === 0
              ? <Empty text="Down-payments you've made from your own funds — add each (multiple entries supported)." />
              : <Rows items={contributions} money={money} onDel={delTxn} />}
            {adding === 'own_contribution' && <AddRow form={form} setForm={setForm} onSave={saveTxn} onCancel={() => setAdding('none')} saving={saving} sym={sym} />}
          </div>
        </div>
      )}

      {/* Amortization schedule */}
      {amort.schedule.length > 0 && (
        <div className="wl-card overflow-hidden">
          <div className="px-4 py-3 border-b text-[11px] font-bold uppercase tracking-wider" style={{ borderColor: 'var(--border)', color: 'var(--text3)' }}>
            Amortization Schedule — remaining {amort.balanceTenor} EMIs
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr style={{ background: 'var(--bg2)', borderBottom: '1px solid var(--border)' }}>
                  {['#', 'Month', 'EMI', 'Principal', 'Interest', 'Balance'].map(h => (
                    <th key={h} className="px-3 py-2 text-left text-[10px] uppercase tracking-wider font-bold" style={{ color: 'var(--text3)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
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
          {amort.schedule.length > 12 && (
            <button onClick={() => setShowAllSched(s => !s)} className="w-full py-2.5 text-[11px] font-semibold border-t" style={{ borderColor: 'var(--border)', color: 'var(--sage)' }}>
              {showAllSched ? 'Show less' : `Show all ${amort.schedule.length} months`}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ── sub-components ───────────────────────────────────────────────────────────
function Stat({ label, value, color, icon: Icon }: { label: string; value: string; color?: string; icon?: any }) {
  return (
    <div className="wl-card p-3">
      <div className="text-[10px] uppercase tracking-wider font-semibold mb-1 flex items-center gap-1" style={{ color: 'var(--text3)' }}>
        {Icon && <Icon size={11} />}{label}
      </div>
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
function Section({ title, total, onAdd, icon: Icon, children }: { title: string; total?: string; onAdd?: () => void; icon?: any; children: React.ReactNode }) {
  return (
    <div className="wl-card p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="text-[11px] font-bold uppercase tracking-wider flex items-center gap-1.5" style={{ color: 'var(--text3)' }}>
          {Icon && <Icon size={12} />}{title}{total ? ` · ${total}` : ''}
        </div>
        {onAdd && <button onClick={onAdd} className="text-[11px] flex items-center gap-1 font-semibold" style={{ color: 'var(--sage)' }}><Plus size={12} /> Add</button>}
      </div>
      {children}
    </div>
  )
}
function Empty({ text }: { text: string }) {
  return <p className="text-[11px] py-2" style={{ color: 'var(--text3)' }}>{text}</p>
}
function Rows({ items, money, onDel }: { items: any[]; money: (n: number) => string; onDel: (id: string) => void }) {
  return (
    <div className="space-y-1.5">
      {items.map(t => (
        <div key={t.id} className="flex items-center justify-between gap-2 text-[12px]">
          <div className="min-w-0">
            <span className="font-mono" style={{ color: 'var(--text)' }}>{money(t.amount)}</span>
            <span className="ml-2 text-[10px]" style={{ color: 'var(--text3)' }}>{t.txn_date}{t.note ? ` · ${t.note}` : ''}</span>
          </div>
          <button onClick={() => onDel(t.id)} className="p-1 rounded" style={{ color: 'var(--rose)' }}><Trash2 size={12} /></button>
        </div>
      ))}
    </div>
  )
}
function AddRow({ form, setForm, onSave, onCancel, saving, sym }: { form: any; setForm: (f: any) => void; onSave: () => void; onCancel: () => void; saving: boolean; sym: string }) {
  const inp = { background: 'var(--bg2)', border: '1px solid var(--border)', color: 'var(--text)' }
  return (
    <div className="flex items-center gap-2 mt-2 flex-wrap">
      <input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} className="wl-input text-[11px] w-36" style={inp} />
      <input type="number" placeholder={`Amount (${sym.trim()})`} value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} className="wl-input text-[11px] w-32" style={inp} />
      <input type="text" placeholder="Note (optional)" value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} className="wl-input text-[11px] flex-1 min-w-[120px]" style={inp} />
      <button onClick={onSave} disabled={saving} className="px-3 py-1.5 rounded-lg text-white text-[11px] font-bold flex items-center gap-1 disabled:opacity-50" style={{ background: 'var(--sage)' }}>
        {saving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Save
      </button>
      <button onClick={onCancel} className="px-2 py-1.5 rounded-lg text-[11px]" style={{ background: 'var(--bg2)', color: 'var(--text3)' }}>Cancel</button>
    </div>
  )
}
