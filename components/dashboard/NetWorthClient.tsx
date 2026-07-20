'use client'
import { useMemo } from 'react'
import { useViewStore } from '@/store/viewStore'
import { Wallet, TrendingUp, TrendingDown, ArrowUpRight, ArrowDownRight, Info } from 'lucide-react'
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip,
  CartesianGrid, ResponsiveContainer, Cell, ReferenceLine,
} from 'recharts'

interface Props {
  accounts: any[]; stocks: any[]; mutualFunds: any[]; etf: any[]; nps: any[]
  fixedDeposits: any[]; recurringDeposits: any[]; ppfEpf: any[]; gold: any[]
  bonds: any[]; lic: any[]; loans: any[]; transactions: any[]
}

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

export default function NetWorthClient(p: Props) {
  const { view, fxRate: FX } = useViewStore()
  const sym = view === 'uae' ? 'AED ' : '₹'

  // View / FX aware value of one amount in a given currency
  const disp = (amt: number, cur: string) => {
    const a = Number(amt) || 0
    const c = cur || 'INR'
    if (view === 'consolidated') return c === 'AED' ? a * FX : a
    if (view === 'uae')   return c === 'AED' ? a : 0
    return c === 'INR' ? a : 0    // india
  }
  const sumRows = (rows: any[], key: string, curKey = 'currency') =>
    rows.reduce((s, r) => s + disp(Number(r[key]) || 0, r[curKey] || 'INR'), 0)

  const money = (n: number) => `${sym}${Math.round(n).toLocaleString('en-IN')}`
  const short = (n: number) => {
    const v = Math.abs(n)
    const s = v >= 1e7 ? `${(n / 1e7).toFixed(2)}Cr` : v >= 1e5 ? `${(n / 1e5).toFixed(1)}L` : v >= 1e3 ? `${(n / 1e3).toFixed(0)}K` : String(Math.round(n))
    return `${sym}${s}`
  }

  const { assetRows, liabRows, totalAssets, totalLiab, netWorth, trend, netSavings } = useMemo(() => {
    // Bank & cash = all non-credit-card accounts
    const bankCash = p.accounts.filter(a => a.account_type !== 'credit_card')
    const cards    = p.accounts.filter(a => a.account_type === 'credit_card')

    // Current value of each holding — computed exactly as each category page does
    // (these tables have no single "current_value" column; it's units × live price
    // etc.), so we never fall back to 0 the way column-name reads did.
    const sumBy = (rows: any[], val: (r: any) => number) =>
      rows.reduce((s, r) => s + disp(val(r), r.currency || 'INR'), 0)

    const bankVal  = sumBy(bankCash,            a => Number(a.outstanding_bal ?? a.current_balance ?? 0))
    const stockVal = sumBy(p.stocks,            x => Number(x.quantity || 0) * Number(x.current_price ?? x.avg_buy_price ?? 0))
    const mfVal    = sumBy(p.mutualFunds,       m => Number(m.units || 0) * Number(m.current_nav ?? m.avg_nav ?? 0))
    const etfVal   = sumBy(p.etf,               e => Number(e.units || 0) * Number(e.current_price ?? e.avg_buy_price ?? 0))
    const npsVal   = sumBy(p.nps,               n => Number(n.corpus_amount ?? n.current_value ?? 0))
    const fdVal    = sumBy(p.fixedDeposits,     f => Number(f.principal ?? f.principal_amount ?? 0))
    const rdVal    = sumBy(p.recurringDeposits, r => r.current_amount != null ? Number(r.current_amount) : Number(r.monthly_amount || 0) * Number(r.months_paid || 0))
    const ppfVal   = sumBy(p.ppfEpf,            x => Number(x.current_balance ?? x.balance ?? 0))
    const goldVal  = sumBy(p.gold,              g => (g.current_price_per_gram && g.quantity_grams) ? Number(g.current_price_per_gram) * Number(g.quantity_grams) : Number(g.invested_amount ?? 0))
    const bondVal  = sumBy(p.bonds,             b => Number(b.current_value ?? b.invested_amount ?? 0))
    const licVal   = sumBy(p.lic,               l => Number(l.total_paid ?? 0))

    const assetRows = [
      { label: 'Bank & Cash',        value: bankVal,  color: '#16A34A' },
      { label: 'Stocks',             value: stockVal, color: '#E11D48' },
      { label: 'Mutual Funds',       value: mfVal,    color: '#2563EB' },
      { label: 'ETF',                value: etfVal,   color: '#0EA5E9' },
      { label: 'NPS',                value: npsVal,   color: '#7C3AED' },
      { label: 'Fixed Deposits',     value: fdVal,    color: '#0284C7' },
      { label: 'Recurring Deposits', value: rdVal,    color: '#0891B2' },
      { label: 'PPF / EPF',          value: ppfVal,   color: '#059669' },
      { label: 'Gold',               value: goldVal,  color: '#D97706' },
      { label: 'Bonds / SGB',        value: bondVal,  color: '#9333EA' },
      { label: 'LIC',                value: licVal,   color: '#DB2777' },
    ].filter(r => r.value > 0).sort((a, b) => b.value - a.value)

    const liabRows = [
      { label: 'Home / Property Loan', value: sumRows(p.loans, 'outstanding_amt'), color: '#DC2626' },
      { label: 'Credit Cards',         value: sumRows(cards, 'outstanding_bal'),   color: '#F97316' },
    ].filter(r => r.value > 0).sort((a, b) => b.value - a.value)

    const totalAssets = assetRows.reduce((s, r) => s + r.value, 0)
    const totalLiab   = liabRows.reduce((s, r) => s + r.value, 0)
    const netWorth    = totalAssets - totalLiab

    // Real monthly net savings (income − expense), view/FX aware, last 12 months
    const now = new Date()
    const keys: string[] = []
    for (let i = 11; i >= 0; i--) { const d = new Date(now.getFullYear(), now.getMonth() - i, 1); keys.push(d.toISOString().slice(0, 7)) }
    const inc: Record<string, number> = {}, exp: Record<string, number> = {}
    p.transactions.forEach(t => {
      const m = t.txn_date?.slice(0, 7); if (!m) return
      const v = disp(Number(t.amount), t.currency)
      if (t.txn_type === 'income') inc[m] = (inc[m] ?? 0) + v
      else if (t.txn_type === 'expense') exp[m] = (exp[m] ?? 0) + v
    })
    const netSavings = keys.map(m => ({ m, label: MONTHS[Number(m.slice(5)) - 1], value: Math.round((inc[m] ?? 0) - (exp[m] ?? 0)) }))

    // Reconstruct a net-worth trend ending at today's real net worth, by
    // walking back and removing each month's net savings (estimate — assets
    // are marked at today's value, so market history isn't captured).
    const trend: { label: string; value: number }[] = new Array(keys.length)
    let running = netWorth
    for (let i = keys.length - 1; i >= 0; i--) {
      trend[i] = { label: netSavings[i].label, value: Math.round(running) }
      running -= netSavings[i].value
    }

    return { assetRows, liabRows, totalAssets, totalLiab, netWorth, trend, netSavings }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p, view, FX])

  const monthChange = netSavings.length ? netSavings[netSavings.length - 1].value : 0
  const prevNW = trend.length > 1 ? trend[trend.length - 2].value : netWorth
  const changePct = prevNW !== 0 ? Math.round((netWorth - prevNW) / Math.abs(prevNW) * 1000) / 10 : 0
  const debtRatio = totalAssets > 0 ? Math.round(totalLiab / totalAssets * 100) : 0
  const empty = totalAssets === 0 && totalLiab === 0

  return (
    <div className="space-y-5 animate-fade-up">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2" style={{ color: 'var(--text)' }}>
            <Wallet size={20} style={{ color: 'var(--sage)' }} /> Net Worth
          </h1>
          <p className="text-[12px] mt-0.5" style={{ color: 'var(--text3)' }}>
            Everything you own minus everything you owe · {view === 'uae' ? 'UAE · AED' : view === 'india' ? 'India · INR' : 'Consolidated · INR'}
          </p>
        </div>
      </div>

      {empty ? (
        <div className="wl-card py-16 text-center text-[13px]" style={{ borderStyle: 'dashed', color: 'var(--text3)' }}>
          No assets or liabilities in the <strong>{view === 'uae' ? 'UAE (AED)' : view === 'india' ? 'India (INR)' : 'Consolidated'}</strong> view yet.
          Add bank balances, investments or loans to see your net worth.
        </div>
      ) : (
        <>
          {/* Hero */}
          <div className="wl-card p-5" style={{ borderTop: '3px solid var(--sage)' }}>
            <div className="flex items-end justify-between flex-wrap gap-4">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--text3)' }}>Total Net Worth</div>
                <div className="text-[34px] leading-none font-black font-mono" style={{ color: netWorth >= 0 ? 'var(--text)' : 'var(--rose)' }}>
                  {money(netWorth)}
                </div>
                <div className="flex items-center gap-1.5 mt-2 text-[12px] font-semibold"
                  style={{ color: monthChange >= 0 ? 'var(--income)' : 'var(--rose)' }}>
                  {monthChange >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                  {money(Math.abs(monthChange))} this month
                  <span style={{ color: 'var(--text3)' }}>· {changePct >= 0 ? '+' : ''}{changePct}%</span>
                </div>
              </div>
              <div className="flex gap-3">
                <div className="rounded-xl px-4 py-3 text-center" style={{ background: 'var(--income-bg)' }}>
                  <div className="text-[9px] font-bold uppercase tracking-wider" style={{ color: 'var(--text3)' }}>Assets</div>
                  <div className="text-[18px] font-black font-mono" style={{ color: 'var(--income)' }}>{short(totalAssets)}</div>
                </div>
                <div className="rounded-xl px-4 py-3 text-center" style={{ background: 'var(--rose-bg)' }}>
                  <div className="text-[9px] font-bold uppercase tracking-wider" style={{ color: 'var(--text3)' }}>Liabilities</div>
                  <div className="text-[18px] font-black font-mono" style={{ color: 'var(--rose)' }}>{short(totalLiab)}</div>
                </div>
                <div className="rounded-xl px-4 py-3 text-center" style={{ background: 'var(--bg2)' }}>
                  <div className="text-[9px] font-bold uppercase tracking-wider" style={{ color: 'var(--text3)' }}>Debt Ratio</div>
                  <div className="text-[18px] font-black font-mono" style={{ color: debtRatio > 50 ? 'var(--rose)' : debtRatio > 30 ? 'var(--gold)' : 'var(--income)' }}>{debtRatio}%</div>
                </div>
              </div>
            </div>
            {/* Assets vs liabilities bar */}
            <div className="mt-4">
              <div className="flex h-3 rounded-full overflow-hidden" style={{ background: 'var(--bg2)' }}>
                <div style={{ width: `${totalAssets + totalLiab > 0 ? (totalAssets / (totalAssets + totalLiab)) * 100 : 0}%`, background: 'var(--income)' }} />
                <div style={{ width: `${totalAssets + totalLiab > 0 ? (totalLiab / (totalAssets + totalLiab)) * 100 : 0}%`, background: 'var(--rose)' }} />
              </div>
            </div>
          </div>

          {/* Trend */}
          <div className="wl-card p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--text3)' }}>
                Net Worth Trend · 12 months
              </div>
              <div className="flex items-center gap-1 text-[10px]" style={{ color: 'var(--text3)' }}>
                <Info size={11} /> estimated from cash flow
              </div>
            </div>
            <ResponsiveContainer width="100%" height={190}>
              <AreaChart data={trend} margin={{ top: 4, right: 6, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="nwFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--sage)" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="var(--sage)" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: 'var(--text3)', fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: 'var(--text3)', fontSize: 10 }} axisLine={false} tickLine={false}
                  tickFormatter={(v: number) => short(v)} width={52} />
                <Tooltip
                  contentStyle={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 8, fontSize: 11 }}
                  formatter={(v: any) => [money(Number(v)), 'Net worth']} />
                <Area type="monotone" dataKey="value" stroke="var(--sage)" strokeWidth={2} fill="url(#nwFill)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Composition: assets + liabilities */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="wl-card p-4">
              <div className="text-[11px] font-bold uppercase tracking-wider mb-3" style={{ color: 'var(--text3)' }}>
                Assets — {money(totalAssets)}
              </div>
              <div className="space-y-2.5">
                {assetRows.map(r => {
                  const pct = totalAssets > 0 ? (r.value / totalAssets) * 100 : 0
                  return (
                    <div key={r.label} className="flex items-center gap-3">
                      <div className="text-[11px] w-32 flex-shrink-0 truncate" style={{ color: 'var(--text2, var(--text))' }}>{r.label}</div>
                      <div className="flex-1 h-2.5 rounded-full overflow-hidden" style={{ background: 'var(--bg2)' }}>
                        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: r.color }} />
                      </div>
                      <div className="text-[11px] font-mono font-semibold w-11 text-right" style={{ color: r.color }}>{pct.toFixed(0)}%</div>
                      <div className="text-[11px] font-mono w-20 text-right" style={{ color: 'var(--text)' }}>{short(r.value)}</div>
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="wl-card p-4">
              <div className="text-[11px] font-bold uppercase tracking-wider mb-3" style={{ color: 'var(--text3)' }}>
                Liabilities — {money(totalLiab)}
              </div>
              {liabRows.length === 0 ? (
                <div className="py-10 text-center text-[12px]" style={{ color: 'var(--income)' }}>
                  🎉 Debt-free in this view — no liabilities.
                </div>
              ) : (
                <div className="space-y-2.5">
                  {liabRows.map(r => {
                    const pct = totalLiab > 0 ? (r.value / totalLiab) * 100 : 0
                    return (
                      <div key={r.label} className="flex items-center gap-3">
                        <div className="text-[11px] w-32 flex-shrink-0 truncate" style={{ color: 'var(--text2, var(--text))' }}>{r.label}</div>
                        <div className="flex-1 h-2.5 rounded-full overflow-hidden" style={{ background: 'var(--bg2)' }}>
                          <div className="h-full rounded-full" style={{ width: `${pct}%`, background: r.color }} />
                        </div>
                        <div className="text-[11px] font-mono font-semibold w-11 text-right" style={{ color: r.color }}>{pct.toFixed(0)}%</div>
                        <div className="text-[11px] font-mono w-20 text-right" style={{ color: 'var(--text)' }}>{short(r.value)}</div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Monthly net savings */}
          <div className="wl-card p-4">
            <div className="text-[11px] font-bold uppercase tracking-wider mb-3" style={{ color: 'var(--text3)' }}>
              Monthly Net Savings <span className="font-normal">(income − expenses)</span>
            </div>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={netSavings} margin={{ top: 4, right: 6, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: 'var(--text3)', fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: 'var(--text3)', fontSize: 10 }} axisLine={false} tickLine={false}
                  tickFormatter={(v: number) => short(v)} width={52} />
                <ReferenceLine y={0} stroke="var(--border)" />
                <Tooltip
                  contentStyle={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 8, fontSize: 11 }}
                  formatter={(v: any) => [money(Number(v)), 'Net saved']} />
                <Bar dataKey="value" radius={[3, 3, 0, 0]}>
                  {netSavings.map((d, i) => <Cell key={i} fill={d.value >= 0 ? 'var(--income)' : 'var(--rose)'} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </div>
  )
}
