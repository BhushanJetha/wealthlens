'use client'
import { useMemo, useState } from 'react'
import { useViewStore } from '@/store/viewStore'
import MetricCard from '@/components/dashboard/MetricCard'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import { TrendingUp, Plus, ArrowRight } from 'lucide-react'
import AddInvestmentModal from '@/components/forms/AddInvestmentModal'
import Link from 'next/link'

const FX = 22.80
const COLORS = ['#3D7A58','#3B7DD8','#D4920A','#C96A3A','#7C5CBF','#2E7D52','#B45309','#0891B2','#6D28D9']

function toINR(amt: number, cur: string) { return cur === 'AED' ? amt * FX : amt }
function fmt(n: number, sym: string) {
  if (Math.abs(n) >= 10000000) return `${sym}${(n/10000000).toFixed(2)}Cr`
  if (Math.abs(n) >= 100000)   return `${sym}${(n/100000).toFixed(2)}L`
  return `${sym}${Math.round(n).toLocaleString('en-IN')}`
}

const INV_TYPES = [
  { href: '/dashboard/investments/mutual-funds',       label: 'Mutual Funds',       key: 'mf'    },
  { href: '/dashboard/investments/stocks',             label: 'Stocks',             key: 'st'    },
  { href: '/dashboard/investments/etf',                label: 'ETF',                key: 'etf'   },
  { href: '/dashboard/investments/fixed-deposits',     label: 'Fixed Deposits',     key: 'fd'    },
  { href: '/dashboard/investments/recurring-deposits', label: 'Recurring Deposits', key: 'rd'    },
  { href: '/dashboard/investments/gold',               label: 'Gold',               key: 'gold'  },
  { href: '/dashboard/investments/bonds',              label: 'Bonds',              key: 'bonds' },
  { href: '/dashboard/investments/nps',                label: 'NPS',                key: 'nps'   },
  { href: '/dashboard/investments/lic',                label: 'LIC',                key: 'lic'   },
]

