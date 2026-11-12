'use client'
import { Fragment, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronDown, ChevronLeft, ChevronRight, Pencil, Trash2 } from 'lucide-react'
import { fmtMoney } from '@/lib/format'
import { HTYPES, holdingHref } from '@/lib/holding'
import { addMonth, monthsBetween, missingSips, FLOW_KEYS, type FlowKey, type InvEntry } from '@/lib/investEntries'
import { Sheet, EditPaymentSheet, DeletePaymentSheet } from '@/components/forms/EditPaymentSheet'

export interface Period { from: string; to: string }   // months, YYYY-MM
const PRESETS = ['this', 'last', 'm3', 'm6', 'm12', 'm24', 'custom'] as const
type Preset = (typeof PRESETS)[number]
const PRESET_LABEL: Record<Preset, string> = { this: 'This month', last: 'Last month', m3: 'Last 3 months', m6: 'Last 6 months', m12: 'Last 12 months', m24: 'Last 2 years', custom: 'Pick months' }
const SPAN: Partial<Record<Preset, number>> = { m3: 3, m6: 6, m12: 12, m24: 24 }
// "Last N months" counts this month: in November, the last 3 are Sep, Oct and Nov
export function presetPeriod(p: Exclude<Preset, 'custom'>, now: string): Period {
  if (p === 'this') return { from: now, to: now }
  if (p === 'last') return { from: addMonth(now, -1), to: addMonth(now, -1) }
  return { from: addMonth(now, 1 - SPAN[p]!), to: now }
}
const monthName = (m: string, opts: Intl.DateTimeFormatOptions = { month: 'long', year: 'numeric' }) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString('en-GB', { ...opts, timeZone: 'UTC' }).replace('Sept', 'Sep')
export const periodLabel = (p: Period) => p.from === p.to ? monthName(p.from)
  : p.from.slice(0, 4) === p.to.slice(0, 4) ? `${monthName(p.from, { month: 'short' })} – ${monthName(p.to, { month: 'short', year: 'numeric' })}`
  : `${monthName(p.from, { month: 'short', year: 'numeric' })} – ${monthName(p.to, { month: 'short', year: 'numeric' })}`
