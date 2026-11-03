'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Wallet } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { fmtMoney } from '@/lib/format'
import { fmtDay } from '@/lib/insights'
import { toast } from '@/components/ui/toaster'
import { Segmented } from '@/components/ui/kit'
import { skipBill } from '@/lib/bigBills'
import { PAY_FIRST_NOTE, payFirstKey, type Fix, type PayFirstMode } from '@/lib/plan'
import type { Cur } from '@/lib/goals'

export function CurSwitch({ cur, onChange }: { cur: Cur; onChange: (c: Cur) => void }) {
  return <div><Segmented label="Currency" value={cur} onChange={onChange} options={[{ value: 'INR', label: 'India (₹)' }, { value: 'AED', label: 'UAE (AED)' }]} /></div>
}

// ── Pay yourself first: the Needs you row on salary day ─────────────────────
type Due = { cur: Cur; salary: any; rows: { goal: any; amount: number }[]; total: number }
async function setAsideAll(due: Due, today: string): Promise<{ error?: string; ids?: string[] }> {
  const sb = createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return { error: 'Please sign in again.' }
  const { data, error } = await sb.from('goal_contributions').insert(due.rows.map(r => ({ user_id: user.id, goal_id: r.goal.id, amount: r.amount, currency: due.cur, contrib_date: today, note: PAY_FIRST_NOTE }))).select('id')
  if (error) return { error: error.message }
  await skipBill(sb, user.id, payFirstKey(today.slice(0, 7), due.cur))       // (the note alone is enough before migration 041)
  return { ids: (data ?? []).map((r: any) => r.id) }
}

export function PayFirstRow({ due, mode, today }: { due: Due; mode: PayFirstMode; today: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [edit, setEdit] = useState(false)
  const [amounts, setAmounts] = useState<Record<string, string>>(() => Object.fromEntries(due.rows.map(r => [r.goal.id, String(r.amount)])))
  const [auto, setAuto] = useState<string[] | null>(null)
  const tried = useRef(false)
  const money = (n: number) => fmtMoney(n, due.cur)
  const picked = () => ({ ...due, rows: due.rows.map(r => ({ ...r, amount: Number(amounts[r.goal.id]) || 0 })).filter(r => r.amount > 0) })

  // "Do it automatically": done once, as soon as it's due, with a way back
  useEffect(() => {
    if (mode !== 'auto' || tried.current) return
    tried.current = true
    let key = ''
    try { key = `wl-payfirst-${today.slice(0, 7)}-${due.cur}`; if (sessionStorage.getItem(key)) return; sessionStorage.setItem(key, '1') } catch {}
    setAsideAll(due, today).then(r => { if (r.ids) setAuto(r.ids); else toast(r.error ?? 'Couldn’t set it aside', 'error') })
  }, [mode, due, today])

  async function go() {
    const d = picked()
    if (!d.rows.length) { toast('Enter at least one amount.', 'error'); return }
    setBusy(true)
    const r = await setAsideAll(d, today)
    setBusy(false)
    if (r.error) { toast(r.error, 'error'); return }
    toast(`${money(d.rows.reduce((s, x) => s + x.amount, 0))} set aside for your goals`)
    router.refresh()
  }
  async function later() {
    setBusy(true)
    const sb = createClient()
    const { data: { user } } = await sb.auth.getUser()
    const err = user ? await skipBill(sb, user.id, payFirstKey(today.slice(0, 7), due.cur)) : 'Please sign in again.'
    setBusy(false)
    if (err) { toast(err, 'error'); return }
    router.refresh()
  }
  async function undo() {
    if (!auto?.length) return
    setBusy(true)
    const sb = createClient()
    const { error } = await sb.from('goal_contributions').delete().in('id', auto)
    setBusy(false)
    if (error) { toast(error.message, 'error'); return }
    toast('Undone: nothing set aside this month'); setAuto([]); router.refresh()
  }
  const st = { height: 30, fontSize: 12 }
  if (auto) return auto.length ? (
    <li className="flex gap-2.5 items-center py-[9px] flex-wrap md:flex-nowrap wl-hide-viewing" style={{ borderTop: '1px solid #F1F5F9' }}>
      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: '#2FB67C' }} />
      <span className="flex-1 min-w-0 max-md:basis-[calc(100%-18px)]">
        <span className="block text-[13px] font-semibold" style={{ color: 'var(--text)' }}>{money(due.total)} set aside for your goals</span>
        <span className="block text-[12px] mt-px" style={{ color: 'var(--text3)' }}>Done for you on salary day, as you asked</span>
      </span>
      <button onClick={undo} disabled={busy} className="wl-btn disabled:opacity-60" style={st}>Undo</button>
    </li>
  ) : null
  return (
    <li className="flex gap-2.5 items-start py-[9px] flex-wrap md:flex-nowrap wl-hide-viewing" style={{ borderTop: '1px solid #F1F5F9' }}>
      <span className="w-2 h-2 rounded-full flex-shrink-0 mt-[6px]" style={{ background: '#6A55E8' }} />
      <span className="flex-1 min-w-0 max-md:basis-[calc(100%-18px)]">
        <span className="block text-[13px] font-semibold" style={{ color: 'var(--text)' }}>Salary landed: set aside {money(due.total)} for {due.rows.length} goal{due.rows.length === 1 ? '' : 's'} first?</span>
        {!edit ? (
          <span className="block text-[12px] mt-px" style={{ color: 'var(--text3)' }}>{due.rows.map(r => `${r.goal.name} ${money(r.amount)}`).join(' · ')}</span>
        ) : (
          <span className="flex flex-col gap-1.5 mt-1.5">
            {due.rows.map(r => (
              <label key={r.goal.id} className="flex items-center justify-between gap-2 text-[12.5px]" style={{ color: 'var(--text2)' }}>
                <span className="truncate">{r.goal.name}</span>
                <input inputMode="decimal" value={amounts[r.goal.id] ?? ''} onChange={e => setAmounts(a => ({ ...a, [r.goal.id]: e.target.value.replace(/[^0-9.]/g, '') }))} className="wl-input" style={{ height: 32, width: 120, fontSize: 13 }} aria-label={`Amount for ${r.goal.name}`} />
              </label>
            ))}
          </span>
        )}
      </span>
      <span className="flex gap-1.5 flex-wrap max-md:w-full max-md:pl-[18px] md:flex-shrink-0 md:justify-end">
        <button onClick={go} disabled={busy} className="wl-btn wl-btn-primary disabled:opacity-60" style={st}>{edit ? 'Set aside' : `Set aside ${money(due.total)}`}</button>
        {!edit && <button onClick={() => setEdit(true)} disabled={busy} className="wl-btn disabled:opacity-60" style={st}>Change amounts</button>}
        <button onClick={later} disabled={busy} className="wl-btn disabled:opacity-60" style={st}>Not this month</button>
      </span>
    </li>
  )
}

