'use client'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { fmtMoney, fmtCompact } from '@/lib/format'
import { GROUPS } from '@/lib/categories'
import { viewTrends, smoothPath, smoothBack, niceStep, type Trends, type ViewSeries } from '@/lib/homeTrends'
import { MON, MONTH, mLabel, sumOf, pctChange as pct, windowOf, periodLabel, periodWord as pWord } from '@/lib/period'
import { usePeriod, monthsNeeded, PeriodLine, TrendTile, GOOD, BAD, NONE, useHover, chg, Tooltip, LegendChip, Axis, Labels, Dot, type Pt, type Period } from './charts/parts'

type View = 'uae' | 'india' | 'consolidated'

// Home, top half: what came in, went out, was saved and invested, loans and
// net worth, for the period picked — six tiles, money flows, where the
// spending went, and what you own against what you owe.
export default function HomeTrends({ view, fx, today, live, holderNote, side }: {
  view: View; fx: number; today: string
  live: { nw: number; own: number; owe: number }   // today's figures, if the snapshot isn't in yet
  holderNote: string | null; side?: React.ReactNode
}) {
  const cur = view === 'uae' ? 'AED' : 'INR'
  const money = (n: number) => fmtMoney(n, cur), short = (n: number) => fmtCompact(n, cur)
  const now = today.slice(0, 7)
  const per = usePeriod()
  const [mode, setMode] = useState<'month' | 'year'>('month')
  const [data, setData] = useState<Trends | null>(null)
  const [failed, setFailed] = useState(false)
  // 25 months covers a year and the year before it; two years and year on year need five
  const need = mode === 'year' || monthsNeeded(per, now) > 25 ? 60 : 25
  useEffect(() => {
    if (data && data.months.length >= need) return
    let off = false
    setFailed(false)
    fetch(`/api/home/trends?months=${need}`).then(r => (r.ok ? r.json() : Promise.reject())).then(d => { if (!off) setData(d) }, () => { if (!off) setFailed(true) })
    return () => { off = true }
  }, [need]) // eslint-disable-line react-hooks/exhaustive-deps

  const v = useMemo(() => (data ? viewTrends(data, view, fx) : null), [data, view, fx])
  if (!data || !v) return (
    <div className="flex flex-col gap-3.5 md:gap-[18px]">
      {failed ? <div className="wl-card px-5 py-6 text-[13px]" style={{ color: 'var(--text3)' }}>Your trends couldn’t load just now. <button onClick={() => setData(null)} className="font-semibold underline" style={{ color: 'var(--accent)' }}>Try again</button></div>
        : <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">{Array.from({ length: 6 }, (_, i) => <div key={i} className="wl-card h-[148px] animate-pulse" style={{ background: '#FAFAFE' }} />)}</div>}
    </div>
  )
  return <Body {...{ data, v, view, per, mode, setMode, money, short, now, today, live, holderNote, side, cur }} />
}

function Body({ data, v, view, per, mode, setMode, money, short, now, today, live, holderNote, side, cur }: {
  data: Trends; v: ViewSeries; view: View; per: Period; mode: 'month' | 'year'; setMode: (m: 'month' | 'year') => void
  money: (n: number) => string; short: (n: number) => string; now: string; today: string; live: { nw: number; own: number; owe: number }; holderNote: string | null; side?: React.ReactNode; cur: string
}) {
  const M = data.months
  const w = windowOf(M, per.from, per.to, now, per.compare)
  const { a, b, len, pa, pb, hasPrev, isNow } = w
  const partial = per.from === per.to && per.to === now
  // Today's live figures stand in for this month when its snapshot isn't saved yet
  const nwAt = (i: number) => v.nw[i] ?? (M[i] === now ? live.nw : null)
  const ownAt = (i: number) => v.own[i] ?? (M[i] === now ? live.own : null)
  const c = { inc: sumOf(v.income, a, b), sp: sumOf(v.spent, a, b), em: sumOf(v.emi, a, b), iv: sumOf(v.invested, a, b), sv: sumOf(v.saved, a, b) }
  const p = hasPrev ? { inc: sumOf(v.income, pa, pb), sp: sumOf(v.spent, pa, pb), iv: sumOf(v.invested, pa, pb), sv: sumOf(v.saved, pa, pb) } : null
  const delta = (cv: number, pv: number | undefined, upGood: boolean) => {
    if (partial) return { t: `${Number(today.slice(8, 10))} days in`, s: NONE }
    if (pv == null || !pv) return { t: '—', s: NONE }
    const d = pct(cv, pv), up = d >= 0
    return { t: `${up ? '▲' : '▼'} ${Math.abs(d).toFixed(0)}%`, s: up === upGood ? GOOD : BAD }
  }
  const before = a > 0 ? a - 1 : null
  const nwEnd = nwAt(b), nwStart = before != null ? nwAt(before) : null
  const lnEnd = v.loans[b], lnStart = before != null ? v.loans[before] : null
  const periodWord = pWord(per.period, per.to, per.from)

  // The months shown in the charts: the period (at least six months)
  const win = w.chart
  const kpis = [
    { label: 'Income', color: '#6A55E8', value: short(c.inc), sub: len > 1 ? `About ${short(c.inc / len)} a month` : 'Salary and other income', d: delta(c.inc, p?.inc, true), spark: win.map(i => v.income[i]), href: '/dashboard/income' },
    { label: 'Spent', color: '#F29A2E', value: short(c.sp), sub: `+ ${short(c.em)} in EMIs`, d: delta(c.sp, p?.sp, false), spark: win.map(i => v.spent[i]), href: '/dashboard/expenses/report' },
    { label: 'Saved', color: '#0F766E', value: short(c.sv), sub: c.inc > 0 ? `${Math.round(c.sv / c.inc * 100)}% of income` : 'No income yet', d: delta(c.sv, p?.sv, true), spark: win.map(i => v.saved[i]), href: '/dashboard/reports',
      how: { rows: [['Came in', money(c.inc)], ['− Spent', money(c.sp)], ['− Loan EMIs', money(c.em)]] as [string, string][], total: ['= Saved', money(c.sv)] as [string, string],
        note: `Investing counts as saving: what went into funds, deposits and shares is part of it. ${view === 'india' ? 'Money arriving from the UAE counts as income in this view. ' : ''}Left out on purpose: card bills (the spending was counted when you used the card), moves between your own accounts, and refunds (they lower Spent; they aren’t income).` } },
    { label: 'Invested', color: '#16A34A', value: short(c.iv), sub: 'SIPs, RDs, shares and more', d: delta(c.iv, p?.iv, true), spark: win.map(i => v.invested[i]), href: '/dashboard/investments' },
    { label: 'Loans left', color: '#DC2626', value: short(lnEnd), sub: lnStart != null && lnStart > 0 ? `${lnEnd <= lnStart ? 'Paid down' : 'Up by'} ${short(Math.abs(lnEnd - lnStart))} ${periodWord}` : lnEnd > 0 ? 'Still to repay' : 'No loans',
      d: lnStart ? { t: `${lnEnd <= lnStart ? '▼' : '▲'} ${Math.abs(pct(lnEnd, lnStart)).toFixed(1)}%`, s: lnEnd <= lnStart ? GOOD : BAD } : { t: '—', s: NONE }, spark: win.map(i => v.loans[i]), href: '/dashboard/loans' },
    { label: 'Net worth', color: '#4B3BC4', how: nwEnd != null ? { rows: [['What you own', money(ownAt(b) ?? 0)], ['− What you owe', money(v.owe[b] ?? (M[b] === now ? live.owe : 0))]] as [string, string][], total: ['= Net worth', money(nwEnd)] as [string, string],
        note: 'Owned: bank and cash, investments at today’s prices, property at the value you set. Owed: loans and card balances. A builder payment still to come isn’t taken off: it’s money you’ll pay, not money you owe the bank.' } : undefined, value: nwEnd != null ? short(nwEnd) : '—', sub: nwEnd != null && nwStart != null ? `${nwEnd >= nwStart ? '+' : '−'}${short(Math.abs(nwEnd - nwStart))} ${periodWord}` : nwEnd != null ? 'History builds from your first visits' : 'Not tracked for this month',
      d: nwEnd != null && nwStart ? { t: `${nwEnd >= nwStart ? '▲' : '▼'} ${Math.abs(pct(nwEnd, nwStart)).toFixed(1)}%`, s: nwEnd >= nwStart ? GOOD : BAD } : { t: '—', s: NONE }, spark: win.map(i => nwAt(i) ?? NaN), href: '/dashboard/net-worth' },
  ]

  // Chart points: the months, or calendar years (full ones, and this one so far)
  const yearly = mode === 'year'
  const firstUsed = M.findIndex((_, i) => v.income[i] || v.spent[i] || v.invested[i] || v.loans[i] || v.own[i] != null)
  const pts = useMemo(() => {
    if (!yearly) return win.map(i => ({ label: mLabel(M[i]), title: `${MONTH[Number(M[i].slice(5)) - 1]} ${M[i].slice(0, 4)}${M[i] === now ? ' (so far)' : ''}`, ix: [i], sel: len === 1 && i === b }))
    const ys = Array.from(new Set(M.map(m => m.slice(0, 4))))
    return ys.map(y => ({ y, ix: M.map((m, i) => (m.startsWith(y) && i >= Math.max(0, firstUsed) ? i : -1)).filter(i => i >= 0) }))
      // Full years, this year so far, and the year your records begin (when they begin inside the window)
      .filter(x => x.ix.length && (x.ix.length === 12 || x.y === now.slice(0, 4) || (firstUsed > 0 && x.ix[0] === firstUsed)))
      .map(x => ({ label: x.y === now.slice(0, 4) ? `${x.y}*` : x.y, title: x.y === now.slice(0, 4) ? `${x.y} (so far)` : x.ix.length < 12 ? `${x.y} (from ${MON[Number(M[x.ix[0]].slice(5)) - 1]})` : x.y, ix: x.ix, sel: false }))
  }, [yearly, data, per.from, per.to, firstUsed]) // eslint-disable-line react-hooks/exhaustive-deps
  const flow = (arr: number[]) => pts.map(pt => pt.ix.reduce((s, i) => s + (arr[i] ?? 0), 0))
  // A balance at each point's end: its last month with a figure
  const stock = (f: (i: number) => number | null) => pts.map(pt => { for (let k = pt.ix.length - 1; k >= 0; k--) { const x = f(pt.ix[k]); if (x != null) return x } return null })
  const span = yearly ? 'Year on year' : len >= 3 ? `${mLabel(M[a])} – ${mLabel(M[b])}` : `The 6 months to ${mLabel(M[b])}`
  const modeSwitch = (
    <div role="group" aria-label="Monthly or year on year" className="flex p-[3px] rounded-[10px] flex-shrink-0" style={{ background: '#F1F2F6' }}>
      {([['month', 'Monthly'], ['year', 'Year on year']] as const).map(([k, l]) => (
        <button key={k} onClick={() => setMode(k)} aria-pressed={mode === k} className="h-8 px-3 rounded-lg text-[12.5px]"
          style={mode === k ? { background: '#fff', color: 'var(--text)', fontWeight: 600, boxShadow: '0 1px 2px rgba(20,23,43,.08)' } : { color: 'var(--text2)' }}>{l}</button>
      ))}
    </div>
  )

  // Where the spending went, by category group
  const groups = useMemo(() => {
    const tot: Record<string, number> = {}
    for (let i = a; i <= b; i++) for (const [k, x] of Object.entries(v.groups[i] ?? {})) tot[k] = (tot[k] ?? 0) + x
    const all = Object.entries(tot).filter(([, x]) => x > 0).sort((x, y) => y[1] - x[1])
    const top = all.slice(0, 5), rest = all.slice(5).reduce((s, [, x]) => s + x, 0)
    const rows = top.map(([k, x]) => { const g = GROUPS.find(gg => gg.key === k); return { key: k, label: g?.label ?? 'Other', color: g?.color ?? '#94A3B8', value: x } })
    if (rest > 0) rows.push({ key: 'rest', label: 'Everything else', color: '#94A3B8', value: rest })
    return rows
  }, [v, a, b])

  return (
    <div className="flex flex-col gap-3.5 md:gap-[18px]">
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold" style={{ color: 'var(--text)' }}>Overview · {periodLabel(per.period, per.from, per.to).toLowerCase()}</h2>
          <p className="text-[12px]" style={{ color: 'var(--text3)' }}>{len > 1 ? `${mLabel(M[a])} – ${mLabel(M[b])}` : `${MONTH[Number(M[b].slice(5)) - 1]} ${M[b].slice(0, 4)}${isNow ? ', so far' : ''}`}{w.cmp ? ` · compared with ${w.cmp}` : ''}{holderNote ? ` · ${holderNote}` : ''}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2.5 md:gap-3">
        {kpis.map((k, i) => <TrendTile key={k.label} {...k} gid={`kg${i}`} />)}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] gap-3.5 md:gap-4 items-stretch">
        <FlowsChart pts={pts} I={flow(v.income)} S={flow(v.spent)} E={flow(v.emi)} V={flow(v.invested)} money={money} short={short} modeSwitch={modeSwitch}
          sub={`${yearly ? 'Each year’s total' : 'Each month'} · ${span}${isNow ? (yearly ? ' · this year so far' : ` · ${MON[Number(now.slice(5)) - 1]} so far`) : ''}`}
          totals={{ inc: c.inc, out: c.sp + c.em, sv: c.sv }} periodName={periodLabel(per.period, per.from, per.to).toLowerCase()} />
        <SpendDonut rows={groups} total={c.sp} short={short} sub={`Spending by category, ${periodWord} · tap one for its entries`} range={[M[a], M[b]]} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] gap-3.5 md:gap-4 items-stretch">
        <WealthChart pts={pts} own={stock(ownAt)} inv={stock(i => v.inv[i])} loans={stock(i => v.loans[i])} nw={stock(nwAt)} short={short} money={money} modeSwitch={modeSwitch}
          sub={`${yearly ? 'At each year’s end' : 'At each month’s end'} · ${span}`} holderNote={holderNote} />
        {side}
      </div>
    </div>
  )
}

