'use client'
// The entries behind a number: tap a bar, a layer, a slice or a row and this
// opens with exactly those entries, their total and what they're made of. On
// a phone it slides up from the bottom; on a computer it sits at the right.
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { X } from 'lucide-react'
import { catOf, labelOf } from '@/lib/money'
import { fmtMoney } from '@/lib/format'
import { fmtDay } from '@/lib/insights'
import type { Entry } from '@/lib/moneyTrends'

export interface Drill { title: string; sub?: string; entries: Entry[]; href?: string; note?: string; by?: 'category' | 'merchant' }
const SHADES = ['#6A55E8', '#9B8CF2', '#CFC7FA', '#E9E5FD']

export default function EntriesSheet({ drill, cur, accounts = [], onClose }: { drill: Drill | null; cur: string; accounts?: any[]; onClose: () => void }) {
  const [more, setMore] = useState(false)
  useEffect(() => { setMore(false) }, [drill])
  useEffect(() => {
    if (!drill) return
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [drill, onClose])
  if (!drill) return null
  const total = drill.entries.reduce((s, e) => s + e.v, 0)
  const key = (e: Entry) => (drill.by === 'merchant' ? String(e.t.merchant || labelOf(catOf(e.t))).trim() : labelOf(catOf(e.t)))
  const parts: Record<string, number> = {}
  for (const e of drill.entries) parts[key(e)] = (parts[key(e)] ?? 0) + e.v
  const top = Object.entries(parts).sort((a, b) => b[1] - a[1])
  const shown = top.slice(0, 3), rest = top.slice(3).reduce((s, [, v]) => s + v, 0)
  const acc = (id: string | null) => accounts.find(a => a.id === id)?.name ?? null
  const list = more ? drill.entries : drill.entries.slice(0, 12)
  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-stretch md:justify-end" style={{ background: 'rgba(20,23,43,.32)' }} onClick={onClose}>
      <aside role="dialog" aria-modal="true" aria-label={drill.title} onClick={e => e.stopPropagation()}
        className="w-full md:w-[440px] max-h-[86vh] md:max-h-none bg-white rounded-t-[22px] md:rounded-none flex flex-col shadow-2xl">
        <div className="md:hidden w-10 h-1 rounded-full mx-auto mt-2.5" style={{ background: '#D9DCE6' }} />
        <div className="flex justify-between items-start gap-3 px-5 pt-4 pb-3">
          <div className="min-w-0">
            <div className="text-[12.5px]" style={{ color: 'var(--text3)' }}>{drill.title}</div>
            <div className="text-[26px] font-extrabold tabular-nums" style={{ color: 'var(--text)' }}>{fmtMoney(total, cur)}</div>
            <div className="text-[12.5px]" style={{ color: 'var(--text3)' }}>{drill.entries.length} entr{drill.entries.length === 1 ? 'y' : 'ies'}{drill.sub ? ` · ${drill.sub}` : ''}</div>
          </div>
          <button onClick={onClose} aria-label="Close" className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: '#F1F2F6', color: 'var(--text2)' }}><X size={16} /></button>
        </div>
        {top.length > 1 && (
          <div className="px-5 pb-3">
            <div className="flex gap-[2px] h-2.5 rounded-full overflow-hidden">
              {shown.map(([k, v], i) => <span key={k} style={{ width: `${v / total * 100}%`, background: SHADES[i] }} />)}
              {rest > 0 && <span style={{ width: `${rest / total * 100}%`, background: SHADES[3] }} />}
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5 text-[12px]" style={{ color: 'var(--text3)' }}>
              {shown.map(([k, v], i) => <span key={k} className="inline-flex items-center gap-1"><i className="w-2 h-2 rounded-[2px]" style={{ background: SHADES[i] }} />{k} {fmtMoney(v, cur)}</span>)}
              {rest > 0 && <span>Others {fmtMoney(rest, cur)}</span>}
            </div>
          </div>
        )}
        <ul className="flex-1 overflow-y-auto px-5" style={{ borderTop: '1px solid var(--line)' }}>
          {list.map(e => (
            <li key={String(e.t.id)} className="grid grid-cols-[40px_minmax(0,1fr)_auto] gap-3 items-center min-h-[52px] text-[13px]" style={{ borderBottom: '1px solid #F0F1F5' }}>
              <span className="text-center leading-tight"><b className="block text-[15px] tabular-nums" style={{ color: 'var(--text)' }}>{Number(String(e.t._paidOn ?? e.t.txn_date).slice(8, 10))}</b><span className="text-[10.5px] uppercase" style={{ color: 'var(--text3)' }}>{fmtDay(String(e.t._paidOn ?? e.t.txn_date)).split(' ')[1]}</span></span>
              <span className="min-w-0"><span className="block font-semibold truncate" style={{ color: 'var(--text)' }}>{e.t.merchant || labelOf(catOf(e.t))}</span>
                <span className="block text-[11.5px] truncate" style={{ color: 'var(--text3)' }}>{labelOf(catOf(e.t))}{acc(e.t.account_id) ? ` · ${acc(e.t.account_id)}` : ''}{e.t._whole ? ' · your share' : ''}</span></span>
              <b className="tabular-nums whitespace-nowrap" style={{ color: 'var(--text)' }}>{fmtMoney(e.v, cur)}</b>
            </li>
          ))}
          {drill.entries.length > 12 && !more && <li><button onClick={() => setMore(true)} className="w-full py-3 text-[12.5px] font-semibold text-left" style={{ color: 'var(--accent)' }}>Show {drill.entries.length - 12} more</button></li>}
          {drill.entries.length === 0 && <li className="py-8 text-center text-[12.5px]" style={{ color: 'var(--text3)' }}>Nothing recorded here.</li>}
        </ul>
        <div className="px-5 py-3.5 flex flex-col gap-2" style={{ borderTop: '1px solid var(--line)' }}>
          {drill.href && <Link href={drill.href} className="wl-btn wl-btn-primary justify-center" style={{ height: 42 }}>Open in Transactions →</Link>}
          {drill.note && <p className="text-[11.5px]" style={{ color: 'var(--text3)' }}>{drill.note}</p>}
        </div>
      </aside>
    </div>
  )
}
