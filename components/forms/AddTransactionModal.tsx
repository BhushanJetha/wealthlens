'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { X, Loader2, Plus, ArrowRight, RefreshCw } from 'lucide-react'
import { useRouter } from 'next/navigation'

const EXPENSE_CATS = ['Food','Shopping','Utilities','Transport','Health','Personal Care','Entertainment','Travel','Education','Subscription','Investment','EMI/Loan','Loan on Card','Credit Card Payment','Family Transfer','Refund','Other']
const INCOME_CATS  = ['UAE Income (NRO)','Salary','NRE Received','Dividend','Interest','FD/RD Maturity','Rental','Gift','Bonus','Tax Refund','Freelance','NRI Transfer','Loan Taken','Refund','Other']

const CAT_COLORS: Record<string,string> = {
  Food:'#D97706', Shopping:'#2563EB', Utilities:'#7C3AED', Transport:'#16A34A',
  Health:'#059669', Entertainment:'#E11D48', Travel:'#EA580C', Education:'#0284C7',
  Subscription:'#EC4899', 'Personal Care':'#DB2777',
  Investment:'#10B981', 'EMI/Loan':'#F97316', 'Loan on Card':'#F59E0B',
  'Credit Card Payment':'#9333EA', 'Family Transfer':'#0EA5E9', Refund:'#059669',
  'UAE Income (NRO)':'#15803D', Salary:'#16A34A', 'NRE Received':'#0284C7', Dividend:'#2563EB', Rental:'#7C3AED', Gift:'#E11D48',
  Bonus:'#D97706', 'Tax Refund':'#059669', Interest:'#0369A1', 'FD/RD Maturity':'#0891B2', Freelance:'#EA580C',
  'NRI Transfer':'#0EA5E9', 'Loan Taken':'#6366F1',
  Other:'#6B7280',
}

const TRANSFER_SUBTYPES = [
  { value: 'International',   label: 'UAE → India',     desc: 'Send money from UAE to India',          color: '#3B7DD8' },
  { value: 'Internal',       label: 'NRE → NRO',       desc: 'Move funds between NRE & NRO accounts',  color: '#7C5CBF' },
  { value: 'Family',         label: 'Family Transfer',  desc: 'Monthly allowance to spouse or parents', color: '#3D7A58' },
  { value: 'ATM Withdrawal', label: 'ATM Cash',         desc: 'Bank → Cash wallet (cash withdrawn)',    color: '#0891B2' },
]

const Lbl = ({ children }: { children: React.ReactNode }) => (
  <label className="block text-[10px] uppercase tracking-wider font-semibold mb-1.5"
    style={{ color: 'var(--text3)' }}>{children}</label>
)
const inputStyle = { background: 'var(--bg2)', border: '1px solid var(--border)', color: 'var(--text)' }

