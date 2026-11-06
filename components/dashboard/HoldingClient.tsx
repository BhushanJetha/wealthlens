'use client'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronLeft, MoreHorizontal, Pencil, Plus, CalendarClock, RefreshCw, Trash2, X, Loader2 } from 'lucide-react'
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, ReferenceLine, CartesianGrid } from 'recharts'
import { createClient } from '@/lib/supabase/client'
import { fmtMoney, fmtCompact } from '@/lib/format'
import { HTYPES, BENCH, holdingModel, projectValue, rdMaturity, saleCost, fyLabel, type HType, type Lot, type HoldingModel } from '@/lib/holding'
import { localToday } from '@/lib/insights'
import { toast } from '@/components/ui/toaster'
import { Segmented } from '@/components/ui/kit'
import Pagination from './Pagination'
import BatchPurchaseModal from '@/components/forms/BatchPurchaseModal'
import EditHoldingModal from '@/components/forms/EditHoldingModal'
import EditLotModal from '@/components/forms/EditLotModal'
import AddInvestmentModal from '@/components/forms/AddInvestmentModal'

// Kinds edited with the shared investment form (PPF / EPF has its own on its page)
const EDIT_TYPE: Partial<Record<HType, string>> = { etf_investments: 'etf', fixed_deposits: 'fixed_deposit', recurring_deposits: 'recurring_deposit', bond_investments: 'bond', nps_accounts: 'nps', gold_investments: 'gold', lic_policies: 'lic' }

