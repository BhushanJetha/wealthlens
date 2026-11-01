'use client'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { X, Loader2, Plus, Check, Users } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { isMissingTable } from '@/lib/supabase/missingTable'
import { equalShares } from '@/lib/friends'
import { toast } from '@/components/ui/toaster'
import { Segmented } from '@/components/ui/kit'

const NEEDS_MIGRATION = 'Splitting needs migration 036 (supabase/migrations/036_friends_and_splits.sql). Run it in Supabase, then try again.'
const r2 = (v: number) => Math.round(v * 100) / 100

// Split something you paid with friends: pick who shared it, equally or by
// amount. The full amount stays on your account (that's what left it); only
// your share counts as your spending, and each friend's share is what they owe you.
export default function SplitSheet({ txn, onClose, onSaved }: { txn: any; onClose: () => void; onSaved?: (share: number) => void }) {
  const router = useRouter()
  const supabase = createClient()
  const amount = Number(txn.amount) || 0
  const sym = txn.currency === 'AED' ? 'AED ' : '₹'
  const money = (v: number) => `${sym}${v.toLocaleString(txn.currency === 'AED' ? 'en-US' : 'en-IN', { maximumFractionDigits: 2 })}`

  const [friends, setFriends] = useState<any[] | null>(null)
  const [had, setHad] = useState<any[]>([])
  const [picked, setPicked] = useState<string[]>([])
  const [mode, setMode] = useState<'equal' | 'amounts'>('equal')
  const [withMe, setWithMe] = useState(true)
  const [amounts, setAmounts] = useState<Record<string, string>>({})
  const [newName, setNewName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    Promise.all([
      supabase.from('friends').select('id,name').order('name'),
      supabase.from('txn_splits').select('id,friend_id,amount').eq('transaction_id', txn.id),
    ]).then(([f, s]) => {
      if (f.error || s.error) { setError(isMissingTable(f.error ?? s.error) ? NEEDS_MIGRATION : (f.error ?? s.error)!.message); setFriends([]); return }
      setFriends(f.data ?? [])
      const rows = s.data ?? []
      setHad(rows)
      if (rows.length) {
        setPicked(rows.map((x: any) => x.friend_id))
        const eq = equalShares(amount, rows.length, true)
        const isEqual = rows.every((x: any) => Math.abs(Number(x.amount) - eq.each[0]) < 0.02)
        if (!isEqual) { setMode('amounts'); setAmounts(Object.fromEntries(rows.map((x: any) => [x.friend_id, String(x.amount)]))) }
      }
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose() }
    window.addEventListener('keydown', esc); return () => window.removeEventListener('keydown', esc)
  }, [busy, onClose])

  // Each picked friend's share
  const shares = useMemo(() => {
    if (mode === 'equal') {
      const { each } = equalShares(amount, picked.length, withMe)
      return Object.fromEntries(picked.map((id, i) => [id, each[i]]))
    }
    return Object.fromEntries(picked.map(id => [id, r2(Number(amounts[id]) || 0)]))
  }, [mode, picked, amounts, amount, withMe])
  const theirs = r2(Object.values(shares).reduce((s, v) => s + v, 0))
  const mine = r2(amount - theirs)
  const over = theirs > amount + 0.004

  const toggle = (id: string) => setPicked(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id])
  async function addFriend() {
    const name = newName.trim()
    if (!name) return
    const same = (friends ?? []).find(f => f.name.toLowerCase() === name.toLowerCase())
    if (same) { if (!picked.includes(same.id)) toggle(same.id); setNewName(''); return }
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setError('Please sign in again.'); return }
    const { data, error } = await supabase.from('friends').insert({ user_id: user.id, name }).select('id,name').single()
    if (error || !data) { setError(isMissingTable(error) ? NEEDS_MIGRATION : error?.message ?? 'Couldn’t add the friend.'); return }
    setFriends(f => [...(f ?? []), data].sort((a, b) => a.name.localeCompare(b.name)))
    setPicked(p => [...p, data.id]); setNewName('')
  }

  async function save(remove = false) {
    if (!remove && !picked.length) { setError('Pick who shared it.'); return }
    if (!remove && over) { setError(`The friends’ shares add up to more than ${money(amount)}.`); return }
    if (!remove && Object.values(shares).some(v => !(v > 0))) { setError('Give each friend an amount above zero, or untick them.'); return }
    setBusy(true); setError('')
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setBusy(false); setError('Please sign in again.'); return }
    const del = await supabase.from('txn_splits').delete().eq('transaction_id', txn.id)
    if (del.error) { setBusy(false); setError(isMissingTable(del.error) ? NEEDS_MIGRATION : del.error.message); return }
    if (!remove) {
      const ins = await supabase.from('txn_splits').insert(picked.map(id => ({ user_id: user.id, transaction_id: txn.id, friend_id: id, amount: shares[id] })))
      if (ins.error) { setBusy(false); setError(ins.error.message); return }
    }
    const share = remove ? 0 : theirs
    const up = await supabase.from('transactions').update({ friend_share: share > 0 ? share : null }).eq('id', txn.id)
    setBusy(false)
    if (up.error) { setError(isMissingTable(up.error) || /friend_share/.test(up.error.message) ? NEEDS_MIGRATION : up.error.message); return }
    toast(remove ? 'Split removed — it’s all yours again' : `Split saved · your share ${money(mine)}, friends owe you ${money(theirs)}`)
    router.refresh()
    onSaved?.(share)
    onClose()
  }

  const nameOf = (id: string) => friends?.find(f => f.id === id)?.name ?? 'Friend'
  return (
    <div className="fixed inset-0 wl-sheet z-[60] flex items-center justify-center p-4" style={{ background: 'rgba(15,23,42,.4)' }} onClick={() => !busy && onClose()}>
      <div className="wl-sheet-panel w-full max-w-[480px] rounded-2xl bg-white flex flex-col max-h-[88vh]" onClick={e => e.stopPropagation()}
        style={{ boxShadow: '0 20px 60px rgba(15,23,42,.18)' }} role="dialog" aria-label="Split with friends">
        <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-3">
          <div className="min-w-0">
            <div className="text-[17px] font-bold" style={{ color: 'var(--text)' }}>Split with friends</div>
            <div className="text-[12.5px] mt-0.5 truncate" style={{ color: 'var(--text3)' }}>{txn.merchant || txn.category} · {money(amount)} · {String(txn.txn_date).slice(0, 10)}</div>
          </div>
          <button onClick={onClose} disabled={busy} aria-label="Close" className="w-8 h-8 -mr-1 rounded-lg flex items-center justify-center flex-shrink-0 hover:bg-[var(--bg2)]" style={{ color: 'var(--text3)' }}><X size={18} /></button>
        </div>

        <div className="px-5 pb-2 overflow-y-auto flex flex-col gap-3">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.05em] mb-2" style={{ color: 'var(--text3)' }}>Who shared it?</div>
            {friends === null ? <div className="text-[12.5px]" style={{ color: 'var(--text3)' }}>Loading friends…</div> : (
              <div className="flex flex-wrap gap-1.5">
                {friends.map(f => {
                  const on = picked.includes(f.id)
                  return (
                    <button key={f.id} onClick={() => toggle(f.id)} disabled={busy} aria-pressed={on}
                      className="inline-flex items-center gap-1.5 h-9 px-3 rounded-full text-[13px] font-medium"
                      style={{ border: `1.5px solid ${on ? 'var(--accent)' : 'var(--line)'}`, background: on ? 'var(--accent-bg)' : '#fff', color: on ? 'var(--accent2)' : 'var(--text2)' }}>
                      {on && <Check size={13} strokeWidth={3} />}{f.name}
                    </button>
                  )
                })}
                <form onSubmit={e => { e.preventDefault(); addFriend() }} className="inline-flex items-center h-9 rounded-full pl-3 pr-1" style={{ border: '1.5px dashed var(--line)' }}>
                  <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="New friend" aria-label="New friend's name" disabled={busy}
                    className="w-[110px] bg-transparent outline-none text-[13px]" />
                  <button type="submit" disabled={busy || !newName.trim()} aria-label="Add friend" className="w-7 h-7 rounded-full flex items-center justify-center" style={{ color: 'var(--accent)' }}><Plus size={15} /></button>
                </form>
              </div>
            )}
          </div>

          {picked.length > 0 && (
            <>
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <Segmented label="How to split" value={mode} onChange={setMode}
                  options={[{ value: 'equal' as const, label: 'Equally' }, { value: 'amounts' as const, label: 'By amount' }]} />
                {mode === 'equal' && (
                  <label className="inline-flex items-center gap-2 text-[12.5px] cursor-pointer" style={{ color: 'var(--text2)' }}>
                    <input type="checkbox" checked={withMe} onChange={e => setWithMe(e.target.checked)} disabled={busy} className="accent-[var(--accent)]" />
                    Include me
                  </label>
                )}
              </div>
              <div className="rounded-[14px] overflow-hidden" style={{ border: '1px solid var(--line)' }}>
                {picked.map(id => (
                  <div key={id} className="flex items-center justify-between gap-3 px-3.5 py-2.5" style={{ borderBottom: '1px solid #F1F0F7' }}>
                    <span className="text-[13.5px] font-medium truncate" style={{ color: 'var(--text)' }}>{nameOf(id)} <span className="font-normal" style={{ color: 'var(--text3)' }}>owes you</span></span>
                    {mode === 'equal' ? (
                      <span className="text-[13.5px] font-semibold tabular-nums" style={{ color: 'var(--text)' }}>{money(shares[id] ?? 0)}</span>
                    ) : (
                      <span className="inline-flex items-center gap-1 h-9 px-2.5 rounded-[10px] w-[130px]" style={{ background: 'var(--bg2)', border: '1px solid var(--line)' }}>
                        <span className="text-[12px]" style={{ color: 'var(--text3)' }}>{sym.trim()}</span>
                        <input inputMode="decimal" value={amounts[id] ?? ''} onChange={e => setAmounts(a => ({ ...a, [id]: e.target.value.replace(/[^0-9.]/g, '') }))}
                          aria-label={`${nameOf(id)}'s share`} disabled={busy} className="w-full bg-transparent outline-none text-right text-[14px] font-semibold tabular-nums" />
                      </span>
                    )}
                  </div>
                ))}
                <div className="flex items-center justify-between gap-3 px-3.5 py-2.5" style={{ background: over ? '#FDECEC' : '#F5F3FF' }}>
                  <span className="text-[13.5px] font-semibold" style={{ color: over ? '#B42318' : 'var(--accent2)' }}>Your share · counts as your spending</span>
                  <span className="text-[14px] font-bold tabular-nums" style={{ color: over ? '#B42318' : 'var(--accent2)' }}>{money(Math.max(0, mine))}</span>
                </div>
              </div>
              <div className="text-[12px] leading-[1.45]" style={{ color: 'var(--text3)' }}>
                {money(amount)} left your account — that doesn’t change. Your friends’ {money(theirs)} shows as <b>to receive</b> on Friends &amp; splits until they pay you back.
              </div>
            </>
          )}
          {error && <div className="text-[12.5px] rounded-[10px] px-3 py-2" style={{ background: '#FDECEC', color: '#B42318' }}>{error}</div>}
        </div>

        <div className="flex gap-2.5 px-5 py-4 mt-1 flex-wrap" style={{ borderTop: '1px solid var(--line)' }}>
          {had.length > 0 && <button onClick={() => save(true)} disabled={busy} className="wl-btn" style={{ height: 44, color: '#DC2626' }}>Remove split</button>}
          <button onClick={onClose} disabled={busy} className="wl-btn" style={{ height: 44, padding: '0 18px' }}>Cancel</button>
          <button onClick={() => save()} disabled={busy || !picked.length || over || friends === null} className="wl-btn wl-btn-primary flex-1 justify-center" style={{ height: 44 }}>
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Users size={16} />}{busy ? 'Saving…' : 'Save split'}
          </button>
        </div>
      </div>
    </div>
  )
}