export default function AddTransactionModal({ onClose, onAdded, defaults }: {
  onClose: () => void
  onAdded?: () => void
  defaults?: Partial<{ txn_type: string; account_id: string; category: string; currency: string; sub_category: string; merchant: string }>
}) {
  const [form, setForm] = useState({
    txn_date:     new Date().toISOString().slice(0, 10),
    merchant:     defaults?.merchant ?? '',
    description:  '',
    category:     defaults?.category ?? (defaults?.txn_type === 'income' ? 'Salary' : 'Food'),
    sub_category: defaults?.sub_category ?? '',
    amount:       '',
    currency:     defaults?.currency ?? 'INR',
    txn_type:     defaults?.txn_type ?? 'expense',
    account_id:   defaults?.account_id ?? '',
  })
  const [accounts,    setAccounts]    = useState<any[]>([])
  const [saving,      setSaving]      = useState(false)
  const [error,       setError]       = useState('')
  const [liveRate,    setLiveRate]    = useState<number | null>(null)
  const [rateLoading, setRateLoading] = useState(false)
  const [rateDate,    setRateDate]    = useState<string | null>(null)

  const supabase = createClient()
  const router   = useRouter()

  useEffect(() => {
    supabase.from('accounts').select('id,name,bank_name,currency,account_type').eq('is_active', true)
      .then(({ data }) => setAccounts(data ?? []))
  }, [])

  async function fetchLiveRate() {
    setRateLoading(true)
    try {
      const res = await fetch('/api/fx-rate')
      const d   = await res.json()
      setLiveRate(d.rate)
      setRateDate(d.date)
    } catch {
      setLiveRate(22.80)
    } finally {
      setRateLoading(false)
    }
  }

  useEffect(() => {
    if (form.txn_type === 'transfer' && form.currency === 'AED' && liveRate === null) {
      fetchLiveRate()
    }
  }, [form.txn_type, form.currency])

  function f(key: string) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm(p => ({ ...p, [key]: e.target.value }))
  }

  function setType(txn_type: string) {
    const category = txn_type === 'transfer' ? 'Transfer'
      : txn_type === 'income' ? 'Salary' : 'Food'
    setForm(p => ({ ...p, txn_type, category, sub_category: '' }))
  }

  function setTransferSubtype(sub: string) {
    const autoMerchant =
      sub === 'International'   ? 'Transfer to India' :
      sub === 'Internal'        ? 'NRE to NRO'        :
      sub === 'ATM Withdrawal'  ? 'ATM Withdrawal'    :
      'Family Transfer'
    const isAtm = sub === 'ATM Withdrawal'
    setForm(p => ({
      ...p,
      sub_category: sub,
      // ATM cash is its own category (money movement, not spend); it lands in
      // the Cash wallet so cash-in-hand is topped up.
      category:   isAtm ? 'ATM Withdrawal' : 'Transfer',
      account_id: isAtm ? '__cash__' : (p.account_id === '__cash__' ? '' : p.account_id),
      currency:   sub === 'International' ? 'AED' : p.currency,
      merchant:   p.merchant || autoMerchant,
    }))
    if (sub === 'International' && liveRate === null) fetchLiveRate()
  }

  // Resolve the "💵 Cash" sentinel to a real wallet account, creating one
  // (per-currency) the first time cash is used so cash spend is tracked.
  async function resolveAccountId(): Promise<string | null> {
    if (form.account_id !== '__cash__') return form.account_id || null
    const existing = accounts.find(a => a.account_type === 'wallet' && a.currency === form.currency)
    if (existing) return existing.id
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Not signed in')
    const { data, error: err } = await supabase.from('accounts').insert({
      user_id: user.id,
      name: 'Cash', bank_name: 'Cash', account_type: 'wallet',
      currency: form.currency, country: form.currency === 'AED' ? 'UAE' : 'India',
      outstanding_bal: 0,
    }).select('id').single()
    if (err || !data) throw new Error(err?.message || 'Could not create Cash wallet')
    setAccounts(p => [...p, { ...data, name: 'Cash', bank_name: 'Cash', currency: form.currency, account_type: 'wallet' }])
    return data.id
  }

  async function save() {
    if (!form.merchant || !form.amount || !form.txn_date) {
      setError('Merchant/label, amount and date are required'); return
    }
    setSaving(true); setError('')
    let acctId: string | null
    try { acctId = await resolveAccountId() }
    catch (e: any) { setSaving(false); setError(e.message ?? 'Could not save'); return }
    const res = await fetch('/api/transactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, account_id: acctId }),
    })
    const data = await res.json()
    setSaving(false)
    if (!res.ok) { setError(data.error ?? 'Failed to save'); return }
    router.refresh()
    onAdded?.()
    onClose()
  }

  const typeStyles: Record<string, { bg: string; border: string; color: string }> = {
    expense:  { bg: 'var(--rose-bg)',   border: 'var(--rose)',   color: 'var(--rose)' },
    income:   { bg: 'var(--income-bg)', border: 'var(--income)', color: 'var(--income)' },
    transfer: { bg: 'var(--blue-bg)',   border: 'var(--blue)',   color: 'var(--blue)' },
  }
  const inactiveTypeStyle = { background: 'var(--bg2)', borderColor: 'var(--border)', color: 'var(--text3)' }

  const isTransfer  = form.txn_type === 'transfer'
  const isIncome    = form.txn_type === 'income'
  const cats        = isIncome ? INCOME_CATS : EXPENSE_CATS

  const aedAmt   = form.currency === 'AED' ? Number(form.amount || 0) : 0
  const inrEquiv = liveRate && aedAmt > 0 ? Math.round(aedAmt * liveRate) : null

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="rounded-2xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto"
        style={{ background: '#fff', border: '1px solid var(--border)', boxShadow: '0 8px 32px rgba(0,0,0,0.12)' }}>

        <div className="flex justify-between items-center mb-5">
          <h2 className="text-[15px] font-bold flex items-center gap-2" style={{ color: 'var(--text)' }}>
            <Plus size={16} style={{ color: 'var(--sage)' }} /> Add Transaction
          </h2>
          <button onClick={onClose} style={{ color: 'var(--text3)' }}><X size={18} /></button>
        </div>

        {error && (
          <div className="rounded-lg p-3 text-[12px] mb-4"
            style={{ background: 'var(--rose-bg)', border: '1px solid var(--rose)', color: 'var(--rose)' }}>
            {error}
          </div>
        )}

        <div className="space-y-3">
          {/* Type toggle */}
          <div>
            <Lbl>Type</Lbl>
            <div className="flex gap-2">
              {['expense', 'income', 'transfer'].map(t => {
                const s = typeStyles[t]
                return (
                  <button key={t} onClick={() => setType(t)}
                    className="flex-1 py-2 rounded-lg text-[11px] font-bold border transition-all capitalize"
                    style={form.txn_type === t
                      ? { background: s.bg, borderColor: s.border, color: s.color }
                      : inactiveTypeStyle}>
                    {t}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Transfer sub-type chips */}
          {isTransfer && (
            <div>
              <Lbl>Transfer Type</Lbl>
              <div className="grid grid-cols-2 gap-2">
                {TRANSFER_SUBTYPES.map(sub => (
                  <button key={sub.value} onClick={() => setTransferSubtype(sub.value)}
                    className="p-2 rounded-xl border text-center transition-all"
                    style={form.sub_category === sub.value
                      ? { background: sub.color + '15', borderColor: sub.color, color: sub.color }
                      : { background: 'var(--bg2)', borderColor: 'var(--border)', color: 'var(--text3)' }}>
                    <div className="text-[11px] font-bold">{sub.label}</div>
                    <div className="text-[9px] mt-0.5 leading-tight">{sub.desc}</div>
                  </button>
                ))}
              </div>
              {form.sub_category === 'ATM Withdrawal' && (
                <div className="mt-2 text-[10px] rounded-lg px-2.5 py-1.5"
                  style={{ background: '#ECFEFF', border: '1px solid #0891B240', color: '#0E7490' }}>
                  💵 Records cash added to your <strong>Cash wallet</strong> — not an expense. Log your cash spends separately from the Cash wallet.
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Lbl>Date</Lbl>
              <input type="date" value={form.txn_date} onChange={f('txn_date')}
                className="wl-input" style={inputStyle}
                onFocus={e => (e.target.style.borderColor = 'var(--sage)')}
                onBlur={e => (e.target.style.borderColor = 'var(--border)')} />
            </div>
            <div>
              <Lbl>Currency</Lbl>
              <select value={form.currency} onChange={e => {
                f('currency')(e)
                if (e.target.value === 'AED' && liveRate === null) fetchLiveRate()
              }}
                className="wl-input" style={inputStyle}
                onFocus={e => (e.target.style.borderColor = 'var(--sage)')}
                onBlur={e => (e.target.style.borderColor = 'var(--border)')}>
                <option value="INR">₹ INR — India</option>
                <option value="AED">AED — UAE</option>
              </select>
            </div>
          </div>

          <div>
            <Lbl>{isTransfer ? 'Transfer Label' : 'Merchant / Description'}</Lbl>
            <input type="text" value={form.merchant} onChange={f('merchant')}
              placeholder={isTransfer ? 'e.g. Transfer to India, NRE → NRO' : 'e.g. Carrefour, Amazon, DEWA'}
              className="wl-input" style={inputStyle}
              onFocus={e => (e.target.style.borderColor = 'var(--sage)')}
              onBlur={e => (e.target.style.borderColor = 'var(--border)')} />
          </div>

          {/* Amount + FX preview */}
          <div>
            <Lbl>Amount</Lbl>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[12px] font-mono" style={{ color: 'var(--text3)' }}>
                {form.currency === 'AED' ? 'AED' : '₹'}
              </span>
              <input type="number" value={form.amount} onChange={f('amount')} placeholder="0.00"
                className="wl-input pl-12 font-mono font-bold" style={inputStyle}
                onFocus={e => (e.target.style.borderColor = 'var(--sage)')}
                onBlur={e => (e.target.style.borderColor = 'var(--border)')} />
            </div>
            {/* Live FX conversion preview */}
            {form.currency === 'AED' && Number(form.amount) > 0 && (
              <div className="mt-1.5 flex items-center gap-1.5 text-[11px]"
                style={{ color: 'var(--text3)' }}>
                <ArrowRight size={11} />
                {rateLoading ? (
                  <span className="flex items-center gap-1">
                    <Loader2 size={10} className="animate-spin" /> Fetching live rate…
                  </span>
                ) : liveRate ? (
                  <>
                    <span className="font-mono font-bold" style={{ color: 'var(--gold)' }}>
                      ₹{inrEquiv?.toLocaleString('en-IN')}
                    </span>
                    <span>at ₹{liveRate.toFixed(2)}/AED</span>
                    {rateDate && <span style={{ color: 'var(--text3)' }}>· {rateDate}</span>}
                    <button onClick={fetchLiveRate} title="Refresh rate"
                      style={{ color: 'var(--blue)' }}>
                      <RefreshCw size={10} />
                    </button>
                  </>
                ) : null}
              </div>
            )}
          </div>

          {/* Transfer: To recipient */}
          {isTransfer ? (
            <div>
              <Lbl>{form.sub_category === 'ATM Withdrawal' ? 'Withdrawn from (bank, optional)' : 'To (Recipient / Account)'}</Lbl>
              <input type="text" value={form.description} onChange={f('description')}
                placeholder={
                  form.sub_category === 'ATM Withdrawal' ? 'e.g. HDFC Savings •••4521' :
                  form.sub_category === 'International' ? 'e.g. HDFC Savings •••4521' :
                  form.sub_category === 'Internal'      ? 'e.g. NRO Account, HDFC' :
                  'e.g. Wife - personal expenses'
                }
                className="wl-input" style={inputStyle}
                onFocus={e => (e.target.style.borderColor = 'var(--sage)')}
                onBlur={e => (e.target.style.borderColor = 'var(--border)')} />
            </div>
          ) : (
            /* Category for expense/income */
            <div>
              <Lbl>Category</Lbl>
              <div className="flex flex-wrap gap-1.5">
                {cats.map(c => {
                  const col = CAT_COLORS[c] ?? '#6B7280'
                  return (
                    <button key={c} onClick={() => setForm(p => ({ ...p, category: c }))}
                      className="px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all border"
                      style={form.category === c
                        ? { background: col + '18', borderColor: col + '60', color: col }
                        : { background: 'var(--bg2)', borderColor: 'var(--border)', color: 'var(--text3)' }}>
                      {c}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Account / payment source (ATM lands in the Cash wallet, so no picker) */}
          {(!isTransfer || accounts.length > 0) && form.sub_category !== 'ATM Withdrawal' && (
            <div>
              <Lbl>{isTransfer ? 'From Account' : 'Paid From (optional)'}</Lbl>
              <select value={form.account_id} onChange={f('account_id')}
                className="wl-input" style={inputStyle}
                onFocus={e => (e.target.style.borderColor = 'var(--sage)')}
                onBlur={e => (e.target.style.borderColor = 'var(--border)')}>
                <option value="">No account linked</option>
                {!isTransfer && (
                  <option value={
                    accounts.find(a => a.account_type === 'wallet' && a.currency === form.currency)?.id ?? '__cash__'
                  }>💵 Cash — spent from wallet</option>
                )}
                {accounts
                  .filter(a => a.account_type !== 'wallet')
                  .filter(a => !isTransfer || a.currency === form.currency)
                  .map(a => (
                    <option key={a.id} value={a.id}>{a.name} ({a.bank_name})</option>
                  ))}
              </select>
            </div>
          )}

          {/* Notes (non-transfer only, since description is used for recipient) */}
          {!isTransfer && (
            <div>
              <Lbl>Notes (optional)</Lbl>
              <input type="text" value={form.description} onChange={f('description')}
                placeholder="Additional details"
                className="wl-input" style={inputStyle}
                onFocus={e => (e.target.style.borderColor = 'var(--sage)')}
                onBlur={e => (e.target.style.borderColor = 'var(--border)')} />
            </div>
          )}
        </div>

        <div className="flex gap-3 mt-5">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-lg text-[12px] font-semibold"
            style={{ border: '1px solid var(--border)', color: 'var(--text3)', background: 'var(--bg2)' }}>
            Cancel
          </button>
          <button onClick={save} disabled={saving}
            className="flex-1 py-2.5 rounded-lg text-white text-[12px] font-bold flex items-center justify-center gap-2 disabled:opacity-50"
            style={{ background: isTransfer ? 'var(--blue)' : isIncome ? 'var(--income)' : 'var(--sage)' }}>
            {saving ? <><Loader2 size={14} className="animate-spin" />Saving…</> : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
