'use client'
import { useState } from 'react'
import { X, Loader2, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { EVENT_KINDS, eventKind, type EventKind } from '@/lib/events'
import { Segmented } from '@/components/ui/kit'

// New or edit trip / event: what kind, its dates and place, its own budget
// (kept apart from monthly budgets) and, optionally, the goal you saved in.
export default function EventSheet({ event, goals = [], defaults, onClose, onSaved }: {
  event?: any; goals?: any[]; defaults?: Partial<{ kind: EventKind; name: string; start_date: string; end_date: string; currency: string; budget: number; goal_id: string }>
  onClose: () => void; onSaved: (id: string | null) => void
}) {
  const today = new Date().toISOString().slice(0, 10)
  const start = event ?? defaults ?? {}
  const [kind, setKind] = useState<EventKind>((start.kind as EventKind) ?? 'trip')
  const [name, setName] = useState<string>(start.name ?? '')
  const [from, setFrom] = useState<string>(start.start_date ?? today)
  const [to, setTo] = useState<string>(start.end_date ?? start.start_date ?? today)
  const [place, setPlace] = useState<string>(event?.place ?? '')
  const [budget, setBudget] = useState<string>(start.budget != null ? String(start.budget) : '')
  const [cur, setCur] = useState<string>(start.currency ?? 'INR')
  const [goalId, setGoalId] = useState<string>(start.goal_id ?? '')
  const [notes, setNotes] = useState<string>(event?.notes ?? '')
  const [busy, setBusy] = useState(false)
  const [confirmDel, setConfirmDel] = useState(false)
  const [error, setError] = useState('')
  const info = eventKind(kind)
  const myGoals = goals.filter(g => g.currency === cur)

  async function save() {
    if (!name.trim()) { setError('Give it a name — e.g. “Goa, Dec 2026” or “Aarav’s 5th birthday”.'); return }
    if (!from || !to || to < from) { setError('Check the dates — the end can’t be before the start.'); return }
    setBusy(true); setError('')
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const row = { kind, name: name.trim(), start_date: from, end_date: to, place: place.trim() || null, budget: Number(budget) > 0 ? Number(budget) : null,
      currency: cur, goal_id: goalId || null, notes: notes.trim() || null }
    const res = event ? await supabase.from('spend_events').update(row).eq('id', event.id).select('id').single()
      : await supabase.from('spend_events').insert({ ...row, user_id: user!.id }).select('id').single()
    setBusy(false)
    if (res.error) { setError(/spend_events/.test(res.error.message) ? 'Run migration 034 in Supabase to track trips and events.' : res.error.message); return }
    onSaved(res.data?.id ?? null)
  }
  async function remove() {
    setBusy(true)
    const { error } = await createClient().from('spend_events').delete().eq('id', event.id)
    setBusy(false)
    if (error) { setError(error.message); return }
    onSaved(null)
  }

  const Label = ({ children }: { children: React.ReactNode }) => <div className="text-[11px] font-semibold uppercase tracking-[0.05em] mb-1.5" style={{ color: 'var(--text3)' }}>{children}</div>
  const field = 'wl-input w-full'
  return (
    <div className="fixed inset-0 wl-sheet z-50 flex items-center justify-center p-4" style={{ background: 'rgba(15,23,42,0.45)' }} onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={event ? 'Edit trip or event' : 'New trip or event'} className="wl-sheet-panel w-full max-w-[520px] rounded-2xl overflow-y-auto"
        style={{ background: 'var(--card)', border: '1px solid var(--line)', boxShadow: '0 24px 60px rgba(15,23,42,.25)', maxHeight: '90vh' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-2">
          <div className="flex items-center gap-2.5">
            <span className="w-10 h-10 rounded-xl flex items-center justify-center text-[20px]" style={{ background: info.color + '1F' }}>{info.icon}</span>
            <div>
              <div className="text-[16px] font-bold" style={{ color: 'var(--text)' }}>{event ? 'Edit' : 'New'} {info.label.toLowerCase()}</div>
              <div className="text-[12px]" style={{ color: 'var(--text3)' }}>{info.hint}</div>
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" className="p-2 -mr-2 rounded-xl hover:bg-gray-100" style={{ color: 'var(--text3)' }}><X size={16} /></button>
        </div>
        <div className="px-5 pb-5 flex flex-col gap-3.5">
          <div className="flex flex-wrap gap-1.5">
            {EVENT_KINDS.map(k => (
              <button key={k.key} onClick={() => { setKind(k.key); if (k.key !== 'trip' && from === to) setTo(from) }} aria-pressed={kind === k.key} className="wl-chip" style={{ height: 30 }}>
                <span className="text-[13px]">{k.icon}</span>{k.label}
              </button>
            ))}
          </div>
          <div>
            <Label>Name</Label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder={kind === 'trip' ? 'e.g. Goa, Dec 2026' : kind === 'function' ? 'e.g. Housewarming' : kind === 'festival' ? 'e.g. Diwali 2026' : 'e.g. Kitchen renovation'} className={field} style={{ height: 42 }} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>From</Label><input type="date" value={from} onChange={e => { setFrom(e.target.value); if (to < e.target.value) setTo(e.target.value) }} className={field} style={{ height: 42 }} aria-label="Start date" /></div>
            <div><Label>To</Label><input type="date" value={to} min={from} onChange={e => setTo(e.target.value)} className={field} style={{ height: 42 }} aria-label="End date" /></div>
          </div>
          <div className="grid grid-cols-[1fr_auto] gap-3 items-end">
            <div>
              <Label>Its own budget (optional)</Label>
              <div className="flex items-center rounded-xl px-3" style={{ background: '#F7F8FA', border: '1px solid #E2E8F0', height: 44 }}>
                <span className="text-[13px] font-semibold mr-2" style={{ color: 'var(--text3)' }}>{cur === 'AED' ? 'AED' : '₹'}</span>
                <input value={budget} onChange={e => setBudget(e.target.value.replace(/[^0-9.]/g, ''))} inputMode="decimal" placeholder="0" aria-label="Budget" className="flex-1 bg-transparent outline-none text-[16px] font-bold tabular-nums" style={{ color: 'var(--text)' }} />
              </div>
            </div>
            <Segmented label="Currency" value={cur} onChange={(c: string) => { setCur(c); setGoalId('') }} options={[{ value: 'INR', label: '₹' }, { value: 'AED', label: 'AED' }]} />
          </div>
          <p className="text-[11.5px] -mt-2" style={{ color: 'var(--text4)' }}>Kept apart from your monthly budgets. Spending in dirhams and rupees both count, at today’s rate.</p>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Place (optional)</Label><input value={place} onChange={e => setPlace(e.target.value)} placeholder={kind === 'trip' ? 'Goa' : 'Home'} className={field} style={{ height: 42 }} /></div>
            <div>
              <Label>Saved for it in</Label>
              <select value={goalId} onChange={e => setGoalId(e.target.value)} className={field} style={{ height: 42 }} aria-label="Goal it was saved in">
                <option value="">No goal</option>
                {myGoals.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </div>
          </div>
          <div><Label>Note (optional)</Label><input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Who’s going, what it’s for" className={field} style={{ height: 42 }} /></div>
          {error && <div className="rounded-lg px-3 py-2.5 text-[12.5px]" style={{ background: '#FDECE8', color: '#B4231A' }} role="alert">{error}</div>}
          {confirmDel ? (
            <div className="rounded-xl p-3 flex items-center justify-between gap-3" style={{ border: '1.5px solid var(--rose)', background: 'var(--rose-bg)' }}>
              <span className="text-[12.5px] font-medium" style={{ color: 'var(--rose)' }}>Delete “{event.name}”? Its expenses stay — they’re just untagged.</span>
              <div className="flex gap-2 flex-shrink-0">
                <button onClick={() => setConfirmDel(false)} className="wl-btn" style={{ height: 30, fontSize: 12 }}>Cancel</button>
                <button onClick={remove} disabled={busy} className="wl-btn" style={{ height: 30, fontSize: 12, background: 'var(--rose)', color: '#fff' }}>Delete</button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2.5">
              {event && <button onClick={() => setConfirmDel(true)} aria-label="Delete" className="wl-btn" style={{ height: 44, padding: '0 14px', color: 'var(--rose)' }}><Trash2 size={15} /></button>}
              <button onClick={onClose} className="wl-btn" style={{ height: 44, padding: '0 18px' }}>Cancel</button>
              <button onClick={save} disabled={busy} className="wl-btn wl-btn-primary flex-1 disabled:opacity-60" style={{ height: 44, fontSize: 14 }}>
                {busy ? <><Loader2 size={15} className="animate-spin" />Saving…</> : event ? 'Save changes' : 'Create'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