// ── Money flows: income over a filled spending area; the band between them is
// what you saved; investing as columns ──
function FlowsChart({ pts, I, S, E, V, money, short, modeSwitch, sub, totals, periodName }: {
  pts: Pt[]; I: number[]; S: number[]; E: number[]; V: number[]; money: (n: number) => string; short: (n: number) => string
  modeSwitch: React.ReactNode; sub: string; totals: { inc: number; out: number; sv: number }; periodName: string
}) {
  const [off, setOff] = useState<Record<string, boolean>>({})
  const hv = useHover()
  const n = pts.length, H = 240, BASE = 232, X = (i: number) => (i + 0.5) / n * 1000
  const O = S.map((x, i) => x + E[i]), SV = I.map((x, i) => x - O[i])
  const on = { inc: !off.inc, out: !off.out, sav: !off.sav, iv: !off.iv }
  let mx = 1
  for (let i = 0; i < n; i++) { if (on.inc || on.sav) mx = Math.max(mx, I[i]); if (on.out || on.sav) mx = Math.max(mx, O[i]); if (on.iv) mx = Math.max(mx, V[i]) }
  const step = niceStep(mx / 4), top = Math.ceil(mx / step) * step, Y = (x: number) => BASE - Math.max(0, x) / top * 216
  const PI = I.map((x, i) => ({ x: X(i), y: Y(x) })), PO = O.map((x, i) => ({ x: X(i), y: Y(x) }))
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, k) => ({ y: Y(k * step), label: k ? short(k * step) : '0', zero: k === 0 }))
  let bi = 0; for (let i = 1; i < n - 1; i++) if (Y(O[i]) - Y(I[i]) > Y(O[bi]) - Y(I[bi])) bi = i
  const sum = (arr: number[]) => arr.reduce((s, x) => s + x, 0)
  const rate = sum(I) > 0 ? Math.round(sum(SV) / sum(I) * 100) : null
  const tg = (k: string) => () => setOff(o => ({ ...o, [k]: !o[k] }))
  const h = hv.h != null && hv.h < n ? hv.h : null
  return (
    <section className="wl-card p-4 md:px-5 md:py-[18px] flex flex-col gap-3 min-w-0">
      <div className="flex flex-wrap justify-between items-start gap-2.5">
        <div className="min-w-0"><h2 className="text-[15px] font-semibold" style={{ color: 'var(--text)' }}>Money flows</h2><p className="text-[12px] mt-0.5" style={{ color: 'var(--text3)' }}>{sub}</p></div>
        {modeSwitch}
      </div>
      <div role="group" aria-label="Shown on the chart" className="flex flex-wrap gap-1.5">
        <LegendChip on={on.inc} toggle={tg('inc')} label="Income" total={short(sum(I))} swatch={{ width: 16, height: 3, borderRadius: 2, background: '#6A55E8' }} />
        <LegendChip on={on.out} toggle={tg('out')} label="Spent + EMIs" total={short(sum(O))} swatch={{ width: 14, height: 10, borderRadius: 3, background: '#F29A2E', opacity: 0.6 }} />
        <LegendChip on={on.sav} toggle={tg('sav')} label="Saved" total={short(sum(SV))} swatch={{ width: 14, height: 10, borderRadius: 3, background: '#2FB67C', opacity: 0.6 }} />
        <LegendChip on={on.iv} toggle={tg('iv')} label="Invested" total={short(sum(V))} swatch={{ width: 7, height: 12, borderRadius: '2px 2px 0 0', background: '#16A34A' }} />
      </div>
      <div ref={hv.ref} onPointerMove={hv.move(n)} onPointerDown={hv.move(n)} onPointerLeave={hv.leave} className="relative ml-[52px] touch-pan-y" style={{ height: H }}>
        <Axis ticks={ticks} />
        <svg viewBox={`0 0 1000 ${H}`} preserveAspectRatio="none" className="absolute inset-0 w-full" style={{ height: H }} role="img"
          aria-label={`Income ${short(I[0] ?? 0)} to ${short(I[n - 1] ?? 0)}; spending and EMIs ${short(O[0] ?? 0)} to ${short(O[n - 1] ?? 0)}; invested ${short(sum(V))} in all`}>
          <defs>
            <linearGradient id="hfOut" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#F29A2E" stopOpacity={0.34} /><stop offset="100%" stopColor="#F29A2E" stopOpacity={0.04} /></linearGradient>
            <linearGradient id="hfSaved" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#2FB67C" stopOpacity={0.38} /><stop offset="100%" stopColor="#2FB67C" stopOpacity={0.12} /></linearGradient>
          </defs>
          {on.out && <path d={`${smoothPath(PO)} L${X(n - 1).toFixed(1)} ${BASE} L${X(0).toFixed(1)} ${BASE} Z`} fill="url(#hfOut)" />}
          {on.sav && <path d={`${smoothPath(PI)} ${smoothBack(PO)} Z`} fill="url(#hfSaved)" />}
          {on.out && <path d={smoothPath(PO)} fill="none" stroke="#F29A2E" strokeWidth={2.5} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />}
          {on.inc && <path d={smoothPath(PI)} fill="none" stroke="#6A55E8" strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />}
        </svg>
        {on.iv && V.map((x, i) => x > 0 && (
          <span key={i} className="absolute pointer-events-none" style={{ bottom: H - BASE, left: `${X(i) / 10}%`, width: `${34 / n}%`, maxWidth: 16, height: x / top * 216, transform: 'translateX(-50%)', background: 'linear-gradient(180deg,#34D399,#15803D)', borderRadius: '4px 4px 1px 1px', boxShadow: '0 0 0 1.5px #fff' }} />
        ))}
        {on.sav && rate != null && n > 1 && Y(O[bi]) - Y(I[bi]) > 26 && (
          <span className="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-none text-[11.5px] font-bold px-2.5 py-[3px] rounded-full whitespace-nowrap bg-white"
            style={{ left: `${X(bi) / 10}%`, top: (Y(I[bi]) + Y(O[bi])) / 2, color: '#15803D', border: '1px solid #BFE8D1', boxShadow: '0 2px 6px rgba(21,128,61,.12)' }}>Saved {rate}%</span>
        )}
        {h != null && (<>
          <div className="absolute top-0 pointer-events-none" style={{ left: `${X(h) / 10}%`, bottom: H - BASE, borderLeft: '1px dashed #9AA0B4' }} />
          {on.inc && <Dot left={X(h) / 10} top={Y(I[h])} color="#6A55E8" />}
          {on.out && <Dot left={X(h) / 10} top={Y(O[h])} color="#F29A2E" />}
          <Tooltip left={X(h) / 10} title={`${pts[h].title} · vs ${pts.length && pts[0].ix.length > 1 ? 'year' : 'month'} before`} rows={[
            { label: 'Income', color: '#6A55E8', value: money(I[h]), ch: chg(I, h, true) },
            { label: 'Spent', color: '#F29A2E', value: money(S[h]), ch: chg(S, h, false) },
            { label: 'EMIs', color: '#C2410C', value: money(E[h]), ch: chg(E, h, false) },
            { label: 'Saved', color: '#2FB67C', value: money(SV[h]), ch: chg(SV, h, true) },
            { label: 'Invested', color: '#16A34A', value: money(V[h]), ch: chg(V, h, true) },
          ]} />
        </>)}
      </div>
      <Labels pts={pts} />
      <div className="grid grid-cols-3 gap-2 md:gap-2.5">
        <div className="rounded-xl px-3 py-2.5" style={{ background: '#F4F2FF' }}><div className="text-[11.5px] truncate" style={{ color: '#4B3BC4' }}>Came in · {periodName}</div><div className="text-[14px] md:text-[16px] font-bold tabular-nums" style={{ color: 'var(--text)' }}>{short(totals.inc)}</div></div>
        <div className="rounded-xl px-3 py-2.5" style={{ background: '#FFF4E6' }}><div className="text-[11.5px]" style={{ color: '#8A4F06' }}>Spent + EMIs</div><div className="text-[14px] md:text-[16px] font-bold tabular-nums" style={{ color: 'var(--text)' }}>{short(totals.out)}</div></div>
        <div className="rounded-xl px-3 py-2.5" style={{ background: '#EAF7EF' }}><div className="text-[11.5px]" style={{ color: '#1E6B44' }}>Saved</div><div className="text-[14px] md:text-[16px] font-bold tabular-nums" style={{ color: '#15803D' }}>{short(totals.sv)}{totals.inc > 0 ? ` · ${Math.round(totals.sv / totals.inc * 100)}%` : ''}</div></div>
      </div>
    </section>
  )
}

