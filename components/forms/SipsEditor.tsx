'use client'
import { useEffect, useState } from 'react'
import { X, Plus, Trash2, Loader2, Zap, Hand } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { sipsOf, saveSips, hasSipList, newSipId, type Sip } from '@/lib/sips'
import { toast } from '@/components/ui/toaster'

type Row = { id: string; amount: string; day: string; account_id: string; auto: boolean; last_month: string | null; note: string }
const rowOf = (s: Sip): Row => ({ id: s.id === 'legacy' ? newSipId() : s.id, amount: String(s.amount), day: String(s.day), account_id: s.account_id ?? '', auto: !!s.auto, last_month: s.last_month, note: s.note ?? '' })
const blank = (): Row => ({ id: newSipId(), amount: '', day: '5', account_id: '', auto: false, last_month: null, note: '' })
const ordinal = (n: number) => `${n}${['th', 'st', 'nd', 'rd'][(n % 10 > 3 || [11, 12, 13].includes(n % 100)) ? 0 : n % 10]}`

// A fund's SIPs: as many as you run, each with its amount, day, the account it
// leaves from and whether it's recorded by itself or waits for a tap (lib/sips).
export default function SipsEditor({ fund, onClose, onSaved }: { fund: any; onClose: () => void; onSaved: (fund: any) => void }) {
  const [rows, setRows] = useState<Row[]>(() => sipsOf(fund).map(rowOf))
  const [accounts, setAccounts] = useState<any[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const cur = fund.currency ?? 'INR', sym = cur === 'AED' ? 'AED' : '₹'
  const many = hasSipList(fund)

  useEffect(() => {
    createClient().from('accounts').select('id,name,currency,account_type,is_active').eq('is_active', true)
      .then(({ data }: any) => setAccounts((data ?? []).filter((a: any) => a.currency === cur && a.account_type !== 'credit_card')))
  }, [cur])
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', esc); return () => window.removeEventListener('keydown', esc)
  }, [onClose])

  const set = (id: string, p: Partial<Row>) => setRows(rs => rs.map(r => (r.id === id ? { ...r, ...p } : r)))
  const total = rows.reduce((a, r) => a + (Number(r.amount) || 0), 0)

  async function save() {
    setError('')
    const bad = rows.find(r => !(Number(r.amount) > 0))
    if (bad) { setError('Each SIP needs an amount above zero — or remove it.'); return }
    const list: Sip[] = rows.map(r => ({ id: r.id, amount: Number(r.amount), day: Math.min(28, Math.max(1, Number(r.day) || 5)), account_id: r.account_id || null,
      auto: r.auto, last_month: r.last_month, active: true, note: r.note.trim() || null }))
    setBusy(true)
    const next = { ...fund }
    const err = await saveSips(createClient(), next, list)
    setBusy(false)
    if (err) { setError(err); return }
    toast(list.length ? `${list.length} SIP${list.length === 1 ? '' : 's'} saved · ${sym} ${total.toLocaleString('en-IN')} a month` : 'SIP stopped')
    onSaved(next)
  }

  return (
    <div className="fixed inset-0 wl-sheet z-[60] flex items-center justify-center p-4" style={{ background: 'rgba(15,23,42,.4)' }} onClick={onClose}>
      <div className="wl-sheet-panel w-full max-w-[500px] rounded-2xl bg-white flex flex-col max-h-[88vh]" onClick={e => e.stopPropagation()} role="dialog" aria-label="SIPs" style={{ boxShadow: '0 20px 60px rgba(15,23,42,.18)' }}>
        <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-2">
          <div className="min-w-0">
            <div className="text-[17px] font-bold" style={{ color: 'var(--text)' }}>SIPs</div>
            <div className="text-[12.5px] truncate" style={{ color: 'var(--text3)' }}>{fund.fund_name}</div>
          </div>
          <button onClick={onClose} aria-label="Close" className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ color: 'var(--text3)' }}><X size={18} /></button>
        </div>
        <div className="px-5 pb-5 overflow-y-auto flex flex-col gap-3">
          {rows.length === 0 && <p className="text-[12.5px]" style={{ color: 'var(--text3)' }}>No SIP on this fund. Add one to invest a fixed amount each month.</p>}
          {rows.map((r, i) => (
            <div key={r.id} className="rounded-xl p-3 flex flex-col gap-2.5" style={{ border: '1px solid var(--line)', background: '#FAFAFE' }}>
              <div className="flex items-center justify-between">
                <span className="text-[12px] font-bold uppercase tracking-[0.05em]" style={{ color: 'var(--text3)' }}>SIP {i + 1}{r.day ? ` · ${ordinal(Math.min(28, Math.max(1, Number(r.day) || 5)))}` : ''}</span>
                <button onClick={() => setRows(rs => rs.filter(x => x.id !== r.id))} aria-label={`Remove SIP ${i + 1}`} className="inline-flex items-center gap-1 text-[12px] font-semibold h-8 px-2 rounded-lg" style={{ color: '#B4231A' }}><Trash2 size={13} />Stop</button>
              </div>
              <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-2">
                <label className="block"><span className="block text-[11.5px] font-semibold mb-1" style={{ color: 'var(--text2)' }}>Each month ({sym})</span>
                  <input inputMode="decimal" value={r.amount} onChange={e => set(r.id, { amount: e.target.value.replace(/[^0-9.]/g, '') })} className="wl-input w-full" style={{ height: 42, background: '#fff' }} /></label>
                <label className="block"><span className="block text-[11.5px] font-semibold mb-1" style={{ color: 'var(--text2)' }}>On day (1–28)</span>
                  <input inputMode="numeric" value={r.day} onChange={e => set(r.id, { day: e.target.value.replace(/\D/g, '').slice(0, 2) })} className="wl-input w-full" style={{ height: 42, background: '#fff' }} /></label>
              </div>
              <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 items-end">
                <label className="block"><span className="block text-[11.5px] font-semibold mb-1" style={{ color: 'var(--text2)' }}>Paid from</span>
                  <select value={r.account_id} onChange={e => set(r.id, { account_id: e.target.value })} className="wl-input w-full" style={{ height: 42, background: '#fff' }}>
                    <option value="">Not set</option>
                    {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select></label>
                <button onClick={() => set(r.id, { auto: !r.auto })} aria-pressed={r.auto} className="h-[42px] px-3 rounded-[10px] text-[12px] font-semibold inline-flex items-center gap-1"
                  title={r.auto ? 'Recorded on its day, no review — tap to review each one' : 'Waits for your tap each month — tap to record it by itself'}
                  style={r.auto ? { background: '#E7F7EF', color: '#1E7A50' } : { background: 'var(--accent-bg)', color: 'var(--accent2)' }}>
                  {r.auto ? <><Zap size={12} />Auto</> : <><Hand size={12} />Review</>}
                </button>
              </div>
              <input value={r.note} onChange={e => set(r.id, { note: e.target.value.slice(0, 60) })} placeholder="Note (optional), e.g. step-up, for Aarav’s school"
                aria-label={`Note for SIP ${i + 1}`} className="wl-input w-full" style={{ height: 38, fontSize: 13, background: '#fff' }} />
            </div>
          ))}
          <button onClick={() => setRows(rs => [...rs, blank()])} disabled={!many && rows.length >= 1}
            className="wl-btn w-full disabled:opacity-50" style={{ height: 40, fontSize: 13, borderStyle: 'dashed', color: 'var(--accent2)' }}>
            <Plus size={15} />{rows.length ? 'Add another SIP' : 'Add a SIP'}
          </button>
          {!many && rows.length >= 1 && <p className="text-[11.5px] -mt-1.5" style={{ color: 'var(--text3)' }}>More than one SIP on a fund needs migration 047 (supabase/migrations/047_multiple_sips.sql).</p>}
          {rows.length > 1 && <div className="text-[12.5px] flex justify-between" style={{ color: 'var(--text2)' }}><span>Every month, all SIPs</span><b className="tabular-nums">{sym} {total.toLocaleString('en-IN')}</b></div>}
          {error && <div className="rounded-lg px-3 py-2 text-[12.5px] leading-snug" style={{ background: '#FDECE8', color: '#B4231A' }}>{error}</div>}
          <button onClick={save} disabled={busy} className="wl-btn wl-btn-primary justify-center disabled:opacity-60" style={{ height: 44 }}>
            {busy ? <Loader2 size={15} className="animate-spin" /> : null}{busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
