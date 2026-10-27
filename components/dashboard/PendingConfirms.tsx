'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { fmtMoney } from '@/lib/format'
import { fmtDay } from '@/lib/insights'
import { addOccurrence, claimMonth, type Occurrence } from '@/lib/recurring'
import { recordEmi, claimEmiMonth, type EmiDue } from '@/lib/loanAuto'
import { recordSip, claimSipMonth, type SipDue } from '@/lib/sipAuto'

export interface Pending { recurring?: Occurrence[]; emis?: EmiDue[]; sips?: SipDue[] }
export const pendingCount = (p: Pending) => (p.recurring?.length ?? 0) + (p.emis?.length ?? 0) + (p.sips?.length ?? 0)

type Row = { key: string; title: string; detail: string; yes: string; no: string; run: (add: boolean, uid: string) => Promise<string | null> }

// Payments whose day has come but couldn't be confirmed from a statement:
// one tap records them (or skips the month). Rendered as <li> rows.
export default function PendingConfirms({ pending, accName = () => null }: { pending: Pending; accName?: (id: string | null) => string | null }) {
  const router = useRouter()
  const supabase = createClient()
  const [done, setDone] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')

  const rows: Row[] = [
    ...(pending.recurring ?? []).map(o => ({
      key: `r|${o.r.id}|${o.month}`, yes: 'Add', no: 'Skip',
      title: `Add ${o.r.merchant}? ${fmtMoney(Number(o.r.amount), o.r.currency)}`,
      detail: `Repeats monthly · due ${fmtDay(o.date)}${accName(o.r.account_id) ? ` · from ${accName(o.r.account_id)}` : ''}`,
      run: async (add: boolean, uid: string) => add ? (await addOccurrence(supabase, uid, o)).error : (await claimMonth(supabase, o.r, o.month)) ? null : 'Already done',
    })),
    ...(pending.emis ?? []).map(d => ({
      key: `e|${d.loan.id}|${d.month}`, yes: 'Paid', no: 'Not this month',
      title: `Did the ${d.loan.name} EMI go out? ${fmtMoney(d.amount, d.loan.currency || 'INR')}`,
      detail: `Due ${fmtDay(d.date)} · not in your statements yet${accName(d.loan.pay_from_account_id) ? ` · from ${accName(d.loan.pay_from_account_id)}` : ''}`,
      run: async (add: boolean, uid: string) => add ? recordEmi(supabase, uid, d, { moneyRow: true, note: 'Confirmed by you' }) : (await claimEmiMonth(supabase, d.loan, d.month)) ? null : 'Already done',
    })),
    ...(pending.sips ?? []).map(d => ({
      key: `s|${d.fund.id}|${d.month}`, yes: 'Yes', no: 'Skipped',
      title: `Did your ${d.fund.fund_name} SIP go through? ${fmtMoney(d.amount, d.fund.currency ?? 'INR')}`,
      detail: `Due ${fmtDay(d.date)}${d.nav > 0 ? ` · about ${(d.amount / d.nav).toFixed(2)} units at NAV ${d.nav.toFixed(2)}` : ''}`,
      run: async (add: boolean, uid: string) => add ? recordSip(supabase, uid, d, { moneyRow: true }) : (await claimSipMonth(supabase, d.fund, d.month)) ? null : 'Already done',
    })),
  ].filter(r => !done.has(r.key))

  async function act(r: Row, add: boolean) {
    setBusy(r.key); setError('')
    const { data: { user } } = await supabase.auth.getUser()
    const err = user ? await r.run(add, user.id) : 'Signed out'
    setBusy(null)
    if (err && !/^Already/.test(err)) { setError(err); return }
    setDone(s => new Set(s).add(r.key)); router.refresh()
  }

  return (<>
    {rows.map(r => (
      <li key={r.key} className="flex gap-2.5 items-center py-[9px] flex-wrap md:flex-nowrap" style={{ borderTop: '1px solid #F1F5F9' }}>
        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: '#D97706' }} aria-label="To confirm" />
        <span className="flex-1 min-w-0">
          <span className="block text-[13px] font-semibold" style={{ color: 'var(--text)' }}>{r.title}</span>
          <span className="block text-[12px] mt-px" style={{ color: 'var(--text3)' }}>{r.detail}</span>
        </span>
        <span className="flex gap-1.5 flex-shrink-0 max-md:pl-[18px]">
          <button onClick={() => act(r, true)} disabled={busy === r.key} className="wl-btn wl-btn-primary disabled:opacity-60" style={{ height: 30, fontSize: 12 }}>{r.yes}</button>
          <button onClick={() => act(r, false)} disabled={busy === r.key} className="wl-btn disabled:opacity-60" style={{ height: 30, fontSize: 12 }}>{r.no}</button>
        </span>
      </li>
    ))}
    {error && <li className="text-[12px] py-1.5" style={{ color: '#B91C1C' }}>{error}</li>}
  </>)
}
