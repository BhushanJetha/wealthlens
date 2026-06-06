'use client'
import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useViewStore } from '@/store/viewStore'
import {
  X, Upload, Loader2, CheckCircle2, AlertCircle,
  FileText, Lock, Eye, EyeOff, CreditCard, Trash2,
} from 'lucide-react'
import { useDropzone } from 'react-dropzone'

interface Props { onClose: () => void }

type Stage = 'idle' | 'detecting' | 'needs-password' | 'parsing' | 'review' | 'saving' | 'done' | 'error'

interface ParsedTxn {
  date: string
  merchant: string
  description: string
  amount: number
  txn_type: 'expense' | 'income' | 'transfer' | 'loan'
  category: string
  selected: boolean
  isDuplicate?: boolean
}

interface ParseResult {
  bank_name:        string
  card_name?:       string | null
  currency:         string
  card_last4?:      string | null
  credit_limit?:    number | null
  outstanding_bal?: number | null
  minimum_due?:     number | null
  due_date?:        string | null
  transactions:     ParsedTxn[]
}

const CATS = [
  'Food','Shopping','Utilities','Transport','Health',
  'Entertainment','Travel','Education','Subscription',
  'Investment','Loan on Card','EMI/Loan','Transfer','Refund','Other',
]

const BANKS = [
  { value: '',              label: 'Auto-detect from filename' },
  { value: 'HDFC',         label: 'HDFC Bank' },
  { value: 'ICICI',        label: 'ICICI Bank' },
  { value: 'Axis',         label: 'Axis Bank' },
  { value: 'SBI',          label: 'SBI Card' },
  { value: 'Kotak',        label: 'Kotak Mahindra' },
  { value: 'YES Bank',     label: 'YES Bank' },
  { value: 'IndusInd',     label: 'IndusInd Bank' },
  { value: 'AmEx',         label: 'American Express' },
  { value: 'Emirates NBD', label: 'Emirates NBD' },
  { value: 'ADCB',         label: 'ADCB' },
  { value: 'FAB',          label: 'FAB (UAE)' },
]

