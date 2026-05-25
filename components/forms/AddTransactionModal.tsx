'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { X, Loader2, Plus } from 'lucide-react'
import { useRouter } from 'next/navigation'

const CATEGORIES = ['Food','Shopping','Utilities','Transport','Health','Entertainment','Travel','Education','Investment','EMI/Loan','Salary','Transfer','Other']
const CAT_COLORS: Record<string,string> = { Food:'#F4A535',Shopping:'#4A90D9',Utilities:'#7C5CBF',Transport:'#00C9A7',Health:'#3CC68A',Entertainment:'#E8556D',Travel:'#FF8C42',Education:'#A0B0C0',Other:'#6A7F92' }

export default function AddTransactionModal({ onClose, onAdded }: { onClose: () => void; onAdded?: () => void }) {
  const [form, setForm] = useState({
    txn_date: new Date().toISOString().slice(0,10),
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
    return (e: React.ChangeEvent<HTMLInputElement|HTMLSelectElement>) => setForm(p => ({ ...p, [key]: e.target.value }))
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

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-[#162032] border border-white/10 rounded-2xl p-6 w-full max-w-md">
        <div className="flex justify-between items-center mb-5">
          <h2 className="text-[15px] font-bold text-white flex items-center gap-2"><Plus size={16} className="text-[#00C9A7]" />Add Transaction</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors"><X size={18} /></button>
        </div>

        {error && <div className="bg-rose-500/10 border border-rose-500/20 rounded-lg p-3 text-rose-400 text-[12px] mb-4">{error}</div>}

        <div className="space-y-3">
          {/* Type toggle */}
          <div>
            <label className="block text-[10px] text-slate-500 uppercase tracking-wider mb-1.5">Type</label>
            <div className="flex gap-2">
              {['expense','income','transfer'].map(t => (
                <button key={t} onClick={() => setForm(p => ({ ...p, txn_type: t }))}
                  className={`flex-1 py-2 rounded-lg text-[11px] font-bold border transition-all capitalize ${
                    form.txn_type === t
                      ? t === 'expense' ? 'bg-rose-500/20 border-rose-500/40 text-rose-400'
                        : t === 'income' ? 'bg-[#3CC68A]/20 border-[#3CC68A]/40 text-[#3CC68A]'
                        : 'bg-[#4A90D9]/20 border-[#4A90D9]/40 text-[#4A90D9]'
                      : 'bg-[#1E2D40] border-white/8 text-slate-500 hover:text-slate-300'
                  }`}>
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Date + Merchant */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] text-slate-500 uppercase tracking-wider mb-1.5">Date</label>
              <input type="date" value={form.txn_date} onChange={f('txn_date')}
                className="w-full bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2.5 text-[12px] text-white focus:outline-none focus:border-[#00C9A7] transition-colors" />
            </div>
            <div>
              <label className="block text-[10px] text-slate-500 uppercase tracking-wider mb-1.5">Currency</label>
              <select value={form.currency} onChange={f('currency')}
                className="w-full bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2.5 text-[12px] text-white focus:outline-none focus:border-[#00C9A7]">
                <option value="INR">₹ INR — India</option>
                <option value="AED">AED — UAE</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-[10px] text-slate-500 uppercase tracking-wider mb-1.5">Merchant / Description</label>
            <input type="text" value={form.merchant} onChange={f('merchant')} placeholder="e.g. Carrefour, Amazon, DEWA"
              className="w-full bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2.5 text-[12px] text-white placeholder-slate-600 focus:outline-none focus:border-[#00C9A7] transition-colors" />
          </div>

          {/* Amount */}
          <div>
            <label className="block text-[10px] text-slate-500 uppercase tracking-wider mb-1.5">Amount</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-[12px] font-mono">{form.currency === 'AED' ? 'AED' : '₹'}</span>
              <input type="number" value={form.amount} onChange={f('amount')} placeholder="0.00"
                className="w-full bg-[#0D1B2A] border border-white/10 rounded-lg pl-12 pr-3 py-2.5 text-[14px] font-mono font-bold text-white placeholder-slate-600 focus:outline-none focus:border-[#00C9A7] transition-colors" />
            </div>
          </div>

          {/* Category */}
          <div>
            <label className="block text-[10px] text-slate-500 uppercase tracking-wider mb-1.5">Category</label>
            <div className="flex flex-wrap gap-1.5">
              {CATEGORIES.map(c => (
                <button key={c} onClick={() => setForm(p => ({ ...p, category: c }))}
                  className="px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all border"
                  style={form.category === c
                    ? { background: (CAT_COLORS[c] ?? '#00C9A7') + '33', borderColor: (CAT_COLORS[c] ?? '#00C9A7') + '60', color: CAT_COLORS[c] ?? '#00C9A7' }
                    : { background: '#1E2D40', borderColor: 'rgba(255,255,255,0.08)', color: '#6A7F92' }
                  }>
                  {c}
                </button>
              ))}
            </div>
          </div>

          {/* Account (optional) */}
          {accounts.length > 0 && (
            <div>
              <label className="block text-[10px] text-slate-500 uppercase tracking-wider mb-1.5">Account (optional)</label>
              <select value={form.account_id} onChange={f('account_id')}
                className="w-full bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2.5 text-[12px] text-white focus:outline-none focus:border-[#00C9A7]">
                <option value="">No account linked</option>
                {accounts.filter(a => a.currency === form.currency).map(a => (
                  <option key={a.id} value={a.id}>{a.name} ({a.bank_name})</option>
                ))}
              </select>
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="block text-[10px] text-slate-500 uppercase tracking-wider mb-1.5">Notes (optional)</label>
            <input type="text" value={form.description} onChange={f('description')} placeholder="Additional details"
              className="w-full bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2.5 text-[12px] text-white placeholder-slate-600 focus:outline-none focus:border-[#00C9A7] transition-colors" />
          </div>
        </div>

        <div className="flex gap-3 mt-5">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-lg border border-white/10 text-slate-400 text-[12px] font-semibold hover:bg-white/4 transition-all">Cancel</button>
          <button onClick={save} disabled={saving}
            className="flex-1 py-2.5 rounded-lg text-black text-[12px] font-bold flex items-center justify-center gap-2 disabled:opacity-50 transition-all"
            style={{ background: 'linear-gradient(135deg,#00C9A7,#4A90D9)' }}>
            {saving ? <><Loader2 size={14} className="animate-spin" />Saving…</> : 'Add Transaction'}
          </button>
        </div>
      </div>
    </div>
  )
}
