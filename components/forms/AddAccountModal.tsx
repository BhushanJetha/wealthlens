'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { X, Loader2 } from 'lucide-react'
import { useRouter } from 'next/navigation'

interface Props {
  onClose: () => void
  type?: string
  initialData?: any
  cardId?: string
}

export default function AddAccountModal({ onClose, type = 'credit_card', initialData, cardId }: Props) {
  const isEdit = !!cardId

  const [form, setForm] = useState<Record<string, string>>(
    initialData ? {
      name:            initialData.name ?? '',
      bank_name:       initialData.bank_name ?? '',
      currency:        initialData.currency ?? 'INR',
      country:         initialData.country ?? 'India',
      last_four:       initialData.last_four ?? '',
      credit_limit:    String(initialData.credit_limit ?? ''),
      outstanding_bal: String(initialData.outstanding_bal ?? ''),
      minimum_due:     String(initialData.minimum_due ?? ''),
      due_date:        initialData.due_date ?? '',
      account_type:    type,
    } : {
      currency: 'INR',
      country: 'India',
      account_type: type,
    }
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const supabase = createClient()
  const router = useRouter()

  function f(key: string) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm(p => ({ ...p, [key]: e.target.value }))
  }

  const Lbl = ({ children }: { children: React.ReactNode }) => (
    <label className="block text-[10px] uppercase tracking-wider font-semibold mb-1.5"
      style={{ color: 'var(--text3)' }}>{children}</label>
  )

  const inp = (label: string, key: string, t = 'text', ph = '') => (
    <div>
      <Lbl>{label}</Lbl>
      <input
        type={t} value={form[key] ?? ''} onChange={f(key)} placeholder={ph}
        className="wl-input"
        onFocus={e => (e.target.style.borderColor = 'var(--sage)')}
        onBlur={e => (e.target.style.borderColor = 'var(--border)')}
      />
    </div>
  )

  async function save() {
    if (!form.name || !form.bank_name) { setError('Name and bank are required'); return }
    setSaving(true); setError('')

    const payload = {
      name:            form.name,
      bank_name:       form.bank_name,
      account_type:    form.account_type || type,
      currency:        form.currency,
      country:         form.country,
      last_four:       form.last_four || null,
      credit_limit:    form.credit_limit    ? Number(form.credit_limit)    : null,
      outstanding_bal: form.outstanding_bal ? Number(form.outstanding_bal) : 0,
      minimum_due:     form.minimum_due     ? Number(form.minimum_due)     : null,
      due_date:        form.due_date        || null,
    }

    let err
    if (isEdit) {
      ({ error: err } = await supabase.from('accounts').update(payload).eq('id', cardId!))
    } else {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setSaving(false); setError('Not signed in'); return }
      ;({ error: err } = await supabase.from('accounts').insert({ ...payload, user_id: user.id }))
    }

    setSaving(false)
    if (err) { setError(err.message); return }
    router.refresh()
    onClose()
  }

  const isCreditCard = type === 'credit_card'
  const title = isCreditCard
    ? (isEdit ? 'Edit Credit Card' : 'Add Credit Card')
    : (isEdit ? 'Edit Bank Account' : 'Add Bank Account')

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="rounded-2xl p-6 w-full max-w-md"
        style={{ background: '#fff', border: '1px solid var(--border)', boxShadow: '0 8px 32px rgba(0,0,0,0.12)' }}>
        <div className="flex justify-between items-center mb-5">
          <h2 className="text-[15px] font-bold" style={{ color: 'var(--text)' }}>{title}</h2>
          <button onClick={onClose} style={{ color: 'var(--text3)' }}
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--text)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--text3)')}>
            <X size={18} />
          </button>
        </div>

        {error && (
          <div className="rounded-lg p-3 text-[12px] mb-4"
            style={{ background: 'var(--rose-bg)', border: '1px solid var(--rose)', color: 'var(--rose)' }}>
            {error}
          </div>
        )}

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            {inp(isCreditCard ? 'Card Name' : 'Account Name', 'name', 'text', isCreditCard ? 'HDFC Regalia' : 'HDFC Savings')}
            {inp('Bank Name', 'bank_name', 'text', 'HDFC Bank')}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Lbl>Currency</Lbl>
              <select
                value={form.currency}
                onChange={e => setForm(p => ({ ...p, currency: e.target.value, country: e.target.value === 'AED' ? 'UAE' : 'India' }))}
                className="wl-input"
                onFocus={e => (e.target.style.borderColor = 'var(--sage)')}
                onBlur={e => (e.target.style.borderColor = 'var(--border)')}>
                <option value="INR">₹ INR — India</option>
                <option value="AED">AED — UAE</option>
              </select>
            </div>
            {inp('Last 4 Digits', 'last_four', 'text', '4521')}
          </div>

          {isCreditCard && (
            <>
              <div className="grid grid-cols-2 gap-3">
                {inp('Credit Limit', 'credit_limit', 'number', '400000')}
                {inp('Outstanding Balance', 'outstanding_bal', 'number', '82000')}
              </div>
              <div className="grid grid-cols-2 gap-3">
                {inp('Minimum Due', 'minimum_due', 'number', '16400')}
                {inp('Payment Due Date', 'due_date', 'date')}
              </div>
            </>
          )}

          {!isCreditCard && (
            <div className="grid grid-cols-2 gap-3">
              {inp('Current Balance', 'outstanding_bal', 'number', '125000')}
              <div>
                <Lbl>Account Type</Lbl>
                <select value={form.account_type} onChange={f('account_type')}
                  className="wl-input"
                  onFocus={e => (e.target.style.borderColor = 'var(--sage)')}
                  onBlur={e => (e.target.style.borderColor = 'var(--border)')}>
                  <option value="savings">Savings</option>
                  <option value="current">Current</option>
                  <option value="salary">Salary</option>
                  <option value="nre">NRE</option>
                  <option value="nro">NRO</option>
                  <option value="joint">Joint</option>
                  <option value="wallet">Wallet</option>
                </select>
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-3 mt-5">
          <button onClick={onClose}
            className="flex-1 py-2.5 rounded-lg text-[12px] font-semibold transition-all"
            style={{ border: '1px solid var(--border)', color: 'var(--text3)', background: 'var(--bg2)' }}>
            Cancel
          </button>
          <button onClick={save} disabled={saving}
            className="flex-1 py-2.5 rounded-lg text-white text-[12px] font-bold flex items-center justify-center gap-2 disabled:opacity-50 transition-all"
            style={{ background: 'var(--sage)' }}>
            {saving ? <><Loader2 size={14} className="animate-spin" />Saving…</> : title}
          </button>
        </div>
      </div>
    </div>
  )
}
