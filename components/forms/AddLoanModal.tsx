'use client'
import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { createClient } from '@/lib/supabase/client'
import { X, Loader2, Upload, FileText, CheckCircle2, AlertCircle } from 'lucide-react'
import { useRouter } from 'next/navigation'



const Lbl = ({ children }: { children: React.ReactNode }) => (
  <label className="block text-[10px] uppercase tracking-wider font-semibold mb-1"
    style={{ color: 'var(--text3)' }}>{children}</label>
)

const Inp = ({ label, value, onChange, type = 'text', placeholder = '' }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string
}) => (
  <div>
    <Lbl>{label}</Lbl>
    <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
      className="wl-input"
      onFocus={e => (e.target.style.borderColor = 'var(--sage)')}
      onBlur={e => (e.target.style.borderColor = 'var(--border)')} />
  </div>
)

const Sel = ({ label, value, onChange, children }: {
  label: string; value: string; onChange: (v: string) => void; children: React.ReactNode
}) => (
  <div>
    <Lbl>{label}</Lbl>
    <select value={value} onChange={e => onChange(e.target.value)} className="wl-input"
      onFocus={e => (e.target.style.borderColor = 'var(--sage)')}
      onBlur={e => (e.target.style.borderColor = 'var(--border)')}>
      {children}
    </select>
  </div>
)

const LOAN_TYPES = [
  { value: 'home_loan',     label: 'Home Loan'     },
  { value: 'car_loan',      label: 'Car Loan'      },
  { value: 'bike_loan',     label: 'Bike Loan'     },
  { value: 'gold_loan',     label: 'Gold Loan'     },
  { value: 'loan_on_card',  label: 'Loan on Card'  },
  { value: 'personal_loan', label: 'Personal Loan' },
  { value: 'other_loan',    label: 'Other Loan'    },
]

type ParseState = 'idle' | 'parsing' | 'done' | 'error'

