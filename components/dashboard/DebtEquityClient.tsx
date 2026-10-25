'use client'
import { useMemo } from 'react'
import { useViewStore } from '@/store/viewStore'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { Landmark, Scale, Percent, ShieldCheck, TrendingDown } from 'lucide-react'
import { computeNetWorth, viewAmount, type Holdings } from '@/lib/netWorth'
import { fmtMoney, fmtCompact } from '@/lib/format'
import { PageHeader, InsightBar, AiActions, LearnStrip, HeroStat, KpiTile, Donut, ProgressRow, EmptyState } from '@/components/ui/kit'
import { ListCard, ListRow } from '@/components/ui/list'

// Expected yearly return per asset row (for the projection only)
const EXP_RETURN: Record<string, number> = {
  mf: 11, stock: 12, etf: 11, nps: 9, gold: 7, bond: 7.5, fd: 7, rd: 6.5, ppf: 7.5, lic: 5, bank: 0,
}
const LOAN_LABEL: Record<string, string> = {
  home_loan: 'Home loan', car_loan: 'Car loan', bike_loan: 'Bike loan', gold_loan: 'Gold loan',
  personal_loan: 'Personal loan', loan_on_card: 'Loan on card', other_loan: 'Other loan',
}
const LOAN_COLOR = ['#DC2626', '#F97316', '#D97706', '#EC5B8C', '#9333EA', '#64748B']