export default function CreditCardUploadModal({ onClose }: Props) {
  const [file, setFile]             = useState<File | null>(null)
  const [bank, setBank]             = useState('')
  const [stage, setStage]           = useState<Stage>('idle')
  const [password, setPassword]     = useState('')
  const [showPwd, setShowPwd]       = useState(false)
  const [pwdHint, setPwdHint]       = useState('')
  const [detectedBank, setDetectedBank] = useState('')
  const [wrongPwd, setWrongPwd]     = useState(false)
  const [errorMsg, setErrorMsg]     = useState('')
  const [parseWarning, setParseWarning] = useState<string | undefined>()
  const [result, setResult]         = useState<ParseResult | null>(null)
  const [duplicateCount, setDuplicateCount] = useState(0)
  const [savedCount, setSavedCount]         = useState(0)
  const [savedRange, setSavedRange] = useState<{ from: string; to: string } | null>(null)
  const router = useRouter()
  const supabase = createClient()
  const { setDateRange } = useViewStore()

  const onDrop = useCallback((accepted: File[]) => {
    if (accepted[0]) { setFile(accepted[0]); setStage('idle') }
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/pdf': ['.pdf'] },
    maxFiles: 1,
  })

  async function submit(withPassword?: string) {
    if (!file) return
    setStage(withPassword ? 'parsing' : 'detecting')
    setWrongPwd(false)

    const fd = new FormData()
    fd.append('file', file)
    if (bank)         fd.append('bankHint', bank)
    if (withPassword) fd.append('password', withPassword)

    try {
      const res  = await fetch('/api/parse-credit-card', { method: 'POST', body: fd })
      const data = await res.json()

      if (data.encrypted) {
        setDetectedBank(data.bank ?? bank ?? '')
        setPwdHint(data.hint ?? 'Usually your date of birth in DDMMYYYY format')
        setStage('needs-password')
        return
      }

      if (data.wrongPassword) {
        setWrongPwd(true)
        setStage('needs-password')
        return
      }

      if (!res.ok) throw new Error(data.error ?? 'Parsing failed')

      const rawTxns: ParsedTxn[] = (data.transactions ?? []).map((t: any) => ({
        ...t,
        amount: Number(t.amount),
        selected: true,
      }))

      // Check for duplicates against existing transactions in the same date range
      let txns = rawTxns
      let dupCount = 0
      if (rawTxns.length > 0) {
        const dates   = rawTxns.map(t => t.date).sort()
        const minDate = dates[0]
        const maxDate = dates[dates.length - 1]
        const { data: { user } } = await supabase.auth.getUser()
        const { data: existing } = await supabase
          .from('transactions')
          .select('txn_date, merchant, amount')
          .eq('user_id', user!.id)
          .eq('currency', data.currency)
          .gte('txn_date', minDate)
          .lte('txn_date', maxDate)

        const existingKeys = new Set(
          (existing ?? []).map(e =>
            `${e.txn_date}|${String(e.merchant).toLowerCase().trim()}|${Number(e.amount)}`
          )
        )

        txns = rawTxns.map(t => {
          const isDuplicate = existingKeys.has(
            `${t.date}|${t.merchant.toLowerCase().trim()}|${t.amount}`
          )
          if (isDuplicate) dupCount++
          return { ...t, isDuplicate, selected: !isDuplicate }
        })
      }

      setDuplicateCount(dupCount)
      setParseWarning(data.parseWarning)
      setResult({
        bank_name:       data.bank_name,
        card_name:       data.card_name  ?? null,
        currency:        data.currency,
        card_last4:      data.card_last4  ?? null,
        credit_limit:    data.credit_limit    ?? null,
        outstanding_bal: data.outstanding_bal ?? null,
        minimum_due:     data.minimum_due     ?? null,
        due_date:        data.due_date         ?? null,
        transactions:    txns,
      })
      setStage('review')
    } catch (e: any) {
      setErrorMsg(e.message)
      setStage('error')
    }
  }

  async function save() {
    if (!result) return
    setStage('saving')
    const { data: { user } } = await supabase.auth.getUser()
    const selected = result.transactions.filter(t => t.selected)

    // Final dedup: re-check against DB in case user checked a flagged duplicate
    const dates   = selected.map(t => t.date).sort()
    const minDate = dates[0]
    const maxDate = dates[dates.length - 1]
    const { data: existing } = await supabase
      .from('transactions')
      .select('txn_date, merchant, amount')
      .eq('user_id', user!.id)
      .eq('currency', result.currency)
      .gte('txn_date', minDate)
      .lte('txn_date', maxDate)

    const existingKeys = new Set(
      (existing ?? []).map(e =>
        `${e.txn_date}|${String(e.merchant).toLowerCase().trim()}|${Number(e.amount)}`
      )
    )

    const deduped = selected.filter(t =>
      !existingKeys.has(`${t.date}|${t.merchant.toLowerCase().trim()}|${t.amount}`)
    )

    if (deduped.length === 0) {
      setStage('done')
      return
    }

    // Auto-create or find the credit card account so transactions are linked to it
    const country = result.currency === 'AED' ? 'UAE' : 'India'
    // Prefer card_name (e.g. "HDFC Bank Regalia") over plain bank_name
    const displayName = result.card_name ?? result.bank_name
    const accountName = `${displayName}${result.card_last4 ? ` ••••${result.card_last4}` : ''}`
    let accountId: string | null = null

    // Match by last_four + currency (more reliable than name which may vary)
    // Fall back to name match if no last4
    let acctQuery = supabase
      .from('accounts')
      .select('id')
      .eq('user_id', user!.id)
      .eq('account_type', 'credit_card')
      .eq('currency', result.currency)

    if (result.card_last4) {
      acctQuery = acctQuery.eq('last_four', result.card_last4)
    } else {
      acctQuery = acctQuery.eq('name', accountName)
    }

    const { data: existingAccts } = await acctQuery.limit(1)

    if (existingAccts && existingAccts.length > 0) {
      accountId = existingAccts[0].id
      // Update all fields with latest statement data (name may now include card product)
      const updates: Record<string, any> = { name: accountName }
      if (result.credit_limit    != null) updates.credit_limit    = result.credit_limit
      if (result.outstanding_bal != null) updates.outstanding_bal = result.outstanding_bal
      if (result.minimum_due     != null) updates.minimum_due     = result.minimum_due
      if (result.due_date        != null) updates.due_date        = result.due_date
      await supabase.from('accounts').update(updates).eq('id', accountId)
    } else {
      const { data: newAcct } = await supabase
        .from('accounts')
        .insert({
          user_id:         user!.id,
          name:            accountName,
          bank_name:       result.bank_name,
          account_type:    'credit_card',
          currency:        result.currency,
          country,
          last_four:       result.card_last4      ?? null,
          credit_limit:    result.credit_limit    ?? null,
          outstanding_bal: result.outstanding_bal ?? null,
          minimum_due:     result.minimum_due     ?? null,
          due_date:        result.due_date         ?? null,
          color:           '#3B7DD8',
        })
        .select('id')
        .single()
      if (newAcct) accountId = newAcct.id
    }

    const rows = deduped.map(t => ({
      user_id:     user!.id,
      account_id:  accountId,
      txn_date:    t.date,
      merchant:    t.merchant,
      description: t.description,
      amount:      Math.abs(t.amount),
      currency:    result.currency,
      country,
      txn_type:    t.txn_type,
      category:    t.category,
      source:      'statement_upload',
      is_verified: false,
    }))

    await supabase.from('transactions').insert(rows)

    const months   = deduped.map(t => t.date.slice(0, 7)).sort()
    const minMonth = months[0]
    const maxMonth = months[months.length - 1]
    setDateRange(minMonth, maxMonth)
    setSavedRange({ from: minMonth, to: maxMonth })
    setSavedCount(deduped.length)

    setStage('done')
    router.refresh()
  }

  function toggleTxn(i: number) {
    setResult(prev => {
      if (!prev) return prev
      const txns = [...prev.transactions]
      txns[i] = { ...txns[i], selected: !txns[i].selected }
      return { ...prev, transactions: txns }
    })
  }

  function updateTxn(i: number, field: 'category' | 'txn_type', val: string | 'expense' | 'income' | 'transfer') {
    setResult(prev => {
      if (!prev) return prev
      const txns = [...prev.transactions]
      txns[i] = { ...txns[i], [field]: val }
      return { ...prev, transactions: txns }
    })
  }

  function removeTxn(i: number) {
    setResult(prev => prev ? { ...prev, transactions: prev.transactions.filter((_, idx) => idx !== i) } : prev)
  }

  function selectAll(val: boolean) {
    setResult(prev => prev ? { ...prev, transactions: prev.transactions.map(t => ({ ...t, selected: val })) } : prev)
  }

  const sym           = result?.currency === 'AED' ? 'AED ' : '₹'
  const selectedCount = result?.transactions.filter(t => t.selected).length ?? 0

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col"
        style={{ background: '#fff', border: '1px solid var(--border)', boxShadow: '0 8px 40px rgba(0,0,0,0.15)' }}>

        {/* Header */}
        <div className="flex justify-between items-center px-6 py-4 border-b flex-shrink-0"
          style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-2">
            <CreditCard size={18} style={{ color: 'var(--blue)' }} />
            <h2 className="text-[15px] font-bold" style={{ color: 'var(--text)' }}>Credit Card Statement</h2>
          </div>
          <button onClick={onClose} style={{ color: 'var(--text3)' }}><X size={18} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">

          {/* IDLE */}
          {stage === 'idle' && (
            <div className="space-y-4">
              <div>
                <label className="block text-[10px] uppercase tracking-wider font-semibold mb-1.5"
                  style={{ color: 'var(--text3)' }}>
                  Bank (optional — helps with password hints)
                </label>
                <select value={bank} onChange={e => setBank(e.target.value)}
                  className="wl-input w-full"
                  style={{ background: 'var(--bg2)', border: '1px solid var(--border)', color: 'var(--text)' }}>
                  {BANKS.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
                </select>
              </div>

              <div {...getRootProps()}
                className="border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all"
                style={{
                  borderColor: isDragActive ? 'var(--blue)' : 'var(--border)',
                  background: isDragActive ? '#EFF6FF' : 'var(--bg2)',
                }}>
                <input {...getInputProps()} />
                <CreditCard size={28} className="mx-auto mb-2" style={{ color: 'var(--text3)' }} />
                <div className="text-[13px] font-semibold" style={{ color: 'var(--text)' }}>
                  {isDragActive ? 'Drop your CC statement here' : 'Drag & drop or click to select PDF'}
                </div>
                <div className="text-[11px] mt-1" style={{ color: 'var(--text3)' }}>
                  Password-protected PDFs are supported
                </div>
              </div>

              {file && (
                <div className="flex items-center gap-2 p-3 rounded-lg" style={{ background: 'var(--bg2)' }}>
                  <FileText size={16} style={{ color: 'var(--blue)' }} />
                  <span className="text-[12px] font-medium flex-1 truncate" style={{ color: 'var(--text)' }}>
                    {file.name}
                  </span>
                  <button onClick={() => setFile(null)} style={{ color: 'var(--text3)' }}><X size={14} /></button>
                </div>
              )}

              <div className="flex gap-3">
                <button onClick={onClose}
                  className="flex-1 py-2.5 rounded-lg border text-[12px] font-semibold"
                  style={{ borderColor: 'var(--border)', color: 'var(--text3)', background: 'var(--bg2)' }}>
                  Cancel
                </button>
                <button onClick={() => submit()} disabled={!file}
                  className="flex-1 py-2.5 rounded-lg text-white text-[12px] font-bold flex items-center justify-center gap-2 disabled:opacity-40"
                  style={{ background: 'var(--blue)' }}>
                  <Upload size={14} />
                  Upload & Parse
                </button>
              </div>
            </div>
          )}

          {/* DETECTING */}
          {stage === 'detecting' && (
            <div className="flex flex-col items-center py-12 gap-3">
              <Loader2 size={32} className="animate-spin" style={{ color: 'var(--blue)' }} />
              <div className="text-[13px] font-semibold" style={{ color: 'var(--text)' }}>Checking PDF…</div>
            </div>
          )}

          {/* NEEDS PASSWORD */}
          {stage === 'needs-password' && (
            <div className="space-y-4">
              <div className="flex items-start gap-3 p-4 rounded-xl"
                style={{ background: '#FEF3C7', border: '1px solid #FCD34D' }}>
                <Lock size={20} style={{ color: '#D97706', flexShrink: 0, marginTop: 1 }} />
                <div>
                  <div className="text-[13px] font-semibold" style={{ color: '#92400E' }}>
                    {detectedBank ? `${detectedBank} — Password Protected` : 'This PDF is password-protected'}
                  </div>
                  <div className="text-[11px] mt-1" style={{ color: '#92400E' }}>
                    <strong>Hint:</strong> {pwdHint}
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-[10px] uppercase tracking-wider font-semibold mb-1.5"
                  style={{ color: 'var(--text3)' }}>
                  PDF Password
                </label>
                <div className="relative">
                  <input
                    type={showPwd ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && password && submit(password)}
                    placeholder="Enter PDF password…"
                    className="wl-input w-full pr-10"
                    style={{
                      background: 'var(--bg2)',
                      border: `1px solid ${wrongPwd ? 'var(--rose)' : 'var(--border)'}`,
                      color: 'var(--text)',
                    }}
                    autoFocus
                  />
                  <button type="button" onClick={() => setShowPwd(p => !p)}
                    className="absolute right-3 top-1/2 -translate-y-1/2"
                    style={{ color: 'var(--text3)' }}>
                    {showPwd ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
                {wrongPwd && (
                  <div className="text-[11px] mt-1" style={{ color: 'var(--rose)' }}>
                    Incorrect password — please try again.
                  </div>
                )}
              </div>

              <div className="flex gap-3">
                <button onClick={() => { setStage('idle'); setPassword('') }}
                  className="flex-1 py-2.5 rounded-lg border text-[12px] font-semibold"
                  style={{ borderColor: 'var(--border)', color: 'var(--text3)', background: 'var(--bg2)' }}>
                  Change File
                </button>
                <button onClick={() => submit(password)} disabled={!password}
                  className="flex-1 py-2.5 rounded-lg text-white text-[12px] font-bold flex items-center justify-center gap-2 disabled:opacity-40"
                  style={{ background: 'var(--blue)' }}>
                  <Lock size={14} />
                  Unlock & Parse
                </button>
              </div>
            </div>
          )}

          {/* PARSING */}
          {stage === 'parsing' && (
            <div className="flex flex-col items-center py-12 gap-3">
              <Loader2 size={32} className="animate-spin" style={{ color: 'var(--blue)' }} />
              <div className="text-[13px] font-semibold" style={{ color: 'var(--text)' }}>
                Parsing transactions…
              </div>
              <div className="text-[11px]" style={{ color: 'var(--text3)' }}>Reading your PDF locally</div>
            </div>
          )}

          {/* REVIEW */}
          {stage === 'review' && result && (
            <div className="space-y-4">
              {duplicateCount > 0 && (
                <div className="flex items-start gap-2 p-3 rounded-lg text-[11px]"
                  style={{ background: '#FEF3C7', border: '1px solid #FCD34D', color: '#92400E' }}>
                  <span style={{ flexShrink: 0 }}>⚠️</span>
                  <span>
                    <strong>{duplicateCount} transaction{duplicateCount !== 1 ? 's' : ''} already imported</strong> — pre-deselected below.
                    You can re-check them if you want to save again.
                  </span>
                </div>
              )}
              {parseWarning && (
                <div className="flex items-start gap-2 p-3 rounded-lg text-[11px]"
                  style={{ background: '#FEF3C7', border: '1px solid #FCD34D', color: '#92400E' }}>
                  <span style={{ flexShrink: 0 }}>⚠️</span>
                  <span>{parseWarning}</span>
                </div>
              )}
              {/* Summary bar */}
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[13px] font-bold" style={{ color: 'var(--text)' }}>
                    {result.card_name ?? result.bank_name}{result.card_last4 ? ` ••••${result.card_last4}` : ''}
                    <span className="ml-2 text-[10px] font-normal px-1.5 py-0.5 rounded"
                      style={{ background: 'var(--bg2)', color: 'var(--text3)' }}>
                      {result.currency}
                    </span>
                  </div>
                  <div className="text-[11px] mt-0.5" style={{ color: 'var(--text3)' }}>
                    {result.transactions.length} transactions · {selectedCount} selected
                  </div>
                  {/* Show extracted card details */}
                  {(result.credit_limit || result.outstanding_bal || result.minimum_due || result.due_date) && (
                    <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1">
                      {result.credit_limit    && <span className="text-[10px]" style={{ color:'var(--text3)' }}>Limit: <strong style={{ color:'var(--text)' }}>{result.currency === 'AED' ? 'AED ' : '₹'}{Number(result.credit_limit).toLocaleString('en-IN')}</strong></span>}
                      {result.outstanding_bal && <span className="text-[10px]" style={{ color:'var(--text3)' }}>Outstanding: <strong style={{ color:'var(--rose)' }}>{result.currency === 'AED' ? 'AED ' : '₹'}{Number(result.outstanding_bal).toLocaleString('en-IN')}</strong></span>}
                      {result.minimum_due     && <span className="text-[10px]" style={{ color:'var(--text3)' }}>Min Due: <strong style={{ color:'var(--gold)' }}>{result.currency === 'AED' ? 'AED ' : '₹'}{Number(result.minimum_due).toLocaleString('en-IN')}</strong></span>}
                      {result.due_date        && <span className="text-[10px]" style={{ color:'var(--text3)' }}>Due: <strong style={{ color:'var(--text)' }}>{result.due_date}</strong></span>}
                    </div>
                  )}
                </div>
                <div className="flex gap-1.5">
                  <button onClick={() => selectAll(true)}
                    className="text-[10px] px-2.5 py-1 rounded font-medium"
                    style={{ background: 'var(--bg2)', color: 'var(--text3)' }}>
                    Select All
                  </button>
                  <button onClick={() => selectAll(false)}
                    className="text-[10px] px-2.5 py-1 rounded font-medium"
                    style={{ background: 'var(--bg2)', color: 'var(--text3)' }}>
                    None
                  </button>
                </div>
              </div>

              {/* Transaction table */}
              <div className="rounded-xl overflow-hidden border" style={{ borderColor: 'var(--border)' }}>
                <div className="overflow-y-auto" style={{ maxHeight: 340 }}>
                  <table className="w-full text-[11px]">
                    <thead className="sticky top-0" style={{ background: 'var(--bg2)' }}>
                      <tr>
                        <th className="px-2 py-2 w-6"></th>
                        <th className="px-2 py-2 text-left font-semibold" style={{ color: 'var(--text3)' }}>Date</th>
                        <th className="px-2 py-2 text-left font-semibold" style={{ color: 'var(--text3)' }}>Merchant</th>
                        <th className="px-2 py-2 text-right font-semibold" style={{ color: 'var(--text3)' }}>Amount</th>
                        <th className="px-2 py-2 text-left font-semibold" style={{ color: 'var(--text3)' }}>Category</th>
                        <th className="px-2 py-2 text-left font-semibold" style={{ color: 'var(--text3)' }}>Type</th>
                        <th className="px-2 py-2 w-6"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.transactions.map((t, i) => (
                        <tr key={i} className="border-t transition-all"
                          style={{
                            borderColor: 'var(--border)',
                            opacity: t.selected ? 1 : 0.4,
                            background: t.selected ? 'transparent' : 'var(--bg2)',
                          }}>
                          <td className="px-2 py-2 text-center">
                            <input type="checkbox" checked={t.selected} onChange={() => toggleTxn(i)}
                              className="cursor-pointer" style={{ accentColor: 'var(--blue)' }} />
                          </td>
                          <td className="px-2 py-2 whitespace-nowrap" style={{ color: 'var(--text3)' }}>
                            {t.date}
                          </td>
                          <td className="px-2 py-2" style={{ maxWidth: 150 }}>
                            <div className="flex items-center gap-1.5">
                              <span className="truncate font-medium" style={{ color: 'var(--text)' }}>
                                {t.merchant}
                              </span>
                              {t.isDuplicate && (
                                <span className="text-[9px] px-1.5 py-0.5 rounded font-semibold flex-shrink-0"
                                  style={{ background: '#FEF3C7', color: '#92400E' }}>
                                  duplicate
                                </span>
                              )}
                            </div>
                            {t.description && t.description !== t.merchant && (
                              <div className="truncate text-[10px]" style={{ color: 'var(--text3)' }}>
                                {t.description}
                              </div>
                            )}
                          </td>
                          <td className="px-2 py-2 text-right font-semibold whitespace-nowrap"
                            style={{ color: t.txn_type === 'income' ? 'var(--income)' : t.txn_type === 'transfer' ? 'var(--blue)' : 'var(--rose)' }}>
                            {t.txn_type === 'expense' ? '-' : '+'}{sym}{t.amount.toLocaleString('en-IN')}
                          </td>
                          <td className="px-2 py-2">
                            <select value={t.category} onChange={e => updateTxn(i, 'category', e.target.value)}
                              className="text-[10px] px-1.5 py-1 rounded border w-full"
                              style={{ borderColor: 'var(--border)', background: 'var(--bg2)', color: 'var(--text)' }}>
                              {CATS.map(c => <option key={c}>{c}</option>)}
                            </select>
                          </td>
                          <td className="px-2 py-2">
                            <select value={t.txn_type} onChange={e => updateTxn(i, 'txn_type', e.target.value as 'expense' | 'income' | 'transfer' | 'loan')}
                              className="text-[10px] px-1.5 py-1 rounded border"
                              style={{ borderColor: 'var(--border)', background: 'var(--bg2)', color: 'var(--text)' }}>
                              <option value="expense">Expense</option>
                              <option value="income">Income / Refund</option>
                              <option value="transfer">CC Payment</option>
                              <option value="loan">Loan</option>
                            </select>
                          </td>
                          <td className="px-2 py-2">
                            <button onClick={() => removeTxn(i)} style={{ color: 'var(--rose)' }}>
                              <Trash2 size={13} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="flex gap-3">
                <button onClick={() => { setStage('idle'); setResult(null) }}
                  className="flex-1 py-2.5 rounded-lg border text-[12px] font-semibold"
                  style={{ borderColor: 'var(--border)', color: 'var(--text3)', background: 'var(--bg2)' }}>
                  Re-upload
                </button>
                <button onClick={save} disabled={selectedCount === 0}
                  className="flex-1 py-2.5 rounded-lg text-white text-[12px] font-bold flex items-center justify-center gap-2 disabled:opacity-40"
                  style={{ background: 'var(--blue)' }}>
                  <CheckCircle2 size={14} />
                  Save {selectedCount} Transaction{selectedCount !== 1 ? 's' : ''}
                </button>
              </div>
            </div>
          )}

          {/* SAVING */}
          {stage === 'saving' && (
            <div className="flex flex-col items-center py-12 gap-3">
              <Loader2 size={32} className="animate-spin" style={{ color: 'var(--blue)' }} />
              <div className="text-[13px]" style={{ color: 'var(--text)' }}>Saving transactions…</div>
            </div>
          )}

          {/* DONE */}
          {stage === 'done' && (
            <div className="flex flex-col items-center py-10 gap-3">
              <CheckCircle2 size={40} style={{ color: 'var(--income)' }} />
              <div className="text-[15px] font-bold" style={{ color: 'var(--text)' }}>
                {savedCount > 0 ? 'Imported Successfully!' : 'Nothing New to Import'}
              </div>
              <div className="text-[12px]" style={{ color: 'var(--text3)' }}>
                {savedCount > 0
                  ? `${savedCount} transaction${savedCount !== 1 ? 's' : ''} saved`
                  : 'All transactions from this statement were already imported.'}
              </div>
              {savedRange && (
                <div className="text-center px-4 py-3 rounded-xl w-full text-[11px]"
                  style={{ background: 'var(--sage-bg)', color: 'var(--sage)', border: '1px solid var(--sage)' }}>
                  ✓ Date range auto-set to <strong>{savedRange.from}</strong> → <strong>{savedRange.to}</strong>
                  <br />Your transactions are now visible on the Expenses page.
                </div>
              )}
              <button onClick={onClose}
                className="mt-1 px-6 py-2.5 rounded-lg text-white text-[12px] font-bold"
                style={{ background: 'var(--income)' }}>
                View Expenses
              </button>
            </div>
          )}

          {/* ERROR */}
          {stage === 'error' && (
            <div className="flex flex-col items-center py-10 gap-3">
              <AlertCircle size={32} style={{ color: 'var(--rose)' }} />
              <div className="text-[13px] font-semibold" style={{ color: 'var(--text)' }}>
                Something went wrong
              </div>
              <div className="text-[11px] text-center max-w-xs" style={{ color: 'var(--text3)' }}>
                {errorMsg}
              </div>
              <button onClick={() => setStage('idle')}
                className="px-4 py-2 rounded-lg text-white text-[12px] font-semibold"
                style={{ background: 'var(--sage)' }}>
                Try Again
              </button>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
