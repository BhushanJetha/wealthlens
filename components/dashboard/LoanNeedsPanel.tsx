'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronRight, Zap, Hand } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { fmtMoney } from '@/lib/format'
import { fmtDay, daysBetween, nextOccurrence } from '@/lib/insights'
import type { EmiDue } from '@/lib/loanAuto'
import PendingConfirms from './PendingConfirms'

const SEV: Record<string, string> = { high: '#DC2626', medium: '#D97706', low: '#6A55E8', good: '#16A34A' }
const ym = (d: Date) => d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })

// Months to clear `bal` at `rate`% paying `emi` (null if it never clears)
function monthsLeft(bal: number, rate: number, emi: number) {
  const r = rate / 1200
  if (emi <= bal * r || emi <= 0) return null
  let b = bal, n = 0
  while (b > 0.5 && n < 600) { b = b * (1 + r) - emi; n++ }
  return n
}

// Loans › Needs you: EMIs to confirm, EMIs this week, balances that have gone
// stale, rates worth questioning, loans about to end; plus how EMIs are
// tracked per loan (record automatically, or ask), and this year so far.
export default function LoanNeedsPanel({ loans, pendingEmis, loanTxns, today, className = '' }: {
  loans: any[]; pendingEmis: EmiDue[]; loanTxns: any[]; today: string; className?: string
}) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')
  const ids = new Set(loans.map(l => l.id))
  const pending = pendingEmis.filter(d => ids.has(d.loan.id))
  const ready = loans.some(l => 'emi_last_month' in l)
  const money = (n: number, l: any) => fmtMoney(n, l.currency || 'INR')

  const needs: { id: string; sev: string; title: string; detail: string; href?: string }[] = []
  for (const l of loans) {
    const emi = Number(l.emi_amount) || 0, bal = Number(l.outstanding_amt) || 0, rate = Number(l.interest_rate) || 0
    const next = nextOccurrence(l.next_emi_date, today)
    const days = next ? daysBetween(today, next) : null
    if (days != null && days <= 7 && emi > 0) needs.push({ id: `due-${l.id}`, sev: days <= 2 ? 'high' : 'medium', href: `/dashboard/loans/detail/${l.id}`,
      title: `${l.name} EMI ${days === 0 ? 'today' : days === 1 ? 'tomorrow' : `on ${fmtDay(next!)}`}`, detail: `${money(emi, l)}${l.bank_name ? ` · ${l.bank_name}` : ''}` })
    const asOf = l.outstanding_live?.asOf ?? String(l.updated_at ?? '').slice(0, 10)
    if (asOf && daysBetween(asOf, today) > 120 && !(l.outstanding_live?.emis > 0)) needs.push({ id: `stale-${l.id}`, sev: 'low', href: `/dashboard/loans/detail/${l.id}`,
      title: `${l.name}: balance from ${fmtDay(asOf)}`, detail: 'Import the latest loan statement, or confirm EMIs as they go, and it keeps itself up to date' })
    const homeCar = ['home_loan', 'car_loan'].includes(l.loan_type ?? 'home_loan')
    if (homeCar && bal > 0 && rate >= ((l.currency || 'INR') === 'AED' ? 6.5 : 9.25)) needs.push({ id: `rate-${l.id}`, sev: 'low', href: `/dashboard/loans/detail/${l.id}`,
      title: `${l.name} is at ${rate}%`, detail: `On the high side for a ${l.loan_type === 'car_loan' ? 'car' : 'home'} loan — worth asking ${l.bank_name || 'the bank'} for a lower rate, or comparing a balance transfer` })
    const left = bal > 0 && emi > 0 ? monthsLeft(bal, rate, emi) : null
    if (left != null && left <= 6) { const d = new Date(); d.setMonth(d.getMonth() + left)
      needs.push({ id: `end-${l.id}`, sev: 'good', title: `${l.name} ends around ${ym(d)}`, detail: `${money(emi, l)} a month frees up — decide now where it goes (an SIP, the next loan…)`, href: `/dashboard/loans/detail/${l.id}` }) }
  }

  // This calendar year, from the EMIs and prepayments on record
  const year = today.slice(0, 4)
  const rows = loanTxns.filter(t => ids.has(t.loan_id) && String(t.txn_date).startsWith(year) && (t.kind === 'emi' || t.kind === 'prepayment'))
  const byCur: Record<string, { paid: number; interest: number; known: number; n: number }> = {}
  for (const t of rows) {
    const cur = loans.find(l => l.id === t.loan_id)?.currency || 'INR'
    const e = byCur[cur] ??= { paid: 0, interest: 0, known: 0, n: 0 }
    e.paid += Number(t.amount) || 0; e.n++
    if (t.interest != null) { e.interest += Number(t.interest) || 0; e.known++ }
  }

  async function setAuto(l: any, auto: boolean) {
    setBusy(l.id); setError('')
    const { error } = await createClient().from('home_loans').update({ emi_auto: auto }).eq('id', l.id)
    setBusy(null)
    if (error) setError(error.message); else router.refresh()
  }

  return (
    <section className={`wl-card px-4 md:px-5 py-4 md:py-[18px] ${className}`} aria-labelledby="loan-needs">
      <div className="flex items-center justify-between gap-2">
        <h2 id="loan-needs" className="text-[14px] md:text-[15px] font-semibold" style={{ color: 'var(--text)' }}>Needs you</h2>
        {pending.length + needs.length > 0 && <span className="text-[11px] font-semibold px-2 py-[3px] rounded-full" style={{ background: '#FEF2F2', color: '#DC2626' }}>{pending.length + needs.length}</span>}
      </div>
      <ul className="mt-2">
        <PendingConfirms pending={{ emis: pending }} />
        {needs.map(n => (
          <li key={n.id} style={{ borderTop: '1px solid #F1F5F9' }}>
            <Link href={n.href ?? '/dashboard/loans'} className="flex gap-2.5 items-start py-[9px] -mx-2 px-2 rounded-lg hover:bg-[#F5F3FE] transition-colors">
              <span className="w-2 h-2 rounded-full mt-[5px] flex-shrink-0" style={{ background: SEV[n.sev] }} />
              <span className="flex-1 min-w-0">
                <span className="block text-[13px] font-semibold" style={{ color: 'var(--text)' }}>{n.title}</span>
                <span className="block text-[12px] mt-px" style={{ color: 'var(--text3)' }}>{n.detail}</span>
              </span>
              <ChevronRight size={16} className="flex-shrink-0 mt-0.5" style={{ color: 'var(--text4)' }} />
            </Link>
          </li>
        ))}
        {pending.length + needs.length === 0 && <li className="text-[12.5px] py-4" style={{ color: 'var(--text3)' }}>Nothing needs you — no EMIs due this week.</li>}
      </ul>

      {Object.keys(byCur).length > 0 && (
        <div className="mt-3 rounded-xl px-3.5 py-2.5" style={{ background: 'var(--bg2)' }}>
          {Object.entries(byCur).map(([cur, e]) => (
            <div key={cur} className="text-[12.5px]" style={{ color: 'var(--text2)' }}>
              <b style={{ color: 'var(--text)' }}>{year} so far:</b> {e.n} payment{e.n === 1 ? '' : 's'} · {fmtMoney(e.paid, cur)} paid
              {e.known === e.n && e.interest > 0 ? <> · {fmtMoney(e.interest, cur)} of it interest</> : null}
            </div>
          ))}
        </div>
      )}

      <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--track)' }}>
        <div className="text-[11.5px] font-semibold mb-1" style={{ color: 'var(--text2)' }}>EMI tracking</div>
        {!ready ? (
          <p className="text-[12px] leading-snug" style={{ color: 'var(--text3)' }}>Run migration 028 in Supabase: EMIs then get recorded on their day and each balance updates itself.</p>
        ) : (<>
          {loans.filter(l => Number(l.emi_amount) > 0).map(l => (
            <div key={l.id} className="flex items-center gap-2.5 py-1.5 text-[12.5px]">
              <span className="flex-1 min-w-0 truncate" style={{ color: 'var(--text)' }}>{l.name}
                <span style={{ color: 'var(--text4)' }}>{l.emi_last_month ? ` · last recorded ${fmtDay(`${l.emi_last_month}-01`).split(' ')[1]}` : ''}</span></span>
              <button onClick={() => setAuto(l, !l.emi_auto)} disabled={busy === l.id}
                title={l.emi_auto ? 'Recorded on the EMI day — tap to be asked first' : 'You’re asked if it isn’t in your statement — tap to record it automatically'}
                className="rounded-full px-2 h-[26px] text-[11px] font-semibold flex items-center gap-1 flex-shrink-0"
                style={l.emi_auto ? { background: '#E7F7EF', color: '#1E7A50' } : { background: 'var(--accent-bg)', color: 'var(--accent2)' }}>
                {l.emi_auto ? <><Zap size={11} />Auto</> : <><Hand size={11} />Ask</>}
              </button>
            </div>
          ))}
          <p className="text-[11.5px] mt-1 leading-snug" style={{ color: 'var(--text4)' }}>
            An EMI found in your bank statement is always recorded for you. Each recorded EMI takes its principal off the balance.
          </p>
        </>)}
        {error && <div className="mt-2 text-[12px]" style={{ color: '#B91C1C' }}>{error}</div>}
      </div>
    </section>
  )
}
