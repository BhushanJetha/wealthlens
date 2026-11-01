'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { X, Pencil, Trash2, ChevronDown, Loader2, Users } from 'lucide-react'
import AddTransactionModal from '@/components/forms/AddTransactionModal'
import SplitSheet from '@/components/dashboard/SplitSheet'
import { createClient } from '@/lib/supabase/client'
import { useCategoryStore } from '@/store/categoryStore'
import { MOVEMENT_CATS, CC_BILL, labelOf } from '@/lib/money'
import { toast } from '@/components/ui/toaster'

// Popup behind an amount in a report: the transactions that make it up. Each
// can be moved to another category in a tap, edited or deleted right here —
// the report behind it updates.
export default function TxnDrillModal({
  title, subtitle, items, amt, money, onClose,
}: {
  title: string
  subtitle?: string
  items: any[]
  amt: (t: any) => number
  money: (n: number) => string
  onClose: () => void
}) {
  const router = useRouter()
  const supabase = createClient()
  const { rows: cats, load } = useCategoryStore()
  useEffect(() => { load() }, [load])
  const [rows, setRows] = useState(() => [...items].sort((a, b) => String(b.txn_date).localeCompare(String(a.txn_date))))
  const [moved, setMoved] = useState<Set<string>>(new Set())      // put in another category here: no longer part of this amount
  const [edited, setEdited] = useState<Set<string>>(new Set())    // saved through Edit
  const [busy, setBusy] = useState<string | null>(null)
  const [confirmDel, setConfirmDel] = useState<string | null>(null)
  const [editing, setEditing] = useState<any | null>(null)
  const [splitting, setSplitting] = useState<any | null>(null)
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape' && !editing && !splitting) onClose() }
    window.addEventListener('keydown', esc); return () => window.removeEventListener('keydown', esc)
  }, [editing, splitting, onClose])
  // A split shows here as your share and your friends' share — each acts on the whole transaction
  const whole = (t: any) => t._whole ?? t

  const total = rows.filter(t => !moved.has(t.id)).reduce((s, t) => s + amt(t), 0)
  const colorOf = (c: string) => cats.find(r => r.name === c)?.color ?? '#94A3B8'
  const fmtDay = (d: string) => new Date(`${String(d).slice(0, 10)}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  // Categories a row can move to in a tap: spending ↔ spending, income ↔ income.
  // Anything else (a transfer, a card bill, a different kind) goes through Edit.
  const choices = (t: any) => {
    const kind = t.txn_type === 'income' ? 'income' : t.txn_type === 'expense' ? 'expense' : null
    if (!kind) return null
    const list = cats.filter(c => c.kind === kind && !MOVEMENT_CATS.has(c.name) && c.name !== CC_BILL).map(c => c.name)
    return list.includes(t.category) ? list : [t.category, ...list]
  }
  const refresh = (id: string, patch: any, how: 'moved' | 'edited') => {
    setRows(rs => rs.map(r => r.id === id ? { ...r, ...patch } : r))
    ;(how === 'moved' ? setMoved : setEdited)(m => new Set(m).add(id))
    router.refresh()
  }

  async function recategorise(t: any, category: string) {
    if (category === t.category) return
    setBusy(t.id)
    const res = await fetch('/api/transactions', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: whole(t).id, category }) })
    setBusy(null)
    if (!res.ok) { toast('Couldn’t change the category. Try again.', 'error'); return }
    refresh(t.id, { category }, 'moved')
    toast(`${t.merchant || 'Transaction'} moved to ${labelOf(category)}`)
  }
  async function remove(t: any) {
    setBusy(t.id)
    const res = await fetch(`/api/transactions?id=${whole(t).id}`, { method: 'DELETE' })
    setBusy(null); setConfirmDel(null)
    if (!res.ok) { toast('Couldn’t delete it. Try again.', 'error'); return }
    setRows(rs => rs.filter(r => whole(r).id !== whole(t).id))
    toast('Transaction deleted')
    router.refresh()
  }
  // After a full edit, show the row as it was saved
  async function reload(id: string) {
    const { data } = await supabase.from('transactions').select('*, accounts!account_id(name,bank_name,account_type,last_four)').eq('id', id).single()
    if (data) refresh(id, data, 'edited')
  }

  return (
    <>
      <div className="fixed inset-0 wl-sheet z-50 flex items-center justify-center p-4" style={{ background: 'rgba(15,23,42,.4)' }} onClick={onClose}>
        <div className="wl-sheet-panel w-full max-w-[560px] rounded-2xl bg-white flex flex-col max-h-[84vh]" onClick={e => e.stopPropagation()}
          style={{ boxShadow: '0 20px 60px rgba(15,23,42,.18)' }} role="dialog" aria-label={title}>
          {/* Header: what this amount is, and how much */}
          <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-4 flex-shrink-0" style={{ borderBottom: '1px solid var(--line)' }}>
            <div className="min-w-0">
              <div className="text-[16px] font-bold truncate" style={{ color: 'var(--text)' }}>{title}</div>
              <div className="text-[12.5px] mt-0.5" style={{ color: 'var(--text3)' }}>
                {subtitle ? `${subtitle} · ` : ''}{rows.length} transaction{rows.length === 1 ? '' : 's'}
              </div>
            </div>
            <div className="flex items-start gap-2 flex-shrink-0">
              <div className="text-right">
                <div className="text-[20px] font-bold tabular-nums leading-tight" style={{ color: 'var(--text)' }}>{money(total)}</div>
                {moved.size > 0 && <div className="text-[11px]" style={{ color: 'var(--text3)' }}>{moved.size} moved out</div>}
              </div>
              <button onClick={onClose} aria-label="Close" className="w-8 h-8 -mr-1 rounded-lg flex items-center justify-center hover:bg-[var(--bg2)]" style={{ color: 'var(--text3)' }}><X size={18} /></button>
            </div>
          </div>

          <div className="overflow-y-auto flex-1">
            {rows.length === 0 ? (
              <p className="text-[13px] py-10 text-center" style={{ color: 'var(--text3)' }}>Nothing left here.</p>
            ) : rows.map(t => {
              const opts = choices(t), isBusy = busy === t.id, changed = moved.has(t.id), saved = changed || edited.has(t.id)
              const acc = t.accounts?.name
              if (confirmDel === t.id) return (
                <div key={t.id} className="px-5 py-3 flex items-center gap-3 flex-wrap" style={{ borderBottom: '1px solid #F1F0F7', background: '#FFF5F5' }}>
                  <span className="text-[13px] flex-1 min-w-[180px]" style={{ color: '#7F1D1D' }}>
                    Delete <b>{t.merchant || 'this transaction'}</b> · {money(amt(whole(t)))}{t._whole ? ' (the whole payment)' : ''}? Balances and reports drop it. This can’t be undone.
                  </span>
                  <div className="flex gap-2 ml-auto">
                    <button onClick={() => setConfirmDel(null)} disabled={isBusy} className="wl-btn" style={{ height: 34 }}>Keep</button>
                    <button onClick={() => remove(t)} disabled={isBusy} className="wl-btn" style={{ height: 34, background: '#DC2626', borderColor: '#DC2626', color: '#fff' }}>
                      {isBusy ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}Delete
                    </button>
                  </div>
                </div>
              )
              return (
                <div key={t.id} className="px-5 py-3 flex items-start gap-3 group" style={{ borderBottom: '1px solid #F1F0F7', opacity: isBusy ? 0.6 : 1 }}>
                  <span className="w-2.5 h-2.5 rounded-full mt-[6px] flex-shrink-0" style={{ background: colorOf(t.category) }} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-[14px] font-semibold truncate" style={{ color: 'var(--text)' }} title={t.description || t.merchant}>{t.merchant || labelOf(t.category)}</span>
                      <span className="text-[14px] font-semibold tabular-nums flex-shrink-0" style={{ color: changed ? 'var(--text4)' : 'var(--text)', textDecoration: changed ? 'line-through' : undefined }}>{money(amt(t))}</span>
                    </div>
                    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                      <span className="text-[12px]" style={{ color: 'var(--text3)' }}>{fmtDay(t.txn_date)}{acc ? ` · ${acc}` : ''}</span>
                      {opts ? (
                        // A chip that is a category picker
                        <label className="relative inline-flex items-center gap-1 h-[26px] pl-2.5 pr-2 rounded-full text-[12px] font-medium cursor-pointer"
                          style={{ background: changed ? '#E7F7EF' : 'var(--bg2)', color: changed ? '#1E8F5F' : 'var(--text2)', border: '1px solid var(--line)' }}>
                          {labelOf(t.category)}<ChevronDown size={12} />
                          <select value={t.category} onChange={e => recategorise(t, e.target.value)} disabled={isBusy} aria-label={`Category for ${t.merchant}`}
                            className="absolute inset-0 opacity-0 cursor-pointer w-full">
                            {opts.map(c => <option key={c} value={c}>{labelOf(c)}</option>)}
                          </select>
                        </label>
                      ) : (
                        <span className="inline-flex items-center h-[26px] px-2.5 rounded-full text-[12px]" style={{ background: 'var(--bg2)', color: 'var(--text3)' }}>{labelOf(t.category)}</span>
                      )}
                      {saved && <span className="text-[11px] font-semibold" style={{ color: '#1E8F5F' }}>{changed ? 'moved · saved' : 'saved'}</span>}
                      {t._whole && <span className="text-[11px] font-semibold" style={{ color: 'var(--accent2)' }}>{t._friendShare ? 'friends’ share' : 'your share'} of {money(amt(t._whole))}</span>}
                      {t.paid_by_friend_id && <span className="text-[11px] font-semibold" style={{ color: '#B45309' }}>a friend paid</span>}
                      <span className="ml-auto flex items-center gap-0.5">
                        {whole(t).txn_type === 'expense' && whole(t).account_id && !whole(t).paid_by_friend_id && (
                          <button onClick={() => setSplitting(whole(t))} disabled={isBusy} aria-label={`Split ${t.merchant}`} title="Split with friends"
                            className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[var(--bg2)]" style={{ color: 'var(--text2)' }}><Users size={15} /></button>
                        )}
                        <button onClick={() => setEditing(whole(t))} disabled={isBusy} aria-label={`Edit ${t.merchant}`} title="Edit"
                          className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[var(--bg2)]" style={{ color: 'var(--text2)' }}><Pencil size={15} /></button>
                        <button onClick={() => setConfirmDel(t.id)} disabled={isBusy} aria-label={`Delete ${t.merchant}`} title="Delete"
                          className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[#FEF2F2]" style={{ color: '#DC2626' }}><Trash2 size={15} /></button>
                      </span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          <div className="px-5 py-3 flex-shrink-0 text-[12px]" style={{ borderTop: '1px solid var(--line)', color: 'var(--text3)' }}>
            Tap a category to move it · <Users size={11} className="inline -mt-0.5" /> to split with friends · <Pencil size={11} className="inline -mt-0.5" /> to change anything else. Changes save straight away and update the report.
          </div>
        </div>
      </div>
      {editing && <AddTransactionModal edit={{ txn: editing }} onClose={() => setEditing(null)} onAdded={() => reload(editing.id)} />}
      {splitting && <SplitSheet txn={splitting} onClose={() => setSplitting(null)} onSaved={share => {
        setRows(rs => rs.map(r => whole(r).id === splitting.id ? { ...whole(r), friend_share: share || null } : r).filter((r, i, a) => a.findIndex(x => whole(x).id === whole(r).id) === i))
        setEdited(m => new Set(m).add(splitting.id))
      }} />}
    </>
  )
}