// Debt vs equity (design v2): how much of what you hold is borrowed. Uses the
// same net-worth maths as Home and Net worth; projection and stress tests are
// worked out from your own holdings and labelled as estimates.
export default function DebtEquityClient({ holdings }: { holdings: Holdings }) {
  const { view, fxRate: FX } = useViewStore()
  const cur = view === 'uae' ? 'AED' : 'INR'
  const money = (n: number) => fmtMoney(n, cur)
  const short = (n: number) => fmtCompact(n, cur)
  const conv = (amt: number, c: string) => viewAmount(amt, c ?? 'INR', view, FX)
  const inView = (c?: string) => view === 'consolidated' || (view === 'uae' ? c === 'AED' : (c ?? 'INR') === 'INR')

  const nw = useMemo(() => computeNetWorth(holdings, view, FX), [holdings, view, FX])
  const { assetRows, totalAssets, totalLiab, netWorth } = nw
  const loans = holdings.loans.filter(l => inView(l.currency))
  const cards = holdings.accounts.filter(a => a.account_type === 'credit_card' && inView(a.currency))

  // Composition of what you hold: owned outright vs each kind of debt
  const debtParts = useMemo(() => {
    const m: Record<string, number> = {}
    loans.forEach(l => { const k = LOAN_LABEL[l.loan_type] ?? 'Loan'; m[k] = (m[k] ?? 0) + conv(Number(l.outstanding_amt) || 0, l.currency) })
    const cardBal = cards.reduce((a, c) => a + conv(Number(c.outstanding_bal) || 0, c.currency), 0)
    if (cardBal > 0) m['Credit cards'] = cardBal
    return Object.entries(m).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1])
  }, [loans, cards, view, FX])

  const debtPct = totalAssets > 0 ? Math.round(totalLiab / totalAssets * 100) : 0
  const leverage = netWorth > 0 ? totalAssets / netWorth : null
  const monthlyInterest = loans.reduce((a, l) => a + conv((Number(l.outstanding_amt) || 0) * (Number(l.interest_rate) || 0) / 1200, l.currency), 0)
  const monthlyEmi = loans.reduce((a, l) => a + conv(Number(l.emi_amount) || 0, l.currency), 0)
  const topLoan = [...loans].filter(l => Number(l.interest_rate) > 0).sort((a, b) => Number(b.interest_rate) - Number(a.interest_rate))[0]
  const zone = totalLiab === 0 ? 'Debt-free' : debtPct < 30 ? 'Healthy' : debtPct < 50 ? 'Moderate' : 'High'

  // 10-year projection: investments grow at a blended rate plus what you add
  // each month; cash stays flat; loans amortise at today's EMI and rate
  const projection = useMemo(() => {
    const invested = assetRows.filter(r => r.key !== 'bank')
    const base = invested.reduce((a, r) => a + r.value, 0)
    const blended = base > 0 ? invested.reduce((a, r) => a + r.value * (EXP_RETURN[r.key] ?? 7), 0) / base : 7
    const S = (arr: any[], fn: (x: any) => number) => arr.filter(x => inView(x.currency ?? 'INR')).reduce((a, x) => a + conv(fn(x) || 0, x.currency ?? 'INR'), 0)
    const monthlyAdd = S(holdings.mutualFunds.filter(f => f.has_sip && f.sip_amount), f => Number(f.sip_amount))
      + S(holdings.recurringDeposits, r => Number(r.monthly_amount)) + S(holdings.ppfEpf, x => Number(x.annual_contribution) / 12)
    const cash = assetRows.find(r => r.key === 'bank')?.value ?? 0
    const bals = loans.map(l => ({ b: conv(Number(l.outstanding_amt) || 0, l.currency), r: (Number(l.interest_rate) || 0) / 1200, e: conv(Number(l.emi_amount) || 0, l.currency) }))
    const cardDebt = cards.reduce((a, c) => a + conv(Number(c.outstanding_bal) || 0, c.currency), 0)
    let inv = base
    const series: { year: string; Assets: number; Debt: number }[] = []
    for (let m = 0; m <= 120; m++) {
      if (m % 12 === 0) series.push({ year: m === 0 ? 'Now' : `+${m / 12}y`, Assets: Math.round(inv + cash), Debt: Math.round(bals.reduce((a, x) => a + Math.max(x.b, 0), 0) + (m === 0 ? cardDebt : 0)) })
      inv = inv * (1 + blended / 1200) + monthlyAdd
      bals.forEach(x => { if (x.b > 0) x.b = Math.max(0, x.b * (1 + x.r) - x.e) })
    }
    return { series, blended, monthlyAdd }
  }, [assetRows, loans, cards, holdings, view, FX])
  const in10 = projection.series[projection.series.length - 1]

  // Stress tests: funds, stocks and ETFs fall; everything else held at today's value
  const market = assetRows.filter(r => r.group === 'mf' || r.group === 'equity').reduce((a, r) => a + r.value, 0)
  const stress = [
    { name: 'Mild dip', what: 'Markets −10%', drop: 0.10 },
    { name: 'Bad year', what: 'Markets −20%', drop: 0.20 },
    { name: 'Severe crash', what: 'Markets −35%', drop: 0.35 },
  ].map(s => {
    const assets = totalAssets - market * s.drop
    return { ...s, nw: assets - totalLiab, ratio: assets > 0 ? Math.round(totalLiab / assets * 100) : 0 }
  })
  const rateHit = loans.reduce((a, l) => a + conv((Number(l.outstanding_amt) || 0) * 0.01, l.currency), 0)

  const empty = totalAssets === 0 && totalLiab === 0
  const ctx = `Assets ${money(totalAssets)}, debt ${money(totalLiab)} (${debtPct}% of assets), owned outright ${money(netWorth)}, leverage ${leverage ? leverage.toFixed(2) + '×' : 'n/a'}, interest about ${money(monthlyInterest)} a month.${topLoan ? ` Costliest loan ${topLoan.name} at ${topLoan.interest_rate}%.` : ''}`

  return (
    <div className="flex flex-col gap-3.5 md:gap-[18px] animate-fade-up">
      <div className="max-md:order-1">
        <PageHeader title="Debt vs equity" sub={`How much of what you hold is borrowed · ${view === 'uae' ? 'UAE · AED' : view === 'india' ? 'India · INR' : 'Consolidated · INR'}`} />
      </div>
      {!empty && <div className="max-md:order-4"><InsightBar
        text={totalLiab === 0
          ? `No debt: all ${short(totalAssets)} of what you hold is yours.`
          : `Debt is ${debtPct}% of what you hold (${zone.toLowerCase()}). A 20% market fall would take net worth to about ${short(stress[1].nw)} and the debt ratio to ${stress[1].ratio}%.${topLoan ? ` ${topLoan.name} at ${topLoan.interest_rate}% costs the most.` : ''}`}
        prompt={`Explain my debt vs equity page in plain language. ${ctx}`} /></div>}
      {!empty && <div className="max-md:order-5"><AiActions actions={['Pay down debt or invest?', 'Best prepayment plan']} context={ctx} /></div>}

      {empty ? (
        <div className="max-md:order-2"><EmptyState message="Add investments or loans to see how much of what you hold is borrowed." /></div>
      ) : (<>
        <div className="max-md:contents grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-4">
          <HeroStat className="max-md:order-2" label="Equity · what you own outright" value={money(netWorth)}
            tone={zone === 'High' ? 'bad' : 'good'}
            delta={`${100 - debtPct}% of ${short(totalAssets)} held · ${zone}`}
            right={<span className="text-[11.5px] flex items-center gap-3" style={{ color: 'var(--text3)' }}>
              <span className="flex items-center gap-1.5"><i className="inline-block w-[9px] h-[9px] rounded-sm" style={{ background: '#6A55E8' }} />Assets</span>
              <span className="flex items-center gap-1.5"><i className="inline-block w-[9px] h-[9px] rounded-sm" style={{ background: '#94A3B8' }} />Debt</span>
            </span>}>
            <div className="text-[11.5px] mt-2" style={{ color: 'var(--text3)' }}>Next 10 years if you keep investing {short(projection.monthlyAdd)} a month and paying today&apos;s EMIs (estimate)</div>
            <div className="h-[120px] md:h-auto md:flex-1 md:min-h-[190px] mt-2 -mx-1">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={projection.series} margin={{ top: 4, right: 6, bottom: 0, left: 6 }}>
                  <XAxis dataKey="year" tick={{ fontSize: 11, fill: '#94A3B8' }} tickLine={false} axisLine={false} interval={1} padding={{ left: 14, right: 18 }} />
                  <YAxis hide domain={[0, 'dataMax']} />
                  <Tooltip contentStyle={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 10, fontSize: 12, padding: '6px 10px' }}
                    formatter={(v: any, n: any) => [money(Number(v)), n]} />
                  <Line type="monotone" dataKey="Assets" stroke="#6A55E8" strokeWidth={2.5} dot={false} isAnimationActive={false} />
                  <Line type="monotone" dataKey="Debt" stroke="#94A3B8" strokeWidth={2} strokeDasharray="5 4" dot={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </HeroStat>

          <section className="wl-card max-md:order-6 px-4 md:px-5 py-4 md:py-[18px] flex flex-col gap-3">
            <h2 className="text-[14px] font-semibold" style={{ color: 'var(--text)' }}>Composition</h2>
            <div className="hidden md:flex justify-center">
              <Donut size={128} label={`Owned ${100 - debtPct}%, debt ${debtPct}%`}
                segments={[{ value: Math.max(netWorth, 0), color: '#6A55E8' }, ...debtParts.map(([, v], i) => ({ value: v, color: LOAN_COLOR[i % LOAN_COLOR.length] }))]}>
                <div className="text-[10.5px]" style={{ color: 'var(--text3)' }}>Debt</div>
                <div className="text-[16px] font-bold" style={{ color: 'var(--text)' }}>{debtPct}%</div>
              </Donut>
            </div>
            <ProgressRow name="Owned outright" value={short(netWorth)} right={`${100 - debtPct}%`} pct={100 - debtPct} color="#6A55E8" />
            {debtParts.map(([k, v], i) => (
              <ProgressRow key={k} name={k} value={short(v)} right={`${totalAssets > 0 ? Math.round(v / totalAssets * 100) : 0}%`}
                pct={totalAssets > 0 ? v / totalAssets * 100 : 0} color={LOAN_COLOR[i % LOAN_COLOR.length]} href={k === 'Credit cards' ? '/dashboard/cards' : '/dashboard/loans'} />
            ))}
          </section>
        </div>

        <div className="max-md:order-3 grid grid-cols-2 lg:grid-cols-4 gap-2.5 md:gap-3.5">
          <KpiTile label="Debt" value={short(totalLiab)} delta={`${debtPct}% of assets`} tint={2} icon={Landmark}
            tone={debtPct < 30 ? 'good' : debtPct < 50 ? 'neutral' : 'bad'} />
          <KpiTile label="Leverage" value={leverage ? `${leverage.toFixed(2)}×` : '—'} delta="Assets ÷ equity · target under 1.5×" tint={0} icon={Scale}
            tone={leverage == null ? 'bad' : leverage < 1.5 ? 'good' : leverage < 2 ? 'neutral' : 'bad'} />
          <KpiTile label="Interest cost" value={`${short(monthlyInterest)}/mo`} delta={monthlyEmi > 0 ? `${Math.round(monthlyInterest / monthlyEmi * 100)}% of your EMIs` : 'No loans'} tint={3} icon={Percent} />
          <KpiTile label="In 10 years" value={in10 ? short(in10.Assets - in10.Debt) : '—'} delta={`net worth at ~${projection.blended.toFixed(1)}% a year (estimate)`} tint={1} icon={ShieldCheck} />
        </div>

        <ListCard className="max-md:order-7" title="Stress tests" sub="Funds, stocks and ETFs fall; everything else holds its value · estimates"
          head={['Scenario', 'What happens', 'Debt ratio', 'Net worth']}>
          <ListRow color="#16A34A" initial="✓" title="Today" tag="As it is" meta={`${debtPct}%`} amount={money(netWorth)} />
          {stress.map(s => (
            <ListRow key={s.name} color={s.drop >= 0.35 ? '#DC2626' : s.drop >= 0.2 ? '#D97706' : '#3B8EF0'} initial={<TrendingDown size={15} />}
              title={s.name} tag={s.what} meta={`${s.ratio}%`} metaColor={s.ratio >= 50 ? '#DC2626' : undefined}
              amount={money(s.nw)} amountSub={`−${short(netWorth - s.nw)}`} />
          ))}
          {rateHit > 0 && (
            <ListRow color="#7C3AED" initial="%" title="Rates up 1%" tag="Loan rates +1%" meta={`${debtPct}%`}
              amount={`−${short(rateHit)}/yr`} amountColor="#DC2626" amountSub="extra interest" />
          )}
        </ListCard>
      </>)}

      <div className="max-md:order-8"><LearnStrip title="Debt vs equity mix" href="/dashboard/learn" /></div>
    </div>
  )
}
