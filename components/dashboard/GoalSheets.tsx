'use client'
import { useState } from 'react'
import { X, Trophy } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { fmtMoney } from '@/lib/format'
import { localToday, fmtDay } from '@/lib/insights'
import { nextDueDate, occasionOf } from '@/lib/occasions'
import { rollRecurring, roundLabel } from '@/lib/recurringGoals'
import { Segmented } from '@/components/ui/kit'

function Sheet({ title, sub, onClose, children }: { title: string; sub?: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 wl-sheet z-50 flex items-center justify-center p-4" style={{ background: 'rgba(15,23,42,0.45)' }} onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={title} className="wl-sheet-panel w-full max-w-[440px] rounded-2xl overflow-y-auto"
        style={{ background: 'var(--card)', border: '1px solid var(--line)', boxShadow: '0 24px 60px rgba(15,23,42,.25)', maxHeight: '88vh' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-2">
          <div>
            <div className="text-[16px] font-bold" style={{ color: 'var(--text)' }}>{title}</div>
            {sub && <div className="text-[12px]" style={{ color: 'var(--text3)' }}>{sub}</div>}
          </div>
          <button onClick={onClose} aria-label="Close" className="p-2 -mr-2 rounded-xl hover:bg-gray-100" style={{ color: 'var(--text3)' }}><X size={16} /></button>
        </div>
        {children}
      </div>
    </div>
  )
}
const migrationHint = (m: string) => /goal_contributions|achieved_at/.test(m) ? 'Run migration 030 in Supabase to add money to goals.' : m

// Add money to a goal (or record taking some out) — for cash you set aside
// that isn't in a linked investment or account
export function AddMoneySheet({ goal, amount: start, onClose, onSaved }: { goal: any; amount?: number; onClose: () => void; onSaved: () => void }) {
  const cur = goal.currency === 'AED' ? 'AED' : 'INR'
  const [dir, setDir] = useState<'in' | 'out'>('in')
  const [amount, setAmount] = useState(start ? String(Math.round(start)) : '')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function save() {
    const v = Number(amount)
    if (!(v > 0)) { setError('Enter an amount.'); return }
    setBusy(true); setError('')
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const { error } = await supabase.from('goal_contributions').insert({ user_id: user!.id, goal_id: goal.id, amount: dir === 'in' ? v : -v, currency: cur, contrib_date: date, note: note.trim() || null })
    setBusy(false)
    if (error) { setError(migrationHint(error.message)); return }
    onSaved()
  }
  return (
    <Sheet title={`${goal.icon ?? '🎯'} ${goal.name}`} sub="Money you've set aside for this goal (outside its linked investments)" onClose={onClose}>
      <div className="px-5 pb-5 flex flex-col gap-3.5">
        <Segmented label="Direction" value={dir} onChange={setDir} full options={[{ value: 'in', label: 'Put money in' }, { value: 'out', label: 'Took money out' }]} />
        <div className="flex items-center rounded-xl px-3" style={{ background: '#F7F8FA', border: '1px solid #E2E8F0', height: 48 }}>
          <span className="text-[15px] font-semibold mr-2" style={{ color: 'var(--text3)' }}>{cur === 'AED' ? 'AED' : '₹'}</span>
          <input value={amount} onChange={e => setAmount(e.target.value.replace(/[^0-9.]/g, ''))} inputMode="decimal" placeholder="0" autoFocus aria-label="Amount"
            className="flex-1 bg-transparent outline-none text-[20px] font-bold tabular-nums" style={{ color: 'var(--text)' }} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <input type="date" value={date} onChange={e => setDate(e.target.value)} className="wl-input w-full" style={{ height: 42 }} aria-label="Date" />
          <input value={note} onChange={e => setNote(e.target.value)} placeholder="Note (optional)" className="wl-input w-full" style={{ height: 42 }} />
        </div>
        <p className="text-[11.5px] leading-snug" style={{ color: 'var(--text4)' }}>This records it — move the money into savings yourself. Money in a linked fund, FD or account counts on its own.</p>
        {error && <div className="rounded-lg px-3 py-2.5 text-[12.5px]" style={{ background: '#FDECE8', color: '#B4231A' }}>{error}</div>}
        <button onClick={save} disabled={busy} className="wl-btn wl-btn-primary w-full disabled:opacity-60" style={{ height: 44, fontSize: 14 }}>{busy ? 'Saving…' : dir === 'in' ? 'Add to goal' : 'Record withdrawal'}</button>
      </div>
    </Sheet>
  )
}

// Done with a goal: mark it achieved, record the money used, and (optionally)
// free its linked investments for other goals
export function AchieveSheet({ goal, value, linkCount, onClose, onSaved }: { goal: any; value: number; linkCount: number; onClose: () => void; onSaved: () => void }) {
  const cur = goal.currency === 'AED' ? 'AED' : 'INR'
  const [used, setUsed] = useState(String(Math.round(value)))
  const [unlink, setUnlink] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function save() {
    setBusy(true); setError('')
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const today = new Date().toISOString().slice(0, 10)
    let { error } = await supabase.from('goals').update({ status: 'achieved', achieved_at: today }).eq('id', goal.id)
    if (error && /achieved_at/.test(error.message)) ({ error } = await supabase.from('goals').update({ status: 'achieved' }).eq('id', goal.id))
    if (error) { setError(error.message); setBusy(false); return }
    const v = Number(used)
    if (v > 0) await supabase.from('goal_contributions').insert({ user_id: user!.id, goal_id: goal.id, amount: -v, currency: cur, contrib_date: today, note: 'Used for the goal' })
    if (unlink && linkCount > 0) await supabase.from('goal_investments').delete().eq('goal_id', goal.id)
    setBusy(false); onSaved()
  }
  return (
    <Sheet title="Goal reached 🎉" sub={`${goal.name} — mark it done and free up the money`} onClose={onClose}>
      <div className="px-5 pb-5 flex flex-col gap-3.5">
        <div className="rounded-xl px-4 py-3 flex items-center gap-3" style={{ background: '#FFF7E6' }}>
          <Trophy size={22} style={{ color: '#D97706' }} />
          <div className="text-[13px]" style={{ color: '#7C4A03' }}>You built <b>{fmtMoney(value, cur)}</b> for this. Well done.</div>
        </div>
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.05em] mb-1.5" style={{ color: 'var(--text3)' }}>Money taken out for it</div>
          <div className="flex items-center rounded-xl px-3" style={{ background: '#F7F8FA', border: '1px solid #E2E8F0', height: 46 }}>
            <span className="text-[14px] font-semibold mr-2" style={{ color: 'var(--text3)' }}>{cur === 'AED' ? 'AED' : '₹'}</span>
            <input value={used} onChange={e => setUsed(e.target.value.replace(/[^0-9.]/g, ''))} inputMode="decimal" aria-label="Money used" className="flex-1 bg-transparent outline-none text-[18px] font-bold tabular-nums" style={{ color: 'var(--text)' }} />
          </div>
        </div>
        {linkCount > 0 && (
          <label className="flex items-start gap-2.5 text-[13px] cursor-pointer" style={{ color: 'var(--text2)' }}>
            <input type="checkbox" checked={unlink} onChange={e => setUnlink(e.target.checked)} className="accent-[var(--accent)] w-4 h-4 mt-0.5" />
            <span>Free its {linkCount} linked investment{linkCount === 1 ? '' : 's'} for other goals</span>
          </label>
        )}
        {error && <div className="rounded-lg px-3 py-2.5 text-[12.5px]" style={{ background: '#FDECE8', color: '#B4231A' }}>{error}</div>}
        <button onClick={save} disabled={busy} className="wl-btn wl-btn-primary w-full disabled:opacity-60" style={{ height: 44, fontSize: 14 }}>{busy ? 'Saving…' : 'Mark as achieved'}</button>
      </div>
    </Sheet>
  )
}

// A recurring goal's date has come: record what was spent from it, and start
// saving for the next date (Diwali's comes from the calendar). What's left
// over stays in the pot for next time.
export function RollSheet({ goal, value, onClose, onSaved }: { goal: any; value: number; onClose: () => void; onSaved: () => void }) {
  const cur = goal.currency === 'AED' ? 'AED' : 'INR'
  const target = Number(goal.target_amount) || 0
  const [spent, setSpent] = useState(String(Math.round(Math.min(value, target) || 0)))
  const [next, setNext] = useState(nextDueDate(goal))
  const [nextTarget, setNextTarget] = useState(String(target))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const used = Math.min(Number(spent) || 0, value), over = Math.max(0, (Number(spent) || 0) - value), left = Math.max(0, value - used)
  const occ = occasionOf(goal.occasion)
  const step = cur === 'AED' ? 100 : 1000
  const raiseTo = Math.ceil((Number(spent) || 0) / step) * step
  async function save() {
    if (!next || next <= String(goal.target_date).slice(0, 10)) { setError('Pick a next date after this one.'); return }
    setBusy(true); setError('')
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const due = String(goal.target_date).slice(0, 10), now = localToday()
    const { error } = await rollRecurring(supabase, user!.id, goal, { spent: used, next, target: Number(nextTarget) || target, label: roundLabel(goal), date: now < due ? now : due })
    setBusy(false)
    if (error) { setError(error.message); return }
    onSaved()
  }
  return (
    <Sheet title={`${goal.icon ?? '🎯'} ${goal.name} — done?`} sub="Record what you spent and start saving for the next one" onClose={onClose}>
      <div className="px-5 pb-5 flex flex-col gap-3.5">
        <div className="rounded-xl px-4 py-3 text-[13px]" style={{ background: 'var(--bg2)', color: 'var(--text2)' }}>
          You'd put aside <b style={{ color: 'var(--text)' }}>{fmtMoney(value, cur)}</b> of {fmtMoney(target, cur)} for {fmtDay(goal.target_date)} {String(goal.target_date).slice(0, 4)}.
        </div>
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.05em] mb-1.5" style={{ color: 'var(--text3)' }}>Spent from it</div>
          <div className="flex items-center rounded-xl px-3" style={{ background: '#F7F8FA', border: '1px solid #E2E8F0', height: 46 }}>
            <span className="text-[14px] font-semibold mr-2" style={{ color: 'var(--text3)' }}>{cur === 'AED' ? 'AED' : '₹'}</span>
            <input value={spent} onChange={e => setSpent(e.target.value.replace(/[^0-9.]/g, ''))} inputMode="decimal" aria-label="Amount spent" autoFocus className="flex-1 bg-transparent outline-none text-[18px] font-bold tabular-nums" style={{ color: 'var(--text)' }} />
          </div>
          <div className="text-[12px] mt-1.5" style={{ color: over > 0 ? 'var(--amber-text)' : 'var(--text3)' }}>
            {over > 0 ? `${fmtMoney(over, cur)} more than you'd put aside — the rest came from your regular money.` : left > 0 ? `${fmtMoney(left, cur)} left over — it stays here for next time.` : 'All of it used.'}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.05em] mb-1.5" style={{ color: 'var(--text3)' }}>Next date</div>
            <input type="date" value={next} onChange={e => setNext(e.target.value)} className="wl-input w-full" style={{ height: 42 }} aria-label="Next date" />
          </div>
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.05em] mb-1.5" style={{ color: 'var(--text3)' }}>Next time's amount</div>
            <input value={nextTarget} onChange={e => setNextTarget(e.target.value.replace(/[^0-9.]/g, ''))} inputMode="decimal" className="wl-input w-full" style={{ height: 42 }} aria-label="Next target" />
          </div>
        </div>
        {occ && occ.next(String(goal.target_date).slice(0, 10)) && <p className="text-[11.5px] -mt-1.5" style={{ color: 'var(--text4)' }}>{occ.name.split(' ')[0]} moves each year — the next date is filled in from the calendar.</p>}
        {raiseTo > target && Number(nextTarget) !== raiseTo && (
          <button onClick={() => setNextTarget(String(raiseTo))} className="wl-chip self-start" style={{ height: 28 }}>Plan {fmtMoney(raiseTo, cur)} next time (what it really cost)</button>
        )}
        {goal.account_id && <p className="text-[11.5px]" style={{ color: 'var(--text4)' }}>Its savings account balance already shows what you spent, so nothing is taken out here.</p>}
        {error && <div className="rounded-lg px-3 py-2.5 text-[12.5px]" style={{ background: '#FDECE8', color: '#B4231A' }}>{error}</div>}
        <button onClick={save} disabled={busy} className="wl-btn wl-btn-primary w-full disabled:opacity-60" style={{ height: 44, fontSize: 14 }}>{busy ? 'Saving…' : `Start saving for ${fmtDay(next)} ${next.slice(0, 4)}`}</button>
      </div>
    </Sheet>
  )
}
