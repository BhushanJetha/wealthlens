'use client'
import { eventForDate, eventKind } from '@/lib/events'
import { fmtDay } from '@/lib/insights'
import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { X, Loader2, ArrowRight, RefreshCw, Plus, Settings2, Globe, ArrowLeftRight, Users, Banknote, CreditCard, Paperclip, Landmark } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useViewStore } from '@/store/viewStore'
import { useCategoryStore } from '@/store/categoryStore'
import { colorOf } from '@/lib/categories'
import { Segmented } from '@/components/ui/kit'
import { CategoryIcon } from '@/components/ui/CategoryIcon'
import { toast } from '@/components/ui/toaster'
import ManageCategoriesSheet from './ManageCategoriesSheet'
import { useFamily, holderOptions } from '@/hooks/useFamily'
import { RECEIPT_TYPES, uploadReceipt, openReceipt, removeReceipt } from '@/lib/receipts'

type TxnType = 'expense' | 'income' | 'transfer' | 'loan'

const TRANSFER_NOT_CATEGORIES = new Set(['Family Transfer', 'Credit Card Payment', 'Transfer'])
// Kinds of transfer, grouped: between your own accounts (a move — never
// spending or income) first, then money to others (counted as sent)
const TRANSFER_SUBTYPES = [
  { value: 'International',  group: 'own',    label: 'UAE → India',      desc: 'Send money home (AED → ₹)',      icon: Globe,          color: '#3B8EF0' },
  { value: 'Internal',       group: 'own',    label: 'NRE → NRO',        desc: 'For spending in India',          icon: ArrowLeftRight, color: '#6A55E8' },
  { value: 'Own',            group: 'own',    label: 'My other account', desc: 'Same country, e.g. ENBD → ADCB', icon: Landmark,       color: '#0E7490' },
  { value: 'Card bill',      group: 'own',    label: 'Card bill',        desc: 'Pay a credit card from a bank',  icon: CreditCard,     color: '#9333EA' },
  { value: 'ATM Withdrawal', group: 'own',    label: 'ATM cash',         desc: 'Bank to your cash wallet',       icon: Banknote,       color: '#0891B2' },
  { value: 'Family',         group: 'others', label: 'Family support',   desc: 'Allowance to family',            icon: Users,          color: '#2FB67C' },
]
const TRANSFER_GROUPS = [
  { key: 'own', label: 'Between your own accounts', note: 'not spending' },
  { key: 'others', label: 'To others', note: 'counted as money sent' },
]
// Kinds that move money into another of your accounts (pick which one)
const TO_ACCOUNT_KINDS = ['International', 'Internal', 'Own', 'Card bill']
// Kinds that only exist in one currency: UAE → India leaves in AED, NRE → NRO is ₹
const KIND_CURRENCY: Record<string, 'AED' | 'INR'> = { International: 'AED', Internal: 'INR', 'NRO to NRE': 'INR' }
export const kindFits = (kind: string, currency: string) => !KIND_CURRENCY[kind] || KIND_CURRENCY[kind] === currency
// How a bank payment was made (optional; else read from the description)
const PAY_MODES = [['upi', 'UPI'], ['netbanking', 'Net banking'], ['debit_card', 'Debit card'], ['transfer', 'Transfer'], ['autodebit', 'Auto-debit']] as const
// Loan categories are recorded as loan payments (they show under Loan payments)
const LOAN_CATS = new Set(['Loan on Card', 'EMI/Loan'])

