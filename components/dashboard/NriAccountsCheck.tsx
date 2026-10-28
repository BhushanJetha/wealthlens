'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { fmtCompact } from '@/lib/format'

const KINDS = [
  { value: 'nre', label: 'NRE', note: 'Money from abroad · tax-free interest · fully repatriable' },
  { value: 'nro', label: 'NRO', note: 'Indian income (rent, dividends) · interest taxed' },
  { value: 'fcnr', label: 'FCNR', note: 'Deposit kept in a foreign currency · no rupee risk' },
  { value: 'resident', label: 'Resident', note: 'An ordinary savings account' },
]
// Guess from the account's name when it hasn't been marked
const guess = (a: any) => a.nri_kind ?? (/\bNRE\b/i.test(a.name) ? 'nre' : /\bNRO\b/i.test(a.name) ? 'nro' : /FCNR/i.test(a.name) ? 'fcnr' : null)

// Indian bank accounts for an NRI: mark each NRE / NRO / FCNR / resident
// (migration 032) and see what that means — a resident savings account must
// become NRO, money from abroad belongs in NRE, NRO interest is taxed.
export default function NriAccountsCheck({ accounts }: { accounts: any[] }) {
  const router = useRouter()
  const india = accounts.filter(a => a.currency === 'INR' && a.account_type !== 'credit_card' && a.account_type !== 'wallet')
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  if (!india.length) return null
  const ready = india.some(a => 'nri_kind' in a)
  const kinds = india.map(a => ({ a, k: guess(a) as string | null }))
  const nro = kinds.filter(x => x.k === 'nro').reduce((s, x) => s + Math.max(0, Number(x.a.current_balance) || 0), 0)
  const checks: { tone: 'warn' | 'info' | 'good'; text: string }[] = []
  if (kinds.some(x => x.k === 'resident')) checks.push({ tone: 'warn', text: 'A resident savings account should be changed to NRO once you become an NRI (FEMA rules) — ask the bank; it’s a form, not a new account.' })
  if (!kinds.some(x => x.k === 'nre')) checks.push({ tone: 'info', text: 'No NRE account marked. Money you send from the UAE is better in NRE: interest is tax-free in India and you can move it back any time.' })
  if (nro > 0) checks.push({ tone: 'info', text: `${fmtCompact(nro, 'INR')} in NRO. Its interest is taxed (30% TDS for NRIs) and moving it abroad needs forms 15CA/CB — keep Indian income here, and send UAE money to NRE instead.` })
  if (kinds.some(x => !x.k)) checks.push({ tone: 'warn', text: `${kinds.filter(x => !x.k).length} Indian account${kinds.filter(x => !x.k).length === 1 ? '' : 's'} not marked — pick NRE, NRO, FCNR or resident below.` })
  if (!checks.length) checks.push({ tone: 'good', text: 'Your Indian accounts look right for an NRI.' })

  async function setKind(id: string, nri_kind: string) {
    setBusy(id); setError('')
    const { error } = await createClient().from('accounts').update({ nri_kind: nri_kind || null }).eq('id', id)
    setBusy('')
    if (error) setError(/nri_kind/.test(error.message) ? 'Run migration 032 in Supabase to mark NRE / NRO accounts.' : error.message); else router.refresh()
  }

  return (
    <section className="wl-card px-4 md:px-5 py-4" aria-label="NRI account check">
      <h2 className="text-[14px] md:text-[15px] font-semibold" style={{ color: 'var(--text)' }}>NRE / NRO check</h2>
      <ul className="mt-2 flex flex-col gap-1.5">
        {checks.map((c, i) => <li key={i} className="text-[12.5px] leading-snug rounded-lg px-3 py-2" style={{ background: c.tone === 'warn' ? 'var(--amber-bg)' : c.tone === 'good' ? 'var(--pos-bg)' : 'var(--bg2)', color: c.tone === 'warn' ? 'var(--amber-text)' : c.tone === 'good' ? 'var(--pos-text)' : 'var(--text2)' }}>{c.text}</li>)}
      </ul>
      <ul className="mt-2.5">
        {kinds.map(({ a, k }) => (
          <li key={a.id} className="flex items-center gap-3 py-2" style={{ borderTop: '1px solid var(--track)' }}>
            <span className="flex-1 min-w-0">
              <span className="block text-[13px] font-medium truncate" style={{ color: 'var(--text)' }}>{a.name}</span>
              <span className="block text-[11px] truncate" style={{ color: 'var(--text4)' }}>{KINDS.find(x => x.value === k)?.note ?? 'Not marked'}{k && !a.nri_kind ? ' · guessed from the name' : ''}</span>
            </span>
            <select value={a.nri_kind ?? k ?? ''} onChange={e => setKind(a.id, e.target.value)} disabled={!ready || busy === a.id} className="wl-input flex-shrink-0" style={{ height: 34, width: 120 }} aria-label={`Kind of ${a.name}`}>
              <option value="">Not sure</option>
              {KINDS.map(x => <option key={x.value} value={x.value}>{x.label}</option>)}
            </select>
          </li>
        ))}
      </ul>
      {!ready && <p className="text-[11.5px] mt-2" style={{ color: 'var(--text4)' }}>Run migration 032 in Supabase to save these.</p>}
      {error && <p className="text-[12px] mt-2" style={{ color: '#B4231A' }}>{error}</p>}
    </section>
  )
}
