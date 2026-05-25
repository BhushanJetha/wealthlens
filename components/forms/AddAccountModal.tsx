'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { X, Loader2 } from 'lucide-react'
import { useRouter } from 'next/navigation'

interface Props {
  onClose: () => void
  type?: 'credit_card' | 'savings' | 'current' | 'wallet'
}

export default function AddAccountModal({ onClose, type = 'credit_card' }: Props) {
  const [form, setForm] = useState<Record<string, string>>({
    currency: 'INR',
    country: 'India',
    account_type: type,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const supabase = createClient()
  const router = useRouter()

  function f(key: string) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm(p => ({ ...p, [key]: e.target.value }))
  }

  const inp = (label: string, key: string, t = 'text', ph = '') => (
    <div>
      <label className="block text-[10px] text-slate-500 uppercase tracking-wider mb-1.5">{label}</label>
      <input
        type={t} value={form[key] ?? ''} onChange={f(key)} placeholder={ph}
        className="w-full bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2.5 text-[12px] text-white placeholder-slate-600 focus:outline-none focus:border-[#00C9A7] transition-colors"
      />
    </div>
  )

  async function save() {
    if (!form.name || !form.bank_name) { setError('Name and bank are required'); return }
    setSaving(true); setError('')

    const { error: err } = await supabase.from('accounts').insert({
      name:            form.name,
      bank_name:       form.bank_name,
      account_type:    type,
      currency:        form.currency,
      country:         form.country,
      last_four:       form.last_four || null,
      credit_limit:    form.credit_limit    ? Number(form.credit_limit)    : null,
      outstanding_bal: form.outstanding_bal ? Number(form.outstanding_bal) : 0,
      minimum_due:     form.minimum_due     ? Number(form.minimum_due)     : null,
      due_date:        form.due_date        || null,
    })

    setSaving(false)
    if (err) { setError(err.message); return }
    router.refresh()
    onClose()
  }

  const isCreditCard = type === 'credit_card'
  const title = isCreditCard ? 'Add Credit Card' : 'Add Bank Account'

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-[#162032] border border-white/10 rounded-2xl p-6 w-full max-w-md">
        <div className="flex justify-between items-center mb-5">
          <h2 className="text-[15px] font-bold text-white">{title}</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>

        {error && (
          <div className="bg-rose-500/10 border border-rose-500/20 rounded-lg p-3 text-rose-400 text-[12px] mb-4">
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
              <label className="block text-[10px] text-slate-500 uppercase tracking-wider mb-1.5">Currency</label>
              <select
                value={form.currency}
                onChange={e => setForm(p => ({ ...p, currency: e.target.value, country: e.target.value === 'AED' ? 'UAE' : 'India' }))}
                className="w-full bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2.5 text-[12px] text-white focus:outline-none focus:border-[#00C9A7] transition-colors"
              >
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
                <label className="block text-[10px] text-slate-500 uppercase tracking-wider mb-1.5">Account Type</label>
                <select
                  value={form.account_type}
                  onChange={f('account_type')}
                  className="w-full bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2.5 text-[12px] text-white focus:outline-none focus:border-[#00C9A7] transition-colors"
                >
                  <option value="savings">Savings</option>
                  <option value="current">Current</option>
                  <option value="wallet">Wallet</option>
                </select>
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-3 mt-5">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-lg border border-white/10 text-slate-400 text-[12px] font-semibold hover:bg-white/4 transition-all"
          >
            Cancel
          </button>
          <button
            onClick={save} disabled={saving}
            className="flex-1 py-2.5 rounded-lg text-black text-[12px] font-bold flex items-center justify-center gap-2 disabled:opacity-50 transition-all"
            style={{ background: 'linear-gradient(135deg,#00C9A7,#4A90D9)' }}
          >
            {saving ? <><Loader2 size={14} className="animate-spin" />Saving…</> : title}
          </button>
        </div>
      </div>
    </div>
  )
}
