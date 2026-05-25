'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { X, Loader2 } from 'lucide-react'
import { useRouter } from 'next/navigation'

export function AddLoanModal({ onClose }: { onClose: () => void }) {
  const [form, setForm] = useState<Record<string,string>>({ currency: 'INR', country: 'India' })
  const [saving, setSaving] = useState(false)
  const supabase = createClient()
  const router = useRouter()
  const f = (key: string) => (e: React.ChangeEvent<HTMLInputElement|HTMLSelectElement>) => setForm(p => ({ ...p, [key]: e.target.value }))
  const inp = (label: string, key: string, type = 'text', placeholder = '') => (
    <div>
      <label className="block text-[10px] text-slate-500 uppercase tracking-wider mb-1">{label}</label>
      <input type={type} value={form[key]??''} onChange={f(key)} placeholder={placeholder}
        className="w-full bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2 text-[12px] text-white focus:outline-none focus:border-[#00C9A7]" />
    </div>
  )

  async function save() {
    setSaving(true)
    await supabase.from('home_loans').insert({
      name: form.name, bank_name: form.bank_name, property_address: form.property_address,
      sanctioned_amt: Number(form.sanctioned_amt), outstanding_amt: Number(form.outstanding_amt),
      emi_amount: Number(form.emi_amount), interest_rate: Number(form.interest_rate),
      loan_start_date: form.loan_start_date, tenure_months: Number(form.tenure_months),
      months_paid: Number(form.months_paid ?? 0), currency: form.currency, country: form.country,
      next_emi_date: form.next_emi_date,
    })
    router.refresh(); setSaving(false); onClose()
  }

  return (
    <Modal title="Add Home Loan" onClose={onClose}>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          {inp('Loan Name', 'name', 'text', 'Dubai Home Loan')}
          {inp('Bank Name', 'bank_name', 'text', 'Mashreq Bank')}
        </div>
        {inp('Property Address (optional)', 'property_address', 'text', '123 JBR, Dubai')}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[10px] text-slate-500 uppercase tracking-wider mb-1">Currency</label>
            <select value={form.currency} onChange={e => setForm(p => ({ ...p, currency: e.target.value, country: e.target.value === 'AED' ? 'UAE' : 'India' }))}
              className="w-full bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2 text-[12px] text-white focus:outline-none focus:border-[#00C9A7]">
              <option value="INR">INR 🇮🇳</option>
              <option value="AED">AED 🇦🇪</option>
            </select>
          </div>
          {inp('Interest Rate (%)', 'interest_rate', 'number', '8.5')}
        </div>
        <div className="grid grid-cols-2 gap-3">
          {inp('Sanctioned Amount', 'sanctioned_amt', 'number', '7500000')}
          {inp('Outstanding Amount', 'outstanding_amt', 'number', '5900000')}
        </div>
        <div className="grid grid-cols-3 gap-3">
          {inp('Monthly EMI', 'emi_amount', 'number', '68000')}
          {inp('Tenure (months)', 'tenure_months', 'number', '240')}
          {inp('Months Paid', 'months_paid', 'number', '56')}
        </div>
        <div className="grid grid-cols-2 gap-3">
          {inp('Loan Start Date', 'loan_start_date', 'date')}
          {inp('Next EMI Date', 'next_emi_date', 'date')}
        </div>
      </div>
      <ModalActions onClose={onClose} onSave={save} saving={saving} label="Add Loan" />
    </Modal>
  )
}

export function AddAccountModal({ onClose, type }: { onClose: () => void; type: 'credit_card' | 'savings' }) {
  const [form, setForm] = useState<Record<string,string>>({ currency: 'INR', country: 'India', account_type: type })
  const [saving, setSaving] = useState(false)
  const supabase = createClient()
  const router = useRouter()
  const f = (key: string) => (e: React.ChangeEvent<HTMLInputElement|HTMLSelectElement>) => setForm(p => ({ ...p, [key]: e.target.value }))
  const inp = (label: string, key: string, t = 'text', ph = '') => (
    <div>
      <label className="block text-[10px] text-slate-500 uppercase tracking-wider mb-1">{label}</label>
      <input type={t} value={form[key]??''} onChange={f(key)} placeholder={ph}
        className="w-full bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2 text-[12px] text-white focus:outline-none focus:border-[#00C9A7]" />
    </div>
  )

  async function save() {
    setSaving(true)
    await supabase.from('accounts').insert({
      name: form.name, bank_name: form.bank_name, account_type: type,
      currency: form.currency, country: form.country,
      last_four: form.last_four, credit_limit: Number(form.credit_limit ?? 0),
      outstanding_bal: Number(form.outstanding_bal ?? 0), minimum_due: Number(form.minimum_due ?? 0),
      due_date: form.due_date || null,
    })
    router.refresh(); setSaving(false); onClose()
  }

  return (
    <Modal title={type === 'credit_card' ? 'Add Credit Card' : 'Add Bank Account'} onClose={onClose}>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          {inp('Card / Account Name', 'name', 'text', 'HDFC Regalia')}
          {inp('Bank Name', 'bank_name', 'text', 'HDFC Bank')}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[10px] text-slate-500 uppercase tracking-wider mb-1">Currency</label>
            <select value={form.currency} onChange={e => setForm(p => ({ ...p, currency: e.target.value, country: e.target.value === 'AED' ? 'UAE' : 'India' }))}
              className="w-full bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2 text-[12px] text-white focus:outline-none focus:border-[#00C9A7]">
              <option value="INR">INR 🇮🇳</option>
              <option value="AED">AED 🇦🇪</option>
            </select>
          </div>
          {inp('Last 4 Digits', 'last_four', 'text', '4521')}
        </div>
        {type === 'credit_card' && <>
          <div className="grid grid-cols-2 gap-3">
            {inp('Credit Limit', 'credit_limit', 'number', '400000')}
            {inp('Outstanding Balance', 'outstanding_bal', 'number', '82000')}
          </div>
          <div className="grid grid-cols-2 gap-3">
            {inp('Minimum Due', 'minimum_due', 'number', '16400')}
            {inp('Due Date', 'due_date', 'date')}
          </div>
        </>}
      </div>
      <ModalActions onClose={onClose} onSave={save} saving={saving} label={type === 'credit_card' ? 'Add Card' : 'Add Account'} />
    </Modal>
  )
}

// Shared helpers
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-[#162032] border border-white/10 rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-5">
          <h2 className="text-[15px] font-bold text-white">{title}</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-white"><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  )
}

function ModalActions({ onClose, onSave, saving, label }: { onClose: () => void; onSave: () => void; saving: boolean; label: string }) {
  return (
    <div className="flex gap-3 mt-5">
      <button onClick={onClose} className="flex-1 py-2.5 rounded-lg border border-white/10 text-slate-400 text-[12px] font-semibold hover:bg-white/4">Cancel</button>
      <button onClick={onSave} disabled={saving}
        className="flex-1 py-2.5 rounded-lg text-black text-[12px] font-bold flex items-center justify-center gap-2 disabled:opacity-50"
        style={{ background: 'linear-gradient(135deg,#00C9A7,#4A90D9)' }}>
        {saving ? <><Loader2 size={14} className="animate-spin" /> Saving…</> : label}
      </button>
    </div>
  )
}

export default AddLoanModal
