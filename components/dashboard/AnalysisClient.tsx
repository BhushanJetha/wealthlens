'use client'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { Wallet, Gauge, CalendarRange, History } from 'lucide-react'
import { useViewStore } from '@/store/viewStore'
import { useUiStore } from '@/store/uiStore'
import { isSpend, catOf, labelOf } from '@/lib/money'
import { addMonths, daysInMonth, localToday } from '@/lib/insights'
import { fmtMoney, fmtCompact } from '@/lib/format'
import { PageHeader, KpiTile, Bars, Ring, Segmented, EmptyState, PALETTE, PALETTE_BG, type Tone } from '@/components/ui/kit'

const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const monLabel = (ym: string, year = false) => `${MON[Number(ym.slice(5)) - 1]}${year ? ` ${ym.slice(0, 4)}` : ''}`

// Spending analysis (design v2): budget vs actual, pace, comparisons, movers,
// big purchases. "Spend" uses the shared rule in lib/money (same as Home).
export default function AnalysisClient({ transactions, budgets }: { transactions: any[]; budgets: any[] }) {
  const { view, toMonth, fxRate: FX } = useViewStore()
  const { openAdvisor } = useUiStore()
  const [cmp, setCmp] = useState<'lm' | 'ly'>('lm')
  const [today, setToday] = useState('')
  useEffect(() => { setToday(localToday()) }, [])

  const cur = view === 'uae' ? 'AED' : 'INR'
  const money = (n: number) => fmtMoney(n, cur)
  const short = (n: number) => fmtCompact(n, cur)
  const inView = (c: string) => view === 'consolidated' || (view === 'uae' ? c === 'AED' : c !== 'AED')
  const conv = (n: number, c: string) => view === 'consolidated' && c === 'AED' ? n * FX : n

  const thisMonth = (today || new Date().toISOString()).slice(0, 7)
  const focus = toMonth > thisMonth ? thisMonth : toMonth
  const isCurrent = focus === thisMonth
  const dim = daysInMonth(focus)
  const dayCut = isCurrent && today ? Number(today.slice(8, 10)) : dim
  const lm = addMonths(focus, -1), ly = addMonths(focus, -12)
  const cmpMonth = cmp === 'lm' ? lm : ly
  const cmpLabel = cmp === 'lm' ? 'last month' : monLabel(ly, true)

  const spend = useMemo(() => transactions.filter(t => isSpend(t) && inView(t.currency)), [transactions, view])

  // Category totals for a month, up to day `cut` (same-point comparisons)
  const byCat = (m: string, cut = 31) => {
    const out: Record<string, number> = {}
    spend.forEach(t => {
      if (t.txn_date?.slice(0, 7) !== m || Number(t.txn_date.slice(8, 10)) > cut) return
      const c = catOf(t); out[c] = (out[c] ?? 0) + conv(Number(t.amount), t.currency)
    })
    return out
  }
  const sum = (o: Record<string, number>) => Object.values(o).reduce((a, v) => a + v, 0)
  const data = useMemo(() => {
    const now = byCat(focus, dayCut)
    const lmSame = byCat(lm, Math.min(dayCut, daysInMonth(lm)))
    const lmFull = byCat(lm)
    const lySame = byCat(ly, Math.min(dayCut, daysInMonth(ly)))
    return { now, lmSame, lmFull, lySame, cmpSame: cmp === 'lm' ? lmSame : lySame }
  }, [spend, focus, dayCut, lm, ly, cmp, view, FX])

  const T = sum(data.now), LMs = sum(data.lmSame), LMf = sum(data.lmFull), LYs = sum(data.lySame), CMPs = sum(data.cmpSame)
  const budgetRows = budgets.filter(b => b.month_year === focus && inView(b.currency ?? 'INR'))
  const budgetBy: Record<string, number> = {}
  budgetRows.forEach(b => { budgetBy[b.category] = (budgetBy[b.category] ?? 0) + conv(Number(b.monthly_cap), b.currency ?? 'INR') })
  const B = sum(budgetBy)
  // Budget figures compare only the categories that have a budget; spending
  // elsewhere (rent, transfers…) is called out separately, not counted as "over".
  const inBudget = (o: Record<string, number>) => Object.keys(budgetBy).reduce((a, c) => a + (o[c] ?? 0), 0)
  const Tb = inBudget(data.now)
  const outside = T - Tb
  const used = B > 0 ? Tb / B * 100 : null
  const left = B - Tb
  const daysLeft = isCurrent ? dim - dayCut : 0
  // Projected finish: spent so far + what last month's remaining days cost
  // (handles rent on the 1st better than straight-line extrapolation)
  const project = (now: number, lmSame: number, lmFull: number) =>
    !isCurrent ? now : lmFull > 0 ? now + Math.max(lmFull - lmSame, 0) : dayCut > 0 ? now / dayCut * dim : now
  const projected = project(T, LMs, LMf)
  const projectedB = project(Tb, inBudget(data.lmSame), inBudget(data.lmFull))
  // Budget pace on the cumulative chart only means something when budgets
  // cover (nearly) all spending
  const paceComparable = B > 0 && T > 0 && Tb >= T * 0.9
  const pct = (a: number, b: number) => b > 0 ? Math.round((a - b) / b * 1000) / 10 : null
  const vsLm = pct(T, LMs), vsLy = pct(T, LYs)
  const overCats = Object.keys(budgetBy).filter(c => (data.now[c] ?? 0) > budgetBy[c])

  // Category order follows this month's spend; colour follows the category
  const cats = Object.keys({ ...data.now, ...budgetBy }).sort((a, b) => (data.now[b] ?? 0) - (data.now[a] ?? 0))
  const colorOf = (c: string) => PALETTE[Math.max(cats.indexOf(c), 0) % PALETTE.length]
  const bgOf = (c: string) => PALETTE_BG[Math.max(cats.indexOf(c), 0) % PALETTE_BG.length]

  const movers = Array.from(new Set([...Object.keys(data.now), ...Object.keys(data.cmpSame)]))
    .map(c => ({ c, from: data.cmpSame[c] ?? 0, to: data.now[c] ?? 0 }))
    .map(r => ({ ...r, diff: r.to - r.from, p: pct(r.to, r.from) }))
    .filter(r => Math.abs(r.diff) >= 1).sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff)).slice(0, 6)

  const big = spend.filter(t => t.txn_date?.slice(0, 7) === focus && Number(t.txn_date.slice(8, 10)) <= dayCut)
    .map(t => ({ ...t, v: conv(Number(t.amount), t.currency) })).sort((a, b) => b.v - a.v).slice(0, 3)
  const bigSum = big.reduce((a, t) => a + t.v, 0)

  // Cumulative spend by day: this month, last month, budget pace, projection
  const cumul = useMemo(() => {
    const daily = (m: string) => {
      const d = Array(32).fill(0)
      spend.forEach(t => { if (t.txn_date?.slice(0, 7) === m) d[Number(t.txn_date.slice(8, 10))] += conv(Number(t.amount), t.currency) })
      return d
    }
    const a = daily(focus), b = daily(lm)
    let ca = 0, cb = 0
    return Array.from({ length: dim }, (_, i) => {
      const day = i + 1
      ca += a[day]; cb += b[day]
      return {
        day,
        now: day <= dayCut ? Math.round(ca) : null,
        last: day <= daysInMonth(lm) ? Math.round(cb) : null,
        pace: paceComparable ? Math.round(B * day / dim) : null,
        proj: isCurrent && day >= dayCut ? Math.round(T + (projected - T) * (day - dayCut) / Math.max(dim - dayCut, 1)) : null,
      }
    })
  }, [spend, focus, lm, dim, dayCut, B, paceComparable, isCurrent, T, projected, view, FX])

  const toneOf = (p: number | null): Tone => p == null ? 'neutral' : p > 0 ? 'bad' : 'good'
  const fmtPct = (p: number | null) => p == null ? '—' : `${p > 0 ? '+' : ''}${p}%`
  const gaugeColor = used == null ? 'var(--accent)' : used > 100 ? '#E4573D' : used >= 80 ? '#F29A2E' : '#2FB67C'

  const insights: { t: string; c: string; bg: string; ic: string }[] = []
  overCats.forEach(c => insights.push({ ic: '!', c: '#D9482F', bg: '#FDECE8', t: `${labelOf(c)} is over budget by ${short((data.now[c] ?? 0) - budgetBy[c])} (${Math.round((data.now[c] ?? 0) / budgetBy[c] * 100)}% used).` }))
  const up = movers.find(m => m.diff > 0), down = movers.find(m => m.diff < 0)
  const when = cmp === 'lm' ? 'last month' : `in ${cmpLabel}`
  if (up) insights.push({ ic: '↑', c: '#B96A0B', bg: '#FFF2E2', t: up.p != null
    ? `${labelOf(up.c)} is up ${up.p}% vs ${cmpLabel} at the same point (+${short(up.diff)}).`
    : `${labelOf(up.c)} is new this month (+${short(up.diff)}); there was none by this point ${when}.` })
  if (down) insights.push({ ic: '↓', c: '#1E8F5F', bg: '#E7F7EF', t: down.to === 0
    ? `Nothing on ${labelOf(down.c)} yet, against ${short(down.from)} by this point ${when}.`
    : `${labelOf(down.c)} is down ${Math.abs(down.p ?? 0)}% vs ${cmpLabel} (−${short(Math.abs(down.diff))}).` })
  if (B > 0 && outside > T * 0.1) {
    const top = cats.filter(c => !budgetBy[c] && (data.now[c] ?? 0) > 0).slice(0, 2).map(labelOf)
    insights.push({ ic: '?', c: '#64748B', bg: '#F1F5F9', t: `${short(outside)} (${Math.round(outside / T * 100)}%) of this month's spending has no budget${top.length ? ` — mostly ${top.join(' and ')}` : ''}. Add budgets there to track it.` })
  }
  if (isCurrent && B > 0 && left > 0 && daysLeft > 0) insights.push({ ic: '✓', c: '#5640D6', bg: '#F0EDFF', t: `You can spend about ${short(left / daysLeft)} a day for the rest of ${monLabel(focus)} and stay within budget.` })
  if (big.length && T > 0) insights.push({ ic: '◔', c: '#3B8EF0', bg: '#E7F1FE', t: `Your ${big.length} biggest purchase${big.length === 1 ? ' is' : 's are'} ${Math.round(bigSum / T * 100)}% of this month's spending.` })
  if (!B) insights.push({ ic: '+', c: '#5640D6', bg: '#F0EDFF', t: 'No budgets set for this month — add a few on Budgets to see pace and safe-to-spend.' })

  const aiContext = `Spending for ${monLabel(focus, true)}${isCurrent ? ` up to day ${dayCut} of ${dim}` : ''} (${view}): ${money(T)} in total`
    + (B ? `; budgeted categories ${money(Tb)} of ${money(B)} (${Math.round(used!)}%), ${money(outside)} outside budgets. ` : ', no budget set. ')
    + `Vs last month at the same point ${fmtPct(vsLm)}; vs ${monLabel(ly, true)} ${fmtPct(vsLy)}. Projected finish ${money(projected)}. `
    + `By category: ${cats.slice(0, 8).map(c => `${labelOf(c)} ${short(data.now[c] ?? 0)}${budgetBy[c] ? ` of ${short(budgetBy[c])}` : ''}`).join(', ')}. `
    + `Biggest purchases: ${big.map(t => `${t.merchant} ${short(t.v)}`).join(', ') || 'none'}.`

  const compare = (
    <Segmented violet label="Compare with" value={cmp} onChange={setCmp}
      options={[{ value: 'lm', label: 'vs last month' }, { value: 'ly', label: 'vs same month last year' }]} />
  )

  if (T === 0 && B === 0) return (
    <div className="flex flex-col gap-3.5 md:gap-[18px] animate-fade-up">
      <PageHeader title="Spending analysis" sub={monLabel(focus, true)} />
      <EmptyState message={`No spending recorded for ${monLabel(focus, true)} yet. Import a statement or add transactions, and set a few budgets to see your pace.`} />
    </div>
  )

  return (
    <div className="flex flex-col gap-3.5 md:gap-[18px] animate-fade-up">
      <div className="max-md:order-1 flex flex-col md:flex-row md:items-end md:justify-between gap-3">
        <PageHeader title="Spending analysis"
          sub={`${monLabel(focus, true)}${isCurrent ? ` · day ${dayCut} of ${dim}` : ''} · against budget, last month and ${monLabel(ly, true)}`} />
        <div className="hidden md:flex items-center gap-2.5 flex-shrink-0">
          <span className="text-[12px]" style={{ color: 'var(--text3)' }}>Compare with</span>{compare}
        </div>
        <div className="md:hidden overflow-x-auto no-scrollbar -mx-4 px-4">{compare}</div>
      </div>

      <div className="max-md:order-2 grid grid-cols-2 lg:grid-cols-4 gap-2.5 md:gap-3.5">
        <KpiTile label={isCurrent ? 'Spent so far' : 'Spent'} value={money(T)} tint={0} icon={Wallet}
          delta={!B ? 'No budget set' : outside > 0 ? `${money(outside)} outside budgets` : `of ${money(B)} budget`} />
        <KpiTile label="Budget used" value={used == null ? '—' : `${Math.round(used)}%`} tint={1} icon={Gauge}
          delta={used == null ? 'Set budgets to track' : `${money(Math.abs(left))} ${left >= 0 ? 'left' : 'over'}${overCats.length ? ` · ${overCats.length} categor${overCats.length === 1 ? 'y' : 'ies'} over` : ''}`}
          tone={used == null ? 'neutral' : used > 100 ? 'bad' : 'good'} />
        <KpiTile label="vs last month" value={fmtPct(vsLm)} delta={LMs > 0 ? `${money(LMs)} at the same point` : 'No data'} tone={toneOf(vsLm)} tint={2} icon={CalendarRange} />
        <KpiTile label={`vs ${monLabel(ly, true)}`} value={fmtPct(vsLy)} delta={LYs > 0 ? `${money(LYs)} at the same point` : 'No data'} tone={toneOf(vsLy)} tint={3} icon={History} />
      </div>

      {/* Budget vs actual + budget used */}
      <div className="max-md:contents grid grid-cols-1 lg:grid-cols-[1.5fr_1fr] gap-4 items-start">
        <section className="wl-card max-md:order-4 px-4 md:px-6 py-4 md:py-5 flex flex-col gap-3 md:gap-3.5">
          <div className="flex justify-between items-center gap-2">
            <h2 className="text-[14px] md:text-[15px] font-semibold" style={{ color: 'var(--text)' }}>Budget vs actual</h2>
            <span className="text-[12px]" style={{ color: 'var(--text3)' }}><i className="inline-block w-[9px] h-[9px] rounded-[3px] mr-1.5" style={{ background: '#E4573D' }} />Over budget</span>
          </div>
          {Object.keys(budgetBy).length === 0 ? (
            <div className="text-[13px] py-4" style={{ color: 'var(--text3)' }}>
              No budgets for {monLabel(focus, true)}. <Link href="/dashboard/budgets" className="font-semibold" style={{ color: 'var(--accent)' }}>Set budgets →</Link>
            </div>
          ) : cats.filter(c => budgetBy[c]).map(c => {
            const sp = data.now[c] ?? 0, bu = budgetBy[c], p = sp / bu * 100, over = sp > bu
            return (
              <div key={c} className="flex gap-3 items-center">
                <span className="w-[34px] h-[34px] md:w-[38px] md:h-[38px] rounded-[11px] flex items-center justify-center flex-shrink-0 text-[15px] font-bold" style={{ background: bgOf(c), color: colorOf(c) }}>{labelOf(c)[0]}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between gap-2 text-[12.5px] md:text-[13px] mb-[5px]">
                    <span className="font-semibold truncate" style={{ color: 'var(--text)' }}>{labelOf(c)}
                      {over && <span className="ml-1.5 rounded-full px-1.5 py-px text-[10px] font-bold" style={{ background: '#FDECE8', color: '#D9482F' }}>OVER</span>}</span>
                    <span className="tabular-nums whitespace-nowrap" style={{ color: 'var(--text)' }}>{short(sp)} <span style={{ color: 'var(--text4)' }}>/ {short(bu)}</span></span>
                  </div>
                  <div className="h-2 rounded-full" style={{ background: 'var(--track)' }} role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(Math.min(p, 100))} aria-label={`${labelOf(c)} budget used`}>
                    <div className="h-full rounded-full wl-grow" style={{ width: `${Math.min(p, 100)}%`, background: over ? '#E4573D' : p >= 80 ? '#F29A2E' : 'var(--accent)' }} />
                  </div>
                </div>
              </div>
            )
          })}
        </section>

        <section className="wl-card max-md:order-3 px-4 md:px-6 py-4 md:py-5 flex md:flex-col gap-4 md:gap-3.5 items-center">
          <h2 className="hidden md:block text-[15px] font-semibold self-start" style={{ color: 'var(--text)' }}>Budget used</h2>
          <div className="md:hidden"><Ring pct={used ?? 0} size={92} stroke={3.8} color={gaugeColor} track="var(--track)" label="Budget used"><span className="text-[20px] font-bold">{used == null ? '—' : `${Math.round(used)}%`}</span></Ring></div>
          <div className="hidden md:block"><Ring pct={used ?? 0} size={150} stroke={3.6} color={gaugeColor} track="var(--track)" label="Budget used">
            <span className="text-[28px] font-bold leading-none">{used == null ? '—' : `${Math.round(used)}%`}</span>
            <span className="text-[11px] mt-0.5" style={{ color: 'var(--text3)' }}>{isCurrent ? `${daysLeft} day${daysLeft === 1 ? '' : 's'} left` : 'month closed'}</span>
          </Ring></div>
          <div className="flex-1 md:w-full flex flex-col gap-1.5 md:gap-2">
            {[
              isCurrent && B > 0 && left > 0 && daysLeft > 0 ? ['Safe to spend / day', short(left / daysLeft)] : null,
              B > 0 ? [isCurrent ? 'Projected (budgeted)' : 'Budgeted spend', `${short(projectedB)} / ${short(B)}`] : [isCurrent ? 'Projected finish' : 'Month total', short(projected)],
              B > 0 && outside > 0 ? ['Outside budgets', short(outside)] : null,
              isCurrent ? ['Days left', String(daysLeft)] : null,
            ].filter(Boolean).map(r => (
              <div key={r![0]} className="flex justify-between gap-2 text-[12px] md:text-[13px] md:px-3 md:py-[9px] md:rounded-[11px] md:bg-[#F7F6FD]">
                <span style={{ color: 'var(--text3)' }}>{r![0]}</span><b className="tabular-nums" style={{ color: 'var(--text)' }}>{r![1]}</b>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* This period vs comparison + what changed */}
      <div className="max-md:contents grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-4 items-start">
        <section className="wl-card max-md:hidden px-6 py-5">
          <div className="flex justify-between items-center gap-3">
            <h2 className="text-[15px] font-semibold" style={{ color: 'var(--text)' }}>{monLabel(focus)} vs {cmpLabel}</h2>
            <div className="flex gap-3.5 text-[12px]" style={{ color: 'var(--text3)' }}>
              <span><i className="inline-block w-[9px] h-[9px] rounded-[3px] mr-1.5" style={{ background: 'var(--accent)' }} />{monLabel(focus)}</span>
              <span><i className="inline-block w-[9px] h-[9px] rounded-[3px] mr-1.5" style={{ background: '#C9C2F5' }} />{cmpLabel}</span>
            </div>
          </div>
          <Bars className="h-[210px] mt-4"
            data={cats.slice(0, 7).map(c => ({ label: labelOf(c).split(' ')[0], value: data.now[c] ?? 0, before: data.cmpSame[c] ?? 0,
              tip: `${labelOf(c)}: ${short(data.now[c] ?? 0)} vs ${short(data.cmpSame[c] ?? 0)}` }))}
            label={`Spending by category, ${monLabel(focus)} vs ${cmpLabel}`} />
        </section>

        <section className="wl-card max-md:order-5 px-4 md:px-[22px] py-4 md:py-5">
          <h2 className="text-[14px] md:text-[15px] font-semibold" style={{ color: 'var(--text)' }}>What changed</h2>
          <div className="text-[12px] mb-1" style={{ color: 'var(--text4)' }}>Biggest movers vs {cmpLabel}, same point in the month</div>
          {movers.length === 0 ? <div className="text-[12.5px] py-4" style={{ color: 'var(--text3)' }}>No comparison data yet.</div> : movers.map(r => {
            const col = r.diff > 0 ? '#D9482F' : '#1E8F5F'
            return (
              <div key={r.c} className="flex gap-2.5 items-center py-[9px]" style={{ borderTop: '1px solid var(--track)' }}>
                <span className="w-8 h-8 rounded-[10px] flex items-center justify-center flex-shrink-0 text-[14px] font-bold" style={{ background: bgOf(r.c), color: colorOf(r.c) }}>{labelOf(r.c)[0]}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-semibold truncate" style={{ color: 'var(--text)' }}>{labelOf(r.c)}</div>
                  <div className="text-[11.5px]" style={{ color: 'var(--text4)' }}>{short(r.from)} → {short(r.to)}</div>
                </div>
                <div className="text-right">
                  <div className="text-[13px] font-bold" style={{ color: col }}>{r.p == null ? 'new' : `${r.p > 0 ? '+' : ''}${r.p}%`}</div>
                  <div className="text-[11.5px]" style={{ color: col }}>{r.diff > 0 ? '+' : '−'}{short(Math.abs(r.diff))}</div>
                </div>
              </div>
            )
          })}
        </section>
      </div>

      {/* Cumulative spend + big purchases */}
      <div className="max-md:contents grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-4 items-start">
        <section className="wl-card max-md:order-6 px-4 md:px-6 py-4 md:py-5">
          <div className="flex justify-between items-center gap-3 flex-wrap">
            <h2 className="text-[14px] md:text-[15px] font-semibold" style={{ color: 'var(--text)' }}>Cumulative spend</h2>
            <div className="flex gap-3.5 text-[11.5px] md:text-[12px] flex-wrap" style={{ color: 'var(--text3)' }}>
              <span><i className="inline-block w-3.5 h-[2.5px] mr-1.5 align-middle" style={{ background: 'var(--accent)' }} />{monLabel(focus)}</span>
              <span><i className="inline-block w-3.5 mr-1.5 align-middle" style={{ borderTop: '2px dashed #94A3B8' }} />{monLabel(lm)}</span>
              {paceComparable && <span><i className="inline-block w-3.5 mr-1.5 align-middle" style={{ borderTop: '2px dotted #2FB67C' }} />Budget pace</span>}
            </div>
          </div>
          <div className="h-[140px] md:h-[230px] mt-3 -mx-1" aria-label={`Cumulative spend: ${money(T)} by day ${dayCut}${B ? `, budget ${money(B)}` : ''}, projected ${money(projected)}`}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={cumul} margin={{ top: 4, right: 6, bottom: 0, left: 6 }}>
                <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#94A3B8' }} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={24} />
                <YAxis hide domain={[0, 'dataMax']} />
                <Tooltip contentStyle={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 10, fontSize: 12, padding: '6px 10px' }}
                  labelFormatter={(d: any) => `Day ${d}`}
                  formatter={(v: any, k: any) => [money(Number(v)), k === 'now' ? monLabel(focus) : k === 'last' ? monLabel(lm) : k === 'pace' ? 'Budget pace' : 'Projected']} />
                {paceComparable && <Line dataKey="pace" stroke="#2FB67C" strokeWidth={2} strokeDasharray="1 5" strokeLinecap="round" dot={false} isAnimationActive={false} />}
                <Line dataKey="last" stroke="#94A3B8" strokeWidth={1.8} strokeDasharray="5 4" dot={false} isAnimationActive={false} />
                {isCurrent && <Line dataKey="proj" stroke="#6A55E8" strokeWidth={2.2} strokeDasharray="2 5" strokeLinecap="round" dot={false} isAnimationActive={false} />}
                <Line dataKey="now" stroke="#6A55E8" strokeWidth={3} strokeLinecap="round" dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="text-[12px] md:text-[12.5px] leading-snug mt-2.5 rounded-[11px] px-3.5 py-2.5" style={{ color: '#475569', background: '#F7F6FD' }}>
            {isCurrent
              ? `At this pace you'll finish near ${short(projected)}. Last month you spent ${short(LMf)} in total.${B ? ` Budgeted categories are heading for ${short(projectedB)} of ${short(B)}.` : ''}`
              : `You spent ${short(T)} in ${monLabel(focus, true)}.${B ? ` Budgeted categories: ${short(Tb)} of ${short(B)}.` : ''}`}
          </div>
        </section>

        <section className="wl-card max-md:order-7 px-4 md:px-[22px] py-4 md:py-5">
          <div className="flex justify-between items-baseline gap-2">
            <h2 className="text-[14px] md:text-[15px] font-semibold" style={{ color: 'var(--text)' }}>Big purchases</h2>
            <span className="text-[11.5px] md:text-[12px]" style={{ color: 'var(--text3)' }}>{big.length ? `${short(bigSum)} · ${T > 0 ? Math.round(bigSum / T * 100) : 0}% of spend` : ''}</span>
          </div>
          {big.length === 0 ? <div className="text-[12.5px] py-4" style={{ color: 'var(--text3)' }}>No purchases yet this month.</div> : big.map(t => {
            const c = catOf(t)
            return (
              <div key={t.id} className="flex gap-3 items-center py-[11px]" style={{ borderTop: '1px solid var(--track)' }}>
                <span className="w-[38px] h-[38px] rounded-[11px] flex items-center justify-center flex-shrink-0 text-[16px] font-bold" style={{ background: bgOf(c), color: colorOf(c) }}>{labelOf(c)[0]}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-[13.5px] font-semibold truncate" style={{ color: 'var(--text)' }}>{t.merchant}</div>
                  <div className="text-[11.5px] truncate" style={{ color: 'var(--text4)' }}>{labelOf(c)} · {Number(t.txn_date.slice(8, 10))} {monLabel(focus)}</div>
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="text-[14px] font-bold tabular-nums" style={{ color: 'var(--text)' }}>{short(t.v)}</div>
                  <div className="text-[11.5px]" style={{ color: 'var(--text3)' }}>{T > 0 ? Math.round(t.v / T * 100) : 0}% of spend</div>
                </div>
              </div>
            )
          })}
          {big.length > 0 && T > bigSum && (
            <div className="text-[12px] md:text-[12.5px] leading-normal rounded-[11px] px-3.5 py-2.5 mt-1.5" style={{ color: '#475569', background: '#FFF2E2' }}>
              Without these, you spent {short(T - bigSum)} — your everyday spending.
            </div>
          )}
        </section>
      </div>

      {/* Insights */}
      <section className="max-md:order-8 rounded-[20px] bg-ai px-4 md:px-[26px] py-4 md:py-[22px]" style={{ border: '1px solid #E1DAFF' }}>
        <div className="flex justify-between items-center gap-5">
          <div>
            <div className="text-[10.5px] md:text-[11px] font-semibold uppercase tracking-[0.06em]" style={{ color: 'var(--accent2)' }}>✦ Insights</div>
            <div className="hidden md:block text-[18px] font-bold mt-0.5" style={{ color: 'var(--text)' }}>What your spending is telling you</div>
          </div>
          <button onClick={() => openAdvisor(`Analyse my spending and tell me the one change that matters most. ${aiContext}`)}
            className="hidden md:block flex-shrink-0 rounded-full px-5 py-2.5 text-[13px] font-semibold text-white" style={{ background: 'var(--accent)' }}>
            ✦ Analyse my spending
          </button>
        </div>
        <div className="mt-2.5">
          {insights.map((x, i) => (
            <div key={i} className="flex gap-3 items-start py-2.5" style={{ borderTop: '1px solid rgba(106,85,232,.12)' }}>
              <span className="w-7 h-7 rounded-[9px] flex items-center justify-center flex-shrink-0 text-[13px] font-bold" style={{ background: x.bg, color: x.c }}>{x.ic}</span>
              <div className="text-[13px] leading-normal" style={{ color: 'var(--text2)' }}>{x.t}</div>
            </div>
          ))}
        </div>
        <button onClick={() => openAdvisor(`Analyse my spending and tell me the one change that matters most. ${aiContext}`)}
          className="md:hidden w-full mt-2.5 h-11 rounded-xl text-[13.5px] font-semibold text-white" style={{ background: 'var(--accent)' }}>
          ✦ Analyse my spending
        </button>
      </section>
    </div>
  )
}
