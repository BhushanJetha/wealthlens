'use client'
import { useMemo } from 'react'
import Link from 'next/link'
import { AlertTriangle, Check } from 'lucide-react'
import { useViewStore } from '@/store/viewStore'
import { computeNetWorth, groupAssets, ASSET_GROUPS, viewAmount } from '@/lib/netWorth'
import { viewTrends } from '@/lib/homeTrends'
import { fmtMoney, fmtCompact } from '@/lib/format'
import { kindOf } from '@/lib/ledger'
import { MONTH, mLabel, windowOf, sumOf, periodWord, pctChange } from '@/lib/period'
import { ListCard, ListRow } from '@/components/ui/list'
import { usePeriod, monthsNeeded, PeriodLine, TrendTile, GOOD, BAD, NONE, Card, type Pt, type Badge } from '../charts/parts'
import { useTrends } from '../charts/useTrends'
import InsidePanel from '../charts/Inside'
import { NetWorthStack, type OwnLayer } from './WealthCharts'
import { WealthPanels, type Overview } from '../WealthOverviewPanels'
import TodoBar from '../todo/TodoBar'

export interface WealthOverview extends Overview {
  drift: { cls: string; now: number; target: number; off: number }[]
  mixTotal: number                      // ₹, what the mix is worked out on
  targetSource: 'yours' | 'answers' | 'default'
  essentials: { AED: number; INR: number }   // a month of needs, per currency
  policies: number
}
interface Props {
  today: string; failed: string[]
  accounts: any[]; stocks: any[]; mutualFunds: any[]; etf: any[]; nps: any[]
  fixedDeposits: any[]; recurringDeposits: any[]; ppfEpf: any[]; gold: any[]
  bonds: any[]; lic: any[]; loans: any[]; otherAssets: any[]; gratuity: any
  overview: WealthOverview
}

// Where each net-worth row is managed
const HREF: Record<string, string> = {
  bank: '/dashboard/accounts', stock: '/dashboard/stocks', mf: '/dashboard/investments/mutual-funds',
  etf: '/dashboard/investments/etf', nps: '/dashboard/investments/nps', fd: '/dashboard/investments/fixed-deposits',
  rd: '/dashboard/investments/recurring-deposits', ppf: '/dashboard/investments/ppf-epf', gold: '/dashboard/investments/gold',
  bond: '/dashboard/investments/bonds', lic: '/dashboard/investments/lic', loans: '/dashboard/loans', cards: '/dashboard/cards',
  property: '/dashboard/assets', global: '/dashboard/assets', jewellery: '/dashboard/assets', otherAssets: '/dashboard/assets', gratuity: '/dashboard/assets',
}
// The chart's layers: asset groups (lib/netWorth) gathered into four
const KINDS = [
  { key: 'property', label: 'Property', color: '#14B8A6', groups: ['property'] },
  { key: 'inv', label: 'Investments', color: '#3B8EF0', groups: ['mf', 'equity', 'retirement', 'deposits', 'other'] },
  { key: 'cash', label: 'Bank & cash', color: '#2FB67C', groups: ['cash'] },
  { key: 'gold', label: 'Gold', color: '#C98A0B', groups: ['gold'] },
]
const CLS = [
  { cls: 'equity', label: 'Equity (funds & shares)', color: '#3B8EF0' },
  { cls: 'debt', label: 'Fixed income (FDs, RDs, PPF)', color: '#0F766E' },
  { cls: 'gold', label: 'Gold', color: '#C98A0B' },
  { cls: 'cash', label: 'Cash', color: '#2FB67C' },
]

