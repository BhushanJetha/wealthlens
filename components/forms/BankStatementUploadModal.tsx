'use client'
import { useState, useCallback, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { fetchAll } from '@/lib/supabase/fetchAll'
import { buildCategoryMemory } from '@/lib/categoryMemory'
import { useViewStore } from '@/store/viewStore'
import { useCategoryStore } from '@/store/categoryStore'
import { Upload, CheckCircle2, Lock, Landmark, PiggyBank } from 'lucide-react'
import { useDropzone } from 'react-dropzone'
import { ImportSheet, BankField, DropZone, PasswordStep, Working, Notice, ResultState, ReviewSummary, ReviewRow, rowSelect, rowSelectStyle, type ImportStage } from './StatementImport'

interface Props { onClose: () => void }

type Stage = ImportStage

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
  'Food','Shopping','Utilities','Travel & transport','Health','Entertainment',
  'Education','Subscription','Investment','Loan on Card','EMI/Loan',
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
  // The user's categories for the review dropdowns (names in both lists, like
  // Refund / Other, and loan / card ones sit in their own groups below)
  const { rows: userCats, load: loadCats } = useCategoryStore()
  useEffect(() => { loadCats() }, [loadCats])
  const { spendCats, incomeCats } = useMemo(() => {
    const exp = userCats.filter(c => c.kind === 'expense').map(c => c.name)
    const inc = userCats.filter(c => c.kind === 'income').map(c => c.name)
    const grouped = new Set(['Credit Card Payment', 'Loan on Card', 'EMI/Loan', 'Family Transfer', 'Loan Taken', ...exp.filter(n => inc.includes(n))])
    return { spendCats: exp.filter(n => !grouped.has(n)), incomeCats: inc.filter(n => !grouped.has(n)) }
  }, [userCats])
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
        const { data: existing } = await fetchAll((a, b) => supabase
          .from('transactions')
          .select('txn_date, merchant, amount')
          .eq('user_id', user.id)
          .eq('currency', data.currency)
          .gte('txn_date', dates[0])
          .lte('txn_date', dates[dates.length - 1])
          .order('txn_date').order('id').range(a, b))

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
    // The statement's closing balance is the balance on its last day (lib/ledger
    // adds transactions after this date)
    const lastDate = result.transactions.map(t => t.date).filter(Boolean).sort().pop() ?? new Date().toISOString().slice(0, 10)
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
      // Never fall back onto a credit card — a bank statement would otherwise
      // rename the card and overwrite its last-4 / balance.
      const { data } = await supabase.from('accounts').select('id')
        .eq('user_id', user!.id).eq('currency', result.currency).ilike('bank_name', result.bank_name)
        .neq('account_type', 'credit_card').limit(1)
      existingId = data?.[0]?.id ?? null
    }

    let accountId: string | null = null

    if (existingId) {
      accountId = existingId
      const updates: Record<string, any> = { name: accountName }
      if (result.account_last4) updates.last_four = result.account_last4
      if (result.closing_balance != null) { updates.current_balance = result.closing_balance; updates.balance_as_of = lastDate }
      const { error: upErr } = await supabase.from('accounts').update(updates).eq('id', accountId)
      if (upErr && updates.balance_as_of) { delete updates.balance_as_of; await supabase.from('accounts').update(updates).eq('id', accountId) }
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
          ...(result.closing_balance != null ? { balance_as_of: lastDate } : {}),
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
          : cat === 'Self Transfer'        ? 'Own'
          : cat === 'NRO to NRE'           ? 'NRO to NRE'
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

  const monthLabel = (m: string) => new Date(`${m}-01T00:00:00`).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })
  const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`
  const saveLabel = selectedCount > 0
    ? `Save ${plural(selectedCount, 'row')}${fdCount > 0 ? ` + ${plural(fdCount, 'FD')}` : ''}`
    : fdCount > 0 ? `Save ${plural(fdCount, 'fixed deposit')}` : 'Save'
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
      <button onClick={() => { setStage('idle'); setResult(null); setConfirmedFDs([]) }} className="wl-btn" style={btn}>Start over</button>
      <button onClick={save} disabled={selectedCount === 0 && fdCount === 0} className="wl-btn wl-btn-primary flex-1 disabled:opacity-50" style={primary}><CheckCircle2 size={15} />{saveLabel}</button>
    </>
    : stage === 'done' ? <button onClick={onClose} className="wl-btn wl-btn-primary flex-1" style={primary}>Done</button>
    : stage === 'error' ? <>
      <button onClick={onClose} className="wl-btn" style={btn}>Close</button>
      <button onClick={() => { setStage('idle'); setSaveError(null) }} className="wl-btn wl-btn-primary flex-1" style={primary}>Try again</button>
    </>
    : undefined

  return (
    <ImportSheet icon={Landmark} color="#3B8EF0" title="Bank statement" stage={stage} onClose={onClose} footer={footer}
      hint="A PDF from your bank. Every row comes back for you to check before it’s saved.">

      {stage === 'idle' && (
        <div className="flex flex-col gap-4">
          <BankField value={bank} onChange={setBank} banks={BANKS} />
          <DropZone root={getRootProps()} input={getInputProps()} active={isDragActive} file={file} onClear={() => setFile(null)} what="bank statement" />
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
            title={`${result.bank_name}${result.account_last4 ? ` ••••${result.account_last4}` : ''}`}
            tags={[result.account_type === 'current' ? 'Current account' : 'Savings account', result.currency]}
            facts={[
              { label: 'Ticked to save', value: `${selectedCount} of ${result.transactions.length}` },
              { label: 'Spending', value: String(expenseCount) },
              { label: 'Money in', value: String(incomeCount) },
              result.closing_balance != null
                ? { label: 'Closing balance', value: `${sym}${Number(result.closing_balance).toLocaleString('en-IN')}` }
                : { label: 'Transfers & loans', value: String(transferCount + loanCount) },
            ]}
            onAll={() => selectAll(true)} onNone={() => selectAll(false)} />

          {result.transactions.length === 0 ? <Notice>No transactions were found in this PDF.</Notice> : (
            <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--line)' }}>
              {result.transactions.map((t, i) => (
                <ReviewRow key={i} t={t} sym={sym} first={i === 0} onToggle={() => toggleTxn(i)} onRemove={() => removeTxn(i)}
                  category={
                    <select value={t.category} aria-label="Category" className={rowSelect} style={rowSelectStyle} onChange={e => {
                        const cat = e.target.value
                        updateTxn(i, 'category', cat)
                        if (['Transfer','Family Transfer','Loan Received','Loan Taken','International Transfer','NRE to NRO','NRO to Family','Self Transfer'].includes(cat)) updateTxn(i, 'txn_type', 'transfer')
                        else if (cat === 'Loan on Card' || cat === 'EMI/Loan') updateTxn(i, 'txn_type', 'loan')
                        else if (incomeCats.includes(cat)) updateTxn(i, 'txn_type', 'income')
                        else if (spendCats.includes(cat)) updateTxn(i, 'txn_type', 'expense')
                      }}>
                      {t.category && ![...spendCats, ...incomeCats, 'Transfer', 'International Transfer', 'NRE to NRO', 'NRO to Family', 'Self Transfer', 'Family Transfer', 'Credit Card Payment', 'Loan on Card', 'EMI/Loan', 'Loan Received', 'Loan Taken', 'Refund', 'Other'].includes(t.category) && <option>{t.category}</option>}
                      <optgroup label="Spending">
                        {spendCats.map(c => <option key={c}>{c}</option>)}
                      </optgroup>
                      <optgroup label="Income">
                        {incomeCats.map(c => <option key={c}>{c}</option>)}
                      </optgroup>
                      <optgroup label="Transfers">
                        <option>Transfer</option>
                        <option>International Transfer</option>
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
                        {['Refund','Other'].map(c => <option key={c}>{c}</option>)}
                      </optgroup>
                    </select>
                  }
                  type={
                    <select value={t.txn_type} onChange={e => updateTxn(i, 'txn_type', e.target.value)} aria-label="Type" className={rowSelect} style={rowSelectStyle}>
                      <option value="expense">Expense</option>
                      <option value="income">Income</option>
                      <option value="transfer">Transfer</option>
                      <option value="loan">Loan</option>
                    </select>
                  } />
              ))}
            </div>
          )}

          {/* Fixed deposits / Wio Saving Spaces found in the statement */}
          {confirmedFDs.length > 0 && (
            <div className="flex flex-col gap-2 mt-1">
              <div className="flex items-center gap-2">
                <PiggyBank size={16} style={{ color: 'var(--accent)' }} />
                <span className="text-[14px] font-bold" style={{ color: 'var(--text)' }}>{result.is_wio ? 'Saving Spaces' : 'Fixed deposits'} found · {confirmedFDs.length}</span>
              </div>
              <div className="text-[12px] -mt-1" style={{ color: 'var(--text3)' }}>Tick the ones to add to your fixed deposits.</div>
              {confirmedFDs.map((fd, i) => (
                <label key={i} className="flex items-start gap-3 rounded-2xl p-3.5 cursor-pointer transition-colors"
                  style={{ border: `1.5px solid ${fd.confirmed ? 'var(--accent-border)' : 'var(--line)'}`, background: fd.confirmed ? 'var(--accent-bg)' : '#fff', opacity: fd.confirmed ? 1 : 0.6 }}>
                  <input type="checkbox" checked={fd.confirmed} onChange={() => toggleFD(i)} className="mt-0.5 flex-shrink-0" style={{ width: 18, height: 18, accentColor: 'var(--accent)' }} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[13.5px] font-semibold" style={{ color: 'var(--text)' }}>{fd.name}</span>
                      <span className="rounded-full px-2 py-px text-[11px] font-semibold" style={{ background: '#E7F7EF', color: '#1E8F5F' }}>{fd.interest_rate}% a year</span>
                      {fd.duration_months && (
                        <span className="rounded-full px-2 py-px text-[11px] font-semibold" style={{ background: '#fff', border: '1px solid var(--line)', color: 'var(--text3)' }}>
                          {fd.duration_months >= 12
                            ? `${Math.floor(fd.duration_months / 12)}y${fd.duration_months % 12 ? ` ${fd.duration_months % 12}m` : ''}`
                            : `${fd.duration_months}m`}
                        </span>
                      )}
                    </div>
                    <div className="text-[12.5px] mt-1" style={{ color: 'var(--text2)' }}>
                      {fd.currency} {fd.principal.toLocaleString('en-IN')}
                      {fd.maturity_amt ? <> → <span className="font-semibold" style={{ color: '#1E8F5F' }}>{fd.currency} {fd.maturity_amt.toLocaleString('en-IN')}</span> at maturity</> : null}
                    </div>
                    <div className="text-[11.5px] mt-0.5" style={{ color: 'var(--text4)' }}>Opened {fd.start_date} · matures {fd.maturity_date}</div>
                  </div>
                </label>
              ))}
            </div>
          )}
        </div>
      )}

      {stage === 'saving' && <Working title="Saving…" />}

      {stage === 'done' && (
        <ResultState ok title={savedCount > 0 || savedFDCount > 0 ? 'Statement imported' : 'Nothing new to import'}>
          {savedCount > 0 && <span>{plural(savedCount, 'transaction')} saved.</span>}
          {savedFDCount > 0 && <span>{plural(savedFDCount, 'fixed deposit')} added.</span>}
          {savedCount === 0 && savedFDCount === 0 && <span>Every row in this statement was already in the app.</span>}
          {savedRange && <span>Your pages now show {savedRange.from === savedRange.to ? monthLabel(savedRange.from) : `${monthLabel(savedRange.from)} – ${monthLabel(savedRange.to)}`}.</span>}
        </ResultState>
      )}

      {stage === 'error' && <ResultState ok={false} title="That didn’t work">{saveError ?? errorMsg}</ResultState>}
    </ImportSheet>
  )
}
