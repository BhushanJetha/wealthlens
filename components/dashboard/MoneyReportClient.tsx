'use client'
import { useMemo } from 'react'
import { useViewStore } from '@/store/viewStore'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts'
import {
  TrendingUp, TrendingDown, PiggyBank, Wallet, ArrowLeftRight,
  CreditCard, LineChart, AlertTriangle, CheckCircle2, Receipt,
} from 'lucide-react'

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

const PALETTE = ['#2563EB','#D97706','#7C3AED','#16A34A','#E11D48','#0284C7','#EA580C','#059669','#EC4899','#9333EA','#0EA5E9','#6B7280']
function colorOf(i: number) { return PALETTE[i % PALETTE.length] }

function monthsBetween(from: string, to: string): string[] {
  const out: string[] = []
  let cur = from
  while (cur <= to && out.length < 60) {
    out.push(cur)
    const [y, m] = cur.split('-').map(Number)
    const d = new Date(y, m, 1)
    cur = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  }
  return out
}

function fmtK(n: number): string {
  if (n >= 1e7) return `${(n / 1e7).toFixed(2)}Cr`
  if (n >= 1e5) return `${(n / 1e5).toFixed(1)}L`
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)}K`
  return String(Math.round(n))
}

export default function MoneyReportClient({ transactions, budgets }: { transactions: any[]; budgets: any[] }) {
  const { view, fromMonth, toMonth, fxRate: FX } = useViewStore()

  const sym = view === 'uae' ? 'AED ' : '₹'
  const toDisplay = (amt: number, cur: string) =>
    view === 'consolidated' ? (cur === 'AED' ? amt * FX : amt) : amt

  const months = useMemo(() => monthsBetween(fromMonth, toMonth), [fromMonth, toMonth])
  const monthsCount = Math.max(1, months.length)

  const rangeLabel = fromMonth === toMonth
    ? new Date(fromMonth + '-01').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
    : `${new Date(fromMonth + '-01').toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })} – ${new Date(toMonth + '-01').toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}`

  // ── Filter to range + currency view ──────────────────────────────────────
  const rows = useMemo(() => transactions.filter(t => {
    const m = t.txn_date?.slice(0, 7) ?? ''
    if (m < fromMonth || m > toMonth) return false
    if (view === 'uae' && t.currency !== 'AED') return false
    if (view === 'india' && t.currency !== 'INR') return false
    return true
  }), [transactions, fromMonth, toMonth, view])

  const amt = (t: any) => toDisplay(Number(t.amount) || 0, t.currency)
  const sum = (arr: any[]) => arr.reduce((a, t) => a + amt(t), 0)

  // ── Clean buckets (no mixing) ────────────────────────────────────────────
  const buckets = useMemo(() => {
    const income      = rows.filter(t => t.txn_type === 'income')
    const expenseRows = rows.filter(t => t.txn_type === 'expense')
    const living      = expenseRows.filter(t => t.category !== 'Credit Card Payment' && t.category !== 'Investment')
    const ccPayments  = expenseRows.filter(t => t.category === 'Credit Card Payment')
    const investments = rows.filter(t => t.category === 'Investment')
    const loans       = rows.filter(t => t.txn_type === 'loan')
    const transfers   = rows.filter(t => t.txn_type === 'transfer')
    return { income, living, ccPayments, investments, loans, transfers }
  }, [rows])

  const totalIncome   = sum(buckets.income)
  const totalLiving   = sum(buckets.living)
  const totalLoans    = sum(buckets.loans)
  const totalInvest   = sum(buckets.investments)
  const totalCC       = sum(buckets.ccPayments)
  const totalTransfer = sum(buckets.transfers)

  const netSavings = totalIncome - totalLiving - totalLoans
  const savingsRate = totalIncome > 0 ? (netSavings / totalIncome) * 100 : 0

  // ── Per-month trend ──────────────────────────────────────────────────────
  const trend = useMemo(() => months.map(m => {
    const inM = (t: any) => t.txn_date?.slice(0, 7) === m
    const inc = sum(buckets.income.filter(inM))
    const liv = sum(buckets.living.filter(inM))
    const lon = sum(buckets.loans.filter(inM))
    return { month: MONTH_NAMES[Number(m.slice(5)) - 1] + (months.length > 12 ? ` '${m.slice(2,4)}` : ''), Income: Math.round(inc), Spending: Math.round(liv + lon), Saved: Math.round(inc - liv - lon) }
  }), [months, buckets])

  // ── Spending by category (living only) ───────────────────────────────────
  const spendByCat = useMemo(() => {
    const m: Record<string, number> = {}
    buckets.living.forEach(t => { m[t.category || 'Other'] = (m[t.category || 'Other'] ?? 0) + amt(t) })
    return Object.entries(m).sort((a, b) => b[1] - a[1])
  }, [buckets])

  // ── Income by source ─────────────────────────────────────────────────────
  const incomeByCat = useMemo(() => {
    const m: Record<string, number> = {}
    buckets.income.forEach(t => { m[t.category || 'Other'] = (m[t.category || 'Other'] ?? 0) + amt(t) })
    return Object.entries(m).sort((a, b) => b[1] - a[1])
  }, [buckets])

  // ── Transfers by subtype ─────────────────────────────────────────────────
  const transferByType = useMemo(() => {
    const m: Record<string, number> = {}
    buckets.transfers.forEach(t => {
      const k = t.sub_category || t.category || 'Transfer'
      m[k] = (m[k] ?? 0) + amt(t)
    })
    return Object.entries(m).sort((a, b) => b[1] - a[1])
  }, [buckets])

  // ── Budget vs actual ─────────────────────────────────────────────────────
  const budgetRows = useMemo(() => {
    // latest monthly_cap per category × months in range
    const cap: Record<string, number> = {}
    const capMonth: Record<string, string> = {}
    budgets.forEach(b => {
      if (!b.category || !b.monthly_cap) return
      if (!capMonth[b.category] || b.month_year > capMonth[b.category]) {
        capMonth[b.category] = b.month_year || ''
        cap[b.category] = Number(b.monthly_cap)
      }
    })
    const spentMap: Record<string, number> = Object.fromEntries(spendByCat)
    const cats = Array.from(new Set([...Object.keys(cap), ...Object.keys(spentMap)]))
      .filter(c => (cap[c] ?? 0) > 0)
    return cats.map(c => {
      const budget = (cap[c] ?? 0) * monthsCount
      const spent  = spentMap[c] ?? 0
      const pct    = budget > 0 ? (spent / budget) * 100 : 0
      return { cat: c, budget, spent, pct, over: spent > budget, overBy: Math.max(0, spent - budget) }
    }).sort((a, b) => b.pct - a.pct)
  }, [budgets, spendByCat, monthsCount])

  const overBudget = budgetRows.filter(b => b.over)

  const biggest = useMemo(() =>
    [...buckets.living].sort((a, b) => amt(b) - amt(a)).slice(0, 6),
  [buckets])

  const money = (n: number) => `${sym}${Math.round(n).toLocaleString('en-IN')}`

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5 animate-fade-up">
      <div className="flex items-start justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--text)' }}>Money Report</h1>
          <p className="text-[12px] mt-0.5" style={{ color: 'var(--text3)' }}>
            {view === 'uae' ? 'UAE · AED' : view === 'india' ? 'India · INR' : 'Consolidated · INR'} · {rangeLabel}
          </p>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Income"        value={money(totalIncome)}  icon={TrendingUp}   color="var(--income)" />
        <Kpi label="Living Expenses" value={money(totalLiving)} icon={TrendingDown} color="var(--expense)" sub="excl. transfers, card payments & investments" />
        <Kpi label="Net Savings"   value={money(netSavings)}   icon={PiggyBank}    color={netSavings >= 0 ? 'var(--income)' : 'var(--rose)'} sub="income − expenses − loans" />
        <Kpi label="Savings Rate"  value={`${savingsRate.toFixed(0)}%`} icon={Wallet} color={savingsRate >= 20 ? 'var(--income)' : savingsRate >= 0 ? 'var(--gold)' : 'var(--rose)'} />
      </div>

      {/* Cash-flow breakdown — the clean separation */}
      <div className="wl-card p-4">
        <div className="text-[11px] font-bold uppercase tracking-wider mb-3" style={{ color: 'var(--text3)' }}>Where your money went</div>
        <div className="space-y-1.5">
          <FlowRow label="Income" amount={money(totalIncome)} color="var(--income)" sign="+" strong />
          <FlowRow label="Living Expenses" amount={money(totalLiving)} color="var(--expense)" sign="−" />
          <FlowRow label="Loans / EMI" amount={money(totalLoans)} color="#F97316" sign="−" hideIfZero value={totalLoans} />
          <div className="border-t my-1.5" style={{ borderColor: 'var(--border)' }} />
          <FlowRow label="Net Savings" amount={money(netSavings)} color={netSavings >= 0 ? 'var(--income)' : 'var(--rose)'} sign="=" strong />
        </div>

        <div className="mt-4 pt-3 border-t" style={{ borderColor: 'var(--border)' }}>
          <div className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text3)' }}>
            Not counted as spending
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <SideStat icon={LineChart}     label="Investments"        value={money(totalInvest)}   color="#0EA5E9" note="money you put to work" />
            <SideStat icon={CreditCard}    label="Card Payments"      value={money(totalCC)}       color="#9333EA" note="repays spending already counted" />
            <SideStat icon={ArrowLeftRight} label="Transfers"         value={money(totalTransfer)} color="#3B7DD8" note="moved between accounts" />
          </div>
        </div>
      </div>

      {/* Income vs Spending trend (multi-month) */}
      {months.length > 1 && (
        <div className="wl-card p-4">
          <div className="text-[11px] font-bold uppercase tracking-wider mb-3" style={{ color: 'var(--text3)' }}>Income vs Spending — {rangeLabel}</div>
          <div style={{ width: '100%', height: 240 }}>
            <ResponsiveContainer>
              <BarChart data={trend} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 10, fill: 'var(--text3)' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: 'var(--text3)' }} axisLine={false} tickLine={false} tickFormatter={(v) => fmtK(Number(v))} />
                <Tooltip formatter={(v: any) => money(Number(v))} contentStyle={{ fontSize: 11, borderRadius: 10, border: '1px solid var(--border)' }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="Income"   fill="var(--income)" radius={[3, 3, 0, 0]} />
                <Bar dataKey="Spending" fill="var(--expense)" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Budget vs Actual */}
      {budgetRows.length > 0 && (
        <div className="wl-card p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--text3)' }}>Budget vs Actual</div>
            {overBudget.length > 0
              ? <span className="text-[10px] font-bold px-2 py-0.5 rounded" style={{ background: 'var(--rose-bg)', color: 'var(--rose)' }}>{overBudget.length} over budget</span>
              : <span className="text-[10px] font-bold px-2 py-0.5 rounded flex items-center gap-1" style={{ background: 'var(--income-bg)', color: 'var(--income)' }}><CheckCircle2 size={11} /> all within budget</span>}
          </div>
          {monthsCount > 1 && (
            <p className="text-[10px] mb-2" style={{ color: 'var(--text3)' }}>Budgets shown for {monthsCount} months (monthly cap × {monthsCount}).</p>
          )}
          <div className="space-y-2.5">
            {budgetRows.map((b, i) => {
              const barColor = b.pct >= 100 ? 'var(--rose)' : b.pct >= 75 ? 'var(--gold)' : 'var(--income)'
              return (
                <div key={b.cat}>
                  <div className="flex items-center justify-between text-[11px] mb-1">
                    <span className="font-semibold flex items-center gap-1.5" style={{ color: 'var(--text)' }}>
                      {b.over && <AlertTriangle size={11} style={{ color: 'var(--rose)' }} />}
                      {b.cat}
                    </span>
                    <span className="font-mono" style={{ color: 'var(--text3)' }}>
                      <span style={{ color: barColor, fontWeight: 600 }}>{money(b.spent)}</span> / {money(b.budget)}
                      {b.over && <span style={{ color: 'var(--rose)' }}> · over by {money(b.overBy)}</span>}
                    </span>
                  </div>
                  <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--bg2)' }}>
                    <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, b.pct)}%`, background: barColor }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Two-column: top spend + income sources */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <BreakdownCard title="Top Spending Categories" rows={spendByCat} total={totalLiving} money={money} empty="No spending in this period" />
        <BreakdownCard title="Income Sources" rows={incomeByCat} total={totalIncome} money={money} empty="No income in this period" />
      </div>

      {/* Transfers + biggest expenses */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <BreakdownCard title="Transfers by Type" rows={transferByType} total={totalTransfer} money={money} empty="No transfers in this period" />
        <div className="wl-card p-4">
          <div className="text-[11px] font-bold uppercase tracking-wider mb-3" style={{ color: 'var(--text3)' }}>Biggest Expenses</div>
          {biggest.length === 0 ? (
            <div className="text-[12px] py-6 text-center" style={{ color: 'var(--text3)' }}>No expenses in this period</div>
          ) : (
            <div className="space-y-2">
              {biggest.map((t, i) => (
                <div key={i} className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-[12px] font-medium truncate" style={{ color: 'var(--text)' }}>{t.merchant}</div>
                    <div className="text-[10px]" style={{ color: 'var(--text3)' }}>{t.category} · {t.txn_date}</div>
                  </div>
                  <div className="text-[12px] font-bold font-mono flex-shrink-0" style={{ color: 'var(--expense)' }}>{money(amt(t))}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Sub-components ───────────────────────────────────────────────────────────

function Kpi({ label, value, icon: Icon, color, sub }: { label: string; value: string; icon: any; color: string; sub?: string }) {
  return (
    <div className="wl-card p-3.5">
      <div className="flex items-center gap-2 mb-1.5">
        <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: color + '18' }}>
          <Icon size={14} style={{ color }} />
        </div>
        <span className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: 'var(--text3)' }}>{label}</span>
      </div>
      <div className="text-[18px] font-bold font-mono" style={{ color }}>{value}</div>
      {sub && <div className="text-[9px] mt-0.5 leading-tight" style={{ color: 'var(--text3)' }}>{sub}</div>}
    </div>
  )
}

function FlowRow({ label, amount, color, sign, strong, hideIfZero, value }: { label: string; amount: string; color: string; sign: string; strong?: boolean; hideIfZero?: boolean; value?: number }) {
  if (hideIfZero && (value ?? 0) === 0) return null
  return (
    <div className="flex items-center justify-between">
      <span className={`text-[12px] ${strong ? 'font-bold' : 'font-medium'}`} style={{ color: strong ? 'var(--text)' : 'var(--text2)' }}>{label}</span>
      <span className={`font-mono ${strong ? 'text-[14px] font-bold' : 'text-[12px] font-semibold'}`} style={{ color }}>{sign} {amount}</span>
    </div>
  )
}

function SideStat({ icon: Icon, label, value, color, note }: { icon: any; label: string; value: string; color: string; note: string }) {
  return (
    <div className="rounded-xl p-3" style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}>
      <div className="flex items-center gap-1.5 mb-1">
        <Icon size={13} style={{ color }} />
        <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text3)' }}>{label}</span>
      </div>
      <div className="text-[15px] font-bold font-mono" style={{ color }}>{value}</div>
      <div className="text-[9px] mt-0.5" style={{ color: 'var(--text3)' }}>{note}</div>
    </div>
  )
}

function BreakdownCard({ title, rows, total, money, empty }: { title: string; rows: [string, number][]; total: number; money: (n: number) => string; empty: string }) {
  return (
    <div className="wl-card p-4">
      <div className="text-[11px] font-bold uppercase tracking-wider mb-3" style={{ color: 'var(--text3)' }}>{title}</div>
      {rows.length === 0 ? (
        <div className="text-[12px] py-6 text-center" style={{ color: 'var(--text3)' }}>{empty}</div>
      ) : (
        <div className="space-y-2">
          {rows.slice(0, 7).map(([cat, val], i) => {
            const pct = total > 0 ? (val / total) * 100 : 0
            const color = colorOf(i)
            return (
              <div key={cat} className="flex items-center gap-3">
                <div className="text-[11px] font-medium w-28 flex-shrink-0 truncate" style={{ color: 'var(--text2)' }}>{cat}</div>
                <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: 'var(--bg2)' }}>
                  <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
                </div>
                <div className="text-[10px] font-mono w-10 text-right" style={{ color: 'var(--text3)' }}>{pct.toFixed(0)}%</div>
                <div className="text-[11px] font-mono font-semibold w-20 text-right" style={{ color: 'var(--text)' }}>{money(val)}</div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
