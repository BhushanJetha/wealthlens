'use client'
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Landmark, Tag, Trash2, X } from 'lucide-react'
import { toast } from '@/components/ui/toaster'
import { useCategoryStore } from '@/store/categoryStore'
import { selectionKinds, type CatKind } from '@/lib/bulk'
import { Sheet } from './BillSheets'

// Picking rows in a list: which are ticked, and ticking all of what's shown
export function useSelection() {
  const [on, setOn] = useState(false)
  const [ids, setIds] = useState<Set<string>>(new Set())
  return {
    on, ids,
    start: () => setOn(true),
    stop: () => { setOn(false); setIds(new Set()) },
    toggle: (id: string) => setIds(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n }),
    setAll: (all: string[]) => setIds(new Set(all)),
    clear: () => setIds(new Set()),
  }
}
export type Selection = ReturnType<typeof useSelection>

// The bar at the bottom while picking: change the category or account of every
// ticked row at once, or delete them
export default function BulkBar({ sel, rows, allIds, accounts }: { sel: Selection; rows: any[]; allIds: string[]; accounts: any[] }) {
  const router = useRouter()
  const { rows: categories } = useCategoryStore()
  const [sheet, setSheet] = useState<'category' | 'account' | null>(null)
  const [busy, setBusy] = useState(false)
  const [category, setCategory] = useState('')
  const [remember, setRemember] = useState(true)
  const [accountId, setAccountId] = useState('')
  const picked = useMemo(() => rows.filter(t => sel.ids.has(t.id)), [rows, sel.ids])
  const kinds = selectionKinds(picked)
  // Income categories for income, spending ones for the rest (the server skips a row that doesn't fit)
  const kind: CatKind = kinds.income > 0 && kinds.spending === 0 ? 'income' : 'expense'
  const cats = categories.filter(c => c.kind === kind).map(c => c.name)
  const accs = accounts.filter(a => kinds.currencies.length === 1 && a.currency === kinds.currencies[0] && a.is_active !== false)
  const n = sel.ids.size

  async function run(payload: Record<string, any>, done: (r: any) => string) {
    setBusy(true)
    const res = await fetch('/api/transactions/bulk', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: Array.from(sel.ids), ...payload }) })
    const r = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) { toast(r.error ?? 'Couldn’t do that. Try again.', 'error'); return }
    toast(done(r)); setSheet(null); sel.stop(); router.refresh()
  }
  const skippedNote = (r: any) => r.skipped ? `, ${r.skipped} left as they were` : ''
  async function remove() {
    if (!confirm(`Delete ${n} transaction${n === 1 ? '' : 's'}? This can’t be undone.`)) return
    await run({ action: 'delete' }, r => `${r.deleted} deleted`)
  }

  if (!sel.on) return null
  return (<>
    <div className="fixed z-40 left-3 right-3 md:left-auto md:right-8 bottom-[84px] md:bottom-6 md:w-[640px] rounded-2xl px-3 py-2.5 flex flex-col md:flex-row md:items-center gap-2 wl-hide-viewing"
      style={{ background: 'var(--sidebar, #17153B)', color: '#fff', boxShadow: '0 12px 40px rgba(15,23,42,.3)' }} role="toolbar" aria-label="Selected transactions">
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <span className="text-[13px] font-semibold px-1 whitespace-nowrap">{n} selected</span>
        <button onClick={() => (n === allIds.length ? sel.clear() : sel.setAll(allIds))} className="text-[12.5px] font-semibold underline px-1 whitespace-nowrap" style={{ color: '#CFC6FF' }}>
          {n === allIds.length ? 'Clear' : `Select all ${allIds.length}`}
        </button>
        <span className="flex-1" />
        <button onClick={sel.stop} aria-label="Stop selecting" className="md:hidden w-8 h-8 rounded-lg flex items-center justify-center" style={{ color: '#CFC6FF' }}><X size={17} /></button>
      </div>
      <div className="grid grid-cols-3 gap-1.5 md:flex md:gap-2">
        <button onClick={() => { setCategory(''); setSheet('category') }} disabled={!n || busy} className="wl-btn disabled:opacity-50" style={{ height: 34, fontSize: 12.5 }}><Tag size={13} />Category</button>
        <button onClick={() => { setAccountId(''); setSheet('account') }} disabled={!n || busy} className="wl-btn disabled:opacity-50" style={{ height: 34, fontSize: 12.5 }}><Landmark size={13} />Account</button>
        <button onClick={remove} disabled={!n || busy} className="wl-btn disabled:opacity-50" style={{ height: 34, fontSize: 12.5, color: '#DC2626' }}><Trash2 size={13} />Delete</button>
      </div>
      <button onClick={sel.stop} aria-label="Stop selecting" className="hidden md:flex w-8 h-8 rounded-lg items-center justify-center" style={{ color: '#CFC6FF' }}><X size={17} /></button>
    </div>

    {sheet === 'category' && (
      <Sheet title={`Category for ${n} transaction${n === 1 ? '' : 's'}`} onClose={() => setSheet(null)}>
        {kinds.income > 0 && kinds.spending > 0 && (
          <p className="text-[12.5px] leading-snug rounded-lg px-3 py-2" style={{ background: 'var(--amber-bg)', color: 'var(--amber-text)' }}>
            You’ve picked spending and income together. A spending category is set on the {kinds.spending} spending row{kinds.spending === 1 ? '' : 's'}; the income stays as it is.
          </p>
        )}
        <label className="block"><span className="block text-[12px] font-semibold mb-1" style={{ color: 'var(--text2)' }}>New category</span>
          <select value={category} onChange={e => setCategory(e.target.value)} autoFocus className="wl-input w-full" style={{ height: 44 }}>
            <option value="">Choose category</option>
            {cats.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        {kind === 'expense' && picked.some(t => t.txn_type === 'transfer') && (
          <p className="text-[12.5px] leading-snug" style={{ color: 'var(--text3)' }}>Transfers you include become this spending, and stop counting as a move between your accounts.</p>
        )}
        <label className="flex items-center gap-2.5 text-[13px] cursor-pointer" style={{ color: 'var(--text2)' }}>
          <input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} className="w-4 h-4 accent-[var(--accent)]" />
          Do the same for new ones from these merchants
        </label>
        <button onClick={() => run({ action: 'category', category, kind, remember }, r => `${r.updated} changed to ${category}${skippedNote(r)}${r.remembered ? ` · new ones from ${r.remembered} merchant${r.remembered === 1 ? '' : 's'} too` : ''}`)}
          disabled={!category || busy} className="wl-btn wl-btn-primary disabled:opacity-60" style={{ height: 44 }}>{busy ? 'Saving…' : `Change ${n}`}</button>
      </Sheet>
    )}
    {sheet === 'account' && (
      <Sheet title={`Account for ${n} transaction${n === 1 ? '' : 's'}`} onClose={() => setSheet(null)}>
        {kinds.currencies.length > 1 ? (
          <p className="text-[13px] leading-snug" style={{ color: 'var(--text2)' }}>You’ve picked AED and ₹ amounts together. An account holds one currency, so pick only one of them.</p>
        ) : (<>
          <label className="block"><span className="block text-[12px] font-semibold mb-1" style={{ color: 'var(--text2)' }}>Move to</span>
            <select value={accountId} onChange={e => setAccountId(e.target.value)} autoFocus className="wl-input w-full" style={{ height: 44 }}>
              <option value="">Choose account</option>
              {accs.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </label>
          <p className="text-[12.5px] leading-snug" style={{ color: 'var(--text3)' }}>Balances follow: each amount leaves its old account and comes off this one instead.</p>
          <button onClick={() => run({ action: 'account', account_id: accountId }, r => `${r.updated} moved to ${accs.find(a => a.id === accountId)?.name ?? 'the account'}${skippedNote(r)}`)}
            disabled={!accountId || busy} className="wl-btn wl-btn-primary disabled:opacity-60" style={{ height: 44 }}>{busy ? 'Saving…' : `Move ${n}`}</button>
        </>)}
      </Sheet>
    )}
  </>)
}
