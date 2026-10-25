'use client'
import { useMemo } from 'react'
import { useViewStore } from '@/store/viewStore'
import { AlertTriangle, Wallet, Landmark, Scale, TrendingUp } from 'lucide-react'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { computeNetWorth, groupAssets, ASSET_GROUPS } from '@/lib/netWorth'
import { buildHomeInsights, netWorthHistory, estimateNetWorthBack, fmtDay, type Snapshot } from '@/lib/insights'
import { fmtMoney, fmtCompact } from '@/lib/format'
import { PageHeader, InsightBar, AiActions, LearnStrip, HeroStat, KpiTile, Donut, ProgressRow, EmptyState } from '@/components/ui/kit'
import { ListCard, ListRow } from '@/components/ui/list'

interface Props {
  today: string; failed: string[]
  accounts: any[]; stocks: any[]; mutualFunds: any[]; etf: any[]; nps: any[]
  fixedDeposits: any[]; recurringDeposits: any[]; ppfEpf: any[]; gold: any[]
  bonds: any[]; lic: any[]; loans: any[]; transactions: any[]; snapshots: Snapshot[]
}

// Where each net-worth row is managed
const HREF: Record<string, string> = {
  bank: '/dashboard/accounts', stock: '/dashboard/stocks', mf: '/dashboard/investments/mutual-funds',
  etf: '/dashboard/investments/etf', nps: '/dashboard/investments/nps', fd: '/dashboard/investments/fixed-deposits',
  rd: '/dashboard/investments/recurring-deposits', ppf: '/dashboard/investments/ppf-epf', gold: '/dashboard/investments/gold',
  bond: '/dashboard/investments/bonds', lic: '/dashboard/investments/lic', loans: '/dashboard/loans', cards: '/dashboard/cards',
}

