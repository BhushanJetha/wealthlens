'use client'
import { CreditCard, Landmark, Banknote, CircleHelp } from 'lucide-react'
import { PAY_METHODS, methodOf, channelOf, CHANNELS, type PayMethod } from '@/lib/ledger'

const ICON: Record<PayMethod, typeof CreditCard> = { card: CreditCard, bank: Landmark, cash: Banknote, unlinked: CircleHelp }

// How spending was paid: credit card vs bank (UPI, transfers, debit card…)
// vs cash, from the account each expense is tagged to (lib/ledger).
export default function PaidBy({ rows, accounts, amountOf, fmt, title = 'How you paid', className = '' }: {
  rows: any[]; accounts: any[]; amountOf: (t: any) => number; fmt: (n: number) => string; title?: string; className?: string
}) {
  const accById = new Map(accounts.map((a: any) => [a.id, a]))
  const by: Record<PayMethod, number> = { card: 0, bank: 0, cash: 0, unlinked: 0 }
  const ch: Record<string, number> = {}
  for (const t of rows) {
    const v = amountOf(t), m = methodOf(t, accById)
    by[m] += v
    if (m === 'bank') { const c = channelOf(t); ch[c] = (ch[c] ?? 0) + v }
  }
  const total = Object.values(by).reduce((a, v) => a + v, 0)
  const list = PAY_METHODS.filter(m => by[m.key] > 0)
  const channels = Object.entries(ch).sort((a, b) => b[1] - a[1])

  return (
    <section className={`wl-card px-4 md:px-5 py-4 md:py-[18px] flex flex-col gap-3 ${className}`}>
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-[14px] md:text-[15px] font-semibold" style={{ color: 'var(--text)' }}>{title}</h2>
        <span className="text-[11.5px]" style={{ color: 'var(--text4)' }}>of {fmt(total)} spent</span>
      </div>
      {total === 0 ? <div className="text-[12.5px] py-3" style={{ color: 'var(--text3)' }}>No spending in this period.</div> : (<>
        <div className="flex h-3 rounded-full overflow-hidden gap-[2px]" role="img" aria-label={list.map(m => `${m.label} ${fmt(by[m.key])}`).join(', ')}>
          {list.map(m => <div key={m.key} style={{ width: `${by[m.key] / total * 100}%`, background: m.color }} />)}
        </div>
        <div className="flex flex-col">
          {list.map((m, i) => {
            const I = ICON[m.key]
            return (
              <div key={m.key} style={{ borderTop: i ? '1px solid var(--track)' : 'none' }}>
                <div className="flex items-center gap-2.5 py-2">
                  <span className="w-7 h-7 rounded-[9px] flex items-center justify-center flex-shrink-0" style={{ background: m.color + '1A', color: m.color }}><I size={14} /></span>
                  <span className="flex-1 text-[13px]" style={{ color: 'var(--text2)' }}>{m.label}</span>
                  <span className="text-[13px] font-semibold tabular-nums" style={{ color: 'var(--text)' }}>{fmt(by[m.key])}</span>
                  <span className="w-10 text-right text-[11.5px] tabular-nums" style={{ color: 'var(--text4)' }}>{Math.round(by[m.key] / total * 100)}%</span>
                </div>
                {m.key === 'bank' && channels.some(([c]) => c !== 'other') && (
                  <div className="flex flex-wrap gap-1.5 pl-[38px] pb-2">
                    {channels.map(([c, v]) => (
                      <span key={c} className="rounded-full px-2 py-0.5 text-[11px] font-medium tabular-nums" style={{ background: '#E7F1FE', color: '#1D5FA8' }}>{CHANNELS[c] ?? c} {fmt(v)}</span>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
        {by.unlinked > 0 && <div className="text-[11.5px] leading-snug" style={{ color: 'var(--text4)' }}>Tag “Paid from” on these expenses to see whether they were card, bank or cash.</div>}
      </>)}
    </section>
  )
}
