'use client'
import { useEffect, useMemo, useState } from 'react'
import { Plus, Check } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { isMissingTable } from '@/lib/supabase/missingTable'
import { equalShares, percentShares } from '@/lib/friends'
import { Segmented } from '@/components/ui/kit'

export const NEEDS_MIGRATION = 'Splitting with friends needs migration 036 (supabase/migrations/036_friends_and_splits.sql). Run it in Supabase, then try again.'
const r2 = (v: number) => Math.round(v * 100) / 100
export interface SplitValue { shares: Record<string, number>; total: number; error: string | null }

// Your friends, and adding one by name (an existing name is reused)
export function useFriends() {
  const supabase = createClient()
  const [friends, setFriends] = useState<any[] | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    supabase.from('friends').select('id,name').order('name').then(({ data, error }) => {
      if (error) setError(isMissingTable(error) ? NEEDS_MIGRATION : error.message)
      setFriends(data ?? [])
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  async function add(name: string): Promise<{ id?: string; error?: string }> {
    const n = name.trim()
    if (!n) return { error: 'Give your friend a name.' }
    const same = (friends ?? []).find(f => f.name.toLowerCase() === n.toLowerCase())
    if (same) return { id: same.id }
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Please sign in again.' }
    const { data, error } = await supabase.from('friends').insert({ user_id: user.id, name: n }).select('id,name').single()
    if (error || !data) return { error: isMissingTable(error) ? NEEDS_MIGRATION : error?.message ?? 'Couldn’t add the friend.' }
    setFriends(f => [...(f ?? []), data].sort((a, b) => a.name.localeCompare(b.name)))
    return { id: data.id }
  }
  return { friends, error, add }
}

// Saves who owes what for a transaction you paid (none = not split), and its
// friend_share. Returns an error message, or null.
export async function saveSplits(txnId: string, shares: Record<string, number>): Promise<string | null> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return 'Please sign in again.'
  const del = await supabase.from('txn_splits').delete().eq('transaction_id', txnId)
  if (del.error) return isMissingTable(del.error) ? NEEDS_MIGRATION : del.error.message
  const rows = Object.entries(shares).filter(([, v]) => v > 0)
  if (rows.length) {
    const ins = await supabase.from('txn_splits').insert(rows.map(([friend_id, amount]) => ({ user_id: user.id, transaction_id: txnId, friend_id, amount })))
    if (ins.error) return ins.error.message
  }
  const total = r2(rows.reduce((s, [, v]) => s + v, 0))
  const up = await supabase.from('transactions').update({ friend_share: total > 0 ? total : null }).eq('id', txnId)
  if (up.error) return /friend_share/.test(up.error.message) ? NEEDS_MIGRATION : up.error.message
  return null
}

// Who shared it, and how: equally (with or without you) or by amount. Reports
// the friends' shares as they change; `txnId` loads a split already saved.
export default function SplitEditor({ amount, currency, txnId, disabled, onChange, onLoaded }: {
  amount: number; currency: string; txnId?: string; disabled?: boolean
  onChange: (v: SplitValue) => void; onLoaded?: (hadSplits: boolean) => void
}) {
  const supabase = createClient()
  const { friends, error: loadError, add } = useFriends()
  const [picked, setPicked] = useState<string[]>([])
  const [mode, setMode] = useState<'equal' | 'amounts' | 'percent'>('equal')
  const [percents, setPercents] = useState<Record<string, string>>({})
  const [withMe, setWithMe] = useState(true)
  const [amounts, setAmounts] = useState<Record<string, string>>({})
  const [newName, setNewName] = useState('')
  const [addError, setAddError] = useState('')
  const sym = currency === 'AED' ? 'AED ' : '₹'
  const money = (v: number) => `${sym}${v.toLocaleString(currency === 'AED' ? 'en-US' : 'en-IN', { maximumFractionDigits: 2 })}`

  useEffect(() => {
    if (!txnId) { onLoaded?.(false); return }
    supabase.from('txn_splits').select('friend_id,amount').eq('transaction_id', txnId).then(({ data }) => {
      const rows = data ?? []
      if (rows.length) {
        setPicked(rows.map((x: any) => x.friend_id))
        const eq = equalShares(amount, rows.length, true)
        if (!rows.every((x: any) => Math.abs(Number(x.amount) - eq.each[0]) < 0.02)) {
          setMode('amounts'); setAmounts(Object.fromEntries(rows.map((x: any) => [x.friend_id, String(x.amount)])))
        }
      }
      onLoaded?.(rows.length > 0)
    })
  }, [txnId]) // eslint-disable-line react-hooks/exhaustive-deps

  const shares = useMemo(() => {
    if (mode === 'equal') {
      const { each } = equalShares(amount, picked.length, withMe)
      return Object.fromEntries(picked.map((id, i) => [id, each[i]])) as Record<string, number>
    }
    if (mode === 'percent') {
      const each = percentShares(amount, picked.map(id => Number(percents[id]) || 0))
      return Object.fromEntries(picked.map((id, i) => [id, each[i]])) as Record<string, number>
    }
    return Object.fromEntries(picked.map(id => [id, r2(Number(amounts[id]) || 0)])) as Record<string, number>
  }, [mode, picked, amounts, percents, amount, withMe])
  const total = r2(Object.values(shares).reduce((s, v) => s + v, 0))
  const mine = r2(amount - total)
  const over = total > amount + 0.004
  useEffect(() => {
    const error = loadError || (!picked.length ? 'Pick who shared it.' : over ? `The friends’ shares add up to more than ${money(amount)}.`
      : Object.values(shares).some(v => !(v > 0)) ? 'Give each friend an amount above zero, or untick them.' : null)
    onChange({ shares, total, error })
  }, [shares, total, over, loadError]) // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (id: string) => setPicked(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id])
  async function addFriend() {
    const res = await add(newName)
    if (res.error) { setAddError(res.error); return }
    setAddError(''); setNewName('')
    if (res.id) setPicked(p => p.includes(res.id!) ? p : [...p, res.id!])
  }
  const nameOf = (id: string) => friends?.find(f => f.id === id)?.name ?? 'Friend'

  if (loadError) return <div className="text-[12.5px] rounded-[10px] px-3 py-2" style={{ background: '#FDECEC', color: '#B42318' }}>{loadError}</div>
  return (
    <div className="flex flex-col gap-3">
      {friends === null ? <div className="text-[12.5px]" style={{ color: 'var(--text3)' }}>Loading friends…</div> : (
        <div className="flex flex-wrap gap-1.5">
          {friends.map(f => {
            const on = picked.includes(f.id)
            return (
              <button key={f.id} type="button" onClick={() => toggle(f.id)} disabled={disabled} aria-pressed={on}
                className="inline-flex items-center gap-1.5 h-9 px-3 rounded-full text-[13px] font-medium"
                style={{ border: `1.5px solid ${on ? 'var(--accent)' : 'var(--line)'}`, background: on ? 'var(--accent-bg)' : '#fff', color: on ? 'var(--accent2)' : 'var(--text2)' }}>
                {on && <Check size={13} strokeWidth={3} />}{f.name}
              </button>
            )
          })}
          <span className="inline-flex items-center h-9 rounded-full pl-3 pr-1" style={{ border: '1.5px dashed var(--line)' }}>
            <input value={newName} onChange={e => setNewName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addFriend() } }}
              placeholder={friends.length ? 'New friend' : 'Friend’s name'} aria-label="New friend's name" disabled={disabled} className="w-[110px] bg-transparent outline-none text-[13px]" />
            <button type="button" onClick={addFriend} disabled={disabled || !newName.trim()} aria-label="Add friend" className="w-7 h-7 rounded-full flex items-center justify-center" style={{ color: 'var(--accent)' }}><Plus size={15} /></button>
          </span>
        </div>
      )}
      {addError && <div className="text-[12px]" style={{ color: '#B42318' }}>{addError}</div>}

      {picked.length > 0 && (
        <>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <Segmented label="How to split" value={mode} onChange={setMode}
              options={[{ value: 'equal' as const, label: 'Equally' }, { value: 'amounts' as const, label: 'Amount' }, { value: 'percent' as const, label: '%' }]} />
            {mode === 'equal' && (
              <label className="inline-flex items-center gap-2 text-[12.5px] cursor-pointer" style={{ color: 'var(--text2)' }}>
                <input type="checkbox" checked={withMe} onChange={e => setWithMe(e.target.checked)} disabled={disabled} className="accent-[var(--accent)]" />
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
                ) : mode === 'percent' ? (
                  <span className="inline-flex items-center gap-2 flex-shrink-0">
                    <span className="text-[12.5px] tabular-nums" style={{ color: 'var(--text3)' }}>{money(shares[id] ?? 0)}</span>
                    <span className="inline-flex items-center gap-1 h-9 px-2.5 rounded-[10px] w-[78px]" style={{ background: 'var(--bg2)', border: '1px solid var(--line)' }}>
                      <input inputMode="decimal" value={percents[id] ?? ''} onChange={e => setPercents(a => ({ ...a, [id]: e.target.value.replace(/[^0-9.]/g, '') }))}
                        aria-label={`${nameOf(id)}'s percent`} disabled={disabled} className="w-full bg-transparent outline-none text-right text-[14px] font-semibold tabular-nums" />
                      <span className="text-[12px]" style={{ color: 'var(--text3)' }}>%</span>
                    </span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 h-9 px-2.5 rounded-[10px] w-[130px]" style={{ background: 'var(--bg2)', border: '1px solid var(--line)' }}>
                    <span className="text-[12px]" style={{ color: 'var(--text3)' }}>{sym.trim()}</span>
                    <input inputMode="decimal" value={amounts[id] ?? ''} onChange={e => setAmounts(a => ({ ...a, [id]: e.target.value.replace(/[^0-9.]/g, '') }))}
                      aria-label={`${nameOf(id)}'s share`} disabled={disabled} className="w-full bg-transparent outline-none text-right text-[14px] font-semibold tabular-nums" />
                  </span>
                )}
              </div>
            ))}
            <div className="flex items-center justify-between gap-3 px-3.5 py-2.5" style={{ background: over ? '#FDECEC' : '#F5F3FF' }}>
              <span className="text-[13.5px] font-semibold" style={{ color: over ? '#B42318' : 'var(--accent2)' }}>Your share{mode === 'percent' && amount > 0 ? ` · ${Math.round(Math.max(0, mine) / amount * 1000) / 10}%` : ''} · counts as your spending</span>
              <span className="text-[14px] font-bold tabular-nums" style={{ color: over ? '#B42318' : 'var(--accent2)' }}>{money(Math.max(0, mine))}</span>
            </div>
          </div>
          <div className="text-[12px] leading-[1.45]" style={{ color: 'var(--text3)' }}>
            {money(amount)} leaves your account — that doesn’t change. Your friends’ {money(total)} shows as <b>to receive</b> on Friends &amp; splits until they pay you back.
          </div>
        </>
      )}
    </div>
  )
}