// ── Where it went: spending by category group ──
function SpendDonut({ rows, total, short, sub, range }: { rows: { key: string; label: string; color: string; value: number }[]; total: number; short: (n: number) => string; sub: string; range: [string, string] }) {
  const C = 2 * Math.PI * 70, sum = rows.reduce((s, r) => s + r.value, 0) || 1
  let acc = 0
  const segs = rows.map(r => { const L = r.value / sum * C, s = { color: r.color, dash: `${Math.max(0, L - 2).toFixed(1)} ${C.toFixed(1)}`, off: (-acc).toFixed(1) }; acc += L; return s })
  return (
    <section className="wl-card p-4 md:px-5 md:py-[18px] flex flex-col gap-3 min-w-0">
      <div><h2 className="text-[15px] font-semibold" style={{ color: 'var(--text)' }}>Where it went</h2><p className="text-[12px] mt-0.5" style={{ color: 'var(--text3)' }}>{sub}</p></div>
      {rows.length === 0 ? <p className="text-[12.5px] py-10 text-center" style={{ color: 'var(--text3)' }}>No spending recorded in this period.</p> : (<>
        <div className="relative flex justify-center">
          <svg viewBox="0 0 200 200" className="w-[184px] h-[184px]" role="img" aria-label={rows.map(r => `${r.label} ${Math.round(r.value / sum * 100)}%`).join(', ')}>
            <circle cx="100" cy="100" r="70" fill="none" stroke="#EEF0F5" strokeWidth="24" />
            {segs.map((s, i) => <circle key={i} cx="100" cy="100" r="70" fill="none" stroke={s.color} strokeWidth="24" strokeDasharray={s.dash} strokeDashoffset={s.off} transform="rotate(-90 100 100)" />)}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <div className="text-[11.5px]" style={{ color: 'var(--text3)' }}>Spent</div>
            <div className="text-[19px] font-bold tabular-nums" style={{ color: 'var(--text)' }}>{short(total)}</div>
          </div>
        </div>
        <div className="flex flex-col">
          {rows.map(r => (
            <Link key={r.key} href={`/dashboard/expenses?from=${range[0]}&to=${range[1]}${r.key === 'rest' ? '' : `&cat=g:${r.key}`}`} className="flex items-center gap-2.5 min-h-[34px] text-[13px] rounded-lg -mx-1.5 px-1.5 hover:bg-[#FAFAFE]" style={{ color: 'var(--text)' }}>
              <i className="w-2.5 h-2.5 rounded-[3px] flex-shrink-0" style={{ background: r.color }} />
              <span className="flex-1 min-w-0 truncate">{r.label}</span>
              <span className="w-9 text-right text-[12px]" style={{ color: 'var(--text3)' }}>{Math.round(r.value / sum * 100)}%</span>
              <b className="w-[72px] text-right tabular-nums font-semibold">{short(r.value)}</b>
            </Link>
          ))}
        </div>
      </>)}
    </section>
  )
}

