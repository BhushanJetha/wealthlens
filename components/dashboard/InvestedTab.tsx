'use client'
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Pencil, Trash2 } from 'lucide-react'
import { fmtMoney } from '@/lib/format'
import { HTYPES, holdingHref } from '@/lib/holding'
import { addMonth, monthsBetween, missingSips, FLOW_KEYS, type FlowKey, type InvEntry } from '@/lib/investEntries'
import { Sheet, EditPaymentSheet, DeletePaymentSheet } from '@/components/forms/EditPaymentSheet'

export interface Period { from: string; to: string }   // months, YYYY-MM
const PRESETS = ['this', 'last', 'last3', 'year', 'custom'] as const
type Preset = (typeof PRESETS)[number]
const PRESET_LABEL: Record<Preset, string> = { this: 'This month', last: 'Last month', last3: 'Last 3 months', year: 'This year', custom: 'Pick months' }
export function presetPeriod(p: Exclude<Preset, 'custom'>, now: string): Period {
  if (p === 'this') return { from: now, to: now }
  if (p === 'last') return { from: addMonth(now, -1), to: addMonth(now, -1) }
  if (p === 'last3') return { from: addMonth(now, -2), to: now }
  return { from: `${now.slice(0, 4)}-01`, to: now }
}
const monthName = (m: string, opts: Intl.DateTimeFormatOptions = { month: 'long', year: 'numeric' }) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString('en-GB', { ...opts, timeZone: 'UTC' })
export const periodLabel = (p: Period) => p.from === p.to ? monthName(p.from)
  : p.from.slice(0, 4) === p.to.slice(0, 4) ? `${monthName(p.from, { month: 'short' })} – ${monthName(p.to, { month: 'short', year: 'numeric' })}`
  : `${monthName(p.from, { month: 'short', year: 'numeric' })} – ${monthName(p.to, { month: 'short', year: 'numeric' })}`
