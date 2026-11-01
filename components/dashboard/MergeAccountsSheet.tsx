'use client'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { X, Loader2, Check, Merge } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { fetchAll } from '@/lib/supabase/fetchAll'
import { exactCopies, mergeAccounts } from '@/lib/accountMerge'
import { kindOf } from '@/lib/ledger'
import { toast } from '@/components/ui/toaster'

// Merge an account that's on file twice: pick the one to keep; every
// transaction, rule, repeat and loan link on the other moves onto it.
export default function MergeAccountsSheet({ accounts, onClose }: { accounts: any[]; onClose: () => void }) {
  const router = useRouter()
  const supabase = createClient()
  const [keepId, setKeepId] = useState(accounts[0].id)
  const [txns, setTxns] = useState<any[] | null>(null)
  const [dropCopies, setDropCopies] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetchAll((a, b) => supabase.from('transactions').select('id,account_id,txn_date,amount,txn_type,currency')
      .in('account_id', accounts.map(x => x.id)).order('id').range(a, b))
      .then(({ data, error }) => { if (error) setError(`Couldn’t read the transactions, so nothing was changed: ${error.message}`); else setTxns(data) })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose() }
    window.addEventListener('keydown', esc); return () => window.removeEventListener('keydown', esc)
  }, [busy, onClose])

  const keep = accounts.find(a => a.id === keepId)!
  const others = accounts.filter(a => a.id !== keepId)
  const card = kindOf(keep) === 'card'
  const on = (id: string) => (txns ?? []).filter(t => t.account_id === id)
  const copies = useMemo(() => txns ? others.flatMap(o => exactCopies(on(keepId), on(o.id))) : [], [txns, keepId]) // eslint-disable-line react-hooks/exhaustive-deps
  const moving = others.reduce((s, o) => s + on(o.id).length, 0) - (dropCopies ? copies.length : 0)

  const cur = (a: any) => a.currency === 'AED' ? 'AED ' : '₹'
  const fmtDay = (d: string) => new Date(`${String(d).slice(0, 10)}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  const fmtMon = (d: string) => new Date(`${String(d).slice(0, 10)}T00:00:00`).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })
  const balOf = (a: any) => Number(card ? a.outstanding_bal : a.current_balance ?? a.outstanding_bal) || 0
  const span = (id: string) => {
    const ds = on(id).map(t => String(t.txn_date)).sort()
    return `${fmtMon(ds[0])} – ${fmtMon(ds[ds.length - 1])}`
  }

  async function merge() {
    setBusy(true); setError('')
    for (const o of others) {
      const drop = dropCopies ? exactCopies(on(keepId), on(o.id)) : []
      const err = await mergeAccounts(supabase, keep, o, drop)
      if (err) { setBusy(false); setError(`Couldn’t finish merging: ${err}`); return }
    }
    toast(`Merged into ${keep.name}${dropCopies && copies.length ? ` · ${copies.length} cop${copies.length === 1 ? 'y' : 'ies'} left out` : ''}`)
    router.refresh()
    onClose()
  }

  return (
    <div className="fixed inset-0 wl-sheet z-[60] flex items-center justify-center p-4" style={{ background: 'rgba(15,23,42,.4)' }} onClick={() => !busy && onClose()}>
      <div className="wl-sheet-panel w-full max-w-[480px] rounded-2xl bg-white flex flex-col max-h-[88vh]" onClick={e => e.stopPropagation()}
        style={{ boxShadow: '0 20px 60px rgba(15,23,42,.18)' }} role="dialog" aria-label="Merge accounts">
        <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-3">
          <div className="min-w-0">
            <div className="text-[17px] font-bold" style={{ color: 'var(--text)' }}>Merge into one account</div>
            <div className="text-[12.5px] mt-1 leading-[1.45]" style={{ color: 'var(--text3)' }}>
              <b style={{ color: 'var(--text2)' }}>{accounts[0].name}</b> is on file {accounts.length === 2 ? 'twice' : `${accounts.length} times`}, so its history is split.
              Every transaction moves onto the one you keep and the other is removed — reports, balances and Review then see one account.
            </div>
          </div>
          <button onClick={onClose} disabled={busy} aria-label="Close" className="w-8 h-8 -mr-1 rounded-lg flex items-center justify-center flex-shrink-0 hover:bg-[var(--bg2)]" style={{ color: 'var(--text3)' }}><X size={18} /></button>
        </div>

        <div className="px-5 pb-2 overflow-y-auto flex flex-col gap-2.5">
          <div className="text-[11px] font-semibold uppercase tracking-[0.05em]" style={{ color: 'var(--text3)' }}>Keep which one?</div>
          {accounts.map(a => {
            const sel = a.id === keepId, n = on(a.id).length
            return (
              <button key={a.id} onClick={() => setKeepId(a.id)} disabled={busy} aria-pressed={sel}
                className="text-left rounded-[14px] px-3.5 py-3 flex items-start gap-3 transition-colors"
                style={{ border: `1.5px solid ${sel ? 'var(--accent)' : 'var(--line)'}`, background: sel ? 'var(--accent-bg)' : '#fff' }}>
                <span className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                  style={{ border: `1.5px solid ${sel ? 'var(--accent)' : '#CBD5E1'}`, background: sel ? 'var(--accent)' : '#fff' }}>
                  {sel && <Check size={12} color="#fff" strokeWidth={3} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2 flex-wrap">
                    <span className="text-[14px] font-semibold" style={{ color: 'var(--text)' }}>{a.name}</span>
                    <span className="text-[10.5px] font-semibold px-1.5 py-[1px] rounded-full"
                      style={a.is_active === false ? { background: '#F1F5F9', color: '#64748B' } : { background: '#E7F7EF', color: '#1E8F5F' }}>{a.is_active === false ? 'closed' : 'open'}</span>
                    {a.last_four && <span className="text-[11.5px]" style={{ color: 'var(--text3)' }}>•••• {a.last_four}</span>}
                  </span>
                  <span className="block text-[12px] mt-0.5" style={{ color: 'var(--text3)' }}>
                    {!txns ? (error ? '—' : 'Counting transactions…') : n ? `${n} transaction${n === 1 ? '' : 's'} · ${span(a.id)}` : 'No transactions'}
                  </span>
                  <span className="block text-[12px]" style={{ color: 'var(--text3)' }}>
                    {card ? 'Owed' : 'Balance'} {cur(a)}{Math.round(balOf(a)).toLocaleString('en-IN')}{a.balance_as_of ? ` saved ${fmtDay(a.balance_as_of)}` : ''}
                  </span>
                </span>
              </button>
            )
          })}

          {txns && copies.length > 0 && (
            <label className="flex items-start gap-2.5 rounded-[12px] px-3 py-2.5 cursor-pointer" style={{ background: '#FFF8EC', border: '1px solid #F6DDB4' }}>
              <input type="checkbox" checked={dropCopies} onChange={e => setDropCopies(e.target.checked)} disabled={busy} className="mt-[3px] accent-[var(--accent)]" />
              <span className="text-[12.5px] leading-[1.45]" style={{ color: '#7A4A06' }}>
                Leave out <b>{copies.length} cop{copies.length === 1 ? 'y' : 'ies'}</b> — the same day, amount and kind are already on the one you keep (a statement imported into both).
              </span>
            </label>
          )}
          <div className="text-[12px] leading-[1.45]" style={{ color: 'var(--text3)' }}>
            The kept one’s {card ? 'amount owed' : 'balance'} stays as it is ({cur(keep)}{Math.round(balOf(keep)).toLocaleString('en-IN')}{keep.balance_as_of ? ` on ${fmtDay(keep.balance_as_of)}` : ''}) — older transactions just fill in its history. Change it on {card ? 'Cards' : 'Accounts'} if it’s off.
          </div>
          {error && <div className="text-[12.5px] rounded-[10px] px-3 py-2" style={{ background: '#FDECEC', color: '#B42318' }}>{error}</div>}
        </div>

        <div className="flex gap-2.5 px-5 py-4 mt-1" style={{ borderTop: '1px solid var(--line)' }}>
          <button onClick={onClose} disabled={busy} className="wl-btn" style={{ height: 44, padding: '0 18px' }}>Cancel</button>
          <button onClick={merge} disabled={busy || !txns} className="wl-btn wl-btn-primary flex-1 justify-center" style={{ height: 44 }}>
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Merge size={16} />}
            {busy ? 'Merging…' : txns ? `Merge · move ${moving} transaction${moving === 1 ? '' : 's'}` : error ? 'Merge' : 'Counting…'}
          </button>
        </div>
      </div>
    </div>
  )
}