// Wealth › Overview: what you own and owe in more depth than Home, for the
// period picked (the same chips as Home): net worth by kind over time and
// what moved it, where it sits today, your mix against its target, safety
// checks, then a tile for each tab inside Wealth.
export default function WealthOverviewClient(p: Props) {
  const { view, fxRate: FX } = useViewStore()
  const cur = view === 'uae' ? 'AED' : 'INR'
  const money = (n: number) => fmtMoney(n, cur), short = (n: number) => fmtCompact(n, cur)
  const fromInr = (inr: number) => (view === 'uae' ? inr / FX : inr)
  const per = usePeriod()
  const { data, failed, retry } = useTrends(monthsNeeded(per, p.today.slice(0, 7)) > 25 ? 60 : 25)
  const o = p.overview

  const nw = useMemo(() => computeNetWorth(p, view, FX), [p, view, FX])
  const groups = useMemo(() => groupAssets(nw.assetRows), [nw.assetRows])
  const gv = (keys: string[]) => groups.filter(g => keys.includes(g.key)).reduce((s, g) => s + g.value, 0)
  const v = useMemo(() => (data ? viewTrends(data, view, FX) : null), [data, view, FX])
  const now = p.today.slice(0, 7)

  const loansInView = p.loans.filter(l => l.is_active !== false && (view === 'consolidated' || (view === 'uae') === (l.currency === 'AED')))
  const homeLoans = loansInView.filter(l => (l.loan_type ?? 'home_loan') === 'home_loan').reduce((s, l) => s + viewAmount(Number(l.outstanding_amt) || 0, l.currency ?? 'INR', view, FX), 0)
  const property = gv(['property'])
  const yours = property > 0 ? Math.max(0, Math.min(100, Math.round((property - homeLoans) / property * 100))) : null
  const emis = loansInView.reduce((s, l) => s + viewAmount(Number(l.emi_amount) || 0, l.currency ?? 'INR', view, FX), 0)
  const essentials = view === 'uae' ? o.essentials.AED : view === 'india' ? o.essentials.INR : o.essentials.INR + o.essentials.AED * FX
  const coverMonths = essentials > 0 ? nw.cash / essentials : null
  const debtRatio = nw.totalAssets > 0 ? Math.round(nw.totalLiab / nw.totalAssets * 100) : 0
  const gain = nw.investments.value - nw.investments.cost
  const gainPct = nw.investments.cost > 0 ? gain / nw.investments.cost * 100 : null
  const banks = p.accounts.filter(a => kindOf(a) !== 'card' && (view === 'consolidated' || (view === 'uae') === (a.currency === 'AED')))
  const cards = p.accounts.filter(a => kindOf(a) === 'card' && (view === 'consolidated' || (view === 'uae') === (a.currency === 'AED')))
  const cardsOwed = cards.reduce((s, c) => s + viewAmount(Number(c.outstanding_bal) || 0, c.currency, view, FX), 0)
  const empty = nw.totalAssets === 0 && nw.totalLiab === 0
  // Property & assets: homes and land, plus jewellery, vehicles and other things you own
  const owned = nw.assetRows.filter(r => ['property', 'jewellery', 'otherAssets'].includes(r.key)).reduce((s, r) => s + r.value, 0)

  // ── Over the period ──
  const body = (() => {
    if (!data || !v) return null
    const M = data.months, w = windowOf(M, per.from, per.to, now, per.compare)
    const isNowM = (i: number) => M[i] === now
    const nwAt = (i: number) => v.nw[i] ?? (isNowM(i) ? nw.netWorth : null)
    const grpAt = (i: number, keys: string[]) => {
      const g = v.grp[i]
      if (g) return keys.reduce((s, k) => s + (g[k] ?? 0), 0)
      return isNowM(i) ? gv(keys) : null
    }
    const split = view === 'consolidated' && v.grp.some(Boolean)
    const pts: Pt[] = w.chart.map(i => ({ label: mLabel(M[i]), title: `${MONTH[Number(M[i].slice(5)) - 1]} ${M[i].slice(0, 4)}`, ix: [i], sel: false }))
    const layers: OwnLayer[] = split
      ? KINDS.map(k => ({ key: k.key, label: k.label, color: k.color, values: w.chart.map(i => grpAt(i, k.groups)) })).filter(l => l.values.some(x => x != null && x > 0))
      : [{ key: 'own', label: 'What you own', color: '#14B8A6', values: w.chart.map(i => v.own[i] ?? (isNowM(i) ? nw.totalAssets : null)) }]
    const before = w.a > 0 ? w.a - 1 : null
    const nwEnd = nwAt(w.b), nwStart = before != null ? nwAt(before) : null
    const lnEnd = v.loans[w.b], lnStart = before != null ? v.loans[before] : null
    const saved = sumOf(v.saved, w.a, w.b), paid = lnStart != null ? lnStart - lnEnd : null
    const moved = nwEnd != null && nwStart != null ? nwEnd - nwStart : null
    const markets = moved != null && paid != null ? moved - saved - paid : null
    const word = periodWord(per.period, per.to, per.from)
    return { M, w, pts, layers, nwEnd, nwStart, lnEnd, lnStart, saved, paid, moved, markets, word, nwSeries: w.chart.map(nwAt), loanSeries: w.chart.map(i => v.loans[i]), invSeries: w.chart.map(i => v.inv[i] ?? (isNowM(i) && view === 'consolidated' ? nw.investments.value : NaN)), invested: sumOf(v.invested, w.a, w.b) }
  })()

  const badge = (cur: number | null, prev: number | null, upGood: boolean, digits = 1): Badge => {
    if (cur == null || prev == null || !prev) return { t: '—', s: NONE }
    const d = pctChange(cur, prev), up = d >= 0
    return { t: `${up ? '▲' : '▼'} ${Math.abs(d).toFixed(digits)}%`, s: up === upGood ? GOOD : BAD }
  }
  const lifeOk = o.protection.dependents === 0 || o.protection.gap <= 0
  const kpis = [
    { label: 'Net worth', color: '#4B3BC4', dark: true, value: short(body?.nwEnd ?? nw.netWorth), sub: body?.moved != null ? `${body.moved >= 0 ? '+' : '−'}${short(Math.abs(body.moved))} ${body.word}` : 'History builds from your first visits', d: badge(body?.nwEnd ?? null, body?.nwStart ?? null, true), spark: body?.nwSeries.map(x => x ?? NaN) ?? [], href: '/dashboard/net-worth' },
    { label: 'Investments', color: '#3B8EF0', value: short(nw.investments.value), sub: `${short(nw.investments.cost)} put in · ${gain >= 0 ? '+' : '−'}${short(Math.abs(gain))}`, d: gainPct == null ? { t: '—', s: NONE } : { t: `${gainPct >= 0 ? '+' : ''}${gainPct.toFixed(1)}%`, s: gainPct >= 0 ? GOOD : BAD }, spark: body?.invSeries ?? [], href: '/dashboard/investments', mini: nw.investments.value > 0 ? { kind: 'split' as const, parts: [{ value: Math.min(nw.investments.cost, nw.investments.value), color: '#3B8EF0' }, { value: Math.max(0, gain), color: '#16A34A' }] } : undefined },
    { label: 'Property', color: '#14B8A6', value: short(property), sub: property > 0 ? (homeLoans > 0 ? `${short(homeLoans)} of it is home loan` : 'No home loan on it') : 'No property added', d: yours != null ? { t: `${yours}% yours`, s: GOOD } : { t: '—', s: NONE }, spark: [], href: '/dashboard/assets', mini: property > 0 ? { kind: 'split' as const, parts: [{ value: property - Math.min(property, homeLoans), color: '#0F766E' }, { value: Math.min(property, homeLoans), color: '#FCA5A5' }] } : undefined },
    { label: 'Bank & cash', color: '#2FB67C', value: short(nw.cash), sub: coverMonths != null ? 'Emergency fund · aim for 6 months' : 'In your accounts today', d: coverMonths != null ? { t: `${coverMonths.toFixed(1)} mo`, s: coverMonths >= 6 ? GOOD : coverMonths >= 3 ? NONE : BAD } : { t: 'today', s: NONE }, spark: [], href: '/dashboard/accounts', mini: coverMonths != null ? { kind: 'progress' as const, pct: coverMonths / 6 * 100, color: coverMonths >= 6 ? '#2FB67C' : '#F59E0B' } : undefined },
    { label: 'Loans left', color: '#DC2626', value: short(body?.lnEnd ?? 0), sub: body?.paid != null && (body.lnStart ?? 0) > 0 ? `${body.paid >= 0 ? 'Paid down' : 'Up by'} ${short(Math.abs(body.paid))} ${body.word}` : (body?.lnEnd ?? 0) > 0 ? 'Still to repay' : 'No loans', d: badge(body?.lnEnd ?? null, body?.lnStart ?? null, false), spark: body?.loanSeries ?? [], href: '/dashboard/loans' },
    { label: 'Life cover', color: '#6A55E8', value: short(fromInr(o.protection.cover)), sub: o.protection.health.count ? `Health cover ${short(fromInr(o.protection.health.amount))}` : 'No health policy added', d: o.protection.dependents === 0 ? { t: 'no dependents', s: NONE } : lifeOk ? { t: 'enough', s: GOOD } : { t: `${short(fromInr(o.protection.gap))} short`, s: BAD }, spark: [], href: '/dashboard/insurance', mini: o.protection.dependents > 0 && o.protection.need > 0 ? { kind: 'progress' as const, pct: o.protection.cover / o.protection.need * 100, color: lifeOk ? '#6A55E8' : '#F59E0B' } : undefined },
  ]

  // Where it sits today
  const sits = KINDS.map(k => ({ ...k, value: gv(k.groups) })).filter(k => k.value > 0)
  const C = 2 * Math.PI * 70, sitsSum = sits.reduce((s, k) => s + k.value, 0) || 1
  let accA = 0
  const segs = sits.map(k => { const Ln = k.value / sitsSum * C, s = { color: k.color, dash: `${Math.max(0, Ln - 2).toFixed(1)} ${C.toFixed(1)}`, off: (-accA).toFixed(1) }; accA += Ln; return s })

  // Mix against target (portfolio manager), biggest gap first
  const big = [...o.drift].sort((a, b) => Math.abs(b.off) - Math.abs(a.off))[0]
  const safety = [
    { ok: coverMonths != null && coverMonths >= 6, warn: coverMonths == null || coverMonths < 6, title: 'Emergency fund', detail: coverMonths != null ? `${coverMonths.toFixed(1)} months of needs in bank & cash (aim: 6)` : 'Add your spending to work it out', href: '/dashboard/accounts' },
    { ok: debtRatio < 30, warn: debtRatio >= 30, title: 'Debt you carry', detail: `${debtRatio}% of what you own (keep it under 30%)`, href: '/dashboard/debt-equity' },
    { ok: lifeOk, warn: !lifeOk, title: 'Life cover', detail: o.protection.dependents === 0 ? 'No one depends on you' : lifeOk ? `${short(fromInr(o.protection.cover))} covers what your family would need` : `${short(fromInr(o.protection.gap))} short of what your family would need`, href: '/dashboard/insurance' },
    { ok: o.protection.health.count > 0, warn: o.protection.health.count === 0, title: 'Health cover', detail: o.protection.health.count ? `${short(fromInr(o.protection.health.amount))} across ${o.protection.health.count} polic${o.protection.health.count === 1 ? 'y' : 'ies'}` : 'No health policy added', href: '/dashboard/insurance' },
    ...(o.nominees.ready ? [{ ok: o.nominees.missing === 0, warn: o.nominees.missing > 0, title: 'Nominees', detail: o.nominees.missing ? `${o.nominees.missing} of ${o.nominees.total} have none` : `All ${o.nominees.total} have one`, href: '/dashboard/nominees' }] : []),
  ]

  // Inside Wealth
  const pmNeeds = o.needs.filter(n => n.href.startsWith('/dashboard/portfolio'))
  const inside = [
    { title: 'Portfolio manager', href: '/dashboard/portfolio', value: String(pmNeeds.length), unit: pmNeeds.length === 1 ? 'thing to do' : 'things to do', line: pmNeeds[0]?.title ?? (big && Math.abs(big.off) < 5 ? 'Your mix is close to its target' : 'Reviews, your mix and what to add'),
      mini: { kind: 'blocks' as const, colors: [...pmNeeds.slice(0, 6).map(n => (n.tone === 'warn' ? '#F59E0B' : n.tone === 'good' ? '#16A34A' : '#6A55E8')), ...Array(Math.max(0, 6 - pmNeeds.length)).fill('#EEF0F5')] } },
    { title: 'Investments', href: '/dashboard/investments', value: short(nw.investments.value), unit: gainPct != null ? `${gainPct >= 0 ? '+' : ''}${gainPct.toFixed(1)}%` : undefined, unitTone: gainPct != null ? (gainPct >= 0 ? 'good' as const : 'bad' as const) : undefined,
      line: body ? `${short(body.invested)} added ${body.word}` : 'Funds, shares, deposits and more', mini: body && view === 'consolidated' ? { kind: 'spark' as const, values: body.invSeries, color: '#3B8EF0' } : undefined },
    { title: 'Property & assets', href: '/dashboard/assets', value: short(owned), line: property > 0 ? `${yours ?? 0}% yours after home loans` : 'Homes, land, gold and other things you own',
      mini: property > 0 ? { kind: 'split' as const, parts: [{ value: property - Math.min(property, homeLoans), color: '#0F766E' }, { value: Math.min(property, homeLoans), color: '#FCA5A5' }] } : undefined },
    { title: 'Loans', href: '/dashboard/loans', value: short(body?.lnEnd ?? 0), unit: 'left', line: loansInView.length ? `${loansInView.length} loan${loansInView.length === 1 ? '' : 's'} · ${short(emis)} EMIs a month` : 'No loans', mini: body && (body.lnEnd ?? 0) > 0 ? { kind: 'spark' as const, values: body.loanSeries, color: '#DC2626' } : undefined },
    { title: 'Accounts & cards', href: '/dashboard/accounts', value: short(nw.cash), line: `${banks.length} account${banks.length === 1 ? '' : 's'}${cards.length ? ` · cards ${short(cardsOwed)} owed` : ''}`, mini: banks.length > 1 ? { kind: 'split' as const, parts: banks.map((a, i) => ({ value: viewAmount(Number(a.current_balance) || 0, a.currency, view, FX), color: ['#2FB67C', '#16A34A', '#0F766E', '#34D399', '#065F46'][i % 5] })) } : undefined },
    { title: 'Insurance', href: '/dashboard/insurance', value: String(o.policies), unit: o.policies === 1 ? 'policy' : 'policies', line: `${short(fromInr(o.protection.cover))} life · ${short(fromInr(o.protection.health.amount))} health`, mini: { kind: 'blocks' as const, colors: [lifeOk ? '#16A34A' : '#F59E0B', o.protection.health.count ? '#16A34A' : '#F59E0B', ...(o.nominees.ready ? [o.nominees.missing ? '#F59E0B' : '#16A34A'] : [])] } },
  ]
  const viewLabel = view === 'uae' ? 'UAE · AED' : view === 'india' ? 'India · INR' : 'Both countries · INR'

  return (
    <div className="flex flex-col gap-3.5 md:gap-[18px] animate-fade-up">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[13px]" style={{ color: 'var(--text3)' }}>Wealth · {viewLabel}</div>
          <h1 className="text-[22px] md:text-[26px] font-bold tracking-[-0.02em]" style={{ color: 'var(--text)' }}>What you own and owe</h1>
          {body && <PeriodLine p={per} w={body.w} months={body.M} />}
        </div>
      </div>

      {p.failed.length > 0 && (
        <div className="rounded-xl px-4 py-3 flex items-start gap-2.5 text-[12.5px]" style={{ background: '#FFF7E6', border: '1px solid #F8DDB8', color: '#92560B' }}>
          <AlertTriangle size={15} className="flex-shrink-0 mt-0.5" />
          <span>We couldn&apos;t load {p.failed.join(', ')} just now, so net worth may be understated. Refresh the page to try again.</span>
        </div>
      )}
      <TodoBar area="wealth" />

      {empty ? (
        <div className="wl-card px-6 py-10 text-center flex flex-col items-center gap-3">
          <div className="text-[15px] font-semibold" style={{ color: 'var(--text)' }}>Nothing owned or owed in this view yet</div>
          <div className="text-[13px] max-w-md" style={{ color: 'var(--text3)' }}>Add bank balances, investments, property or loans to see your net worth and how it moves.</div>
          <div className="flex gap-2 mt-1"><Link href="/dashboard/investments" className="wl-btn wl-btn-primary" style={{ height: 36 }}>Add investments</Link><Link href="/dashboard/assets" className="wl-btn" style={{ height: 36 }}>Add a home</Link></div>
        </div>
      ) : (<>
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2.5 md:gap-3">
          {kpis.map((k, i) => <TrendTile key={k.label} {...k} gid={`wk${i}`} />)}
        </div>

        {body ? (
          <NetWorthStack pts={body.pts} layers={body.layers} loans={body.loanSeries} nw={body.nwSeries} short={short} money={money}
            sub={`At each month’s end · ${body.w.len >= 3 ? `${mLabel(body.M[body.w.a])} – ${mLabel(body.M[body.w.b])}` : `the 6 months to ${mLabel(body.M[body.w.b])}`}${view === 'consolidated' ? '' : ' · the split by kind shows in the both-countries view'}`}
            foot={body.moved != null && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 md:gap-2.5">
                <div className="rounded-xl px-3 py-2.5" style={{ background: '#EAF7EF' }}><div className="text-[11.5px]" style={{ color: '#1E6B44' }}>From what you saved</div><div className="text-[15px] md:text-[16px] font-bold tabular-nums" style={{ color: 'var(--text)' }}>{body.saved >= 0 ? '+' : '−'}{short(Math.abs(body.saved))}</div></div>
                <div className="rounded-xl px-3 py-2.5" style={{ background: '#FDECEA' }}><div className="text-[11.5px]" style={{ color: '#8A1C14' }}>{(body.paid ?? 0) >= 0 ? 'Loans paid down' : 'More borrowed'}</div><div className="text-[15px] md:text-[16px] font-bold tabular-nums" style={{ color: 'var(--text)' }}>{body.paid != null ? `${body.paid >= 0 ? '+' : '−'}${short(Math.abs(body.paid))}` : '—'}</div></div>
                <div className="rounded-xl px-3 py-2.5" style={{ background: '#EEF4FF' }}><div className="text-[11.5px]" style={{ color: '#1D4ED8' }}>Prices, markets and the rest</div><div className="text-[15px] md:text-[16px] font-bold tabular-nums" style={{ color: 'var(--text)' }}>{body.markets != null ? `${body.markets >= 0 ? '+' : '−'}${short(Math.abs(body.markets))}` : '—'}</div></div>
              </div>
            )} />
        ) : (
          <div className="wl-card px-5 py-6 text-[13px]" style={{ color: 'var(--text3)' }}>
            {failed ? <>Your history couldn’t load just now. <button onClick={retry} className="font-semibold underline" style={{ color: 'var(--accent)' }}>Try again</button></> : <div className="h-[300px] rounded-xl animate-pulse" style={{ background: '#FAFAFE' }} />}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3.5 md:gap-4 items-stretch">
          <Card title="Where it sits" sub="Today">
            <div className="relative flex justify-center">
              <svg viewBox="0 0 200 200" className="w-[176px] h-[176px]" role="img" aria-label={sits.map(k => `${k.label} ${Math.round(k.value / sitsSum * 100)}%`).join(', ')}>
                <circle cx="100" cy="100" r="70" fill="none" stroke="#EEF0F5" strokeWidth="24" />
                {segs.map((s, i) => <circle key={i} cx="100" cy="100" r="70" fill="none" stroke={s.color} strokeWidth="24" strokeDasharray={s.dash} strokeDashoffset={s.off} transform="rotate(-90 100 100)" />)}
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none"><div className="text-[11.5px]" style={{ color: 'var(--text3)' }}>You own</div><div className="text-[19px] font-bold tabular-nums" style={{ color: 'var(--text)' }}>{short(nw.totalAssets)}</div></div>
            </div>
            <div className="flex flex-col">
              {sits.map(k => (
                <div key={k.key} className="flex items-center gap-2.5 min-h-[32px] text-[13px]" style={{ color: 'var(--text)' }}>
                  <i className="w-2.5 h-2.5 rounded-[3px] flex-shrink-0" style={{ background: k.color }} /><span className="flex-1">{k.label}</span>
                  <span className="text-[12px] w-10 text-right" style={{ color: 'var(--text3)' }}>{Math.round(k.value / sitsSum * 100)}%</span>
                  <b className="w-[72px] text-right tabular-nums font-semibold">{short(k.value)}</b>
                </div>
              ))}
            </div>
          </Card>

          <Card title="Investments vs your target mix" right={<Link href="/dashboard/portfolio" className="text-[12.5px] font-semibold" style={{ color: 'var(--accent)' }}>Portfolio manager</Link>}
            sub={o.targetSource === 'yours' ? 'The target you set' : o.targetSource === 'answers' ? 'Target from your answers' : 'A starting target — answer 10 questions to make it yours'}>
            {o.mixTotal > 0 ? (<>
              <div className="flex flex-col gap-3.5">
                {CLS.map(c => { const d = o.drift.find(x => x.cls === c.cls); if (!d) return null; return (
                  <div key={c.cls}>
                    <div className="flex justify-between text-[13px]" style={{ color: 'var(--text)' }}><span>{c.label}</span><span><b>{Math.round(d.now)}%</b> <span style={{ color: 'var(--text3)' }}>· target {Math.round(d.target)}%</span></span></div>
                    <div className="relative h-2.5 rounded-full mt-1.5" style={{ background: '#EEF0F5' }}>
                      <div className="h-2.5 rounded-full" style={{ width: `${Math.min(100, d.now)}%`, background: c.color }} />
                      <div className="absolute -top-[3px] -bottom-[3px]" style={{ left: `${Math.min(100, d.target)}%`, borderLeft: '2px solid #14172B' }} aria-hidden="true" />
                    </div>
                  </div>
                ) })}
              </div>
              {big && <p className="text-[12.5px] rounded-[10px] px-3 py-2.5" style={{ background: '#F4F2FF', color: 'var(--text2)' }}>
                {Math.abs(big.off) < 5 ? 'Every part is within 5 points of its target. The black mark is your target.'
                  : <>{CLS.find(c => c.cls === big.cls)?.label.split(' (')[0]} is {Math.round(Math.abs(big.off))} points {big.off < 0 ? 'under' : 'over'} target: about <b style={{ color: 'var(--text)' }}>{short(fromInr(Math.abs(big.off) / 100 * o.mixTotal))}</b>. Point new money at what’s under target. The black mark is your target.</>}
              </p>}
            </>) : <p className="text-[12.5px] py-6 text-center" style={{ color: 'var(--text3)' }}>Add investments to compare them with a target mix.</p>}
          </Card>

          <Card title="Safety checks">
            <div className="flex flex-col">
              {safety.map(s => (
                <Link key={s.title} href={s.href} className="flex items-center gap-3 min-h-[46px] -mx-2 px-2 rounded-lg hover:bg-[#F5F3FE]">
                  <span className="w-[30px] h-[30px] rounded-full flex items-center justify-center flex-shrink-0 font-bold text-[14px]" style={s.ok ? { background: '#E7F6EE', color: '#15803D' } : { background: '#FFF4DE', color: '#B45309' }} aria-label={s.ok ? 'Fine' : 'Look at this'}>{s.ok ? <Check size={15} /> : '!'}</span>
                  <span className="flex-1 min-w-0 text-[13px]" style={{ color: 'var(--text)' }}>{s.title}<span className="block text-[12px]" style={{ color: 'var(--text3)' }}>{s.detail}</span></span>
                </Link>
              ))}
            </div>
          </Card>
        </div>

        <WealthPanels o={o} view={view} fx={FX} hideProtection />

        <InsidePanel title="Inside Wealth" items={inside} />

        <ListCard title="Everything you own and owe" sub="Cash and fixed income are held at cost · tap a row to manage it" head={['Holding', 'Type', 'Return', 'Value']}>
          {[...nw.assetRows].filter(r => r.value > 0).sort((a, b) => b.value - a.value).map(r => {
            const g = r.value - r.invested
            const gp = r.invested > 0 && Math.abs(g) >= 1 ? Math.round(g / r.invested * 1000) / 10 : null
            return (
              <ListRow key={r.key} color={r.color} title={r.label} tag={ASSET_GROUPS.find(x => x.key === r.group)?.label ?? ''}
                sub={r.invested !== r.value ? `${short(r.invested)} put in` : undefined}
                meta={gp == null ? 'at cost' : `${gp >= 0 ? '+' : ''}${gp}%`} metaColor={gp == null ? undefined : gp >= 0 ? '#16A34A' : '#DC2626'}
                amount={money(r.value)} amountSub={`${nw.totalAssets > 0 ? Math.round(r.value / nw.totalAssets * 100) : 0}% of what you own`} href={HREF[r.key]} />
            )
          })}
          {nw.liabRows.filter(r => r.value > 0).map(r => (
            <ListRow key={r.key} color={r.color} title={r.label} tag="Owed" meta="—" amount={`−${money(r.value)}`} amountColor="#DC2626"
              amountSub={`${nw.totalLiab > 0 ? Math.round(r.value / nw.totalLiab * 100) : 0}% of what you owe`} href={HREF[r.key]} />
          ))}
        </ListCard>
      </>)}
    </div>
  )
}
