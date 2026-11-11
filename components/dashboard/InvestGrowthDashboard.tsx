'use client'
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts'
import { Segmented } from '@/components/ui/kit'
import { flowMonths, flowYears, FLOW_KEYS, type FlowKey, type FlowRow } from '@/lib/investFlows'
import { HTYPES, holdingHref, holdingModel, holdingName, type HType } from '@/lib/holding'
import { holdingValue, holdingCost } from '@/lib/netWorth'

export interface KindRow { key: FlowKey; label: string; href: string; val: number; inv: number | null; count: number }
const MONTH_RANGES = [6, 12, 24, 36], YEAR_RANGES = [3, 5, 10]
const th = 'px-3 py-2 text-[11px] font-semibold uppercase tracking-[.05em] whitespace-nowrap'
const fmtDate = (d: string) => new Date(`${d.slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })

// Investments › Growth: what you put in, by month or year and by kind, as a
// chart with its table; each kind with its value and return; your biggest
// holdings and what matures in the next year. Every row opens its page.
export default function InvestGrowthDashboard({ flows, kinds, holdings, conv, colors, names, money, short, today, onOpen }: {
  flows: Map<string, FlowRow>; kinds: KindRow[]; holdings: Partial<Record<HType, any[]>>
  conv: (amt: number, cur: string) => number; colors: Record<FlowKey, string>; names: Record<FlowKey, string>
  money: (n: number) => string; short: (n: number) => string; today: string
  onOpen?: (key: string, by: 'month' | 'year') => void   // a row's payments, on the Invested tab
}) {
  const [by, setBy] = useState<'month' | 'year'>('month')
  const [n, setN] = useState(12)
  const [only, setOnly] = useState<FlowKey | 'all'>('all')

  const rows = useMemo(() => by === 'month' ? flowMonths(flows, n) : flowYears(flows, n), [flows, by, n])
  const present = FLOW_KEYS.filter(k => rows.some(r => r[k] > 0))
  const cols = only === 'all' ? present : present.filter(k => k === only)
  const totalOf = (r: FlowRow) => cols.reduce((s, k) => s + r[k], 0)
  const chart = rows.map(r => ({ ...r, label: by === 'month' ? new Date(`${r.key}-01T00:00:00`).toLocaleDateString('en', { month: 'short', year: '2-digit' }) : r.key }))
  const putIn = rows.reduce((s, r) => s + totalOf(r), 0)
  const months = by === 'month' ? n : Math.max(1, rows.length * 12 - (11 - new Date().getMonth()))
  const peak = rows.reduce<{ key: string; v: number } | null>((b, r) => (totalOf(r) > (b?.v ?? 0) ? { key: r.key, v: totalOf(r) } : b), null)
  const byKind = present.map(k => ({ k, v: rows.reduce((s, r) => s + r[k], 0) })).sort((a, b) => b.v - a.v)
  const periodLabel = (k: string) => by === 'month' ? new Date(`${k}-01T00:00:00`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }) : k

  // Every holding, valued the same way as Net worth
  const all = useMemo(() => (Object.entries(holdings) as [HType, any[]][]).flatMap(([type, list]) => (list ?? []).filter(r => r.is_active !== false).map(r => {
    const key = HTYPES[type].key, v = conv(holdingValue[key](r), r.currency || 'INR'), c = conv(holdingCost[key](r), r.currency || 'INR')
    return { type, r, name: holdingName(type, r), value: v, cost: c }
  })), [holdings, conv])
  const totalValue = all.reduce((s, x) => s + x.value, 0)
  const kindsTotal = kinds.reduce((s, k) => s + Math.max(0, k.val), 0)
  const top = [...all].sort((a, b) => b.value - a.value).slice(0, 10)
  const yearOn = `${Number(today.slice(0, 4)) + 1}${today.slice(4, 10)}`
  const maturing = all.map(x => ({ ...x, m: holdingModel(x.type, x.r, [], today).maturity }))
    .filter(x => x.m?.date && x.m.date >= today && x.m.date <= yearOn).sort((a, b) => a.m!.date!.localeCompare(b.m!.date!))

  return (
    <div className="flex flex-col gap-4 md:gap-5">
      <section className="wl-card p-4 md:p-5 flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-[15px] font-semibold" style={{ color: 'var(--text)' }}>What you put in</h2>
            <p className="text-[12px] mt-0.5" style={{ color: 'var(--text3)' }}>SIPs, purchases, deposits and premiums, by {by}</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Segmented label="By" value={by} onChange={(v: 'month' | 'year') => { setBy(v); setN(v === 'month' ? 12 : 5) }} options={[{ value: 'month', label: 'Month' }, { value: 'year', label: 'Year' }]} />
            <Segmented label="Range" value={String(n)} onChange={v => setN(Number(v))} options={(by === 'month' ? MONTH_RANGES : YEAR_RANGES).map(x => ({ value: String(x), label: by === 'month' ? `${x}M` : `${x}Y` }))} />
          </div>
        </div>
        {present.length > 1 && (
          <div className="flex gap-1.5 flex-wrap" aria-label="Kind">
            {(['all', ...present] as const).map(k => (
              <button key={k} onClick={() => setOnly(k)} aria-pressed={only === k} className="wl-chip" style={{ height: 30, ...(only === k ? { background: 'var(--accent-bg)', color: 'var(--accent2)', borderColor: 'var(--accent)' } : {}) }}>
                {k !== 'all' && <i className="inline-block w-2 h-2 rounded-sm mr-1.5" style={{ background: colors[k] }} />}{k === 'all' ? 'All kinds' : names[k]}
              </button>
            ))}
          </div>
        )}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
          {[['Put in', money(putIn)], ['A month, on average', money(putIn / months)], [`Most in one ${by}`, peak ? `${short(peak.v)} · ${by === 'month' ? new Date(`${peak.key}-01T00:00:00`).toLocaleDateString('en', { month: 'short', year: '2-digit' }) : peak.key}` : '—'], ['Mostly into', byKind[0]?.v ? names[byKind[0].k] : '—']].map(([k, v]) => (
            <div key={k} className="rounded-xl px-3 py-2.5" style={{ background: 'var(--bg2)' }}>
              <div className="text-[11.5px]" style={{ color: 'var(--text3)' }}>{k}</div>
              <div className="text-[15px] md:text-[16px] font-bold tabular-nums mt-0.5 truncate" style={{ color: 'var(--text)' }}>{v}</div>
            </div>
          ))}
        </div>
        {putIn > 0 ? (
          <div className="h-[240px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chart} barSize={by === 'month' ? (n > 24 ? 8 : 16) : 34}>
                <CartesianGrid stroke="var(--track)" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#5B6078' }} axisLine={false} tickLine={false} minTickGap={8} />
                <YAxis tickFormatter={v => short(Number(v))} tick={{ fontSize: 11, fill: '#5B6078' }} width={54} axisLine={false} tickLine={false} />
                <Tooltip formatter={(v: any, name: any) => [money(Number(v)), name]} cursor={{ fill: 'rgba(106,85,232,.06)' }} />
                {cols.map(k => <Bar key={k} dataKey={k} name={names[k]} stackId="a" fill={colors[k]} stroke="#fff" strokeWidth={1} isAnimationActive={false} />)}
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : <p className="text-[12.5px] py-10 text-center" style={{ color: 'var(--text3)' }}>Nothing put in over this period.</p>}
        {putIn > 0 && (
          <div className="overflow-x-auto -mx-4 md:-mx-5" style={{ borderTop: '1px solid var(--line)' }}>
            <table className="w-full text-[12.5px] tabular-nums">
              <thead><tr style={{ background: '#FAFAFE', color: 'var(--text3)' }}>
                <th className={`${th} text-left pl-4 md:pl-5`}>{by === 'month' ? 'Month' : 'Year'}</th>
                {cols.map(k => <th key={k} className={`${th} text-right`}><Link href={kinds.find(x => x.key === k)?.href ?? '#'} className="hover:underline">{names[k]}</Link></th>)}
                {cols.length > 1 && <th className={`${th} text-right ${onOpen ? '' : 'pr-4 md:pr-5'}`}>Total</th>}
                {onOpen && <th className={`${th} pr-4 md:pr-5`}><span className="sr-only">Details</span></th>}
              </tr></thead>
              <tbody>{[...rows].reverse().filter(r => totalOf(r) > 0).map(r => (
                <tr key={r.key} style={{ borderTop: '1px solid var(--track)' }}>
                  <td className="px-3 pl-4 md:pl-5 py-2 font-medium whitespace-nowrap" style={{ color: 'var(--text)' }}>{periodLabel(r.key)}</td>
                  {cols.map(k => <td key={k} className="px-3 py-2 text-right" style={{ color: r[k] > 0 ? 'var(--text2)' : 'var(--text4)' }}>{r[k] > 0 ? money(r[k]) : '—'}</td>)}
                  {cols.length > 1 && <td className={`px-3 ${onOpen ? '' : 'pr-4 md:pr-5'} py-2 text-right font-semibold`} style={{ color: 'var(--text)' }}>{money(totalOf(r))}</td>}
                  {onOpen && <td className="px-3 pr-4 md:pr-5 py-1 text-right"><button onClick={() => onOpen(r.key, by)} className="inline-flex items-center gap-0.5 h-9 font-semibold whitespace-nowrap" style={{ color: 'var(--accent2)' }} aria-label={`What went in, ${periodLabel(r.key)}`}>Details<ChevronRight size={14} /></button></td>}
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </section>

      <section className="wl-card overflow-hidden">
        <div className="px-4 md:px-5 pt-4 pb-3"><h2 className="text-[15px] font-semibold" style={{ color: 'var(--text)' }}>Each kind</h2></div>
        <div className="overflow-x-auto">
          <table className="w-full text-[13px] tabular-nums">
            <thead><tr style={{ background: '#FAFAFE', color: 'var(--text3)', borderTop: '1px solid var(--line)' }}>
              <th className={`${th} text-left pl-4 md:pl-5`}>Kind</th><th className={`${th} text-right`}>Holdings</th><th className={`${th} text-right`}>Invested</th><th className={`${th} text-right`}>Value</th><th className={`${th} text-right`}>Return</th><th className={`${th} text-right`}>Put in ({by === 'month' ? `${n} months` : `${n} years`})</th><th className={`${th} text-right pr-4 md:pr-5`}>Share</th>
            </tr></thead>
            <tbody>{kinds.filter(k => k.val > 0 || k.count > 0).sort((a, b) => b.val - a.val).map(k => {
              const r = k.inv && k.inv > 0 && k.inv !== k.val ? (k.val - k.inv) / k.inv * 100 : null
              const put = rows.reduce((s, x) => s + x[k.key], 0)
              return (
                <tr key={k.key} style={{ borderTop: '1px solid var(--track)' }}>
                  <td className="px-3 pl-4 md:pl-5 py-2.5"><Link href={k.href} className="font-semibold inline-flex items-center gap-2 hover:underline" style={{ color: 'var(--text)' }}><i className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: colors[k.key] }} />{k.label}</Link></td>
                  <td className="px-3 py-2.5 text-right" style={{ color: 'var(--text2)' }}>{k.count}</td>
                  <td className="px-3 py-2.5 text-right" style={{ color: 'var(--text2)' }}>{money(k.inv ?? k.val)}</td>
                  <td className="px-3 py-2.5 text-right font-semibold" style={{ color: 'var(--text)' }}>{money(k.val)}</td>
                  <td className="px-3 py-2.5 text-right font-semibold" style={{ color: r == null ? 'var(--text4)' : r >= 0 ? 'var(--pos-text)' : '#B4231A' }}>{r == null ? 'At cost' : `${r >= 0 ? '+' : ''}${r.toFixed(1)}%`}</td>
                  <td className="px-3 py-2.5 text-right" style={{ color: put > 0 ? 'var(--text2)' : 'var(--text4)' }}>{put > 0 ? money(put) : '—'}</td>
                  <td className="px-3 pr-4 md:pr-5 py-2.5 text-right" style={{ color: 'var(--text3)' }}>{kindsTotal > 0 ? `${Math.round(k.val / kindsTotal * 100)}%` : '—'}</td>
                </tr>
              )
            })}</tbody>
          </table>
        </div>
      </section>

      <div className={`grid grid-cols-1 ${maturing.length ? 'lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]' : ''} gap-4 md:gap-5 wl-even`}>
        <section className="wl-card overflow-hidden">
          <div className="px-4 md:px-5 pt-4 pb-3 flex items-baseline justify-between gap-2"><h2 className="text-[15px] font-semibold" style={{ color: 'var(--text)' }}>Your biggest holdings</h2><span className="text-[12px]" style={{ color: 'var(--text4)' }}>Tap one to open it</span></div>
          {top.map(x => {
            const r = x.cost > 0 && x.cost !== x.value ? (x.value - x.cost) / x.cost * 100 : null
            return (
              <Link key={x.type + x.r.id} href={holdingHref(x.type, x.r.id)} className="flex items-center gap-3 px-4 md:px-5 py-2.5 hover:bg-[#FAFAFE]" style={{ borderTop: '1px solid var(--track)' }}>
                <span className="flex-1 min-w-0">
                  <span className="block text-[13.5px] font-semibold truncate" style={{ color: 'var(--text)' }}>{x.name}</span>
                  <span className="block text-[11.5px]" style={{ color: 'var(--text3)' }}>{HTYPES[x.type].label} · {totalValue > 0 ? `${(x.value / totalValue * 100).toFixed(1)}% of all` : ''}</span>
                </span>
                <span className="text-right flex-shrink-0">
                  <span className="block text-[13.5px] font-semibold tabular-nums" style={{ color: 'var(--text)' }}>{money(x.value)}</span>
                  <span className="block text-[11.5px] font-semibold" style={{ color: r == null ? 'var(--text4)' : r >= 0 ? 'var(--pos-text)' : '#B4231A' }}>{r == null ? 'At cost' : `${r >= 0 ? '+' : ''}${r.toFixed(1)}%`}</span>
                </span>
                <ChevronRight size={15} style={{ color: 'var(--text4)' }} />
              </Link>
            )
          })}
          {!top.length && <p className="px-5 py-6 text-[12.5px]" style={{ color: 'var(--text3)' }}>No holdings yet.</p>}
        </section>
        {maturing.length > 0 && (
          <section className="wl-card overflow-hidden">
            <div className="px-4 md:px-5 pt-4 pb-3"><h2 className="text-[15px] font-semibold" style={{ color: 'var(--text)' }}>Maturing in the next year</h2></div>
            {maturing.map(x => (
              <Link key={x.type + x.r.id} href={holdingHref(x.type, x.r.id)} className="flex items-center gap-3 px-4 md:px-5 py-2.5 hover:bg-[#FAFAFE]" style={{ borderTop: '1px solid var(--track)' }}>
                <span className="flex-1 min-w-0">
                  <span className="block text-[13.5px] font-semibold truncate" style={{ color: 'var(--text)' }}>{x.name}</span>
                  <span className="block text-[11.5px]" style={{ color: 'var(--text3)' }}>{HTYPES[x.type].label} · {fmtDate(x.m!.date!)}</span>
                </span>
                <span className="text-[13.5px] font-semibold tabular-nums flex-shrink-0" style={{ color: 'var(--text)' }}>{x.m!.amount ? money(conv(x.m!.amount, x.r.currency || 'INR')) : money(x.value)}</span>
                <ChevronRight size={15} style={{ color: 'var(--text4)' }} />
              </Link>
            ))}
          </section>
        )}
      </div>
    </div>
  )
}