export function AddLoanModal({ onClose, defaultLoanType = 'home_loan', initialData, loanId }: {
  onClose: () => void
  defaultLoanType?: string
  initialData?: any
  loanId?: string
}) {
  const isEdit = !!loanId

  const [form, setForm] = useState<Record<string, string>>(
    initialData ? {
      currency:         initialData.currency         ?? 'INR',
      country:          initialData.country           ?? 'India',
      loan_type:        initialData.loan_type         ?? defaultLoanType,
      name:             initialData.name              ?? '',
      bank_name:        initialData.bank_name         ?? '',
      property_address: initialData.property_address  ?? '',
      interest_rate:    String(initialData.interest_rate  ?? ''),
      sanctioned_amt:   String(initialData.sanctioned_amt ?? ''),
      outstanding_amt:  String(initialData.outstanding_amt ?? ''),
      emi_amount:       String(initialData.emi_amount      ?? ''),
      tenure_months:    String(initialData.tenure_months   ?? ''),
      months_paid:      String(initialData.months_paid     ?? ''),
      loan_start_date:  initialData.loan_start_date   ?? '',
      next_emi_date:    initialData.next_emi_date      ?? '',
    } : {
      currency: 'INR', country: 'India', loan_type: defaultLoanType, holder_name: 'Self',
    }
  )
  const [saving,     setSaving]     = useState(false)
  const [parseState, setParseState] = useState<ParseState>('idle')
  const [parseMsg,   setParseMsg]   = useState('')
  const [mounted,    setMounted]    = useState(false)
  const [members,    setMembers]    = useState<{ name: string }[]>([])
  const [pendingTxns, setPendingTxns] = useState<any>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const supabase = createClient()
  const router   = useRouter()

  useEffect(() => {
    setMounted(true)
    supabase.from('family_members').select('name').eq('is_active', true).order('created_at')
      .then(({ data }) => setMembers(data ?? []))
  }, [])

  const set = (key: string) => (val: string) => setForm(p => ({ ...p, [key]: val }))

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setParseState('parsing')
    setParseMsg('Reading loan document…')
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/parse-loan-document', { method: 'POST', body: fd })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.details || j.error || 'Parse failed')
      }
      const { data, transactions } = await res.json()
      // Merge extracted values into form (skip nulls)
      setForm(prev => {
        const merged = { ...prev }
        for (const [k, v] of Object.entries(data ?? {})) {
          if (v != null && String(v).trim() !== '') merged[k] = String(v)
        }
        return merged
      })
      const nDisb = transactions?.disbursements?.length ?? 0
      const nPre  = transactions?.prepayments?.length ?? 0
      setPendingTxns(transactions ?? null)
      setParseState('done')
      setParseMsg(
        `Fields auto-filled from document${nDisb || nPre ? ` — ${nDisb} disbursement${nDisb !== 1 ? 's' : ''}${nPre ? ` & ${nPre} prepayment${nPre !== 1 ? 's' : ''}` : ''} will be saved with the loan` : ''} — review and adjust before saving.`
      )
    } catch (err: any) {
      setParseState('error')
      setParseMsg(err.message ?? 'Could not read document. Fill in manually.')
    }
    // Reset input so same file can be re-uploaded
    if (fileRef.current) fileRef.current.value = ''
  }

  async function save() {
    setSaving(true)
    const payload: Record<string, any> = {
      name:             form.name,
      bank_name:        form.bank_name,
      property_address: form.property_address ?? null,
      loan_type:        form.loan_type || 'home_loan',
      sanctioned_amt:   Number(form.sanctioned_amt  || 0),
      disbursed_amt:    form.disbursed_amt ? Number(form.disbursed_amt) : null,
      outstanding_amt:  Number(form.outstanding_amt || 0),
      emi_amount:       Number(form.emi_amount      || 0),
      interest_rate:    Number(form.interest_rate   || 0),
      loan_start_date:  form.loan_start_date || null,
      tenure_months:    Number(form.tenure_months   || 0),
      months_paid:      Number(form.months_paid     || 0),
      currency:         form.currency,
      country:          form.currency === 'AED' ? 'UAE' : 'India',
      next_emi_date:    form.next_emi_date || null,
      holder_name:      form.holder_name || 'Self',
      property_cost:    form.property_cost ? Number(form.property_cost) : null,
    }

    const { data: { user } } = await supabase.auth.getUser()

    // Resilient write: if migration 019 (disbursed_amt / property_cost) isn't
    // applied yet, strip those columns and retry so saving still works.
    async function write(p: Record<string, any>) {
      if (isEdit) return supabase.from('home_loans').update(p).eq('id', loanId!).select('id').single()
      return supabase.from('home_loans').insert({ ...p, is_active: true, user_id: user!.id }).select('id').single()
    }
    let res = await write(payload)
    if (res.error && /column|schema cache|disbursed_amt|property_cost/i.test(res.error.message || '')) {
      const { disbursed_amt, property_cost, ...base } = payload
      res = await write(base)
    }

    // Persist parsed disbursement/prepayment rows against the (new) loan
    const newId = (res.data as any)?.id ?? loanId
    if (newId && user && pendingTxns) {
      const rows = [
        ...(pendingTxns.disbursements ?? []).map((d: any) => ({ user_id: user.id, loan_id: newId, kind: 'disbursement', txn_date: d.txn_date, amount: d.amount, note: d.note ?? null })),
        ...(pendingTxns.prepayments   ?? []).map((d: any) => ({ user_id: user.id, loan_id: newId, kind: 'prepayment',   txn_date: d.txn_date, amount: d.amount, note: d.note ?? null })),
      ]
      if (rows.length) { try { await supabase.from('loan_transactions').insert(rows) } catch {} }
    }

    router.refresh()
    setSaving(false)
    onClose()
  }

  const loanTypeLabel = LOAN_TYPES.find(t => t.value === form.loan_type)?.label ?? 'Loan'

  if (!mounted) return null

  return createPortal(
    <div className="fixed inset-0 z-[9999] bg-black/50 flex items-start justify-center overflow-y-auto"
      style={{ paddingTop: '64px', paddingLeft: '16px', paddingRight: '16px', paddingBottom: '16px' }}
      onClick={onClose}>

      {/* Panel */}
      <div className="relative w-full max-w-2xl bg-white flex flex-col rounded-2xl shadow-2xl flex-shrink-0"
        style={{ height: 'calc(100vh - 80px)', border: '1px solid var(--border)' }}
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 flex-shrink-0"
          style={{ borderBottom: '1px solid var(--border)' }}>
          <div>
            <div className="text-[16px] font-bold" style={{ color: 'var(--text)' }}>
              {isEdit ? 'Edit Loan' : 'Add Loan'}
            </div>
            <div className="text-[11px] mt-0.5" style={{ color: 'var(--text3)' }}>
              {loanTypeLabel} · {isEdit ? 'update loan details below' : 'enter manually or upload document'}
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg transition-colors"
            style={{ color: 'var(--text3)' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg2)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
            <X size={18} />
          </button>
        </div>

        {/* Scrollable form */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

          {/* PDF Upload — add mode only */}
          {!isEdit && <div className="rounded-xl p-4" style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}>
            <div className="flex items-start justify-between mb-3">
              <div>
                <div className="text-[12px] font-bold" style={{ color: 'var(--text)' }}>Upload Loan Document</div>
                <div className="text-[10px] mt-0.5" style={{ color: 'var(--text3)' }}>
                  Sanction letter, repayment schedule, or statement (PDF, max 10MB)
                </div>
              </div>
              {parseState === 'idle' && (
                <button onClick={() => fileRef.current?.click()}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-white text-[11px] font-semibold flex-shrink-0"
                  style={{ background: 'var(--sage)' }}>
                  <Upload size={12} /> Upload
                </button>
              )}
              {parseState === 'parsing' && (
                <div className="flex items-center gap-1.5 text-[11px]" style={{ color: 'var(--sage)' }}>
                  <Loader2 size={12} className="animate-spin" /> Parsing…
                </div>
              )}
              {parseState === 'done' && (
                <button onClick={() => { setParseState('idle'); setParseMsg('') }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold"
                  style={{ background: 'var(--sage-bg)', color: 'var(--sage)' }}>
                  <Upload size={12} /> Re-upload
                </button>
              )}
              {parseState === 'error' && (
                <button onClick={() => { setParseState('idle'); setParseMsg('') }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold"
                  style={{ background: 'var(--rose-bg)', color: 'var(--rose)' }}>
                  <Upload size={12} /> Retry
                </button>
              )}
            </div>

            {parseState === 'idle' && !parseMsg && (
              <div className="flex items-center gap-3 cursor-pointer" onClick={() => fileRef.current?.click()}>
                <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: 'var(--border)', color: 'var(--text3)' }}>
                  <FileText size={18} />
                </div>
                <div className="text-[11px]" style={{ color: 'var(--text3)' }}>
                  Click to select your loan document. AI will auto-fill all fields.
                </div>
              </div>
            )}

            {parseState === 'parsing' && (
              <div className="flex items-center gap-2 text-[11px]" style={{ color: 'var(--text3)' }}>
                <div className="w-4 h-4 rounded-full border-2 animate-spin"
                  style={{ borderColor: 'var(--border)', borderTopColor: 'var(--sage)' }} />
                {parseMsg}
              </div>
            )}

            {parseState === 'done' && (
              <div className="flex items-center gap-2 text-[11px]" style={{ color: 'var(--sage)' }}>
                <CheckCircle2 size={14} /> {parseMsg}
              </div>
            )}

            {parseState === 'error' && (
              <div className="flex items-center gap-2 text-[11px]" style={{ color: 'var(--rose)' }}>
                <AlertCircle size={14} /> {parseMsg}
              </div>
            )}

            <input ref={fileRef} type="file" accept=".pdf,application/pdf" className="hidden" onChange={handleFile} />
          </div>}

          {/* Divider */}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
            <span className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: 'var(--text3)' }}>Loan Details</span>
            <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
          </div>

          {/* Loan type */}
          <Sel label="Loan Type" value={form.loan_type ?? 'home_loan'} onChange={v => setForm(p => ({ ...p, loan_type: v }))}>
            {LOAN_TYPES.map(lt => <option key={lt.value} value={lt.value}>{lt.label}</option>)}
          </Sel>

          {/* Loan holder */}
          <div>
            <Lbl>Loan In Name Of</Lbl>
            <select value={form.holder_name ?? 'Self'} onChange={e => setForm(p => ({ ...p, holder_name: e.target.value }))}
              className="wl-input"
              onFocus={e => (e.target.style.borderColor = 'var(--sage)')}
              onBlur={e => (e.target.style.borderColor = 'var(--border)')}>
              <option value="Self">Self</option>
              {members.map(m => <option key={m.name} value={m.name}>{m.name}</option>)}
            </select>
          </div>

          {/* Name & Bank */}
          <div className="grid grid-cols-2 gap-4">
            <Inp label="Loan Name"     value={form.name ?? ''}      onChange={set('name')}      placeholder="Home Loan – HDFC" />
            <Inp label="Bank / Lender" value={form.bank_name ?? ''} onChange={set('bank_name')} placeholder="HDFC Bank" />
          </div>

          {/* Property address (home loan only) */}
          {form.loan_type === 'home_loan' && (
            <Inp label="Property Address (optional)" value={form.property_address ?? ''}
              onChange={set('property_address')} placeholder="123 JBR, Dubai" />
          )}

          {/* Currency & Interest */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Lbl>Currency</Lbl>
              <select value={form.currency ?? 'INR'}
                onChange={e => setForm(p => ({ ...p, currency: e.target.value, country: e.target.value === 'AED' ? 'UAE' : 'India' }))}
                className="wl-input"
                onFocus={e => (e.target.style.borderColor = 'var(--sage)')}
                onBlur={e => (e.target.style.borderColor = 'var(--border)')}>
                <option value="INR">INR 🇮🇳</option>
                <option value="AED">AED 🇦🇪</option>
              </select>
            </div>
            <Inp label="Interest Rate (%)" value={form.interest_rate ?? ''} onChange={set('interest_rate')} type="number" placeholder="8.5" />
          </div>

          {/* Amounts */}
          <div className="grid grid-cols-2 gap-4">
            <Inp label="Sanctioned Amount"  value={form.sanctioned_amt ?? ''}  onChange={set('sanctioned_amt')}  type="number" placeholder="7500000" />
            <Inp label="Outstanding Amount" value={form.outstanding_amt ?? ''} onChange={set('outstanding_amt')} type="number" placeholder="5900000" />
          </div>

          {/* EMI details */}
          <div className="grid grid-cols-3 gap-4">
            <Inp label="Monthly EMI"     value={form.emi_amount ?? ''}     onChange={set('emi_amount')}     type="number" placeholder="68000" />
            <Inp label="Tenure (months)" value={form.tenure_months ?? ''}  onChange={set('tenure_months')}  type="number" placeholder="240" />
            <Inp label="Months Paid"     value={form.months_paid ?? ''}    onChange={set('months_paid')}    type="number" placeholder="56" />
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-4">
            <Inp label="Loan Start Date" value={form.loan_start_date ?? ''} onChange={set('loan_start_date')} type="date" />
            <Inp label="Next EMI Date"   value={form.next_emi_date ?? ''}   onChange={set('next_emi_date')}   type="date" />
          </div>
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 px-6 py-4 flex gap-3" style={{ borderTop: '1px solid var(--border)' }}>
          <button onClick={onClose} className="flex-1 py-2.5 rounded-lg text-[12px] font-semibold"
            style={{ border: '1px solid var(--border)', color: 'var(--text3)', background: 'var(--bg2)' }}>
            Cancel
          </button>
          <button onClick={save} disabled={saving || !form.name}
            className="flex-1 py-2.5 rounded-lg text-white text-[12px] font-bold flex items-center justify-center gap-2 disabled:opacity-50"
            style={{ background: 'var(--sage)' }}>
            {saving ? <><Loader2 size={14} className="animate-spin" /> Saving…</> : isEdit ? 'Save Changes' : 'Add Loan'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

export default AddLoanModal
