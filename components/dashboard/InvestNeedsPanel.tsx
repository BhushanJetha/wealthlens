'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronRight, Zap, Hand } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { fmtMoney } from '@/lib/format'
import { fmtDay, daysBetween, ymOf, addDaysTo } from '@/lib/insights'
import { dateIn } from '@/lib/recurring'
import { holdingValue } from '@/lib/netWorth'
import type { SipDue } from '@/lib/sipAuto'
import PendingConfirms from './PendingConfirms'

const SEV: Record<string, string> = { high: '#DC2626', medium: '#D97706', low: '#6A55E8', good: '#16A34A' }
const ELSS_LOCK_YEARS = 3

// Investments › Needs you: SIPs to confirm and coming up, deposits maturing,
// stale prices, a holding that's too big a share, ELSS units unlocking; plus
// how each SIP is tracked (record automatically, or ask).
export default function InvestNeedsPanel({ funds, stocks, deposits, rds, invTxns, pendingSips, today, total, conv, className = '' }: {
  funds: any[]; stocks: any[]; deposits: any[]; rds: any[]; invTxns: any[]; pendingSips: SipDue[]
  today: string; total: number; conv: (n: number, cur: string) => number; className?: string
}) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')
  const ids = new Set(funds.map(f => f.id))
  const pending = pendingSips.filter(d => ids.has(d.fund.id))
  const sipFunds = funds.filter(f => f.has_sip && Number(f.sip_amount) > 0 && Number(f.sip_date) > 0)
  const ready = funds.length === 0 || 'sip_last_month' in funds[0]
  const month = ymOf(today)

  const needs: { id: string; sev: string; title: string; detail: string; href: string }[] = []
  // SIPs in the next 7 days (not already recorded this month)
  for (const f of sipFunds) {
    let d = dateIn(month, Number(f.sip_date))
    if (d < today || (f.sip_last_month && f.sip_last_month >= month)) d = dateIn(ymOf(addDaysTo(`${month}-28`, 7)), Number(f.sip_date))
    const days = daysBetween(today, d)
    if (days >= 0 && days <= 7) needs.push({ id: `sip-${f.id}`, sev: 'low', href: '/dashboard/investments/mutual-funds',
      title: `${f.fund_name} SIP ${days === 0 ? 'today' : days === 1 ? 'tomorrow' : `on ${fmtDay(d)}`}`, detail: `${fmtMoney(Number(f.sip_amount), f.currency ?? 'INR')} — keep it in the bank account it's paid from` })
  }
  // Deposits maturing in 30 days, or matured in the last 15
  for (const x of [...deposits.map(f => ({ ...f, _k: 'FD', _href: '/dashboard/investments/fixed-deposits' })), ...rds.map(r => ({ ...r, _k: 'RD', _href: '/dashboard/investments/recurring-deposits' }))]) {
    if (!x.maturity_date) continue
    const d = daysBetween(today, String(x.maturity_date).slice(0, 10))
    if (d < -15 || d > 30) continue
    const amt = Number(x.maturity_amt ?? x.maturity_amount) || Number(x.principal ?? x.principal_amount) || 0
    needs.push({ id: `mat-${x._k}-${x.id}`, sev: d <= 0 ? 'medium' : 'low', href: x._href,
      title: d < 0 ? `${x.name} (${x._k}) matured ${-d} day${d === -1 ? '' : 's'} ago` : `${x.name} (${x._k}) matures ${d === 0 ? 'today' : `on ${fmtDay(x.maturity_date)}`}`,
      detail: `${amt ? `${fmtMoney(amt, x.currency ?? 'INR')} · ` : ''}decide: renew, move it to a goal, or invest it` })
  }
  // Prices not refreshed for a while
  const age = (rows: any[]) => Math.max(0, ...rows.filter(r => Number(r.units ?? r.quantity) > 0 && r.last_updated).map(r => daysBetween(String(r.last_updated).slice(0, 10), today)))
  const mfAge = age(funds), stAge = age(stocks)
  if (mfAge > 3) needs.push({ id: 'mf-age', sev: 'low', href: '/dashboard/investments/mutual-funds', title: `Fund prices are ${mfAge} days old`, detail: 'Open Mutual funds to fetch today’s NAVs — values here use the last saved price' })
  if (stAge > 3) needs.push({ id: 'st-age', sev: 'low', href: '/dashboard/stocks', title: `Stock prices are ${stAge} days old`, detail: 'Open Stocks to fetch live prices' })
  // One holding too big a share
  const holdings = [
    ...funds.map(f => ({ name: f.fund_name, v: conv(holdingValue.mf(f), f.currency ?? 'INR'), href: '/dashboard/investments/mutual-funds' })),
    ...stocks.map(s => ({ name: s.name ?? s.symbol, v: conv(holdingValue.stock(s), s.currency ?? 'INR'), href: '/dashboard/stocks' })),
  ].sort((a, b) => b.v - a.v)
  const big = holdings[0]
  if (big && total > 0 && big.v / total > 0.3 && holdings.length > 1) needs.push({ id: 'conc', sev: 'medium', href: big.href,
    title: `${big.name} is ${Math.round(big.v / total * 100)}% of your investments`, detail: 'A single holding above ~30% puts a lot on one bet — new money could go elsewhere' })
  // ELSS lock-in ending in the next 30 days
  const elss = new Set(funds.filter(f => f.fund_type === 'elss').map(f => f.id))
  const unlock: Record<string, { name: string; amt: number; cur: string; by: string }> = {}
  for (const t of invTxns) {
    if (!elss.has(t.asset_id) || !['sip', 'purchase'].includes(t.txn_type)) continue
    const [y, ...rest] = String(t.txn_date).slice(0, 10).split('-')
    const free = `${Number(y) + ELSS_LOCK_YEARS}-${rest.join('-')}`
    const d = daysBetween(today, free)
    if (d < 0 || d > 30) continue
    const f = funds.find(x => x.id === t.asset_id)
    const e = unlock[t.asset_id] ??= { name: f?.fund_name ?? 'ELSS', amt: 0, cur: f?.currency ?? 'INR', by: free }
    e.amt += Number(t.amount) || 0; if (free > e.by) e.by = free
  }
  for (const [id, e] of Object.entries(unlock)) needs.push({ id: `elss-${id}`, sev: 'good', href: '/dashboard/investments/mutual-funds',
    title: `${fmtMoney(e.amt, e.cur)} of ${e.name} unlocks by ${fmtDay(e.by)}`, detail: 'Bought 3 years ago — free to keep, switch or withdraw (80C was claimed when you bought)' })

  async function setAuto(f: any, auto: boolean) {
    setBusy(f.id); setError('')
    const { error } = await createClient().from('mutual_funds').update({ sip_auto: auto }).eq('id', f.id)
    setBusy(null)
    if (error) setError(error.message); else router.refresh()
  }

  return (
    <section className={`wl-card px-4 md:px-5 py-3.5 md:py-[18px] ${className}`} aria-labelledby="inv-needs">
      <div className="flex items-center justify-between gap-2">
        <h2 id="inv-needs" className="text-[14px] font-semibold" style={{ color: 'var(--text)' }}>Needs you</h2>
        {pending.length + needs.length > 0 && <span className="text-[11px] font-semibold px-2 py-[3px] rounded-full" style={{ background: '#FEF2F2', color: '#DC2626' }}>{pending.length + needs.length}</span>}
      </div>
      <ul className="mt-1.5">
        <PendingConfirms pending={{ sips: pending }} />
        {needs.map(n => (
          <li key={n.id} style={{ borderTop: '1px solid #F1F5F9' }}>
            <Link href={n.href} className="flex gap-2.5 items-start py-[9px] -mx-2 px-2 rounded-lg hover:bg-[#F5F3FE] transition-colors">
              <span className="w-2 h-2 rounded-full mt-[5px] flex-shrink-0" style={{ background: SEV[n.sev] }} />
              <span className="flex-1 min-w-0">
                <span className="block text-[13px] font-semibold" style={{ color: 'var(--text)' }}>{n.title}</span>
                <span className="block text-[12px] mt-px" style={{ color: 'var(--text3)' }}>{n.detail}</span>
              </span>
              <ChevronRight size={16} className="flex-shrink-0 mt-0.5" style={{ color: 'var(--text4)' }} />
            </Link>
          </li>
        ))}
        {pending.length + needs.length === 0 && <li className="text-[12.5px] py-3" style={{ color: 'var(--text3)' }}>All good — nothing due, maturing or out of date.</li>}
      </ul>

      {sipFunds.length > 0 && (
        <div className="mt-2.5 pt-2.5" style={{ borderTop: '1px solid var(--track)' }}>
          <div className="text-[11.5px] font-semibold mb-1" style={{ color: 'var(--text2)' }}>SIP tracking</div>
          {!ready ? (
            <p className="text-[12px] leading-snug" style={{ color: 'var(--text3)' }}>Run migration 028 in Supabase: each SIP then gets recorded on its day — units, invested amount and the monthly chart.</p>
          ) : (<>
            {sipFunds.map(f => (
              <div key={f.id} className="flex items-center gap-2.5 py-1.5 text-[12.5px]">
                <span className="flex-1 min-w-0 truncate" style={{ color: 'var(--text)' }}>{f.fund_name}
                  <span style={{ color: 'var(--text4)' }}> · {fmtMoney(Number(f.sip_amount), f.currency ?? 'INR')} on the {f.sip_date}</span></span>
                <button onClick={() => setAuto(f, !f.sip_auto)} disabled={busy === f.id}
                  title={f.sip_auto ? 'Recorded on the SIP day — tap to be asked first' : 'You’re asked if it isn’t in your statement — tap to record it automatically'}
                  className="rounded-full px-2 h-[26px] text-[11px] font-semibold flex items-center gap-1 flex-shrink-0"
                  style={f.sip_auto ? { background: '#E7F7EF', color: '#1E7A50' } : { background: 'var(--accent-bg)', color: 'var(--accent2)' }}>
                  {f.sip_auto ? <><Zap size={11} />Auto</> : <><Hand size={11} />Ask</>}
                </button>
              </div>
            ))}
            <p className="text-[11.5px] mt-1 leading-snug" style={{ color: 'var(--text4)' }}>A SIP debit found in your bank statement is always recorded for you, at the latest NAV.</p>
          </>)}
          {error && <div className="mt-2 text-[12px]" style={{ color: '#B91C1C' }}>{error}</div>}
        </div>
      )}
    </section>
  )
}
