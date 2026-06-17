'use client'
import { useMemo } from 'react'
import { useViewStore } from '@/store/viewStore'
import MetricCard from '@/components/dashboard/MetricCard'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell
} from 'recharts'
import {
  TrendingUp, TrendingDown, Wallet, Percent,
  CheckCircle2, Clock, AlertCircle, Target, ArrowRight
} from 'lucide-react'
import Link from 'next/link'

function toINR(amount: number, currency: string, fx: number) {
  return currency === 'AED' ? amount * fx : amount
}
function fmt(n: number, sym: string) {
  if (Math.abs(n) >= 10000000) return `${sym}${(n / 10000000).toFixed(2)}Cr`
  if (Math.abs(n) >= 100000)   return `${sym}${(n / 100000).toFixed(2)}L`
  return `${sym}${Math.round(n).toLocaleString('en-IN')}`
}

const DONUT_COLORS = ['#3D7A58','#D4920A','#3B7DD8','#C96A3A','#7C5CBF','#2E7D52']
const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

export default function DashboardClient({ transactions, loans, accounts, stocks, mutualFunds, fixedDeposits, insurance, goals, budgets,
  recurringDeposits = [], npsAccounts = [], licPolicies = [], goldInvestments = [], bondInvestments = [], etfInvestments = [] }: any) {
  const { view, fromMonth, toMonth, fxRate: FX } = useViewStore()

  const inRange = (txn_date: string) => {
    const m = txn_date?.slice(0, 7) ?? ''
    return m >= fromMonth && m <= toMonth
  }

  const metrics = useMemo(() => {
    const creditCards = accounts.filter((a: any) => a.account_type === 'credit_card')
    const filterByView = (arr: any[], currencyField = 'currency') =>
      view === 'uae'   ? arr.filter((x: any) => x[currencyField] === 'AED' || x.country === 'UAE')
      : view === 'india' ? arr.filter((x: any) => x[currencyField] === 'INR' || x.country === 'India')
      : arr

    const filteredLoans = filterByView(loans)
    const filteredCards = filterByView(creditCards)
    const filteredStocks = filterByView(stocks)
    const filteredMF     = filterByView(mutualFunds)
    const filteredFD     = filterByView(fixedDeposits)

    const sym = view === 'uae' ? 'AED ' : '₹'

    const stockVal  = filteredStocks.reduce((a: number, s: any) => a + (view === 'consolidated' ? toINR(s.quantity*(s.current_price??s.avg_buy_price),s.currency,FX) : s.quantity*(s.current_price??s.avg_buy_price)), 0)
    const mfVal     = filteredMF.reduce((a: number, m: any) => a + m.units*(m.current_nav??m.avg_nav), 0)
    const fdVal     = filteredFD.reduce((a: number, f: any) => a + (view === 'consolidated' ? toINR(Number(f.principal),f.currency,FX) : Number(f.principal)), 0)
    const totalAssets = stockVal + mfVal + fdVal

    const loanLiab = filteredLoans.reduce((a: number, l: any) => a + (view === 'consolidated' ? toINR(Number(l.outstanding_amt),l.currency,FX) : Number(l.outstanding_amt)), 0)
    const cardLiab = filteredCards.reduce((a: number, c: any) => a + (view === 'consolidated' ? toINR(Number(c.outstanding_bal??0),c.currency,FX) : Number(c.outstanding_bal??0)), 0)
    const totalLiab = loanLiab + cardLiab
    const netWorth  = totalAssets - totalLiab

    const txRange = filterByView(transactions.filter((t: any) => inRange(t.txn_date)))
    const monthlyIncome  = txRange.filter((t:any)=>t.txn_type==='income').reduce((a:number,t:any)=>a+(view==='consolidated'?toINR(Number(t.amount),t.currency,FX):Number(t.amount)),0)
    const monthlyExpense = txRange.filter((t:any)=>t.txn_type==='expense').reduce((a:number,t:any)=>a+(view==='consolidated'?toINR(Number(t.amount),t.currency,FX):Number(t.amount)),0)
    const savingsRate    = monthlyIncome > 0 ? Math.round((monthlyIncome - monthlyExpense) / monthlyIncome * 100) : 0

    const totalLimit = filteredCards.reduce((a:number,c:any)=>a+Number(c.credit_limit??0),0)
    const totalBal   = filteredCards.reduce((a:number,c:any)=>a+Number(c.outstanding_bal??0),0)
    const utilPct    = totalLimit > 0 ? Math.round(totalBal/totalLimit*100) : 0

    // Full equity (all investment types) for D/E widget — view-filtered
    const convV = (amt: number, cur: string) => view === 'consolidated' ? toINR(amt, cur, FX) : amt
    const rdVal    = filterByView(recurringDeposits ?? []).reduce((a: number, r: any) => a + convV(Number(r.monthly_amount) * r.tenure_months, r.currency ?? 'INR'), 0)
    const npsVal   = filterByView(npsAccounts ?? []).reduce((a: number, n: any) => a + Number(n.corpus_amount ?? 0), 0)
    const licPaid  = filterByView(licPolicies ?? []).reduce((a: number, l: any) => a + Number(l.total_paid ?? 0), 0)
    const goldVal  = filterByView(goldInvestments ?? []).reduce((a: number, g: any) => {
      if (g.current_price_per_gram && g.quantity_grams) return a + Number(g.current_price_per_gram) * Number(g.quantity_grams)
      return a + Number(g.invested_amount ?? 0)
    }, 0)
    const bondVal  = filterByView(bondInvestments ?? []).reduce((a: number, b: any) => a + Number(b.current_value ?? b.invested_amount ?? 0), 0)
    const etfVal   = filterByView(etfInvestments ?? []).reduce((a: number, e: any) => a + Number(e.units ?? 0) * Number(e.current_price ?? e.avg_buy_price ?? 0), 0)
    const fullEquity = totalAssets + rdVal + npsVal + licPaid + goldVal + bondVal + etfVal
    const totalPortfolio = fullEquity + totalLiab
    const debtPct = totalPortfolio > 0 ? Math.round(totalLiab / totalPortfolio * 100) : 0
    const deZone  = debtPct > 60 ? 'high_debt' : debtPct > 30 ? 'moderate' : totalLiab === 0 && fullEquity > 0 ? 'debt_free' : 'healthy'

    return { sym, totalAssets, totalLiab, netWorth, monthlyIncome, monthlyExpense, savingsRate, utilPct, filteredLoans, filteredCards, fullEquity, debtPct, deZone }
  }, [view, fromMonth, toMonth, transactions, loans, accounts, stocks, mutualFunds, fixedDeposits, recurringDeposits, npsAccounts, licPolicies, goldInvestments, bondInvestments, etfInvestments])

  const { sym } = metrics

  // Build all months in selected range, cap display at 12 for charts
  const rangeMonths = useMemo(() => {
    const months: string[] = []
    let cur = fromMonth
    while (cur <= toMonth && months.length < 60) {
      months.push(cur)
      const [y, m] = cur.split('-').map(Number)
      const d = new Date(y, m, 1)
      cur = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    }
    return months
  }, [fromMonth, toMonth])

  const displayMonths = rangeMonths.length > 12 ? rangeMonths.slice(-12) : rangeMonths

  // True if selected range includes today's month
  const todayMonth = new Date().toISOString().slice(0, 7)
  const isLiveRange = fromMonth <= todayMonth && toMonth >= todayMonth

  // Whether there's any transaction data in the selected range
  const hasRangeData = transactions.some((t: any) => inRange(t.txn_date))

  // Income/expense bar data — strictly for the selected range months
  const incomeExpenseData = useMemo(() => {
    return displayMonths.map(m => {
      const monthTxns = transactions.filter((t: any) => t.txn_date?.startsWith(m))
      const income  = monthTxns.filter((t:any)=>t.txn_type==='income').reduce((a:number,t:any)=>a+Number(t.amount),0)
      const expense = monthTxns.filter((t:any)=>t.txn_type==='expense').reduce((a:number,t:any)=>a+Number(t.amount),0)
      const savings = income - expense
      return { month: MONTHS_SHORT[Number(m.slice(5))-1], income: Math.round(income), expense: Math.round(expense), savings: Math.max(0,Math.round(savings)) }
    })
  }, [transactions, displayMonths])

  // NW trend — only shown for live range; simulated from current NW across range months
  const nwTrend = useMemo(() => {
    if (!isLiveRange) return []
    return displayMonths.map((m, idx) => ({
      month: MONTHS_SHORT[Number(m.slice(5))-1],
      value: Math.round(metrics.netWorth * (0.78 + idx * (0.22 / Math.max(displayMonths.length - 1, 1))))
    }))
  }, [metrics.netWorth, displayMonths, isLiveRange])

  // Budget donut data
  const budgetData = useMemo(() => {
    const spendMap: Record<string, number> = {}
    transactions.filter((t:any)=>t.txn_type==='expense'&&inRange(t.txn_date)).forEach((t:any)=>{ spendMap[t.category]=(spendMap[t.category]??0)+Number(t.amount) })
    return Object.entries(spendMap).map(([name, value]) => ({ name, value: Math.round(value) })).sort((a,b)=>b.value-a.value).slice(0,6)
  }, [transactions, fromMonth, toMonth])

  const budgetTotal = budgetData.reduce((a,d)=>a+d.value,0)

  // Upcoming bills — only meaningful when viewing the current/future period
  const upcomingBills = useMemo(() => {
    if (!isLiveRange) return []
    const today = new Date()
    const items: Array<{ name: string; amount: string; date: string; daysLeft: number; status: 'paid' | 'upcoming' | 'urgent' }> = []
    loans.forEach((l: any) => {
      if (l.next_emi_date) {
        const d = Math.ceil((new Date(l.next_emi_date).getTime() - today.getTime()) / 86400000)
        if (d <= 45) items.push({ name: `${l.name} EMI`, amount: `${l.currency==='AED'?'AED ':'₹'}${Number(l.emi_amount).toLocaleString('en-IN')}`, date: l.next_emi_date, daysLeft: d, status: d < 0 ? 'paid' : d <= 7 ? 'urgent' : 'upcoming' })
      }
    })
    insurance.forEach((p: any) => {
      if (p.next_premium_date) {
        const d = Math.ceil((new Date(p.next_premium_date).getTime() - today.getTime()) / 86400000)
        if (d <= 45) items.push({ name: p.policy_name, amount: `${p.currency==='AED'?'AED ':'₹'}${Number(p.annual_premium).toLocaleString('en-IN')}`, date: p.next_premium_date, daysLeft: d, status: d < 0 ? 'paid' : d <= 7 ? 'urgent' : 'upcoming' })
      }
    })
    return items.sort((a,b)=>a.daysLeft-b.daysLeft).slice(0,6)
  }, [loans, insurance, isLiveRange])

  // Debt payoff
  const totalDebt = metrics.totalLiab
  const monthlyPayments = loans.reduce((a:number,l:any)=>a+Number(l.emi_amount??0),0)
  const debtFreeMonths = monthlyPayments > 0 ? Math.ceil(totalDebt / monthlyPayments) : 0
  const debtFreeYear = debtFreeMonths > 0 ? new Date(Date.now() + debtFreeMonths*30*86400000).toLocaleDateString('en-GB',{month:'short',year:'numeric'}) : 'Debt Free'

  // Savings goals
  const topGoals = goals.filter((g:any)=>g.target_amount>0).slice(0,2)

  return (
    <div className="space-y-5 animate-fade-up">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--text)' }}>Welcome back!</h1>
          <p className="text-[12px] mt-0.5" style={{ color: 'var(--text3)' }}>
            Here&apos;s your financial overview · {view === 'uae' ? 'UAE · AED' : view === 'india' ? 'India · INR' : 'Consolidated · INR'}
          </p>
        </div>
        <div className="text-[12px] font-medium px-3 py-1.5 rounded-lg" style={{ background: 'var(--sage-bg)', color: 'var(--sage)' }}>
          {fromMonth === toMonth
            ? new Date(fromMonth + '-01').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
            : `${new Date(fromMonth + '-01').toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })} – ${new Date(toMonth + '-01').toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}`}
        </div>
      </div>

      {/* No-data banner for historical periods */}
      {!hasRangeData && (
        <div className="rounded-xl p-4 flex items-center gap-3"
          style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}>
          <AlertCircle size={16} style={{ color: 'var(--gold)', flexShrink: 0 }} />
          <div className="text-[12px]" style={{ color: 'var(--text2)' }}>
            No transaction data found for the selected period. Charts and metrics below reflect current portfolio values or are empty.
          </div>
        </div>
      )}

      {/* KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard
          label="Total Net Worth"
          value={isLiveRange ? fmt(metrics.netWorth, sym) : '—'}
          delta={isLiveRange ? 'Current value' : 'Live period only'}
          positive={isLiveRange}
          accent="sage"
          icon={<TrendingUp size={14} />}
        />
        <MetricCard
          label={fromMonth === toMonth ? 'Monthly Income' : 'Period Income'}
          value={hasRangeData ? fmt(metrics.monthlyIncome, sym) : '—'}
          accent="income"
          icon={<Wallet size={14} />}
        />
        <MetricCard
          label={fromMonth === toMonth ? 'Monthly Expenses' : 'Period Expenses'}
          value={hasRangeData ? fmt(metrics.monthlyExpense, sym) : '—'}
          accent="expense"
          icon={<TrendingDown size={14} />}
        />
        <MetricCard
          label="Savings Rate"
          value={hasRangeData ? `${metrics.savingsRate}%` : '—'}
          delta={hasRangeData ? (metrics.savingsRate >= 20 ? '✓ On Track' : '⚠ Low') : 'No data'}
          positive={metrics.savingsRate >= 20}
          accent="gold"
          icon={<Percent size={14} />}
        />
      </div>

      {/* D/E Ratio Widget */}
      {(() => {
        const { debtPct, deZone, fullEquity, totalLiab } = metrics
        const zoneColor   = deZone === 'high_debt' ? '#EF4444' : deZone === 'moderate' ? '#F59E0B' : '#10B981'
        const zoneBg      = deZone === 'high_debt' ? '#FEF2F2' : deZone === 'moderate' ? '#FFFBEB' : '#ECFDF5'
        const zoneLabel   = deZone === 'high_debt' ? 'High Debt' : deZone === 'moderate' ? 'Moderate' : deZone === 'debt_free' ? 'Debt Free' : 'Healthy'
        const zoneMessage = deZone === 'high_debt'
          ? 'Debt exceeds investments. Prioritise loan repayment.'
          : deZone === 'moderate'
          ? 'Balanced but room to improve. Grow investments steadily.'
          : deZone === 'debt_free'
          ? 'No debt! Focus on compounding your investments.'
          : 'Investments outweigh debt. Keep growing your equity.'
        return (
          <div className="wl-card p-4 flex items-center gap-4" style={{ border: `1.5px solid ${zoneColor}30`, background: zoneBg }}>
            {/* Mini gauge bar */}
            <div className="flex-shrink-0">
              <div className="w-16 h-16 rounded-full flex items-center justify-center font-black text-[18px]"
                style={{ background: `conic-gradient(${zoneColor} ${debtPct * 3.6}deg, #E5E7EB ${debtPct * 3.6}deg)`, color: zoneColor }}>
                <div className="w-11 h-11 bg-white rounded-full flex items-center justify-center text-[13px] font-black" style={{ color: zoneColor }}>
                  {debtPct}%
                </div>
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-[13px] font-bold" style={{ color: 'var(--text)' }}>Debt vs Equity</span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: zoneColor + '20', color: zoneColor }}>{zoneLabel}</span>
              </div>
              <div className="text-[11px] mb-2" style={{ color: 'var(--text3)' }}>{zoneMessage}</div>
              <div className="flex gap-3 text-[11px]">
                <span><span style={{ color: '#10B981' }}>▲</span> Equity <span className="font-mono font-bold" style={{ color: 'var(--text)' }}>{fmt(fullEquity, sym)}</span></span>
                <span><span style={{ color: '#EF4444' }}>▼</span> Debt <span className="font-mono font-bold" style={{ color: 'var(--text)' }}>{fmt(totalLiab, sym)}</span></span>
              </div>
            </div>
            <Link href="/dashboard/debt-equity"
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-semibold flex-shrink-0"
              style={{ background: zoneColor, color: '#fff' }}>
              Full Analysis <ArrowRight size={11} />
            </Link>
          </div>
        )
      })()}

      {/* Row 2: Budget | Income&Expense | Bills */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Budget Summary */}
        <div className="wl-card p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--text3)' }}>Budget Summary</span>
            <Link href="/dashboard/budgets" className="text-[10px] flex items-center gap-0.5" style={{ color: 'var(--sage)' }}>
              View Budget <ArrowRight size={10} />
            </Link>
          </div>
          {budgetData.length > 0 ? (
            <>
              <div className="flex justify-center">
                <div className="relative w-[150px] h-[150px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={budgetData} dataKey="value" cx="50%" cy="50%" innerRadius={44} outerRadius={68} paddingAngle={2}>
                        {budgetData.map((_,i)=><Cell key={i} fill={DONUT_COLORS[i%DONUT_COLORS.length]} />)}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <div className="text-[13px] font-bold font-mono" style={{ color: 'var(--text)' }}>{fmt(budgetTotal, sym)}</div>
                    <div className="text-[9px]" style={{ color: 'var(--text3)' }}>Selected period</div>
                  </div>
                </div>
              </div>
              <div className="space-y-1.5 mt-2">
                {budgetData.map((d,i)=>(
                  <div key={i} className="flex items-center justify-between text-[11px]">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-sm" style={{ background: DONUT_COLORS[i%DONUT_COLORS.length] }} />
                      <span style={{ color: 'var(--text2)' }}>{d.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono" style={{ color: 'var(--text)' }}>{fmt(d.value, sym)}</span>
                      <span style={{ color: 'var(--text3)' }}>{budgetTotal>0?Math.round(d.value/budgetTotal*100):0}%</span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center h-32 text-[12px]" style={{ color: 'var(--text3)' }}>
              {hasRangeData ? 'Upload statements to see spending' : 'No data for selected period'}
            </div>
          )}
        </div>

        {/* Income & Expense Overview */}
        <div className="wl-card p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--text3)' }}>Income &amp; Expense Overview</span>
            <Link href="/dashboard/expenses" className="text-[10px] flex items-center gap-0.5" style={{ color: 'var(--sage)' }}>
              View Reports <ArrowRight size={10} />
            </Link>
          </div>
          {hasRangeData ? (
            <>
              <div className="flex items-center gap-3 mb-3">
                {[['Income','var(--income)'],['Expenses','var(--expense)'],['Savings','var(--gold)']].map(([l,c])=>(
                  <div key={l} className="flex items-center gap-1 text-[10px]">
                    <span className="w-2.5 h-2 rounded-sm" style={{ background: c as string }} />
                    <span style={{ color: 'var(--text3)' }}>{l}</span>
                  </div>
                ))}
              </div>
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={incomeExpenseData} barCategoryGap="25%">
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="month" tick={{ fill:'var(--text3)', fontSize:10 }} axisLine={false} tickLine={false} />
                  <YAxis hide />
                  <Tooltip
                    contentStyle={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:8, fontSize:11 }}
                    formatter={(v:any,n:string)=>[fmt(v,sym), n.charAt(0).toUpperCase()+n.slice(1)]}
                    labelStyle={{ color:'var(--text)' }}
                  />
                  <Bar dataKey="income"  fill="var(--income)"  radius={[3,3,0,0]} />
                  <Bar dataKey="expense" fill="var(--expense)" radius={[3,3,0,0]} />
                  <Line type="monotone" dataKey="savings" stroke="var(--gold)" strokeWidth={1.5} dot={{ r:2, fill:'var(--gold)' }} />
                </BarChart>
              </ResponsiveContainer>
            </>
          ) : (
            <div className="flex items-center justify-center h-40 text-[12px]" style={{ color: 'var(--text3)' }}>
              No income or expense data for selected period
            </div>
          )}
        </div>

        {/* Bill Tracker */}
        <div className="wl-card p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--text3)' }}>Bill Tracker</span>
            <Link href="/dashboard/loans" className="text-[10px] flex items-center gap-0.5" style={{ color: 'var(--sage)' }}>
              View All Bills <ArrowRight size={10} />
            </Link>
          </div>
          {upcomingBills.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-center text-[12px] px-4" style={{ color: 'var(--text3)' }}>
              {isLiveRange ? 'No upcoming bills in the next 45 days' : 'Select current or future period to see upcoming bills'}
            </div>
          ) : (
            <div className="space-y-2">
              {upcomingBills.map((b, i) => {
                const StatusIcon = b.status === 'paid' ? CheckCircle2 : b.status === 'urgent' ? AlertCircle : Clock
                const statusColor = b.status === 'paid' ? 'var(--income)' : b.status === 'urgent' ? 'var(--rose)' : 'var(--gold)'
                return (
                  <div key={i} className="flex items-center justify-between py-2" style={{ borderBottom: i < upcomingBills.length-1 ? '1px solid var(--border)' : 'none' }}>
                    <div>
                      <div className="text-[12px] font-semibold" style={{ color: 'var(--text)' }}>{b.name}</div>
                      <div className="text-[10px]" style={{ color: 'var(--text3)' }}>{b.date}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[12px] font-mono font-bold" style={{ color: 'var(--text)' }}>{b.amount}</span>
                      <div className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: `color-mix(in srgb, ${statusColor} 10%, transparent)`, color: statusColor }}>
                        <StatusIcon size={10} />
                        {b.status === 'paid' ? 'Paid' : b.status === 'urgent' ? 'Urgent' : 'Upcoming'}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Row 3: Debt | Goals | Net Worth */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Debt Payoff Preview */}
        <div className="wl-card p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--text3)' }}>Debt Payoff Preview</span>
            <Link href="/dashboard/loans" className="text-[10px] flex items-center gap-0.5" style={{ color: 'var(--sage)' }}>
              View Debt Plan <ArrowRight size={10} />
            </Link>
          </div>
          <div className="flex items-start gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'var(--blue-bg)' }}>
              <TrendingDown size={18} style={{ color: 'var(--blue)' }} />
            </div>
            <div>
              <div className="text-[10px]" style={{ color: 'var(--text3)' }}>Total Debt</div>
              <div className="text-[20px] font-bold font-mono" style={{ color: 'var(--text)' }}>{fmt(totalDebt, sym)}</div>
              <div className="text-[10px] mt-0.5" style={{ color: 'var(--text3)' }}>
                Estimated Paid Off: <span className="font-semibold" style={{ color: 'var(--text)' }}>{debtFreeYear}</span>
              </div>
            </div>
          </div>
          {/* Simple payoff chart */}
          <ResponsiveContainer width="100%" height={90}>
            <LineChart data={Array.from({length:6},(_, i)=>({ m: i, v: Math.max(0, totalDebt - monthlyPayments*(i+1)*3) }))}>
              <Line type="monotone" dataKey="v" stroke="var(--blue)" strokeWidth={2} dot={false} />
              <Tooltip contentStyle={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:8, fontSize:10 }} formatter={(v:any)=>[fmt(v,sym),'Remaining']} labelStyle={{ display:'none' }} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Savings Goals */}
        <div className="wl-card p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--text3)' }}>Savings Goals</span>
            <Link href="/dashboard/budgets" className="text-[10px] flex items-center gap-0.5" style={{ color: 'var(--sage)' }}>
              View All Goals <ArrowRight size={10} />
            </Link>
          </div>
          {topGoals.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 gap-2 text-[12px]" style={{ color: 'var(--text3)' }}>
              <Target size={24} style={{ color: 'var(--border2)' }} />
              No goals set yet
            </div>
          ) : (
            <div className="space-y-4">
              {topGoals.map((g:any, i:number) => {
                const pct = Math.min(100, Math.round((Number(g.current_amount??0)/Number(g.target_amount))*100))
                const colors = ['var(--sage)','var(--gold)']
                return (
                  <div key={i}>
                    <div className="flex justify-between items-baseline mb-1.5">
                      <div className="text-[12px] font-semibold" style={{ color: 'var(--text)' }}>{g.name}</div>
                      <div className="text-[11px] font-mono" style={{ color: 'var(--text2)' }}>
                        {fmt(Number(g.current_amount??0),sym)} of {fmt(Number(g.target_amount),sym)}
                      </div>
                    </div>
                    <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--bg2)' }}>
                      <div className="h-full rounded-full transition-all" style={{ width:`${pct}%`, background: colors[i] }} />
                    </div>
                    <div className="text-[10px] mt-1 text-right font-semibold" style={{ color: colors[i] as string }}>{pct}%</div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Net Worth Over Time */}
        <div className="wl-card p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--text3)' }}>Net Worth Over Time</span>
            <Link href="/dashboard/investments" className="text-[10px] flex items-center gap-0.5" style={{ color: 'var(--sage)' }}>
              View Net Worth <ArrowRight size={10} />
            </Link>
          </div>
          {isLiveRange && nwTrend.length > 0 ? (
            <ResponsiveContainer width="100%" height={150}>
              <LineChart data={nwTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="month" tick={{ fill:'var(--text3)', fontSize:10 }} axisLine={false} tickLine={false} />
                <YAxis hide />
                <Tooltip
                  contentStyle={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:8, fontSize:11 }}
                  formatter={(v:any)=>[fmt(v,sym),'Net Worth']}
                  labelStyle={{ color:'var(--text)' }}
                />
                <Line type="monotone" dataKey="value" stroke="var(--sage)" strokeWidth={2.5}
                  dot={{ r:3, fill:'var(--sage)', strokeWidth:0 }}
                  activeDot={{ r:5, fill:'var(--sage)' }} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[150px] text-center text-[12px] px-4" style={{ color: 'var(--text3)' }}>
              Net worth trend is available for the current period only
            </div>
          )}
        </div>
      </div>

      {/* Monthly Review Banner — only shown when there's data */}
      {hasRangeData && <div className="wl-card p-4 flex items-center gap-4"
        style={{ background: 'linear-gradient(135deg, var(--sage-bg) 0%, #fff 60%)' }}>
        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'var(--sage)', color: '#fff' }}>
          <Target size={18} />
        </div>
        <div className="flex-1">
          <div className="text-[13px] font-bold" style={{ color: 'var(--text)' }}>
            {fromMonth === toMonth ? 'Monthly Review' : 'Period Review'} — {fromMonth === toMonth
              ? new Date(fromMonth + '-01').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
              : `${new Date(fromMonth + '-01').toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })} – ${new Date(toMonth + '-01').toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}`}
          </div>
          <div className="text-[11px] mt-0.5" style={{ color: 'var(--text2)' }}>
            {metrics.monthlyExpense < metrics.monthlyIncome
              ? `You saved ${fmt(metrics.monthlyIncome - metrics.monthlyExpense, sym)} this month. Savings rate: ${metrics.savingsRate}%. Keep it up!`
              : `Expenses exceeded income by ${fmt(metrics.monthlyExpense - metrics.monthlyIncome, sym)}. Review your budget.`}
          </div>
        </div>
        <Link href="/dashboard/budgets"
          className="px-4 py-2 rounded-lg text-[12px] font-semibold text-white flex items-center gap-1.5"
          style={{ background: 'var(--sage)' }}>
          Review in Detail <ArrowRight size={12} />
        </Link>
      </div>}
    </div>
  )
}
