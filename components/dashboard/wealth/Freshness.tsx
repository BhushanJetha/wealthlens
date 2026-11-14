'use client'
// How fresh the numbers on Wealth are: fund NAVs and share prices (by their
// last update), each account's latest entry (from a statement, a message or by
// hand), and property values (only you can update those). Green is within its
// usual cycle, amber is older than it should be (with the fix), gray is yours to set.
import Link from 'next/link'
import { fmtDay, daysBetween } from '@/lib/insights'
import { kindOf } from '@/lib/ledger'

type Tone = 'ok' | 'old' | 'yours'
const DOT: Record<Tone, string> = { ok: '#16A34A', old: '#F59E0B', yours: '#B9BDCB' }
const ago = (days: number) => (days <= 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days old`)

export default function Freshness({ today, mutualFunds, stocks, accounts, lastEntry, otherAssets }: {
  today: string; mutualFunds: any[]; stocks: any[]; accounts: any[]; lastEntry: Record<string, string>; otherAssets: any[]
}) {
  const chips: { key: string; tone: Tone; text: string; href?: string; fix?: string }[] = []
  const held = (r: any) => Number(r.units ?? r.quantity) > 0 && r.last_updated
  const funds = mutualFunds.filter(held).map(r => String(r.last_updated).slice(0, 10)).sort()
  if (funds.length) {
    const age = daysBetween(funds[0], today)
    chips.push({ key: 'nav', tone: age <= 3 ? 'ok' : 'old', text: `Fund NAVs · ${age <= 3 ? `updated ${fmtDay(funds[funds.length - 1])}` : `oldest ${ago(age)}`}`, href: '/dashboard/investments/mutual-funds', fix: age > 3 ? 'Refresh' : undefined })
  }
  const shares = stocks.filter(held).map(r => ({ r, d: String(r.last_updated).slice(0, 10) })).sort((a, b) => a.d.localeCompare(b.d))
  if (shares.length) {
    const o = shares[0], age = daysBetween(o.d, today)
    chips.push({ key: 'px', tone: age <= 3 ? 'ok' : 'old', text: age <= 3 ? `Share prices · updated ${fmtDay(shares[shares.length - 1].d)}` : `${o.r.name || o.r.symbol} price · ${ago(age)}`, href: '/dashboard/stocks', fix: age > 3 ? 'Update' : undefined })
  }
  // The account whose latest entry is oldest
  const banks = accounts.filter(a => kindOf(a) === 'bank' && lastEntry[a.id]).map(a => ({ a, d: lastEntry[a.id] })).sort((x, y) => x.d.localeCompare(y.d))
  if (banks.length) {
    const o = banks[0], age = daysBetween(o.d, today)
    chips.push({ key: 'st', tone: age <= 35 ? 'ok' : 'old', text: age <= 35 ? `Bank entries · up to ${fmtDay(banks[banks.length - 1].d)}` : `${o.a.name} · last entry ${fmtDay(o.d)}`, href: '/dashboard/ingest', fix: age > 35 ? 'Import' : undefined })
  }
  const homes = otherAssets.filter(a => ['property', 'land'].includes(a.kind) && a.is_active !== false)
  if (homes.length) {
    const dated = homes.filter(a => a.value_as_of).map(a => String(a.value_as_of).slice(0, 10)).sort()
    const age = dated.length ? daysBetween(dated[0], today) : null
    chips.push({ key: 'pv', tone: age != null && age > 366 ? 'old' : 'yours', text: `Property value · you set it${dated.length ? ` · ${fmtDay(dated[0])}` : ''}`, href: '/dashboard/assets', fix: age != null && age > 366 ? 'Update' : undefined })
  }
  if (!chips.length) return null
  return (
    <div className="flex gap-2 overflow-x-auto no-scrollbar -mt-1" aria-label="How fresh these numbers are">
      {chips.map(c => (
        <Link key={c.key} href={c.href ?? '#'} className="inline-flex items-center gap-2 h-9 px-3 rounded-full text-[12.5px] whitespace-nowrap flex-shrink-0"
          style={c.tone === 'old' ? { background: '#FFF7EC', border: '1px solid #F8DDB4', color: 'var(--text)' } : { background: '#fff', border: '1px solid var(--line)', color: 'var(--text2)' }}>
          <span className="w-2 h-2 rounded-full" style={{ background: DOT[c.tone] }} aria-label={c.tone === 'ok' ? 'Up to date' : c.tone === 'old' ? 'Older than usual' : 'Set by you'} />
          {c.text}{c.fix && <b style={{ color: 'var(--accent)' }}>{c.fix}</b>}
        </Link>
      ))}
    </div>
  )
}