// ── What you own and owe: owned stacked above zero, loans below, net worth through it ──
function WealthChart({ pts, own, inv, loans, nw, short, money, modeSwitch, sub, holderNote }: {
  pts: Pt[]; own: (number | null)[]; inv: (number | null)[]; loans: (number | null)[]; nw: (number | null)[]
  short: (n: number) => string; money: (n: number) => string; modeSwitch: React.ReactNode; sub: string; holderNote: string | null
}) {
  const [off, setOff] = useState<Record<string, boolean>>({})
  const hv = useHover()
  const n = pts.length, H = 280, X = (i: number) => (i + 0.5) / n * 1000
  // Months before tracking began have no figure: lines start at the first one, gaps in between are bridged
  const fill = (arr: (number | null)[]) => {
    const out = [...arr]
    for (let i = 0; i < n; i++) if (out[i] == null) {
      let p = i - 1; while (p >= 0 && out[p] == null) p--
      const q = arr.findIndex((x, k) => k > i && x != null)
      if (p >= 0 && q >= 0) out[i] = (out[p] as number) + ((arr[q] as number) - (out[p] as number)) * (i - p) / (q - p)
    }
    return out
  }
  const OWN = fill(own), INV = fill(inv), NW = fill(nw), LN = loans.map(x => x ?? 0)
  const split = INV.some(x => x != null)
  const OTH = OWN.map((x, i) => (x == null ? null : Math.max(0, x - (split ? INV[i] ?? 0 : 0))))
  const on = { nw: !off.nw, inv: !off.inv && split, oth: !off.oth, ln: !off.ln }
  const A1 = OWN.map((x, i) => (x == null ? null : on.inv ? INV[i] ?? 0 : 0)), A2 = OWN.map((x, i) => (x == null ? null : (A1[i] ?? 0) + (on.oth ? OTH[i] ?? 0 : 0)))
  const has = (arr: (number | null)[]) => arr.map(x => x ?? -Infinity)
  const topR = Math.max(1, ...has(A2), ...(on.nw ? has(NW) : [])), botR = on.ln ? Math.max(0, ...LN) : 0
  const step = niceStep((topR + botR) / 5), top = Math.ceil(topR / step) * step, bot = Math.ceil(botR / step) * step, all = top + bot
  const zero = 12 + 260 * top / all, Y = (x: number) => zero - x / all * 260
  const seg = (arr: (number | null)[]) => arr.map((x, i) => (x == null ? null : { x: X(i), y: Y(x) })).filter(Boolean) as { x: number; y: number }[]
  const k0 = OWN.findIndex(x => x != null)
  const zeros = (from: number) => Array.from({ length: n - from }, (_, k) => ({ x: X(from + k), y: zero }))
  const ticks: { y: number; label: string; zero: boolean }[] = []
  for (let t = -bot; t <= top + 1; t += step) ticks.push({ y: Y(t), label: Math.abs(t) < 1 ? '0' : `${t < 0 ? '−' : ''}${short(Math.abs(t))}`, zero: Math.abs(t) < 1 })
  const last = (arr: (number | null)[]) => [...arr].reverse().find(x => x != null) ?? null, firstOf = (arr: (number | null)[]) => arr.find(x => x != null) ?? null
  const since = (arr: (number | null)[], upGood: boolean) => { const f = firstOf(arr), l = last(arr); if (f == null || l == null || !f) return undefined; const d = pct(l, f); return { t: `${d >= 0 ? '▲' : '▼'}${Math.abs(d).toFixed(0)}%`, good: (d >= 0) === upGood } }
  const tg = (k: string) => () => setOff(o => ({ ...o, [k]: !o[k] }))
  const h = hv.h != null && hv.h < n ? hv.h : null
  const nwLast = (() => { for (let i = n - 1; i >= 0; i--) if (NW[i] != null) return i; return -1 })()
  return (
    <section className="wl-card p-4 md:px-5 md:py-[18px] flex flex-col gap-3 min-w-0">
      <div className="flex flex-wrap justify-between items-start gap-2.5">
        <div className="min-w-0"><h2 className="text-[15px] font-semibold" style={{ color: 'var(--text)' }}>What you own and owe</h2><p className="text-[12px] mt-0.5" style={{ color: 'var(--text3)' }}>{sub}{holderNote ? ' · the whole family' : ''}</p></div>
        {modeSwitch}
      </div>
      <div role="group" aria-label="Shown on the chart" className="flex flex-wrap gap-1.5">
        <LegendChip on={on.nw} toggle={tg('nw')} label="Net worth" total={last(NW) != null ? short(last(NW)!) : '—'} change={since(NW, true)} swatch={{ width: 16, height: 3, borderRadius: 2, background: '#14172B' }} />
        {split && <LegendChip on={on.inv} toggle={tg('inv')} label="Investments" total={last(INV) != null ? short(last(INV)!) : '—'} change={since(INV, true)} swatch={{ width: 14, height: 10, borderRadius: 3, background: '#3B8EF0', opacity: 0.7 }} />}
        <LegendChip on={on.oth} toggle={tg('oth')} label={split ? 'Cash & property' : 'What you own'} total={last(OTH) != null ? short(last(OTH)!) : '—'} change={since(OTH, true)} swatch={{ width: 14, height: 10, borderRadius: 3, background: '#14B8A6', opacity: 0.6 }} />
        <LegendChip on={on.ln} toggle={tg('ln')} label="Loans left" total={short(LN[n - 1] ?? 0)} change={since(LN, false)} swatch={{ width: 14, height: 10, borderRadius: 3, background: '#DC2626', opacity: 0.55 }} />
      </div>
      {k0 < 0 && <p className="text-[12px] rounded-lg px-3 py-2" style={{ background: '#FAFAFE', color: 'var(--text3)' }}>What you own is saved each day you open WealthLens, so its history starts from your first visits. Loans are shown from their payments.</p>}
      <div ref={hv.ref} onPointerMove={hv.move(n)} onPointerDown={hv.move(n)} onPointerLeave={hv.leave} className="relative ml-[52px] touch-pan-y" style={{ height: H }}>
        <Axis ticks={ticks} />
        <svg viewBox={`0 0 1000 ${H}`} preserveAspectRatio="none" className="absolute inset-0 w-full" style={{ height: H }} role="img"
          aria-label={`Net worth ${firstOf(NW) != null ? short(firstOf(NW)!) : '—'} to ${last(NW) != null ? short(last(NW)!) : '—'}; loans left ${short(LN[0] ?? 0)} to ${short(LN[n - 1] ?? 0)}`}>
          <defs>
            <linearGradient id="hwOth" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#14B8A6" stopOpacity={0.42} /><stop offset="100%" stopColor="#0F766E" stopOpacity={0.16} /></linearGradient>
            <linearGradient id="hwInv" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#6A9BFF" stopOpacity={0.75} /><stop offset="100%" stopColor="#3B8EF0" stopOpacity={0.35} /></linearGradient>
            <linearGradient id="hwLoan" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#F87171" stopOpacity={0.18} /><stop offset="100%" stopColor="#DC2626" stopOpacity={0.5} /></linearGradient>
          </defs>
          {k0 >= 0 && on.oth && <path d={`${smoothPath(seg(A2))} ${smoothBack(seg(A1))} Z`} fill="url(#hwOth)" />}
          {k0 >= 0 && on.inv && <path d={`${smoothPath(seg(A1))} ${smoothBack(zeros(k0))} Z`} fill="url(#hwInv)" />}
          {on.ln && <path d={`${smoothPath(zeros(0))} ${smoothBack(LN.map((x, i) => ({ x: X(i), y: Y(-x) })))} Z`} fill="url(#hwLoan)" />}
          {k0 >= 0 && (on.inv || on.oth) && <path d={smoothPath(seg(A2))} fill="none" stroke="#0F766E" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />}
          {on.ln && <path d={smoothPath(LN.map((x, i) => ({ x: X(i), y: Y(-x) })))} fill="none" stroke="#DC2626" strokeWidth={2} vectorEffect="non-scaling-stroke" />}
          {on.nw && nwLast >= 0 && <path d={smoothPath(seg(NW))} fill="none" stroke="#fff" strokeWidth={7} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />}
          {on.nw && nwLast >= 0 && <path d={smoothPath(seg(NW))} fill="none" stroke="#14172B" strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />}
        </svg>
        <span className="absolute left-2.5 top-2.5 text-[11px] font-bold uppercase tracking-[.06em] pointer-events-none" style={{ color: '#0F766E' }}>You own</span>
        {on.ln && bot > 0 && <span className="absolute left-2.5 text-[11px] font-bold uppercase tracking-[.06em] pointer-events-none" style={{ top: zero + 8, color: '#B4231A' }}>You owe</span>}
        {on.nw && nwLast >= 0 && h == null && (<>
          <Dot left={X(nwLast) / 10} top={Y(NW[nwLast]!)} color="#14172B" />
          <span className="absolute pointer-events-none text-[12px] font-bold px-2 py-1 rounded-lg whitespace-nowrap text-white" style={{ left: `${X(nwLast) / 10}%`, top: Y(NW[nwLast]!), transform: 'translate(-100%, -170%)', background: '#14172B' }}>Net worth {short(NW[nwLast]!)}</span>
        </>)}
        {h != null && (<>
          <div className="absolute top-0 bottom-0 pointer-events-none" style={{ left: `${X(h) / 10}%`, borderLeft: '1px dashed #9AA0B4' }} />
          {on.nw && NW[h] != null && <Dot left={X(h) / 10} top={Y(NW[h]!)} color="#14172B" />}
          {(on.inv || on.oth) && A2[h] != null && <Dot left={X(h) / 10} top={Y(A2[h]!)} color="#0F766E" />}
          {on.ln && <Dot left={X(h) / 10} top={Y(-LN[h])} color="#DC2626" />}
          <Tooltip left={X(h) / 10} title={`${pts[h].title} · vs ${pts[0]?.ix.length > 1 ? 'year' : 'month'} before`} rows={[
            { label: 'Net worth', color: '#A79BFF', value: NW[h] != null ? money(NW[h]!) : '—', ch: chg(NW, h, true) },
            ...(split ? [{ label: 'Investments', color: '#3B8EF0', value: INV[h] != null ? money(INV[h]!) : '—', ch: chg(INV, h, true) }] : []),
            { label: split ? 'Cash & property' : 'What you own', color: '#14B8A6', value: OTH[h] != null ? money(OTH[h]!) : '—', ch: chg(OTH, h, true) },
            { label: 'Loans left', color: '#F87171', value: money(LN[h]), ch: chg(LN, h, false) },
          ]} />
        </>)}
      </div>
      <Labels pts={pts} />
      {!split && k0 >= 0 && <p className="text-[11.5px]" style={{ color: 'var(--text3)' }}>Investments are shown on their own in the All view.</p>}
    </section>
  )
}
