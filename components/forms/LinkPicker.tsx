'use client'
import { useEffect, useState } from 'react'
import { Plus, Link2, Loader2, Check } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { loadLinkOptions, canLink, TYPES_FOR, RECORDS, type LinkOption, type LinkRef, type LinkType } from '@/lib/linkTxn'
import { type InvestKind } from '@/lib/categories'
import AddInvestmentModal from './AddInvestmentModal'
import { AddLoanModal } from './AddLoanModal'

export interface LinkChoice { option: LinkOption; units?: number; fresh?: boolean }

// The add-investment form's type for each kind (PPF / EPF has its own page)
const NEW_TYPE: Record<InvestKind, 'mutual_fund' | 'stock' | 'fixed_deposit' | 'recurring_deposit' | 'gold' | 'nps' | 'lic' | 'bond'> = {
  'Mutual funds': 'mutual_fund', Stocks: 'stock', 'Fixed deposit': 'fixed_deposit', 'Recurring deposit': 'recurring_deposit',
  Gold: 'gold', 'PPF & NPS': 'nps', 'Insurance plans': 'lic', 'Other investing': 'bond',
}
const fmt = (n: number) => Math.round(n * 1e4) / 1e4

// "Which one?" for an investment payment (your funds, shares, RDs…) or an
// EMI (your loans): pick it, or add a new one, and the payment is linked to it
// (lib/linkTxn). Optional — no choice saves the payment as it is.
export default function LinkPicker({ kind, currency, amount, value, onChange, linked }: {
  kind: InvestKind | 'loan'; currency: string; amount: number
  value: LinkChoice | null; onChange: (c: LinkChoice | null) => void
  linked?: LinkRef | null           // already linked (editing): shown, not changed here
}) {
  const [opts, setOpts] = useState<LinkOption[] | null>(null)
  const [ready, setReady] = useState(true)
  const [adding, setAdding] = useState(false)
  const types: LinkType[] = kind === 'loan' ? ['loan'] : TYPES_FOR[kind]

  async function load(select?: string) {
    const sb = createClient()
    const { data: { user } } = await sb.auth.getUser()
    if (!user) { setOpts([]); return }
    const [ok, list] = await Promise.all([canLink(sb), loadLinkOptions(sb, user.id, types)])
    setReady(ok); setOpts(list)
    const fresh = select ? list.find(o => o.id === select) : null
    if (fresh) onChange({ option: fresh, fresh: true })
  }
  useEffect(() => { if (!linked) { setOpts(null); load() } }, [kind]) // eslint-disable-line react-hooks/exhaustive-deps

  const what = kind === 'loan' ? 'loan' : kind === 'Mutual funds' ? 'fund' : kind === 'Stocks' ? 'share' : 'one'
  if (linked) return (
    <div className="rounded-xl px-3.5 py-2.5 text-[12.5px] flex items-start gap-2" style={{ background: '#F0FAF4', border: '1px solid #CDEBDC', color: '#1E4D38' }}>
      <Link2 size={14} className="flex-shrink-0 mt-0.5" />
      <span>Linked to <b>{linked.name}</b>{linked.recorded ? ' — recorded there too' : ''}. Delete this payment to take that back.</span>
    </div>
  )
  if (!ready) return (
    <div className="text-[12px] rounded-xl px-3.5 py-2.5" style={{ background: '#FFF7E6', border: '1px solid #F8DDB8', color: '#92560B' }}>
      To link this to your {kind === 'loan' ? 'loan' : 'investment'}, run <b>supabase/migrations/046_txn_links.sql</b> in Supabase.
    </div>
  )

  const mine = (opts ?? []).filter(o => o.currency === currency)
  const list = mine.length ? mine : opts ?? []
  const sel = value?.option
  const unitsOn = !!sel && !value?.fresh && (sel.type === 'mutual_funds' || sel.type === 'stocks' || sel.type === 'etf_investments')
  const units = value?.units ?? (sel && sel.price > 0 ? fmt(amount / sel.price) : 0)

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.05em]" style={{ color: 'var(--text3)' }}>Which {what}? <span className="normal-case tracking-normal font-normal">· optional</span></span>
        <button type="button" onClick={() => setAdding(true)} className="inline-flex items-center gap-1 text-[12px] font-semibold" style={{ color: 'var(--accent2)' }}><Plus size={12} />Add a new one</button>
      </div>
      {opts == null ? (
        <div className="py-2 flex items-center gap-2 text-[12.5px]" style={{ color: 'var(--text3)' }}><Loader2 size={13} className="animate-spin" />Finding your {kind === 'loan' ? 'loans' : 'investments'}…</div>
      ) : list.length === 0 ? (
        <div className="text-[12.5px] rounded-xl px-3.5 py-2.5" style={{ background: '#FAFAFE', border: '1px solid var(--line)', color: 'var(--text3)' }}>
          You don’t have {kind === 'loan' ? 'a loan' : `any ${kind === 'Other investing' ? 'other investments' : kind.toLowerCase()}`} yet. <button type="button" onClick={() => setAdding(true)} className="font-semibold" style={{ color: 'var(--accent2)' }}>Add it</button> and this payment links to it.
        </div>
      ) : (
        <div className="flex flex-col rounded-xl overflow-hidden max-h-[220px] overflow-y-auto" style={{ border: '1px solid var(--line)' }} role="radiogroup" aria-label={`Which ${what}`}>
          {list.map((o, i) => {
            const on = sel?.id === o.id
            return (
              <button key={o.type + o.id} type="button" role="radio" aria-checked={on} onClick={() => onChange(on ? null : { option: o })}
                className="flex items-center gap-2.5 px-3 min-h-[46px] text-left" style={{ borderTop: i ? '1px solid var(--track)' : 'none', background: on ? 'var(--accent-bg)' : '#fff' }}>
                <span className="w-[18px] h-[18px] rounded-full flex items-center justify-center flex-shrink-0" style={{ border: on ? 'none' : '1.5px solid var(--line)', background: on ? 'var(--accent)' : '#fff' }}>{on && <Check size={11} color="#fff" />}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-semibold truncate" style={{ color: on ? 'var(--accent2)' : 'var(--text)' }}>{o.name}</span>
                  {o.sub && <span className="block text-[11.5px] truncate" style={{ color: 'var(--text4)' }}>{o.sub}</span>}
                </span>
                {o.currency !== currency && <span className="text-[10.5px] font-semibold" style={{ color: 'var(--text4)' }}>{o.currency}</span>}
              </button>
            )
          })}
        </div>
      )}
      {sel && (
        <div className="rounded-xl px-3.5 py-2.5 flex flex-col gap-2" style={{ background: '#FAFAFE', border: '1px solid var(--line)' }}>
          {unitsOn && (
            <label className="flex items-center gap-2 text-[12.5px]" style={{ color: 'var(--text2)' }}>
              <span className="flex-shrink-0">{sel.type === 'stocks' ? 'Shares bought' : 'Units bought'}</span>
              <input type="number" inputMode="decimal" min="0" step="any" value={units || ''} onChange={e => onChange({ ...value!, units: Number(e.target.value) || 0 })}
                className="wl-input" style={{ height: 34, fontSize: 13, width: 130, background: '#fff' }} aria-label="Units bought" />
              {sel.price > 0 && <span className="text-[11.5px]" style={{ color: 'var(--text4)' }}>at {sel.price.toLocaleString('en-IN', { maximumFractionDigits: 4 })} (latest)</span>}
            </label>
          )}
          <span className="text-[12px]" style={{ color: 'var(--text3)' }}>
            {value?.fresh ? <>Linked to the new {what} — its amount is already in it.</>
              : RECORDS[sel.type] ? <>Saving links it and {RECORDS[sel.type]}.</>
              : <>Saving links it. Update its balance on its own page.</>}
          </span>
        </div>
      )}
      {adding && kind === 'loan' && <AddLoanModal onClose={() => setAdding(false)} onSaved={id => load(id)} />}
      {adding && kind !== 'loan' && <AddInvestmentModal defaultType={NEW_TYPE[kind]} onClose={() => setAdding(false)} onSaved={id => load(id)} />}
    </div>
  )
}