const shortDate = (d: string) => new Date(`${d.slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
const longDate = (d: string) => new Date(`${d.slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
const ordinal = (n: number) => `${n}${['th', 'st', 'nd', 'rd'][(n % 10 > 3 || [11, 12, 13].includes(n % 100)) ? 0 : n % 10]}`
const editable = (e: InvEntry) => !!e.txn?.id && (e.type === 'mutual_funds' || e.type === 'stocks')
const REGULAR = new Set(['SIP', 'Instalment'])

// Investments › Invested: for a month (or any months) what went into each
// investment — kind by kind, holding by holding, payment by payment — what was
// taken out, and planned SIPs with no payment. Each fund or share payment can
// be edited or deleted here. The same payments make up the Growth tab's totals.
export default function InvestedTab({ entries, outs, funds, holdings, conv, colors, names, cur, today, period, onPeriod }: {
  entries: InvEntry[]; outs: InvEntry[]; funds: any[]; holdings: { mutual_funds: any[]; stocks: any[] }; conv: (amt: number, cur: string) => number
  colors: Record<FlowKey, string>; names: Record<FlowKey, string>; cur: string; today: string
  period: Period; onPeriod: (p: Period) => void
}) {
  const router = useRouter()
  const now = today.slice(0, 7)
  const money = (n: number) => fmtMoney(n, cur)
  const preset: Preset = (['this', 'last', 'last3', 'year'] as const).find(p => { const x = presetPeriod(p, now); return x.from === period.from && x.to === period.to }) ?? 'custom'
  const [custom, setCustom] = useState(preset === 'custom')
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const [drawer, setDrawer] = useState<{ type: string; id: string } | null>(null)
  const [edit, setEdit] = useState<InvEntry | null>(null)
  const [del, setDel] = useState<InvEntry | null>(null)
  const single = period.from === period.to
  const span = monthsBetween(period.from, period.to) + 1
  const step = (n: number) => {
    const to = addMonth(period.to, n * span)
    if (to > now) return
    onPeriod({ from: addMonth(period.from, n * span), to })
  }

  const inP = (e: InvEntry) => e.month >= period.from && e.month <= period.to
  const mine = useMemo(() => entries.filter(inP).sort((a, b) => a.date.localeCompare(b.date)), [entries, period]) // eslint-disable-line react-hooks/exhaustive-deps
  const taken = useMemo(() => outs.filter(inP).sort((a, b) => a.date.localeCompare(b.date)), [outs, period]) // eslint-disable-line react-hooks/exhaustive-deps
  const missing = useMemo(() => single && period.from <= now ? missingSips(funds, entries, period.from, today, conv) : [], [single, period, funds, entries, today, conv]) // eslint-disable-line react-hooks/exhaustive-deps
  const putIn = mine.reduce((s, e) => s + e.amount, 0)
  const out = taken.reduce((s, e) => s + e.amount, 0)
  const regular = mine.filter(e => REGULAR.has(e.how)).reduce((s, e) => s + e.amount, 0)
  const missed = missing.reduce((s, x) => s + x.amount, 0)
  const holdingsCount = new Set(mine.map(e => e.holding.id)).size

  // Kind → holding → its payments, biggest first
  const kinds = useMemo(() => FLOW_KEYS.map(k => {
    const list = mine.filter(e => e.key === k)
    const byHolding = new Map<string, InvEntry[]>()
    list.forEach(e => byHolding.set(e.holding.id, [...(byHolding.get(e.holding.id) ?? []), e]))
    const rows = Array.from(byHolding.values()).map(es => ({ es, total: es.reduce((s, e) => s + e.amount, 0) })).sort((a, b) => b.total - a.total)
    return { k, total: list.reduce((s, e) => s + e.amount, 0), count: list.length, rows }
  }).filter(x => x.total > 0).sort((a, b) => b.total - a.total), [mine])
  const empty = FLOW_KEYS.filter(k => !kinds.some(x => x.k === k) && entries.some(e => e.key === k))
  // Whole-number shares that add up to 100
  const pcts = (() => {
    if (!(putIn > 0)) return {} as Record<string, number>
    const raw = kinds.map(x => ({ k: x.k, v: x.total / putIn * 100 })), fl = raw.map(r => ({ ...r, f: Math.floor(r.v) }))
    let left = 100 - fl.reduce((s, r) => s + r.f, 0)
    fl.slice().sort((a, b) => (b.v - b.f) - (a.v - a.f)).forEach(r => { if (left > 0) { r.f++; left-- } })
    return Object.fromEntries(fl.map(r => [r.k, r.f]))
  })()

  const sub = (es: InvEntry[]) => {
    if (es.length === 1) { const e = es[0]; return [e.how === 'Added' ? 'When added' : e.note?.startsWith(e.how) ? null : e.how, e.note && e.how !== 'Added' ? e.note : null, shortDate(e.date)].filter(Boolean).join(' · ') }
    if (es.length <= 3) return es.map(e => `${e.how} ${shortDate(e.date)} ${money(e.amount)}`).join(' · ')
    const hows = Array.from(new Set(es.map(e => e.how)))
    return `${es.length} payments · ${hows.join(', ')}`
  }
  const tag = (t: string, warn = false) => <span key={t} className="text-[11px] font-semibold rounded-full px-2 py-[3px] whitespace-nowrap" style={warn ? { background: '#FFF4DE', color: '#7A5300' } : { background: 'var(--bg2)', color: 'var(--text2)' }}>{t}</span>
  const done = () => { setEdit(null); setDel(null); router.refresh() }

  const d = drawer ? { es: [...mine, ...taken].filter(e => e.holding.id === drawer.id && e.type === drawer.type).sort((a, b) => a.date.localeCompare(b.date)) } : null
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
        <div className="wl-card px-4 py-3.5"><div className="text-[12px]" style={{ color: 'var(--text3)' }}>Put in</div><div className="text-[20px] md:text-[24px] font-bold tabular-nums" style={{ color: 'var(--text)' }}>{money(putIn)}</div><div className="text-[12px]" style={{ color: 'var(--text3)' }}>{mine.length ? `${mine.length} payment${mine.length === 1 ? '' : 's'} into ${holdingsCount} holding${holdingsCount === 1 ? '' : 's'}` : 'Nothing put in'}</div></div>
        <div className="wl-card px-4 py-3.5"><div className="text-[12px]" style={{ color: 'var(--text3)' }}>Taken out</div><div className="text-[20px] md:text-[24px] font-bold tabular-nums" style={{ color: 'var(--text)' }}>{money(out)}</div><div className="text-[12px] truncate" style={{ color: 'var(--text3)' }}>{taken.length ? `${taken.length} sale${taken.length === 1 ? '' : 's'}${taken.length === 1 ? ` · ${taken[0].name}` : ''}` : 'No sales'}</div></div>
        <div className="wl-card px-4 py-3.5"><div className="text-[12px]" style={{ color: 'var(--text3)' }}>Net added</div><div className="text-[20px] md:text-[24px] font-bold tabular-nums" style={{ color: putIn - out >= 0 ? 'var(--accent2)' : '#B4231A' }}>{money(putIn - out)}</div><div className="text-[12px]" style={{ color: 'var(--text3)' }}>Put in − taken out</div></div>
        <div className="wl-card px-4 py-3.5 flex flex-col gap-1">
          <div className="text-[12px]" style={{ color: 'var(--text3)' }}>Regular (SIPs + RDs)</div>
          <div className="text-[13px]" style={{ color: 'var(--text2)' }}><b className="text-[18px] md:text-[20px] tabular-nums" style={{ color: 'var(--text)' }}>{money(regular)}</b>{missed > 0 && ` of ${money(regular + missed)} planned`}</div>
          {missed > 0 && <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--track)' }}><div className="h-full rounded-full" style={{ width: `${Math.round(regular / (regular + missed) * 100)}%`, background: 'var(--accent)' }} /></div>}
          <div className="text-[12px]" style={{ color: 'var(--text3)' }}>{putIn - regular > 0 ? `One-offs on top: ${money(putIn - regular)}` : 'No one-offs'}</div>
        </div>
      </div>

      {putIn > 0 && (
        <section className="wl-card p-4 md:p-5 flex flex-col gap-3">
          <div className="flex justify-between items-baseline gap-3 flex-wrap"><h2 className="text-[15px] font-semibold" style={{ color: 'var(--text)' }}>Where it went</h2><span className="text-[12px]" style={{ color: 'var(--text3)' }}>{money(putIn)} put in, by kind</span></div>
          <div role="img" aria-label={kinds.map(x => `${names[x.k]} ${pcts[x.k]}%`).join(', ')} className="flex gap-[2px] h-3.5">
            {kinds.map((x, i) => <div key={x.k} style={{ flex: `${x.total} 1 0`, background: colors[x.k], borderRadius: `${i === 0 ? 4 : 0}px ${i === kinds.length - 1 ? 4 : 0}px ${i === kinds.length - 1 ? 4 : 0}px ${i === 0 ? 4 : 0}px` }} />)}
          </div>
          <div className="flex gap-x-5 gap-y-1.5 flex-wrap text-[12.5px]">
            {kinds.map(x => <span key={x.k} className="inline-flex items-center gap-2" style={{ color: 'var(--text2)' }}><i className="w-2.5 h-2.5 rounded-[3px]" style={{ background: colors[x.k] }} />{names[x.k]} <b className="tabular-nums" style={{ color: 'var(--text)' }}>{money(x.total)}</b><span style={{ color: 'var(--text3)' }}>{pcts[x.k]}%</span></span>)}
          </div>
        </section>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px] gap-4 md:gap-5 items-start">
        <div className="flex flex-col gap-3.5 min-w-0">
          {kinds.map(x => {
            const isOpen = open[x.k] ?? true
            return (
              <section key={x.k} className="wl-card overflow-hidden">
                <button onClick={() => setOpen(o => ({ ...o, [x.k]: !isOpen }))} aria-expanded={isOpen} className="w-full flex items-center gap-3 px-4 md:px-5 py-3.5 text-left">
                  <i className="w-2.5 h-2.5 rounded-[3px] flex-shrink-0" style={{ background: colors[x.k] }} />
                  <span className="flex-1 min-w-0"><span className="block text-[14.5px] font-semibold" style={{ color: 'var(--text)' }}>{names[x.k]}</span>
                    <span className="block text-[12px]" style={{ color: 'var(--text3)' }}>{x.count} payment{x.count === 1 ? '' : 's'} into {x.rows.length} {x.rows.length === 1 ? 'holding' : 'holdings'}</span></span>
                  <span className="text-right flex-shrink-0"><span className="block text-[15.5px] font-bold tabular-nums" style={{ color: 'var(--text)' }}>{money(x.total)}</span><span className="block text-[11.5px]" style={{ color: 'var(--text3)' }}>{pcts[x.k]}% of put in</span></span>
                  {isOpen ? <ChevronUp size={17} style={{ color: 'var(--text3)' }} /> : <ChevronDown size={17} style={{ color: 'var(--text3)' }} />}
                </button>
                {isOpen && x.rows.map(({ es, total }) => {
                  const e = es[0], est = es.filter(y => y.estimated).length, hows = Array.from(new Set(es.map(y => y.how === 'Added' ? 'When added' : y.how)))
                  return (
                    <button key={e.holding.id} onClick={() => setDrawer({ type: e.type, id: e.holding.id })} className="w-full flex items-center gap-3 px-4 md:px-5 py-2.5 min-h-[52px] text-left hover:bg-[#FAFAFE]" style={{ borderTop: '1px solid var(--track)' }}>
                      <span className="flex-1 min-w-0"><span className="block text-[13.5px] font-medium md:truncate" style={{ color: 'var(--text)' }}>{e.name}</span>
                        <span className="block text-[12px] md:truncate" style={{ color: 'var(--text3)' }}>{sub(es)}</span>
                        <span className="flex gap-1.5 mt-1 md:hidden">{est > 0 && tag(`${est} estimated`, true)}</span></span>
                      <span className="hidden md:flex gap-1.5">{est > 0 && tag(`${est} estimated`, true)}{hows.slice(0, 2).map(t => tag(es.length > 1 && t !== 'When added' ? `${es.filter(y => y.how === t).length} ${t === 'SIP' ? 'SIPs' : t}` : t))}</span>
                      <span className="w-[86px] text-right text-[13.5px] font-semibold tabular-nums flex-shrink-0" style={{ color: 'var(--text)' }}>{money(total)}</span>
                      <ChevronRight size={15} style={{ color: 'var(--text4)' }} />
                    </button>
                  )
                })}
              </section>
            )
          })}
          {!kinds.length && <div className="wl-card px-5 py-10 text-center text-[13px]" style={{ color: 'var(--text3)' }}>Nothing put into investments in {periodLabel(period)}.</div>}
          {kinds.length > 0 && empty.length > 0 && <p className="text-[12px] px-1" style={{ color: 'var(--text3)' }}>Nothing went into {empty.map(k => names[k]).join(', ').replace(/, ([^,]*)$/, ' or $1')} in {periodLabel(period)}.</p>}
        </div>

        <div className="flex flex-col gap-3.5 min-w-0">
          {taken.length > 0 && (
            <section className="wl-card overflow-hidden">
              <div className="flex justify-between items-baseline px-4 md:px-5 pt-4 pb-2.5"><h2 className="text-[14.5px] font-semibold" style={{ color: 'var(--text)' }}>Taken out</h2><span className="text-[14.5px] font-bold tabular-nums" style={{ color: 'var(--text)' }}>{money(out)}</span></div>
              {taken.map(e => (
                <button key={e.id} onClick={() => setDrawer({ type: e.type, id: e.holding.id })} className="w-full flex items-center gap-2.5 px-4 md:px-5 py-2.5 min-h-[48px] text-left hover:bg-[#FAFAFE]" style={{ borderTop: '1px solid var(--track)' }}>
                  <i className="w-2.5 h-2.5 rounded-[3px] flex-shrink-0" style={{ background: colors[e.key] }} />
                  <span className="flex-1 min-w-0"><span className="block text-[13.5px] font-medium truncate" style={{ color: 'var(--text)' }}>{e.name}</span><span className="block text-[12px]" style={{ color: 'var(--text3)' }}>{e.how}{e.units ? ` ${+e.units.toFixed(3)} ${e.type === 'stocks' ? 'shares' : 'units'}` : ''} · {shortDate(e.date)}</span></span>
                  <span className="text-[13.5px] font-semibold tabular-nums" style={{ color: 'var(--text)' }}>{money(e.amount)}</span>
                </button>
              ))}
              <p className="px-4 md:px-5 py-2.5 text-[11.5px]" style={{ color: 'var(--text3)', borderTop: '1px solid var(--track)' }}>Sales and redemptions, kept apart so “Put in” stays what you actually invested.</p>
            </section>
          )}
          {missing.length > 0 && (
            <section className="rounded-[14px] p-4 md:px-5 flex flex-col gap-2.5" style={{ background: '#FFF9EC', border: '1px solid #F2DFB3' }}>
              <h2 className="text-[14.5px] font-semibold" style={{ color: 'var(--text)' }}>Planned, but no payment found</h2>
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
          <section className="wl-card p-4 md:px-5 flex flex-col gap-2">
            <h2 className="text-[14.5px] font-semibold" style={{ color: 'var(--text)' }}>What’s counted</h2>
            <ul className="list-disc pl-[18px] text-[12.5px] leading-relaxed" style={{ color: 'var(--text2)' }}>
              <li>Fund and share buys and SIPs, on their dates</li>
              <li>RD instalments and new FDs</li>
              <li>ETFs, gold, bonds, PPF / EPF, NPS and LIC premiums</li>
            </ul>
            <p className="text-[12px] leading-snug" style={{ color: 'var(--text3)' }}>Not counted: price changes, interest, dividends and maturities. PPF, NPS and LIC follow their schedule, not bank records.</p>
            <p className="text-[12px] leading-snug" style={{ color: 'var(--text3)' }}>Wrong amount or investment? Open it and use Edit or Delete on the payment.</p>
          </section>
        </div>
      </div>

      {d && dh && (
        <Sheet title={dh.name} sub={`${HTYPES[dh.type].label} · ${periodLabel(period)}`} onClose={() => setDrawer(null)}
          footer={<Link href={holdingHref(dh.type, dh.holding.id)} className="text-[13.5px] font-semibold inline-flex items-center gap-1 min-h-[44px]" style={{ color: 'var(--accent2)' }}>Open its page, every month<ChevronRight size={15} /></Link>}>
          {(() => {
            const ins = d.es.filter(e => !taken.includes(e)), sum = ins.reduce((s, e) => s + e.amount, 0), units = ins.reduce((s, e) => s + (e.txn ? Number(e.units) || 0 : 0), 0)
            return ins.length > 0 && <div><div className="text-[12px]" style={{ color: 'var(--text3)' }}>Put in</div><div className="text-[26px] font-bold tabular-nums" style={{ color: 'var(--text)' }}>{money(sum)}</div>
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
      {del && <DeletePaymentSheet entry={del} periodTotal={putIn} periodLabel={periodLabel(period)} onClose={() => setDel(null)} onDone={done} />}
    </div>
  )
}
