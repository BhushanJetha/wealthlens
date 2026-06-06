'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { X, Loader2, Save } from 'lucide-react'
import { useRouter } from 'next/navigation'

type InvType = 'stock' | 'mutual_fund' | 'fixed_deposit' | 'recurring_deposit' | 'nps' | 'lic' | 'gold' | 'bond' | 'etf'

interface Props {
  onClose: () => void
  defaultType?: InvType
  editData?: any
}

const TYPE_LABELS: Record<InvType, string> = {
  stock: 'Stock', mutual_fund: 'Mutual Fund', fixed_deposit: 'Fixed Deposit',
  recurring_deposit: 'Recurring Deposit', nps: 'NPS', lic: 'LIC Policy',
  gold: 'Gold', bond: 'Bond', etf: 'ETF',
}

export default function AddInvestmentModal({ onClose, defaultType = 'stock', editData }: Props) {
  const isEdit = !!editData
  const initialType: InvType = editData?._type ?? defaultType
  const [type, setType] = useState<InvType>(initialType)
  const [form, setForm] = useState<Record<string, string>>({
    currency: 'INR', country: 'India', fund_type: 'equity',
    exchange: 'NSE', tier: 'Tier I', premium_frequency: 'Annually',
    gold_type: 'physical', bond_type: 'govt', etf_type: 'equity',
    holder_name: 'Self',
    ...( editData ? Object.fromEntries(Object.entries(editData).map(([k,v])=>[k, String(v??'')])) : {} ),
  })
  const [saving, setSaving] = useState(false)
  const [members, setMembers] = useState<{ name: string }[]>([])
  const supabase = createClient()
  const router = useRouter()

  useEffect(() => {
    supabase.from('family_members').select('name').eq('is_active', true).order('created_at')
      .then(({ data }) => setMembers(data ?? []))
  }, [])

  const f = (key: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(p => ({ ...p, [key]: e.target.value }))

  const inp = (label: string, key: string, type2 = 'text', placeholder = '') => (
    <div>
      <label className="block text-[10px] uppercase tracking-wider mb-1 font-semibold" style={{ color:'var(--text3)' }}>{label}</label>
      <input type={type2} value={form[key] ?? ''} onChange={f(key)} placeholder={placeholder}
        className="w-full rounded-lg px-3 py-2 text-[12px] focus:outline-none transition-colors"
        style={{ background:'var(--bg2)', border:'1px solid var(--border)', color:'var(--text)' }}
        onFocus={e=>(e.target.style.borderColor='var(--sage)')}
        onBlur={e=>(e.target.style.borderColor='var(--border)')}
      />
    </div>
  )

  const sel = (label: string, key: string, options: {value:string;label:string}[]) => (
    <div>
      <label className="block text-[10px] uppercase tracking-wider mb-1 font-semibold" style={{ color:'var(--text3)' }}>{label}</label>
      <select value={form[key]??''} onChange={f(key)}
        className="w-full rounded-lg px-3 py-2 text-[12px] focus:outline-none"
        style={{ background:'var(--bg2)', border:'1px solid var(--border)', color:'var(--text)' }}>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  )

  async function save() {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    const tableMap: Record<InvType, string> = {
      stock: 'stocks', mutual_fund: 'mutual_funds', fixed_deposit: 'fixed_deposits',
      recurring_deposit: 'recurring_deposits', nps: 'nps_accounts', lic: 'lic_policies',
      gold: 'gold_investments', bond: 'bond_investments', etf: 'etf_investments',
    }
    const table = tableMap[type]
    const cur = form.currency || 'INR'
    const ctry = cur === 'AED' ? 'UAE' : 'India'

    let payload: any = { currency: cur, country: ctry, holder_name: form.holder_name || 'Self' }

    if (type === 'stock') payload = { ...payload,
      symbol: form.symbol, name: form.name, exchange: form.exchange,
      quantity: Number(form.quantity), avg_buy_price: Number(form.avg_buy_price), sector: form.sector,
    }
    if (type === 'mutual_fund') payload = { ...payload,
      fund_name: form.fund_name || form.name, fund_type: form.fund_type,
      units: Number(form.units), avg_nav: Number(form.avg_nav), invested_amount: Number(form.invested_amount),
      ...(isEdit ? {} : { source: 'manual' }),
    }
    if (type === 'fixed_deposit') payload = { ...payload,
      name: form.name, bank_name: form.bank_name, principal: Number(form.principal),
      interest_rate: Number(form.interest_rate), start_date: form.start_date, maturity_date: form.maturity_date,
    }
    if (type === 'recurring_deposit') payload = { ...payload,
      name: form.name, bank_name: form.bank_name, monthly_amount: Number(form.monthly_amount),
      interest_rate: Number(form.interest_rate), start_date: form.start_date, maturity_date: form.maturity_date,
      tenure_months: Number(form.tenure_months),
    }
    if (type === 'nps') payload = { ...payload,
      name: form.name, pran_number: form.pran_number, tier: form.tier,
      corpus_amount: Number(form.corpus_amount), invested_amount: Number(form.invested_amount),
      equity_allocation: Number(form.equity_allocation ?? 0),
      corporate_bond_allocation: Number(form.corporate_bond_allocation ?? 0),
      govt_securities_allocation: Number(form.govt_securities_allocation ?? 0),
      fund_manager: form.fund_manager, start_date: form.start_date,
    }
    if (type === 'lic') payload = { ...payload,
      name: form.name, policy_number: form.policy_number, plan_name: form.plan_name,
      sum_assured: Number(form.sum_assured), annual_premium: Number(form.annual_premium),
      premium_frequency: form.premium_frequency,
      premium_paid_years: Number(form.premium_paid_years ?? 0),
      policy_term_years: Number(form.policy_term_years ?? 0),
      start_date: form.start_date, maturity_date: form.maturity_date,
      bonus_accrued: Number(form.bonus_accrued ?? 0),
      next_premium_date: form.next_premium_date,
      total_paid: Number(form.total_paid ?? 0),
    }
    if (type === 'gold') payload = { ...payload,
      name: form.name, gold_type: form.gold_type,
      quantity_grams: form.quantity_grams ? Number(form.quantity_grams) : null,
      buy_price_per_gram: form.buy_price_per_gram ? Number(form.buy_price_per_gram) : null,
      current_price_per_gram: form.current_price_per_gram ? Number(form.current_price_per_gram) : null,
      invested_amount: Number(form.invested_amount || 0), purchase_date: form.purchase_date, notes: form.notes,
    }
    if (type === 'bond') payload = { ...payload,
      name: form.name, bond_type: form.bond_type,
      face_value: Number(form.face_value || 0), quantity: Number(form.quantity || 1),
      coupon_rate: form.coupon_rate ? Number(form.coupon_rate) : null,
      maturity_date: form.maturity_date, invested_amount: Number(form.invested_amount || 0),
      purchase_date: form.purchase_date, notes: form.notes,
    }
    if (type === 'etf') payload = { ...payload,
      etf_name: form.etf_name || form.name, symbol: form.symbol,
      exchange: form.exchange || 'NSE', units: Number(form.units || 0),
      avg_buy_price: Number(form.avg_buy_price || 0), etf_type: form.etf_type,
      invested_amount: Number(form.invested_amount || 0), purchase_date: form.purchase_date,
    }

    // Write; if a column doesn't exist yet (e.g. migration not run), strip it & retry
    const stripRetry = async (run: (p: any) => any, init: any) => {
      let p = init
      for (let t = 0; t < 4; t++) {
        const { error } = await run(p)
        if (!error) return
        const col = error.message?.match(/'([a-zA-Z_]+)' column/)?.[1] ?? error.message?.match(/column "?([a-zA-Z_]+)"?/i)?.[1]
        if (col && (error.code === 'PGRST204' || /column/i.test(error.message))) { const c = { ...p }; delete c[col]; p = c; continue }
        return
      }
    }
    if (isEdit && editData?.id) {
      await stripRetry(p => supabase.from(table).update(p).eq('id', editData.id), payload)
    } else {
      await stripRetry(p => supabase.from(table).insert(p), { ...payload, user_id: user!.id })
    }

    router.refresh()
    setSaving(false)
    onClose()
  }

  const btnStyle = (active: boolean) => ({
    padding: '5px 10px', borderRadius: 7, fontSize: 11, fontWeight: 600,
    border: `1px solid ${active ? 'var(--sage)' : 'var(--border)'}`,
    background: active ? 'var(--sage)' : 'transparent',
    color: active ? '#fff' : 'var(--text3)',
    cursor: 'pointer',
  } as React.CSSProperties)

  return (
    <div className="fixed inset-0 bg-black/40 z-50 overflow-y-auto">
      <div className="flex min-h-full items-center justify-center p-4 py-8">
        <div className="wl-card p-6 w-full max-w-lg">
          <div className="flex justify-between items-center mb-5">
            <h2 className="text-[15px] font-bold" style={{ color:'var(--text)' }}>
              {isEdit ? `Edit ${TYPE_LABELS[type]}` : 'Add Investment'}
            </h2>
            <button onClick={onClose} style={{ color:'var(--text3)' }}><X size={18} /></button>
          </div>

          {/* Type selector (hidden in edit mode) */}
          {!isEdit && (
            <div className="flex gap-1.5 flex-wrap mb-5">
              {(Object.keys(TYPE_LABELS) as InvType[]).map(t => (
                <button key={t} onClick={() => setType(t)} style={btnStyle(type === t)}>
                  {TYPE_LABELS[t]}
                </button>
              ))}
            </div>
          )}

          <div className="space-y-3">
            {/* Holder */}
            <div>
              <label className="block text-[10px] uppercase tracking-wider mb-1 font-semibold" style={{ color:'var(--text3)' }}>
                Invested In Name Of
              </label>
              <select value={form.holder_name ?? 'Self'} onChange={f('holder_name')}
                className="w-full rounded-lg px-3 py-2 text-[12px] focus:outline-none"
                style={{ background:'var(--bg2)', border:'1px solid var(--border)', color:'var(--text)' }}>
                <option value="Self">Self</option>
                {members.map(m => <option key={m.name} value={m.name}>{m.name}</option>)}
              </select>
            </div>

            {/* Currency row */}
            <div className="grid grid-cols-2 gap-3">
              {sel('Currency', 'currency', [{ value:'INR',label:'INR 🇮🇳' }, { value:'AED',label:'AED 🇦🇪' }])}
              <div>
                <label className="block text-[10px] uppercase tracking-wider mb-1 font-semibold" style={{ color:'var(--text3)' }}>Country</label>
                <input value={form.currency === 'AED' ? 'UAE' : 'India'} readOnly
                  className="w-full rounded-lg px-3 py-2 text-[12px]"
                  style={{ background:'var(--bg2)', border:'1px solid var(--border)', color:'var(--text3)' }} />
              </div>
            </div>

            {/* Stock */}
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

            {/* Mutual Fund */}
            {type === 'mutual_fund' && <>
              {inp('Fund Name', 'fund_name', 'text', 'Parag Parikh Flex Cap')}
              {sel('Fund Type', 'fund_type', ['equity','debt','hybrid','elss','index','liquid'].map(t=>({ value:t, label:t.toUpperCase() })))}
              <div className="grid grid-cols-3 gap-3">
                {inp('Units', 'units', 'number', '1842.63')}
                {inp('Avg NAV', 'avg_nav', 'number', '68.22')}
                {inp('Invested Amount', 'invested_amount', 'number', '90000')}
              </div>
            </>}

            {/* ETF */}
            {type === 'etf' && <>
              <div className="grid grid-cols-2 gap-3">
                {inp('ETF Name', 'etf_name', 'text', 'Nifty 50 ETF')}
                {inp('Symbol', 'symbol', 'text', 'NIFTYBEES')}
              </div>
              <div className="grid grid-cols-2 gap-3">
                {inp('Exchange', 'exchange', 'text', 'NSE')}
                {sel('ETF Type', 'etf_type', ['equity','debt','gold','index','international'].map(t=>({ value:t, label:t.toUpperCase() })))}
              </div>
              <div className="grid grid-cols-3 gap-3">
                {inp('Units', 'units', 'number', '500')}
                {inp('Avg Buy Price', 'avg_buy_price', 'number', '220')}
                {inp('Invested Amount', 'invested_amount', 'number', '110000')}
              </div>
              {inp('Purchase Date', 'purchase_date', 'date')}
            </>}

            {/* Gold */}
            {type === 'gold' && <>
              {inp('Name / Description', 'name', 'text', 'Gold Jewellery / SGB 2024')}
              {sel('Gold Type', 'gold_type', [
                { value:'physical', label:'Physical Gold' }, { value:'sgb', label:'Sovereign Gold Bond' },
                { value:'gold_etf', label:'Gold ETF' }, { value:'gold_mf', label:'Gold Mutual Fund' },
              ])}
              <div className="grid grid-cols-2 gap-3">
                {inp('Quantity (grams)', 'quantity_grams', 'number', '50')}
                {inp('Buy Price / gram', 'buy_price_per_gram', 'number', '5800')}
              </div>
              <div className="grid grid-cols-2 gap-3">
                {inp('Invested Amount', 'invested_amount', 'number', '290000')}
                {inp('Purchase Date', 'purchase_date', 'date')}
              </div>
            </>}

            {/* Bond */}
            {type === 'bond' && <>
              {inp('Bond Name', 'name', 'text', 'RBI 7.75% Bond 2023')}
              {sel('Bond Type', 'bond_type', [
                { value:'govt', label:'Government Bond' }, { value:'corporate', label:'Corporate Bond' },
                { value:'tax_free', label:'Tax Free Bond' }, { value:'rbi_bonds', label:'RBI Bonds' }, { value:'sgb', label:'SGB' },
              ])}
              <div className="grid grid-cols-2 gap-3">
                {inp('Face Value (₹)', 'face_value', 'number', '1000')}
                {inp('Quantity', 'quantity', 'number', '100')}
              </div>
              <div className="grid grid-cols-2 gap-3">
                {inp('Coupon Rate (%)', 'coupon_rate', 'number', '7.75')}
                {inp('Invested Amount', 'invested_amount', 'number', '100000')}
              </div>
              <div className="grid grid-cols-2 gap-3">
                {inp('Purchase Date', 'purchase_date', 'date')}
                {inp('Maturity Date', 'maturity_date', 'date')}
              </div>
            </>}

            {/* Fixed Deposit */}
            {type === 'fixed_deposit' && <>
              <div className="grid grid-cols-2 gap-3">
                {inp('FD Name', 'name', 'text', 'HDFC FD 2024')}
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

            {/* Recurring Deposit */}
            {type === 'recurring_deposit' && <>
              <div className="grid grid-cols-2 gap-3">
                {inp('RD Name', 'name', 'text', 'ICICI RD 2024')}
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

            {/* NPS */}
            {type === 'nps' && <>
              {inp('Account Name', 'name', 'text', 'My NPS Account')}
              <div className="grid grid-cols-2 gap-3">
                {inp('PRAN Number', 'pran_number', 'text', '110123456789')}
                {sel('Tier', 'tier', [{ value:'Tier I', label:'Tier I (Mandatory)' }, { value:'Tier II', label:'Tier II (Voluntary)' }])}
              </div>
              <div className="grid grid-cols-2 gap-3">
                {inp('Current Corpus (₹)', 'corpus_amount', 'number', '300000')}
                {inp('Total Invested (₹)', 'invested_amount', 'number', '250000')}
              </div>
              {inp('Fund Manager', 'fund_manager', 'text', 'HDFC Pension Management')}
              <div className="grid grid-cols-3 gap-3">
                {inp('Equity %', 'equity_allocation', 'number', '60')}
                {inp('Corp Bond %', 'corporate_bond_allocation', 'number', '20')}
                {inp('Govt Sec %', 'govt_securities_allocation', 'number', '20')}
              </div>
              {inp('Start Date', 'start_date', 'date')}
            </>}

            {/* LIC */}
            {type === 'lic' && <>
              {inp('Policy Name', 'name', 'text', 'LIC Jeevan Anand')}
              <div className="grid grid-cols-2 gap-3">
                {inp('Policy Number', 'policy_number', 'text', '12345678')}
                {inp('Plan Name', 'plan_name', 'text', 'Jeevan Anand (Plan 815)')}
              </div>
              <div className="grid grid-cols-2 gap-3">
                {inp('Sum Assured (₹)', 'sum_assured', 'number', '1000000')}
                {inp('Annual Premium (₹)', 'annual_premium', 'number', '50000')}
              </div>
              <div className="grid grid-cols-2 gap-3">
                {sel('Premium Frequency', 'premium_frequency', [
                  { value:'Monthly',label:'Monthly' }, { value:'Quarterly',label:'Quarterly' },
                  { value:'Half-Yearly',label:'Half-Yearly' }, { value:'Annually',label:'Annually' }
                ])}
                {inp('Policy Term (years)', 'policy_term_years', 'number', '20')}
              </div>
              <div className="grid grid-cols-2 gap-3">
                {inp('Premium Paid Years', 'premium_paid_years', 'number', '5')}
                {inp('Bonus Accrued (₹)', 'bonus_accrued', 'number', '25000')}
              </div>
              <div className="grid grid-cols-2 gap-3">
                {inp('Total Paid So Far (₹)', 'total_paid', 'number', '250000')}
                {inp('Next Premium Date', 'next_premium_date', 'date')}
              </div>
              <div className="grid grid-cols-2 gap-3">
                {inp('Start Date', 'start_date', 'date')}
                {inp('Maturity Date', 'maturity_date', 'date')}
              </div>
            </>}
          </div>

          <div className="flex gap-3 mt-5">
            <button onClick={onClose} className="flex-1 py-2.5 rounded-lg border text-[12px] font-semibold"
              style={{ borderColor:'var(--border)', color:'var(--text3)' }}>Cancel</button>
            <button onClick={save} disabled={saving}
              className="flex-1 py-2.5 rounded-lg text-white text-[12px] font-bold flex items-center justify-center gap-2 disabled:opacity-50"
              style={{ background:'var(--sage)' }}>
              {saving ? <><Loader2 size={14} className="animate-spin" /> Saving…</> : <><Save size={14} /> {isEdit ? 'Save Changes' : 'Add Investment'}</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
