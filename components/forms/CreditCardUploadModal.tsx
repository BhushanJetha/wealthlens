'use client'
import { addDaysTo } from '@/lib/insights'
import { useState, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { buildCategoryMemory } from '@/lib/categoryMemory'
import { useViewStore } from '@/store/viewStore'
import { useCategoryStore } from '@/store/categoryStore'
import { Upload, CheckCircle2, Lock, CreditCard } from 'lucide-react'
import { useDropzone } from 'react-dropzone'
import { cardPartOfStatement } from '@/lib/cardLoans'
import { ImportSheet, BankField, DropZone, PasswordStep, Working, Notice, ResultState, ReviewSummary, ReviewRow, rowSelect, rowSelectStyle, dayLabel, type ImportStage } from './StatementImport'

interface Props { onClose: () => void }

type Stage = ImportStage

interface ParsedTxn {
  date: string
  merchant: string
  description: string
  amount: number
  txn_type: 'expense' | 'income' | 'transfer' | 'loan'
  category: string
  selected: boolean
  isDuplicate?: boolean
  autoCat?: boolean
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
  'Food','Shopping','Utilities','Travel & transport','Health',
  'Entertainment','Education','Subscription',
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

// A card-loan EMI the app already recorded on its EMI day (lib/loanAuto) shows
// up again on the statement a few days later, under the bank's own wording —
// the same amount within a week is the same EMI, not a second one
const EMI_CATS = new Set(['Loan on Card', 'EMI/Loan'])
function emiAlready(t: { date: string; amount: number; category?: string }, existing: { txn_date: string; amount: number; category?: string | null }[]) {
  if (!EMI_CATS.has(String(t.category ?? ''))) return false
  return existing.some(e => EMI_CATS.has(String(e.category ?? '')) && Math.abs(Number(e.amount) - Number(t.amount)) <= Math.max(1, Number(t.amount) * 0.01)
    && Math.abs(Date.parse(e.txn_date) - Date.parse(t.date)) <= 8 * 864e5)
}

export default function CreditCardUploadModal({ onClose }: Props) {
  // The user's expense categories (plus Transfer) for the review dropdowns
  const { rows: userCats, load: loadCats } = useCategoryStore()
  useEffect(() => { loadCats() }, [loadCats])
  const cardCats = [...userCats.filter(c => c.kind === 'expense').map(c => c.name), 'Transfer']
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

      const { data: { user } } = await supabase.auth.getUser()

      // Smart categorization — reuse the category you previously chose for the same merchant
      if (user) {
        const mem = await buildCategoryMemory(supabase, user.id)
        if (mem.has) rawTxns.forEach(t => { if (mem.apply(t)) t.autoCat = true })
      }

      // Check for duplicates against existing transactions in the same date range
      let txns = rawTxns
      let dupCount = 0
      if (rawTxns.length > 0 && user) {
        const dates   = rawTxns.map(t => t.date).sort()
        const minDate = dates[0]
        const maxDate = dates[dates.length - 1]
        const { data: existing } = await supabase
          .from('transactions')
          .select('txn_date, merchant, amount, category')
          .eq('user_id', user.id)
          .eq('currency', data.currency)
          .gte('txn_date', addDaysTo(minDate, -8))
          .lte('txn_date', addDaysTo(maxDate, 8))

        // Match on date + amount only — robust to merchant renames, re-categorisation,
        // and charges first saved via a different parser (so all already-imported rows
        // are detected, not just the ones whose merchant text matches exactly).
        const existingKeys = new Set(
          (existing ?? []).map(e => `${e.txn_date}|${Math.round(Number(e.amount) * 100)}`)
        )
        txns = rawTxns.map(t => {
          const isDuplicate = existingKeys.has(`${t.date}|${Math.round(Number(t.amount) * 100)}`) || emiAlready(t, existing ?? [])
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
    // The statement's outstanding is as of its last day (lib/ledger adds later spends)
    const lastDate = result.transactions.map(t => t.date).filter(Boolean).sort().pop() ?? new Date().toISOString().slice(0, 10)

    // Final dedup: re-check against DB in case user checked a flagged duplicate
    const dates   = selected.map(t => t.date).sort()
    const minDate = dates[0]
    const maxDate = dates[dates.length - 1]
    const { data: existing } = await supabase
      .from('transactions')
      .select('txn_date, merchant, amount, category')
      .eq('user_id', user!.id)
      .eq('currency', result.currency)
      .gte('txn_date', addDaysTo(minDate, -8))
      .lte('txn_date', addDaysTo(maxDate, 8))

    const existingKeys = new Set(
      (existing ?? []).map(e => `${e.txn_date}|${Math.round(Number(e.amount) * 100)}`)
    )
    const deduped = selected.filter(t =>
      !existingKeys.has(`${t.date}|${Math.round(Number(t.amount) * 100)}`) && !emiAlready(t, existing ?? [])
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
      // (a card whose balance includes its loans keeps only the card part — the loans are in Loans)
      if (result.outstanding_bal != null) { updates.outstanding_bal = await cardPartOfStatement(supabase, accountId!, result.outstanding_bal, lastDate); updates.balance_as_of = lastDate }
      if (result.minimum_due     != null) updates.minimum_due     = result.minimum_due
      // The statement's due date also sets the card's due day (the month rolls on from it)
      if (result.due_date        != null) { updates.due_date = result.due_date; updates.due_day = Number(String(result.due_date).slice(8, 10)) || null }
      let { error: upErr } = await supabase.from('accounts').update(updates).eq('id', accountId)
      for (const col of ['due_day', 'balance_as_of']) {
        if (upErr && col in updates) { delete updates[col]; ({ error: upErr } = await supabase.from('accounts').update(updates).eq('id', accountId)) }
      }
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
          ...(result.outstanding_bal != null ? { balance_as_of: lastDate } : {}),
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

  const monthLabel = (m: string) => new Date(`${m}-01T00:00:00`).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })
  const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`
  const money = (n: number) => `${sym}${Number(n).toLocaleString('en-IN')}`
  const btn = { height: 44, padding: '0 18px' }
  const primary = { height: 44, fontSize: 14 }

  const footer =
    stage === 'idle' ? <>
      <button onClick={onClose} className="wl-btn" style={btn}>Cancel</button>
      <button onClick={() => submit()} disabled={!file} className="wl-btn wl-btn-primary flex-1 disabled:opacity-50" style={primary}><Upload size={15} />Read statement</button>
    </>
    : stage === 'needs-password' ? <>
      <button onClick={() => { setStage('idle'); setPassword('') }} className="wl-btn" style={btn}>Change file</button>
      <button onClick={() => submit(password)} disabled={!password} className="wl-btn wl-btn-primary flex-1 disabled:opacity-50" style={primary}><Lock size={15} />Unlock and read</button>
    </>
    : stage === 'review' ? <>
      <button onClick={() => { setStage('idle'); setResult(null) }} className="wl-btn" style={btn}>Start over</button>
      <button onClick={save} disabled={selectedCount === 0} className="wl-btn wl-btn-primary flex-1 disabled:opacity-50" style={primary}><CheckCircle2 size={15} />Save {plural(selectedCount, 'row')}</button>
    </>
    : stage === 'done' ? <button onClick={onClose} className="wl-btn wl-btn-primary flex-1" style={primary}>Done</button>
    : stage === 'error' ? <>
      <button onClick={onClose} className="wl-btn" style={btn}>Close</button>
      <button onClick={() => setStage('idle')} className="wl-btn wl-btn-primary flex-1" style={primary}>Try again</button>
    </>
    : undefined

  return (
    <ImportSheet icon={CreditCard} color="#6A55E8" title="Credit card statement" stage={stage} onClose={onClose} footer={footer}
      hint="A PDF from your card. Every row comes back for you to check before it’s saved.">

      {stage === 'idle' && (
        <div className="flex flex-col gap-4">
          <BankField value={bank} onChange={setBank} banks={BANKS} />
          <DropZone root={getRootProps()} input={getInputProps()} active={isDragActive} file={file} onClear={() => setFile(null)} what="card statement" />
        </div>
      )}

      {stage === 'detecting' && <Working title="Opening the PDF…" />}

      {stage === 'needs-password' && (
        <PasswordStep bank={detectedBank} hint={pwdHint} value={password} onChange={setPassword}
          show={showPwd} onShow={() => setShowPwd(p => !p)} wrong={wrongPwd} onSubmit={() => submit(password)} />
      )}

      {stage === 'parsing' && <Working title="Reading the transactions…" sub="Rule-based reader on our server, no AI" />}

      {stage === 'review' && result && (
        <div className="flex flex-col gap-3.5">
          {duplicateCount > 0 && (
            <Notice title={`${plural(duplicateCount, 'row is', 'rows are')} already in the app`}>They’re unticked. Tick one to save it again.</Notice>
          )}
          {parseWarning && <Notice>{parseWarning}</Notice>}

          <ReviewSummary
            title={`${result.card_name ?? result.bank_name}${result.card_last4 ? ` ••••${result.card_last4}` : ''}`}
            tags={['Credit card', result.currency]}
            facts={[
              { label: 'Ticked to save', value: `${selectedCount} of ${result.transactions.length}` },
              ...(result.outstanding_bal ? [{ label: 'Outstanding', value: money(result.outstanding_bal), color: 'var(--rose)' }] : []),
              ...(result.minimum_due ? [{ label: 'Minimum due', value: money(result.minimum_due), color: '#B96A0B' }] : []),
              ...(result.due_date ? [{ label: 'Pay by', value: dayLabel(result.due_date) }] : []),
              ...(result.credit_limit ? [{ label: 'Limit', value: money(result.credit_limit) }] : []),
            ]}
            onAll={() => selectAll(true)} onNone={() => selectAll(false)} />

          {result.transactions.length === 0 ? <Notice>No transactions were found in this PDF.</Notice> : (
            <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--line)' }}>
              {result.transactions.map((t, i) => (
                <ReviewRow key={i} t={t} sym={sym} first={i === 0} onToggle={() => toggleTxn(i)} onRemove={() => removeTxn(i)}
                  category={
                    <select value={t.category} onChange={e => updateTxn(i, 'category', e.target.value)} aria-label="Category" className={rowSelect} style={rowSelectStyle}>
                      {(cardCats.includes(t.category) ? cardCats : [t.category, ...cardCats]).map(c => <option key={c}>{c}</option>)}
                    </select>
                  }
                  type={
                    <select value={t.txn_type} onChange={e => updateTxn(i, 'txn_type', e.target.value as 'expense' | 'income' | 'transfer' | 'loan')} aria-label="Type" className={rowSelect} style={rowSelectStyle}>
                      <option value="expense">Expense</option>
                      <option value="income">Refund</option>
                      <option value="transfer">Card payment</option>
                      <option value="loan">Loan</option>
                    </select>
                  } />
              ))}
            </div>
          )}
        </div>
      )}

      {stage === 'saving' && <Working title="Saving…" />}

      {stage === 'done' && (
        <ResultState ok title={savedCount > 0 ? 'Statement imported' : 'Nothing new to import'}>
          {savedCount > 0
            ? <span>{plural(savedCount, 'transaction')} saved — they’re on the Expenses page.</span>
            : <span>Every row in this statement was already in the app.</span>}
          {savedRange && <span>Your pages now show {savedRange.from === savedRange.to ? monthLabel(savedRange.from) : `${monthLabel(savedRange.from)} – ${monthLabel(savedRange.to)}`}.</span>}
        </ResultState>
      )}

      {stage === 'error' && <ResultState ok={false} title="That didn’t work">{errorMsg}</ResultState>}
    </ImportSheet>
  )
}
