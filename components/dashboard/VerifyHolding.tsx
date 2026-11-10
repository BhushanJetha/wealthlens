'use client'
import { useEffect, useState } from 'react'
import { X, ShieldCheck, AlertTriangle, Loader2, Check } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { verifyState, saveVerified, unitsOf, investedOf, priceOf, type VerifyType } from '@/lib/verify'
import { fmtMoney } from '@/lib/format'
import { toast } from '@/components/ui/toaster'

const day = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })

// The mark on a fund or share: verified with your app (and when), or needs a review
export function VerifyBadge({ type, row, today, compact = false, onClick }: { type: VerifyType; row: any; today: string; compact?: boolean; onClick?: () => void }) {
  const v = verifyState(type, row, today)
  const ok = v.state === 'verified'
  const title = ok ? `Checked with your app on ${day(v.at!)} — nothing has changed since` : v.reasons.join(' · ')
  if (compact) return (
    <span title={title} aria-label={ok ? 'Verified with your app' : 'Needs a review'} className="inline-flex items-center flex-shrink-0" style={{ color: ok ? '#1E7A50' : '#B96A0B' }}>
      {ok ? <ShieldCheck size={13} /> : <AlertTriangle size={13} />}
    </span>
  )
  const Tag = onClick ? 'button' : 'span'
  return (
    <Tag onClick={onClick} title={title} className="rounded-md px-2 py-[3px] font-semibold inline-flex items-center gap-1"
      style={ok ? { background: '#E7F7EF', color: '#1E7A50' } : { background: '#FFF3E0', color: '#9A5A08' }}>
      {ok ? <><ShieldCheck size={12} />Verified with your app · {day(v.at!)}</> : <><AlertTriangle size={12} />{v.state === 'never' ? 'Not verified yet' : 'Needs a review'}</>}
    </Tag>
  )
}