// Net worth (design v2): headline + trend in one card on both sizes (same
// tracked + estimated line as Home), where it sits, tiles, and every asset
// and liability class with a link to its page.
export default function NetWorthClient(p: Props) {
  const { view, fxRate: FX } = useViewStore()
  const cur = view === 'uae' ? 'AED' : 'INR'
  const money = (n: number) => fmtMoney(n, cur)
  const short = (n: number) => fmtCompact(n, cur)
  const viewLabel = view === 'uae' ? 'UAE · AED' : view === 'india' ? 'India · INR' : 'Consolidated · INR'

  const nw = useMemo(() => computeNetWorth(p, view, FX), [p, view, FX])
  const { assetRows, liabRows, totalAssets, totalInvested, totalLiab, netWorth, cash } = nw
  const groups = useMemo(() => groupAssets(assetRows), [assetRows])

  // Tracked snapshots (solid) + months before tracking estimated from savings (dashed)
  const hist = useMemo(() => netWorthHistory(p.snapshots, view, p.today), [p.snapshots, view, p.today])
  const saved = useMemo(() => buildHomeInsights({
    view, fx: FX, today: p.today, focusMonth: p.today.slice(0, 7), txns: p.transactions,
    accounts: [], loans: [], insurance: [], fixedDeposits: [], budgets: [], mutualFunds: [], stocks: [],
    cash: 0, invested: { value: 0, cost: 0 },
  }).savedByMonth, [p.transactions, view, FX, p.today])
  const est = useMemo(() => estimateNetWorthBack(hist.series[0] ?? { date: p.today, value: netWorth }, p.today, saved), [netWorth, p.today, saved, hist.series])
  const rows = useMemo(() => {
    const tracked = [...hist.series.slice(0, -1), { date: hist.series[hist.series.length - 1]?.date ?? p.today, value: Math.round(netWorth) }]
    return [
      ...est.map(x => ({ date: x.date, est: x.value } as { date: string; value?: number; est?: number })),
      ...tracked.map((x, i) => (i === 0 && est.length ? { ...x, est: x.value } : { ...x })),
    ]
  }, [est, hist.series, netWorth, p.today])
  // Change vs about a month ago: a tracked point when there is one, else the estimate
  const ref = hist.ref ?? (est.length ? { ...est[est.length - 1], estimated: true } : null)
  const change = ref ? netWorth - ref.value : null

  const debtRatio = totalAssets > 0 ? Math.round(totalLiab / totalAssets * 100) : 0
  // Investments = everything except bank & cash; matches the Investments page total
  const investedNow = totalAssets - cash, putIn = totalInvested - cash
  const gain = investedNow - putIn
  const gainPct = putIn > 0 ? Math.round(gain / putIn * 1000) / 10 : 0
  const empty = totalAssets === 0 && totalLiab === 0
  const groupLabel = (g: string) => ASSET_GROUPS.find(x => x.key === g)?.label ?? ''
  const labels = rows.length >= 3 ? [rows[0], rows[Math.floor(rows.length / 2)], rows[rows.length - 1]] : []

  return (
    <div className="flex flex-col gap-3.5 md:gap-[18px] animate-fade-up">
      <div className="max-md:order-1">
        <PageHeader title="Net worth" sub={`Assets minus liabilities · ${viewLabel}`} />
      </div>

      {p.failed.length > 0 && (
        <div className="max-md:order-1 rounded-xl px-4 py-3 flex items-start gap-2.5 text-[12.5px]" style={{ background: '#FFF7E6', border: '1px solid #F8DDB8', color: '#92560B' }}>
          <AlertTriangle size={15} className="flex-shrink-0 mt-0.5" />
          <span>We couldn&apos;t load {p.failed.join(', ')} just now, so net worth may be understated. Refresh the page to try again.</span>
        </div>
      )}

      {!empty && <div className="max-md:order-4"><InsightBar
        text={`Net worth is ${short(netWorth)}: ${short(totalAssets)} of assets minus ${short(totalLiab)} owed. Debt is ${debtRatio}% of what you own${debtRatio < 30 ? ' (healthy)' : debtRatio < 50 ? '' : ' (high)'}, and investments are ${gain >= 0 ? 'up' : 'down'} ${Math.abs(gainPct)}% on what you put in.`}
        prompt={`Explain my net worth page in plain language. Net worth ${money(netWorth)}, assets ${money(totalAssets)}, liabilities ${money(totalLiab)}, debt ratio ${debtRatio}%, investment gain ${gainPct}%. Assets: ${assetRows.filter(r => r.value > 0).map(r => `${r.label} ${short(r.value)}`).join(', ')}. Liabilities: ${liabRows.filter(r => r.value > 0).map(r => `${r.label} ${short(r.value)}`).join(', ') || 'none'}.`} /></div>}
      {!empty && <div className="max-md:order-5"><AiActions actions={['What moved my net worth?', 'How do I grow it faster?']}
        context={`Net worth ${money(netWorth)}, assets ${money(totalAssets)}, liabilities ${money(totalLiab)}, debt ratio ${debtRatio}%.`} /></div>}

      {empty ? (
        <div className="max-md:order-2">
          <EmptyState message={`No assets or liabilities in the ${view === 'uae' ? 'UAE (AED)' : view === 'india' ? 'India (INR)' : 'consolidated'} view yet. Add bank balances, investments or loans to see your net worth.`} />
        </div>
      ) : (<>
        <div className="max-md:contents grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-4">
          <HeroStat className="max-md:order-2" label="Net worth" value={money(netWorth)}
            tone={change == null ? 'neutral' : change >= 0 ? 'good' : 'bad'}
            delta={change == null ? 'Your trend builds as you use the app'
              : `${change >= 0 ? '▲' : '▼'} ${short(Math.abs(change))} since ${fmtDay(ref!.date)}${'estimated' in ref! ? ' (estimated)' : ''}`}
            right={est.length > 0 ? <span className="text-[11.5px] flex items-center gap-3" style={{ color: 'var(--text3)' }}>
              <span className="flex items-center gap-1.5"><i className="inline-block w-4 border-t-2" style={{ borderColor: 'var(--accent)' }} />Tracked</span>
              <span className="flex items-center gap-1.5"><i className="inline-block w-4 border-t-2 border-dashed" style={{ borderColor: '#A99BF0' }} />Estimated</span>
            </span> : undefined}>
            {rows.length >= 2 && (<>
              <div className="h-[110px] md:h-auto md:flex-1 md:min-h-[200px] mt-2.5 md:mt-4 -mx-1" aria-label="Net worth over time">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={rows} margin={{ top: 4, right: 6, bottom: 0, left: 6 }}>
                    <defs>
                      <linearGradient id="nwFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0" stopColor="#6A55E8" stopOpacity={0.22} /><stop offset="1" stopColor="#6A55E8" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="date" hide />
                    <YAxis hide domain={['dataMin', 'dataMax']} />
                    <Tooltip cursor={{ stroke: 'var(--border2)', strokeWidth: 1 }}
                      content={({ active, payload }: any) => {
                        const r = active && payload?.[0]?.payload
                        if (!r) return null
                        return (
                          <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 10, fontSize: 12, padding: '6px 10px', color: 'var(--text)' }}>
                            <div style={{ color: 'var(--text3)' }}>{fmtDay(String(r.date))}</div>
                            <div className="font-semibold tabular-nums">{money(Number(r.value ?? r.est))}{r.value == null ? ' · estimated' : ''}</div>
                          </div>
                        )
                      }} />
                    <Area type="monotone" dataKey="est" stroke="#A99BF0" strokeWidth={2} strokeDasharray="5 4" fill="url(#nwFill)" isAnimationActive={false} dot={false} />
                    <Area type="monotone" dataKey="value" stroke="#6A55E8" strokeWidth={2.5} fill="url(#nwFill)" isAnimationActive={false} dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              {labels.length > 0 && (
                <div className="hidden md:flex justify-between text-[11px] mt-1.5" style={{ color: 'var(--text4)' }}>
                  {labels.map((l, i) => <span key={i}>{fmtDay(l.date)}</span>)}
                </div>
              )}
            </>)}
          </HeroStat>

          <section className="wl-card max-md:order-6 px-4 md:px-5 py-4 md:py-[18px] flex flex-col gap-3">
            <h2 className="text-[14px] font-semibold" style={{ color: 'var(--text)' }}>Where your wealth sits</h2>
            <div className="hidden md:flex justify-center">
              <Donut segments={groups.map(g => ({ value: g.value, color: g.color }))} size={128}
                label={`Assets by type: ${groups.map(g => `${g.label} ${short(g.value)}`).join(', ')}`}>
                <div className="text-[10.5px]" style={{ color: 'var(--text3)' }}>Assets</div>
                <div className="text-[16px] font-bold" style={{ color: 'var(--text)' }}>{short(totalAssets)}</div>
              </Donut>
            </div>
            {[...groups].sort((a, b) => b.value - a.value).map(g => (
              <ProgressRow key={g.key} name={g.label} value={short(g.value)}
                right={`${totalAssets > 0 ? Math.round(g.value / totalAssets * 100) : 0}%`}
                pct={totalAssets > 0 ? g.value / totalAssets * 100 : 0} color={g.color} />
            ))}
          </section>
        </div>

        <div className="max-md:order-3 grid grid-cols-2 lg:grid-cols-4 gap-2.5 md:gap-3.5">
          <KpiTile label="Assets" value={short(totalAssets)} delta={`${short(investedNow)} invested · ${short(cash)} in bank`} tint={1} icon={Wallet} href="/dashboard/investments" />
          <KpiTile label="Liabilities" value={short(totalLiab)} delta={totalLiab > 0 ? `${liabRows.filter(r => r.value > 0).map(r => r.label.toLowerCase()).join(' and ')}` : 'Debt-free'} tint={2} icon={Landmark} />
          <KpiTile label="Debt / assets" value={`${debtRatio}%`} delta="Target under 30%" tint={3} icon={Scale}
            tone={debtRatio < 30 ? 'good' : debtRatio < 50 ? 'neutral' : 'bad'} />
          <KpiTile label="Investment gain" value={`${gain >= 0 ? '+' : '−'}${short(Math.abs(gain))}`} tint={0} icon={TrendingUp}
            tone={gain >= 0 ? 'good' : 'bad'} delta={`${gainPct >= 0 ? '+' : ''}${gainPct}% on ${short(putIn)} put in`} />
        </div>

        <ListCard className="max-md:order-7" title="Assets & liabilities" sub="Cash and fixed income are held at cost · tap a row to manage it"
          head={['Holding', 'Type', 'Return', 'Value']}>
          {[...assetRows].filter(r => r.value > 0).sort((a, b) => b.value - a.value).map(r => {
            const g = r.value - r.invested
            const gp = r.invested > 0 && Math.abs(g) >= 1 ? Math.round(g / r.invested * 1000) / 10 : null
            return (
              <ListRow key={r.key} color={r.color} title={r.label} tag={groupLabel(r.group)}
                sub={r.invested !== r.value ? `${short(r.invested)} put in` : undefined}
                meta={gp == null ? 'at cost' : `${gp >= 0 ? '+' : ''}${gp}%`} metaColor={gp == null ? undefined : gp >= 0 ? '#16A34A' : '#DC2626'}
                amount={money(r.value)} amountSub={`${totalAssets > 0 ? Math.round(r.value / totalAssets * 100) : 0}% of assets`}
                href={HREF[r.key]} />
            )
          })}
          {liabRows.filter(r => r.value > 0).map(r => (
            <ListRow key={r.key} color={r.color} title={r.label} tag="Liability" meta="—"
              amount={`−${money(r.value)}`} amountColor="#DC2626"
              amountSub={`${totalLiab > 0 ? Math.round(r.value / totalLiab * 100) : 0}% of debt`} href={HREF[r.key]} />
          ))}
        </ListCard>
      </>)}

      <div className="max-md:order-8"><LearnStrip title="What net worth really tells you" href="/dashboard/learn" /></div>
    </div>
  )
}
