'use client'
import { useMemo, useState } from 'react'
import { useViewStore } from '@/store/viewStore'
import MetricCard from '@/components/dashboard/MetricCard'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts'
import { TrendingUp, TrendingDown, Plus, Pencil } from 'lucide-react'
import AddInvestmentModal from '@/components/forms/AddInvestmentModal'

const FX = 22.80
const COLORS = ['#00C9A7','#4A90D9','#F4A535','#7C5CBF','#E8556D','#3CC68A']

function toINR(amt: number, cur: string) { return cur === 'AED' ? amt * FX : amt }

export default function InvestmentsClient({ stocks, mutualFunds, fixedDeposits, recurringDeposits }: any) {
  const { view } = useViewStore()
  const [showAdd, setShowAdd] = useState(false)
  const sym = view === 'uae' ? 'AED ' : '₹'

  const filter = (arr: any[]) =>
    view === 'uae' ? arr.filter(x => x.currency === 'AED' || x.country === 'UAE')
    : view === 'india' ? arr.filter(x => x.currency === 'INR' || x.country === 'India')
    : arr

  const fStocks = filter(stocks)
  const fMF     = filter(mutualFunds)
  const fFD     = filter(fixedDeposits)
  const fRD     = filter(recurringDeposits)

  const conv = (amt: number, cur: string) =>
    view === 'consolidated' ? toINR(amt, cur) : amt

  const stockCurr  = fStocks.reduce((a: number, s: any) => a + conv(s.quantity * (s.current_price ?? s.avg_buy_price), s.currency), 0)
  const stockInv   = fStocks.reduce((a: number, s: any) => a + conv(s.quantity * s.avg_buy_price, s.currency), 0)
  const mfCurr     = fMF.reduce((a: number, m: any) => a + m.units * (m.current_nav ?? m.avg_nav), 0)
  const mfInv      = fMF.reduce((a: number, m: any) => a + Number(m.invested_amount), 0)
  const fdTotal    = fFD.reduce((a: number, f: any) => a + conv(Number(f.principal), f.currency), 0)
  const rdTotal    = fRD.reduce((a: number, r: any) => a + conv(Number(r.monthly_amount) * r.tenure_months, r.currency), 0)

  const totalCurr  = stockCurr + mfCurr + fdTotal + rdTotal
  const totalInv   = stockInv  + mfInv  + fdTotal + rdTotal
  const totalReturn= totalInv > 0 ? ((totalCurr - totalInv) / totalInv * 100).toFixed(2) : '0.00'
  const dailyPnL   = fStocks.reduce((a: number, s: any) => a + (s.daily_change ?? 0), 0)

  const allocData = [
    { name: 'Stocks',   value: Math.round(stockCurr) },
    { name: 'Mut. Funds', value: Math.round(mfCurr) },
    { name: 'FDs',      value: Math.round(fdTotal) },
    { name: 'RDs',      value: Math.round(rdTotal) },
  ].filter(d => d.value > 0)

  const holdingsBar = [
    ...fStocks.map((s: any) => ({
      name: s.symbol ?? s.name.split(' ')[0],
      return: +((conv(s.quantity*(s.current_price??s.avg_buy_price),s.currency) - conv(s.quantity*s.avg_buy_price,s.currency)) / conv(s.quantity*s.avg_buy_price,s.currency)*100).toFixed(1)
    })),
    ...fMF.map((m: any) => ({
      name: m.fund_name.split(' ')[0],
      return: +((m.units*(m.current_nav??m.avg_nav) - Number(m.invested_amount)) / Number(m.invested_amount)*100).toFixed(1)
    })),
  ]

  return (
    <div className="space-y-5 animate-fade-up">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-white">Investment Portfolio</h1>
          <p className="text-xs text-slate-500 mt-0.5">Stocks · Mutual Funds · Fixed Deposits · Recurring Deposits</p>
        </div>
        <button onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-black text-[12px] font-bold"
          style={{ background: 'linear-gradient(135deg,#00C9A7,#4A90D9)' }}>
          <Plus size={14} /> Add Investment
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard label="Total Invested"  value={`${sym}${Math.round(totalInv).toLocaleString('en-IN')}`}  accent="blue" />
        <MetricCard label="Current Value"   value={`${sym}${Math.round(totalCurr).toLocaleString('en-IN')}`} accent="teal" />
        <MetricCard label="Total Returns"   value={`${sym}${Math.round(totalCurr-totalInv).toLocaleString('en-IN')}`}
          delta={`${Number(totalReturn) >= 0 ? '+' : ''}${totalReturn}%`} positive={Number(totalReturn) >= 0} accent="gold" />
        <MetricCard label="Today's P&L"
          value={`${sym}${Math.abs(Math.round(dailyPnL)).toLocaleString('en-IN')}`}
          delta={dailyPnL >= 0 ? '▲ Gain' : '▼ Loss'} positive={dailyPnL >= 0} accent={dailyPnL >= 0 ? 'green' : 'rose'} />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-[#162032] border border-white/7 rounded-xl p-4">
          <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-3">Asset Allocation</div>
          {allocData.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={allocData} dataKey="value" cx="50%" cy="50%" innerRadius={50} outerRadius={78} paddingAngle={2}>
                    {allocData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={{ background:'#1E2D40', border:'1px solid rgba(255,255,255,0.1)', borderRadius:8, fontSize:11 }}
                    formatter={(v:any) => [`${sym}${Number(v).toLocaleString('en-IN')}`, '']} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap gap-3 justify-center">
                {allocData.map((d,i) => (
                  <div key={i} className="flex items-center gap-1.5 text-[11px] text-slate-400">
                    <span className="w-2.5 h-2.5 rounded-sm" style={{ background: COLORS[i % COLORS.length] }} />
                    {d.name} — {sym}{d.value.toLocaleString('en-IN')}
                  </div>
                ))}
              </div>
            </>
          ) : <EmptyState msg="Add investments to see allocation" />}
        </div>

        <div className="bg-[#162032] border border-white/7 rounded-xl p-4">
          <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-3">Returns by Holding (%)</div>
          {holdingsBar.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={holdingsBar} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
                <XAxis type="number" tick={{ fill:'#6A7F92', fontSize:10 }} axisLine={false} tickLine={false} tickFormatter={v=>`${v}%`} />
                <YAxis type="category" dataKey="name" tick={{ fill:'#A0B0C0', fontSize:10 }} axisLine={false} tickLine={false} width={70} />
                <Tooltip contentStyle={{ background:'#1E2D40', border:'1px solid rgba(255,255,255,0.1)', borderRadius:8, fontSize:11 }}
                  formatter={(v:any) => [`${v}%`, 'Return']} />
                <Bar dataKey="return" radius={[0,4,4,0]}
                  fill="#00C9A7"
                  label={false}
                  // Color individually via Cell — Recharts workaround
                />
              </BarChart>
            </ResponsiveContainer>
          ) : <EmptyState msg="No holdings yet" />}
        </div>
      </div>

      {/* Stocks Section */}
      <Section title="Equity Positions" count={fStocks.length}>
        {fStocks.length === 0 ? <EmptyState msg="No stocks added yet. Use Add Investment to get started." /> : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {fStocks.map((s: any, i: number) => {
              const curVal = conv(s.quantity * (s.current_price ?? s.avg_buy_price), s.currency)
              const invVal = conv(s.quantity * s.avg_buy_price, s.currency)
              const ret = invVal > 0 ? ((curVal - invVal) / invVal * 100).toFixed(1) : '0.0'
              return (
                <div key={i} className="bg-[#1E2D40] border border-white/7 rounded-xl p-4">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <div className="text-[13px] font-bold text-white">{s.name}</div>
                      <div className="text-[10px] text-slate-500 uppercase tracking-wider">{s.exchange} · {s.sector ?? 'Equity'}</div>
                    </div>
                    <span className={`text-[11px] font-bold px-2 py-0.5 rounded ${Number(ret) >= 0 ? 'bg-[#00C9A7]/15 text-[#00C9A7]' : 'bg-rose-500/15 text-rose-400'}`}>
                      {Number(ret) >= 0 ? '+' : ''}{ret}%
                    </span>
                  </div>
                  <div className="text-[20px] font-bold font-mono text-white">{sym}{Math.round(curVal).toLocaleString('en-IN')}</div>
                  <div className="flex justify-between text-[10px] text-slate-500 mt-2">
                    <span>Qty: {s.quantity}</span>
                    <span>Avg: {sym}{Number(s.avg_buy_price).toLocaleString('en-IN')}</span>
                    <span className={Number(s.daily_change ?? 0) >= 0 ? 'text-[#3CC68A]' : 'text-rose-400'}>
                      {Number(s.daily_change ?? 0) >= 0 ? '▲' : '▼'} {sym}{Math.abs(s.daily_change ?? 0).toLocaleString()}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Section>

      {/* Mutual Funds */}
      <Section title="Mutual Funds" count={fMF.length}>
        {fMF.length === 0 ? <EmptyState msg="No mutual funds added yet." /> : (
          <div className="overflow-x-auto rounded-xl border border-white/7">
            <table className="w-full text-[12px]">
              <thead><tr className="bg-[#1E2D40]">
                {['Fund','Type','Units','NAV','Invested','Current Value','Returns','Daily'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-[10px] uppercase tracking-wider text-slate-500 font-bold">{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {fMF.map((m: any, i: number) => {
                  const cur = m.units * (m.current_nav ?? m.avg_nav)
                  const inv = Number(m.invested_amount)
                  const ret = inv > 0 ? ((cur - inv) / inv * 100).toFixed(1) : '0.0'
                  return (
                    <tr key={i} className="border-t border-white/5 hover:bg-white/2">
                      <td className="px-4 py-3 font-semibold text-white">{m.fund_name}</td>
                      <td className="px-4 py-3"><span className="bg-[#4A90D9]/15 text-[#4A90D9] px-2 py-0.5 rounded text-[10px] uppercase">{m.fund_type}</span></td>
                      <td className="px-4 py-3 font-mono text-slate-300">{Number(m.units).toFixed(3)}</td>
                      <td className="px-4 py-3 font-mono text-slate-300">₹{Number(m.current_nav ?? m.avg_nav).toFixed(2)}</td>
                      <td className="px-4 py-3 font-mono text-slate-400">₹{Math.round(inv).toLocaleString('en-IN')}</td>
                      <td className="px-4 py-3 font-mono font-bold text-white">₹{Math.round(cur).toLocaleString('en-IN')}</td>
                      <td className="px-4 py-3">
                        <span className={`font-bold ${Number(ret)>=0?'text-[#3CC68A]':'text-rose-400'}`}>{Number(ret)>=0?'+':''}{ret}%</span>
                      </td>
                      <td className="px-4 py-3 text-slate-500 text-[11px]">—</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* FDs and RDs */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Section title="Fixed Deposits" count={fFD.length}>
          {fFD.length === 0 ? <EmptyState msg="No FDs added yet." /> : (
            <div className="space-y-2">
              {fFD.map((f: any, i: number) => {
                const matAmt = f.maturity_amt ?? (Number(f.principal) * (1 + Number(f.interest_rate)/100))
                const earned = matAmt - Number(f.principal)
                const daysLeft = Math.ceil((new Date(f.maturity_date).getTime() - Date.now()) / 86400000)
                return (
                  <div key={i} className="bg-[#1E2D40] border border-white/7 rounded-lg p-3">
                    <div className="flex justify-between items-start mb-1">
                      <div className="text-[13px] font-bold text-white">{f.name}</div>
                      <span className="text-[11px] text-[#F4A535] font-bold">{f.interest_rate}% p.a.</span>
                    </div>
                    <div className="text-[11px] text-slate-500 mb-2">{f.bank_name} · {f.currency === 'AED' ? 'AED' : 'INR'}</div>
                    <div className="flex justify-between text-[12px]">
                      <div><span className="text-slate-500 text-[10px]">Principal</span><br /><span className="font-mono font-bold text-white">{f.currency==='AED'?'AED ':'₹'}{Number(f.principal).toLocaleString('en-IN')}</span></div>
                      <div><span className="text-slate-500 text-[10px]">Interest</span><br /><span className="font-mono font-bold text-[#3CC68A]">+{f.currency==='AED'?'AED ':'₹'}{Math.round(earned).toLocaleString('en-IN')}</span></div>
                      <div className="text-right"><span className="text-slate-500 text-[10px]">Matures in</span><br /><span className={`font-bold text-[11px] ${daysLeft<30?'text-rose-400':'text-slate-300'}`}>{daysLeft > 0 ? `${daysLeft}d` : 'Matured'}</span></div>
                    </div>
                    <div className="text-[10px] text-slate-600 mt-2">Maturity: {f.maturity_date}</div>
                  </div>
                )
              })}
            </div>
          )}
        </Section>

        <Section title="Recurring Deposits" count={fRD.length}>
          {fRD.length === 0 ? <EmptyState msg="No RDs added yet." /> : (
            <div className="space-y-2">
              {fRD.map((r: any, i: number) => {
                const pct = Math.round((r.months_paid ?? 0) / r.tenure_months * 100)
                return (
                  <div key={i} className="bg-[#1E2D40] border border-white/7 rounded-lg p-3">
                    <div className="flex justify-between items-start mb-1">
                      <div className="text-[13px] font-bold text-white">{r.name}</div>
                      <span className="text-[11px] text-[#F4A535] font-bold">{r.interest_rate}%</span>
                    </div>
                    <div className="text-[11px] text-slate-500 mb-3">{r.bank_name} · {r.currency==='AED'?'AED ':'₹'}{Number(r.monthly_amount).toLocaleString()}/mo</div>
                    <div className="flex justify-between text-[10px] text-slate-500 mb-1">
                      <span>{r.months_paid ?? 0}/{r.tenure_months} months</span>
                      <span className="text-[#00C9A7] font-semibold">{pct}%</span>
                    </div>
                    <div className="h-1.5 bg-white/8 rounded-full overflow-hidden">
                      <div className="h-full bg-[#00C9A7] rounded-full transition-all" style={{ width: `${pct}%` }} />
                    </div>
                    <div className="text-[10px] text-slate-600 mt-2">Matures: {r.maturity_date}</div>
                  </div>
                )
              })}
            </div>
          )}
        </Section>
      </div>

      {showAdd && <AddInvestmentModal onClose={() => setShowAdd(false)} />}
    </div>
  )
}

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="text-[12px] font-bold text-slate-300">{title}</div>
        <span className="bg-white/8 text-slate-400 text-[10px] px-2 py-0.5 rounded-full">{count}</span>
      </div>
      {children}
    </div>
  )
}

function EmptyState({ msg }: { msg: string }) {
  return <div className="bg-[#162032] border border-white/7 border-dashed rounded-xl py-10 text-center text-[13px] text-slate-600">{msg}</div>
}
