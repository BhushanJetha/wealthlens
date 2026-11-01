'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { X, Loader2, Users } from 'lucide-react'
import SplitEditor, { saveSplits, type SplitValue } from '@/components/dashboard/SplitEditor'
import { toast } from '@/components/ui/toaster'

// Split something you paid with friends: pick who shared it, equally or by
// amount. The full amount stays on your account (that's what left it); only
// your share counts as your spending, and each friend's share is what they owe you.
export default function SplitSheet({ txn, onClose, onSaved }: { txn: any; onClose: () => void; onSaved?: (share: number) => void }) {
  const router = useRouter()
  const amount = Number(txn.amount) || 0
  const sym = txn.currency === 'AED' ? 'AED ' : '₹'
  const money = (v: number) => `${sym}${v.toLocaleString(txn.currency === 'AED' ? 'en-US' : 'en-IN', { maximumFractionDigits: 2 })}`
  const [value, setValue] = useState<SplitValue>({ shares: {}, total: 0, error: 'Pick who shared it.' })
  const [had, setHad] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose() }
    window.addEventListener('keydown', esc); return () => window.removeEventListener('keydown', esc)
  }, [busy, onClose])

  async function save(remove = false) {
    if (!remove && value.error) { setError(value.error); return }
    setBusy(true); setError('')
    const err = await saveSplits(txn.id, remove ? {} : value.shares)
    setBusy(false)
    if (err) { setError(err); return }
    toast(remove ? 'Split removed — it’s all yours again' : `Split saved · your share ${money(amount - value.total)}, friends owe you ${money(value.total)}`)
    router.refresh()
    onSaved?.(remove ? 0 : value.total)
    onClose()
  }

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
          <div className="text-[11px] font-semibold uppercase tracking-[0.05em]" style={{ color: 'var(--text3)' }}>Who shared it?</div>
          <SplitEditor amount={amount} currency={txn.currency} txnId={txn.id} disabled={busy} onChange={setValue} onLoaded={setHad} />
          {error && <div className="text-[12.5px] rounded-[10px] px-3 py-2" style={{ background: '#FDECEC', color: '#B42318' }}>{error}</div>}
        </div>
        <div className="flex gap-2.5 px-5 py-4 mt-1 flex-wrap" style={{ borderTop: '1px solid var(--line)' }}>
          {had && <button onClick={() => save(true)} disabled={busy} className="wl-btn" style={{ height: 44, color: '#DC2626' }}>Remove split</button>}
          <button onClick={onClose} disabled={busy} className="wl-btn" style={{ height: 44, padding: '0 18px' }}>Cancel</button>
          <button onClick={() => save()} disabled={busy || !!value.error} className="wl-btn wl-btn-primary flex-1 justify-center" style={{ height: 44 }}>
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Users size={16} />}{busy ? 'Saving…' : 'Save split'}
          </button>
        </div>
      </div>
    </div>
  )
}
