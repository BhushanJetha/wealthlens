'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { fmtCompact } from '@/lib/format'
import { COVER_MONTHS, type EmergencyAdvice } from '@/lib/emergency'
import { toast } from '@/components/ui/toaster'

// How big the emergency fund should be (lib/emergency), with a one-tap way to
// make that the goal's target. compact: one line for the Goals list.
export default function EmergencySize({ goal, advice, compact }: { goal: any; advice: EmergencyAdvice; compact?: boolean }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const cur = goal.currency === 'AED' ? 'AED' : 'INR'
  const short = (n: number) => fmtCompact(n, cur)
  const step = cur === 'AED' ? 500 : 5000
  const suggested = Math.ceil(advice.target / step) * step
  const current = Number(goal.target_amount) || 0
  const differs = suggested > 0 && Math.abs(suggested - current) > Math.max(step, current * 0.05)

  async function use() {
    setBusy(true)
    const { error } = await createClient().from('goals').update({ target_amount: suggested }).eq('id', goal.id)
    setBusy(false)
    if (error) { toast(error.message, 'error'); return }
    toast(`Target set to ${short(suggested)} — ${COVER_MONTHS} months of your spending`); router.refresh()
  }

  if (!advice.basis) return compact ? null : (
    <p className="text-[12.5px] mt-2 leading-snug" style={{ color: 'var(--text3)' }}>Once there are 6 months of {cur} spending recorded, this works out how big your emergency fund should be.</p>
  )
  if (compact) return differs ? (
    <div className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[12px]" style={{ background: 'var(--bg2)', color: 'var(--text2)' }}>
      <span className="flex-1 min-w-0">From your spending it should be about <b>{short(suggested)}</b> ({COVER_MONTHS} months).</span>
      <button onClick={use} disabled={busy} className="font-semibold flex-shrink-0 disabled:opacity-60" style={{ color: 'var(--accent)' }}>{busy ? 'Saving…' : 'Use it'}</button>
    </div>
  ) : null

  return (
    <div className="mt-2 flex flex-col gap-2.5">
      <table className="w-full text-[12.5px]">
        <thead><tr style={{ color: 'var(--text4)' }}>
          <th className="text-left font-medium pb-1">Spending + EMIs</th><th className="text-right font-medium pb-1">A month</th><th className="text-right font-medium pb-1">{COVER_MONTHS} months</th>
        </tr></thead>
        <tbody>{advice.windows.map(w => (
          <tr key={w.months} style={{ borderTop: '1px solid var(--track)', color: 'var(--text2)', fontWeight: w === advice.basis ? 600 : 400 }}>
            <td className="py-1.5">Last {w.months === 24 ? '2 years' : w.months === 12 ? '12 months' : '6 months'}{w === advice.basis ? ' · used' : ''}</td>
            <td className="py-1.5 text-right tabular-nums">{short(w.monthly)}</td>
            <td className="py-1.5 text-right tabular-nums" style={{ color: 'var(--text)' }}>{short(w.target)}</td>
          </tr>
        ))}</tbody>
      </table>
      <p className="text-[12.5px] leading-snug" style={{ color: 'var(--text2)' }}>
        Keep about <b style={{ color: 'var(--text)' }}>{short(suggested)}</b>: {COVER_MONTHS} months of what you spend, using the higher of your recent averages so a rise is covered.
        Raise it about <b style={{ color: 'var(--text)' }}>{advice.growth}% a year</b> ({advice.growthFrom === 'spending' ? 'how much your spending grew over the last year' : `typical ${cur === 'AED' ? 'UAE' : 'India'} price rises`}), to about {short(advice.nextYear)} next year.
      </p>
      {differs ? (
        <button onClick={use} disabled={busy} className="wl-btn wl-btn-primary self-start disabled:opacity-60" style={{ height: 34 }}>
          {busy && <Loader2 size={13} className="animate-spin" />}Use {short(suggested)} as the target
        </button>
      ) : <p className="text-[12px]" style={{ color: 'var(--pos-text)' }}>✓ Your target matches this.</p>}
    </div>
  )
}