const Label = ({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) => (
  <div className="flex items-center justify-between mb-1.5">
    <span className="text-[11px] font-semibold uppercase tracking-[0.05em]" style={{ color: 'var(--text3)' }}>{children}</span>
    {right}
  </div>
)
const ordinal = (n: number) => `${n}${n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th'}`
const FIELD = { height: 42, fontSize: 14, borderRadius: 9, background: '#F7F8FA', borderColor: '#E2E8F0' }

// Add, edit or duplicate a transaction (design v2: centred 460px dialog on
// desktop, bottom sheet on phones). Categories come from the user's own list.
export default function AddTransactionModal({ onClose, onAdded, defaults, edit, repeat }: {
  onClose: () => void
  repeat?: boolean                              // start with "Repeat every month" ticked
  onAdded?: () => void
  defaults?: Partial<{ txn_type: string; account_id: string; category: string; currency: string; sub_category: string; merchant: string; amount: string; txn_date: string; description: string; event_id: string }>
  edit?: { txn: any; duplicate?: boolean }     // edit (or copy) an existing transaction
}) {
  const { view } = useViewStore()
  const { rows: categories, load: loadCategories } = useCategoryStore()
  const t0 = edit?.txn
  const mode: 'add' | 'edit' | 'duplicate' = !edit ? 'add' : edit.duplicate ? 'duplicate' : 'edit'
  const [form, setForm] = useState(() => {
    const type = (t0?.txn_type ?? defaults?.txn_type ?? 'expense') as TxnType
    return {
      txn_date:     t0?.txn_date ?? defaults?.txn_date ?? new Date().toISOString().slice(0, 10),
      merchant:     t0?.merchant ?? defaults?.merchant ?? '',
      description:  t0 ? (t0.description && t0.description !== t0.merchant ? t0.description : '') : (defaults?.description ?? ''),
      category:     t0?.category ?? defaults?.category ?? (type === 'income' ? 'Salary' : type === 'transfer' ? 'Transfer' : 'Food'),
      sub_category: t0?.sub_category ?? defaults?.sub_category ?? '',
      amount:       t0 ? String(Math.abs(Number(t0.amount))) : (defaults?.amount ?? ''),
      currency:     t0?.currency ?? defaults?.currency ?? (view === 'uae' ? 'AED' : 'INR'),
      txn_type:     type,
      account_id:   t0?.account_id ?? defaults?.account_id ?? '',
      // The other account in a move (card bill → card, ATM → bank it came from…)
      counter_account_id: t0?.counter_account_id ?? '',
      payment_mode: t0?.payment_mode ?? '',
      holder_name:  t0?.holder_name ?? '',      // family member it was for ('' = household)
      event_id:     t0?.event_id ?? defaults?.event_id ?? '',   // the trip or event it belongs to ('' = none)
      tax_tag:      t0?.tax_tag ?? '',          // India tax section (Plan › Tax planner)
    }
  })
  const [accounts,    setAccounts]    = useState<any[]>([])
  const [saving,      setSaving]      = useState(false)
  const [error,       setError]       = useState('')
  const [liveRate,    setLiveRate]    = useState<number | null>(null)
  const [rateLoading, setRateLoading] = useState(false)
  const [rateDate,    setRateDate]    = useState<string | null>(null)
  const [manage,      setManage]      = useState(false)
  // Repeat every month (recurring_txns, migration 027) — new entries only
  const [repeatOn,    setRepeatOn]    = useState(!!repeat)
  const [repeatAuto,  setRepeatAuto]  = useState<'ask' | 'auto'>('ask')
  const [receiptFile, setReceiptFile] = useState<File | null>(null)
  const [receiptPath, setReceiptPath] = useState<string | null>(t0?.receipt_path ?? null)
  const [receiptMsg,  setReceiptMsg]  = useState('')
  const { members } = useFamily()
  // You, then each family member (you're always there, even if not in the family list)
  const forOpts = holderOptions(members)

  const supabase = createClient()
  const router   = useRouter()

  useEffect(() => { loadCategories() }, [loadCategories])
  // Open trips & events (migration 034): an expense inside one's dates is
  // tagged to it unless you choose otherwise
  const [events, setEvents] = useState<any[]>([])
  const [eventTouched, setEventTouched] = useState(!!(t0 || defaults?.event_id))
  useEffect(() => {
    supabase.from('spend_events').select('id,name,kind,start_date,end_date,closed_at').is('closed_at', null).order('start_date', { ascending: false }).limit(30)
      .then(({ data }: { data: any[] | null }) => setEvents(data ?? []), () => {})
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (eventTouched || form.txn_type !== 'expense') return
    const ev = eventForDate(events, form.txn_date)
    setForm(p => (p.event_id === (ev?.id ?? '') ? p : { ...p, event_id: ev?.id ?? '' }))
  }, [events, form.txn_date, form.txn_type, eventTouched])
  useEffect(() => {
    supabase.from('accounts').select('id,name,bank_name,currency,account_type').eq('is_active', true)
      .then(({ data }) => setAccounts(data ?? []))
  }, [])
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape' && !manage) onClose() }
    window.addEventListener('keydown', esc); return () => window.removeEventListener('keydown', esc)
  }, [onClose, manage])

  async function fetchLiveRate() {
    setRateLoading(true)
    try {
      const d = await (await fetch('/api/fx-rate')).json()
      setLiveRate(d.rate); setRateDate(d.date)
    } catch { setLiveRate(null) } finally { setRateLoading(false) }
  }
  useEffect(() => { if (form.currency === 'AED' && liveRate === null) fetchLiveRate() }, [form.currency])

  const set = (patch: Partial<typeof form>) => setForm(p => ({ ...p, ...patch }))
  const isTransfer = form.txn_type === 'transfer'
  const isIncome   = form.txn_type === 'income'
  const showTax    = form.txn_type === 'expense' && form.currency === 'INR'
  const catKind    = isIncome ? 'income' : 'expense'

  // The user's categories for this type, plus the current one if it isn't in the list (e.g. from an import)
  const cats = useMemo(() => {
    // Family support and card bills are kinds of transfer, and "Transfer" isn't a category — pick Type: Transfer
    const list = categories.filter(c => c.kind === catKind && !(catKind === 'expense' && TRANSFER_NOT_CATEGORIES.has(c.name)))
    return form.category && !list.some(c => c.name === form.category) && !isTransfer
      ? [{ id: 'current', kind: catKind, name: form.category, color: colorOf(categories, form.category), icon: 'tag', sort_order: -1 }, ...list]
      : list
  }, [categories, catKind, form.category, isTransfer])

  function setType(t: TxnType) {
    if (t === form.txn_type) return
    const kindCats = categories.filter(c => c.kind === (t === 'income' ? 'income' : 'expense'))
    const keep = t !== 'transfer' && kindCats.some(c => c.name === form.category)
    set({
      txn_type: t, sub_category: '',
      category: t === 'transfer' ? 'Transfer' : keep ? form.category
        : t === 'income' ? 'Salary' : t === 'loan' ? 'EMI/Loan' : 'Food',
      account_id: form.account_id === '__cash__' && t === 'transfer' ? '' : form.account_id,
    })
  }
  function setCategory(name: string) {
    // Loan categories are loan payments; leaving them makes it an expense again
    const txn_type: TxnType = LOAN_CATS.has(name) ? 'loan' : form.txn_type === 'loan' ? 'expense' : form.txn_type
    set({ category: name, txn_type })
  }
  function setTransferSubtype(sub: string) {
    const isAtm = sub === 'ATM Withdrawal', isBill = sub === 'Card bill'
    const autoMerchant = sub === 'International' ? 'Transfer to India' : sub === 'Internal' ? 'NRE to NRO' : sub === 'NRO to NRE' ? 'NRO to NRE'
      : sub === 'Own' ? 'Transfer to my account' : isAtm ? 'ATM Withdrawal' : isBill ? 'Credit card bill' : 'Family Transfer'
    setForm(p => ({
      ...p, sub_category: isBill ? '' : sub, counter_account_id: '',
      // Only a new, still-empty entry takes the kind's currency. An amount
      // that's there already keeps its own (relabelling ₹40,000 as AED 40,000
      // made it about ₹9 lakh everywhere).
      // ATM cash is a money movement into the Cash wallet; a card bill settles
      // card spends already counted — neither is spending
      category:   isAtm ? 'ATM Withdrawal' : isBill ? 'Credit Card Payment' : 'Transfer',
      account_id: isAtm ? '__cash__' : (p.account_id === '__cash__' ? '' : p.account_id),
      currency:   mode === 'add' && !p.amount && KIND_CURRENCY[sub] ? KIND_CURRENCY[sub] : p.currency,
      merchant:   p.merchant && !TRANSFER_SUBTYPES.some(x => x.label === p.merchant) ? p.merchant : autoMerchant,
    }))
  }
  const transferKind = form.category === 'Credit Card Payment' ? 'Card bill' : form.sub_category

  // Resolve the Cash sentinel to the wallet account, creating it (per currency) the first time
  async function resolveAccountId(): Promise<string | null> {
    if (form.account_id !== '__cash__') return form.account_id || null
    const existing = accounts.find(a => a.account_type === 'wallet' && a.currency === form.currency)
    if (existing) return existing.id
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Please sign in again')
    const { data, error: err } = await supabase.from('accounts').insert({
      user_id: user.id, name: 'Cash', bank_name: 'Cash', account_type: 'wallet',
      currency: form.currency, country: form.currency === 'AED' ? 'UAE' : 'India', outstanding_bal: 0,
    }).select('id').single()
    if (err || !data) throw new Error(err?.message || 'Could not create the Cash wallet')
    return data.id
  }

  async function save() {
    if (!(Number(form.amount) > 0)) { setError('Enter an amount above zero.'); return }
    if (!form.merchant.trim()) { setError(isTransfer ? 'Give the transfer a label.' : isIncome ? 'Who paid you? Add a source.' : 'Where did you spend it? Add a merchant.'); return }
    if (!form.txn_date) { setError('Pick a date.'); return }
    if (isTransfer && !transferKind) { setError('Choose the kind of transfer.'); return }
    if (isTransfer && !kindFits(transferKind, form.currency)) {
      setError(transferKind === 'International' ? 'UAE → India is for amounts in AED. Pick another kind, or change the currency if it really was AED.'
        : 'NRE → NRO is for amounts in ₹. Pick another kind, or change the currency if it really was ₹.'); return
    }
    setSaving(true); setError('')
    let account_id: string | null
    try { account_id = await resolveAccountId() } catch (e: any) { setSaving(false); setError(e.message ?? 'Could not save'); return }
    const body = { ...form, merchant: form.merchant.trim(), description: form.description.trim() || null, amount: Math.abs(Number(form.amount)), account_id,
      counter_account_id: isTransfer ? form.counter_account_id || null : null,
      payment_mode: !isTransfer && form.payment_mode ? form.payment_mode : null,
      holder_name: form.holder_name || null, tax_tag: showTax ? form.tax_tag || null : null,
      event_id: form.txn_type === 'expense' ? form.event_id || null : null }
    const res = await fetch('/api/transactions', {
      method: mode === 'edit' ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(mode === 'edit' ? { id: t0.id, ...body } : body),
    })
    const data = await res.json().catch(() => ({}))
    setSaving(false)
    if (!res.ok) { setError(data.error ?? 'Could not save. Try again.'); return }
    const noun = isTransfer ? 'Transfer' : isIncome ? 'Income' : form.txn_type === 'loan' ? 'Loan payment' : 'Expense'
    let repeatNote = ''
    if (mode !== 'edit' && repeatOn) {
      // This month is the one just saved; the next one is added on its day
      const { data: { user } } = await supabase.auth.getUser()
      const month = form.txn_date.slice(0, 7)
      const { data: rec, error: recErr } = user ? await supabase.from('recurring_txns').insert({
        user_id: user.id, merchant: body.merchant, description: body.description, category: form.category, sub_category: form.sub_category || null,
        txn_type: form.txn_type, amount: body.amount, currency: form.currency, account_id, counter_account_id: body.counter_account_id,
        day_of_month: Number(form.txn_date.slice(8, 10)), every_months: 1, start_month: month, last_done_month: month, auto_add: repeatAuto === 'auto',
      }).select('id').single() : { data: null, error: { message: 'Signed out' } }
      if (recErr) repeatNote = ' · repeat not set up (run migration 027)'
      else if (rec && data.transaction?.id) { await supabase.from('transactions').update({ recurring_id: rec.id }).eq('id', data.transaction.id); repeatNote = ' · repeats monthly' }
    }
    if (receiptFile) {
      const id = mode === 'edit' ? t0.id : data.transaction?.id
      const err = id ? await uploadReceipt(supabase, id, receiptFile) : 'Could not attach the receipt'
      repeatNote += err ? ` · receipt not saved (${err})` : ' · receipt attached'
    }
    toast((mode === 'edit' ? 'Changes saved' : `${noun} saved · ${form.merchant.trim()}`) + repeatNote)
    router.refresh()
    onAdded?.()
    onClose()
  }

  const sym      = form.currency === 'AED' ? 'AED' : '₹'
  const aedAmt   = form.currency === 'AED' ? Number(form.amount || 0) : 0
  const inrEquiv = liveRate && aedAmt > 0 ? Math.round(aedAmt * liveRate) : null
  const noun     = isTransfer ? 'transfer' : isIncome ? 'income' : form.txn_type === 'loan' ? 'loan payment' : 'expense'
  const title    = mode === 'edit' ? `Edit ${noun}` : mode === 'duplicate' ? `Copy ${noun}` : `Add ${noun}`
  const cashId   = accounts.find(a => a.account_type === 'wallet' && a.currency === form.currency)?.id ?? '__cash__'
  const typeOpts = [{ value: 'expense' as TxnType, label: 'Expense' }, { value: 'income' as TxnType, label: 'Income' }, { value: 'transfer' as TxnType, label: 'Transfer' },
    ...(mode !== 'add' || form.txn_type === 'loan' ? [{ value: 'loan' as TxnType, label: 'Loan' }] : [])]

  return (
    <div className="fixed inset-0 wl-sheet z-50 flex items-center justify-center p-4" style={{ background: 'rgba(15,23,42,.4)' }} onClick={onClose}>
      <div className="wl-sheet-panel bg-white w-full max-w-[460px] rounded-2xl flex flex-col max-h-[90vh]" style={{ boxShadow: '0 24px 60px rgba(15,23,42,.3)' }}
        onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={title}>

        <div className="px-5 md:px-6 pt-5 md:pt-6 pb-3 flex items-center justify-between">
          <h2 className="text-[18px] font-bold" style={{ color: 'var(--text)' }}>{title}</h2>
          <button onClick={onClose} aria-label="Close" className="w-8 h-8 -mr-1 rounded-lg flex items-center justify-center hover:bg-[var(--bg2)]" style={{ color: 'var(--text3)' }}><X size={18} /></button>
        </div>

        <div className="overflow-y-auto px-5 md:px-6 pb-2 flex flex-col gap-3.5">
          <Segmented full label="Type" value={form.txn_type} onChange={setType} options={typeOpts} />

          {/* Amount first: the number people came to enter */}
          <div>
            <Label>Amount</Label>
            <div className="flex gap-2">
              <div className="relative flex-1 min-w-0">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[15px] font-semibold" style={{ color: 'var(--text3)' }}>{sym}</span>
                <input type="number" inputMode="decimal" min="0" step="0.01" value={form.amount} onChange={e => set({ amount: e.target.value })} placeholder="0"
                  autoFocus={mode === 'add'} aria-label="Amount"
                  className={`wl-input ${sym === 'AED' ? 'pl-12' : 'pl-8'} tabular-nums`} style={{ ...FIELD, height: 50, fontSize: 22, fontWeight: 700 }} />
              </div>
              <Segmented label="Currency" value={form.currency} onChange={c => set({ currency: c })}
                options={[{ value: 'INR', label: '₹ INR' }, { value: 'AED', label: 'AED' }]} />
            </div>
            {form.currency === 'AED' && Number(form.amount) > 0 && (
              <div className="mt-1.5 flex items-center gap-1.5 text-[12px]" style={{ color: 'var(--text3)' }}>
                <ArrowRight size={12} />
                {rateLoading ? <span className="flex items-center gap-1"><Loader2 size={11} className="animate-spin" />Getting today’s rate…</span>
                  : liveRate ? <>
                      <span className="font-semibold tabular-nums" style={{ color: 'var(--text)' }}>₹{inrEquiv?.toLocaleString('en-IN')}</span>
                      <span>at ₹{liveRate.toFixed(2)} per AED{rateDate ? ` · ${rateDate}` : ''}</span>
                      <button onClick={fetchLiveRate} aria-label="Refresh rate" style={{ color: 'var(--accent)' }}><RefreshCw size={11} /></button>
                    </> : <span>Rate unavailable</span>}
              </div>
            )}
          </div>

          {isTransfer && (
            <div>
              <Label>Kind of transfer</Label>
              {TRANSFER_GROUPS.map(g => (
              <div key={g.key} className="mb-2 last:mb-0">
              <div className="text-[10.5px] font-semibold uppercase tracking-[0.05em] mb-1.5" style={{ color: 'var(--text4)' }}>{g.label} <span className="normal-case tracking-normal font-normal">· {g.note}</span></div>
              <div className="grid grid-cols-2 gap-2">
                {TRANSFER_SUBTYPES.filter(s => s.group === g.key).map(s => {
                  const on = transferKind === s.value
                  // With an amount in, a kind for the other currency can't be picked
                  const off = !on && (mode !== 'add' || !!form.amount) && !kindFits(s.value, form.currency)
                  return (
                    <button key={s.value} onClick={() => setTransferSubtype(s.value)} aria-pressed={on} disabled={off}
                      className="rounded-xl px-3 py-2.5 text-left flex items-start gap-2.5 transition-colors disabled:opacity-45 disabled:cursor-not-allowed"
                      style={on ? { background: s.color + '14', boxShadow: `inset 0 0 0 1.5px ${s.color}` } : { background: '#fff', border: '1px solid var(--line)' }}>
                      <span className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: s.color + '1A', color: s.color }}><s.icon size={14} /></span>
                      <span className="min-w-0">
                        <span className="block text-[12.5px] font-semibold" style={{ color: on ? s.color : 'var(--text)' }}>{s.label}</span>
                        <span className="block text-[11px] leading-tight mt-0.5" style={{ color: 'var(--text3)' }}>{off ? `${KIND_CURRENCY[s.value] === 'AED' ? 'AED' : '₹'} amounts only` : s.desc}</span>
                      </span>
                    </button>
                  )
                })}
              </div>
              </div>
              ))}
              {transferKind && !kindFits(transferKind, form.currency) && (
                <div role="alert" className="mt-2 text-[12px] rounded-lg px-3 py-2 leading-snug" style={{ background: '#FFF2E2', color: '#8A4B08' }}>
                  {transferKind === 'International'
                    ? <>UAE → India is money leaving in <b>AED</b>, but this amount is in ₹. If it went from NRE to NRO, to another of your accounts or to family, pick that instead.</>
                    : <>{transferKind === 'Internal' ? 'NRE → NRO' : 'NRO → NRE'} is a move in <b>₹</b>, but this amount is in AED. If it was money sent home, pick UAE → India.</>}
                </div>
              )}
              {form.sub_category === 'ATM Withdrawal' && (
                <div className="mt-2 text-[12px] rounded-lg px-3 py-2 leading-snug" style={{ background: '#E0F4F8', color: '#0E7490' }}>
                  Adds the cash to your Cash wallet. It isn’t counted as spending; log what you buy with it as cash expenses.
                </div>
              )}
            </div>
          )}

          <div>
            <Label>{isTransfer ? 'Label' : isIncome ? 'Received from' : 'Paid to'}</Label>
            <input type="text" value={form.merchant} onChange={e => set({ merchant: e.target.value })}
              placeholder={isTransfer ? 'e.g. Transfer to India' : isIncome ? 'e.g. Employer, tenant, bank' : 'e.g. Carrefour, Amazon, DEWA'}
              className="wl-input" style={FIELD} />
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <Label>Date</Label>
              <input type="date" value={form.txn_date} onChange={e => set({ txn_date: e.target.value })} className="wl-input" style={FIELD} />
            </div>
            {form.sub_category !== 'ATM Withdrawal' ? (
              <div>
                <Label>{isTransfer ? 'From account' : isIncome ? 'Received in' : 'Paid from'}</Label>
                <select value={form.account_id === '__cash__' ? cashId : form.account_id} onChange={e => set({ account_id: e.target.value })} className="wl-input" style={FIELD}>
                  <option value="">Not linked</option>
                  {!isTransfer && <option value={cashId}>Cash wallet</option>}
                  {accounts.filter(a => a.account_type !== 'wallet').filter(a => !isTransfer || (a.currency === form.currency && a.account_type !== 'credit_card'))
                    .map(a => <option key={a.id} value={a.id}>{a.account_type === 'credit_card' ? 'Card · ' : ''}{a.name}{a.bank_name && a.bank_name !== a.name ? ` · ${a.bank_name}` : ''}</option>)}
                </select>
              </div>
            ) : (
              <div>
                <Label>Withdrawn from</Label>
                <select value={form.counter_account_id} onChange={e => set({ counter_account_id: e.target.value })} className="wl-input" style={FIELD}>
                  <option value="">Choose bank</option>
                  {accounts.filter(a => a.account_type !== 'wallet' && a.account_type !== 'credit_card' && a.currency === form.currency)
                    .map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
            )}
          </div>

          {/* The other side of a move, so both balances update from one entry */}
          {isTransfer && TO_ACCOUNT_KINDS.includes(transferKind) && (
            <div>
              <Label>{transferKind === 'Card bill' ? 'Card paid' : transferKind === 'International' ? 'Lands in (India account)' : 'To account'}</Label>
              <select value={form.counter_account_id} onChange={e => set({ counter_account_id: e.target.value })} className="wl-input" style={FIELD}>
                <option value="">{transferKind === 'Card bill' ? 'Choose card' : 'Choose account'}</option>
                {accounts.filter(a => a.id !== form.account_id).filter(a => transferKind === 'Card bill'
                    ? a.account_type === 'credit_card' && a.currency === form.currency
                    : a.account_type !== 'credit_card' && a.account_type !== 'wallet' && (transferKind === 'International' ? a.currency === 'INR' : a.currency === form.currency))
                  .map(a => <option key={a.id} value={a.id}>{a.name}{a.bank_name && a.bank_name !== a.name ? ` · ${a.bank_name}` : ''}</option>)}
              </select>
              <div className="text-[11.5px] mt-1" style={{ color: 'var(--text4)' }}>
                {transferKind === 'Card bill' ? 'Lowers the bank balance and what you owe on the card. Not spending — the purchases were already counted.' : 'Both balances update from this one entry. Not income or spending.'}
              </div>
            </div>
          )}

          {/* How a bank payment was made (for the card / bank / UPI split) */}
          {!isTransfer && !isIncome && (() => {
            const acc = accounts.find(a => a.id === form.account_id)
            if (!acc || acc.account_type === 'credit_card' || acc.account_type === 'wallet') return null
            return (
              <div>
                <Label>How you paid (optional)</Label>
                <div className="flex flex-wrap gap-1.5">
                  {PAY_MODES.map(([k, l]) => (
                    <button key={k} onClick={() => set({ payment_mode: form.payment_mode === k ? '' : k })} aria-pressed={form.payment_mode === k} className="wl-chip" style={{ height: 32 }}>{l}</button>
                  ))}
                </div>
              </div>
            )
          })()}

          {!isTransfer && (
            <div>
              <Label right={<button onClick={() => setManage(true)} className="text-[12px] font-semibold flex items-center gap-1" style={{ color: 'var(--accent)' }}><Settings2 size={12} />Manage</button>}>Category</Label>
              <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Category">
                {cats.map(c => {
                  const on = form.category === c.name
                  return (
                    <button key={c.id} role="radio" aria-checked={on} onClick={() => setCategory(c.name)}
                      className="inline-flex items-center gap-1.5 h-[34px] pl-2 pr-3 rounded-full text-[12.5px] transition-colors"
                      style={on ? { background: c.color + '1A', boxShadow: `inset 0 0 0 1.5px ${c.color}`, color: c.color, fontWeight: 600 }
                        : { background: '#fff', border: '1px solid var(--line)', color: 'var(--text2)', fontWeight: 500 }}>
                      <span className="w-[22px] h-[22px] rounded-full flex items-center justify-center" style={{ background: c.color + (on ? '26' : '1A'), color: c.color }}><CategoryIcon icon={c.icon} size={12} /></span>
                      {c.name}
                    </button>
                  )
                })}
                <button onClick={() => setManage(true)} className="inline-flex items-center gap-1 h-[34px] px-3 rounded-full text-[12.5px] font-semibold"
                  style={{ border: '1px dashed var(--accent-border)', color: 'var(--accent2)', background: 'var(--accent-bg)' }}>
                  <Plus size={13} />New
                </button>
              </div>
            </div>
          )}

          <div>
            <Label>{isTransfer ? (transferKind === 'Family' ? 'To (who)' : 'Note (optional)') : 'Note (optional)'}</Label>
            <input type="text" value={form.description} onChange={e => set({ description: e.target.value })}
              placeholder={isTransfer ? (form.sub_category === 'Family' ? 'e.g. Wife, parents' : 'e.g. HDFC NRO ••4521') : 'Anything to remember'}
              className="wl-input" style={FIELD} />
          </div>

          {form.txn_type === 'expense' && (events.length > 0 || form.event_id) && (
            <div>
              <Label>Trip / event</Label>
              <select value={form.event_id} onChange={e => { setEventTouched(true); set({ event_id: e.target.value }) }} className="wl-input" style={FIELD} aria-label="Trip or event">
                <option value="">None — everyday spending</option>
                {events.map(ev => <option key={ev.id} value={ev.id}>{eventKind(ev.kind).icon} {ev.name} · {fmtDay(ev.start_date)}{ev.end_date !== ev.start_date ? ` – ${fmtDay(ev.end_date)}` : ''}</option>)}
                {form.event_id && !events.some(ev => ev.id === form.event_id) && <option value={form.event_id}>(a finished event)</option>}
              </select>
              {form.event_id && <div className="text-[11.5px] mt-1" style={{ color: 'var(--text4)' }}>Counts towards that trip’s own budget, not your monthly budget. Still part of what you spent this month.</div>}
            </div>
          )}

          {(forOpts.length > 1 || showTax) && !isTransfer && (
            <div className="grid grid-cols-2 gap-3">
              {forOpts.length > 1 && (
                <div className={showTax ? '' : 'col-span-2'}>
                  <Label>For</Label>
                  <select value={form.holder_name} onChange={e => set({ holder_name: e.target.value })} className="wl-input" style={FIELD} aria-label="Who it was for">
                    <option value="">Whole family</option>
                    {forOpts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              )}
              {showTax && (
                <div className={forOpts.length > 1 ? '' : 'col-span-2'}>
                  <Label>Tax (India)</Label>
                  <select value={form.tax_tag} onChange={e => set({ tax_tag: e.target.value })} className="wl-input" style={FIELD} aria-label="Tax deduction section">
                    <option value="">Not for tax</option>
                    <option value="80C">80C · tuition fees, PPF, LIC…</option>
                    <option value="80D">80D · health cover, check-ups</option>
                    <option value="80D parents">80D · parents' health</option>
                  </select>
                </div>
              )}
            </div>
          )}

          <div>
            <Label>Receipt (optional)</Label>
            <div className="flex items-center gap-2 flex-wrap">
              <label className="wl-btn cursor-pointer max-w-full" style={{ height: 36 }}>
                <Paperclip size={14} className="flex-shrink-0" />
                <span className="truncate">{receiptFile ? receiptFile.name : receiptPath ? 'Replace' : 'Attach a photo or PDF'}</span>
                <input type="file" accept={RECEIPT_TYPES} className="hidden" onChange={e => setReceiptFile(e.target.files?.[0] ?? null)} />
              </label>
              {receiptFile && <button type="button" onClick={() => setReceiptFile(null)} className="text-[12px] font-semibold" style={{ color: 'var(--text3)' }}>Clear</button>}
              {!receiptFile && receiptPath && mode === 'edit' && (<>
                <button type="button" onClick={async () => setReceiptMsg((await openReceipt(supabase, receiptPath)) ?? '')} className="text-[12.5px] font-semibold" style={{ color: 'var(--accent)' }}>View receipt</button>
                <button type="button" onClick={async () => { const err = await removeReceipt(supabase, t0.id, receiptPath); if (err) setReceiptMsg(err); else { setReceiptPath(null); router.refresh() } }}
                  className="text-[12.5px] font-semibold" style={{ color: 'var(--text3)' }}>Remove</button>
              </>)}
            </div>
            {receiptMsg && <div className="text-[12px] mt-1.5" style={{ color: '#B4231A' }}>{receiptMsg}</div>}
          </div>

          {mode !== 'edit' && (
            <div className="rounded-xl px-3 py-2.5 flex flex-col gap-2" style={{ background: '#F7F8FA', border: '1px solid #E2E8F0' }}>
              <label className="flex items-center gap-2 text-[13px] font-medium cursor-pointer" style={{ color: 'var(--text2)' }}>
                <input type="checkbox" checked={repeatOn} onChange={e => setRepeatOn(e.target.checked)} className="accent-[var(--accent)] w-4 h-4" />
                <RefreshCw size={13} style={{ color: 'var(--accent)' }} />
                Repeat every month{form.txn_date ? ` on the ${ordinal(Number(form.txn_date.slice(8, 10)))}` : ''}
              </label>
              {repeatOn && (
                <Segmented label="When it repeats" value={repeatAuto} onChange={setRepeatAuto} full
                  options={[{ value: 'ask', label: 'Ask me first' }, { value: 'auto', label: 'Add it for me' }]} />
              )}
            </div>
          )}

          {error && <div className="rounded-lg px-3 py-2.5 text-[12.5px] leading-snug" style={{ background: '#FDECE8', color: '#B4231A' }} role="alert">{error}</div>}
        </div>

        <div className="px-5 md:px-6 pt-3 pb-5 md:pb-6 flex gap-2.5">
          <button onClick={onClose} className="wl-btn" style={{ height: 44, padding: '0 18px', fontSize: 13.5, borderRadius: 9 }}>Cancel</button>
          <button onClick={save} disabled={saving} className="wl-btn wl-btn-primary flex-1 disabled:opacity-60" style={{ height: 44, fontSize: 14, borderRadius: 9 }}>
            {saving ? <><Loader2 size={15} className="animate-spin" />Saving…</> : mode === 'edit' ? 'Save changes' : mode === 'duplicate' ? 'Add copy' : `Save ${noun}`}
          </button>
        </div>
      </div>

      {manage && <div onClick={e => e.stopPropagation()}><ManageCategoriesSheet initialKind={catKind} onClose={() => setManage(false)} /></div>}
    </div>
  )
}
