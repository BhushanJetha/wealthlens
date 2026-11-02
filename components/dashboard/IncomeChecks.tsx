'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { fmtMoney } from '@/lib/format'
import { addDaysTo, fmtDay } from '@/lib/insights'
import { addFromPlan, planChecks, unknownCredits, type IncomePlan, type PlanCheck } from '@/lib/incomePlans'
import { toast } from '@/components/ui/toaster'

export const incomeCheckCount = (plans: IncomePlan[], txns: any[], today: string, fx: number) =>
  planChecks(plans, today, txns).length + unknownCredits(plans, txns, today, fx).length

const NOUN: Record<string, string> = { income: 'expected', remit: 'to send to India', nre_nro: 'to move to NRO' }

// Rows for Needs you: money you declared that's due, late or different, and
// credits nobody declared. Your balance moves only when you add the money.
export default function IncomeChecks({ plans, txns, today, fx }: { plans: IncomePlan[]; txns: any[]; today: string; fx: number }) {
  const router = useRouter()
  const supabase = createClient()
  const [done, setDone] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [amount, setAmount] = useState('')
  const checks = planChecks(plans, today, txns).filter(c => !done.has(c.id))
  const credits = unknownCredits(plans, txns, today, fx).filter(t => !done.has(t.id))

  const run = async (key: string, fn: () => PromiseLike<any>, note?: string) => {
    setBusy(key)
    const r = await fn()
    setBusy(null)
    const err = typeof r === 'string' ? r : r?.error?.message
    if (err) { toast(err, 'error'); return }
    setDone(s => new Set(s).add(key)); setEditing(null)
    if (note) toast(note)
    router.refresh()
  }
  const settle = (c: PlanCheck, patch: any = {}) => supabase.from('income_plans').update({ last_done_month: c.month, snoozed_until: null, ...patch }).eq('id', c.plan.id)
  async function add(c: PlanCheck, value: number) {
    if (!(value > 0)) { toast('Enter the amount.', 'error'); return }
    const { data: { user } } = await supabase.auth.getUser()
    await run(c.id, async () => user ? addFromPlan(supabase, user.id, c.plan, { ym: c.month, amount: value, date: c.date > today ? today : c.date }) : 'Please sign in again.', `${c.plan.name} added · ${fmtMoney(value, c.plan.currency)}`)
  }
  const label = (t: any, patch: any, note: string) => run(t.id, () => supabase.from('transactions').update({ reviewed_at: new Date().toISOString(), ...patch }).eq('id', t.id), note)
  const btn = 'wl-btn disabled:opacity-60', st = { height: 30, fontSize: 12 }

  return (<>
    {checks.map(c => {
      const p = c.plan, money = (n: number) => fmtMoney(n, p.currency), b = busy === c.id
      return (
        <li key={c.id} className="flex gap-2.5 items-center py-[9px] flex-wrap md:flex-nowrap wl-hide-viewing" style={{ borderTop: '1px solid #F1F5F9' }}>
          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: c.state === 'due' ? '#2FB67C' : '#D97706' }} />
          <span className="flex-1 min-w-0 max-md:basis-[calc(100%-18px)]">
            {c.state === 'different' ? (<>
              <span className="block text-[13px] font-semibold" style={{ color: 'var(--text)' }}>{p.name} was {money(Number(c.actual.amount))}, you expected {money(Number(p.amount))}</span>
              <span className="block text-[12px] mt-px" style={{ color: 'var(--text3)' }}>{fmtDay(c.actual.txn_date)} · more than {Number(p.variance_pct)}% different. Is this the new usual amount?</span>
            </>) : (<>
              <span className="block text-[13px] font-semibold" style={{ color: 'var(--text)' }}>{p.name} · {money(Number(p.amount))} {NOUN[p.kind]}</span>
              <span className="block text-[12px] mt-px" style={{ color: 'var(--text3)' }}>{c.state === 'late' ? `Expected ${fmtDay(c.date)}, nothing recorded yet` : `Expected ${c.date === today ? 'today' : fmtDay(c.date)}`} · your balance moves when you add it</span>
            </>)}
            {editing === c.id && (
              <span className="flex items-center gap-1.5 mt-1.5">
                <input inputMode="decimal" autoFocus value={amount} onChange={e => setAmount(e.target.value.replace(/[^0-9.]/g, ''))} aria-label={`Amount for ${p.name}`} className="wl-input" style={{ height: 32, fontSize: 13, width: 130 }} />
                <button onClick={() => add(c, Number(amount))} disabled={b} className="wl-btn wl-btn-primary" style={st}>Add</button>
              </span>
            )}
          </span>
          <span className="flex gap-1.5 flex-wrap max-md:w-full max-md:pl-[18px] md:flex-shrink-0 md:justify-end">
            {c.state === 'different' ? (<>
              <button onClick={() => run(c.id, () => settle(c, { amount: Number(c.actual.amount) }), `Usual amount is now ${money(Number(c.actual.amount))}`)} disabled={b} className={`${btn} wl-btn-primary`} style={st}>Update my usual</button>
              <button onClick={() => run(c.id, () => settle(c))} disabled={b} className={btn} style={st}>Just this month</button>
            </>) : (<>
              <button onClick={() => add(c, Number(p.amount))} disabled={b} className={`${btn} wl-btn-primary`} style={st}>Add it</button>
              <button onClick={() => { setEditing(c.id); setAmount(String(p.amount)) }} disabled={b} className={btn} style={st}>Different amount</button>
              <button onClick={() => run(c.id, () => supabase.from('income_plans').update({ snoozed_until: addDaysTo(today, 2) }).eq('id', p.id))} disabled={b} className={btn} style={st}>Not yet</button>
              {c.state === 'late' && <button onClick={() => run(c.id, () => settle(c))} disabled={b} className={btn} style={st}>Skipped this month</button>}
            </>)}
          </span>
        </li>
      )
    })}
    {credits.slice(0, 3).map(t => {
      const b = busy === t.id
      return (
        <li key={t.id} className="flex gap-2.5 items-center py-[9px] flex-wrap md:flex-nowrap wl-hide-viewing" style={{ borderTop: '1px solid #F1F5F9' }}>
          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: '#D97706' }} />
          <span className="flex-1 min-w-0 max-md:basis-[calc(100%-18px)]">
            <span className="block text-[13px] font-semibold" style={{ color: 'var(--text)' }}>What is this {fmtMoney(Number(t.amount), t.currency)}?</span>
            <span className="block text-[12px] mt-px truncate" style={{ color: 'var(--text3)' }}>{t.merchant || 'Credit'} · {fmtDay(t.txn_date)} · not part of your expected income</span>
          </span>
          <span className="flex gap-1.5 flex-wrap max-md:w-full max-md:pl-[18px] md:flex-shrink-0 md:justify-end">
            <button onClick={() => label(t, { category: 'One-off income' }, 'Marked as one-off income')} disabled={b} className={btn} style={st}>One-off income</button>
            <button onClick={() => label(t, { category: 'Self Transfer' }, 'Marked as your own transfer: not income')} disabled={b} className={btn} style={st}>My own transfer</button>
            <button onClick={() => label(t, { category: 'Refund' }, 'Marked as a refund')} disabled={b} className={btn} style={st}>Refund</button>
            <a href={`/dashboard/settings/income?name=${encodeURIComponent(t.merchant || '')}&amount=${t.amount}&currency=${t.currency}&account=${t.account_id}`} className={btn} style={st}>Add as regular</a>
          </span>
        </li>
      )
    })}
  </>)
}
