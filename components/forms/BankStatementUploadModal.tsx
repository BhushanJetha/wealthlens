'use client'
import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { buildCategoryMemory } from '@/lib/categoryMemory'
import { useViewStore } from '@/store/viewStore'
import {
  X, Upload, Loader2, CheckCircle2, AlertCircle,
  FileText, Lock, Eye, EyeOff, Landmark, Trash2, PiggyBank,
} from 'lucide-react'
import { useDropzone } from 'react-dropzone'

interface Props { onClose: () => void }

type Stage = 'idle' | 'detecting' | 'needs-password' | 'parsing' | 'review' | 'saving' | 'done' | 'error'

interface ParsedTxn {
  date:        string
  merchant:    string
  description: string
  amount:      number
  txn_type:    'expense' | 'income' | 'transfer' | 'loan'
  category:    string
  selected:    boolean
  isDuplicate?: boolean
  autoCat?:    boolean
}

interface ParsedFD {
  name:            string
  principal:       number
  interest_rate:   number
  start_date:      string
  maturity_date:   string
  maturity_amt:    number | null
  duration_months: number | null
  currency:        string
  is_active:       boolean
  confirmed:       boolean
}

interface ParseResult {
  bank_name:        string
  account_last4?:   string | null
  account_type:     'savings' | 'current'
  currency:         string
  closing_balance?: number | null
  is_wio?:          boolean
  saving_spaces?:   ParsedFD[]
  transactions:     ParsedTxn[]
}

const CATS = [
  'Food','Shopping','Utilities','Transport','Health','Entertainment',
  'Travel','Education','Subscription','Investment','Loan on Card','EMI/Loan',
  'Loan Received','Salary','Transfer','Family Transfer','Credit Card Payment','Refund','Other',
]

const BANKS = [
  { value: '',              label: 'Auto-detect from filename' },
  { value: 'HDFC',         label: 'HDFC Bank' },
  { value: 'ICICI',        label: 'ICICI Bank' },
  { value: 'Axis',         label: 'Axis Bank' },
  { value: 'SBI',          label: 'State Bank of India' },
  { value: 'Kotak',        label: 'Kotak Mahindra' },
  { value: 'YES Bank',     label: 'YES Bank' },
  { value: 'IndusInd',     label: 'IndusInd Bank' },
  { value: 'Emirates NBD', label: 'Emirates NBD' },
  { value: 'ADCB',         label: 'ADCB' },
  { value: 'FAB',          label: 'FAB (UAE)' },
  { value: 'Wio Bank',     label: 'Wio Bank' },
]

