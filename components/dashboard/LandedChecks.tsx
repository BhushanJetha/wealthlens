'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { fmtMoney } from '@/lib/format'
import { fmtDay } from '@/lib/insights'
import { landedToAsk, type Remittance } from '@/lib/money'
import { toast } from '@/components/ui/toaster'
import { Sheet } from './BillSheets'

export const landedCheckCount = (txns: any[], today: string, fx: number) => landedToAsk(txns, today, fx).length

// The rupees that landed, as you saw them (null goes back to today's rate)
async function saveLanded(id: string, value: number | null): Promise<string | null> {
  const { error } = await createClient().from('transactions').update({ counter_amount: value }).eq('id', id)
  return error ? (/counter_amount/.test(error.message) ? 'Run migration 042 in Supabase to save this.' : error.message) : null
}
const digits = (s: string) => s.replace(/[^0-9.]/g, '')
// A rate this far off is almost always a typing slip
const rateNote = (value: number, aed: number) => {
  if (!(value > 0) || !(aed > 0)) return null
  const rate = value / aed
  return { text: `That's ₹${rate.toFixed(2)} per AED`, odd: rate < 15 || rate > 35 }
}

// Rows for Needs you: transfers still at an estimate
export default function LandedChecks({ txns, today, fx }: { txns: any[]; today: string; fx: number }) {
  const router = useRouter()
  const [done, setDone] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState<string | null>(null)
  const [values, setValues] = useState<Record<string, string>>({})
  const rows = landedToAsk(txns, today, fx).filter(r => !done.has(r.id))
  async function save(r: Remittance, value: number) {
    if (!(value > 0)) { toast('Enter the rupees you got.', 'error'); return }
    setBusy(r.id)
    const err = await saveLanded(r.out.id, value)
    setBusy(null)
    if (err) { toast(err, 'error'); return }
    setDone(s => new Set(s).add(r.id))
    toast(`${fmtMoney(value, 'INR')} landed. Your India balance is updated.`)
    router.refresh()
  }
  const st = { height: 30, fontSize: 12 }
  return (<>
    {rows.map(r => {
      const v = values[r.id] ?? '', note = rateNote(Number(v), r.aed ?? 0), b = busy === r.id
      return (
        <li key={r.id} className="flex gap-2.5 items-center py-[9px] flex-wrap md:flex-nowrap wl-hide-viewing" style={{ borderTop: '1px solid #F1F5F9' }}>
          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: '#D97706' }} />
          <span className="flex-1 min-w-0 max-md:basis-[calc(100%-18px)]">
            <span className="block text-[13px] font-semibold" style={{ color: 'var(--text)' }}>{fmtMoney(r.aed ?? 0, 'AED')} sent on {fmtDay(r.sentOn!)}: how many rupees landed?</span>
            <span className="block text-[12px] mt-px" style={{ color: note?.odd ? '#B91C1C' : 'var(--text3)' }}>{note ? `${note.text}${note.odd ? '. Please check the amount' : ''}` : `We estimated ${fmtMoney(r.inr, 'INR')} at today's rate`}</span>
          </span>
          <span className="flex gap-1.5 flex-wrap items-center max-md:w-full max-md:pl-[18px] md:flex-shrink-0 md:justify-end">
            <input inputMode="decimal" value={v} onChange={e => setValues(x => ({ ...x, [r.id]: digits(e.target.value) }))} placeholder="₹ received" aria-label={`Rupees received for ${fmtMoney(r.aed ?? 0, 'AED')}`} className="wl-input" style={{ height: 30, fontSize: 12.5, width: 110 }} />
            <button onClick={() => save(r, Number(v))} disabled={b || !v} className="wl-btn wl-btn-primary disabled:opacity-60" style={st}>Save</button>
            <button onClick={() => save(r, r.inr)} disabled={b} className="wl-btn disabled:opacity-60" style={st}>Estimate is right</button>
          </span>
        </li>
      )
    })}
  </>)
}

// From Money flow: correct it any time
export function LandedSheet({ r, onClose }: { r: Remittance; onClose: () => void }) {
  const router = useRouter()
  const [value, setValue] = useState(String(r.inr))
  const [busy, setBusy] = useState(false)
  const note = rateNote(Number(value), r.aed ?? 0)
  async function run(next: number | null) {
    if (next !== null && !(next > 0)) { toast('Enter the rupees you got.', 'error'); return }
    setBusy(true)
    const err = await saveLanded(r.out.id, next)
    setBusy(false)
    if (err) { toast(err, 'error'); return }
    toast(next === null ? 'Back to the estimate at today’s rate' : `${fmtMoney(next, 'INR')} landed. Your India balance is updated.`)
    onClose(); router.refresh()
  }
  return (
    <Sheet title="Rupees received" onClose={onClose}>
      <p className="text-[12.5px] leading-snug" style={{ color: 'var(--text3)' }}>{fmtMoney(r.aed ?? 0, 'AED')} sent{r.sentOn ? ` on ${fmtDay(r.sentOn)}` : ''}. Enter what actually reached your account. Your India balance and rate follow this amount.</p>
      <label className="block">
        <span className="block text-[12px] font-semibold mb-1" style={{ color: 'var(--text2)' }}>Amount received in ₹</span>
        <input inputMode="decimal" autoFocus value={value} onChange={e => setValue(digits(e.target.value))} className="wl-input w-full" style={{ height: 44 }} />
      </label>
      {note && <p className="text-[12.5px]" style={{ color: note.odd ? '#B91C1C' : 'var(--text3)' }}>{note.text}{note.odd ? '. Please check the amount.' : '.'}</p>}
      <button onClick={() => run(Number(value))} disabled={busy} className="wl-btn wl-btn-primary disabled:opacity-60" style={{ height: 44 }}>{busy ? 'Saving…' : 'Save'}</button>
      {r.source === 'entered' && <button onClick={() => run(null)} disabled={busy} className="wl-btn disabled:opacity-60" style={{ height: 44 }}>Use today’s rate instead</button>}
    </Sheet>
  )
}
