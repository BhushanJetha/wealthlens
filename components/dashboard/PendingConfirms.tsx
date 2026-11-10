'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { fmtMoney } from '@/lib/format'
import { fmtDay } from '@/lib/insights'
import { addOccurrence, claimMonth, type Occurrence } from '@/lib/recurring'
import { recordEmi, claimEmiMonth, type EmiDue } from '@/lib/loanAuto'
import { recordSip, claimSipMonth, type SipDue } from '@/lib/sipAuto'
import { saveSips } from '@/lib/sips'
import { approveAuto, rejectAuto, AUTO_KIND_TEXT } from '@/lib/autoEntries'
import AddTransactionModal from '@/components/forms/AddTransactionModal'

export interface Pending { recurring?: Occurrence[]; emis?: EmiDue[]; sips?: SipDue[]; drafts?: any[] }
export const pendingCount = (p: Pending) => (p.recurring?.length ?? 0) + (p.emis?.length ?? 0) + (p.sips?.length ?? 0) + (p.drafts?.length ?? 0)

// Where each kind of auto entry remembers the account that pays it
const PAY_FROM: Record<string, [string, string]> = { repeat: ['recurring_txns', 'account_id'], emi: ['home_loans', 'pay_from_account_id'], sip: ['mutual_funds', 'sip_account_id'], rd: ['recurring_deposits', 'rd_account_id'] }

type Row = { key: string; title: string; detail: string; yes: string; no: string; run: (add: boolean, uid: string) => Promise<string | null> }

// Auto entries already counted, waiting for your approval (Approve · Edit · Not
// paid), and, before migration 037, payments whose day has come but couldn't
// be confirmed from a statement. Rendered as <li> rows.
export default function PendingConfirms({ pending, accName = () => null }: { pending: Pending; accName?: (id: string | null) => string | null }) {
  const router = useRouter()
  const supabase = createClient()
  const [done, setDone] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState<any | null>(null)
  const [accounts, setAccounts] = useState<any[]>([])
  const drafts = (pending.drafts ?? []).filter(t => !done.has(`d|${t.id}`))
  const needAccount = drafts.some(t => !t.account_id)
  useEffect(() => {
    if (needAccount) supabase.from('accounts').select('id,name,currency,is_active').eq('is_active', true).then(({ data }) => setAccounts(data ?? []))
  }, [needAccount]) // eslint-disable-line react-hooks/exhaustive-deps

  async function decide(t: any, approve: boolean) {
    const key = `d|${t.id}`
    setBusy(key); setError('')
    const err = approve ? await approveAuto(supabase, t) : await rejectAuto(supabase, t)
    setBusy(null)
    if (err) { setError(err); return }
    setDone(s => new Set(s).add(key)); router.refresh()
  }
  // The account for this entry, and for the months after it
  async function setAccount(t: any, id: string) {
    if (!id) return
    setBusy(`d|${t.id}`); setError('')
    const { error } = await supabase.from('transactions').update({ account_id: id }).eq('id', t.id)
    const link = PAY_FROM[t.auto_ref?.kind]
    // A fund's SIPs each have their own account (lib/sips)
    if (!error && t.auto_ref?.kind === 'sip' && t.auto_ref?.sip_id) {
      const { data: f } = await supabase.from('mutual_funds').select('*').eq('id', t.auto_ref.id).maybeSingle()
      if (f && Array.isArray(f.sips)) await saveSips(supabase, f, f.sips.map((s: any) => (s.id === t.auto_ref.sip_id ? { ...s, account_id: id } : s)))
    } else if (!error && link && t.auto_ref?.id) await supabase.from(link[0]).update({ [link[1]]: id }).eq('id', t.auto_ref.id)
    setBusy(null)
    if (error) setError(error.message); else router.refresh()
  }

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
      key: `s|${d.fund.id}|${d.sip.id}|${d.month}`, yes: 'Yes', no: 'Skipped',
      title: `Did your ${d.fund.fund_name} SIP go through? ${fmtMoney(d.amount, d.fund.currency ?? 'INR')}`,
      detail: `Due ${fmtDay(d.date)}${d.nav > 0 ? ` · about ${(d.amount / d.nav).toFixed(2)} units at NAV ${d.nav.toFixed(2)}` : ''}`,
      run: async (add: boolean, uid: string) => add ? recordSip(supabase, uid, d, { moneyRow: true }) : (await claimSipMonth(supabase, d)) ? null : 'Already done',
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
    {drafts.map(t => {
      const key = `d|${t.id}`
      return (
        <li key={key} className="flex gap-2.5 items-center py-[9px] flex-wrap md:flex-nowrap" style={{ borderTop: '1px solid #F1F5F9' }}>
          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: '#6A55E8' }} aria-label="Pending approval" />
          <span className="flex-1 min-w-0 max-md:basis-[calc(100%-18px)]">
            <span className="block text-[13px] font-semibold" style={{ color: 'var(--text)' }}>{t.merchant} · {fmtMoney(Number(t.amount), t.currency)}</span>
            <span className="block text-[12px] mt-px" style={{ color: 'var(--text3)' }}>
              <b style={{ color: 'var(--accent2)' }}>Auto entry · pending approval</b> · {AUTO_KIND_TEXT[t.auto_ref?.kind] ?? 'Repeating'} · {fmtDay(t.txn_date)}{t.account_id && accName(t.account_id) ? ` · ${accName(t.account_id)}` : ''}
            </span>
            {!t.account_id && (
              <select value="" onChange={e => setAccount(t, e.target.value)} disabled={busy === key} aria-label={`Account for ${t.merchant}`} className="wl-input mt-1.5 w-full max-w-[260px]" style={{ height: 32, fontSize: 12.5 }}>
                <option value="">Which account paid?</option>
                {accounts.filter(a => a.currency === t.currency).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            )}
          </span>
          <span className="flex gap-1.5 flex-shrink-0 max-md:pl-[18px]">
            <button onClick={() => decide(t, true)} disabled={busy === key} className="wl-btn wl-btn-primary disabled:opacity-60" style={{ height: 30, fontSize: 12 }}>Approve</button>
            <button onClick={() => setEditing(t)} disabled={busy === key} className="wl-btn disabled:opacity-60" style={{ height: 30, fontSize: 12 }}>Edit</button>
            <button onClick={() => decide(t, false)} disabled={busy === key} className="wl-btn disabled:opacity-60" style={{ height: 30, fontSize: 12 }}>Not paid</button>
          </span>
        </li>
      )
    })}
    {editing && <AddTransactionModal edit={{ txn: editing }} onClose={() => setEditing(null)} />}
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
