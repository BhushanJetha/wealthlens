'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { X, Loader2, Save, Plus, Trash2, CalendarPlus } from 'lucide-react'
import { useRouter } from 'next/navigation'

type Kind = 'stock' | 'mutual_fund'
interface Lot { _id: string; date: string; qty: string; price: string }

const LBL = 'block text-[10px] uppercase tracking-wider mb-1 font-semibold'
const INP = 'w-full rounded-lg px-3 py-2 text-[13px] focus:outline-none'
const inpStyle = { background: 'var(--bg2)', border: '1px solid var(--border)', color: 'var(--text)' } as const

// Module-level so identity is stable across renders → inputs never lose focus.
function Field({ label, value, onChange, placeholder, type = 'text', numeric = false }: {
  label: string; value: string; onChange: (v: string) => void
  placeholder?: string; type?: string; numeric?: boolean
}) {
  return (
    <div>
      <label className={LBL} style={{ color: 'var(--text3)' }}>{label}</label>
      <input
        type={type}
        inputMode={numeric ? 'decimal' : undefined}
        value={value}
        placeholder={placeholder}
        max={type === 'date' ? new Date().toISOString().slice(0, 10) : undefined}
        onChange={e => onChange(numeric ? e.target.value.replace(/[^0-9.]/g, '') : e.target.value)}
        className={INP}
        style={inpStyle}
      />
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

let LOT_SEQ = 0
const newLot = (): Lot => ({ _id: `l${++LOT_SEQ}`, date: new Date().toISOString().slice(0, 10), qty: '', price: '' })

export default function BatchPurchaseModal({ kind, onClose, existing }: {
  kind: Kind; onClose: () => void; existing?: any
}) {
  const isStock = kind === 'stock'
  const sym = (c: string) => (c === 'AED' ? 'AED ' : '₹')
  const [members, setMembers] = useState<{ name: string }[]>([])

  const [symbol, setSymbol]     = useState('')
  const [name, setName]         = useState('')
  const [exchange, setExchange] = useState('NSE')
  const [sector, setSector]     = useState('')
  const [fundType, setFundType] = useState('equity')
  const [holder, setHolder]     = useState('Self')
  const [currency, setCurrency] = useState<string>(existing?.currency ?? 'INR')
  const [recordExpense, setRecordExpense] = useState(true)
  const [lots, setLots]         = useState<Lot[]>([newLot()])
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState('')

  const supabase = createClient()
  const router = useRouter()

  useEffect(() => {
    supabase.from('family_members').select('name').eq('is_active', true).order('created_at')
      .then(({ data }) => setMembers(data ?? []))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const updateLot = (id: string, patch: Partial<Lot>) => setLots(ls => ls.map(l => l._id === id ? { ...l, ...patch } : l))
  const addLot    = () => setLots(ls => [...ls, newLot()])
  const removeLot = (id: string) => setLots(ls => ls.length > 1 ? ls.filter(l => l._id !== id) : ls)

  const valid = lots.map(l => ({ ...l, q: Number(l.qty), p: Number(l.price) })).filter(l => l.q > 0 && l.p > 0 && l.date)
  const totalUnits    = valid.reduce((s, l) => s + l.q, 0)
  const totalInvested = valid.reduce((s, l) => s + l.q * l.p, 0)
  const avg           = totalUnits > 0 ? totalInvested / totalUnits : 0

  async function save() {
    setError('')
    if (!existing && isStock && !symbol.trim()) { setError('Enter the stock symbol (e.g. INFY).'); return }
    if (!existing && !isStock && !name.trim())  { setError('Enter the fund name.'); return }
    if (valid.length === 0)        { setError('Add at least one purchase with quantity, price and date.'); return }

    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); setError('Not signed in.'); return }
    const country = currency === 'AED' ? 'UAE' : 'India'
    const assetName = existing
      ? (isStock ? existing.symbol : existing.fund_name)
      : (isStock ? (name.trim() || symbol.trim()) : name.trim())

    // 1) Create the holding (or add to an existing one) using the lots' aggregate
    let assetId: string | null = null
    if (existing) {
      assetId = existing.id
      if (isStock) {
        const newQty = Number(existing.quantity || 0) + totalUnits
        const newAvg = newQty > 0 ? (Number(existing.quantity || 0) * Number(existing.avg_buy_price || 0) + totalInvested) / newQty : avg
        const { error: e } = await supabase.from('stocks').update({ quantity: newQty, avg_buy_price: newAvg }).eq('id', existing.id)
        if (e) { setSaving(false); setError(e.message || 'Could not update stock.'); return }
      } else {
        const newUnits = Number(existing.units || 0) + totalUnits
        const newInv   = Number(existing.invested_amount || 0) + totalInvested
        const newNav   = newUnits > 0 ? newInv / newUnits : avg
        const { error: e } = await supabase.from('mutual_funds').update({ units: newUnits, invested_amount: newInv, avg_nav: newNav }).eq('id', existing.id)
        if (e) { setSaving(false); setError(e.message || 'Could not update fund.'); return }
      }
    } else if (isStock) {
      const { data, error: e } = await supabase.from('stocks').insert({
        user_id: user.id, symbol: symbol.trim(), name: assetName, exchange: exchange || 'NSE',
        sector: sector || null, quantity: totalUnits, avg_buy_price: avg, currency, country, holder_name: holder,
      }).select('id').single()
      if (e || !data) { setSaving(false); setError(e?.message || 'Could not save stock.'); return }
      assetId = data.id
    } else {
      let payload: any = {
        user_id: user.id, fund_name: assetName, fund_type: fundType, units: totalUnits,
        avg_nav: avg, invested_amount: totalInvested, currency, country, holder_name: holder, source: 'manual',
      }
      let res = await supabase.from('mutual_funds').insert(payload).select('id').single()
      if (res.error && /source/i.test(res.error.message || '')) { delete payload.source; res = await supabase.from('mutual_funds').insert(payload).select('id').single() }
      if (res.error || !res.data) { setSaving(false); setError(res.error?.message || 'Could not save fund.'); return }
      assetId = res.data.id
    }

    // 2) Log every lot: optional cash-out expense + investment history row
    for (const l of valid) {
      const amount = l.q * l.p
      if (recordExpense) {
        await supabase.from('transactions').insert({
          user_id: user.id, txn_date: l.date, merchant: assetName,
          description: isStock ? `Buy ${l.q} ${symbol.trim()} @ ${sym(currency)}${l.p}` : `Lumpsum ${assetName} @ NAV ${l.p}`,
          category: 'Investment', sub_category: isStock ? 'Stock Purchase' : 'Lumpsum',
          amount, currency, country, txn_type: 'expense', source: 'manual',
        }).then(() => {}, () => {})
      }
      await supabase.from('investment_transactions').insert({
        user_id: user.id, asset_type: kind, asset_id: assetId, asset_name: assetName,
        txn_date: l.date, txn_type: 'purchase', amount, units: l.q, nav: l.p, currency, source: 'buy_action',
      }).then(() => {}, () => {})
    }

    router.refresh()
    setSaving(false)
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 overflow-y-auto">
      <div className="flex min-h-full items-start sm:items-center justify-center p-4 py-8">
        <div className="wl-card p-5 w-full max-w-lg">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-[15px] font-bold flex items-center gap-2" style={{ color: 'var(--text)' }}>
              <CalendarPlus size={16} style={{ color: 'var(--sage)' }} />
              {existing ? `Add to ${isStock ? existing.symbol : existing.fund_name}` : `Add ${isStock ? 'Stock' : 'Mutual Fund'} — dated purchases`}
            </h2>
            <button onClick={onClose} style={{ color: 'var(--text3)' }}><X size={18} /></button>
          </div>

          {error && (
            <div className="rounded-lg p-3 text-[12px] mb-3" style={{ background: 'var(--rose-bg)', border: '1px solid var(--rose)', color: 'var(--rose)' }}>
              {error}
            </div>
          )}

          {/* Asset identity — hidden when adding lots to an existing holding */}
          {existing ? (
            <div className="rounded-xl p-3 flex items-center gap-2 flex-wrap" style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}>
              <span className="font-bold text-[13px]" style={{ color: 'var(--text)' }}>{isStock ? existing.symbol : existing.fund_name}</span>
              {isStock && existing.name && <span className="text-[11px]" style={{ color: 'var(--text3)' }}>{existing.name}</span>}
              <span className="ml-auto text-[11px] font-mono" style={{ color: 'var(--text3)' }}>
                {isStock ? `${Number(existing.quantity)} sh · avg ₹${Number(existing.avg_buy_price).toFixed(2)}` : `${Number(existing.units).toFixed(2)} units · NAV ₹${Number(existing.avg_nav).toFixed(2)}`}
              </span>
            </div>
          ) : (
          <div className="space-y-3">
            {isStock ? (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Symbol" value={symbol} onChange={setSymbol} placeholder="INFY" />
                  <Field label="Company Name" value={name} onChange={setName} placeholder="Infosys" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Exchange" value={exchange} onChange={setExchange} placeholder="NSE" />
                  <Field label="Sector (optional)" value={sector} onChange={setSector} placeholder="IT" />
                </div>
                <div className="text-[10px]" style={{ color: 'var(--text3)' }}>
                  Tip: use the NSE symbol (e.g. <strong>INFY</strong>, <strong>ANGELONE</strong>) for exact live pricing.
                </div>
              </>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <Field label="Fund Name" value={name} onChange={setName} placeholder="Parag Parikh Flexi Cap" />
                <Select label="Fund Type" value={fundType} onChange={setFundType}
                  options={['equity', 'debt', 'hybrid', 'elss', 'index', 'liquid'].map(t => ({ value: t, label: t.toUpperCase() }))} />
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <Select label="Currency" value={currency} onChange={setCurrency}
                options={[{ value: 'INR', label: 'INR 🇮🇳' }, { value: 'AED', label: 'AED 🇦🇪' }]} />
              <Select label="In Name Of" value={holder} onChange={setHolder}
                options={[{ value: 'Self', label: 'Self' }, ...members.map(m => ({ value: m.name, label: m.name }))]} />
            </div>
          </div>
          )}

          {/* Purchase lots */}
          <div className="mt-4">
            <div className="text-[11px] font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--text3)' }}>
              Purchases {isStock ? '(qty × price)' : '(units × NAV)'}
            </div>
            <div className="space-y-2">
              {lots.map((l, i) => (
                <div key={l._id} className="rounded-xl p-2.5" style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] font-semibold" style={{ color: 'var(--text3)' }}>Purchase {i + 1}</span>
                    {lots.length > 1 && (
                      <button onClick={() => removeLot(l._id)} className="p-1 rounded" style={{ color: 'var(--rose)' }} aria-label="Remove">
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="col-span-3 sm:col-span-1">
                      <Field label="Date" type="date" value={l.date} onChange={v => updateLot(l._id, { date: v })} />
                    </div>
                    <Field label={isStock ? 'Qty' : 'Units'} numeric value={l.qty} onChange={v => updateLot(l._id, { qty: v })} placeholder={isStock ? '10' : '124.5'} />
                    <Field label={isStock ? 'Price' : 'NAV'} numeric value={l.price} onChange={v => updateLot(l._id, { price: v })} placeholder={isStock ? '1450' : '68.2'} />
                  </div>
                </div>
              ))}
            </div>
            <button onClick={addLot}
              className="mt-2 w-full flex items-center justify-center gap-1.5 py-2 rounded-lg border text-[12px] font-semibold"
              style={{ borderColor: 'var(--sage)', color: 'var(--sage)', background: 'var(--sage-bg)' }}>
              <Plus size={13} /> Add another purchase
            </button>
          </div>

          {/* Live summary */}
          {valid.length > 0 && (
            <div className="mt-3 grid grid-cols-3 gap-2 rounded-xl p-3" style={{ background: 'var(--sage-bg)' }}>
              {[
                [isStock ? 'Total Qty' : 'Total Units', totalUnits.toLocaleString('en-IN', { maximumFractionDigits: 3 })],
                [isStock ? 'Avg Price' : 'Avg NAV', `${sym(currency)}${avg.toFixed(2)}`],
                ['Invested', `${sym(currency)}${Math.round(totalInvested).toLocaleString('en-IN')}`],
              ].map(([k, v]) => (
                <div key={k}>
                  <div className="text-[9px]" style={{ color: 'var(--text3)' }}>{k}</div>
                  <div className="text-[13px] font-bold font-mono" style={{ color: 'var(--text)' }}>{v}</div>
                </div>
              ))}
            </div>
          )}

          <label className="flex items-center gap-2 mt-3 text-[11px]" style={{ color: 'var(--text2)' }}>
            <input type="checkbox" checked={recordExpense} onChange={e => setRecordExpense(e.target.checked)} />
            Also record each purchase as an expense (money spent on that date)
          </label>

          <div className="flex gap-3 mt-4">
            <button onClick={onClose} className="flex-1 py-2.5 rounded-lg border text-[12px] font-semibold"
              style={{ borderColor: 'var(--border)', color: 'var(--text3)' }}>Cancel</button>
            <button onClick={save} disabled={saving}
              className="flex-1 py-2.5 rounded-lg text-white text-[12px] font-bold flex items-center justify-center gap-2 disabled:opacity-50"
              style={{ background: 'var(--sage)' }}>
              {saving ? <><Loader2 size={14} className="animate-spin" /> Saving…</> : <><Save size={14} /> Add {valid.length > 1 ? `${valid.length} purchases` : 'purchase'}</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