// Compare with your broker / fund app: if it matches, mark it verified; if not,
// put in what your app shows and WealthLens takes those numbers.
export function VerifySheet({ type, row, today, onClose, onSaved }: { type: VerifyType; row: any; today: string; onClose: () => void; onSaved: () => void }) {
  const cur = row.currency === 'AED' ? 'AED' : 'INR'
  const ours = { units: unitsOf(type, row), invested: investedOf(type, row) }
  const [units, setUnits] = useState(String(+ours.units.toFixed(type === 'mutual_funds' ? 3 : 4)))
  const [invested, setInvested] = useState(String(Math.round(ours.invested * 100) / 100))
  const [appValue, setAppValue] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const v = verifyState(type, row, today)
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', esc); return () => window.removeEventListener('keydown', esc)
  }, [onClose])

  const u = Number(units), inv = Number(invested)
  const changed = Math.abs(u - ours.units) > 1e-6 || Math.abs(inv - ours.invested) > 0.005
  const price = priceOf(type, row), ourValue = (changed ? u : ours.units) * price
  const av = Number(appValue)
  const valueGap = av > 0 ? av - ourValue : 0
  const word = type === 'stocks' ? 'Shares' : 'Units'

  async function save() {
    setBusy(true); setError('')
    const err = await saveVerified(createClient(), type, row, { units: u, invested: inv })
    setBusy(false)
    if (err) { setError(err); return }
    toast(changed ? 'Updated to your app’s numbers and verified' : 'Marked as verified with your app'); onSaved()
  }

  return (
    <div className="fixed inset-0 wl-sheet z-[60] flex items-center justify-center p-4" style={{ background: 'rgba(15,23,42,.4)' }} onClick={onClose}>
      <div className="wl-sheet-panel w-full max-w-[460px] rounded-2xl bg-white flex flex-col max-h-[88vh]" onClick={e => e.stopPropagation()} role="dialog" aria-label="Check against your app" style={{ boxShadow: '0 20px 60px rgba(15,23,42,.18)' }}>
        <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-2">
          <div className="min-w-0"><div className="text-[17px] font-bold" style={{ color: 'var(--text)' }}>Check against your app</div>
            <div className="text-[12.5px] truncate" style={{ color: 'var(--text3)' }}>{row.fund_name ?? row.name ?? row.symbol}</div></div>
          <button onClick={onClose} aria-label="Close" className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ color: 'var(--text3)' }}><X size={18} /></button>
        </div>
        <div className="px-5 pb-5 overflow-y-auto flex flex-col gap-3">
          {v.state !== 'verified' && (
            <ul className="rounded-xl px-3.5 py-2.5 text-[12.5px] flex flex-col gap-1" style={{ background: '#FFF8EC', border: '1px solid #F6DDB4', color: '#7A4A06' }}>
              {v.reasons.map(r => <li key={r} className="flex gap-1.5"><AlertTriangle size={13} className="flex-shrink-0 mt-[2px]" />{r}</li>)}
            </ul>
          )}
          <p className="text-[12.5px] leading-snug" style={{ color: 'var(--text2)' }}>Open {type === 'mutual_funds' ? 'your fund app or CAS' : 'your broker app'} and compare. If something differs, type what your app shows.</p>
          <div className="grid grid-cols-2 gap-2.5">
            <label className="block"><span className="block text-[11.5px] font-semibold mb-1" style={{ color: 'var(--text2)' }}>{word} in your app</span>
              <input inputMode="decimal" value={units} onChange={e => setUnits(e.target.value.replace(/[^0-9.]/g, ''))} className="wl-input w-full" style={{ height: 42 }} /></label>
            <label className="block"><span className="block text-[11.5px] font-semibold mb-1" style={{ color: 'var(--text2)' }}>Invested (cost) in your app</span>
              <input inputMode="decimal" value={invested} onChange={e => setInvested(e.target.value.replace(/[^0-9.]/g, ''))} className="wl-input w-full" style={{ height: 42 }} /></label>
          </div>
          <label className="block"><span className="block text-[11.5px] font-semibold mb-1" style={{ color: 'var(--text2)' }}>Current value in your app <span className="font-normal" style={{ color: 'var(--text4)' }}>(optional)</span></span>
            <input inputMode="decimal" value={appValue} onChange={e => setAppValue(e.target.value.replace(/[^0-9.]/g, ''))} placeholder={fmtMoney(ourValue, cur)} className="wl-input w-full" style={{ height: 42 }} /></label>
          <div className="rounded-xl px-3.5 py-2.5 text-[12.5px] flex flex-col gap-1" style={{ background: '#FAFAFE', border: '1px solid var(--line)', color: 'var(--text3)' }}>
            <span>WealthLens now: <b style={{ color: 'var(--text2)' }}>{+ours.units.toFixed(4)} {word.toLowerCase()}</b> · <b style={{ color: 'var(--text2)' }}>{fmtMoney(ours.invested, cur)}</b> in · worth <b style={{ color: 'var(--text2)' }}>{fmtMoney(ours.units * price, cur)}</b> at {cur === 'AED' ? 'AED ' : '₹'}{price.toLocaleString('en-IN', { maximumFractionDigits: 4 })}</span>
            {av > 0 && Math.abs(valueGap) > Math.max(1, ourValue * 0.002) && (
              <span style={{ color: '#9A5A08' }}>Your app’s value is {fmtMoney(Math.abs(valueGap), cur)} {valueGap > 0 ? 'higher' : 'lower'}.{!changed ? ` With the same ${word.toLowerCase()}, that’s the ${type === 'mutual_funds' ? 'NAV' : 'price'}: your app may show a newer or older date${type === 'mutual_funds' ? ', or another plan of the fund (Direct / Regular)' : ''}.` : ''}</span>
            )}
          </div>
          {error && <div className="rounded-lg px-3 py-2 text-[12.5px]" style={{ background: '#FDECE8', color: '#B4231A' }}>{error}</div>}
          <button onClick={save} disabled={busy || !(u >= 0) || !(inv >= 0)} className="wl-btn wl-btn-primary justify-center disabled:opacity-60" style={{ height: 44 }}>
            {busy ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}{changed ? 'Update to these and mark verified' : 'It matches — mark verified'}
          </button>
          {changed && <p className="text-[11.5px] -mt-1" style={{ color: 'var(--text4)' }}>Your app’s numbers replace WealthLens’s; the average {type === 'mutual_funds' ? 'NAV' : 'price'} follows. Your purchase history stays as it is.</p>}
        </div>
      </div>
    </div>
  )
}
