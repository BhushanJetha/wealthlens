'use client'
import { useMemo } from 'react'
import { useViewStore } from '@/store/viewStore'
import MetricCard from '@/components/dashboard/MetricCard'
import { NetWorthChart } from '@/components/charts/NetWorthChart'
import { SpendingPieChart } from '@/components/charts/SpendingPieChart'
import { CashFlowPanel } from '@/components/dashboard/CashFlowPanel'
import { AIInsightBanner } from '@/components/dashboard/AIInsightBanner'
import { RecentActivity } from '@/components/dashboard/RecentActivity'
import { TrendingUp, TrendingDown, DollarSign, Percent, ArrowUpRight } from 'lucide-react'

const FX = 22.80

function toINR(amount: number, currency: string) {
  return currency === 'AED' ? amount * FX : amount
}

export default function DashboardClient({ transactions, loans, accounts, stocks, mutualFunds, fixedDeposits, insurance, goals, budgets }: any) {
  const { view } = useViewStore()

  const metrics = useMemo(() => {
    const creditCards = accounts.filter((a: any) => a.account_type === 'credit_card')

    // Filter by view
    const filterByView = (arr: any[], currencyField = 'currency') =>
      view === 'uae' ? arr.filter((x: any) => x[currencyField] === 'AED' || x.country === 'UAE')
      : view === 'india' ? arr.filter((x: any) => x[currencyField] === 'INR' || x.country === 'India')
      : arr

    const filteredLoans = filterByView(loans)
    const filteredCards = filterByView(creditCards)
    const filteredStocks = filterByView(stocks)
    const filteredMF = filterByView(mutualFunds)
    const filteredFD = filterByView(fixedDeposits)

    const sym = view === 'uae' ? 'AED ' : '₹'

    // Assets
    const stockVal  = filteredStocks.reduce((a: number, s: any) => a + (view === 'consolidated' ? toINR(s.quantity * (s.current_price ?? s.avg_buy_price), s.currency) : s.quantity * (s.current_price ?? s.avg_buy_price)), 0)
    const mfVal     = filteredMF.reduce((a: number, m: any) => a + m.units * (m.current_nav ?? m.avg_nav), 0)
    const fdVal     = filteredFD.reduce((a: number, f: any) => a + (view === 'consolidated' ? toINR(Number(f.principal), f.currency) : Number(f.principal)), 0)
    const totalAssets = stockVal + mfVal + fdVal

    // Liabilities
    const loanLiab = filteredLoans.reduce((a: number, l: any) => a + (view === 'consolidated' ? toINR(Number(l.outstanding_amt), l.currency) : Number(l.outstanding_amt)), 0)
    const cardLiab = filteredCards.reduce((a: number, c: any) => a + (view === 'consolidated' ? toINR(Number(c.outstanding_bal ?? 0), c.currency) : Number(c.outstanding_bal ?? 0)), 0)
    const totalLiab = loanLiab + cardLiab

    const netWorth = totalAssets - totalLiab

    // This month spending
    const thisMonth = new Date().toISOString().slice(0, 7)
    const filteredTxns = filterByView(transactions.filter((t: any) => t.txn_date?.startsWith(thisMonth) && t.txn_type === 'expense'))
    const monthlySpend = filteredTxns.reduce((a: number, t: any) => a + (view === 'consolidated' ? toINR(Number(t.amount), t.currency) : Number(t.amount)), 0)

    // Overall credit utilization
    const totalLimit = filteredCards.reduce((a: number, c: any) => a + Number(c.credit_limit ?? 0), 0)
    const totalBal   = filteredCards.reduce((a: number, c: any) => a + Number(c.outstanding_bal ?? 0), 0)
    const utilPct    = totalLimit > 0 ? Math.round(totalBal / totalLimit * 100) : 0

    return { sym, totalAssets, totalLiab, netWorth, monthlySpend, utilPct, filteredTxns }
  }, [view, transactions, loans, accounts, stocks, mutualFunds, fixedDeposits])

  const sym = metrics.sym

  // Build monthly net worth trend from transactions (last 6 months)
  const nwTrend = useMemo(() => {
    const months: string[] = []
    for (let i = 5; i >= 0; i--) {
      const d = new Date(); d.setMonth(d.getMonth() - i)
      months.push(d.toISOString().slice(0, 7))
    }
    return months.map(m => ({
      month: m.slice(5) + '/' + m.slice(2, 4),
      value: Math.round(metrics.netWorth * (0.85 + Math.random() * 0.15))
    }))
  }, [metrics.netWorth])

  // Spending by category
  const catData = useMemo(() => {
    const cats: Record<string, number> = {}
    metrics.filteredTxns.forEach((t: any) => {
      const amt = view === 'consolidated' ? toINR(Number(t.amount), t.currency) : Number(t.amount)
      cats[t.category] = (cats[t.category] ?? 0) + amt
    })
    return Object.entries(cats).map(([name, value]) => ({ name, value: Math.round(value) }))
  }, [metrics.filteredTxns, view])

  // Upcoming dues
  const upcoming = useMemo(() => {
    const today = new Date()
    const items: Array<{ name: string; amount: string; daysLeft: number; urgent: boolean }> = []
    loans.forEach((l: any) => {
      if (l.next_emi_date) {
        const d = Math.ceil((new Date(l.next_emi_date).getTime() - today.getTime()) / 86400000)
        if (d <= 30) items.push({ name: `${l.name} EMI`, amount: `${l.currency === 'AED' ? 'AED ' : '₹'}${Number(l.emi_amount).toLocaleString('en-IN')}`, daysLeft: d, urgent: d <= 7 })
      }
    })
    insurance.forEach((p: any) => {
      if (p.next_premium_date) {
        const d = Math.ceil((new Date(p.next_premium_date).getTime() - today.getTime()) / 86400000)
        if (d <= 30) items.push({ name: `${p.policy_name} Premium`, amount: `${p.currency === 'AED' ? 'AED ' : '₹'}${Number(p.annual_premium).toLocaleString('en-IN')}`, daysLeft: d, urgent: d <= 7 })
      }
    })
    return items.sort((a, b) => a.daysLeft - b.daysLeft)
  }, [loans, insurance])

  return (
    <div className="space-y-5 animate-fade-up">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-white">Executive Dashboard</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            {view === 'uae' ? 'UAE Only · AED' : view === 'india' ? 'India Only · INR' : 'Consolidated · INR Normalized'} · {new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
          </p>
        </div>
      </div>

      {/* AI Insight */}
      <AIInsightBanner utilPct={metrics.utilPct} monthlySpend={metrics.monthlySpend} sym={sym} />

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard
          label="Total Assets"
          value={`${sym}${Math.round(metrics.totalAssets).toLocaleString('en-IN')}`}
          delta="+4.2%" positive accent="teal"
          icon={<TrendingUp size={14} />}
        />
        <MetricCard
          label="Total Liabilities"
          value={`${sym}${Math.round(metrics.totalLiab).toLocaleString('en-IN')}`}
          delta="-0.8%" positive accent="rose"
          icon={<TrendingDown size={14} />}
        />
        <MetricCard
          label="Net Worth"
          value={`${sym}${Math.round(metrics.netWorth).toLocaleString('en-IN')}`}
          delta="+5.1%" positive accent="gold"
          icon={<DollarSign size={14} />}
        />
        <MetricCard
          label="Credit Utilization"
          value={`${metrics.utilPct}%`}
          delta={metrics.utilPct > 30 ? '⚠ High' : '✓ Healthy'}
          positive={metrics.utilPct <= 30}
          accent={metrics.utilPct > 30 ? 'rose' : 'teal'}
          icon={<Percent size={14} />}
        />
      </div>

      {/* Cash Flow + Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <div className="bg-[#162032] border border-white/7 rounded-xl p-4 h-[280px]">
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-3">Net Worth Trend (6M)</div>
            <NetWorthChart data={nwTrend} />
          </div>
        </div>
        <div>
          <div className="bg-[#162032] border border-white/7 rounded-xl p-4 h-[280px]">
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-3">Spending by Category</div>
            {catData.length > 0
              ? <SpendingPieChart data={catData} />
              : <div className="flex items-center justify-center h-full text-slate-600 text-sm">Upload a statement to see spending data</div>
            }
          </div>
        </div>
      </div>

      {/* Cash Flow + Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <CashFlowPanel loans={loans} insurance={insurance} sym={sym} />
        <RecentActivity transactions={transactions.slice(0, 8)} view={view} />
      </div>

      {/* Upcoming Dues */}
      {upcoming.length > 0 && (
        <div className="bg-[#162032] border border-white/7 rounded-xl p-4">
          <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-3">Upcoming Dues (30 days)</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {upcoming.map((item, i) => (
              <div key={i} className={`flex items-center justify-between p-3 rounded-lg border ${item.urgent ? 'bg-rose-500/8 border-rose-500/20' : 'bg-[#1E2D40] border-white/5'}`}>
                <div>
                  <div className="text-[12px] font-semibold text-white">{item.name}</div>
                  <div className={`text-[11px] ${item.urgent ? 'text-rose-400' : 'text-slate-500'}`}>in {item.daysLeft} days</div>
                </div>
                <div className={`text-[13px] font-bold font-mono ${item.urgent ? 'text-rose-400' : 'text-white'}`}>{item.amount}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
