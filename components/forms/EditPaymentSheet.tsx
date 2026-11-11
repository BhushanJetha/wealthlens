'use client'
import { useEffect, useState } from 'react'
import { X, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { fmtMoney } from '@/lib/format'
import { toast } from '@/components/ui/toaster'
import { holdingName } from '@/lib/holding'
import { unitsAt } from '@/lib/allotment'
import { bankLinks, editPayment, deletePayment, isSale, type PayType } from '@/lib/invPayment'
import type { InvEntry } from '@/lib/investEntries'

const fmtDate = (d: string) => new Date(`${d.slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
const num = (s: string) => s.replace(/[^0-9.]/g, '')
const round = (n: number, d: number) => String(Math.round(n * 10 ** d) / 10 ** d)
const lbl = 'block text-[12px] font-semibold mb-1'

export function Sheet({ title, sub, onClose, children, footer }: { title: string; sub?: string; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <div className="fixed inset-0 wl-sheet z-[60] flex items-end sm:items-center justify-center sm:p-4" style={{ background: 'rgba(15,23,42,.4)' }} onClick={onClose}>
      <div className="wl-sheet-panel w-full sm:max-w-[500px] rounded-t-2xl sm:rounded-2xl bg-white flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()} role="dialog" aria-label={title} style={{ boxShadow: '0 20px 60px rgba(15,23,42,.18)' }}>
        <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-3" style={{ borderBottom: '1px solid var(--track)' }}>
          <div className="min-w-0">
            <div className="text-[17px] font-bold leading-snug" style={{ color: 'var(--text)' }}>{title}</div>
            {sub && <div className="text-[12.5px] mt-0.5" style={{ color: 'var(--text3)' }}>{sub}</div>}
          </div>
          <button onClick={onClose} aria-label="Close" className="w-10 h-10 -mr-2 -mt-1.5 rounded-lg flex items-center justify-center flex-shrink-0" style={{ color: 'var(--text3)' }}><X size={18} /></button>
        </div>
        <div className="px-5 py-4 overflow-y-auto flex flex-col gap-4">{children}</div>
        {footer && <div className="px-5 py-3.5 flex items-center gap-2 flex-wrap" style={{ borderTop: '1px solid var(--track)' }}>{footer}</div>}
      </div>
    </div>
  )
}

// The bank payment(s) a recorded buy came from
function useBank(txnId: string) {
  const [links, setLinks] = useState<{ row: any; col: 'link_ref' | 'auto_ref' }[] | null>(null)
  useEffect(() => { let off = false; bankLinks(createClient(), txnId).then(l => { if (!off) setLinks(l) }, () => !off && setLinks([])); return () => { off = true } }, [txnId])
  return links
}

// Edit one fund or share payment: amount, date, units, NAV / price, SIP or
// lump sum, and which fund / share it went into
export function EditPaymentSheet({ entry, holdings, onClose, onDone, onDelete }: {
  entry: InvEntry; holdings: any[]; onClose: () => void; onDone: () => void; onDelete: () => void
}) {
  const type = entry.type as PayType, txn = entry.txn, fund = type === 'mutual_funds', sale = isSale(txn)
  const cur = entry.currency, money = (n: number) => fmtMoney(n, cur)
  const choices = holdings.filter(h => (h.currency || 'INR') === cur && (h.is_active !== false || h.id === entry.holding.id))
  const [holdingId, setHoldingId] = useState<string>(entry.holding.id)
  const [txnType, setTxnType] = useState<string>(txn.txn_type === 'sip' || entry.how === 'SIP' ? 'sip' : 'purchase')
  const [date, setDate] = useState(String(txn.txn_date).slice(0, 10))
  const [amount, setAmount] = useState(String(Number(txn.amount) || ''))
  const [units, setUnits] = useState(txn.units != null ? String(Number(txn.units)) : '')
  const [nav, setNav] = useState(txn.nav != null ? String(Number(txn.nav)) : '')
  const [touched, setTouched] = useState(false)     // units typed, not worked out
  const [fetched, setFetched] = useState(false)     // the NAV for the date was looked up
  const [navMsg, setNavMsg] = useState('')
  const [syncBank, setSyncBank] = useState(true)
  const [busy, setBusy] = useState(false)
  const links = useBank(txn.id)
  const target = choices.find(h => h.id === holdingId) ?? entry.holding

  // A fund's units follow its amount and NAV; a share's amount is shares × price
  const a = Number(amount) || 0, u = Number(units) || 0, p = Number(nav) || 0
  const total = fund && !sale ? a : Math.round(u * p * 100) / 100
  useEffect(() => { if (fund && !sale && !touched && a > 0 && p > 0) setUnits(round(unitsAt(a, p), 3)) }, [a, p]) // eslint-disable-line react-hooks/exhaustive-deps

  async function getNav() {
    if (!target.scheme_code) { setNavMsg('Match this fund’s exact scheme on its page first, or type the NAV.'); return }
    setNavMsg('Looking up the NAV…')
    try {
      const j = await fetch(`/api/mf-nav?schemeCode=${target.scheme_code}&date=${date}`).then(r => r.json())
      if (Number(j?.nav) > 0) { setNav(String(Number(j.nav))); setTouched(false); setFetched(true); setNavMsg(`NAV on ${fmtDate(j.date)}${j.date !== date ? ' (the next working day)' : ''}`); if (j.date !== date) setDate(j.date) }
      else setNavMsg(j?.error ?? 'No NAV found for that day.')
    } catch { setNavMsg('The NAV couldn’t be fetched just now.') }
  }

  async function save() {
    if (!(total > 0) || !(u > 0) || !(p > 0)) { toast(fund ? 'Enter the amount, NAV and units.' : 'Enter the shares and price.', 'error'); return }
    setBusy(true)
    const err = await editPayment(createClient(), type, txn, entry.holding, {
      holding: target, txn_type: sale ? txn.txn_type : fund ? txnType : 'purchase', date, amount: total, units: u, nav: p,
      estimated: fund && txn.estimated ? !(fetched || touched) : undefined, syncBank: !!links?.length && syncBank,
    })
    setBusy(false)
    if (err) { toast(err, 'error'); return }
    toast(target.id !== entry.holding.id ? `Moved to ${holdingName(type, target)}` : 'Payment updated')
    onDone()
  }

  const bank = links?.[0]?.row
  const changed = Math.abs(total - (Number(txn.amount) || 0)) >= 0.005 || date !== String(txn.txn_date).slice(0, 10)
  return (
    <Sheet title={sale ? `Edit ${fund ? 'redemption' : 'sale'}` : 'Edit payment'} sub={`${entry.how} · ${money(Number(txn.amount) || 0)} · ${fmtDate(String(txn.txn_date))}`} onClose={onClose}
      footer={<>
        <button onClick={onDelete} className="h-11 px-1.5 text-[13.5px] font-semibold" style={{ color: '#B4231A' }}>Delete payment</button>
        <span className="flex-1" />
        <button onClick={onClose} className="wl-btn" style={{ height: 44 }}>Cancel</button>
        <button onClick={save} disabled={busy} className="wl-btn wl-btn-primary disabled:opacity-60" style={{ height: 44 }}>{busy ? <Loader2 size={15} className="animate-spin" /> : 'Save changes'}</button>
      </>}>
      {!sale && (
        <label className="block"><span className={lbl} style={{ color: 'var(--text2)' }}>{fund ? 'Fund' : 'Share'}</span>
          <select value={holdingId} onChange={e => setHoldingId(e.target.value)} className="wl-input w-full" style={{ height: 44 }}>
            {choices.map(h => <option key={h.id} value={h.id}>{holdingName(type, h)}</option>)}
          </select>
          <span className="block text-[11.5px] mt-1" style={{ color: 'var(--text3)' }}>{holdingId !== entry.holding.id ? `The payment and its ${fund ? 'units' : 'shares'} move from ${entry.name} to ${holdingName(type, target)}.` : `Went into the wrong ${fund ? 'fund' : 'share'}? Pick the right one and it moves there.`}</span>
        </label>
      )}
      {fund && !sale && (
        <div role="radiogroup" aria-label="What it was" className="flex p-[3px] rounded-xl gap-0.5" style={{ background: 'var(--bg2)' }}>
          {[['sip', 'SIP'], ['purchase', 'Lump sum']].map(([v, l]) => (
            <button key={v} role="radio" aria-checked={txnType === v} onClick={() => setTxnType(v)} className="flex-1 h-10 rounded-[10px] text-[13px]"
              style={txnType === v ? { background: '#fff', fontWeight: 600, color: 'var(--text)', boxShadow: '0 1px 2px rgba(20,23,43,.08)' } : { color: 'var(--text2)' }}>{l}</button>
          ))}
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        {fund && !sale
          ? <label className="block"><span className={lbl} style={{ color: 'var(--text2)' }}>Amount paid</span>
              <input inputMode="decimal" value={amount} onChange={e => setAmount(num(e.target.value))} className="wl-input w-full" style={{ height: 44 }} /></label>
          : <label className="block"><span className={lbl} style={{ color: 'var(--text2)' }}>{fund ? 'Units' : 'Shares'}</span>
              <input inputMode="decimal" value={units} onChange={e => setUnits(num(e.target.value))} className="wl-input w-full" style={{ height: 44 }} /></label>}
        <label className="block"><span className={lbl} style={{ color: 'var(--text2)' }}>{fund ? 'Date (allotted)' : 'Date'}</span>
          <input type="date" value={date} max={new Date().toISOString().slice(0, 10)} onChange={e => { setDate(e.target.value); setFetched(false) }} className="wl-input w-full" style={{ height: 44 }} /></label>
      </div>
      {fund && !sale ? (
        <div className="rounded-xl p-3.5 flex flex-col gap-2.5" style={{ background: '#FAFAFE', border: '1px solid var(--line)' }}>
          <div className="flex items-center justify-between gap-2">
            <span className="text-[12px] font-semibold" style={{ color: 'var(--text2)' }}>Units</span>
            <button onClick={getNav} className="text-[12.5px] font-semibold h-9 px-1" style={{ color: 'var(--accent2)' }}>Get NAV for this date</button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="block"><span className="block text-[11.5px] mb-1" style={{ color: 'var(--text3)' }}>NAV</span>
              <input inputMode="decimal" value={nav} onChange={e => { setNav(num(e.target.value)); setFetched(false) }} className="wl-input w-full bg-white" style={{ height: 42 }} /></label>
            <label className="block"><span className="block text-[11.5px] mb-1" style={{ color: 'var(--text3)' }}>Units</span>
              <input inputMode="decimal" value={units} onChange={e => { setUnits(num(e.target.value)); setTouched(true) }} className="wl-input w-full bg-white" style={{ height: 42 }} /></label>
          </div>
          <p className="text-[11.5px] leading-snug" style={{ color: 'var(--text3)' }}>{navMsg || 'Units are the amount less 0.005% stamp duty, divided by the NAV. Or type them from your statement.'}</p>
        </div>
      ) : (
        <label className="block"><span className={lbl} style={{ color: 'var(--text2)' }}>{fund ? 'NAV' : 'Price a share'}</span>
          <input inputMode="decimal" value={nav} onChange={e => setNav(num(e.target.value))} className="wl-input w-full" style={{ height: 44 }} />
          {total > 0 && <span className="block text-[12px] mt-1" style={{ color: 'var(--text3)' }}>{sale ? 'Proceeds' : 'Cost'}: <b style={{ color: 'var(--text)' }}>{money(total)}</b></span>}
        </label>
      )}
      {!sale && links === null && <p className="text-[12px]" style={{ color: 'var(--text4)' }}>Looking for its bank payment…</p>}
      {!sale && bank && (
        <div className="rounded-xl p-3.5 flex flex-col gap-2" style={{ border: '1px solid var(--line)' }}>
          <div className="text-[12px] font-semibold" style={{ color: 'var(--text2)' }}>Bank payment it came from</div>
          <div className="text-[13px]" style={{ color: 'var(--text)' }}>{bank.merchant || 'Payment'} · {fmtMoney(Number(bank.amount) || 0, bank.currency || cur)} · {fmtDate(String(bank.txn_date))}</div>
          <label className="flex items-start gap-2.5 text-[13px] cursor-pointer" style={{ color: 'var(--text2)' }}>
            <input type="checkbox" checked={syncBank} onChange={e => setSyncBank(e.target.checked)} className="w-[18px] h-[18px] mt-px flex-shrink-0" style={{ accentColor: 'var(--accent)' }} />
            <span>Change the bank entry to match{changed ? ` (${money(total)}, ${fmtDate(date)})` : ''}<span className="block text-[11.5px]" style={{ color: 'var(--text3)' }}>Untick if the bank amount is right and only the investment was wrong.</span></span>
          </label>
        </div>
      )}
    </Sheet>
  )
}

// Delete one fund or share payment, and choose what happens to its bank payment
export function DeletePaymentSheet({ entry, periodTotal, periodLabel, onClose, onDone }: {
  entry: InvEntry; periodTotal?: number; periodLabel?: string; onClose: () => void; onDone: () => void
}) {
  const type = entry.type as PayType, txn = entry.txn, sale = isSale(txn), fund = type === 'mutual_funds'
  const money = (n: number) => fmtMoney(n, entry.currency)
  const links = useBank(txn.id)
  const [bank, setBank] = useState<'keep' | 'delete'>('keep')
  const [busy, setBusy] = useState(false)
  const u = Number(txn.units) || 0, unitWord = fund ? 'units' : u === 1 ? 'share' : 'shares'
  async function go() {
    setBusy(true)
    const err = await deletePayment(createClient(), type, txn, entry.holding, bank)
    setBusy(false)
    if (err) { toast(err, 'error'); return }
    toast('Payment deleted'); onDone()
  }
  const b = links?.[0]?.row
  return (
    <Sheet title="Delete this payment?" sub={`${entry.name} · ${entry.how} · ${fmtDate(String(txn.txn_date))} · ${money(Number(txn.amount) || 0)}`} onClose={onClose}
      footer={<>
        <span className="flex-1" />
        <button onClick={onClose} className="wl-btn" style={{ height: 44 }}>Cancel</button>
        <button onClick={go} disabled={busy || links === null} className="wl-btn wl-btn-primary disabled:opacity-60" style={{ height: 44, background: '#B4231A', borderColor: '#B4231A' }}>{busy ? <Loader2 size={15} className="animate-spin" /> : 'Delete payment'}</button>
      </>}>
      <div>
        <div className="text-[12px] font-semibold mb-1" style={{ color: 'var(--text2)' }}>What changes</div>
        <ul className="list-disc pl-5 text-[13px] leading-relaxed" style={{ color: 'var(--text2)' }}>
          {sale
            ? <li>{u ? `${+u.toFixed(3)} ${unitWord}` : 'The units'} go back into {entry.name}</li>
            : <li>{entry.name} loses {u ? `${u.toLocaleString('en-IN', { maximumFractionDigits: 3 })} ${unitWord}` : 'its units'} and {money(Number(txn.amount) || 0)} of what you put in</li>}
          {!sale && periodTotal != null && periodLabel && <li>“Put in” for {periodLabel} goes from {fmtMoney(periodTotal, entry.currency)} to {fmtMoney(Math.max(0, periodTotal - entry.amount), entry.currency)}</li>}
          {!sale && b?.link_ref?.month && <li>Its SIP shows as not paid for that month</li>}
        </ul>
      </div>
      {links === null ? <p className="text-[12px]" style={{ color: 'var(--text4)' }}>Looking for its bank payment…</p>
        : b ? (
          <div role="radiogroup" aria-label="Its bank payment" className="flex flex-col gap-2">
            <div className="text-[12px] font-semibold" style={{ color: 'var(--text2)' }}>The bank payment · {b.merchant || 'Payment'} · {fmtMoney(Number(b.amount) || 0, b.currency || entry.currency)} · {fmtDate(String(b.txn_date))}</div>
            {([['keep', 'Keep it, not tied to any investment', 'The money did leave your bank. Link it to the right investment later, from Expenses.'],
              ['delete', 'Delete it too', 'It was a duplicate, or the payment never happened.']] as const).map(([v, t, s]) => (
              <label key={v} className="flex items-start gap-2.5 rounded-xl px-3.5 py-3 cursor-pointer" style={{ border: bank === v ? '1.5px solid var(--accent)' : '1px solid var(--line)', background: bank === v ? 'var(--accent-bg)' : '#fff' }}>
                <input type="radio" name="bank" checked={bank === v} onChange={() => setBank(v)} className="w-[18px] h-[18px] mt-px flex-shrink-0" style={{ accentColor: 'var(--accent)' }} />
                <span className="text-[13.5px] font-medium" style={{ color: 'var(--text)' }}>{t}<span className="block text-[12px] font-normal" style={{ color: 'var(--text3)' }}>{s}</span></span>
              </label>
            ))}
          </div>
        ) : <p className="text-[12.5px]" style={{ color: 'var(--text3)' }}>{sale ? 'Money from the sale that reached your bank stays in Money; delete it there if it’s wrong too.' : 'No bank payment is linked to it, so only the investment changes.'}</p>}
    </Sheet>
  )
}
