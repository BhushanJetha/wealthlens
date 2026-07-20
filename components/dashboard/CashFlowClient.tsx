'use client'
import { useMemo } from 'react'
import { useViewStore } from '@/store/viewStore'
import { CalendarClock, ArrowUpRight, ArrowDownRight, AlertTriangle, TrendingUp } from 'lucide-react'
import { AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, ReferenceLine } from 'recharts'

interface Props { accounts: any[]; loans: any[]; transactions: any[] }
type Ev = { date: Date; label: string; kind: 'in' | 'out'; amount: number; type: string }

const HORIZON_DAYS = 45
const EXCLUDE_CATS = new Set(['Credit Card Payment', 'EMI/Loan', 'Loan on Card', 'Transfer',
  'NRE to NRO', 'NRE Received', 'International Transfer', 'ATM Withdrawal', 'Refund', 'Family Transfer'])

const norm = (s: string) => (s || '').toLowerCase().replace(/[^a-z]/g, '').slice(0, 18)
const median = (arr: number[]) => {
  if (!arr.length) return 0
  const s = [...arr].sort((a, b) => a - b); const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

export default function CashFlowClient({ accounts, loans, transactions }: Props) {
  const { view, fxRate: FX } = useViewStore()
  const sym = view === 'uae' ? 'AED ' : '₹'
  const disp = (amt: number, cur: string) => {
    const a = Number(amt) || 0, c = cur || 'INR'
    if (view === 'consolidated') return c === 'AED' ? a * FX : a
    if (view === 'uae') return c === 'AED' ? a : 0
    return c === 'INR' ? a : 0
  }
  const money = (n: number) => `${sym}${Math.round(n).toLocaleString('en-IN')}`
  const short = (n: number) => {
    const v = Math.abs(n)
    const s = v >= 1e7 ? `${(n / 1e7).toFixed(2)}Cr` : v >= 1e5 ? `${(n / 1e5).toFixed(1)}L` : v >= 1e3 ? `${(n / 1e3).toFixed(0)}K` : String(Math.round(n))
    return `${sym}${s}`
  }

  const { events, startCash, series, expIn, expOut, endBal, low } = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const horizonEnd = new Date(today); horizonEnd.setDate(horizonEnd.getDate() + HORIZON_DAYS)

    const cards = accounts.filter(a => a.account_type === 'credit_card')
    const startCash = accounts.filter(a => a.account_type !== 'credit_card')
      .reduce((s, a) => s + disp(Number(a.outstanding_bal ?? a.current_balance ?? 0), a.currency), 0)

    const nextDates = (dayRaw: number) => {
      const day = Math.min(Math.max(dayRaw, 1), 28)
      const res: Date[] = []
      let d = new Date(today.getFullYear(), today.getMonth(), day)
      if (d < today) d = new Date(today.getFullYear(), today.getMonth() + 1, day)
      while (d <= horizonEnd) { res.push(new Date(d)); d = new Date(d.getFullYear(), d.getMonth() + 1, day) }
      return res
    }

    // Detect recurring merchants (monthly) for a given txn_type
    const detect = (wantType: string) => {
      const groups: Record<string, { merchant: string; months: Set<string>; amounts: number[]; days: number[]; cat: string }> = {}
      transactions.filter(t => t.txn_type === wantType).forEach(t => {
        const v = disp(Number(t.amount), t.currency); if (v <= 0) return
        if (wantType === 'expense' && EXCLUDE_CATS.has(t.category)) return
        const key = norm(t.merchant); if (key.length < 3) return
        const g = groups[key] ?? (groups[key] = { merchant: t.merchant, months: new Set(), amounts: [], days: [], cat: t.category })
        g.months.add(t.txn_date?.slice(0, 7)); g.amounts.push(v); g.days.push(Number(t.txn_date?.slice(8, 10)) || 1)
      })
      return Object.values(groups).filter(g => g.months.size >= 2)
        .map(g => ({ merchant: g.merchant, amount: median(g.amounts), day: Math.round(median(g.days)), cat: g.cat }))
        .filter(r => r.amount > 0)
    }

    const events: Ev[] = []
    // Recurring income (salary, rent received…)
    detect('income').forEach(r => nextDates(r.day).forEach(d =>
      events.push({ date: d, label: r.merchant || 'Income', kind: 'in', amount: r.amount, type: 'income' })))
    // Recurring expenses (subscriptions, utilities, SIP, rent…)
    detect('expense').forEach(r => nextDates(r.day).forEach(d =>
      events.push({ date: d, label: r.merchant || r.cat || 'Recurring', kind: 'out', amount: r.amount, type: r.cat === 'Investment' ? 'sip' : 'recurring' })))
    // Loan EMIs
    loans.forEach(l => {
      const emi = disp(Number(l.emi_amount), l.currency); if (emi <= 0) return
      const day = l.next_emi_date ? new Date(l.next_emi_date).getUTCDate() : 5
      nextDates(day).forEach(d => events.push({ date: d, label: `${l.name || 'Loan'} EMI`, kind: 'out', amount: emi, type: 'emi' }))
    })
    // Credit-card bills (next due only)
    cards.forEach(c => {
      const due = disp(Number(c.minimum_due) || Number(c.outstanding_bal) || 0, c.currency)
      if (due <= 0 || !c.due_date) return
      const d = nextDates(new Date(c.due_date).getUTCDate())[0]
      if (d) events.push({ date: d, label: `${c.name || 'Card'} bill`, kind: 'out', amount: due, type: 'cc' })
    })

    events.sort((a, b) => a.date.getTime() - b.date.getTime())

    // Daily projected balance
    const series: { label: string; bal: number }[] = []
    let bal = startCash, low = { bal: startCash, date: today }
    for (let i = 0; i <= HORIZON_DAYS; i++) {
      const d = new Date(today); d.setDate(d.getDate() + i)
      events.filter(e => e.date.toDateString() === d.toDateString())
        .forEach(e => { bal += e.kind === 'in' ? e.amount : -e.amount })
      if (bal < low.bal) low = { bal, date: new Date(d) }
      if (i % 3 === 0 || i === HORIZON_DAYS)
        series.push({ label: d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }), bal: Math.round(bal) })
    }
    const expIn  = events.filter(e => e.kind === 'in').reduce((s, e) => s + e.amount, 0)
    const expOut = events.filter(e => e.kind === 'out').reduce((s, e) => s + e.amount, 0)
    return { events, startCash, series, expIn, expOut, endBal: bal, low }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accounts, loans, transactions, view, FX])

  const today = new Date(); today.setHours(0, 0, 0, 0)
  const in7 = new Date(today); in7.setDate(in7.getDate() + 7)
  const soon = events.filter(e => e.date <= in7)
  const later = events.filter(e => e.date > in7)
  const lowWarn = low.bal < 0
  const kpis = [
    { label: 'Balance now',     val: short(startCash), color: 'var(--text)' },
    { label: 'Expected in · 45d', val: short(expIn),   color: 'var(--income)' },
    { label: 'Expected out · 45d', val: short(expOut), color: 'var(--rose)' },
    { label: 'Projected end',   val: short(endBal),    color: endBal >= 0 ? 'var(--income)' : 'var(--rose)' },
  ]

  const EvRow = ({ e }: { e: Ev }) => (
    <div className="flex items-center gap-3 px-4 py-2.5" style={{ borderBottom: '1px solid var(--border)' }}>
      <div className="w-12 text-center flex-shrink-0">
        <div className="text-[9px] uppercase" style={{ color: 'var(--text3)' }}>{e.date.toLocaleDateString('en-GB', { month: 'short' })}</div>
        <div className="text-[15px] font-bold leading-none" style={{ color: 'var(--text)' }}>{e.date.getDate()}</div>
      </div>
      <div className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0"
        style={{ background: e.kind === 'in' ? 'var(--income-bg)' : 'var(--rose-bg)' }}>
        {e.kind === 'in' ? <ArrowUpRight size={13} style={{ color: 'var(--income)' }} /> : <ArrowDownRight size={13} style={{ color: 'var(--rose)' }} />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[12px] font-semibold truncate" style={{ color: 'var(--text)' }}>{e.label}</div>
        <div className="text-[9px] uppercase tracking-wide" style={{ color: 'var(--text3)' }}>{e.type}</div>
      </div>
      <div className="text-[13px] font-mono font-bold" style={{ color: e.kind === 'in' ? 'var(--income)' : 'var(--rose)' }}>
        {e.kind === 'in' ? '+' : '−'}{money(e.amount)}
      </div>
    </div>
  )

  return (
    <div className="space-y-5 animate-fade-up">
      <div>
        <h1 className="text-xl font-bold flex items-center gap-2" style={{ color: 'var(--text)' }}>
          <CalendarClock size={20} style={{ color: 'var(--sage)' }} /> Cash-Flow Forecast
        </h1>
        <p className="text-[12px] mt-0.5" style={{ color: 'var(--text3)' }}>
          Next 45 days from your bank balance · salary, EMIs, card bills & recurring spend · {view === 'uae' ? 'AED' : view === 'india' ? 'INR' : 'Consolidated'}
        </p>
      </div>

      {events.length === 0 ? (
        <div className="wl-card py-16 text-center text-[13px]" style={{ borderStyle: 'dashed', color: 'var(--text3)' }}>
          Not enough history yet to forecast. Add account balances and a couple of months of transactions (salary, EMIs, bills) and this will fill in.
        </div>
      ) : (
        <>
          {lowWarn && (
            <div className="flex items-center gap-3 rounded-xl px-4 py-3 text-[12px] font-medium"
              style={{ background: 'var(--rose-bg)', border: '1px solid var(--rose)', color: 'var(--rose)' }}>
              <AlertTriangle size={16} />
              Projected balance dips to <strong>{money(low.bal)}</strong> around {low.date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} — you may fall short. Consider moving funds in.
            </div>
          )}

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {kpis.map(k => (
              <div key={k.label} className="wl-card p-3 text-center">
                <div className="text-[10px] uppercase tracking-wider mb-1" style={{ color: 'var(--text3)' }}>{k.label}</div>
                <div className="text-[16px] font-bold font-mono" style={{ color: k.color }}>{k.val}</div>
              </div>
            ))}
          </div>

          <div className="wl-card p-4">
            <div className="text-[11px] font-bold uppercase tracking-wider mb-3 flex items-center gap-2" style={{ color: 'var(--text3)' }}>
              <TrendingUp size={13} /> Projected balance
            </div>
            <ResponsiveContainer width="100%" height={190}>
              <AreaChart data={series} margin={{ top: 4, right: 6, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="cfFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--sage)" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="var(--sage)" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: 'var(--text3)', fontSize: 9 }} axisLine={false} tickLine={false} interval={2} />
                <YAxis tick={{ fill: 'var(--text3)', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v: number) => short(v)} width={52} />
                <ReferenceLine y={0} stroke="var(--rose)" strokeDasharray="4 4" />
                <Tooltip contentStyle={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 8, fontSize: 11 }}
                  formatter={(v: any) => [money(Number(v)), 'Balance']} />
                <Area type="monotone" dataKey="bal" stroke="var(--sage)" strokeWidth={2} fill="url(#cfFill)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="wl-card overflow-hidden">
              <div className="px-4 py-2.5 border-b text-[11px] font-bold uppercase tracking-wider"
                style={{ borderColor: 'var(--border)', color: 'var(--gold)', background: 'var(--bg2)' }}>
                Due this week ({soon.length})
              </div>
              {soon.length === 0
                ? <div className="py-8 text-center text-[12px]" style={{ color: 'var(--text3)' }}>Nothing due in the next 7 days 🎉</div>
                : soon.map((e, i) => <EvRow key={i} e={e} />)}
            </div>
            <div className="wl-card overflow-hidden">
              <div className="px-4 py-2.5 border-b text-[11px] font-bold uppercase tracking-wider"
                style={{ borderColor: 'var(--border)', color: 'var(--text3)', background: 'var(--bg2)' }}>
                Later this month ({later.length})
              </div>
              {later.length === 0
                ? <div className="py-8 text-center text-[12px]" style={{ color: 'var(--text3)' }}>Nothing else scheduled</div>
                : later.slice(0, 12).map((e, i) => <EvRow key={i} e={e} />)}
            </div>
          </div>

          <div className="text-[10px]" style={{ color: 'var(--text3)' }}>
            Recurring items are detected from merchants that repeat across months — new or one-off payments won’t appear until they establish a pattern.
          </div>
        </>
      )}
    </div>
  )
}
