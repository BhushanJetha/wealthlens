'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CreditCard, Sparkles } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { fmtDay, addDaysTo } from '@/lib/insights'
import { rankCards, cycleOf } from '@/lib/cardCycle'
import { brandOf } from '@/lib/banks'
import { BankLogo } from '@/components/ui/BankCards'

const ordinal = (n: number) => `${n}${n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th'}`

// Which card to use today: the most interest-free days in the currency you're
// spending, from each card's statement cycle. Statement days can be set here.
export default function WhichCardPanel({ cards, today, className = '' }: { cards: any[]; today: string; className?: string }) {
  const router = useRouter()
  const [error, setError] = useState('')
  const [saving, setSaving] = useState<string | null>(null)
  const groups = (['AED', 'INR'] as const).map(cur => ({ cur, ranked: rankCards(cards, cur, today) })).filter(g => g.ranked.length)
  const noCycle = cards.filter(c => c.account_type === 'credit_card' && !cycleOf(c, today))
  if (!today || (!groups.length && !noCycle.length)) return null

  async function setDay(card: any, day: number | null) {
    setSaving(card.id); setError('')
    const { error } = await createClient().from('accounts').update({ statement_day: day }).eq('id', card.id)
    setSaving(null)
    if (error) setError(/statement_day/.test(error.message) ? 'Run migration 027 in Supabase to save statement days.' : error.message)
    else router.refresh()
  }
  const daySelect = (card: any, value: number | null, est: boolean) => (
    <select aria-label={`Statement day for ${card.name}`} value={est ? '' : String(value ?? '')} disabled={saving === card.id}
      onChange={e => setDay(card, e.target.value ? Number(e.target.value) : null)}
      className="rounded-md px-1.5 h-[26px] text-[11.5px] font-semibold" style={{ border: '1px solid var(--line)', background: '#fff', color: 'var(--text2)' }}>
      <option value="">{value ? `${ordinal(value)} (estimated)` : 'Set day'}</option>
      {Array.from({ length: 31 }, (_, i) => i + 1).map(d => <option key={d} value={d}>{ordinal(d)}</option>)}
    </select>
  )

  return (
    <section className={`wl-card px-4 md:px-5 py-4 md:py-[18px] ${className}`} aria-labelledby="which-card">
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="which-card" className="text-[14px] md:text-[15px] font-semibold" style={{ color: 'var(--text)' }}>Which card today?</h2>
        <span className="text-[11.5px]" style={{ color: 'var(--text4)' }}>Most days to pay, interest-free</span>
      </div>

      {groups.map(({ cur, ranked }) => {
        const best = ranked[0]
        const soon = ranked.slice(1).find(p => p.cycle.closes !== today && p.cycle.closes <= addDaysTo(today, 3))
        return (
          <div key={cur} className="mt-3">
            {groups.length > 1 && <div className="text-[10.5px] font-semibold uppercase tracking-[0.06em] mb-1.5" style={{ color: 'var(--text4)' }}>Spending in {cur === 'AED' ? 'dirhams' : 'rupees'}</div>}
            <div className="rounded-xl px-3.5 py-3 flex items-center gap-3" style={{ background: 'var(--accent-bg)', border: '1px solid var(--accent-border)' }}>
              <BankLogo brand={brandOf(best.card.bank_name, best.card.name)} size={34} />
              <div className="flex-1 min-w-0">
                <div className="text-[13.5px] font-semibold flex items-center gap-1.5 min-w-0" style={{ color: 'var(--accent2)' }}><Sparkles size={13} className="flex-shrink-0" /><span className="truncate">{best.card.name}</span></div>
                <div className="text-[12px]" style={{ color: 'var(--text2)' }}>
                  Statement closes {fmtDay(best.cycle.closes)}, pay by {fmtDay(best.cycle.payBy)}
                  {best.util != null && best.util >= 90 ? ' · nearly maxed out' : ''}
                </div>
              </div>
              <div className="text-right flex-shrink-0">
                <div className="text-[22px] font-bold tabular-nums leading-none" style={{ color: 'var(--accent2)' }}>{best.cycle.freeDays}</div>
                <div className="text-[10.5px] font-semibold" style={{ color: 'var(--text3)' }}>days to pay</div>
              </div>
            </div>
            {ranked.length === 1 && (
              <div className="flex items-center justify-end gap-2 pt-2 text-[12px]" style={{ color: 'var(--text3)' }}>
                Statement day {daySelect(best.card, best.cycle.statementDay, best.cycle.estimated)}
              </div>
            )}
            {ranked.length > 1 && <ul className="mt-1">
              {ranked.map(p => (
                <li key={p.card.id} className="flex items-center gap-2.5 py-2 text-[12.5px]" style={{ borderTop: '1px solid #F1F5F9' }}>
                  <CreditCard size={14} style={{ color: 'var(--text4)' }} className="flex-shrink-0" />
                  <span className="flex-1 min-w-0 truncate" style={{ color: 'var(--text)' }}>{p.card.name}</span>
                  <span className="hidden sm:inline" style={{ color: 'var(--text3)' }}>statement</span>
                  {daySelect(p.card, p.cycle.statementDay, p.cycle.estimated)}
                  <span className="w-[58px] text-right font-semibold tabular-nums" style={{ color: p === best ? 'var(--accent2)' : 'var(--text2)' }}>{p.cycle.freeDays} days</span>
                </li>
              ))}
            </ul>}
            {soon && (
              <p className="text-[12px] mt-1.5 leading-snug" style={{ color: 'var(--text3)' }}>
                {soon.card.name}’s statement closes {fmtDay(soon.cycle.closes)} — a big purchase on it after that gets about {cycleOf(soon.card, addDaysTo(soon.cycle.closes, 1))!.freeDays} days.
              </p>
            )}
          </div>
        )
      })}

      {noCycle.length > 0 && (
        <ul className="mt-3">
          {noCycle.map(c => (
            <li key={c.id} className="flex items-center gap-2.5 py-2 text-[12.5px]" style={{ borderTop: '1px solid #F1F5F9' }}>
              <CreditCard size={14} style={{ color: 'var(--text4)' }} />
              <span className="flex-1 min-w-0 truncate" style={{ color: 'var(--text)' }}>{c.name} <span style={{ color: 'var(--text4)' }}>· no due date yet</span></span>
              {daySelect(c, null, true)}
            </li>
          ))}
        </ul>
      )}

      {error && <div className="mt-2 rounded-lg px-3 py-2 text-[12px]" style={{ background: '#FEF2F2', color: '#B91C1C' }}>{error}</div>}
      <p className="text-[11.5px] mt-3 leading-snug" style={{ color: 'var(--text4)' }}>
        Days to pay assume you clear the full statement by its due date. Paying in the card’s own currency avoids foreign-exchange fees (usually 2–3.5%).
      </p>
    </section>
  )
}
