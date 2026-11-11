'use client'
import { useState } from 'react'
import { Check } from 'lucide-react'
import { fmtMoney } from '@/lib/format'

export interface PickHolding { type: string; id: string; name: string; value: number; currency: string; free?: number }
// What you can keep money for a goal or bill in, by kind, in this order
export const KINDS: { key: string; label: string }[] = [
  { key: 'account', label: 'Bank account' }, { key: 'recurring_deposits', label: 'RD' }, { key: 'fixed_deposits', label: 'FD' },
  { key: 'mutual_funds', label: 'Mutual fund' }, { key: 'stocks', label: 'Shares' }, { key: 'etf_investments', label: 'ETF' },
  { key: 'gold_investments', label: 'Gold' }, { key: 'bond_investments', label: 'Bonds' }, { key: 'ppf_epf_accounts', label: 'PPF / EPF' },
  { key: 'nps_accounts', label: 'NPS' }, { key: 'lic_policies', label: 'LIC' },
]

// Two steps: what kind (bank account, RD, FD, fund, shares…), then which one.
// value: '' (nothing), 'acc:<id>' or 'inv:<type>:<id>'.
export default function HoldingPicker({ accounts, holdings, value, onChange, currency, noneLabel = 'Nothing yet' }: {
  accounts: any[]; holdings: PickHolding[]; value: string; onChange: (v: string) => void; currency: string; noneLabel?: string
}) {
  const kinds = KINDS.filter(k => k.key === 'account' ? accounts.length > 0 : holdings.some(h => h.type === k.key))
  const kindOfValue = value.startsWith('acc:') ? 'account' : value.startsWith('inv:') ? value.split(':')[1] : ''
  const [kind, setKind] = useState(kindOfValue || kinds[0]?.key || '')
  const items = kind === 'account'
    ? accounts.map(a => ({ v: `acc:${a.id}`, name: a.name, sub: [a.bank_name, a.account_type === 'wallet' ? 'cash' : 'savings'].filter(Boolean).join(' · '), value: Number(a.current_balance) || 0, free: undefined as number | undefined }))
    : holdings.filter(h => h.type === kind).map(h => ({ v: `inv:${h.type}:${h.id}`, name: h.name, sub: '', value: h.value, free: h.free }))
  if (!kinds.length) return <p className="text-[12.5px]" style={{ color: 'var(--text3)' }}>No accounts or investments in {currency} yet.</p>
  return (
    <div className="flex flex-col gap-2">
      <div className="text-[11.5px] font-semibold" style={{ color: 'var(--text3)' }}>What do you want to map?</div>
      <div className="flex gap-1.5 flex-wrap" role="group" aria-label="Kind">
        {kinds.map(k => {
          const n = k.key === 'account' ? accounts.length : holdings.filter(h => h.type === k.key).length
          return <button key={k.key} type="button" onClick={() => setKind(k.key)} aria-pressed={kind === k.key} className="wl-chip gap-1.5" style={{ height: 32 }}>{k.label}<span className="text-[10.5px] tabular-nums" style={{ color: kind === k.key ? 'var(--accent)' : 'var(--text4)' }}>{n}</span></button>
        })}
      </div>
      <div className="flex flex-col rounded-xl overflow-hidden max-h-[220px] overflow-y-auto" style={{ border: '1px solid var(--line)' }} role="radiogroup" aria-label="Which one">
        <Choice on={value === ''} onClick={() => onChange('')} name={noneLabel} sub="" right="" />
        {items.map(i => <Choice key={i.v} on={value === i.v} onClick={() => onChange(i.v)} name={i.name} sub={[i.sub, i.free != null && i.free < 100 ? `${i.free}% free` : ''].filter(Boolean).join(' · ')} right={fmtMoney(i.value, currency)} />)}
      </div>
    </div>
  )
}

function Choice({ on, onClick, name, sub, right }: { on: boolean; onClick: () => void; name: string; sub: string; right: string }) {
  return (
    <button type="button" role="radio" aria-checked={on} onClick={onClick} className="flex items-center gap-2.5 px-3 min-h-[44px] text-left" style={{ borderTop: '1px solid var(--track)', background: on ? 'var(--accent-bg)' : '#fff' }}>
      <span className="w-[18px] h-[18px] rounded-full flex items-center justify-center flex-shrink-0" style={{ border: on ? 'none' : '1.5px solid var(--line)', background: on ? 'var(--accent)' : '#fff' }}>{on && <Check size={11} color="#fff" />}</span>
      <span className="min-w-0 flex-1"><span className="block text-[13px] font-medium truncate" style={{ color: on ? 'var(--accent2)' : 'var(--text)' }}>{name}</span>{sub && <span className="block text-[11.5px] truncate" style={{ color: 'var(--text4)' }}>{sub}</span>}</span>
      {right && <span className="text-[12.5px] font-semibold tabular-nums flex-shrink-0" style={{ color: 'var(--text2)' }}>{right}</span>}
    </button>
  )
}