export default function InvestmentsClient({
  stocks, mutualFunds, fixedDeposits, recurringDeposits, npsAccounts, licPolicies,
  goldInvestments = [], bondInvestments = [], etfInvestments = []
}: any) {
  const { view } = useViewStore()
  const [showAdd, setShowAdd] = useState(false)
  const sym = view === 'uae' ? 'AED ' : '₹'

  const filter = (arr: any[]) =>
    view === 'uae'   ? arr.filter(x => x.currency === 'AED' || x.country === 'UAE')
    : view === 'india' ? arr.filter(x => x.currency === 'INR' || x.country === 'India')
    : arr

  const conv = (amt: number, cur: string) => view === 'consolidated' ? toINR(amt, cur) : amt

  const fSt   = filter(stocks)
  const fMF   = filter(mutualFunds)
  const fFD   = filter(fixedDeposits)
  const fRD   = filter(recurringDeposits)
  const fNPS  = filter(npsAccounts)
  const fLIC  = filter(licPolicies)
  const fGold = filter(goldInvestments)
  const fBond = filter(bondInvestments)
  const fEtf  = filter(etfInvestments)

  const stCurr   = fSt.reduce((a:number,s:any)=>a+conv(s.quantity*(s.current_price??s.avg_buy_price),s.currency),0)
  const stInv    = fSt.reduce((a:number,s:any)=>a+conv(s.quantity*s.avg_buy_price,s.currency),0)
  const mfCurr   = fMF.reduce((a:number,m:any)=>a+m.units*(m.current_nav??m.avg_nav),0)
  const mfInv    = fMF.reduce((a:number,m:any)=>a+Number(m.invested_amount),0)
  const fdVal    = fFD.reduce((a:number,f:any)=>a+conv(Number(f.principal),f.currency),0)
  const rdVal    = fRD.reduce((a:number,r:any)=>a+conv(Number(r.monthly_amount)*r.tenure_months,r.currency),0)
  const npsVal   = fNPS.reduce((a:number,n:any)=>a+Number(n.corpus_amount),0)
  const npsInv   = fNPS.reduce((a:number,n:any)=>a+Number(n.invested_amount),0)
  const licVal   = fLIC.reduce((a:number,l:any)=>a+Number(l.sum_assured),0)
  const licPaid  = fLIC.reduce((a:number,l:any)=>a+Number(l.total_paid??0),0)
  const goldVal  = fGold.reduce((a:number,g:any)=>{
    if (g.current_price_per_gram && g.quantity_grams) return a + Number(g.current_price_per_gram)*Number(g.quantity_grams)
    return a + Number(g.invested_amount||0)
  }, 0)
  const goldInv  = fGold.reduce((a:number,g:any)=>a+Number(g.invested_amount||0),0)
  const bondVal  = fBond.reduce((a:number,b:any)=>a+Number(b.current_value||b.invested_amount||0),0)
  const bondInv  = fBond.reduce((a:number,b:any)=>a+Number(b.invested_amount||0),0)
  const etfCurr  = fEtf.reduce((a:number,e:any)=>a+Number(e.units||0)*Number(e.current_price||e.avg_buy_price||0),0)
  const etfInv   = fEtf.reduce((a:number,e:any)=>a+Number(e.invested_amount||0),0)

  const totalCurr = stCurr + mfCurr + fdVal + rdVal + npsVal + goldVal + bondVal + etfCurr
  const totalInv  = stInv  + mfInv  + fdVal + rdVal + npsInv + goldInv + bondInv + etfInv
  const totalRet  = totalInv > 0 ? ((totalCurr - totalInv) / totalInv * 100).toFixed(2) : '0.00'
  const dailyPnL  = fSt.reduce((a:number,s:any)=>a+(s.daily_change??0),0)

  const allocData = [
    { name: 'Mutual Funds', value: Math.round(mfCurr),   count: fMF.length   },
    { name: 'Stocks',       value: Math.round(stCurr),   count: fSt.length   },
    { name: 'ETF',          value: Math.round(etfCurr),  count: fEtf.length  },
    { name: 'FDs',          value: Math.round(fdVal),    count: fFD.length   },
    { name: 'RDs',          value: Math.round(rdVal),    count: fRD.length   },
    { name: 'Gold',         value: Math.round(goldVal),  count: fGold.length },
    { name: 'Bonds',        value: Math.round(bondVal),  count: fBond.length },
    { name: 'NPS',          value: Math.round(npsVal),   count: fNPS.length  },
    { name: 'LIC',          value: Math.round(licPaid),  count: fLIC.length  },
  ].filter(d => d.value > 0)

  const typeStats = useMemo(() => [
    { label: 'Mutual Funds',       value: fmt(mfCurr,sym),  count: fMF.length,   href: '/dashboard/investments/mutual-funds',       color: COLORS[0] },
    { label: 'Stocks',             value: fmt(stCurr,sym),  count: fSt.length,   href: '/dashboard/investments/stocks',             color: COLORS[1] },
    { label: 'ETF',                value: fmt(etfCurr,sym), count: fEtf.length,  href: '/dashboard/investments/etf',                color: COLORS[2] },
    { label: 'Fixed Deposits',     value: fmt(fdVal,sym),   count: fFD.length,   href: '/dashboard/investments/fixed-deposits',     color: COLORS[3] },
    { label: 'Recurring Deposits', value: fmt(rdVal,sym),   count: fRD.length,   href: '/dashboard/investments/recurring-deposits', color: COLORS[4] },
    { label: 'Gold',               value: fmt(goldVal,sym), count: fGold.length, href: '/dashboard/investments/gold',               color: COLORS[5] },
    { label: 'Bonds',              value: fmt(bondVal,sym), count: fBond.length, href: '/dashboard/investments/bonds',              color: COLORS[6] },
    { label: 'NPS',                value: fmt(npsVal,sym),  count: fNPS.length,  href: '/dashboard/investments/nps',                color: COLORS[7] },
    { label: 'LIC',                value: fmt(licVal,sym),  count: fLIC.length,  href: '/dashboard/investments/lic',                color: COLORS[8] },
  ], [mfCurr,stCurr,etfCurr,fdVal,rdVal,goldVal,bondVal,npsVal,licVal,fMF,fSt,fEtf,fFD,fRD,fGold,fBond,fNPS,fLIC,sym])

  return (
    <div className="space-y-5 animate-fade-up">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--text)' }}>Investment Portfolio</h1>
          <p className="text-[12px] mt-0.5" style={{ color: 'var(--text3)' }}>
            {view === 'uae' ? 'UAE investments' : view === 'india' ? 'India investments' : 'All investments'} — select a category to drill down
          </p>
        </div>
        <button onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-white text-[12px] font-bold"
          style={{ background: 'var(--sage)' }}>
          <Plus size={14} /> Add Investment
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard label="Total Invested"  value={fmt(totalInv,sym)}  accent="blue" icon={<TrendingUp size={14}/>} />
        <MetricCard label="Current Value"   value={fmt(totalCurr,sym)} accent="sage" icon={<TrendingUp size={14}/>} />
        <MetricCard label="Total Returns"
          value={fmt(totalCurr-totalInv,sym)}
          delta={`${Number(totalRet)>=0?'+':''}${totalRet}%`}
          positive={Number(totalRet)>=0} accent="gold" />
        <MetricCard label="Today&apos;s P&amp;L"
          value={fmt(Math.abs(dailyPnL),sym)}
          delta={dailyPnL>=0?'▲ Gain':'▼ Loss'} positive={dailyPnL>=0}
          accent={dailyPnL>=0?'income':'rose'} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="wl-card p-4">
          <div className="text-[11px] font-bold uppercase tracking-wider mb-3" style={{ color: 'var(--text3)' }}>Asset Allocation</div>
          {allocData.length > 0 ? (
            <div className="flex items-center gap-4">
              <ResponsiveContainer width={160} height={160}>
                <PieChart>
                  <Pie data={allocData} dataKey="value" cx="50%" cy="50%" innerRadius={45} outerRadius={72} paddingAngle={2}>
                    {allocData.map((_,i) => <Cell key={i} fill={COLORS[i%COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={{ background:'#fff', border:'1px solid var(--border)', borderRadius:8, fontSize:11 }}
                    formatter={(v:any)=>[fmt(v,sym),'']} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-col gap-1.5 flex-1">
                {allocData.map((d,i) => (
                  <div key={i} className="flex items-center justify-between text-[11px]">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-sm" style={{ background: COLORS[i%COLORS.length] }} />
                      <span style={{ color: 'var(--text2)' }}>{d.name}</span>
                    </div>
                    <span className="font-mono font-semibold" style={{ color: 'var(--text)' }}>{fmt(d.value,sym)}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-32 text-[12px]" style={{ color: 'var(--text3)' }}>
              Add investments to see allocation
            </div>
          )}
        </div>

        <div className="wl-card p-4">
          <div className="text-[11px] font-bold uppercase tracking-wider mb-3" style={{ color: 'var(--text3)' }}>By Investment Type</div>
          <div className="space-y-1.5">
            {typeStats.map((t) => (
              <Link key={t.href} href={t.href}
                className="flex items-center justify-between p-2 rounded-lg transition-all group"
                style={{ background: 'var(--bg2)' }}>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full" style={{ background: t.color }} />
                  <span className="text-[12px] font-semibold" style={{ color: 'var(--text)' }}>{t.label}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: 'var(--border)', color: 'var(--text3)' }}>{t.count}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[12px] font-mono font-bold" style={{ color: 'var(--text)' }}>{t.value}</span>
                  <ArrowRight size={12} style={{ color: 'var(--text3)' }} className="group-hover:translate-x-0.5 transition-transform" />
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>

      <div>
        <div className="text-[11px] font-bold uppercase tracking-wider mb-3" style={{ color: 'var(--text3)' }}>Manage by Category</div>
        <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-9 gap-2">
          {INV_TYPES.map((t, i) => (
            <Link key={t.href} href={t.href}
              className="wl-card p-3 flex flex-col items-center gap-1 text-center hover:shadow-md transition-shadow group">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: `${COLORS[i]}18`, color: COLORS[i] }}>
                <TrendingUp size={13} />
              </div>
              <div className="text-[10px] font-semibold leading-tight" style={{ color: 'var(--text)' }}>{t.label}</div>
            </Link>
          ))}
        </div>
      </div>

      {showAdd && <AddInvestmentModal onClose={() => setShowAdd(false)} />}
    </div>
  )
}
