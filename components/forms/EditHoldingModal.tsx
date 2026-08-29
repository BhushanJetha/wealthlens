'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { X, Loader2, Save } from 'lucide-react'
import { useRouter } from 'next/navigation'

type Kind = 'stock' | 'mutual_fund'

const LBL = 'block text-[10px] uppercase tracking-wider mb-1 font-semibold'
const INP = 'w-full rounded-lg px-3 py-2 text-[13px] focus:outline-none'
const inpStyle = { background: 'var(--bg2)', border: '1px solid var(--border)', color: 'var(--text)' } as const

// Module-level so the input identity is stable across renders → never loses focus.
function Field({ label, value, onChange, type = 'text', numeric = false }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; numeric?: boolean
}) {
  return (
    <div>
      <label className={LBL} style={{ color: 'var(--text3)' }}>{label}</label>
      <input type={type} inputMode={numeric ? 'decimal' : undefined} value={value}
        onChange={e => onChange(numeric ? e.target.value.replace(/[^0-9.]/g, '') : e.target.value)}
        className={INP} style={inpStyle} />
    </div>
  )
}
function Select({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[]
}) {
  return (
    <div>
      <label className={LBL} style={{ color: 'var(--text3)' }}>{label}</label>
      <select value={value} onChange={e => onChange(e.target.value)} className={INP} style={inpStyle}>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  )
}

export default function EditHoldingModal({ kind, row, onClose }: {
  kind: Kind; row: any; onClose: () => void
}) {
  const isStock = kind === 'stock'
  const [form, setForm] = useState<Record<string, string>>(() => {
    const s = (v: any) => (v == null ? '' : String(v))
    const base: Record<string, string> = isStock
      ? { symbol: s(row.symbol), name: s(row.name), exchange: s(row.exchange || 'NSE'), sector: s(row.sector),
          quantity: s(row.quantity), avg_buy_price: s(row.avg_buy_price),
          currency: s(row.currency || 'INR'), holder_name: s(row.holder_name || 'Self') }
      : { fund_name: s(row.fund_name), fund_type: s(row.fund_type || 'equity'),
          units: s(row.units), avg_nav: s(row.avg_nav), invested_amount: s(row.invested_amount),
          currency: s(row.currency || 'INR'), holder_name: s(row.holder_name || 'Self') }
    return base
  })
  const [members, setMembers] = useState<{ name: string }[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const supabase = createClient()
  const router = useRouter()

  useEffect(() => {
    supabase.from('family_members').select('name').eq('is_active', true).order('created_at')
      .then(({ data }) => setMembers(data ?? []))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k: string) => (v: string) => setForm(p => ({ ...p, [k]: v }))

  async function save() {
    setError('')
    if (isStock && !form.symbol.trim()) { setError('Symbol is required.'); return }
    if (!isStock && !form.fund_name.trim()) { setError('Fund name is required.'); return }
    setSaving(true)
    const country = form.currency === 'AED' ? 'UAE' : 'India'
    const payload: any = isStock
      ? { symbol: form.symbol.trim(), name: form.name.trim() || form.symbol.trim(), exchange: form.exchange || 'NSE',
          sector: form.sector || null, quantity: Number(form.quantity || 0), avg_buy_price: Number(form.avg_buy_price || 0),
          currency: form.currency, country, holder_name: form.holder_name || 'Self' }
      : { fund_name: form.fund_name.trim(), fund_type: form.fund_type, units: Number(form.units || 0),
          avg_nav: Number(form.avg_nav || 0), invested_amount: Number(form.invested_amount || 0),
          currency: form.currency, country, holder_name: form.holder_name || 'Self' }
    const table = isStock ? 'stocks' : 'mutual_funds'
    const { error: e } = await supabase.from(table).update(payload).eq('id', row.id)
    setSaving(false)
    if (e) { setError(e.message || 'Could not save.'); return }
    router.refresh()
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 overflow-y-auto">
      <div className="flex min-h-full items-start sm:items-center justify-center p-4 py-8">
        <div className="wl-card p-5 w-full max-w-md">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-[15px] font-bold" style={{ color: 'var(--text)' }}>
              Edit {isStock ? 'Stock' : 'Mutual Fund'}
            </h2>
            <button onClick={onClose} style={{ color: 'var(--text3)' }}><X size={18} /></button>
          </div>

          {error && (
            <div className="rounded-lg p-3 text-[12px] mb-3" style={{ background: 'var(--rose-bg)', border: '1px solid var(--rose)', color: 'var(--rose)' }}>
              {error}
            </div>
          )}

          <div className="space-y-3">
            {isStock ? (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Symbol" value={form.symbol} onChange={set('symbol')} />
                  <Field label="Company Name" value={form.name} onChange={set('name')} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Exchange" value={form.exchange} onChange={set('exchange')} />
                  <Field label="Sector" value={form.sector} onChange={set('sector')} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Quantity" numeric value={form.quantity} onChange={set('quantity')} />
                  <Field label="Avg Buy Price" numeric value={form.avg_buy_price} onChange={set('avg_buy_price')} />
                </div>
              </>
            ) : (
              <>
                <Field label="Fund Name" value={form.fund_name} onChange={set('fund_name')} />
                <div className="grid grid-cols-2 gap-3">
                  <Select label="Fund Type" value={form.fund_type} onChange={set('fund_type')}
                    options={['equity', 'debt', 'hybrid', 'elss', 'index', 'liquid'].map(t => ({ value: t, label: t.toUpperCase() }))} />
                  <Field label="Units" numeric value={form.units} onChange={set('units')} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Avg NAV" numeric value={form.avg_nav} onChange={set('avg_nav')} />
                  <Field label="Invested Amount" numeric value={form.invested_amount} onChange={set('invested_amount')} />
                </div>
              </>
            )}

            <div className="grid grid-cols-2 gap-3">
              <Select label="Currency" value={form.currency} onChange={set('currency')}
                options={[{ value: 'INR', label: 'INR 🇮🇳' }, { value: 'AED', label: 'AED 🇦🇪' }]} />
              <Select label="In Name Of" value={form.holder_name} onChange={set('holder_name')}
                options={[{ value: 'Self', label: 'Self' }, ...members.map(m => ({ value: m.name, label: m.name }))]} />
            </div>
          </div>

          <div className="flex gap-3 mt-4">
            <button onClick={onClose} className="flex-1 py-2.5 rounded-lg border text-[12px] font-semibold"
              style={{ borderColor: 'var(--border)', color: 'var(--text3)' }}>Cancel</button>
            <button onClick={save} disabled={saving}
              className="flex-1 py-2.5 rounded-lg text-white text-[12px] font-bold flex items-center justify-center gap-2 disabled:opacity-50"
              style={{ background: 'var(--sage)' }}>
              {saving ? <><Loader2 size={14} className="animate-spin" /> Saving…</> : <><Save size={14} /> Save Changes</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
