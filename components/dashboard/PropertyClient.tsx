'use client'
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight, CalendarClock, Clock, TrendingUp, Home, Info, X, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { fmtMoney, fmtCompact } from '@/lib/format'
import { propertyModel, propertyIdeas } from '@/lib/property'
import { smoothPath, smoothBack, niceStep } from '@/lib/homeTrends'
import { toast } from '@/components/ui/toaster'
import AssetSheet from '@/components/forms/AssetSheet'

const fmtMonth = (d: string) => new Date(`${d.slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' })
const fmtDate = (d: string) => new Date(`${d.slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
const card = 'wl-card p-4 md:px-5 md:py-[18px] flex flex-col gap-3 min-w-0'
const H2 = ({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) => (
  <div className="flex items-baseline justify-between gap-2 flex-wrap"><h2 className="text-[15px] font-semibold" style={{ color: 'var(--text)' }}>{children}</h2>{right}</div>
)

// One home and the money behind it (lib/property): what it cost and how it's
// paid for, what's yours today, its share over time, the builder's payments,
// and the loan's records added up. The loan's records stay on the loan.
export default function PropertyClient({ asset, loan, txns, plan, loans, today }: { asset: any; loan: any | null; txns: any[]; plan: any[]; loans: any[]; today: string }) {
  const router = useRouter()
  const m = useMemo(() => propertyModel({ asset, loan, txns, plan, today }), [asset, loan, txns, plan, today])
  const cur = m.currency, money = (n: number) => fmtMoney(n, cur), short = (n: number) => fmtCompact(n, cur)
  const ideas = useMemo(() => propertyIdeas(m, today, money), [m, today]) // eslint-disable-line react-hooks/exhaustive-deps
  const [sheet, setSheet] = useState(false)
  const [paying, setPaying] = useState(false)
  const L = m.loan
  const building = asset.status === 'construction'
  const pct = (n: number) => (m.cost.total > 0 ? Math.round(n / m.cost.total * 100) : 0)
  // How the total cost is paid for: your money, the loan repaid, the loan still owed, still to pay
  const parts = [
    { label: 'Your own money', sub: 'Down payment, charges, payments you made', value: m.ownPaid, color: '#16A34A' },
    ...(L ? [{ label: 'Loan, already repaid', sub: 'Principal in your EMIs and prepayments', value: L.repaid, color: '#0F766E' }, { label: 'Loan, still owed', sub: `Of ${short(L.drawn)} released so far`, value: L.owed, color: '#F87171' }] : []),
    { label: 'Still to pay', sub: m.schedule.length ? `${m.schedule.filter(s => s.left > 0.5).length} payment${m.schedule.filter(s => s.left > 0.5).length === 1 ? '' : 's'} left, below` : 'Not yet paid to the seller', value: m.stillToPay, color: 'stripe' },
  ].filter(x => x.value > 0.5)
  const barTotal = parts.reduce((s, x) => s + x.value, 0) || 1

  return (
    <div className="flex flex-col gap-3.5 md:gap-[18px] animate-fade-up">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0 flex flex-col gap-1">
          <Link href="/dashboard/assets" className="text-[12.5px] inline-flex items-center gap-0.5" style={{ color: 'var(--text3)' }}><ChevronLeft size={14} />Property &amp; assets</Link>
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-[22px] md:text-[26px] font-bold tracking-[-0.02em]" style={{ color: 'var(--text)' }}>{asset.name}</h1>
            {building && <span className="text-[12px] font-semibold px-2.5 py-[3px] rounded-full" style={{ background: '#FFF4DE', color: '#7A5300' }}>Under construction{asset.possession_date ? ` · possession ${fmtMonth(asset.possession_date)}` : ''}</span>}
          </div>
          <div className="text-[13px]" style={{ color: 'var(--text3)' }}>{[asset.country, asset.purchase_date && `bought ${fmtMonth(asset.purchase_date)}`, L && `with the ${L.name}`].filter(Boolean).join(' · ')}</div>
        </div>
        <div className="flex gap-2 wl-hide-viewing">
          <button onClick={() => setPaying(true)} className="wl-btn" style={{ height: 40 }}>Record a payment</button>
          <button onClick={() => setSheet(true)} className="wl-btn wl-btn-primary" style={{ height: 40 }}>Edit property</button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 md:gap-3">
        <div className="wl-card px-4 py-3.5"><div className="text-[12px]" style={{ color: 'var(--text3)' }}>Worth today</div><div className="text-[20px] md:text-[25px] font-bold tabular-nums" style={{ color: 'var(--text)' }}>{short(m.value)}</div><div className="text-[11.5px]" style={{ color: 'var(--text3)' }}>Your estimate{m.valueAsOf ? `, ${fmtMonth(m.valueAsOf)}` : ''}{m.growth ? ` · ${m.growth > 0 ? '+' : ''}${m.growth}% a year` : ''}</div></div>
        <div className="rounded-[14px] px-4 py-3.5 text-white" style={{ background: '#14172B' }}><div className="text-[12px]" style={{ color: '#C9CBE0' }}>Yours today</div><div className="text-[20px] md:text-[25px] font-extrabold tabular-nums">{short(m.yours)} <span className="text-[14px] font-semibold" style={{ color: '#8EF0BF' }}>{m.yoursPct}%</span></div><div className="text-[11.5px]" style={{ color: '#C9CBE0' }}>{L ? 'Worth today − what the loan still owes' : 'No loan on it'}</div></div>
        <div className="wl-card px-4 py-3.5"><div className="text-[12px]" style={{ color: 'var(--text3)' }}>Loan still owed</div><div className="text-[20px] md:text-[25px] font-bold tabular-nums" style={{ color: L ? '#B4231A' : 'var(--text4)' }}>{L ? short(L.owed) : '—'}</div><div className="text-[11.5px]" style={{ color: 'var(--text3)' }}>{L ? `${L.rate}%${L.payoff ? ` · ends ${fmtMonth(L.payoff.date)}` : ''}` : 'Link the loan in Edit property'}</div></div>
        <div className="rounded-[14px] px-4 py-3.5" style={{ background: m.stillToPay > 0 ? '#FFF9EC' : 'var(--card)', border: `1px solid ${m.stillToPay > 0 ? '#F2DFB3' : 'var(--line)'}` }}><div className="text-[12px]" style={{ color: m.stillToPay > 0 ? '#7A5300' : 'var(--text3)' }}>Still to pay{building ? ' the builder' : ''}</div><div className="text-[20px] md:text-[25px] font-bold tabular-nums" style={{ color: 'var(--text)' }}>{short(m.stillToPay)}</div><div className="text-[11.5px]" style={{ color: m.stillToPay > 0 ? '#6B5418' : 'var(--text3)' }}>{m.stillToPay > 0.5 ? [m.stillLoan > 0.5 && `${short(m.stillLoan)} from the loan`, m.stillYou > 0.5 && `${short(m.stillYou)} from you`].filter(Boolean).join(' · ') : 'All paid'}</div></div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] gap-3.5 md:gap-4 items-stretch">
        <section className={card}>
          <H2 right={m.cost.total > 0 && (m.cost.stamp || m.cost.other) ? <span className="text-[12px]" style={{ color: 'var(--text3)' }}>Price {short(m.cost.price)}{m.cost.stamp ? ` + stamp duty & registration ${short(m.cost.stamp)}` : ''}{m.cost.other ? ` + other ${short(m.cost.other)}` : ''}</span> : undefined}>
            How the {m.cost.total > 0 ? short(m.cost.total) : 'cost'} is paid for
          </H2>
          {m.cost.total <= 0 ? <p className="text-[12.5px]" style={{ color: 'var(--text3)' }}>Add what it cost in <button onClick={() => setSheet(true)} className="font-semibold underline" style={{ color: 'var(--accent)' }}>Edit property</button> to see how it’s paid for.</p> : (<>
            <div role="img" aria-label={parts.map(x => `${x.label} ${short(x.value)}`).join(', ')} className="flex gap-[2px] h-[26px]">
              {parts.map((x, i) => (
                <div key={x.label} className="flex items-center text-white text-[12px] font-bold pl-2 overflow-hidden" style={{ flex: `${x.value / barTotal} 1 0`, background: x.color === 'stripe' ? 'repeating-linear-gradient(135deg,#F6C66B 0 6px,#FBE3B0 6px 12px)' : x.color, borderRadius: `${i === 0 ? 7 : 0}px ${i === parts.length - 1 ? 7 : 0}px ${i === parts.length - 1 ? 7 : 0}px ${i === 0 ? 7 : 0}px` }}>
                  {x.color !== 'stripe' && x.value / barTotal > 0.08 ? `${pct(x.value)}%` : ''}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
              {parts.map(x => (
                <div key={x.label} className="flex gap-2.5 items-start min-w-0">
                  <span className="w-3 h-3 rounded-[3px] mt-[3px] flex-shrink-0" style={{ background: x.color === 'stripe' ? 'repeating-linear-gradient(135deg,#F6C66B 0 3px,#FBE3B0 3px 6px)' : x.color }} />
                  <div className="min-w-0"><div className="text-[12.5px]" style={{ color: 'var(--text2)' }}>{x.label}</div><div className="text-[16px] font-bold tabular-nums" style={{ color: 'var(--text)' }}>{short(x.value)}</div><div className="text-[11.5px] leading-snug" style={{ color: 'var(--text3)' }}>{x.sub}</div></div>
                </div>
              ))}
            </div>
          </>)}
          {L && m.value > 0 && (
            <div className="pt-3 flex flex-col gap-2" style={{ borderTop: '1px solid var(--track)' }}>
              <div className="flex justify-between text-[12.5px]" style={{ color: 'var(--text2)' }}><span>Who owns the {short(m.value)} it’s worth today</span><span><b>{m.yoursPct}%</b> you · {100 - m.yoursPct}% the bank</span></div>
              <div className="flex gap-[2px] h-3" role="img" aria-label={`You ${m.yoursPct} percent, the bank ${100 - m.yoursPct} percent`}>
                <div style={{ flex: `${Math.max(0, m.yours)} 1 0`, background: 'linear-gradient(90deg,#16A34A,#0F766E)', borderRadius: '6px 0 0 6px' }} />
                <div style={{ flex: `${L.owed} 1 0`, background: '#FCA5A5', borderRadius: '0 6px 6px 0' }} />
              </div>
            </div>
          )}
        </section>

        <section className={card}>
          <H2>{m.atEnd ? `When the loan is paid off · ${fmtMonth(m.atEnd.date)}` : 'Ahead'}</H2>
          <div className="rounded-[14px] px-4 py-3.5" style={{ background: '#F4F2FF' }}>
            <div className="text-[12.5px]" style={{ color: '#4B3BC4' }}>{m.atEnd ? 'It should be worth about' : 'In 10 years it could be worth'}</div>
            <div className="text-[26px] font-extrabold tabular-nums tracking-[-0.02em]" style={{ color: 'var(--text)' }}>{short(m.atEnd ? m.atEnd.value : m.value * Math.pow(1 + m.growth / 100, 10))}</div>
            <div className="text-[12px]" style={{ color: 'var(--text3)' }}>{m.growth ? `At your ${m.growth}% a year` : 'Add a yearly change to see it grow'}{m.atEnd ? ' · fully yours' : ''}</div>
          </div>
          {m.atEnd && m.cost.total > 0 && (
            <div className="flex flex-col text-[13px]">
              <div className="flex justify-between items-center min-h-[32px]"><span style={{ color: 'var(--text2)' }}>Price and charges</span><b className="tabular-nums">{short(m.cost.total)}</b></div>
              <div className="flex justify-between items-center min-h-[32px]"><span style={{ color: 'var(--text2)' }}>+ Interest on the loan</span><b className="tabular-nums" style={{ color: '#B4231A' }}>{short(m.atEnd.interest)}</b></div>
              <div className="flex justify-between items-center min-h-[36px]" style={{ borderTop: '1px solid var(--track)' }}><span className="font-semibold">What it will have cost you</span><b className="text-[15px] tabular-nums">{short(m.cost.total + m.atEnd.interest)}</b></div>
              {(() => { const g = m.atEnd!.value - m.cost.total - m.atEnd!.interest; return <div className="flex justify-between items-center min-h-[36px]" style={{ borderTop: '1px solid var(--track)' }}><span className="font-semibold" style={{ color: g >= 0 ? '#15803D' : '#B4231A' }}>{g >= 0 ? 'Worth more than it cost' : 'Worth less than it cost'}</span><b className="text-[15px] tabular-nums" style={{ color: g >= 0 ? '#15803D' : '#B4231A' }}>{g >= 0 ? '+' : '−'}{short(Math.abs(g))}</b></div> })()}
            </div>
          )}
          <p className="text-[11.5px] leading-snug" style={{ color: 'var(--text3)' }}>{m.atEnd ? 'With the EMIs as now; any release still to come isn’t in it yet.' : 'Your own estimate, grown at the yearly change you set.'}</p>
        </section>
      </div>

      {m.years.length > 1 && <ShareChart years={m.years} short={short} payoff={m.atEnd?.date ?? null} today={today} />}

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] gap-3.5 md:gap-4 items-start">
        <section className={card}>
          <H2 right={m.schedule.length > 0 && <span className="text-[12.5px]" style={{ color: 'var(--text3)' }}><b style={{ color: 'var(--text)' }}>{short(m.schedule.reduce((s, x) => s + x.paidLoan + x.paidOwn, 0))}</b> paid of {short(m.schedule.reduce((s, x) => s + x.amount, 0))}</span>}>Payments to the {building ? 'builder' : 'seller'}</H2>
          {m.schedule.length === 0 ? <p className="text-[12.5px] leading-snug" style={{ color: 'var(--text3)' }}>No payment steps yet. Add them in <button onClick={() => setSheet(true)} className="font-semibold underline" style={{ color: 'var(--accent)' }}>Edit property</button> (booking, agreement, each slab, possession), and each one is ticked off as the loan releases money or you pay.</p> : (<>
            {(() => { const all = m.schedule.reduce((s, x) => s + x.amount, 0), paid = m.schedule.reduce((s, x) => s + x.paidLoan + x.paidOwn, 0); return <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--track)' }}><div className="h-full rounded-full" style={{ width: `${all ? paid / all * 100 : 0}%`, background: '#16A34A' }} /></div> })()}
            <div className="overflow-x-auto -mx-1">
              <table className="w-full text-[13px] min-w-[540px]">
                <thead><tr className="text-left text-[11px] uppercase tracking-[.05em]" style={{ color: 'var(--text3)' }}><th className="px-1.5 py-2 font-semibold">Step</th><th className="px-1.5 py-2 font-semibold">When</th><th className="px-1.5 py-2 font-semibold">Paid by</th><th className="px-1.5 py-2 font-semibold text-right">Amount</th><th className="px-1.5 py-2 font-semibold text-right">Status</th></tr></thead>
                <tbody>{m.schedule.map(s => {
                  const due = s.left > 0.5, soon = due && s.due ? Math.round((Date.parse(s.due) - Date.parse(today)) / 864e5) : null
                  const chip = (t: string, you: boolean) => <span key={t} className="text-[11.5px] font-semibold px-2 py-[2px] rounded-full mr-1 whitespace-nowrap" style={you ? { background: '#E7F6EE', color: '#15803D' } : { background: '#E6F4F2', color: '#0F766E' }}>{t}</span>
                  const who = due
                    ? [s.paidOwn > 0.5 && chip(`You ${short(s.paidOwn)}`, true), s.paidLoan > 0.5 && chip(`Loan ${short(s.paidLoan)}`, false), s.fromLoan > 0.5 && chip(`Loan${s.fromLoan < s.left - 0.5 ? ` ${short(s.fromLoan)}` : ''} · to be released`, false), s.fromYou > 0.5 && chip(`You${s.fromYou < s.left - 0.5 ? ` ${short(s.fromYou)}` : ''}`, true)]
                    : [s.paidOwn > 0.5 && chip(s.paidLoan > 0.5 ? `You ${short(s.paidOwn)}` : 'You', true), s.paidLoan > 0.5 && chip(s.paidOwn > 0.5 ? `Loan ${short(s.paidLoan)}` : 'Loan', false)]
                  return (
                    <tr key={s.id} style={{ borderTop: '1px solid var(--track)', background: due ? '#FFFCF3' : undefined }}>
                      <td className="px-1.5 py-2.5" style={{ fontWeight: due ? 600 : 500 }}>{s.label}</td>
                      <td className="px-1.5 py-2.5" style={{ color: due ? 'var(--text)' : 'var(--text3)', fontWeight: due ? 600 : 400 }}>{s.due ? (due ? fmtDate(s.due) : fmtMonth(s.due)) : '—'}</td>
                      <td className="px-1.5 py-2.5">{who}</td>
                      <td className="px-1.5 py-2.5 text-right font-semibold tabular-nums">{short(s.amount)}</td>
                      <td className="px-1.5 py-2.5 text-right font-semibold whitespace-nowrap" style={{ color: due ? '#7A5300' : '#15803D' }}>{!due ? 'Paid' : s.status === 'part' ? `${short(s.left)} left` : soon != null && soon >= 0 && soon <= 90 ? `In ${soon} day${soon === 1 ? '' : 's'}` : soon != null && soon < 0 ? 'Overdue' : 'Upcoming'}</td>
                    </tr>
                  )
                })}</tbody>
              </table>
            </div>
          </>)}
          <p className="text-[11.5px]" style={{ color: 'var(--text3)' }}>{L ? 'Each amount the bank releases and each payment you record on the loan ticks off the next step here, so you enter it once.' : 'Payments you record here tick off the next step.'}</p>
        </section>

        <section className={card}>
          <H2>What to do next</H2>
          {ideas.length === 0 ? <p className="text-[12.5px]" style={{ color: 'var(--text3)' }}>Nothing needs you right now.</p> : ideas.map((x, i) => {
            const st = { due: { bg: '#FFF9EC', c: '#B45309', I: CalendarClock }, plan: { bg: '#F4F2FF', c: '#4B3BC4', I: Clock }, save: { bg: '#EAF7EF', c: '#15803D', I: TrendingUp }, info: { bg: 'var(--bg2)', c: 'var(--text3)', I: Home } }[x.tone]
            const body = (<><span className="w-[34px] h-[34px] rounded-[10px] bg-white flex items-center justify-center flex-shrink-0" style={{ color: st.c }}><st.I size={17} /></span>
              <span className="min-w-0"><span className="block text-[13.5px] font-semibold" style={{ color: 'var(--text)' }}>{x.title}</span><span className="block text-[12px] leading-snug" style={{ color: 'var(--text3)' }}>{x.detail}</span></span></>)
            return x.href ? <Link key={i} href={x.href} className="flex gap-3 items-start rounded-xl p-3" style={{ background: st.bg }}>{body}</Link>
              : x.tone === 'info' ? <button key={i} onClick={() => setSheet(true)} className="flex gap-3 items-start rounded-xl p-3 text-left" style={{ background: st.bg }}>{body}</button>
              : <div key={i} className="flex gap-3 items-start rounded-xl p-3" style={{ background: st.bg }}>{body}</div>
          })}
        </section>
      </div>

      {L && <LoanBehind m={m} short={short} />}

      {sheet && <AssetSheet asset={asset} loans={loans} txns={txns} plan={plan} onClose={() => setSheet(false)} onSaved={() => { setSheet(false); router.refresh() }} />}
      {paying && <RecordPayment asset={asset} loan={loan} currency={cur} today={today} onClose={() => setPaying(false)} onSaved={() => { setPaying(false); router.refresh() }} />}
    </div>
  )
}

// Your share over time: what it's worth, split into yours and the bank's; ahead is lighter
function ShareChart({ years, short, payoff, today }: { years: { year: number; at: string; worth: number; owed: number; past: boolean }[]; short: (n: number) => string; payoff: string | null; today: string }) {
  const n = years.length, H = 250, BASE = 240
  const X = (i: number) => (n === 1 ? 500 : i / (n - 1) * 1000)
  const mx = Math.max(1, ...years.map(y => y.worth)), step = niceStep(mx / 4), top = Math.ceil(mx / step) * step
  const Y = (v: number) => BASE - Math.max(0, v) / top * 228
  const W = years.map((y, i) => ({ x: X(i), y: Y(y.worth) })), E = years.map((y, i) => ({ x: X(i), y: Y(Math.max(0, y.worth - y.owed)) }))
  const nowIdx = Math.max(0, years.findIndex(y => y.at === today))
  const nowX = X(nowIdx), ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, k) => k * step)
  const nowShare = years[nowIdx] && years[nowIdx].worth > 0 ? Math.round((years[nowIdx].worth - years[nowIdx].owed) / years[nowIdx].worth * 100) : 100
  const q = years.findIndex((y, i) => i > nowIdx && y.worth > 0 && (y.worth - y.owed) / y.worth >= 0.75)
  const labels = years.filter((_, i) => n <= 8 || i % Math.ceil(n / 6) === 0 || i === n - 1)
  return (
    <section className={card}>
      <div className="flex flex-wrap justify-between items-start gap-2.5">
        <div><h2 className="text-[15px] font-semibold" style={{ color: 'var(--text)' }}>Your share over time</h2><p className="text-[12px] mt-0.5" style={{ color: 'var(--text3)' }}>What it’s worth, split into yours and the bank’s · {years[0].year} – {years[n - 1].year}</p></div>
        <div className="flex gap-3.5 flex-wrap text-[12px]" style={{ color: 'var(--text2)' }}>
          <span className="inline-flex items-center gap-1.5"><i className="w-3 h-2.5 rounded-[3px]" style={{ background: '#22C55E', opacity: 0.7 }} />Yours</span>
          <span className="inline-flex items-center gap-1.5"><i className="w-3 h-2.5 rounded-[3px]" style={{ background: '#F87171', opacity: 0.7 }} />Loan still owed</span>
          <span className="inline-flex items-center gap-1.5"><i className="w-4 h-[3px] rounded-sm" style={{ background: '#14172B' }} />What it’s worth</span>
        </div>
      </div>
      <div className="relative ml-[52px]" style={{ height: H }}>
        {ticks.map(t => (<div key={t}><div className="absolute left-0 right-0" style={{ top: Y(t), borderTop: `1px ${t ? 'dashed #E9EBF1' : 'solid #B9BDCB'}` }} /><div className="absolute w-[46px] text-right text-[10.5px] -translate-y-1/2" style={{ left: -54, top: Y(t), color: '#8A8FA3' }}>{t ? short(t) : '0'}</div></div>))}
        <svg viewBox={`0 0 1000 ${H}`} preserveAspectRatio="none" className="absolute inset-0 w-full" style={{ height: H }} role="img" aria-label={`Worth ${short(years[0].worth)} in ${years[0].year} to ${short(years[n - 1].worth)} in ${years[n - 1].year}; yours ${nowShare}% today`}>
          <defs>
            <linearGradient id="pYours" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#22C55E" stopOpacity={0.55} /><stop offset="100%" stopColor="#16A34A" stopOpacity={0.18} /></linearGradient>
            <linearGradient id="pOwed" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#FCA5A5" stopOpacity={0.75} /><stop offset="100%" stopColor="#F87171" stopOpacity={0.45} /></linearGradient>
          </defs>
          <path d={`${smoothPath(E)} L1000 ${BASE} L0 ${BASE} Z`} fill="url(#pYours)" />
          <path d={`${smoothPath(W)} ${smoothBack(E)} Z`} fill="url(#pOwed)" />
          <path d={smoothPath(W.slice(0, nowIdx + 1))} fill="none" stroke="#14172B" strokeWidth={3} vectorEffect="non-scaling-stroke" />
          {nowIdx < n - 1 && <path d={smoothPath(W.slice(nowIdx))} fill="none" stroke="#14172B" strokeWidth={2.5} strokeDasharray="7 6" vectorEffect="non-scaling-stroke" />}
          {nowIdx < n - 1 && <rect x={nowX} y={0} width={1000 - nowX} height={BASE} fill="#fff" fillOpacity={0.32} />}
        </svg>
        <div className="absolute top-0 pointer-events-none" style={{ left: `${nowX / 10}%`, bottom: 10, borderLeft: '1.5px solid #14172B' }} />
        <span className="absolute top-0.5 -translate-x-1/2 text-[11px] font-bold px-2 py-[3px] rounded-md text-white whitespace-nowrap" style={{ left: `${Math.min(88, Math.max(8, nowX / 10))}%`, background: '#14172B' }}>Today · {nowShare}% yours</span>
        {q > 0 && <span className="absolute -translate-x-1/2 -translate-y-1/2 text-[11.5px] font-bold px-2.5 py-[3px] rounded-full bg-white whitespace-nowrap" style={{ left: `${X(q) / 10}%`, top: (Y(years[q].worth) + BASE) / 2, color: '#15803D', border: '1px solid #BFE8D1' }}>75% yours by {years[q].year}</span>}
        {payoff && <span className="absolute right-0 top-[18px] text-[11.5px] font-bold px-2.5 py-[3px] rounded-full bg-white whitespace-nowrap" style={{ color: 'var(--text)', border: '1px solid #D9DCE6' }}>{fmtMonth(payoff)} · loan ends · {short(years[n - 1].worth)}, all yours</span>}
      </div>
      <div className="flex justify-between ml-[52px] text-[11px]" style={{ color: 'var(--text3)' }}>{labels.map(y => <span key={y.year}>{y.year}</span>)}</div>
      {nowIdx < n - 1 && <p className="text-[11.5px]" style={{ color: 'var(--text3)' }}>Ahead (lighter): your yearly change and the EMIs as planned.</p>}
    </section>
  )
}

// The loan's records, added up (its full list, month by month, is on the loan)
function LoanBehind({ m, short }: { m: ReturnType<typeof propertyModel>; short: (n: number) => string }) {
  const L = m.loan!, sanc = Math.max(L.sanctioned, 1)
  const mx = Math.max(1, ...m.byYear.map(y => Math.max(y.borrowed, y.repaid)))
  return (
    <section className="wl-card p-4 md:px-5 md:py-[18px] flex flex-col gap-4">
      <div className="flex justify-between items-start gap-2.5 flex-wrap">
        <div><h2 className="text-[15px] font-semibold" style={{ color: 'var(--text)' }}>The loan behind it · {L.name}</h2><p className="text-[12px] mt-0.5" style={{ color: 'var(--text3)' }}>{short(L.sanctioned)} sanctioned · {L.rate}% · EMI {short(L.emi)}{L.payoff ? ` · ends ${fmtMonth(L.payoff.date)}` : ''}</p></div>
        <Link href={`/dashboard/loans/detail/${L.id}`} className="wl-btn" style={{ height: 38 }}>Open the loan<ChevronRight size={14} /></Link>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        <div className="rounded-xl px-3.5 py-3" style={{ background: 'var(--bg2)' }}><div className="text-[12px]" style={{ color: 'var(--text3)' }}>Borrowed so far</div><div className="text-[19px] font-extrabold tabular-nums">{short(L.drawn)}</div><div className="text-[11.5px]" style={{ color: 'var(--text3)' }}>{L.ledger.filter(x => x.kind === 'disbursement').length || 'No'} release{L.ledger.filter(x => x.kind === 'disbursement').length === 1 ? '' : 's'} recorded{L.toRelease > 0.5 ? ` · ${short(L.toRelease)} to come` : ''}</div></div>
        <div className="rounded-xl px-3.5 py-3" style={{ background: '#EAF7EF' }}><div className="text-[12px]" style={{ color: '#1E6B44' }}>Paid back</div><div className="text-[19px] font-extrabold tabular-nums" style={{ color: '#15803D' }}>{short(L.repaid)}</div><div className="text-[11.5px]" style={{ color: '#3F6B55' }}>{L.drawn > 0 ? `${Math.round(L.repaid / L.drawn * 100)}% of what you borrowed` : '—'}</div></div>
        <div className="rounded-xl px-3.5 py-3" style={{ background: '#FDECEA' }}><div className="text-[12px]" style={{ color: '#8A1C14' }}>Still owed</div><div className="text-[19px] font-extrabold tabular-nums" style={{ color: '#B4231A' }}>{short(L.owed)}</div><div className="text-[11.5px]" style={{ color: '#8A3A33' }}>{short(L.drawn)} − {short(L.repaid)}</div></div>
        <div className="rounded-xl px-3.5 py-3" style={{ background: '#FFF4E6' }}><div className="text-[12px]" style={{ color: '#8A4F06' }}>Interest paid so far</div><div className="text-[19px] font-extrabold tabular-nums">{short(L.interestPaid)}</div><div className="text-[11.5px]" style={{ color: '#8A6A3A' }}>{L.payoff ? `about ${short(L.payoff.interest)} more to come` : `${L.emis} EMI${L.emis === 1 ? '' : 's'} recorded`}</div></div>
      </div>
      <div className="flex flex-col gap-1.5">
        <div role="img" aria-label={`Of ${short(L.sanctioned)} sanctioned: ${short(L.repaid)} paid back, ${short(L.owed)} still owed, ${short(L.toRelease)} not released yet`} className="flex gap-[2px] h-[22px]">
          {L.repaid > 0.5 && <div className="flex items-center pl-2 text-white text-[11.5px] font-bold overflow-hidden" style={{ flex: `${L.repaid / sanc} 1 0`, background: '#16A34A', borderRadius: '6px 0 0 6px' }}>{L.repaid / sanc > 0.12 ? 'Paid back' : ''}</div>}
          {L.owed > 0.5 && <div className="flex items-center pl-2.5 text-white text-[11.5px] font-bold overflow-hidden" style={{ flex: `${L.owed / sanc} 1 0`, background: '#F87171', borderRadius: L.repaid > 0.5 ? 0 : '6px 0 0 6px' }}>{L.owed / sanc > 0.12 ? 'Still owed' : ''}</div>}
          {L.toRelease > 0.5 && <div style={{ flex: `${L.toRelease / sanc} 1 0`, background: 'repeating-linear-gradient(135deg,#F6C66B 0 6px,#FBE3B0 6px 12px)', borderRadius: '0 6px 6px 0' }} />}
        </div>
        <div className="flex justify-between text-[11.5px]" style={{ color: 'var(--text3)' }}><span>Of {short(L.sanctioned)} sanctioned</span>{L.toRelease > 0.5 && <span>{short(L.toRelease)} not released yet</span>}</div>
      </div>
      {m.byYear.length > 0 && (
        <div className="flex flex-col gap-2.5">
          <div className="flex justify-between items-baseline gap-2.5 flex-wrap">
            <h3 className="text-[13.5px] font-semibold" style={{ color: 'var(--text)' }}>Borrowed and paid back, each year</h3>
            <div className="flex gap-3.5 text-[12px]" style={{ color: 'var(--text2)' }}><span className="inline-flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-[3px]" style={{ background: '#0F766E' }} />Borrowed</span><span className="inline-flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-[3px]" style={{ background: '#16A34A' }} />Paid back (principal)</span></div>
          </div>
          <div className="grid gap-3 md:gap-4 items-end px-1" style={{ gridTemplateColumns: `repeat(${m.byYear.length}, minmax(0, 1fr))`, height: 160, borderBottom: '1px solid #D9DCE6' }} role="img" aria-label={m.byYear.map(y => `${y.year}: borrowed ${short(y.borrowed)}, paid back ${short(y.repaid)}`).join('; ')}>
            {m.byYear.map(y => (
              <div key={y.year} className="flex justify-center items-end gap-1.5 h-full">
                {[[y.borrowed, '#0F766E', '#0F5E57'], [y.repaid, '#16A34A', '#15803D']].map(([v, c, ink], k) => (
                  <div key={k} className="flex flex-col items-center gap-[3px] min-w-0">
                    {Number(v) > 0 && <span className="text-[10.5px] font-semibold whitespace-nowrap" style={{ color: String(ink) }}>{short(Number(v))}</span>}
                    <div className="w-[26px] md:w-[34px] rounded-t-[5px]" style={{ height: Math.max(Number(v) > 0 ? 3 : 0, Number(v) / mx * 118), background: String(c) }} />
                  </div>
                ))}
              </div>
            ))}
          </div>
          <div className="grid gap-3 md:gap-4 px-1 text-center" style={{ gridTemplateColumns: `repeat(${m.byYear.length}, minmax(0, 1fr))` }}>
            {m.byYear.map((y, i) => (
              <div key={y.year}><div className="text-[12.5px] font-semibold" style={{ color: 'var(--text)' }}>{y.year}{i === m.byYear.length - 1 ? ' so far' : ''}</div>
                <div className="text-[11.5px]" style={{ color: i === m.byYear.length - 1 ? '#B4231A' : 'var(--text3)', fontWeight: i === m.byYear.length - 1 ? 600 : 400 }}>{y.prepaid > 0 ? `incl. ${short(y.prepaid)} prepaid · ` : ''}{i === m.byYear.length - 1 ? 'owed now' : 'owed at end'} {short(y.owedEnd)}</div></div>
            ))}
          </div>
        </div>
      )}
      <Link href={`/dashboard/loans/detail/${L.id}#ledger`} className="self-start inline-flex items-center gap-1.5 h-10 px-3.5 rounded-[10px] text-[13px] font-semibold" style={{ background: 'var(--accent-bg)', color: 'var(--accent2)' }}>See every release and EMI, month by month, on the loan<ChevronRight size={14} /></Link>
      <div className="flex gap-2.5 items-start rounded-xl px-3.5 py-3 text-[12.5px] leading-snug" style={{ background: '#F4F2FF', color: 'var(--text2)' }}>
        <Info size={17} className="flex-shrink-0 mt-px" style={{ color: 'var(--accent2)' }} />
        <span><b>Counted once.</b> These are the loan’s own records, added up: you add a release, EMI or prepayment on the loan, and the totals show here. A release is the loan’s share in “Payments to the builder” and money borrowed here — the same amount, never added twice. EMIs repay the loan; only their interest adds to what the home cost you.</span>
      </div>
    </section>
  )
}

// Record a payment to the builder or seller: yours, or a release by the bank.
// With a loan it's kept on the loan (an own contribution or a disbursement), so both pages agree.
function RecordPayment({ asset, loan, currency, today, onClose, onSaved }: { asset: any; loan: any | null; currency: string; today: string; onClose: () => void; onSaved: () => void }) {
  const [by, setBy] = useState<'self' | 'loan'>('self')
  const [date, setDate] = useState(today)
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  async function save() {
    const amt = Number(amount)
    if (!(amt > 0)) { toast('Enter the amount.', 'error'); return }
    setBusy(true)
    const sb = createClient()
    const { data: { user } } = await sb.auth.getUser()
    let error: any = null
    if (loan) {
      ;({ error } = await sb.from('loan_transactions').insert({ user_id: user!.id, loan_id: loan.id, kind: by === 'loan' ? 'disbursement' : 'own_contribution', txn_date: date, amount: amt, note: note.trim() || `For ${asset.name}` }))
    } else {
      const list = Array.isArray(asset.own_payments) ? asset.own_payments : []
      const id = globalThis.crypto?.randomUUID?.() ?? `p${Date.now()}`
      ;({ error } = await sb.from('other_assets').update({ own_payments: [...list, { id, date, amount: amt, note: note.trim() || null }] }).eq('id', asset.id))
      if (error && /own_payments/.test(error.message ?? '')) error = { message: 'Recording payments on a property needs migration 051 (supabase/migrations/051_property_payments.sql). Run it in Supabase, then try again.' }
    }
    setBusy(false)
    if (error) { toast(error.message, 'error'); return }
    toast('Payment recorded'); onSaved()
  }
  return (
    <div className="fixed inset-0 wl-sheet z-[60] flex items-end sm:items-center justify-center sm:p-4" style={{ background: 'rgba(15,23,42,.4)' }} onClick={onClose}>
      <div className="wl-sheet-panel w-full sm:max-w-[440px] rounded-t-2xl sm:rounded-2xl bg-white flex flex-col" role="dialog" aria-label="Record a payment" onClick={e => e.stopPropagation()} style={{ boxShadow: '0 20px 60px rgba(15,23,42,.18)' }}>
        <div className="flex items-center justify-between px-5 pt-5 pb-3" style={{ borderBottom: '1px solid var(--track)' }}>
          <div className="text-[17px] font-bold" style={{ color: 'var(--text)' }}>Record a payment</div>
          <button onClick={onClose} aria-label="Close" className="w-10 h-10 -mr-2 rounded-lg flex items-center justify-center" style={{ color: 'var(--text3)' }}><X size={18} /></button>
        </div>
        <div className="px-5 py-4 flex flex-col gap-3.5">
          {loan && (
            <div role="radiogroup" aria-label="Paid by" className="flex p-[3px] rounded-xl gap-0.5" style={{ background: 'var(--bg2)' }}>
              {([['self', 'From my money'], ['loan', 'Released by the bank']] as const).map(([v, l]) => (
                <button key={v} role="radio" aria-checked={by === v} onClick={() => setBy(v)} className="flex-1 h-10 rounded-[10px] text-[13px]" style={by === v ? { background: '#fff', fontWeight: 600, color: 'var(--text)', boxShadow: '0 1px 2px rgba(20,23,43,.08)' } : { color: 'var(--text2)' }}>{l}</button>
              ))}
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <label className="block"><span className="block text-[12px] font-semibold mb-1" style={{ color: 'var(--text2)' }}>Amount ({currency === 'AED' ? 'AED' : '₹'})</span><input inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value.replace(/[^0-9.]/g, ''))} className="wl-input w-full" style={{ height: 44 }} /></label>
            <label className="block"><span className="block text-[12px] font-semibold mb-1" style={{ color: 'var(--text2)' }}>Date</span><input type="date" value={date} onChange={e => setDate(e.target.value)} className="wl-input w-full" style={{ height: 44 }} /></label>
          </div>
          <label className="block"><span className="block text-[12px] font-semibold mb-1" style={{ color: 'var(--text2)' }}>For (optional)</span><input value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. Slab 8" className="wl-input w-full" style={{ height: 44 }} /></label>
          <p className="text-[12px] leading-snug" style={{ color: 'var(--text3)' }}>{loan ? `Kept on the ${loan.name ?? 'loan'}${by === 'loan' ? ' as a release — what you owe goes up from that day' : ' as your own contribution'}, so the loan and this page show the same.` : 'It ticks off the next step that isn’t paid yet.'}</p>
          <button onClick={save} disabled={busy} className="wl-btn wl-btn-primary justify-center disabled:opacity-60" style={{ height: 44 }}>{busy ? <Loader2 size={15} className="animate-spin" /> : 'Save payment'}</button>
        </div>
      </div>
    </div>
  )
}
