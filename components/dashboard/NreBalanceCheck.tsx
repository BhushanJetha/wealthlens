'use client'
import Link from 'next/link'
import { fmtDay } from '@/lib/insights'
import { fmtMoney } from '@/lib/format'

// How each NRE balance adds up, using the same figures as Money and Accounts.
// "Landed in NRE" above covers the months you picked, so it can differ from this.
export default function NreBalanceCheck({ accounts }: { accounts: any[] }) {
  const rows = accounts.filter(a => a._ledger)
  if (!rows.length) return null
  const money = (n: number) => fmtMoney(n, 'INR')
  return (
    <section aria-labelledby="nre-check" className="wl-card px-4 md:px-5 py-3.5 md:py-4">
      <h2 id="nre-check" className="text-[14px] font-semibold" style={{ color: 'var(--text)' }}>How your NRE balance adds up</h2>
      {rows.map(a => {
        const l = a._ledger
        return (
          <div key={a.id} className="mt-2.5">
            {rows.length > 1 && <div className="text-[12.5px] font-semibold mb-1" style={{ color: 'var(--text2)' }}>{a.name}</div>}
            <dl className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {([[l.asOf ? `Saved balance, ${fmtDay(l.asOf)}` : 'Starting balance', money(l.anchor)], ['+ Came in since', money(l.inflow)], ['− Went out since', money(l.outflow)], ['= Balance now', money(l.balance)]] as [string, string][]).map(([k, v], i) => (
                <div key={k} className="rounded-xl px-3 py-2.5" style={{ background: i === 3 ? 'var(--accent-bg)' : '#FAFAFE', border: '1px solid var(--line)' }}>
                  <dt className="text-[11.5px]" style={{ color: 'var(--text3)' }}>{k}</dt>
                  <dd className="text-[14px] font-bold tabular-nums mt-0.5" style={{ color: 'var(--text)' }}>{v}</dd>
                </div>
              ))}
            </dl>
          </div>
        )
      })}
      <p className="text-[12px] mt-2.5 leading-snug" style={{ color: 'var(--text3)' }}>
        Balance now is what Money and Accounts show. “Landed in NRE” above covers the months you picked, while this counts from the saved balance date. Anything dated on or before that date is already inside the saved balance. <Link href="/dashboard/accounts" className="font-semibold underline" style={{ color: 'var(--accent)' }}>Update a balance</Link>
      </p>
    </section>
  )
}