// ── Pay yourself first: the setting (on Goals) ───────────────────────────────
const MODES: { value: PayFirstMode; label: string; sub: string }[] = [
  { value: 'ask', label: 'Ask me on salary day', sub: 'One tap in Needs you on Home' },
  { value: 'auto', label: 'Do it automatically', sub: 'Set aside on its own, with an Undo' },
  { value: 'off', label: 'Off', sub: 'I’ll add money to goals myself' },
]
export function PayFirstSettings({ mode }: { mode: PayFirstMode }) {
  const router = useRouter()
  const [value, setValue] = useState(mode)
  const [busy, setBusy] = useState(false)
  async function pick(m: PayFirstMode) {
    setValue(m); setBusy(true)
    const { error } = await createClient().auth.updateUser({ data: { pay_first: m } })
    setBusy(false)
    if (error) { toast(error.message, 'error'); setValue(mode); return }
    toast(m === 'off' ? 'Pay yourself first is off' : m === 'auto' ? 'Goals will be set aside on salary day' : 'You’ll be asked on salary day')
    router.refresh()
  }
  return (
    <section className="wl-card px-4 md:px-5 py-4">
      <h2 className="text-[14px] font-semibold flex items-center gap-1.5" style={{ color: 'var(--text)' }}><Wallet size={15} style={{ color: 'var(--accent)' }} />Pay yourself first</h2>
      <p className="text-[12px] mt-1 leading-snug" style={{ color: 'var(--text3)' }}>On salary day, set aside each goal’s share before spending. Goals filled by a linked SIP or by your bank balance are left out.</p>
      <div className="flex flex-col gap-1.5 mt-2.5" role="radiogroup" aria-label="Pay yourself first">
        {MODES.map(m => (
          <label key={m.value} className="flex items-center gap-2.5 rounded-xl px-3 py-2 cursor-pointer wl-hide-viewing" style={{ border: `1px solid ${value === m.value ? 'var(--accent)' : 'var(--line)'}`, background: value === m.value ? 'var(--accent-bg)' : '#fff' }}>
            <input type="radio" name="pay-first" checked={value === m.value} disabled={busy} onChange={() => pick(m.value)} className="w-4 h-4 accent-[var(--accent)]" />
            <span className="flex flex-col"><span className="text-[13px] font-semibold" style={{ color: 'var(--text)' }}>{m.label}</span><span className="text-[11.5px]" style={{ color: 'var(--text3)' }}>{m.sub}</span></span>
          </label>
        ))}
      </div>
    </section>
  )
}

