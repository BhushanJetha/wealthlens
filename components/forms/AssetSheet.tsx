'use client'
import { useState } from 'react'
import { X, Loader2, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { fmtMoney } from '@/lib/format'
import { OTHER_KINDS, otherKind, type OtherKind } from '@/lib/otherAssets'
import { Segmented } from '@/components/ui/kit'

// Typical yearly change, shown as a hint only (never filled in for you)
const GROWTH_HINT: Partial<Record<OtherKind, string>> = { property: 'e.g. 5', land: 'e.g. 6', vehicle: 'e.g. −12', jewellery: 'leave empty', business: 'leave empty' }

// Add or edit a property, vehicle, jewellery or other investment (other_assets,
// migration 032). Estimates are labelled as yours; priced holdings are units × price.
export default function AssetSheet({ asset, defaults, loans, onClose, onSaved }: {
  asset?: any; defaults?: Record<string, any>; loans: any[]; onClose: () => void; onSaved: () => void
}) {
  const start = asset ?? defaults ?? {}
  const [kind, setKind] = useState<OtherKind>((start.kind as OtherKind) ?? 'property')
  const [name, setName] = useState<string>(start.name ?? '')
  const [cur, setCur] = useState<string>(start.currency ?? 'INR')
  const [value, setValue] = useState<string>(start.current_value != null ? String(start.current_value) : '')
  const [asOf, setAsOf] = useState<string>(start.value_as_of ?? new Date().toISOString().slice(0, 10))
  const [growth, setGrowth] = useState<string>(start.growth_pct != null ? String(start.growth_pct) : '')
  const [paid, setPaid] = useState<string>(start.purchase_price != null ? String(start.purchase_price) : '')
  const [bought, setBought] = useState<string>(start.purchase_date ?? '')
  const [units, setUnits] = useState<string>(start.units != null ? String(start.units) : '')
  const [price, setPrice] = useState<string>(start.price != null ? String(start.price) : '')
  const [symbol, setSymbol] = useState<string>(start.symbol ?? '')
  const [platform, setPlatform] = useState<string>(start.platform ?? '')
  const [unvested, setUnvested] = useState<string>(start.unvested_units != null ? String(start.unvested_units) : '')
  const [vestDate, setVestDate] = useState<string>(start.next_vest_date ?? '')
  const [loanId, setLoanId] = useState<string>(start.loan_id ?? '')
  const [nominee, setNominee] = useState<string>(start.nominee ?? '')
  const [notes, setNotes] = useState<string>(start.notes ?? '')
  const [busy, setBusy] = useState(false)
  const [confirmDel, setConfirmDel] = useState(false)
  const [error, setError] = useState('')
  const info = otherKind(kind), priced = info.priced, isProperty = info.group === 'property'
  const num = (s: string) => (s.trim() === '' ? null : Number(s))
  const myLoans = loans.filter(l => (l.currency ?? 'INR') === (cur === 'INR' ? 'INR' : 'AED'))
  const sym = cur === 'AED' ? 'AED' : cur === 'USD' ? '$' : '₹'
  const total = priced && Number(units) > 0 && Number(price) > 0 ? Number(units) * Number(price) : null
  const show = (n: number) => (cur === 'USD' ? `$${Math.round(n).toLocaleString('en-US')}` : fmtMoney(n, cur))

  async function save() {
    if (!name.trim()) { setError('Give it a name.'); return }
    if (priced ? !(Number(units) > 0) : !(Number(value) > 0)) { setError(priced ? 'Enter how many units you hold.' : 'Enter what it’s worth today (your estimate).'); return }
    setBusy(true); setError('')
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const row: Record<string, any> = {
      kind, name: name.trim(), currency: cur, country: cur === 'INR' ? 'India' : 'UAE',
      current_value: priced ? (total ?? 0) : Number(value), value_as_of: priced ? new Date().toISOString().slice(0, 10) : asOf || null,
      growth_pct: priced ? null : num(growth), purchase_price: num(paid), purchase_date: bought || null,
      units: priced ? num(units) : null, price: priced ? num(price) : null, symbol: priced ? symbol.trim().toUpperCase() || null : null,
      platform: platform.trim() || null, unvested_units: kind === 'esop' ? num(unvested) : null, next_vest_date: kind === 'esop' ? vestDate || null : null,
      loan_id: isProperty ? loanId || null : null, nominee: nominee.trim() || null, notes: notes.trim() || null, updated_at: new Date().toISOString(),
    }
    const res = asset ? await supabase.from('other_assets').update(row).eq('id', asset.id)
      : await supabase.from('other_assets').insert({ ...row, user_id: user!.id })
    setBusy(false)
    if (res.error) { setError(/other_assets/.test(res.error.message) ? 'Run migration 032 in Supabase to add property and other assets.' : res.error.message); return }
    onSaved()
  }
  async function remove() {
    setBusy(true)
    const { error } = await createClient().from('other_assets').delete().eq('id', asset.id)
    setBusy(false)
    if (error) { setError(error.message); return }
    onSaved()
  }

  const Label = ({ children }: { children: React.ReactNode }) => <div className="text-[11px] font-semibold uppercase tracking-[0.05em] mb-1.5" style={{ color: 'var(--text3)' }}>{children}</div>
  const field = 'wl-input w-full'
  const money = (label: string, v: string, set: (s: string) => void, aria: string, ph = '0') => (
    <div>
      <Label>{label}</Label>
      <div className="flex items-center rounded-xl px-3" style={{ background: '#F7F8FA', border: '1px solid #E2E8F0', height: 44 }}>
        <span className="text-[13px] font-semibold mr-2" style={{ color: 'var(--text3)' }}>{sym}</span>
        <input value={v} onChange={e => set(e.target.value.replace(/[^0-9.]/g, ''))} inputMode="decimal" placeholder={ph} aria-label={aria} className="flex-1 bg-transparent outline-none text-[16px] font-bold tabular-nums" style={{ color: 'var(--text)' }} />
      </div>
    </div>
  )

  return (
    <div className="fixed inset-0 wl-sheet z-50 flex items-center justify-center p-4" style={{ background: 'rgba(15,23,42,0.45)' }} onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={asset ? 'Edit asset' : 'Add asset'} className="wl-sheet-panel w-full max-w-[520px] rounded-2xl overflow-y-auto"
        style={{ background: 'var(--card)', border: '1px solid var(--line)', boxShadow: '0 24px 60px rgba(15,23,42,.25)', maxHeight: '90vh' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-2">
          <div className="flex items-center gap-2.5">
            <span className="w-10 h-10 rounded-xl flex items-center justify-center text-[20px]" style={{ background: 'var(--accent-bg)' }}>{info.icon}</span>
            <div>
              <div className="text-[16px] font-bold" style={{ color: 'var(--text)' }}>{asset ? 'Edit' : 'Add'} {info.label.toLowerCase()}</div>
              <div className="text-[12px]" style={{ color: 'var(--text3)' }}>{info.hint}</div>
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" className="p-2 -mr-2 rounded-xl hover:bg-gray-100" style={{ color: 'var(--text3)' }}><X size={16} /></button>
        </div>
        <div className="px-5 pb-5 flex flex-col gap-3.5">
          {!asset && (
            <div className="flex flex-wrap gap-1.5">
              {OTHER_KINDS.map(k => (
                <button key={k.key} onClick={() => { setKind(k.key); if (k.key === 'us_stocks' || k.key === 'crypto') setCur('USD') }} aria-pressed={kind === k.key} className="wl-chip" style={{ height: 30 }}>
                  <span className="text-[13px]">{k.icon}</span>{k.label}
                </button>
              ))}
            </div>
          )}
          <div className="grid grid-cols-[1fr_auto] gap-3 items-end">
            <div>
              <Label>Name</Label>
              <input value={name} onChange={e => setName(e.target.value)} placeholder={isProperty ? 'e.g. Flat in Kochi' : priced ? 'e.g. Vanguard All-World (VWRA)' : 'e.g. Toyota Fortuner'} className={field} style={{ height: 42 }} />
            </div>
            <Segmented label="Currency" value={cur} onChange={(c: string) => { setCur(c); setLoanId('') }}
              options={[{ value: 'INR', label: '₹' }, { value: 'AED', label: 'AED' }, { value: 'USD', label: '$' }]} />
          </div>

          {priced ? (<>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>{kind === 'esop' ? 'Vested units' : 'Units'}</Label>
                <input value={units} onChange={e => setUnits(e.target.value.replace(/[^0-9.]/g, ''))} inputMode="decimal" placeholder="0" className={field} style={{ height: 42 }} aria-label="Units" />
              </div>
              {money('Price per unit', price, setPrice, 'Price per unit')}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Ticker (for live price)</Label>
                <input value={symbol} onChange={e => setSymbol(e.target.value)} placeholder={kind === 'crypto' ? 'BTC-USD' : 'AAPL, VWRA.L'} className={field} style={{ height: 42 }} aria-label="Ticker" />
              </div>
              <div>
                <Label>Held with</Label>
                <input value={platform} onChange={e => setPlatform(e.target.value)} placeholder={kind === 'uae_broker' ? 'Sarwa' : kind === 'esop' ? 'Employer' : 'Interactive Brokers'} className={field} style={{ height: 42 }} />
              </div>
            </div>
            {kind === 'esop' && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Unvested units</Label>
                  <input value={unvested} onChange={e => setUnvested(e.target.value.replace(/[^0-9.]/g, ''))} inputMode="decimal" placeholder="0" className={field} style={{ height: 42 }} aria-label="Unvested units" />
                </div>
                <div>
                  <Label>Next vest date</Label>
                  <input type="date" value={vestDate} onChange={e => setVestDate(e.target.value)} className={field} style={{ height: 42 }} aria-label="Next vest date" />
                </div>
              </div>
            )}
            {money('Total paid (optional)', paid, setPaid, 'Total paid', 'for gain')}
            {total != null && <div className="text-[12.5px]" style={{ color: 'var(--text3)' }}>Worth <b style={{ color: 'var(--text)' }}>{show(total)}</b> today{cur === 'USD' ? ' — counted in dirhams at the fixed 3.6725 rate' : ''}.</div>}
          </>) : (<>
            <div className="grid grid-cols-2 gap-3">
              {money('Worth today (your estimate)', value, setValue, 'Value')}
              <div>
                <Label>As of</Label>
                <input type="date" value={asOf} onChange={e => setAsOf(e.target.value)} className={field} style={{ height: 44 }} aria-label="Value as of" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Changes % a year (optional)</Label>
                <input value={growth} onChange={e => setGrowth(e.target.value.replace(/[^0-9.\-]/g, ''))} inputMode="decimal" placeholder={GROWTH_HINT[kind] ?? 'leave empty'} className={field} style={{ height: 42 }} aria-label="Yearly change" />
              </div>
              {money('Bought for (optional)', paid, setPaid, 'Purchase price')}
            </div>
            <p className="text-[11.5px] -mt-1.5" style={{ color: 'var(--text4)' }}>Your own estimate, shown as one. A yearly change moves it on from the “as of” date — update the value now and then.</p>
          </>)}

          {isProperty && myLoans.length > 0 && (
            <div>
              <Label>Loan on it (optional)</Label>
              <select value={loanId} onChange={e => setLoanId(e.target.value)} className={field} style={{ height: 42 }} aria-label="Loan on it">
                <option value="">No loan</option>
                {myLoans.map(l => <option key={l.id} value={l.id}>{l.name} · {fmtMoney(Number(l.outstanding_amt) || 0, l.currency ?? 'INR')} left</option>)}
              </select>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Nominee</Label>
              <input value={nominee} onChange={e => setNominee(e.target.value)} placeholder="Who gets it" className={field} style={{ height: 42 }} />
            </div>
            <div>
              <Label>Note</Label>
              <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional" className={field} style={{ height: 42 }} />
            </div>
          </div>

          {error && <div className="rounded-lg px-3 py-2.5 text-[12.5px]" style={{ background: '#FDECE8', color: '#B4231A' }} role="alert">{error}</div>}
          {confirmDel ? (
            <div className="rounded-xl p-3 flex items-center justify-between gap-3" style={{ border: '1.5px solid var(--rose)', background: 'var(--rose-bg)' }}>
              <span className="text-[12.5px] font-medium" style={{ color: 'var(--rose)' }}>Delete “{asset.name}”?</span>
              <div className="flex gap-2">
                <button onClick={() => setConfirmDel(false)} className="wl-btn" style={{ height: 30, fontSize: 12 }}>Cancel</button>
                <button onClick={remove} disabled={busy} className="wl-btn" style={{ height: 30, fontSize: 12, background: 'var(--rose)', color: '#fff' }}>Delete</button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2.5">
              {asset && <button onClick={() => setConfirmDel(true)} aria-label="Delete" className="wl-btn" style={{ height: 44, padding: '0 14px', color: 'var(--rose)' }}><Trash2 size={15} /></button>}
              <button onClick={onClose} className="wl-btn" style={{ height: 44, padding: '0 18px' }}>Cancel</button>
              <button onClick={save} disabled={busy} className="wl-btn wl-btn-primary flex-1 disabled:opacity-60" style={{ height: 44, fontSize: 14 }}>
                {busy ? <><Loader2 size={15} className="animate-spin" />Saving…</> : asset ? 'Save changes' : 'Add'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
