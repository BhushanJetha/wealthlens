'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { X, Loader2 } from 'lucide-react'
import { useRouter } from 'next/navigation'

type InvType = 'stock' | 'mutual_fund' | 'fixed_deposit' | 'recurring_deposit'

export default function AddInvestmentModal({ onClose }: { onClose: () => void }) {
  const [type, setType] = useState<InvType>('stock')
  const [form, setForm] = useState<Record<string, string>>({ currency: 'INR', country: 'India', fund_type: 'equity' })
  const [saving, setSaving] = useState(false)
  const supabase = createClient()
  const router = useRouter()

  function f(key: string) { return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm(p => ({ ...p, [key]: e.target.value })) }

  async function save() {
    setSaving(true)
    const table = type === 'stock' ? 'stocks' : type === 'mutual_fund' ? 'mutual_funds' : type === 'fixed_deposit' ? 'fixed_deposits' : 'recurring_deposits'
    let payload: any = {}

    if (type === 'stock') payload = { symbol: form.symbol, name: form.name, exchange: form.exchange ?? 'NSE', currency: form.currency, country: form.country, quantity: Number(form.quantity), avg_buy_price: Number(form.avg_buy_price), sector: form.sector }
    if (type === 'mutual_fund') payload = { fund_name: form.name, fund_type: form.fund_type, units: Number(form.units), avg_nav: Number(form.avg_nav), invested_amount: Number(form.invested_amount), currency: form.currency, country: form.country }
    if (type === 'fixed_deposit') payload = { name: form.name, bank_name: form.bank_name, principal: Number(form.principal), interest_rate: Number(form.interest_rate), start_date: form.start_date, maturity_date: form.maturity_date, currency: form.currency, country: form.country }
    if (type === 'recurring_deposit') payload = { name: form.name, bank_name: form.bank_name, monthly_amount: Number(form.monthly_amount), interest_rate: Number(form.interest_rate), start_date: form.start_date, maturity_date: form.maturity_date, tenure_months: Number(form.tenure_months), currency: form.currency, country: form.country }

    await supabase.from(table).insert(payload)
    router.refresh()
    setSaving(false)
    onClose()
  }

  const inp = (label: string, key: string, type2 = 'text', placeholder = '') => (
    <div>
      <label className="block text-[10px] text-slate-500 uppercase tracking-wider mb-1">{label}</label>
      <input type={type2} value={form[key] ?? ''} onChange={f(key)} placeholder={placeholder}
        className="w-full bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2 text-[12px] text-white focus:outline-none focus:border-[#00C9A7] transition-colors" />
    </div>
  )

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-[#162032] border border-white/10 rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-5">
          <h2 className="text-[15px] font-bold text-white">Add Investment</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-white"><X size={18} /></button>
        </div>

        {/* Type selector */}
        <div className="flex gap-2 flex-wrap mb-5">
          {(['stock','mutual_fund','fixed_deposit','recurring_deposit'] as InvType[]).map(t => (
            <button key={t} onClick={() => setType(t)}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold border transition-all ${type === t ? 'bg-[#00C9A7] border-[#00C9A7] text-black' : 'bg-[#1E2D40] border-white/10 text-slate-400 hover:text-white'}`}>
              {t === 'stock' ? '📈 Stock' : t === 'mutual_fund' ? '📊 Mutual Fund' : t === 'fixed_deposit' ? '🏦 Fixed Deposit' : '🔄 Recurring Deposit'}
            </button>
          ))}
        </div>

        <div className="space-y-3">
          {/* Currency + Country */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] text-slate-500 uppercase tracking-wider mb-1">Currency</label>
              <select value={form.currency} onChange={e => setForm(p => ({ ...p, currency: e.target.value, country: e.target.value === 'AED' ? 'UAE' : 'India' }))}
                className="w-full bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2 text-[12px] text-white focus:outline-none focus:border-[#00C9A7]">
                <option value="INR">INR 🇮🇳</option>
                <option value="AED">AED 🇦🇪</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] text-slate-500 uppercase tracking-wider mb-1">Country</label>
              <input value={form.country} readOnly className="w-full bg-[#0D1B2A]/50 border border-white/5 rounded-lg px-3 py-2 text-[12px] text-slate-400" />
            </div>
          </div>

          {type === 'stock' && <>
            <div className="grid grid-cols-2 gap-3">
              {inp('Symbol', 'symbol', 'text', 'RELIANCE')}
              {inp('Company Name', 'name', 'text', 'Reliance Industries')}
            </div>
            <div className="grid grid-cols-3 gap-3">
              {inp('Exchange', 'exchange', 'text', 'NSE')}
              {inp('Quantity', 'quantity', 'number', '10')}
              {inp('Avg Buy Price', 'avg_buy_price', 'number', '2500')}
            </div>
            {inp('Sector (optional)', 'sector', 'text', 'Energy')}
          </>}

          {type === 'mutual_fund' && <>
            {inp('Fund Name', 'name', 'text', 'Parag Parikh Flex Cap')}
            <div>
              <label className="block text-[10px] text-slate-500 uppercase tracking-wider mb-1">Fund Type</label>
              <select value={form.fund_type} onChange={f('fund_type')}
                className="w-full bg-[#0D1B2A] border border-white/10 rounded-lg px-3 py-2 text-[12px] text-white focus:outline-none focus:border-[#00C9A7]">
                {['equity','debt','hybrid','elss','index','liquid'].map(t => <option key={t} value={t}>{t.toUpperCase()}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {inp('Units', 'units', 'number', '1842.63')}
              {inp('Avg NAV', 'avg_nav', 'number', '68.22')}
              {inp('Invested Amount', 'invested_amount', 'number', '90000')}
            </div>
          </>}

          {type === 'fixed_deposit' && <>
            <div className="grid grid-cols-2 gap-3">
              {inp('FD Name', 'name', 'text', 'HDFC FD')}
              {inp('Bank Name', 'bank_name', 'text', 'HDFC Bank')}
            </div>
            <div className="grid grid-cols-2 gap-3">
              {inp('Principal Amount', 'principal', 'number', '500000')}
              {inp('Interest Rate (%)', 'interest_rate', 'number', '7.1')}
            </div>
            <div className="grid grid-cols-2 gap-3">
              {inp('Start Date', 'start_date', 'date')}
              {inp('Maturity Date', 'maturity_date', 'date')}
            </div>
          </>}

          {type === 'recurring_deposit' && <>
            <div className="grid grid-cols-2 gap-3">
              {inp('RD Name', 'name', 'text', 'ICICI RD')}
              {inp('Bank Name', 'bank_name', 'text', 'ICICI Bank')}
            </div>
            <div className="grid grid-cols-3 gap-3">
              {inp('Monthly Amount', 'monthly_amount', 'number', '10000')}
              {inp('Interest Rate (%)', 'interest_rate', 'number', '6.5')}
              {inp('Tenure (months)', 'tenure_months', 'number', '24')}
            </div>
            <div className="grid grid-cols-2 gap-3">
              {inp('Start Date', 'start_date', 'date')}
              {inp('Maturity Date', 'maturity_date', 'date')}
            </div>
          </>}
        </div>

        <div className="flex gap-3 mt-5">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-lg border border-white/10 text-slate-400 text-[12px] font-semibold hover:bg-white/4">Cancel</button>
          <button onClick={save} disabled={saving}
            className="flex-1 py-2.5 rounded-lg text-black text-[12px] font-bold flex items-center justify-center gap-2 disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg,#00C9A7,#4A90D9)' }}>
            {saving ? <><Loader2 size={14} className="animate-spin" /> Saving…</> : 'Add Investment'}
          </button>
        </div>
      </div>
    </div>
  )
}