// ── Fixes when goals need more than you save ────────────────────────────────
export function FixesCard({ fixes, short, cur, compact }: { fixes: Fix[]; short: number; cur: Cur; compact?: boolean }) {
  const router = useRouter()
  const [busy, setBusy] = useState<number | null>(null)
  const money = (n: number) => fmtMoney(n, cur)
  if (!fixes.length) return null
  async function apply(f: Fix, i: number) {
    setBusy(i)
    const sb = createClient()
    let error: { message: string } | null = null
    if (f.kind === 'move') error = (await sb.from('goals').update({ target_date: f.date, updated_at: new Date().toISOString() }).eq('id', f.goal.id)).error
    else if (f.kind === 'lower') error = (await sb.from('goals').update({ target_amount: f.target, updated_at: new Date().toISOString() }).eq('id', f.goal.id)).error
    else for (const c of f.cuts) { error = (await sb.from('budgets').update({ monthly_cap: c.to }).eq('id', c.row.id)).error; if (error) break }
    setBusy(null)
    if (error) { toast(error.message, 'error'); return }
    toast('Done. Your plan is updated'); router.refresh()
  }
  const text = (f: Fix) => f.kind === 'move'
    ? { title: `Move ${f.goal.name} to ${fmtDay(f.date)} ${f.date.slice(0, 4)}`, sub: `Its monthly amount drops to ${money(f.newNeed)}. Every other goal stays on time.` }
    : f.kind === 'lower' ? { title: `Lower ${f.goal.name} to ${money(f.target)}`, sub: `Same date. Its monthly amount drops to ${money(f.newNeed)}.` }
    : { title: `Spend ${money(f.covers)} less a month`, sub: f.cuts.map(c => `${c.category} ${money(c.from)} → ${money(c.to)}`).join(' · ') }
  return (
    <section className={compact ? 'flex flex-col gap-2' : 'wl-card px-4 md:px-5 py-4 flex flex-col gap-2.5'} aria-label="Fixes">
      {!compact && <h2 className="text-[14px] font-semibold" style={{ color: 'var(--text)' }}>Goals need {money(short)} more a month than you save. Pick one fix:</h2>}
      <div className={compact ? 'flex flex-col gap-2' : 'grid md:grid-cols-3 gap-2.5'}>
        {fixes.map((f, i) => {
          const t = text(f), full = f.covers >= short - 0.5
          return (
            <div key={i} className="rounded-xl px-3.5 py-3 flex flex-col gap-1.5" style={{ border: `${i === 0 ? 2 : 1}px solid ${i === 0 ? 'var(--accent)' : 'var(--line)'}`, background: '#fff' }}>
              {i === 0 && <span className="self-start text-[11px] font-semibold rounded-full px-2 py-[2px]" style={{ background: 'var(--accent-bg)', color: 'var(--accent2)' }}>Best fit</span>}
              <span className="text-[13.5px] font-semibold" style={{ color: 'var(--text)' }}>{t.title}</span>
              <span className="text-[12px] leading-snug" style={{ color: 'var(--text3)' }}>{t.sub}</span>
              <span className="text-[12px] font-semibold mt-auto" style={{ color: full ? 'var(--pos-text)' : 'var(--amber-text)' }}>{full ? `Fixes all ${money(short)}` : `Fixes ${money(f.covers)} of ${money(short)}`}</span>
              <button onClick={() => apply(f, i)} disabled={busy !== null} className={`wl-btn wl-hide-viewing disabled:opacity-60 ${i === 0 ? 'wl-btn-primary' : ''}`} style={{ height: 34, fontSize: 12.5 }}>{busy === i ? 'Saving…' : 'Apply'}</button>
            </div>
          )
        })}
      </div>
      {!compact && <p className="text-[11.5px]" style={{ color: 'var(--text4)' }}>Worked out from your own goals and budgets. The emergency fund and must-have goals are changed last. <Link href="/dashboard/goals" className="underline">See Goals</Link></p>}
    </section>
  )
}
