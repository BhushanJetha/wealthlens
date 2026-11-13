'use client'
import { useState } from 'react'
import { X, Loader2, Trash2, Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { fmtMoney } from '@/lib/format'
import { OTHER_KINDS, otherKind, type OtherKind } from '@/lib/otherAssets'
import { Segmented } from '@/components/ui/kit'
import { propertyModel, stepsOf, type Payer } from '@/lib/property'

// Typical yearly change, shown as a hint only (never filled in for you)
const GROWTH_HINT: Partial<Record<OtherKind, string>> = { property: 'e.g. 5', land: 'e.g. 6', vehicle: 'e.g. −12', jewellery: 'leave empty', business: 'leave empty' }

// Add or edit a property, vehicle, jewellery or other investment (other_assets,
// migration 032). Estimates are labelled as yours; priced holdings are units × price.
export default function AssetSheet({ asset, defaults, loans, txns = [], plan = [], onClose, onSaved }: {
  asset?: any; defaults?: Record<string, any>; loans: any[]; txns?: any[]; plan?: any[]; onClose: () => void; onSaved: () => void
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
  // A home: ready or being built, what it cost in parts, and the payments to the builder or seller (migration 051)
  const [status, setStatus] = useState<string>(start.status ?? 'ready')
  const [possession, setPossession] = useState<string>(start.possession_date ?? '')
  const cb = start.cost_breakup ?? {}
  const [stamp, setStamp] = useState<string>(cb.stamp != null ? String(cb.stamp) : '')
  const [other, setOther] = useState<string>(cb.other != null ? String(cb.other) : '')
  const [steps, setSteps] = useState<{ id: string; label: string; due: string; amount: string; payer: Payer }[]>(
    () => stepsOf(start, start.loan_id && plan.length && plan[0]?.loan_id === start.loan_id ? plan : []).map(x => ({ id: x.id, label: x.label, due: x.due ?? '', amount: String(x.amount || ''), payer: x.payer })))
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
    const costTotal = (Number(paid) || 0) + (Number(stamp) || 0) + (Number(other) || 0)
    const homeCols: Record<string, any> = isProperty ? {
      status: status === 'construction' ? 'construction' : 'ready', possession_date: status === 'construction' ? possession || null : null,
      cost_breakup: Number(stamp) || Number(other) ? { price: Number(paid) || 0, stamp: Number(stamp) || 0, other: Number(other) || 0 } : null,
      schedule: steps.filter(x => x.label.trim() && Number(x.amount) > 0).map(x => ({ id: x.id, label: x.label.trim(), due: x.due || null, amount: Number(x.amount), payer: x.payer })),
    } : {}
    const row: Record<string, any> = {
      kind, name: name.trim(), currency: cur, country: cur === 'INR' ? 'India' : 'UAE',
      current_value: priced ? (total ?? 0) : Number(value), value_as_of: priced ? new Date().toISOString().slice(0, 10) : asOf || null,
      growth_pct: priced ? null : num(growth), purchase_price: isProperty && costTotal > 0 ? costTotal : num(paid), purchase_date: bought || null,
      units: priced ? num(units) : null, price: priced ? num(price) : null, symbol: priced ? symbol.trim().toUpperCase() || null : null,
      platform: platform.trim() || null, unvested_units: kind === 'esop' ? num(unvested) : null, next_vest_date: kind === 'esop' ? vestDate || null : null,
      loan_id: isProperty ? loanId || null : null, nominee: nominee.trim() || null, notes: notes.trim() || null, updated_at: new Date().toISOString(),
    }
    const write = (r: Record<string, any>) => asset ? supabase.from('other_assets').update(r).eq('id', asset.id) : supabase.from('other_assets').insert({ ...r, user_id: user!.id })
    let res = await write({ ...row, ...homeCols })
    // Before migration 051 the home's parts can't be kept: save the rest, and say so
    if (res.error && isProperty && /cost_breakup|possession_date|schedule|status|own_payments/.test(res.error.message ?? '')) {
      res = await write(row)
      if (!res.error) { setBusy(false); setError('Saved — but the cost parts and payment steps need migration 051 (supabase/migrations/051_property_payments.sql). Run it in Supabase, then save again.'); return }
    }
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
              {money(isProperty ? 'Price' : 'Bought for (optional)', paid, setPaid, 'Purchase price')}
            </div>
            {isProperty && (<>
              <div className="grid grid-cols-2 gap-3">
                {money('Stamp duty & registration', stamp, setStamp, 'Stamp duty and registration')}
                {money('Other charges', other, setOther, 'Other charges')}
              </div>
              {(Number(stamp) || Number(other)) > 0 && <div className="flex justify-between text-[13px] rounded-xl px-3 py-2.5" style={{ background: 'var(--bg2)' }}><span style={{ color: 'var(--text2)' }}>Total cost</span><b className="tabular-nums">{show((Number(paid) || 0) + (Number(stamp) || 0) + (Number(other) || 0))}</b></div>}
              <div>
                <Label>Is it ready?</Label>
                <div className="flex gap-2 flex-wrap items-center">
                  <Segmented label="Status" value={status} onChange={(v: string) => setStatus(v)} options={[{ value: 'ready', label: 'Ready' }, { value: 'construction', label: 'Under construction' }]} />
                  {status === 'construction' && <label className="flex items-center gap-2 text-[12.5px]" style={{ color: 'var(--text2)' }}>Possession<input type="date" value={possession} onChange={e => setPossession(e.target.value)} className="wl-input" style={{ height: 38 }} aria-label="Possession date" /></label>}
                </div>
              </div>
            </>)}
            <p className="text-[11.5px] -mt-1.5" style={{ color: 'var(--text4)' }}>Your own estimate, shown as one. A yearly change moves it on from the “as of” date — update the value now and then.</p>
          </>)}

          {isProperty && myLoans.length > 0 && (
            <div>
              <Label>Bought with a loan? (optional)</Label>
              <select value={loanId} onChange={e => setLoanId(e.target.value)} className={field} style={{ height: 42 }} aria-label="Loan on it">
                <option value="">No loan</option>
                {myLoans.map(l => <option key={l.id} value={l.id}>{l.name} · {fmtMoney(Number(l.outstanding_amt) || 0, l.currency ?? 'INR')} left</option>)}
              </select>
            </div>
          )}
          {isProperty && (() => {
            // What's paid so far, and the steps, from what the loan and you have paid (lib/property)
            const draft = { ...(asset ?? {}), loan_id: loanId || null, current_value: Number(value) || 0, purchase_price: Number(paid) || 0,
              cost_breakup: { price: Number(paid) || 0, stamp: Number(stamp) || 0, other: Number(other) || 0 },
              schedule: steps.filter(x => Number(x.amount) > 0).map(x => ({ ...x, amount: Number(x.amount) })) }
            const ln = loanId ? loans.find(l => l.id === loanId) ?? null : null
            const pm = propertyModel({ asset: draft, loan: ln, txns: ln ? txns : [], today: new Date().toISOString().slice(0, 10) })
            const set = (i: number, patch: Partial<typeof steps[number]>) => setSteps(xs => xs.map((x, k) => (k === i ? { ...x, ...patch } : x)))
            return (
              <div className="flex flex-col gap-2.5">
                <div className="flex justify-between items-baseline"><Label>Payment steps to the {status === 'construction' ? 'builder' : 'seller'}</Label>{pm.stillToPay > 0.5 && <span className="text-[12px]" style={{ color: 'var(--text3)' }}>{show(pm.stillToPay)} left</span>}</div>
                {steps.length === 0 && <p className="text-[12px] -mt-1" style={{ color: 'var(--text3)' }}>Booking, agreement, each slab, possession — with who pays. Steps already paid are ticked off from what you and the loan paid.</p>}
                {steps.map((x, i) => {
                  const st = pm.schedule[i]
                  return (
                    <div key={x.id} className="rounded-xl p-2.5 flex flex-col gap-2" style={{ border: '1px solid var(--line)', background: st && st.left <= 0.5 ? '#F6FBF8' : '#fff' }}>
                      <div className="grid grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)_auto] gap-2 items-center">
                        <input value={x.label} onChange={e => set(i, { label: e.target.value })} placeholder="Step" aria-label="Step" className={field} style={{ height: 38 }} />
                        <input type="date" value={x.due} onChange={e => set(i, { due: e.target.value })} aria-label="Due" className={field} style={{ height: 38 }} />
                        <input value={x.amount} onChange={e => set(i, { amount: e.target.value.replace(/[^0-9.]/g, '') })} inputMode="decimal" placeholder="Amount" aria-label="Amount" className={field} style={{ height: 38 }} />
                        <button onClick={() => setSteps(xs => xs.filter((_, k) => k !== i))} aria-label="Remove step" className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ color: 'var(--text3)' }}><X size={15} /></button>
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap text-[12px]">
                        <span style={{ color: 'var(--text3)' }}>Paid by</span>
                        {([['loan', 'The loan'], ['self', 'Me'], ['both', 'Both']] as const).map(([v, l]) => (
                          <button key={v} onClick={() => set(i, { payer: v })} aria-pressed={x.payer === v} className="h-8 px-2.5 rounded-full text-[12px]"
                            style={x.payer === v ? { border: `1px solid ${v === 'self' ? '#15803D' : '#0F766E'}`, background: v === 'self' ? '#E7F6EE' : '#E6F4F2', color: v === 'self' ? '#15803D' : '#0F766E', fontWeight: 600 } : { border: '1px solid var(--line)', color: 'var(--text2)' }}>{l}</button>
                        ))}
                        {st && <span className="ml-auto font-semibold" style={{ color: st.left <= 0.5 ? '#15803D' : '#7A5300' }}>{st.left <= 0.5 ? 'Paid' : st.paidLoan + st.paidOwn > 0.5 ? `${show(st.left)} left` : 'To pay'}</span>}
                      </div>
                    </div>
                  )
                })}
                <button onClick={() => setSteps(xs => [...xs, { id: globalThis.crypto?.randomUUID?.() ?? `s${Date.now()}`, label: '', due: '', amount: '', payer: loanId ? 'loan' : 'self' }])} className="self-start h-9 px-3 rounded-[10px] text-[13px] font-semibold flex items-center gap-1" style={{ border: '1px dashed var(--accent-border)', color: 'var(--accent2)', background: '#FAF9FF' }}><Plus size={14} />Add a step</button>
                {pm.cost.total > 0 && (
                  <div className="rounded-xl px-3.5 py-3 flex flex-col gap-1.5 text-[12.5px]" style={{ background: 'var(--bg2)' }}>
                    <div className="flex justify-between"><span style={{ color: 'var(--text2)' }}>Your money paid{ln ? ' (on the loan)' : ''}</span><b className="tabular-nums">{show(pm.ownPaid)}</b></div>
                    {ln && <div className="flex justify-between"><span style={{ color: 'var(--text2)' }}>Loan released</span><b className="tabular-nums">{show(pm.loan?.drawn ?? 0)}</b></div>}
                    <div className="flex justify-between"><span style={{ color: 'var(--text2)' }}>Still to pay{pm.stillLoan > 0.5 ? ` (loan ${show(pm.stillLoan)}, you ${show(pm.stillYou)})` : ''}</span><b className="tabular-nums">{show(pm.stillToPay)}</b></div>
                    {(() => { const sum = pm.ownPaid + (pm.loan?.drawn ?? 0) + pm.stillToPay, ok = Math.abs(sum - pm.cost.total) <= Math.max(1, pm.cost.total * 0.005)
                      return <div className="flex justify-between pt-1.5" style={{ borderTop: '1px solid var(--line)' }}><span className="font-semibold">{ok ? 'Adds up to the total cost' : `Adds up to ${show(sum)}, not the total ${show(pm.cost.total)}`}</span><b style={{ color: ok ? '#15803D' : '#B45309' }}>{ok ? '✓' : 'Check the steps'}</b></div> })()}
                  </div>
                )}
                {ln && <p className="text-[11.5px] leading-snug" style={{ color: 'var(--text4)' }}>Your own payments and the bank’s releases are kept on the {ln.name}; add them there or with “Record a payment” on the property.</p>}
              </div>
            )
          })()}
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
