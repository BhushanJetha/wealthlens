'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { X, Loader2, Plus } from 'lucide-react'
import { useRouter } from 'next/navigation'

const CATEGORIES = ['Food','Shopping','Utilities','Transport','Health','Entertainment','Travel','Education','Investment','EMI/Loan','Salary','Transfer','Other']
const CAT_COLORS: Record<string,string> = {
  Food:'#D97706', Shopping:'#2563EB', Utilities:'#7C3AED', Transport:'#16A34A',
  Health:'#059669', Entertainment:'#E11D48', Travel:'#EA580C', Education:'#0284C7', Other:'#6B7280',
}

const Lbl = ({ children }: { children: React.ReactNode }) => (
  <label className="block text-[10px] uppercase tracking-wider font-semibold mb-1.5"
    style={{ color: 'var(--text3)' }}>{children}</label>
)

const inputStyle = { background: 'var(--bg2)', border: '1px solid var(--border)', color: 'var(--text)' }
const inputClass = "wl-input"

export default function AddTransactionModal({ onClose, onAdded }: { onClose: () => void; onAdded?: () => void }) {
  const [form, setForm] = useState({
    txn_date: new Date().toISOString().slice(0, 10),
    merchant: '',
    description: '',
    category: 'Food',
    amount: '',
    currency: 'INR',
    txn_type: 'expense',
    account_id: '',
  })
  const [accounts, setAccounts] = useState<any[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const supabase = createClient()
  const router = useRouter()

  useEffect(() => {
    supabase.from('accounts').select('id,name,bank_name,currency').eq('is_active', true).then(({ data }) => setAccounts(data ?? []))
  }, [])

  function f(key: string) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm(p => ({ ...p, [key]: e.target.value }))
  }

  async function save() {
    if (!form.merchant || !form.amount || !form.txn_date) { setError('Merchant, amount and date are required'); return }
    setSaving(true); setError('')

    const res = await fetch('/api/transactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
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

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="rounded-2xl p-6 w-full max-w-md"
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
                  <button key={t} onClick={() => setForm(p => ({ ...p, txn_type: t }))}
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

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Lbl>Date</Lbl>
              <input type="date" value={form.txn_date} onChange={f('txn_date')}
                className={inputClass} style={inputStyle}
                onFocus={e => (e.target.style.borderColor = 'var(--sage)')}
                onBlur={e => (e.target.style.borderColor = 'var(--border)')} />
            </div>
            <div>
              <Lbl>Currency</Lbl>
              <select value={form.currency} onChange={f('currency')}
                className={inputClass} style={inputStyle}
                onFocus={e => (e.target.style.borderColor = 'var(--sage)')}
                onBlur={e => (e.target.style.borderColor = 'var(--border)')}>
                <option value="INR">₹ INR — India</option>
                <option value="AED">AED — UAE</option>
              </select>
            </div>
          </div>

          <div>
            <Lbl>Merchant / Description</Lbl>
            <input type="text" value={form.merchant} onChange={f('merchant')} placeholder="e.g. Carrefour, Amazon, DEWA"
              className={inputClass} style={inputStyle}
              onFocus={e => (e.target.style.borderColor = 'var(--sage)')}
              onBlur={e => (e.target.style.borderColor = 'var(--border)')} />
          </div>

          <div>
            <Lbl>Amount</Lbl>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[12px] font-mono" style={{ color: 'var(--text3)' }}>
                {form.currency === 'AED' ? 'AED' : '₹'}
              </span>
              <input type="number" value={form.amount} onChange={f('amount')} placeholder="0.00"
                className={`${inputClass} pl-12 font-mono font-bold`} style={inputStyle}
                onFocus={e => (e.target.style.borderColor = 'var(--sage)')}
                onBlur={e => (e.target.style.borderColor = 'var(--border)')} />
            </div>
          </div>

          <div>
            <Lbl>Category</Lbl>
            <div className="flex flex-wrap gap-1.5">
              {CATEGORIES.map(c => {
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

          {accounts.length > 0 && (
            <div>
              <Lbl>Account (optional)</Lbl>
              <select value={form.account_id} onChange={f('account_id')}
                className={inputClass} style={inputStyle}
                onFocus={e => (e.target.style.borderColor = 'var(--sage)')}
                onBlur={e => (e.target.style.borderColor = 'var(--border)')}>
                <option value="">No account linked</option>
                {accounts.filter(a => a.currency === form.currency).map(a => (
                  <option key={a.id} value={a.id}>{a.name} ({a.bank_name})</option>
                ))}
              </select>
            </div>
          )}

          <div>
            <Lbl>Notes (optional)</Lbl>
            <input type="text" value={form.description} onChange={f('description')} placeholder="Additional details"
              className={inputClass} style={inputStyle}
              onFocus={e => (e.target.style.borderColor = 'var(--sage)')}
              onBlur={e => (e.target.style.borderColor = 'var(--border)')} />
          </div>
        </div>

        <div className="flex gap-3 mt-5">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-lg text-[12px] font-semibold"
            style={{ border: '1px solid var(--border)', color: 'var(--text3)', background: 'var(--bg2)' }}>
            Cancel
          </button>
          <button onClick={save} disabled={saving}
            className="flex-1 py-2.5 rounded-lg text-white text-[12px] font-bold flex items-center justify-center gap-2 disabled:opacity-50"
            style={{ background: 'var(--sage)' }}>
            {saving ? <><Loader2 size={14} className="animate-spin" />Saving…</> : 'Add Transaction'}
          </button>
        </div>
      </div>
    </div>
  )
}
