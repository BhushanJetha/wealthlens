'use client'
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Panel } from '@/components/ui/kit'
import { fmtMoney } from '@/lib/format'
import { capitalGains, LTCG_FREE } from '@/lib/capitalGains'
import { holdingHref, type HType } from '@/lib/holding'
import { nriInterest } from '@/lib/nriTax'

const money = (n: number) => fmtMoney(n, 'INR')
const fmtDate = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
const KIND = { equity: 'Equity', debt: 'Debt', gold: 'Gold' } as const

// Tax planner: capital gains from what you sold (by financial year, for your
// return) and interest earned in India on NRE (tax-free) and NRO (taxed)
export default function TaxGainsInterest({ holdings, invTxns, accounts, txns, today, fy }: {
  holdings: Partial<Record<HType, any[]>>; invTxns: any[]; accounts: any[]; txns: any[]; today: string; fy: string
}) {
  const all = useMemo(() => capitalGains(holdings, invTxns, today), [holdings, invTxns, today])
  const years = Object.keys(all).sort().reverse()
  // Between April and July last year's return is the one being filed
  const lastFy = `FY ${Number(fy.slice(3, 7)) - 1}–${fy.slice(5, 7)}`
  const [pick, setPick] = useState(years.includes(fy) ? fy : years[0] ?? fy)
  const g = all[pick]
  const interest = useMemo(() => nriInterest(accounts, txns, pick), [accounts, txns, pick])
  const choices = Array.from(new Set([fy, lastFy, ...years])).sort().reverse()

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-3.5 md:gap-4 wl-even">
      <Panel id="gains" title="Capital gains" right={
        <select value={pick} onChange={e => setPick(e.target.value)} aria-label="Financial year" className="wl-input" style={{ height: 32, width: 'auto', fontSize: 12.5 }}>
          {choices.map(y => <option key={y} value={y}>{y}{y === fy ? ' (this year)' : ''}</option>)}
        </select>}>
        {!g ? <p className="text-[12.5px] mt-2 leading-snug" style={{ color: 'var(--text3)' }}>No sales or redemptions recorded in {pick}. When you sell, use Sell or Redeem on the fund or share’s page and it shows here, matched to what you bought.</p> : <>
          <div className="grid grid-cols-3 gap-2 mt-3">
            {[['Equity, long-term', g.equity.long], ['Equity, short-term', g.equity.short], ['Tax, about', g.equity.tax + g.gold.tax]].map(([k, v]) => (
              <div key={k as string} className="rounded-xl px-3 py-2.5" style={{ background: 'var(--bg2)' }}>
                <div className="text-[11.5px]" style={{ color: 'var(--text3)' }}>{k}</div>
                <div className="text-[15px] font-bold tabular-nums mt-0.5" style={{ color: 'var(--text)' }}>{money(v as number)}</div>
              </div>
            ))}
          </div>
          <p className="text-[12px] mt-2 leading-snug" style={{ color: 'var(--text3)' }}>
            {g.equity.long > 0 ? `${money(Math.min(g.equity.long, LTCG_FREE))} of long-term equity gains is tax-free (up to ₹1.25L a year)${g.equity.long < LTCG_FREE ? `; ${money(LTCG_FREE - g.equity.long)} of the allowance is unused` : ''}. ` : `The ₹1.25L tax-free allowance for long-term equity gains is unused. `}
            {g.gold.long + g.gold.short !== 0 ? `Gold: ${money(g.gold.long)} long-term, ${money(g.gold.short)} short-term (at your slab). ` : ''}
            {g.debt.gain !== 0 ? `Debt funds: ${money(g.debt.gain)}, taxed at your slab. ` : ''}
            {g.unknown > 0 ? `${money(g.unknown)} sold from holdings no longer here can't be matched to a cost.` : ''}
          </p>
          <div className="overflow-x-auto -mx-4 md:-mx-5 mt-3" style={{ borderTop: '1px solid var(--line)' }}>
            <table className="w-full text-[12.5px] tabular-nums">
              <thead><tr style={{ background: '#FAFAFE', color: 'var(--text3)' }}>
                {['Date', 'Sold', 'Kind', 'Got', 'Cost', 'Long-term', 'Short-term'].map((h, i) => <th key={h} className={`px-3 py-2 text-[11px] font-semibold uppercase tracking-[.05em] whitespace-nowrap ${i < 3 ? 'text-left' : 'text-right'} ${i === 0 ? 'pl-4 md:pl-5' : ''} ${i === 6 ? 'pr-4 md:pr-5' : ''}`}>{h}</th>)}
              </tr></thead>
              <tbody>{g.rows.map((r, i) => (
                <tr key={(r.id ?? '') + i} style={{ borderTop: '1px solid var(--track)' }}>
                  <td className="px-3 pl-4 md:pl-5 py-2 whitespace-nowrap" style={{ color: 'var(--text2)' }}>{fmtDate(r.date)}</td>
                  <td className="px-3 py-2 max-w-[200px] truncate">{r.type && r.assetId ? <Link href={holdingHref(r.type, r.assetId)} className="font-medium hover:underline" style={{ color: 'var(--text)' }}>{r.name}</Link> : r.name}</td>
                  <td className="px-3 py-2" style={{ color: 'var(--text3)' }}>{r.kind ? KIND[r.kind] : '—'}</td>
                  <td className="px-3 py-2 text-right">{money(r.proceeds)}</td>
                  <td className="px-3 py-2 text-right" style={{ color: 'var(--text2)' }}>{r.cost != null ? money(r.cost) : '—'}</td>
                  <td className="px-3 py-2 text-right" style={{ color: r.longGain >= 0 ? 'var(--text)' : '#B4231A' }}>{r.gain == null ? '—' : money(r.longGain)}</td>
                  <td className="px-3 pr-4 md:pr-5 py-2 text-right" style={{ color: r.shortGain >= 0 ? 'var(--text)' : '#B4231A' }}>{r.gain == null ? '—' : money(r.shortGain)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          <p className="text-[11.5px] mt-2 leading-snug" style={{ color: 'var(--text4)' }}>Oldest units sold first, as the tax rules say. Long-term: equity held a year or more, gold and others two years. Rates are today’s (12.5% long-term, 20% short-term equity, since 23 July 2024); check with a tax adviser before you file.</p>
        </>}
      </Panel>

      <Panel title="Interest earned in India">
        {interest.nre + interest.nro + interest.other === 0 ? <p className="text-[12.5px] mt-2 leading-snug" style={{ color: 'var(--text3)' }}>No interest credits recorded in {pick}. They show here once your bank statements are imported.</p> : (
          <dl className="mt-3 flex flex-col gap-2.5 text-[13px]">
            {interest.nre > 0 && <div className="flex justify-between gap-3"><dt style={{ color: 'var(--text2)' }}>NRE interest<span className="block text-[11.5px]" style={{ color: 'var(--pos-text)' }}>Tax-free while you’re an NRI</span></dt><dd className="font-semibold">{money(interest.nre)}</dd></div>}
            {interest.nro > 0 && <div className="flex justify-between gap-3"><dt style={{ color: 'var(--text2)' }}>NRO interest<span className="block text-[11.5px]" style={{ color: 'var(--text3)' }}>Taxed in India</span></dt><dd className="font-semibold">{money(interest.nro)}</dd></div>}
            {interest.other > 0 && <div className="flex justify-between gap-3"><dt style={{ color: 'var(--text2)' }}>Other Indian accounts<span className="block text-[11.5px]" style={{ color: 'var(--text3)' }}>Mark them NRE or NRO on Accounts</span></dt><dd className="font-semibold">{money(interest.other)}</dd></div>}
            {interest.nro > 0 && <div className="flex justify-between gap-3 pt-2.5" style={{ borderTop: '1px solid var(--track)' }}><dt style={{ color: 'var(--text2)' }}>Tax deducted (TDS)<span className="block text-[11.5px]" style={{ color: 'var(--text3)' }}>{interest.tdsFound ? 'From your statements' : 'Not on your statements; banks usually deduct about 31.2%'}</span></dt><dd className="font-semibold">{money(interest.tdsFound ? interest.tds : interest.nro * 0.312)}{!interest.tdsFound && ' (est.)'}</dd></div>}
          </dl>
        )}
        {interest.nro > 0 && <p className="text-[12px] mt-3 leading-snug" style={{ color: 'var(--text3)' }}>If your total Indian income is under the basic exemption, file a return to get the TDS back. With a UAE tax residency certificate and Form 10F, your bank can deduct 12.5% instead (India–UAE tax treaty).</p>}
      </Panel>
    </div>
  )
}