const longDate = (d: string) => new Date(`${d.slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
const ordinal = (n: number) => `${n}${['th', 'st', 'nd', 'rd'][(n % 10 > 3 || [11, 12, 13].includes(n % 100)) ? 0 : n % 10]}`
const editable = (e: InvEntry) => !!e.txn?.id && (e.type === 'mutual_funds' || e.type === 'stocks')
const REGULAR = new Set(['SIP', 'Instalment'])
const sum = (es: InvEntry[]) => es.reduce((s, e) => s + e.amount, 0)
const KIND_BG = '#FAFAFE', FOOT_BG = '#F4F2FF', LINE = '1px solid var(--track)'

interface Row { id: string; type: string; name: string; es: InvEntry[]; byMonth: Map<string, number>; total: number; hows: string[]; est: number }
const rowOf = (es: InvEntry[]): Row => {
  const byMonth = new Map<string, number>()
  es.forEach(e => byMonth.set(e.month, (byMonth.get(e.month) ?? 0) + e.amount))
  return { id: es[0].holding.id, type: es[0].type, name: es[0].name, es, byMonth, total: sum(es), est: es.filter(e => e.estimated).length,
    hows: Array.from(new Set(es.map(e => (e.how === 'Added' ? 'When added' : e.how)))) }
}
const rowsOf = (es: InvEntry[]) => {
  const by = new Map<string, InvEntry[]>()
  es.forEach(e => by.set(`${e.type}:${e.holding.id}`, [...(by.get(`${e.type}:${e.holding.id}`) ?? []), e]))
  return Array.from(by.values()).map(rowOf).sort((a, b) => b.total - a.total)
}

// Investments › Invested: one table for any months — each kind and, under it,
// each fund / share / deposit, with what went in every month (newest first),
// its total on the right and each month's total at the bottom; then what was
// taken out. Tap a row or an amount for its payments, and edit or delete a
// fund or share payment there. The same payments make up the Growth tab's totals.
export default function InvestedTab({ entries, outs, funds, holdings, conv, colors, names, cur, today, period, onPeriod }: {
  entries: InvEntry[]; outs: InvEntry[]; funds: any[]; holdings: { mutual_funds: any[]; stocks: any[] }; conv: (amt: number, cur: string) => number
  colors: Record<FlowKey, string>; names: Record<FlowKey, string>; cur: string; today: string
  period: Period; onPeriod: (p: Period) => void
}) {
  const router = useRouter()
  const now = today.slice(0, 7)
  const money = (n: number) => fmtMoney(n, cur)
  const preset: Preset = (PRESETS.filter(p => p !== 'custom') as Exclude<Preset, 'custom'>[]).find(p => { const x = presetPeriod(p, now); return x.from === period.from && x.to === period.to }) ?? 'custom'
  const [custom, setCustom] = useState(preset === 'custom')
  const [closed, setClosed] = useState<Record<string, boolean>>({})
  const [drawer, setDrawer] = useState<{ type: string; id: string; month?: string } | null>(null)
  const [edit, setEdit] = useState<InvEntry | null>(null)
  const [del, setDel] = useState<InvEntry | null>(null)
  const span = monthsBetween(period.from, period.to) + 1
  const step = (n: number) => {
    const to = addMonth(period.to, n * span)
    if (to > now) return
    onPeriod({ from: addMonth(period.from, n * span), to })
  }
  // Columns: the months, newest first
  const months = useMemo(() => Array.from({ length: span }, (_, i) => addMonth(period.to, -i)), [period.to, span])
  const multi = months.length > 1
  const colLabel = (m: string) => monthName(m, months.length > 6 ? { month: 'short', year: '2-digit' } : { month: 'short', year: 'numeric' })

  const inP = (e: InvEntry) => e.month >= period.from && e.month <= period.to
  const mine = useMemo(() => entries.filter(inP).sort((a, b) => a.date.localeCompare(b.date)), [entries, period]) // eslint-disable-line react-hooks/exhaustive-deps
  const taken = useMemo(() => outs.filter(inP).sort((a, b) => a.date.localeCompare(b.date)), [outs, period]) // eslint-disable-line react-hooks/exhaustive-deps
  // Planned SIPs with no payment, for the latest month shown
  const missMonth = period.to <= now ? period.to : null
  const missing = useMemo(() => missMonth ? missingSips(funds, entries, missMonth, today, conv) : [], [missMonth, funds, entries, today, conv]) // eslint-disable-line react-hooks/exhaustive-deps
  const putIn = sum(mine), out = sum(taken)
  const regular = sum(mine.filter(e => REGULAR.has(e.how)))
  const missed = multi ? 0 : missing.reduce((s, x) => s + x.amount, 0)
  const holdingsCount = new Set(mine.map(e => e.holding.id)).size
  const monthTotal = (es: InvEntry[], m: string) => sum(es.filter(e => e.month === m))

  // Kind → its holdings, biggest first
  const kinds = useMemo(() => FLOW_KEYS.map(k => {
    const list = mine.filter(e => e.key === k)
    return { k, list, total: sum(list), rows: rowsOf(list) }
  }).filter(x => x.total > 0).sort((a, b) => b.total - a.total), [mine])
  const outRows = useMemo(() => rowsOf(taken), [taken])
  const empty = FLOW_KEYS.filter(k => !kinds.some(x => x.k === k) && entries.some(e => e.key === k))
  // Whole-number shares that add up to 100
  const pcts = (() => {
    if (!(putIn > 0)) return {} as Record<string, number>
    const fl = kinds.map(x => ({ k: x.k, v: x.total / putIn * 100, f: Math.floor(x.total / putIn * 100) }))
    let left = 100 - fl.reduce((s, r) => s + r.f, 0)
    fl.slice().sort((a, b) => (b.v - b.f) - (a.v - a.f)).forEach(r => { if (left > 0) { r.f++; left-- } })
    return Object.fromEntries(fl.map(r => [r.k, r.f]))
  })()

  const tag = (t: string, warn = false) => <span key={t} className="text-[10.5px] font-semibold rounded-full px-1.5 py-[2px] whitespace-nowrap" style={warn ? { background: '#FFF4DE', color: '#7A5300' } : { background: 'var(--bg2)', color: 'var(--text2)' }}>{t}</span>
  const done = () => { setEdit(null); setDel(null); router.refresh() }
  const allOpen = !Object.values(closed).some(Boolean)

  // Sticky first and last columns, so names and totals stay in view while the months scroll
  const first = 'sticky left-0 z-[1] text-left px-3 md:px-4 min-w-[150px] max-w-[190px] md:min-w-[230px] md:max-w-[300px]'
  const last = 'sticky right-0 z-[1] text-right px-3 md:px-4 whitespace-nowrap'
  const cell = 'text-right px-3 whitespace-nowrap'
  const amt = (v: number, onClick?: () => void, strong = false, neg = false) => v > 0
    ? (onClick ? <button onClick={onClick} className="tabular-nums hover:underline min-h-[32px]" style={{ color: neg ? '#B4231A' : strong ? 'var(--text)' : 'var(--text2)', fontWeight: strong ? 700 : 500 }}>{neg ? '−' : ''}{money(v)}</button>
      : <span className="tabular-nums" style={{ color: neg ? '#B4231A' : 'var(--text)', fontWeight: strong ? 700 : 600 }}>{neg ? '−' : ''}{money(v)}</span>)
    : <span style={{ color: 'var(--text4)' }}>—</span>

  const holdingRow = (r: Row, neg = false) => (
    <tr key={`${r.type}:${r.id}`}>
      <th scope="row" className={`${first} py-2 font-normal bg-white`} style={{ boxShadow: '1px 0 0 var(--track)', borderTop: LINE }}>
        <button onClick={() => setDrawer({ type: r.type, id: r.id })} className="text-left pl-5 md:pl-6 w-full min-h-[40px] group">
          <span className="block text-[13px] font-medium leading-snug group-hover:underline" style={{ color: 'var(--text)' }}>{r.name}</span>
          <span className="flex items-center gap-1 flex-wrap mt-0.5"><span className="text-[11.5px]" style={{ color: 'var(--text3)' }}>{r.hows.join(', ')}</span>{r.est > 0 && tag(`${r.est} estimated`, true)}</span>
        </button>
      </th>
      {months.map(m => <td key={m} className={`${cell} py-2`} style={{ borderTop: LINE }}>{amt(r.byMonth.get(m) ?? 0, () => setDrawer({ type: r.type, id: r.id, month: m }), false, neg)}</td>)}
      {multi && <td className={`${last} py-2 bg-white`} style={{ boxShadow: '-1px 0 0 var(--track)', borderTop: LINE }}>{amt(r.total, undefined, true, neg)}</td>}
    </tr>
  )

  const d = drawer ? { es: [...mine, ...taken].filter(e => e.holding.id === drawer.id && e.type === drawer.type && (!drawer.month || e.month === drawer.month)).sort((a, b) => a.date.localeCompare(b.date)) } : null
  const dh = d?.es[0]

  return (
    <div className="flex flex-col gap-4 md:gap-5">
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div role="group" aria-label="Period" className="flex gap-1.5 overflow-x-auto no-scrollbar -mx-4 px-4 md:mx-0 md:px-0">
          {PRESETS.map(p => {
            const on = p === 'custom' ? custom || preset === 'custom' : !custom && preset === p
            return <button key={p} aria-pressed={on} onClick={() => { if (p === 'custom') setCustom(true); else { setCustom(false); onPeriod(presetPeriod(p, now)) } }}
              className="wl-chip flex-shrink-0" style={{ height: 36, ...(on ? { background: 'var(--accent-bg)', color: 'var(--accent2)', borderColor: 'var(--accent)', fontWeight: 600 } : {}) }}>{PRESET_LABEL[p]}</button>
          })}
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => step(-1)} aria-label="Earlier" className="w-10 h-10 rounded-[10px] flex items-center justify-center" style={{ border: '1px solid var(--line)', background: '#fff', color: 'var(--text2)' }}><ChevronLeft size={16} /></button>
          <span className="min-w-[128px] text-center text-[13.5px] font-semibold" style={{ color: 'var(--text)' }}>{periodLabel(period)}</span>
          <button onClick={() => step(1)} disabled={addMonth(period.to, span) > now} aria-label="Later" className="w-10 h-10 rounded-[10px] flex items-center justify-center disabled:opacity-40" style={{ border: '1px solid var(--line)', background: '#fff', color: 'var(--text2)' }}><ChevronRight size={16} /></button>
        </div>
      </div>
      {(custom || preset === 'custom') && (
        <div className="flex gap-3 flex-wrap items-end">
          {(['from', 'to'] as const).map(f => (
            <label key={f} className="block"><span className="block text-[12px] font-semibold mb-1" style={{ color: 'var(--text2)' }}>{f === 'from' ? 'From' : 'To'}</span>
              <input type="month" value={period[f]} max={now} onChange={e => { const v = e.target.value; if (!/^\d{4}-\d{2}$/.test(v)) return; const p = { ...period, [f]: v }; onPeriod(p.from <= p.to ? p : { from: p.to, to: p.from }) }} className="wl-input" style={{ height: 40 }} /></label>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 md:gap-3">
        <div className="wl-card px-4 py-3.5"><div className="text-[12px]" style={{ color: 'var(--text3)' }}>Put in</div><div className="text-[20px] md:text-[24px] font-bold tabular-nums" style={{ color: 'var(--text)' }}>{money(putIn)}</div>
          <div className="text-[12px]" style={{ color: 'var(--text3)' }}>{!mine.length ? 'Nothing put in' : multi ? `About ${money(putIn / months.length)} a month` : `${mine.length} payment${mine.length === 1 ? '' : 's'} into ${holdingsCount} holding${holdingsCount === 1 ? '' : 's'}`}</div></div>
        <div className="wl-card px-4 py-3.5"><div className="text-[12px]" style={{ color: 'var(--text3)' }}>Taken out</div><div className="text-[20px] md:text-[24px] font-bold tabular-nums" style={{ color: 'var(--text)' }}>{money(out)}</div><div className="text-[12px] truncate" style={{ color: 'var(--text3)' }}>{taken.length ? `${taken.length} sale${taken.length === 1 ? '' : 's'}${taken.length === 1 ? ` · ${taken[0].name}` : ''}` : 'No sales'}</div></div>
        <div className="wl-card px-4 py-3.5"><div className="text-[12px]" style={{ color: 'var(--text3)' }}>Net added</div><div className="text-[20px] md:text-[24px] font-bold tabular-nums" style={{ color: putIn - out >= 0 ? 'var(--accent2)' : '#B4231A' }}>{money(putIn - out)}</div><div className="text-[12px]" style={{ color: 'var(--text3)' }}>Put in − taken out</div></div>
        <div className="wl-card px-4 py-3.5 flex flex-col gap-1">
          <div className="text-[12px]" style={{ color: 'var(--text3)' }}>Regular (SIPs + RDs)</div>
          <div className="text-[13px]" style={{ color: 'var(--text2)' }}><b className="text-[18px] md:text-[20px] tabular-nums" style={{ color: 'var(--text)' }}>{money(regular)}</b>{missed > 0 && ` of ${money(regular + missed)} planned`}</div>
          {missed > 0 && <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--track)' }}><div className="h-full rounded-full" style={{ width: `${Math.round(regular / (regular + missed) * 100)}%`, background: 'var(--accent)' }} /></div>}
          <div className="text-[12px]" style={{ color: 'var(--text3)' }}>{putIn - regular > 0 ? `One-offs on top: ${money(putIn - regular)}` : 'No one-offs'}</div>
        </div>
      </div>

      <section className="wl-card overflow-hidden">
        <div className="px-4 md:px-5 pt-4 pb-3 flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-[15px] font-semibold" style={{ color: 'var(--text)' }}>What went in{multi ? ', month by month' : ''}</h2>
            <p className="text-[12px] mt-0.5" style={{ color: 'var(--text3)' }}>Tap an investment or an amount to see its payments, and edit or delete one.</p>
          </div>
          {kinds.length > 0 && <button onClick={() => setClosed(allOpen ? Object.fromEntries([...kinds.map(x => x.k), 'out'].map(k => [k, true])) : {})} className="text-[12.5px] font-semibold h-9" style={{ color: 'var(--accent2)' }}>{allOpen ? 'Show kinds only' : 'Show every investment'}</button>}
        </div>
        {!kinds.length && !taken.length ? <p className="px-5 pb-10 pt-4 text-center text-[13px]" style={{ color: 'var(--text3)' }}>Nothing put into investments in {periodLabel(period)}.</p> : (
          <div className="overflow-x-auto" style={{ borderTop: '1px solid var(--line)' }}>
            <table className="w-full text-[13px] border-separate" style={{ borderSpacing: 0 }}>
              <thead>
                <tr style={{ color: 'var(--text3)' }}>
                  <th scope="col" className={`${first} py-2.5 text-[11px] font-semibold uppercase tracking-[.05em]`} style={{ background: KIND_BG, boxShadow: '1px 0 0 var(--track)' }}>Investment</th>
                  {months.map(m => <th key={m} scope="col" className={`${cell} py-2.5 text-[11px] font-semibold uppercase tracking-[.04em]`} style={{ background: KIND_BG }}>{colLabel(m)}</th>)}
                  {multi && <th scope="col" className={`${last} py-2.5 text-[11px] font-semibold uppercase tracking-[.05em]`} style={{ background: KIND_BG, boxShadow: '-1px 0 0 var(--track)' }}>Total</th>}
                </tr>
              </thead>
              <tbody>
                {kinds.map(x => {
                  const open = !closed[x.k]
                  return (
                    <Fragment key={x.k}>
                      <tr style={{ background: KIND_BG }}>
                        <th scope="row" className={`${first} py-2.5`} style={{ background: KIND_BG, boxShadow: '1px 0 0 var(--track)', borderTop: '1px solid var(--line)' }}>
                          <button onClick={() => setClosed(c => ({ ...c, [x.k]: open }))} aria-expanded={open} className="flex items-center gap-2 w-full text-left min-h-[36px]">
                            <ChevronDown size={15} className="flex-shrink-0 transition-transform" style={{ color: 'var(--text3)', transform: open ? 'none' : 'rotate(-90deg)' }} />
                            <i className="w-2.5 h-2.5 rounded-[3px] flex-shrink-0" style={{ background: colors[x.k] }} />
                            <span className="min-w-0"><span className="block text-[13.5px] font-semibold" style={{ color: 'var(--text)' }}>{names[x.k]}</span>
                              <span className="block text-[11.5px] font-normal" style={{ color: 'var(--text3)' }}>{x.rows.length} {x.rows.length === 1 ? 'holding' : 'holdings'} · {pcts[x.k]}% of put in</span></span>
                          </button>
                        </th>
                        {months.map(m => <td key={m} className={`${cell} py-2.5`} style={{ borderTop: '1px solid var(--line)' }}>{amt(monthTotal(x.list, m), undefined, true)}</td>)}
                        {multi && <td className={`${last} py-2.5`} style={{ background: KIND_BG, boxShadow: '-1px 0 0 var(--track)', borderTop: '1px solid var(--line)' }}>{amt(x.total, undefined, true)}</td>}
                      </tr>
                      {open && x.rows.map(r => holdingRow(r))}
                    </Fragment>
                  )
                })}
                {outRows.length > 0 && (
                  <Fragment>
                    <tr style={{ background: KIND_BG }}>
                      <th scope="row" className={`${first} py-2.5`} style={{ background: KIND_BG, boxShadow: '1px 0 0 var(--track)', borderTop: '1px solid var(--line)' }}>
                        <button onClick={() => setClosed(c => ({ ...c, out: !c.out }))} aria-expanded={!closed.out} className="flex items-center gap-2 w-full text-left min-h-[36px]">
                          <ChevronDown size={15} className="flex-shrink-0 transition-transform" style={{ color: 'var(--text3)', transform: !closed.out ? 'none' : 'rotate(-90deg)' }} />
                          <span className="min-w-0"><span className="block text-[13.5px] font-semibold" style={{ color: 'var(--text)' }}>Taken out</span><span className="block text-[11.5px] font-normal" style={{ color: 'var(--text3)' }}>Sales and redemptions</span></span>
                        </button>
                      </th>
                      {months.map(m => <td key={m} className={`${cell} py-2.5`} style={{ borderTop: '1px solid var(--line)' }}>{amt(monthTotal(taken, m), undefined, true, true)}</td>)}
                      {multi && <td className={`${last} py-2.5`} style={{ background: KIND_BG, boxShadow: '-1px 0 0 var(--track)', borderTop: '1px solid var(--line)' }}>{amt(out, undefined, true, true)}</td>}
                    </tr>
                    {!closed.out && outRows.map(r => holdingRow(r, true))}
                  </Fragment>
                )}
              </tbody>
              <tfoot>
                {([['Total put in', (m?: string) => m ? monthTotal(mine, m) : putIn, false], ...(out > 0 ? [['Taken out', (m?: string) => m ? monthTotal(taken, m) : out, true], ['Net added', (m?: string) => m ? monthTotal(mine, m) - monthTotal(taken, m) : putIn - out, false]] : [])] as [string, (m?: string) => number, boolean][]).map(([label, f, neg], i) => (
                  <tr key={label}>
                    <th scope="row" className={`${first} py-2.5 text-[13px] font-bold`} style={{ background: FOOT_BG, color: 'var(--text)', boxShadow: '1px 0 0 var(--track)', borderTop: i ? '1px solid #E4E0FB' : '1.5px solid #D9D3FA' }}>{label}</th>
                    {months.map(m => { const v = f(m); return <td key={m} className={`${cell} py-2.5 font-bold tabular-nums`} style={{ background: FOOT_BG, borderTop: i ? '1px solid #E4E0FB' : '1.5px solid #D9D3FA', color: v === 0 ? 'var(--text4)' : neg || v < 0 ? '#B4231A' : 'var(--text)' }}>{v === 0 ? '—' : `${neg ? '−' : ''}${money(v)}`}</td> })}
                    {multi && (() => { const v = f(); return <td className={`${last} py-2.5 font-bold tabular-nums`} style={{ background: FOOT_BG, boxShadow: '-1px 0 0 var(--track)', borderTop: i ? '1px solid #E4E0FB' : '1.5px solid #D9D3FA', color: neg || v < 0 ? '#B4231A' : 'var(--accent2)' }}>{`${neg ? '−' : ''}${money(v)}`}</td> })()}
                  </tr>
                ))}
              </tfoot>
            </table>
          </div>
        )}
        {kinds.length > 0 && empty.length > 0 && <p className="px-4 md:px-5 py-2.5 text-[12px]" style={{ color: 'var(--text3)', borderTop: '1px solid var(--track)' }}>Nothing went into {empty.map(k => names[k]).join(', ').replace(/, ([^,]*)$/, ' or $1')} in {periodLabel(period)}.</p>}
      </section>

      <div className={`grid grid-cols-1 ${missing.length ? 'lg:grid-cols-2' : ''} gap-4 md:gap-5 items-start`}>
        {missing.length > 0 && missMonth && (
          <section className="rounded-[14px] p-4 md:px-5 flex flex-col gap-2.5" style={{ background: '#FFF9EC', border: '1px solid #F2DFB3' }}>
            <h2 className="text-[14.5px] font-semibold" style={{ color: 'var(--text)' }}>Planned for {monthName(missMonth)}, but no payment found</h2>
            {missing.map((x, i) => (
              <Link key={i} href={holdingHref('mutual_funds', x.fund.id)} className="flex items-center gap-2.5 min-h-[44px]">
                <span className="flex-1 min-w-0"><span className="block text-[13.5px] font-medium truncate" style={{ color: 'var(--text)' }}>{x.name} · SIP</span><span className="block text-[12px]" style={{ color: 'var(--text3)' }}>Due on the {ordinal(x.day)}</span></span>
                <span className="text-[13.5px] font-semibold tabular-nums" style={{ color: 'var(--text)' }}>{money(x.amount)}</span>
                <ChevronRight size={15} style={{ color: 'var(--text4)' }} />
              </Link>
            ))}
            <p className="text-[11.5px] leading-snug" style={{ color: '#6B5418' }}>Not counted in “Put in”. Paid it? Link its bank payment to the fund from Expenses, or record it on the fund’s page.</p>
          </section>
        )}
        <section className="wl-card p-4 md:px-5 flex flex-col gap-1.5">
          <h2 className="text-[14.5px] font-semibold" style={{ color: 'var(--text)' }}>What’s counted</h2>
          <p className="text-[12.5px] leading-relaxed" style={{ color: 'var(--text2)' }}>Fund and share buys and SIPs on their dates, RD instalments, new FDs, ETFs, gold, bonds, PPF / EPF, NPS and LIC premiums. Not counted: price changes, interest, dividends and maturities.</p>
          <p className="text-[12px] leading-snug" style={{ color: 'var(--text3)' }}>PPF, NPS and LIC follow their schedule, not bank records. Each month’s total here is the same as on the Growth tab.</p>
        </section>
      </div>

      {d && dh && (
        <Sheet title={dh.name} sub={`${HTYPES[dh.type].label} · ${drawer?.month ? monthName(drawer.month) : periodLabel(period)}`} onClose={() => setDrawer(null)}
          footer={<>
            <Link href={holdingHref(dh.type, dh.holding.id)} className="text-[13.5px] font-semibold inline-flex items-center gap-1 min-h-[44px]" style={{ color: 'var(--accent2)' }}>Open its page<ChevronRight size={15} /></Link>
            {drawer?.month && multi && <button onClick={() => setDrawer({ type: drawer.type, id: drawer.id })} className="ml-auto text-[13px] font-semibold min-h-[44px]" style={{ color: 'var(--text2)' }}>All of {periodLabel(period)}</button>}
          </>}>
          {(() => {
            const ins = d.es.filter(e => !taken.includes(e)), units = ins.reduce((s, e) => s + (e.txn ? Number(e.units) || 0 : 0), 0)
            return ins.length > 0 && <div><div className="text-[12px]" style={{ color: 'var(--text3)' }}>Put in</div><div className="text-[26px] font-bold tabular-nums" style={{ color: 'var(--text)' }}>{money(sum(ins))}</div>
              <div className="text-[12.5px]" style={{ color: 'var(--text2)' }}>{ins.length} payment{ins.length === 1 ? '' : 's'}{units > 0 ? ` · ${units.toLocaleString('en-IN', { maximumFractionDigits: 3 })} ${dh.type === 'stocks' ? 'shares' : 'units'} bought` : ''}</div></div>
          })()}
          {d.es.map(e => {
            const isOut = taken.includes(e)
            return (
              <div key={e.id} className="rounded-xl p-3.5 flex flex-col gap-2.5" style={e.estimated ? { border: '1px solid #F2DFB3', background: '#FFFCF3' } : { border: '1px solid var(--line)' }}>
                <div className="flex items-start gap-2.5">
                  <span className="flex-1 min-w-0"><span className="block text-[14px] font-semibold" style={{ color: 'var(--text)' }}>{e.how === 'Added' ? 'When you added it' : e.how}</span>
                    <span className="block text-[12px]" style={{ color: 'var(--text3)' }}>{[longDate(e.date), e.note].filter(Boolean).join(' · ')}</span></span>
                  {e.estimated && tag('Estimated units', true)}
                  <span className="text-[15px] font-bold tabular-nums" style={{ color: isOut ? '#B4231A' : 'var(--text)' }}>{isOut ? '−' : ''}{money(e.amount)}</span>
                </div>
                {e.txn && (e.units || e.price) ? (
                  <div className="grid grid-cols-2 gap-2 rounded-[10px] px-3 py-2" style={{ background: e.estimated ? '#fff' : 'var(--bg2)' }}>
                    <div><div className="text-[11px]" style={{ color: 'var(--text3)' }}>{e.type === 'stocks' ? 'Shares' : 'Units'}</div><div className="text-[13px] font-medium tabular-nums" style={{ color: 'var(--text)' }}>{e.units != null ? `${e.estimated ? '≈ ' : ''}${e.units.toLocaleString('en-IN', { maximumFractionDigits: 3 })}` : '—'}</div></div>
                    <div><div className="text-[11px]" style={{ color: 'var(--text3)' }}>{e.type === 'mutual_funds' ? 'NAV' : 'Price'}</div><div className="text-[13px] font-medium tabular-nums" style={{ color: 'var(--text)' }}>{e.price != null ? `${cur === 'AED' ? 'AED ' : '₹'}${e.price.toLocaleString('en-IN', { maximumFractionDigits: 4 })}` : '—'}</div></div>
                  </div>
                ) : null}
                {editable(e) ? (
                  <div className="flex gap-2 wl-hide-viewing">
                    <button onClick={() => setEdit(e)} className="wl-btn" style={{ height: 40, fontSize: 13 }}><Pencil size={14} />{e.estimated ? 'Edit or confirm units' : 'Edit'}</button>
                    <button onClick={() => setDel(e)} className="wl-btn" style={{ height: 40, fontSize: 13, color: '#B4231A', borderColor: '#F1D2CF' }}><Trash2 size={14} />Delete</button>
                  </div>
                ) : (
                  <p className="text-[12px]" style={{ color: 'var(--text3)' }}>{e.scheduled ? 'Worked out from its schedule. Change the amount or start date on its page.' : e.how === 'Added' ? 'From the holding itself, not a dated purchase. Change it on its page, or add its purchases there.' : 'Change it on its page.'}</p>
                )}
              </div>
            )
          })}
        </Sheet>
      )}
      {edit && <EditPaymentSheet entry={edit} holdings={holdings[edit.type as 'mutual_funds' | 'stocks'] ?? []} onClose={() => setEdit(null)} onDone={done} onDelete={() => { setDel(edit); setEdit(null) }} />}
      {del && <DeletePaymentSheet entry={del} periodTotal={drawer?.month ? monthTotal(mine, drawer.month) : putIn} periodLabel={drawer?.month ? monthName(drawer.month) : periodLabel(period)} onClose={() => setDel(null)} onDone={done} />}
    </div>
  )
}