export default function BankStatementUploadModal({ onClose }: Props) {
  const [file, setFile]                   = useState<File | null>(null)
  const [bank, setBank]                   = useState('')
  const [stage, setStage]                 = useState<Stage>('idle')
  const [password, setPassword]           = useState('')
  const [showPwd, setShowPwd]             = useState(false)
  const [pwdHint, setPwdHint]             = useState('')
  const [detectedBank, setDetectedBank]   = useState('')
  const [wrongPwd, setWrongPwd]           = useState(false)
  const [errorMsg, setErrorMsg]           = useState('')
  const [parseWarning, setParseWarning]   = useState<string | undefined>()
  const [result, setResult]               = useState<ParseResult | null>(null)
  const [confirmedFDs, setConfirmedFDs]   = useState<ParsedFD[]>([])
  const [duplicateCount, setDuplicateCount] = useState(0)
  const [savedCount, setSavedCount]       = useState(0)
  const [savedFDCount, setSavedFDCount]   = useState(0)
  const [savedRange, setSavedRange]       = useState<{ from: string; to: string } | null>(null)
  const [saveError,  setSaveError]        = useState<string | null>(null)

  const router   = useRouter()
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
      const res  = await fetch('/api/parse-bank-statement', { method: 'POST', body: fd })
      const data = await res.json()

      if (data.encrypted) {
        setDetectedBank(data.bank ?? bank ?? '')
        setPwdHint(data.hint ?? 'Usually your Customer ID or date of birth in DDMMYYYY format')
        setStage('needs-password')
        return
      }
      if (data.wrongPassword) {
        setWrongPwd(true); setStage('needs-password'); return
      }
      if (!res.ok) throw new Error(data.error ?? 'Parsing failed')

      const rawTxns: ParsedTxn[] = (data.transactions ?? []).map((t: any) => ({
        ...t, amount: Number(t.amount), selected: true,
      }))

      const { data: { user } } = await supabase.auth.getUser()

      // Smart categorization — reuse the category you previously chose for the same merchant
      if (user) {
        const mem = await buildCategoryMemory(supabase, user.id)
        if (mem.has) rawTxns.forEach(t => { if (mem.apply(t)) t.autoCat = true })
      }

      // Duplicate detection
      let txns = rawTxns
      let dupCount = 0
      if (rawTxns.length > 0 && user) {
        const dates   = rawTxns.map(t => t.date).sort()
        const { data: existing } = await supabase
          .from('transactions')
          .select('txn_date, merchant, amount')
          .eq('user_id', user.id)
          .eq('currency', data.currency)
          .gte('txn_date', dates[0])
          .lte('txn_date', dates[dates.length - 1])

        // Match on date + amount only — robust to merchant-name differences
        // (e.g. a leading date that used to be kept), re-categorisation and edits.
        const existingKeys = new Set(
          (existing ?? []).map(e => `${e.txn_date}|${Math.round(Number(e.amount) * 100)}`)
        )
        txns = rawTxns.map(t => {
          const isDuplicate = existingKeys.has(`${t.date}|${Math.round(Number(t.amount) * 100)}`)
          if (isDuplicate) dupCount++
          return { ...t, isDuplicate, selected: !isDuplicate }
        })
      }

      // Saving spaces (Fixed Deposits) — only show active ones; exclude matured/closed
      const todayStr = new Date().toISOString().slice(0, 10)
      const fds: ParsedFD[] = (data.saving_spaces ?? [])
        .filter((fd: any) => fd.is_active !== false && (!fd.maturity_date || fd.maturity_date >= todayStr))
        .map((fd: any) => ({
          name:            fd.name,
          principal:       Number(fd.principal),
          interest_rate:   Number(fd.interest_rate),
          start_date:      fd.start_date,
          maturity_date:   fd.maturity_date,
          maturity_amt:    fd.maturity_amt != null ? Number(fd.maturity_amt) : null,
          duration_months: fd.duration_months ?? null,
          currency:        data.currency,
          is_active:       true,
          confirmed:       true,
        }))
      setConfirmedFDs(fds)

      setDuplicateCount(dupCount)
      setParseWarning(data.parseWarning)
      setResult({
        bank_name:       data.bank_name,
        account_last4:   data.account_last4 ?? null,
        account_type:    data.account_type  ?? 'savings',
        currency:        data.currency,
        closing_balance: data.closing_balance ?? null,
        is_wio:          data.is_wio ?? false,
        saving_spaces:   fds,
        transactions:    txns,
      })
      setStage('review')
    } catch (e: any) {
      setErrorMsg(e.message); setStage('error')
    }
  }

  function toggleFD(i: number) {
    setConfirmedFDs(prev => prev.map((fd, idx) => idx === i ? { ...fd, confirmed: !fd.confirmed } : fd))
  }

  async function save() {
    if (!result) return
    setStage('saving')
    const { data: { user } } = await supabase.auth.getUser()
    const selected = result.transactions.filter(t => t.selected)
    const fdsToSave = confirmedFDs.filter(fd => fd.confirmed)

    if (selected.length === 0 && fdsToSave.length === 0) { setStage('done'); return }

    const country = result.currency === 'AED' ? 'UAE' : 'India'

    // Auto-create or find the bank account.
    // Match priority: exact last-4 → same bank+currency (so re-imports of the
    // same Wio/ENBD account don't create duplicates when the last-4 is missing,
    // differs, or the account_type is read differently between statements).
    const accountName = `${result.bank_name}${result.account_last4 ? ` ••••${result.account_last4}` : ''}`

    let existingId: string | null = null
    if (result.account_last4) {
      const { data } = await supabase.from('accounts').select('id')
        .eq('user_id', user!.id).eq('currency', result.currency).eq('last_four', result.account_last4).limit(1)
      existingId = data?.[0]?.id ?? null
    }
    if (!existingId) {
      const { data } = await supabase.from('accounts').select('id')
        .eq('user_id', user!.id).eq('currency', result.currency).ilike('bank_name', result.bank_name).limit(1)
      existingId = data?.[0]?.id ?? null
    }

    let accountId: string | null = null

    if (existingId) {
      accountId = existingId
      const updates: Record<string, any> = { name: accountName }
      if (result.account_last4) updates.last_four = result.account_last4
      if (result.closing_balance != null) updates.current_balance = result.closing_balance
      await supabase.from('accounts').update(updates).eq('id', accountId)
    } else if (selected.length > 0) {
      const { data: newAcct } = await supabase
        .from('accounts')
        .insert({
          user_id:         user!.id,
          name:            accountName,
          bank_name:       result.bank_name,
          account_type:    result.account_type,
          currency:        result.currency,
          country,
          last_four:       result.account_last4 ?? null,
          current_balance: result.closing_balance ?? null,
          color:           '#00C9A7',
        })
        .select('id').single()
      if (newAcct) accountId = newAcct.id
    }

    // Save transactions (with final dedup check)
    let savedTxnCount = 0
    if (selected.length > 0) {
      const dates = selected.map(t => t.date).sort()
      const { data: existing } = await supabase
        .from('transactions')
        .select('txn_date, merchant, amount')
        .eq('user_id', user!.id)
        .eq('currency', result.currency)
        .gte('txn_date', dates[0])
        .lte('txn_date', dates[dates.length - 1])

      const existingKeys = new Set(
        (existing ?? []).map(e => `${e.txn_date}|${Math.round(Number(e.amount) * 100)}`)
      )
      const deduped = selected.filter(t =>
        !existingKeys.has(`${t.date}|${Math.round(Number(t.amount) * 100)}`)
      )

      if (deduped.length > 0) {
        // Map transfer category to the sub_category the Transfers page keys off
        const transferSub = (cat: string): string | null =>
          cat === 'International Transfer' ? 'International'
          : cat === 'NRE Received'         ? 'International'
          : cat === 'NRE to NRO'           ? 'Internal'
          : cat === 'NRO to Family'        ? 'Family'
          : cat === 'Family Transfer'      ? 'Family'
          : cat === 'Self Transfer'        ? 'Internal'
          : null
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
          sub_category: t.txn_type === 'transfer' ? transferSub(t.category) : null,
          source:      'statement_upload',
          is_verified: false,
        }))
        const { error: insertErr } = await supabase.from('transactions').insert(rows)
        if (insertErr) {
          setSaveError(`Could not save transactions: ${insertErr.message}`)
          setStage('error')
          return
        }
        savedTxnCount = deduped.length

        const months = deduped.map(t => t.date.slice(0, 7)).sort()
        setDateRange(months[0], months[months.length - 1])
        setSavedRange({ from: months[0], to: months[months.length - 1] })
      }
    }

    // Save confirmed Fixed Deposits — with dedup by principal+start_date+interest_rate
    let savedFDs = 0
    if (fdsToSave.length > 0) {
      const fdRows = fdsToSave.map(fd => ({
        user_id:       user!.id,
        name:          fd.name,
        bank_name:     result.bank_name,
        principal:     fd.principal,
        interest_rate: fd.interest_rate,
        start_date:    fd.start_date,
        maturity_date: fd.maturity_date,
        maturity_amt:  fd.maturity_amt,
        currency:      fd.currency,
        country,
        is_active:     fd.is_active,
      }))

      const { data: existingFDs } = await supabase
        .from('fixed_deposits')
        .select('principal, start_date, interest_rate')
        .eq('user_id', user!.id)

      const existingFDKeys = new Set(
        (existingFDs ?? []).map((e: any) =>
          `${Math.round(Number(e.principal))}|${e.start_date}|${Number(e.interest_rate)}`
        )
      )
      const newFDRows = fdRows.filter(fd =>
        !existingFDKeys.has(`${Math.round(fd.principal)}|${fd.start_date}|${Number(fd.interest_rate)}`)
      )
      if (newFDRows.length > 0) {
        const { error: fdErr } = await supabase.from('fixed_deposits').insert(newFDRows)
        if (fdErr) {
          setSaveError(`Could not save fixed deposits: ${fdErr.message}`)
          setStage('error')
          return
        }
        savedFDs = newFDRows.length
      }
    }

    setSavedCount(savedTxnCount)
    setSavedFDCount(savedFDs)
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

  function updateTxn(i: number, field: 'category' | 'txn_type', val: string) {
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
  const selectedCount  = result?.transactions.filter(t => t.selected).length ?? 0
  const expenseCount   = result?.transactions.filter(t => t.selected && t.txn_type === 'expense').length ?? 0
  const incomeCount    = result?.transactions.filter(t => t.selected && t.txn_type === 'income').length ?? 0
  const transferCount  = result?.transactions.filter(t => t.selected && t.txn_type === 'transfer').length ?? 0
  const loanCount      = result?.transactions.filter(t => t.selected && t.txn_type === 'loan').length ?? 0
  const fdCount        = confirmedFDs.filter(fd => fd.confirmed).length

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col"
        style={{ background: '#fff', border: '1px solid var(--border)', boxShadow: '0 8px 40px rgba(0,0,0,0.15)' }}>

        {/* Header */}
        <div className="flex justify-between items-center px-6 py-4 border-b flex-shrink-0"
          style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-2">
            <Landmark size={18} style={{ color: 'var(--sage)' }} />
            <h2 className="text-[15px] font-bold" style={{ color: 'var(--text)' }}>Bank Statement</h2>
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
                  borderColor: isDragActive ? 'var(--sage)' : 'var(--border)',
                  background:  isDragActive ? 'var(--sage-bg)' : 'var(--bg2)',
                }}>
                <input {...getInputProps()} />
                <Landmark size={28} className="mx-auto mb-2" style={{ color: 'var(--text3)' }} />
                <div className="text-[13px] font-semibold" style={{ color: 'var(--text)' }}>
                  {isDragActive ? 'Drop your statement here' : 'Drag & drop or click to select PDF'}
                </div>
                <div className="text-[11px] mt-1" style={{ color: 'var(--text3)' }}>
                  Password-protected PDFs are supported
                </div>
              </div>

              {file && (
                <div className="flex items-center gap-2 p-3 rounded-lg" style={{ background: 'var(--bg2)' }}>
                  <FileText size={16} style={{ color: 'var(--sage)' }} />
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
                  style={{ background: 'var(--sage)' }}>
                  <Upload size={14} />
                  Upload & Parse
                </button>
              </div>
            </div>
          )}

          {/* DETECTING */}
          {stage === 'detecting' && (
            <div className="flex flex-col items-center py-12 gap-3">
              <Loader2 size={32} className="animate-spin" style={{ color: 'var(--sage)' }} />
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
                  style={{ color: 'var(--text3)' }}>PDF Password</label>
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
                  style={{ background: 'var(--sage)' }}>
                  <Lock size={14} />
                  Unlock & Parse
                </button>
              </div>
            </div>
          )}

          {/* PARSING */}
          {stage === 'parsing' && (
            <div className="flex flex-col items-center py-12 gap-3">
              <Loader2 size={32} className="animate-spin" style={{ color: 'var(--sage)' }} />
              <div className="text-[13px] font-semibold" style={{ color: 'var(--text)' }}>Parsing transactions…</div>
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
                    <strong>{duplicateCount} transaction{duplicateCount !== 1 ? 's' : ''} already imported</strong> — pre-deselected.
                    Re-check them to save again.
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

              {/* Account summary */}
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-[13px] font-bold" style={{ color: 'var(--text)' }}>
                    {result.bank_name}{result.account_last4 ? ` ••••${result.account_last4}` : ''}
                    <span className="ml-2 text-[10px] font-normal px-1.5 py-0.5 rounded"
                      style={{ background: 'var(--bg2)', color: 'var(--text3)' }}>
                      {result.account_type === 'current' ? 'Current' : 'Savings'} · {result.currency}
                    </span>
                  </div>
                  <div className="text-[11px] mt-0.5" style={{ color: 'var(--text3)' }}>
                    {result.transactions.length} total · {expenseCount} expenses · {incomeCount} income
                    {transferCount > 0 ? ` · ${transferCount} transfers` : ''}
                    {loanCount > 0 ? ` · ${loanCount} loans` : ''}
                    {result.closing_balance != null && (
                      <span className="ml-2">· Balance: <strong style={{ color: 'var(--text)' }}>{sym}{Number(result.closing_balance).toLocaleString('en-IN')}</strong></span>
                    )}
                  </div>
                </div>
                <div className="flex gap-1.5">
                  <button onClick={() => selectAll(true)}
                    className="text-[10px] px-2.5 py-1 rounded font-medium"
                    style={{ background: 'var(--bg2)', color: 'var(--text3)' }}>All</button>
                  <button onClick={() => selectAll(false)}
                    className="text-[10px] px-2.5 py-1 rounded font-medium"
                    style={{ background: 'var(--bg2)', color: 'var(--text3)' }}>None</button>
                </div>
              </div>

              {/* Transaction table */}
              <div className="rounded-xl overflow-hidden border" style={{ borderColor: 'var(--border)' }}>
                <div className="overflow-y-auto" style={{ maxHeight: 300 }}>
                  <table className="w-full text-[11px]">
                    <thead className="sticky top-0" style={{ background: 'var(--bg2)' }}>
                      <tr>
                        {['', 'Date', 'Merchant', 'Amount', 'Category', 'Type', ''].map((h, i) => (
                          <th key={i} className="px-2 py-2 text-left font-semibold" style={{ color: 'var(--text3)' }}>{h}</th>
                        ))}
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
                              className="cursor-pointer" style={{ accentColor: 'var(--sage)' }} />
                          </td>
                          <td className="px-2 py-2 whitespace-nowrap font-mono text-[10px]" style={{ color: 'var(--text3)' }}>
                            {t.date}
                          </td>
                          <td className="px-2 py-2" style={{ maxWidth: 160 }}>
                            <div className="flex items-center gap-1.5">
                              <span className="truncate font-medium" style={{ color: 'var(--text)' }}>{t.merchant}</span>
                              {t.isDuplicate && (
                                <span className="text-[9px] px-1.5 py-0.5 rounded font-semibold flex-shrink-0"
                                  style={{ background: '#FEF3C7', color: '#92400E' }}>dup</span>
                              )}
                              {t.autoCat && !t.isDuplicate && (
                                <span className="text-[9px] px-1.5 py-0.5 rounded font-semibold flex-shrink-0"
                                  title="Auto-categorized from your past entries"
                                  style={{ background: 'var(--sage-bg)', color: 'var(--sage)' }}>auto</span>
                              )}
                            </div>
                            {t.description && t.description !== t.merchant && (
                              <div className="truncate text-[10px]" style={{ color: 'var(--text3)' }}>{t.description}</div>
                            )}
                          </td>
                          <td className="px-2 py-2 text-right font-semibold whitespace-nowrap"
                            style={{ color: t.txn_type === 'expense' ? 'var(--rose)' : t.txn_type === 'transfer' ? 'var(--blue)' : 'var(--income)' }}>
                            {t.txn_type === 'expense' ? '-' : '+'}{sym}{t.amount.toLocaleString('en-IN')}
                          </td>
                          <td className="px-2 py-2">
                            <select value={t.category} onChange={e => {
                                const cat = e.target.value
                                updateTxn(i, 'category', cat)
                                if (['Transfer','Family Transfer','Loan Received','Loan Taken','International Transfer','NRE Received','NRE to NRO','NRO to Family','Self Transfer'].includes(cat)) updateTxn(i, 'txn_type', 'transfer')
                                else if (cat === 'Loan on Card' || cat === 'EMI/Loan') updateTxn(i, 'txn_type', 'loan')
                                else if (['Salary','Interest','Dividend','Rental','Bonus','Tax Refund','Freelance','Gift','NRI Transfer'].includes(cat)) updateTxn(i, 'txn_type', 'income')
                                else if (['Food','Shopping','Utilities','Transport','Health','Personal Care','Entertainment','Travel','Education','Subscription'].includes(cat)) updateTxn(i, 'txn_type', 'expense')
                              }}
                              className="text-[10px] px-1.5 py-1 rounded border w-full"
                              style={{ borderColor: 'var(--border)', background: 'var(--bg2)', color: 'var(--text)' }}>
                              <optgroup label="Spending">
                                {['Food','Shopping','Utilities','Transport','Health','Personal Care','Entertainment','Travel','Education','Subscription'].map(c => <option key={c}>{c}</option>)}
                              </optgroup>
                              <optgroup label="Income">
                                {['Salary','Interest','Dividend','Rental','Bonus','Tax Refund','Freelance','Gift','NRI Transfer'].map(c => <option key={c}>{c}</option>)}
                              </optgroup>
                              <optgroup label="Transfers">
                                <option>Transfer</option>
                                <option>International Transfer</option>
                                <option>NRE Received</option>
                                <option>NRE to NRO</option>
                                <option>NRO to Family</option>
                                <option>Self Transfer</option>
                                <option>Family Transfer</option>
                              </optgroup>
                              <optgroup label="Payments">
                                <option>Credit Card Payment</option>
                              </optgroup>
                              <optgroup label="Loans">
                                <option>Loan on Card</option>
                                <option>EMI/Loan</option>
                                <option>Loan Received</option>
                                <option>Loan Taken</option>
                              </optgroup>
                              <optgroup label="Other">
                                {['Investment','Refund','Other'].map(c => <option key={c}>{c}</option>)}
                              </optgroup>
                            </select>
                          </td>
                          <td className="px-2 py-2">
                            <select value={t.txn_type} onChange={e => updateTxn(i, 'txn_type', e.target.value)}
                              className="text-[10px] px-1.5 py-1 rounded border"
                              style={{ borderColor: 'var(--border)', background: 'var(--bg2)', color: 'var(--text)' }}>
                              <option value="expense">Expense</option>
                              <option value="income">Income</option>
                              <option value="transfer">Transfer</option>
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

              {/* Fixed Deposits / Saving Spaces section */}
              {confirmedFDs.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <PiggyBank size={15} style={{ color: 'var(--sage)' }} />
                    <span className="text-[12px] font-bold" style={{ color: 'var(--text)' }}>
                      {result.is_wio ? 'Saving Spaces' : 'Fixed Deposits'} Detected
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                      style={{ background: 'var(--sage-bg)', color: 'var(--sage)' }}>
                      {confirmedFDs.length} found
                    </span>
                  </div>
                  <div className="text-[11px]" style={{ color: 'var(--text3)' }}>
                    Select the ones you want to add to your Fixed Deposits.
                  </div>
                  <div className="space-y-2">
                    {confirmedFDs.map((fd, i) => (
                      <div key={i}
                        className="flex items-start gap-3 p-3 rounded-xl border transition-all cursor-pointer"
                        style={{
                          borderColor: fd.confirmed ? 'var(--sage)' : 'var(--border)',
                          background: fd.confirmed ? 'var(--sage-bg)' : 'var(--bg2)',
                          opacity: fd.confirmed ? 1 : 0.5,
                        }}
                        onClick={() => toggleFD(i)}>
                        <input type="checkbox" checked={fd.confirmed} onChange={() => toggleFD(i)}
                          className="mt-0.5 cursor-pointer" style={{ accentColor: 'var(--sage)' }} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[12px] font-semibold" style={{ color: 'var(--text)' }}>
                              {fd.name}
                            </span>
                            {!fd.is_active && (
                              <span className="text-[9px] px-1.5 py-0.5 rounded font-semibold"
                                style={{ background: '#FEE2E2', color: '#991B1B' }}>Matured</span>
                            )}
                            <span className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                              style={{ background: '#D1FAE5', color: '#065F46' }}>
                              {fd.interest_rate}% p.a.
                            </span>
                            {fd.duration_months && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                                style={{ background: 'var(--bg2)', color: 'var(--text3)', border: '1px solid var(--border)' }}>
                                {fd.duration_months >= 12
                                  ? `${Math.floor(fd.duration_months / 12)}y${fd.duration_months % 12 ? ` ${fd.duration_months % 12}m` : ''}`
                                  : `${fd.duration_months}m`}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 mt-1 flex-wrap">
                            <span className="text-[11px] font-semibold" style={{ color: 'var(--text)' }}>
                              Principal: {fd.currency} {fd.principal.toLocaleString('en-IN')}
                            </span>
                            {fd.maturity_amt && (
                              <span className="text-[11px]" style={{ color: 'var(--income)' }}>
                                Maturity: {fd.currency} {fd.maturity_amt.toLocaleString('en-IN')}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 mt-0.5">
                            <span className="text-[10px]" style={{ color: 'var(--text3)' }}>
                              Open: {fd.start_date}
                            </span>
                            <span className="text-[10px]" style={{ color: 'var(--text3)' }}>
                              Matures: {fd.maturity_date}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex gap-3">
                <button onClick={() => { setStage('idle'); setResult(null); setConfirmedFDs([]) }}
                  className="flex-1 py-2.5 rounded-lg border text-[12px] font-semibold"
                  style={{ borderColor: 'var(--border)', color: 'var(--text3)', background: 'var(--bg2)' }}>
                  Re-upload
                </button>
                <button
                  onClick={save}
                  disabled={selectedCount === 0 && fdCount === 0}
                  className="flex-1 py-2.5 rounded-lg text-white text-[12px] font-bold flex items-center justify-center gap-2 disabled:opacity-40"
                  style={{ background: 'var(--sage)' }}>
                  <CheckCircle2 size={14} />
                  Save {selectedCount > 0 ? `${selectedCount} Txn${selectedCount !== 1 ? 's' : ''}` : ''}
                  {selectedCount > 0 && fdCount > 0 ? ' + ' : ''}
                  {fdCount > 0 ? `${fdCount} FD${fdCount !== 1 ? 's' : ''}` : ''}
                </button>
              </div>
            </div>
          )}

          {/* SAVING */}
          {stage === 'saving' && (
            <div className="flex flex-col items-center py-12 gap-3">
              <Loader2 size={32} className="animate-spin" style={{ color: 'var(--sage)' }} />
              <div className="text-[13px]" style={{ color: 'var(--text)' }}>Saving…</div>
            </div>
          )}

          {/* DONE */}
          {stage === 'done' && (
            <div className="flex flex-col items-center py-10 gap-3">
              <CheckCircle2 size={40} style={{ color: 'var(--income)' }} />
              <div className="text-[15px] font-bold" style={{ color: 'var(--text)' }}>
                {savedCount > 0 || savedFDCount > 0 ? 'Statement Imported!' : 'Nothing New to Import'}
              </div>
              <div className="text-[12px] text-center" style={{ color: 'var(--text3)' }}>
                {savedCount > 0 && (
                  <div>{savedCount} transaction{savedCount !== 1 ? 's' : ''} saved</div>
                )}
                {savedFDCount > 0 && (
                  <div>{savedFDCount} fixed deposit{savedFDCount !== 1 ? 's' : ''} added</div>
                )}
                {savedCount === 0 && savedFDCount === 0 && (
                  <div>All transactions from this statement were already imported.</div>
                )}
              </div>
              {savedRange && (
                <div className="text-center px-4 py-3 rounded-xl w-full text-[11px]"
                  style={{ background: 'var(--sage-bg)', color: 'var(--sage)', border: '1px solid var(--sage)' }}>
                  ✓ Date range auto-set to <strong>{savedRange.from}</strong> → <strong>{savedRange.to}</strong>
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
              <div className="text-[13px] font-semibold" style={{ color: 'var(--text)' }}>Something went wrong</div>
              <div className="text-[11px] text-center max-w-xs" style={{ color: 'var(--text3)' }}>
                {saveError ?? errorMsg}
              </div>
              <button onClick={() => { setStage('idle'); setSaveError(null) }}
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
