'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { X, Loader2, Save, Trash2 } from 'lucide-react'

const LBL = 'block text-[10px] uppercase tracking-wider mb-1 font-semibold'
const INP = 'w-full rounded-lg px-3 py-2 text-[13px] focus:outline-none'
const inpStyle = { background: 'var(--bg2)', border: '1px solid var(--border)', color: 'var(--text)' } as const

// Module-level so the input identity is stable → never loses focus.
function Field({ label, value, onChange, type = 'text', numeric = false }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; numeric?: boolean
}) {
  return (
    <div>
      <label className={LBL} style={{ color: 'var(--text3)' }}>{label}</label>
      <input type={type} inputMode={numeric ? 'decimal' : undefined} value={value}
        max={type === 'date' ? new Date().toISOString().slice(0, 10) : undefined}
        onChange={e => onChange(numeric ? e.target.value.replace(/[^0-9.]/g, '') : e.target.value)}
        className={INP} style={inpStyle} />
    </div>
  )
}

// Edit or delete one recorded purchase lot (investment_transactions row) and
// re-adjust the parent holding's aggregate (quantity+avg for stocks; units +
// invested + avg NAV for mutual funds).
export default function EditLotModal({ kind = 'stock', holding, lot, onClose }: {
  kind?: 'stock' | 'mutual_fund'; holding: any; lot: any; onClose: () => void
}) {
  const isStock = kind === 'stock'
  const [date, setDate]   = useState<string>(lot.txn_date ?? new Date().toISOString().slice(0, 10))
  const [qty, setQty]     = useState<string>(String(lot.units ?? ''))
  const [price, setPrice] = useState<string>(String(lot.nav ?? ''))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const supabase = createClient()

  const sym = holding.currency === 'AED' ? 'AED ' : '₹'
  const title = isStock ? (holding.symbol ?? '') : (holding.fund_name ?? '')

  // Apply a change of (deltaUnits, deltaAmount) to the holding's aggregate.
  async function applyHoldingDelta(deltaUnits: number, deltaAmount: number) {
    if (isStock) {
      const newQty = Number(holding.quantity || 0) + deltaUnits
      const newInvested = Number(holding.quantity || 0) * Number(holding.avg_buy_price || 0) + deltaAmount
      const newAvg = newQty > 0 ? newInvested / newQty : 0
      await supabase.from('stocks').update({ quantity: newQty, avg_buy_price: newAvg }).eq('id', holding.id)
    } else {
      const newUnits = Number(holding.units || 0) + deltaUnits
      const newInvested = Number(holding.invested_amount || 0) + deltaAmount
      const newNav = newUnits > 0 ? newInvested / newUnits : 0
      await supabase.from('mutual_funds').update({ units: newUnits, invested_amount: newInvested, avg_nav: newNav }).eq('id', holding.id)
    }
  }

  async function save() {
    const u = Number(qty), p = Number(price)
    if (!(u > 0) || !(p > 0) || !date) { setError('Enter a valid date, quantity and price.'); return }
    setSaving(true); setError('')
    const oldU = Number(lot.units || 0), oldA = Number(lot.amount || 0)
    const newA = u * p
    const { error: e } = await supabase.from('investment_transactions')
      .update({ units: u, nav: p, amount: newA, txn_date: date }).eq('id', lot.id)
    if (e) { setSaving(false); setError(e.message || 'Could not save.'); return }
    await applyHoldingDelta(u - oldU, newA - oldA)
    setSaving(false)
    onClose()
  }

  async function del() {
    setSaving(true); setError('')
    const { error: e } = await supabase.from('investment_transactions').delete().eq('id', lot.id)
    if (e) { setSaving(false); setError(e.message || 'Could not delete.'); return }
    await applyHoldingDelta(-Number(lot.units || 0), -Number(lot.amount || 0))
    setSaving(false)
    onClose()
  }

  const u = Number(qty) || 0, p = Number(price) || 0

  return (
    <div className="fixed inset-0 bg-black/40 z-[60] overflow-y-auto">
      <div className="flex min-h-full items-start sm:items-center justify-center p-4 py-8">
        <div className="wl-card p-5 w-full max-w-sm">
          <div className="flex justify-between items-center mb-1">
            <h2 className="text-[15px] font-bold" style={{ color: 'var(--text)' }}>Edit purchase</h2>
            <button onClick={onClose} style={{ color: 'var(--text3)' }}><X size={18} /></button>
          </div>
          <div className="text-[11px] mb-4 truncate" style={{ color: 'var(--text3)' }}>{title}</div>

          {error && (
            <div className="rounded-lg p-3 text-[12px] mb-3" style={{ background: 'var(--rose-bg)', border: '1px solid var(--rose)', color: 'var(--rose)' }}>
              {error}
            </div>
          )}

          <div className="space-y-3">
            <Field label="Date" type="date" value={date} onChange={setDate} />
            <div className="grid grid-cols-2 gap-3">
              <Field label={isStock ? 'Quantity' : 'Units'} numeric value={qty} onChange={setQty} />
              <Field label={isStock ? 'Price / share' : 'NAV'} numeric value={price} onChange={setPrice} />
            </div>
            {u > 0 && p > 0 && (
              <div className="text-[11px]" style={{ color: 'var(--text3)' }}>
                Cost: <span className="font-mono font-semibold" style={{ color: 'var(--text)' }}>{sym}{Math.round(u * p).toLocaleString('en-IN')}</span>
              </div>
            )}
          </div>

          <div className="flex gap-2 mt-4">
            <button onClick={del} disabled={saving}
              className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg border text-[12px] font-semibold disabled:opacity-50"
              style={{ borderColor: 'var(--rose)', color: 'var(--rose)', background: 'transparent' }}>
              <Trash2 size={13} /> Delete
            </button>
            <button onClick={save} disabled={saving}
              className="flex-1 py-2.5 rounded-lg text-white text-[12px] font-bold flex items-center justify-center gap-2 disabled:opacity-50"
              style={{ background: 'var(--sage)' }}>
              {saving ? <><Loader2 size={14} className="animate-spin" /> Saving…</> : <><Save size={14} /> Save</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