type Range = '1Y' | '3Y' | '5Y' | 'Mine'
const RANGE_MONTHS: Record<Range, number> = { '1Y': 12, '3Y': 36, '5Y': 60, Mine: 600 }
const LOT_TINT: Record<Lot['kind'], { bg: string; c: string }> = {
  SIP: { bg: 'var(--accent-bg)', c: 'var(--accent2)' }, 'Lump sum': { bg: '#FFF2E2', c: '#A35A12' }, Opening: { bg: '#F1F0F7', c: 'var(--text2)' },
  Sold: { bg: '#FDECEA', c: '#B4231A' }, Dividend: { bg: '#E7F7EF', c: '#1E7A50' }, Other: { bg: '#F1F0F7', c: 'var(--text2)' },
}
const card = 'wl-card p-4 md:p-5'
const H2 = ({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) => (
  <div className="flex items-center justify-between gap-2 mb-3"><h2 className="text-[14.5px] md:text-[15px] font-semibold" style={{ color: 'var(--text)' }}>{children}</h2>{right}</div>
)
const fmtDate = (d: string) => new Date(`${d.slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })

// One holding's page (lib/holding): value and return, its price chart, what
// you hold, its SIP, every purchase (paged), tax if you sold today, and where
// it could go. The same page for every kind; sections show when they apply.
export default function HoldingClient({ type, row, txns, kindTotal, accounts = [] }: { type: HType; row: any; txns: any[]; kindTotal: number; accounts?: any[] }) {
  const router = useRouter()
  const meta = HTYPES[type], market = type === 'mutual_funds' || type === 'stocks' || type === 'etf_investments'
  const [today, setToday] = useState(localToday())
  useEffect(() => { setToday(localToday()) }, [])
  const [series, setSeries] = useState<{ date: string; v: number }[] | null>(null)
  const [livePrice, setLivePrice] = useState<number | null>(null)
  const [range, setRange] = useState<Range>('3Y')
  const m = useMemo(() => holdingModel(type, row, txns, today, { price: livePrice }), [type, row, txns, today, livePrice])
  const cur = m.currency, money = (n: number) => fmtMoney(n, cur), short = (n: number) => fmtCompact(n, cur)
  // NAV and share prices keep their paise / fils
  const price = (n: number) => `${cur === 'AED' ? 'AED ' : '₹'}${n.toLocaleString(cur === 'AED' ? 'en-US' : 'en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  const share = kindTotal > 0 ? m.value / kindTotal * 100 : null

  // Price history: NAV for a fund, weekly closes for a share or ETF
  useEffect(() => {
    let off = false
    const c = m.chart
    if (!c) { setSeries([]); return }
    const url = c.kind === 'nav' ? (c.code ? `/api/mf-nav?schemeCode=${c.code}&months=60` : null) : `/api/stock-price?symbol=${encodeURIComponent(c.symbol)}&history=5y`
    if (!url) { setSeries([]); return }
    fetch(url).then(r => r.json()).then(j => {
      if (off) return
      const pts = (j?.data ?? []).map((p: any) => c.kind === 'nav' ? { date: `${p.month}-01`, v: Number(p.nav) } : { date: p.date, v: Number(p.price) }).filter((p: any) => p.v > 0)
      setSeries(pts)
      if (c.kind === 'nav' && pts.length) setLivePrice(pts[pts.length - 1].v)
    }).catch(() => !off && setSeries([]))
    if (c.kind === 'price') fetch(`/api/stock-price?symbol=${encodeURIComponent(c.symbol)}`).then(r => r.json()).then(j => { if (!off && Number(j?.price) > 0) setLivePrice(Number(j.price)) }).catch(() => {})
    return () => { off = true }
  }, [m.chart?.kind, (m.chart as any)?.code, (m.chart as any)?.symbol]) // eslint-disable-line react-hooks/exhaustive-deps

  // FD / RD: the path from opening to maturity
  const path = useMemo(() => {
    if (type === 'fixed_deposits' && row.start_date && row.maturity_date && m.rate) {
      const n = Math.max(1, Math.round((Date.parse(row.maturity_date) - Date.parse(row.start_date)) / (30.44 * 864e5)))
      return Array.from({ length: n + 1 }, (_, k) => { const d = new Date(Date.parse(row.start_date)); d.setUTCMonth(d.getUTCMonth() + k); return { date: d.toISOString().slice(0, 10), v: (Number(row.principal) || 0) * Math.pow(1 + m.rate / 400, 4 * k / 12) } })
    }
    if (type === 'recurring_deposits' && row.start_date && m.rate) {
      const n = Number(row.tenure_months) || 0
      return n > 0 ? Array.from({ length: n + 1 }, (_, k) => { const d = new Date(Date.parse(row.start_date)); d.setUTCMonth(d.getUTCMonth() + k); return { date: d.toISOString().slice(0, 10), v: rdMaturity(Number(row.monthly_amount) || 0, m.rate, k) } }) : null
    }
    return null
  }, [type, row, m.rate])

  // No price history (scheme not matched yet, or a kind without prices): what
  // you've put in over time, from your purchases
  const putIn = useMemo(() => {
    const buys = [...m.lots].filter(l => l.kind !== 'Dividend').sort((a, b) => a.date.localeCompare(b.date))
    if (buys.length < 2) return null
    let total = 0
    // A sale takes out what the sold units cost, not what they fetched
    const soldCost = new Map(m.sales.map(x => [x.id, x.cost]))
    return buys.map(l => ({ date: l.date, v: (total += l.kind === 'Sold' ? -(soldCost.get(l.id) ?? 0) : l.amount) }))
  }, [m.lots, m.sales])

  const shown = useMemo(() => {
    if (!series?.length) return []
    if (range === 'Mine' && m.since) return series.filter(p => p.date >= m.since!.slice(0, 7))
    const from = new Date(); from.setMonth(from.getMonth() - RANGE_MONTHS[range])
    return series.filter(p => p.date >= from.toISOString().slice(0, 10))
  }, [series, range, m.since])
  const growth = shown.length > 1 ? (() => {
    const yrs = (Date.parse(shown[shown.length - 1].date) - Date.parse(shown[0].date)) / (365.25 * 864e5)
    return yrs >= 0.9 ? Math.round((Math.pow(shown[shown.length - 1].v / shown[0].v, 1 / yrs) - 1) * 1000) / 10 : null
  })() : null

  const [sheet, setSheet] = useState<null | 'buy' | 'edit' | 'edit2' | 'sip' | 'repick' | 'delete' | 'sell' | 'renew' | 'paidout'>(null)
  const [menu, setMenu] = useState(false)
  const [editLot, setEditLot] = useState<any | null>(null)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [lotFilter, setLotFilter] = useState<'all' | 'SIP' | 'Lump sum'>('all')
  const lots = m.lots.filter(l => lotFilter === 'all' || l.kind === lotFilter)
  const paged = lots.slice((page - 1) * pageSize, page * pageSize)
  const [sipNow, setSipNow] = useState(m.sip?.amount ?? (type === 'recurring_deposits' ? 0 : 0))
  const rateUsed = growth != null && market ? Math.min(Math.max(growth, 4), BENCH[type === 'mutual_funds' ? 'equity' : 'stock'] + 4) : m.rate || 8
  const done = () => { setSheet(null); router.refresh() }
  const editable = type === 'mutual_funds' || type === 'stocks'
  const kindFor = type === 'stocks' ? 'stock' : 'mutual_fund'
  const benchRate = type === 'mutual_funds' ? (BENCH[String(row.fund_type ?? '').toLowerCase()] ?? 12) : type === 'stocks' ? BENCH.stock : type === 'etf_investments' ? BENCH.etf : null

  return (
    <div className="flex flex-col gap-4 md:gap-5 animate-fade-up max-w-[1120px]">
      <Link href={meta.list} className="text-[13px] font-semibold inline-flex items-center gap-1 self-start" style={{ color: 'var(--accent2)' }}><ChevronLeft size={15} />{meta.plural}</Link>

      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <span className="w-12 h-12 rounded-[14px] flex items-center justify-center flex-shrink-0 text-[19px] font-bold" style={{ background: 'var(--accent-bg)', color: 'var(--accent2)' }}>{m.name.trim().charAt(0).toUpperCase()}</span>
          <div className="min-w-0">
            <h1 className="text-[20px] md:text-[24px] font-bold tracking-[-0.01em] leading-tight" style={{ color: 'var(--text)' }}>{m.name}</h1>
            <div className="flex gap-1.5 mt-1.5 flex-wrap text-[12px]">
              <span className="rounded-md px-2 py-[3px] font-semibold" style={{ background: 'var(--accent-bg)', color: 'var(--accent2)' }}>{m.sub || meta.label}</span>
              {m.price != null && <span className="rounded-md px-2 py-[3px] font-semibold" style={{ background: '#E7F7EF', color: '#1E7A50' }}>{type === 'mutual_funds' ? 'NAV' : 'Price'} {price(m.price)}{livePrice ? ' · live' : ''}</span>}
            </div>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap wl-hide-viewing">
          {editable && <button onClick={() => setSheet('buy')} className="wl-btn wl-btn-primary" style={{ height: 40 }}><Plus size={15} />Buy more</button>}
          {type === 'mutual_funds' && <button onClick={() => setSheet('sip')} className="wl-btn" style={{ height: 40 }}><CalendarClock size={15} />{m.sip ? 'Change SIP' : 'Start a SIP'}</button>}
          {market && (m.units ?? 0) > 0 && <button onClick={() => setSheet('sell')} className="wl-btn" style={{ height: 40 }}>{type === 'mutual_funds' ? 'Redeem' : 'Sell'}</button>}
          {editable ? <button onClick={() => setSheet('edit')} className="wl-btn" style={{ height: 40 }}><Pencil size={14} />Edit</button>
            : EDIT_TYPE[type] ? <button onClick={() => setSheet('edit2')} className="wl-btn" style={{ height: 40 }}><Pencil size={14} />Edit</button>
            : <Link href={meta.list} className="wl-btn" style={{ height: 40 }}><Pencil size={14} />Edit on {meta.plural}</Link>}
          <div className="relative">
            <button onClick={() => setMenu(v => !v)} aria-label="More" aria-expanded={menu} className="wl-btn" style={{ height: 40, width: 40, padding: 0, justifyContent: 'center' }}><MoreHorizontal size={17} /></button>
            {menu && (
              <div className="absolute right-0 top-[44px] z-30 w-[220px] rounded-xl bg-white py-1" style={{ border: '1px solid var(--line)', boxShadow: '0 12px 32px rgba(15,23,42,.14)' }} onMouseLeave={() => setMenu(false)}>
                {type === 'mutual_funds' && <button onClick={() => { setMenu(false); setSheet('repick') }} className="w-full flex items-center gap-2 px-3 py-2.5 text-left text-[13px] hover:bg-[var(--bg2)]"><RefreshCw size={14} />Wrong NAV? Re-pick the scheme</button>}
                <button onClick={() => { setMenu(false); setSheet('delete') }} className="w-full flex items-center gap-2 px-3 py-2.5 text-left text-[13px] hover:bg-[var(--bg2)]" style={{ color: '#B4231A' }}><Trash2 size={14} />Delete</button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-4 md:gap-5 wl-even">
        <section className={`${card} flex flex-col gap-3 min-w-0`}>
          <div className="flex justify-between gap-3 flex-wrap">
            <div>
              <div className="text-[12.5px]" style={{ color: 'var(--text3)' }}>{type === 'lic_policies' ? 'Paid so far' : type === 'recurring_deposits' ? 'Paid in so far' : 'Your value'}</div>
              <div className="text-[28px] md:text-[34px] font-bold tracking-[-0.02em] tabular-nums" style={{ color: 'var(--text)' }}>{money(m.value)}</div>
              {m.gainPct != null ? (
                <div className="text-[13.5px] font-semibold mt-0.5" style={{ color: m.gain >= 0 ? 'var(--pos-text)' : '#B4231A' }}>
                  {m.gain >= 0 ? '+' : '−'}{money(Math.abs(m.gain))} · {m.gain >= 0 ? '+' : ''}{m.gainPct.toFixed(1)}%{m.xirr != null ? ` · ${m.xirr}% a year` : ''}
                </div>
              ) : m.maturity?.amount ? <div className="text-[13.5px] mt-0.5" style={{ color: 'var(--text2)' }}>{money(m.maturity.amount)} at maturity{m.maturity.date ? `, ${fmtDate(m.maturity.date)}` : ''}</div> : null}
            </div>
            {!!series?.length && <Segmented label="Chart range" value={range} onChange={setRange} options={(['1Y', '3Y', '5Y', 'Mine'] as Range[]).map(r => ({ value: r, label: r === 'Mine' ? 'Since you bought' : r }))} />}
          </div>
          {series === null && m.chart ? <div className="h-[230px] rounded-xl animate-pulse" style={{ background: 'var(--bg2)' }} />
            : shown.length > 1 || path || putIn ? (
              <div className="h-[230px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={shown.length > 1 ? shown : path ?? putIn!} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke="#EFEEF6" />
                    <XAxis dataKey="date" tickFormatter={d => new Date(d).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' })} tick={{ fontSize: 11, fill: '#5B6078' }} axisLine={false} tickLine={false} minTickGap={40} />
                    <YAxis tickFormatter={v => shown.length > 1 ? Number(v).toFixed(0) : short(v)} tick={{ fontSize: 11, fill: '#5B6078' }} axisLine={false} tickLine={false} width={52} domain={['auto', 'auto']} />
                    <Tooltip formatter={(v: any) => [shown.length > 1 ? price(Number(v)) : money(Number(v)), shown.length > 1 ? (type === 'mutual_funds' ? 'NAV' : 'Price') : path ? 'Value' : 'Put in so far']} labelFormatter={(d: any) => fmtDate(String(d))} />
                    <Area type={shown.length > 1 || path ? 'monotone' : 'stepAfter'} dataKey="v" stroke="#6A55E8" strokeWidth={2.2} fill="#6A55E8" fillOpacity={0.08} dot={false} />
                    {shown.length > 1 && m.avg && <ReferenceLine y={m.avg} stroke="#E58A2B" strokeDasharray="5 5" label={{ value: `Your average ${price(m.avg)}`, position: 'insideBottomLeft', fill: '#A35A12', fontSize: 11 }} />}
                    {!shown.length && path && <ReferenceLine x={path.reduce((b, p) => (p.date <= today ? p.date : b), path[0].date)} stroke="#141629" strokeDasharray="3 3" label={{ value: 'Today', position: 'insideTopLeft', fontSize: 11, fill: '#3D4157' }} />}
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : <p className="text-[12.5px] py-6 text-center" style={{ color: 'var(--text3)' }}>{m.chart?.kind === 'nav' && !m.chart.code ? 'Open Mutual funds and refresh NAV once, so this fund is matched to its scheme for the chart.' : 'No price history for this one.'}</p>}
          {growth != null && <div className="text-[12px]" style={{ color: 'var(--text3)' }}>{type === 'mutual_funds' ? 'NAV' : 'Price'} grew {growth}% a year over this period{m.avg ? ' · dashed line: your average buying price' : ''}</div>}
          {!shown.length && path && <div className="text-[12px]" style={{ color: 'var(--text3)' }}>How it grows at {m.rate}% a year, compounded quarterly, until it matures.</div>}
          {!shown.length && !path && putIn && <div className="text-[12px]" style={{ color: 'var(--text3)' }}>What you’ve put in over time{m.chart?.kind === 'nav' && !m.chart.code ? '. For the NAV chart, refresh NAV once on Mutual funds so this fund is matched to its scheme.' : '.'}</div>}
        </section>

        <div className="flex flex-col gap-4 md:gap-5 min-w-0">
          <section className={card}>
            <H2>Your position</H2>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-[13px]">
              {[...m.facts, ...(share != null && share < 99.5 ? [[`Share of your ${meta.plural.toLowerCase()}`, `${Math.round(share)}%`] as [string, string]] : []), ...(m.since && !m.facts.some(([k]) => /^(Opened|Started|Bought)$/.test(k)) ? [['Holding since', fmtDate(m.since)] as [string, string]] : [])].slice(0, 8).map(([k, v]) => (
                <div key={k} className="min-w-0"><dt className="text-[12px]" style={{ color: 'var(--text3)' }}>{k}</dt><dd className="font-semibold mt-0.5 truncate" style={{ color: 'var(--text)' }}>{/^\d{4}-\d{2}-\d{2}/.test(v) ? fmtDate(v) : v}</dd></div>
              ))}
            </dl>
          </section>
          {type === 'mutual_funds' && (
            <section className={card}>
              <H2 right={<span className="text-[11.5px] font-semibold rounded-md px-2 py-[3px]" style={m.sip ? { background: '#E7F7EF', color: '#1E7A50' } : { background: '#F1F0F7', color: 'var(--text3)' }}>{m.sip ? 'Running' : 'None'}</span>}>SIP</H2>
              {m.sip ? <>
                <div className="text-[19px] font-bold tabular-nums" style={{ color: 'var(--text)' }}>{money(m.sip.amount)} <span className="text-[12.5px] font-medium" style={{ color: 'var(--text3)' }}>{m.sip.day ? `on the ${m.sip.day}${['th', 'st', 'nd', 'rd'][(m.sip.day % 10 > 3 || [11, 12, 13].includes(m.sip.day)) ? 0 : m.sip.day % 10]} of each month` : 'a month'}</span></div>
                <div className="text-[12px] mt-1" style={{ color: 'var(--text3)' }}>{m.lots.filter(l => l.kind === 'SIP').length} instalments recorded · {money(m.lots.filter(l => l.kind === 'SIP').reduce((s, l) => s + l.amount, 0))} through SIP</div>
              </> : <p className="text-[12.5px]" style={{ color: 'var(--text3)' }}>No SIP on this fund. Start one to invest a fixed amount each month.</p>}
            </section>
          )}
          {benchRate != null && m.xirr != null && (
            <section className={card}>
              <H2>Against its category</H2>
              <p className="text-[13px] leading-snug" style={{ color: 'var(--text2)' }}>You’re earning <b style={{ color: m.xirr >= benchRate ? 'var(--pos-text)' : '#B4231A' }}>{m.xirr}% a year</b>; {type === 'stocks' ? 'Indian shares' : 'funds like it'} usually earn about <b>{benchRate}%</b>.</p>
              <p className="text-[11.5px] mt-1.5" style={{ color: 'var(--text4)' }}>A WealthLens estimate, not a rating agency’s.</p>
            </section>
          )}
          {m.maturity && (m.maturity.date || m.maturity.amount) && (
            <section className={card}>
              <H2>At maturity</H2>
              <div className="text-[19px] font-bold tabular-nums" style={{ color: 'var(--text)' }}>{m.maturity.amount ? money(m.maturity.amount) : '—'}</div>
              <div className="text-[12.5px] mt-1" style={{ color: 'var(--text3)' }}>{m.maturity.date ? (() => { const days = Math.round((Date.parse(m.maturity!.date!) - Date.parse(today)) / 864e5); return `${fmtDate(m.maturity!.date!)} · ${days < 0 ? 'matured' : days === 0 ? 'today' : days < 60 ? `in ${days} day${days === 1 ? '' : 's'}` : `in ${m.maturity!.monthsLeft} months`}` })() : 'Add the maturity date to see when'}</div>
              {type === 'fixed_deposits' && !Number(row.maturity_amt) && m.maturity.amount && <p className="text-[11.5px] mt-1.5" style={{ color: 'var(--text4)' }}>Worked out at {m.rate}% compounded quarterly; your bank’s figure may differ slightly.</p>}
              {/* Near the date (or after it): what to do with the money */}
              {type === 'fixed_deposits' && row.is_active !== false && m.maturity.date && m.maturity.date <= new Date(Date.parse(today) + 45 * 864e5).toISOString().slice(0, 10) && (
                <div className="mt-3 pt-3 flex flex-col gap-1.5" style={{ borderTop: '1px solid var(--track)' }}>
                  <div className="text-[12.5px] font-semibold" style={{ color: 'var(--text)' }}>{m.maturity.date <= today ? 'It has matured. What now?' : 'What will you do with it?'}</div>
                  <button onClick={() => setSheet('renew')} className="wl-btn justify-center wl-hide-viewing" style={{ height: 38 }}>Renew it</button>
                  <Link href="/dashboard/goals" className="wl-btn justify-center" style={{ height: 38 }}>Keep it for a goal</Link>
                  <Link href="/dashboard/portfolio" className="wl-btn justify-center" style={{ height: 38 }}>Invest it (see what your mix needs)</Link>
                  {m.maturity.date <= today && <button onClick={() => setSheet('paidout')} className="text-[12px] font-semibold mt-0.5 wl-hide-viewing" style={{ color: 'var(--text3)' }}>It’s paid out to my bank: close it</button>}
                  <p className="text-[11.5px] leading-snug" style={{ color: 'var(--text4)' }}>Check your emergency fund first: if it’s short, this money fills it. Compare your bank’s rate today with {m.rate}% before renewing.</p>
                </div>
              )}
            </section>
          )}
        </div>
      </div>

      {m.lots.length > 0 && (
        <section className="wl-card overflow-hidden">
          <div className="px-4 md:px-5 pt-4 pb-3 flex items-center justify-between gap-3 flex-wrap">
            <h2 className="text-[14.5px] md:text-[15px] font-semibold" style={{ color: 'var(--text)' }}>{type === 'stocks' ? 'Your buys' : 'Your purchases'} <span className="font-normal" style={{ color: 'var(--text3)' }}>· {m.lots.length}</span></h2>
            {m.lots.some(l => l.kind === 'SIP') && <Segmented label="Show" value={lotFilter} onChange={v => { setLotFilter(v); setPage(1) }} options={[{ value: 'all', label: 'All' }, { value: 'SIP', label: 'SIP' }, { value: 'Lump sum', label: 'Lump sum' }]} />}
          </div>
          <div className="hidden md:grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_repeat(3,minmax(0,1fr))_36px] gap-3 px-5 py-2 text-[11px] font-semibold uppercase tracking-[.05em]" style={{ background: '#FAFAFE', borderTop: '1px solid var(--line)', borderBottom: '1px solid var(--line)', color: 'var(--text3)' }}>
            <span>Date</span><span>Type</span><span className="text-right">Units</span><span className="text-right">{type === 'mutual_funds' ? 'NAV' : 'Price'}</span><span className="text-right">Amount</span><span />
          </div>
          {paged.map((l, i) => (
            <div key={(l.id ?? 'open') + i} className="grid grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_repeat(3,minmax(0,1fr))_36px] gap-x-3 gap-y-0.5 px-4 md:px-5 py-2.5 items-center text-[13px]" style={{ borderBottom: '1px solid #F1F0F7' }}>
              <span className="font-medium" style={{ color: 'var(--text)' }}>{fmtDate(l.date)}<span className="md:hidden ml-1.5 text-[11.5px] font-semibold rounded-md px-1.5 py-[2px]" style={{ background: LOT_TINT[l.kind].bg, color: LOT_TINT[l.kind].c }}>{l.kind}</span></span>
              <span className="hidden md:block"><span className="text-[11.5px] font-semibold rounded-md px-2 py-[3px]" style={{ background: LOT_TINT[l.kind].bg, color: LOT_TINT[l.kind].c }}>{l.kind}</span></span>
              <span className="hidden md:block text-right tabular-nums" style={{ color: 'var(--text2)' }}>{l.units != null ? l.units.toLocaleString('en-IN', { maximumFractionDigits: 3 }) : '—'}</span>
              <span className="hidden md:block text-right tabular-nums" style={{ color: 'var(--text2)' }}>{l.price != null ? price(l.price) : '—'}</span>
              <span className="text-right font-semibold tabular-nums" style={{ color: 'var(--text)' }}>{money(l.amount)}</span>
              <span className="md:hidden text-[11.5px] tabular-nums col-span-2" style={{ color: 'var(--text3)' }}>{l.units != null ? `${l.units.toLocaleString('en-IN', { maximumFractionDigits: 3 })} units` : ''}{l.price != null ? ` at ${price(l.price)}` : ''}</span>
              <span className="hidden md:flex justify-end">{l.raw && editable && l.kind !== 'Sold' && <button onClick={() => setEditLot(l.raw)} aria-label="Edit this purchase" className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[var(--bg2)]" style={{ color: 'var(--text3)' }}><Pencil size={13} /></button>}</span>
            </div>
          ))}
          <Pagination total={lots.length} page={page} pageSize={pageSize} onPage={setPage} onPageSize={s => { setPageSize(s); setPage(1) }} />
        </section>
      )}

      <div className={`grid grid-cols-1 ${m.tax ? 'lg:grid-cols-2' : ''} gap-4 md:gap-5 wl-even`}>
        {m.tax && (
          <section className={card}>
            <H2>If you {type === 'mutual_funds' ? 'redeem' : 'sell'} today</H2>
            <dl className="flex flex-col gap-2 text-[13px]">
              <div className="flex justify-between"><dt style={{ color: 'var(--text3)' }}>Long-term gain ({m.tax.kind === 'equity' ? '1 year' : '2 years'} or more)</dt><dd className="font-semibold tabular-nums">{money(m.tax.longGain)}</dd></div>
              <div className="flex justify-between"><dt style={{ color: 'var(--text3)' }}>Short-term gain</dt><dd className="font-semibold tabular-nums">{money(m.tax.shortGain)}</dd></div>
              <div className="flex justify-between pt-2" style={{ borderTop: '1px solid var(--track)' }}><dt>Tax, about</dt><dd className="font-bold tabular-nums">{m.tax.tax == null ? 'at your slab' : money(m.tax.tax)}</dd></div>
            </dl>
            <p className="text-[11.5px] mt-2 leading-snug" style={{ color: 'var(--text4)' }}>{m.tax.note}</p>
            {(() => {
              const fy = fyLabel(today), mine = m.sales.filter(x => fyLabel(x.date) === fy)
              if (!mine.length) return null
              const g = mine.reduce((a, x) => a + x.gain, 0)
              return <p className="text-[12px] mt-2 pt-2 leading-snug" style={{ borderTop: '1px solid var(--track)', color: 'var(--text2)' }}>You sold {mine.length === 1 ? 'once' : `${mine.length} times`} in {fy}: {g >= 0 ? 'gain' : 'loss'} of <b>{money(Math.abs(g))}</b>. <Link href="/dashboard/tax#gains" className="font-semibold" style={{ color: 'var(--accent2)' }}>All your gains this year</Link></p>
            })()}
          </section>
        )}
        {m.value > 0 && type !== 'lic_policies' && (
          <section className={card}>
            <H2>Where it could be</H2>
            <div className="grid grid-cols-3 gap-2 text-center">
              {[5, 10, 15].map(y => (
                <div key={y} className="rounded-xl px-1 py-2.5" style={{ background: 'var(--bg2)' }}>
                  <div className="text-[11.5px]" style={{ color: 'var(--text3)' }}>{y} years</div>
                  <div className="text-[15px] font-bold tabular-nums mt-0.5" style={{ color: 'var(--text)' }}>{short(projectValue(m.value, sipNow, rateUsed, y))}</div>
                </div>
              ))}
            </div>
            {(market || type === 'nps_accounts') && (
              <label className="block text-[12.5px] mt-3" style={{ color: 'var(--text2)' }}>Adding each month: <b>{money(sipNow)}</b>
                <input type="range" min={0} max={Math.max(50000, (m.sip?.amount ?? 0) * 3)} step={cur === 'AED' ? 100 : 500} value={sipNow} onChange={e => setSipNow(Number(e.target.value))} className="w-full mt-1.5" style={{ accentColor: 'var(--accent)' }} />
              </label>
            )}
            <p className="text-[11.5px] mt-2 leading-snug" style={{ color: 'var(--text4)' }}>At {rateUsed}% a year{market ? (growth != null ? ', from its price history, kept within its kind’s usual range' : ', usual for its kind') : ''}. Not a promise.</p>
          </section>
        )}
      </div>

      {sheet === 'buy' && <BatchPurchaseModal kind={kindFor} existing={row} onClose={done} />}
      {sheet === 'edit' && <EditHoldingModal kind={kindFor} row={row} onClose={done} />}
      {editLot && <EditLotModal kind={kindFor} holding={row} lot={editLot} onClose={() => { setEditLot(null); router.refresh() }} />}
      {sheet === 'sip' && <SipSheet row={row} onClose={() => setSheet(null)} onSaved={done} />}
      {sheet === 'sell' && <SellSheet type={type} row={row} m={m} accounts={accounts} today={today} onClose={() => setSheet(null)} onSaved={done} />}
      {sheet === 'renew' && <RenewSheet row={row} amount={m.maturity?.amount ?? Number(row.principal) ?? 0} onClose={() => setSheet(null)} onSaved={done} />}
      {sheet === 'paidout' && <PaidOutSheet row={row} name={m.name} onClose={() => setSheet(null)} onSaved={done} />}
      {sheet === 'edit2' && <AddInvestmentModal defaultType={EDIT_TYPE[type] as any} editData={{ ...row, _type: EDIT_TYPE[type] }} onClose={done} />}
      {sheet === 'repick' && <RepickSheet row={row} onClose={() => setSheet(null)} onSaved={done} />}
      {sheet === 'delete' && <DeleteSheet type={type} row={row} name={m.name} onClose={() => setSheet(null)} />}
    </div>
  )
}

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 wl-sheet z-[60] flex items-center justify-center p-4" style={{ background: 'rgba(15,23,42,.4)' }} onClick={onClose}>
      <div className="wl-sheet-panel w-full max-w-[460px] rounded-2xl bg-white flex flex-col max-h-[88vh]" onClick={e => e.stopPropagation()} role="dialog" aria-label={title} style={{ boxShadow: '0 20px 60px rgba(15,23,42,.18)' }}>
        <div className="flex items-center justify-between px-5 pt-5 pb-2">
          <div className="text-[17px] font-bold" style={{ color: 'var(--text)' }}>{title}</div>
          <button onClick={onClose} aria-label="Close" className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ color: 'var(--text3)' }}><X size={18} /></button>
        </div>
        <div className="px-5 pb-5 overflow-y-auto flex flex-col gap-3">{children}</div>
      </div>
    </div>
  )
}

function SipSheet({ row, onClose, onSaved }: { row: any; onClose: () => void; onSaved: () => void }) {
  const [on, setOn] = useState(!!row.has_sip)
  const [amount, setAmount] = useState(row.sip_amount ? String(row.sip_amount) : '')
  const [day, setDay] = useState(row.sip_date ? String(row.sip_date) : '5')
  const [busy, setBusy] = useState(false)
  async function save() {
    if (on && !(Number(amount) > 0)) { toast('Enter the SIP amount.', 'error'); return }
    setBusy(true)
    const { error } = await createClient().from('mutual_funds').update({ has_sip: on, sip_amount: on ? Number(amount) : null, sip_date: on ? Math.min(28, Math.max(1, Number(day) || 5)) : null }).eq('id', row.id)
    setBusy(false)
    if (error) { toast(error.message, 'error'); return }
    toast(on ? 'SIP saved' : 'SIP stopped'); onSaved()
  }
  return (
    <Sheet title="SIP" onClose={onClose}>
      <Segmented label="SIP" value={on ? 'on' : 'off'} onChange={v => setOn(v === 'on')} full options={[{ value: 'on', label: 'Running' }, { value: 'off', label: 'No SIP' }]} />
      {on && <div className="grid grid-cols-2 gap-2.5">
        <label className="block"><span className="block text-[12px] font-semibold mb-1" style={{ color: 'var(--text2)' }}>Each month (₹)</span><input inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value.replace(/[^0-9.]/g, ''))} className="wl-input w-full" style={{ height: 44 }} /></label>
        <label className="block"><span className="block text-[12px] font-semibold mb-1" style={{ color: 'var(--text2)' }}>On day</span><input inputMode="numeric" value={day} onChange={e => setDay(e.target.value.replace(/\D/g, ''))} className="wl-input w-full" style={{ height: 44 }} /></label>
      </div>}
      <button onClick={save} disabled={busy} className="wl-btn wl-btn-primary justify-center disabled:opacity-60" style={{ height: 44 }}>{busy ? 'Saving…' : 'Save'}</button>
    </Sheet>
  )
}

function RepickSheet({ row, onClose, onSaved }: { row: any; onClose: () => void; onSaved: () => void }) {
  const [q, setQ] = useState(String(row.fund_name ?? ''))
  const [results, setResults] = useState<any[] | null>(null)
  const [busy, setBusy] = useState(false)
  async function search() {
    setResults(null)
    try { const r = await fetch(`/api/mf-nav?q=${encodeURIComponent(q)}`).then(x => x.json()); setResults(Array.isArray(r) ? r.slice(0, 40) : []) } catch { setResults([]) }
  }
  useEffect(() => { search() }, []) // eslint-disable-line react-hooks/exhaustive-deps
  async function pick(s: any) {
    setBusy(true)
    const code = Number(s.schemeCode)
    let nav = 0
    try { nav = Number((await fetch(`/api/mf-nav?schemeCode=${code}`).then(x => x.json()))?.data?.[0]?.nav) || 0 } catch {}
    const { error } = await createClient().from('mutual_funds').update({ scheme_code: code, ...(nav > 0 ? { current_nav: nav, last_updated: new Date().toISOString() } : {}) }).eq('id', row.id)
    setBusy(false)
    if (error) { toast(error.message, 'error'); return }
    toast('Scheme matched'); onSaved()
  }
  return (
    <Sheet title="Match the right scheme" onClose={onClose}>
      <p className="text-[12.5px]" style={{ color: 'var(--text3)' }}>Pick the exact scheme so the NAV, value and chart are right.</p>
      <div className="flex gap-2"><input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === 'Enter' && search()} className="wl-input flex-1" style={{ height: 42 }} aria-label="Scheme name" /><button onClick={search} className="wl-btn wl-btn-primary" style={{ height: 42 }}>Search</button></div>
      <div className="flex flex-col gap-1.5">
        {results === null ? <Loader2 size={18} className="animate-spin mx-auto my-4" style={{ color: 'var(--text3)' }} />
          : results.length === 0 ? <p className="text-[12.5px] text-center py-4" style={{ color: 'var(--text3)' }}>No matches. Try fewer words.</p>
          : results.map(s => <button key={s.schemeCode} disabled={busy} onClick={() => pick(s)} className="text-left rounded-xl px-3 py-2.5 text-[12.5px]" style={{ border: '1px solid var(--line)' }}>{s.schemeName}<span className="block text-[11px]" style={{ color: 'var(--text4)' }}>Code {s.schemeCode}</span></button>)}
      </div>
    </Sheet>
  )
}

function DeleteSheet({ type, row, name, onClose }: { type: HType; row: any; name: string; onClose: () => void }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  async function go() {
    setBusy(true)
    const sb = createClient()
    if (HTYPES[type].asset) await sb.from('investment_transactions').delete().eq('asset_id', row.id).then(() => {}, () => {})
    await sb.from('goal_investments').delete().eq('investment_type', type).eq('investment_id', row.id).then(() => {}, () => {})
    const { error } = await sb.from(type).delete().eq('id', row.id)
    setBusy(false)
    if (error) { toast(error.message, 'error'); return }
    toast(`${name} deleted`); router.push(HTYPES[type].list); router.refresh()
  }
  return (
    <Sheet title={`Delete ${name}?`} onClose={onClose}>
      <p className="text-[13px]" style={{ color: 'var(--text2)' }}>It’s removed with its purchase history. Goals or bills it was kept for stop counting it. This can’t be undone.</p>
      <div className="flex gap-2"><button onClick={onClose} className="wl-btn flex-1 justify-center" style={{ height: 44 }}>Cancel</button><button onClick={go} disabled={busy} className="wl-btn wl-btn-primary flex-1 justify-center disabled:opacity-60" style={{ height: 44, background: '#B4231A' }}>{busy ? 'Deleting…' : 'Delete'}</button></div>
    </Sheet>
  )
}

// ── Sell / redeem: records the sale with its cost (first in, first out),
// lowers what you hold, and puts the money in your account as a move ──
function SellSheet({ type, row, m, accounts, today, onClose, onSaved }: { type: HType; row: any; m: HoldingModel; accounts: any[]; today: string; onClose: () => void; onSaved: () => void }) {
  const held = m.units ?? 0, cur = m.currency
  const money = (n: number) => fmtMoney(n, cur)
  const [units, setUnits] = useState(String(+held.toFixed(4)))
  const [px, setPx] = useState(m.price ? String(+m.price.toFixed(4)) : '')
  const [date, setDate] = useState(today)
  const [accountId, setAccountId] = useState('')
  const [busy, setBusy] = useState(false)
  const u = Math.min(held, Number(units) || 0), p = Number(px) || 0, proceeds = u * p
  const c = saleCost(m, u, date), gain = proceeds - c.cost
  const longShare = u > 0 ? c.longUnits / u : 0
  const banks = accounts.filter(a => (a.currency === 'AED' ? 'AED' : 'INR') === cur)
  const verb = type === 'mutual_funds' ? 'Redeem' : 'Sell'

  async function save() {
    if (!(u > 0)) { toast('How many units?', 'error'); return }
    if (!(p > 0)) { toast(`Enter the ${type === 'mutual_funds' ? 'NAV' : 'price'}.`, 'error'); return }
    setBusy(true)
    const sb = createClient()
    const { data: { user } } = await sb.auth.getUser()
    if (!user) { setBusy(false); toast('Please sign in again.', 'error'); return }
    const sale: any = { user_id: user.id, asset_type: HTYPES[type].asset, asset_id: row.id, asset_name: m.name, folio_number: row.folio_number ?? null, txn_date: date, txn_type: 'redemption',
      amount: Math.round(proceeds * 100) / 100, units: u, nav: p, currency: cur, source: 'manual', cost_amount: Math.round(c.cost * 100) / 100 }
    let r = await sb.from('investment_transactions').insert(sale)
    let noCost = false
    if (r.error && /cost_amount/.test(r.error.message)) { delete sale.cost_amount; noCost = true; r = await sb.from('investment_transactions').insert(sale) }
    if (r.error) { setBusy(false); toast(/asset_type_check/.test(r.error.message) ? 'Run migration 044 to record ETF sales.' : r.error.message, 'error'); return }
    // What's left, at the cost of the units still held
    const left = Math.max(0, held - u), leftCost = Math.max(0, m.cost - c.cost), avg = left > 0 ? leftCost / left : 0
    const patch = type === 'stocks' ? { quantity: left, avg_buy_price: Math.round(avg * 10000) / 10000 }
      : type === 'mutual_funds' ? { units: left, invested_amount: Math.round(leftCost * 100) / 100, avg_nav: Math.round(avg * 10000) / 10000 }
      : { units: left, invested_amount: Math.round(leftCost * 100) / 100, avg_buy_price: Math.round(avg * 10000) / 10000 }
    r = await sb.from(type).update(patch).eq('id', row.id)
    if (r.error) { setBusy(false); toast(r.error.message, 'error'); return }
    if (accountId) {
      r = await sb.from('transactions').insert({ user_id: user.id, account_id: accountId, txn_date: date, amount: Math.round(proceeds * 100) / 100, currency: cur, country: cur === 'AED' ? 'UAE' : 'India',
        txn_type: 'income', category: 'Investment Sold', merchant: `${verb === 'Redeem' ? 'Redeemed' : 'Sold'} ${m.name}`, description: `${+u.toFixed(4)} units at ${p}`, source: 'manual' })
      if (r.error) { setBusy(false); toast(`Sale saved, but the money didn't reach the account: ${r.error.message}`, 'error'); onSaved(); return }
    }
    setBusy(false)
    toast(noCost ? 'Sale saved. Run migration 044 so its cost is kept exactly.' : `${verb === 'Redeem' ? 'Redeemed' : 'Sold'} · ${gain >= 0 ? 'gain' : 'loss'} ${money(Math.abs(gain))}`)
    onSaved()
  }

  return (
    <Sheet title={`${verb} ${m.name}`} onClose={onClose}>
      <div className="grid grid-cols-2 gap-2.5">
        <label className="block"><span className="flex justify-between text-[12px] font-semibold mb-1" style={{ color: 'var(--text2)' }}>Units<button type="button" onClick={() => setUnits(String(+held.toFixed(4)))} className="font-semibold" style={{ color: 'var(--accent)' }}>All {+held.toFixed(3)}</button></span>
          <input inputMode="decimal" value={units} onChange={e => setUnits(e.target.value.replace(/[^0-9.]/g, ''))} className="wl-input w-full" style={{ height: 44 }} /></label>
        <label className="block"><span className="block text-[12px] font-semibold mb-1" style={{ color: 'var(--text2)' }}>{type === 'mutual_funds' ? 'NAV' : 'Price'}</span>
          <input inputMode="decimal" value={px} onChange={e => setPx(e.target.value.replace(/[^0-9.]/g, ''))} className="wl-input w-full" style={{ height: 44 }} /></label>
      </div>
      <label className="block"><span className="block text-[12px] font-semibold mb-1" style={{ color: 'var(--text2)' }}>Date</span>
        <input type="date" value={date} max={today} onChange={e => setDate(e.target.value)} className="wl-input w-full" style={{ height: 44 }} /></label>
      <label className="block"><span className="block text-[12px] font-semibold mb-1" style={{ color: 'var(--text2)' }}>Money went to</span>
        <select value={accountId} onChange={e => setAccountId(e.target.value)} className="wl-input w-full" style={{ height: 44 }}>
          <option value="">Not one of my accounts here</option>
          {banks.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <span className="block text-[11.5px] mt-1" style={{ color: 'var(--text3)' }}>It lands as your own money coming back, not income.</span></label>
      {u > 0 && p > 0 && (
        <dl className="rounded-xl p-3 flex flex-col gap-1.5 text-[13px]" style={{ background: 'var(--bg2)' }}>
          <div className="flex justify-between"><dt style={{ color: 'var(--text3)' }}>You get</dt><dd className="font-semibold tabular-nums">{money(proceeds)}</dd></div>
          <div className="flex justify-between"><dt style={{ color: 'var(--text3)' }}>Those units cost</dt><dd className="font-semibold tabular-nums">{money(c.cost)}</dd></div>
          <div className="flex justify-between"><dt style={{ color: 'var(--text3)' }}>{gain >= 0 ? 'Gain' : 'Loss'}</dt><dd className="font-bold tabular-nums" style={{ color: gain >= 0 ? 'var(--pos-text)' : '#B4231A' }}>{money(Math.abs(gain))}</dd></div>
          {m.gainKind && <div className="text-[11.5px] leading-snug" style={{ color: 'var(--text3)' }}>{Math.round(longShare * 100)}% of the units are long-term ({m.gainKind === 'equity' ? '1 year' : '2 years'} or more). The oldest units are sold first.</div>}
        </dl>
      )}
      <button onClick={save} disabled={busy} className="wl-btn wl-btn-primary justify-center disabled:opacity-60" style={{ height: 44 }}>{busy ? 'Saving…' : verb}</button>
    </Sheet>
  )
}

// ── An FD at maturity: renew it (the maturity amount becomes the new
// principal) or close it once the money is back in your bank ──
function RenewSheet({ row, amount, onClose, onSaved }: { row: any; amount: number; onClose: () => void; onSaved: () => void }) {
  const from = String(row.maturity_date).slice(0, 10)
  const [principal, setPrincipal] = useState(String(Math.round(amount)))
  const [rate, setRate] = useState(String(row.interest_rate ?? ''))
  const [months, setMonths] = useState(String(row.start_date && row.maturity_date ? Math.max(1, Math.round((Date.parse(row.maturity_date) - Date.parse(row.start_date)) / (30.44 * 864e5))) : 12))
  const [busy, setBusy] = useState(false)
  async function save() {
    const p = Number(principal), r = Number(rate), n = Number(months)
    if (!(p > 0) || !(r > 0) || !(n > 0)) { toast('Enter the amount, rate and term.', 'error'); return }
    const end = new Date(`${from}T00:00:00Z`); end.setUTCMonth(end.getUTCMonth() + n)
    setBusy(true)
    const { error } = await createClient().from('fixed_deposits').update({ principal: p, interest_rate: r, start_date: from, maturity_date: end.toISOString().slice(0, 10), maturity_amt: null }).eq('id', row.id)
    setBusy(false)
    if (error) { toast(error.message, 'error'); return }
    toast(`Renewed until ${fmtDate(end.toISOString().slice(0, 10))}`); onSaved()
  }
  const field = (label: string, v: string, set: (x: string) => void) => (
    <label className="block"><span className="block text-[12px] font-semibold mb-1" style={{ color: 'var(--text2)' }}>{label}</span>
      <input inputMode="decimal" value={v} onChange={e => set(e.target.value.replace(/[^0-9.]/g, ''))} className="wl-input w-full" style={{ height: 44 }} /></label>
  )
  return (
    <Sheet title={`Renew ${row.name ?? 'the FD'}`} onClose={onClose}>
      <p className="text-[12.5px]" style={{ color: 'var(--text3)' }}>From {fmtDate(from)}. If you took some money out, lower the amount.</p>
      {field('Amount', principal, setPrincipal)}
      <div className="grid grid-cols-2 gap-2.5">{field('Rate (% a year)', rate, setRate)}{field('Term (months)', months, setMonths)}</div>
      <button onClick={save} disabled={busy} className="wl-btn wl-btn-primary justify-center disabled:opacity-60" style={{ height: 44 }}>{busy ? 'Saving…' : 'Renew'}</button>
    </Sheet>
  )
}

function PaidOutSheet({ row, name, onClose, onSaved }: { row: any; name: string; onClose: () => void; onSaved: () => void }) {
  const [busy, setBusy] = useState(false)
  async function go() {
    setBusy(true)
    const { error } = await createClient().from('fixed_deposits').update({ is_active: false }).eq('id', row.id)
    setBusy(false)
    if (error) { toast(error.message, 'error'); return }
    toast(`${name} closed`); onSaved()
  }
  return (
    <Sheet title={`Close ${name}?`} onClose={onClose}>
      <p className="text-[13px]" style={{ color: 'var(--text2)' }}>It leaves your investments. The money now counts in your bank balance once that credit is in your transactions, so it isn’t counted twice.</p>
      <div className="flex gap-2"><button onClick={onClose} className="wl-btn flex-1 justify-center" style={{ height: 44 }}>Cancel</button><button onClick={go} disabled={busy} className="wl-btn wl-btn-primary flex-1 justify-center disabled:opacity-60" style={{ height: 44 }}>{busy ? 'Closing…' : 'Close it'}</button></div>
    </Sheet>
  )
}
