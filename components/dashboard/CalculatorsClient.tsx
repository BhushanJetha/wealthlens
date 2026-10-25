'use client'
import { useEffect, useMemo, useState } from 'react'
import { useViewStore } from '@/store/viewStore'
import { useUiStore } from '@/store/uiStore'
import { PageHeader, Bars } from '@/components/ui/kit'
import { fmtCompact } from '@/lib/format'

type Key = 'sip' | 'lump' | 'emi' | 'goal' | 'fd'
interface Slider { id: string; label: string; min: number; max: number; step: number; def: number; kind: 'money' | 'pct' | 'years' }

const CALCS: Record<Key, { name: string; blurb: string; sliders: Slider[] }> = {
  sip: { name: 'SIP', blurb: 'A fixed amount every month, compounding at an expected return.', sliders: [
    { id: 'amt', label: 'Monthly investment', min: 500, max: 200000, step: 500, def: 10000, kind: 'money' },
    { id: 'rate', label: 'Expected return a year', min: 1, max: 20, step: 0.5, def: 12, kind: 'pct' },
    { id: 'yrs', label: 'Years', min: 1, max: 40, step: 1, def: 15, kind: 'years' },
  ] },
  lump: { name: 'Lump sum', blurb: 'One amount invested today, left to grow.', sliders: [
    { id: 'amt', label: 'Amount invested', min: 10000, max: 10000000, step: 10000, def: 500000, kind: 'money' },
    { id: 'rate', label: 'Expected return a year', min: 1, max: 20, step: 0.5, def: 12, kind: 'pct' },
    { id: 'yrs', label: 'Years', min: 1, max: 40, step: 1, def: 10, kind: 'years' },
  ] },
  emi: { name: 'Loan EMI', blurb: 'Monthly instalment, and how much of it is interest.', sliders: [
    { id: 'amt', label: 'Loan amount', min: 100000, max: 20000000, step: 50000, def: 3000000, kind: 'money' },
    { id: 'rate', label: 'Interest rate a year', min: 5, max: 18, step: 0.05, def: 8.5, kind: 'pct' },
    { id: 'yrs', label: 'Tenure', min: 1, max: 30, step: 1, def: 20, kind: 'years' },
  ] },
  goal: { name: 'Goal planner', blurb: 'The monthly SIP needed to reach a target by a date.', sliders: [
    { id: 'amt', label: 'Target amount (today’s money)', min: 100000, max: 50000000, step: 100000, def: 2500000, kind: 'money' },
    { id: 'saved', label: 'Already saved', min: 0, max: 10000000, step: 50000, def: 0, kind: 'money' },
    { id: 'rate', label: 'Expected return a year', min: 1, max: 15, step: 0.5, def: 10, kind: 'pct' },
    { id: 'infl', label: 'Inflation a year', min: 0, max: 10, step: 0.5, def: 6, kind: 'pct' },
    { id: 'yrs', label: 'Years to goal', min: 1, max: 30, step: 1, def: 10, kind: 'years' },
  ] },
  fd: { name: 'Fixed deposit', blurb: 'Maturity value with quarterly compounding (how most Indian banks pay).', sliders: [
    { id: 'amt', label: 'Deposit', min: 10000, max: 10000000, step: 10000, def: 500000, kind: 'money' },
    { id: 'rate', label: 'Interest rate a year', min: 3, max: 10, step: 0.05, def: 7, kind: 'pct' },
    { id: 'yrs', label: 'Years', min: 1, max: 10, step: 1, def: 5, kind: 'years' },
  ] },
}
const ORDER: Key[] = ['sip', 'lump', 'emi', 'goal', 'fd']

// Future value of a monthly SIP paid at the start of each month
const sipFV = (m: number, ratePct: number, months: number) => {
  const r = ratePct / 1200
  return r === 0 ? m * months : m * ((Math.pow(1 + r, months) - 1) / r) * (1 + r)
}

export default function CalculatorsClient() {
  const { view } = useViewStore()
  const { openAdvisor } = useUiStore()
  const cur = view === 'uae' ? 'AED' : 'INR'
  const money = (n: number) => fmtCompact(n, cur)
  const [key, setKey] = useState<Key>('sip')
  const [vals, setVals] = useState<Record<Key, Record<string, number>>>(() =>
    Object.fromEntries(ORDER.map(k => [k, Object.fromEntries(CALCS[k].sliders.map(s => [s.id, s.def]))])) as Record<Key, Record<string, number>>)
  const [whatIf, setWhatIf] = useState('')

  // ?c=sip|lump|emi|goal|fd preselects a calculator (Learn hub shortcuts)
  useEffect(() => {
    const c = new URLSearchParams(window.location.search).get('c') as Key | null
    if (c && CALCS[c]) setKey(c)
  }, [])

  const v = vals[key]
  const set = (id: string, n: number) => setVals(p => ({ ...p, [key]: { ...p[key], [id]: n } }))

  const result = useMemo(() => {
    const years = v.yrs
    const step = Math.max(1, Math.ceil(years / 12))           // at most ~12 bars
    const marks = Array.from({ length: Math.ceil(years / step) }, (_, i) => Math.min((i + 1) * step, years))
    if (key === 'sip') {
      const invested = v.amt * years * 12, value = sipFV(v.amt, v.rate, years * 12)
      return { outs: [['Invested', money(invested)], ['Estimated value', money(value)], ['Gains', money(value - invested)]],
        bars: marks.map(y => ({ label: `Y${y}`, before: v.amt * y * 12, value: sipFV(v.amt, v.rate, y * 12), tip: `Year ${y}: invested ${money(v.amt * y * 12)}, worth ${money(sipFV(v.amt, v.rate, y * 12))}` })),
        legend: ['Invested', 'Value'], headline: `${money(value)} after ${years} years`,
        summary: `SIP of ${money(v.amt)} a month for ${years} years at ${v.rate}%: invested ${money(invested)}, estimated value ${money(value)}, gains ${money(value - invested)}.` }
    }
    if (key === 'lump') {
      const fv = (y: number) => v.amt * Math.pow(1 + v.rate / 100, y)
      return { outs: [['Invested', money(v.amt)], ['Estimated value', money(fv(years))], ['Gains', money(fv(years) - v.amt)]],
        bars: marks.map(y => ({ label: `Y${y}`, before: v.amt, value: fv(y), tip: `Year ${y}: ${money(fv(y))}` })),
        legend: ['Invested', 'Value'], headline: `${money(fv(years))} after ${years} years`,
        summary: `Lump sum of ${money(v.amt)} for ${years} years at ${v.rate}%: grows to ${money(fv(years))}.` }
    }
    if (key === 'emi') {
      const r = v.rate / 1200, n = years * 12
      const emi = r === 0 ? v.amt / n : v.amt * r * Math.pow(1 + r, n) / (Math.pow(1 + r, n) - 1)
      // Yearly split of payments into interest and principal
      let bal = v.amt
      const perYear: { i: number; p: number }[] = []
      for (let y = 0; y < years; y++) {
        let i = 0, p = 0
        for (let m = 0; m < 12; m++) { const int = bal * r; i += int; p += emi - int; bal -= emi - int }
        perYear.push({ i, p })
      }
      const totalInt = emi * n - v.amt
      return { outs: [['Monthly EMI', money(emi)], ['Total interest', money(totalInt)], ['Total paid', money(emi * n)]],
        bars: marks.map(y => ({ label: `Y${y}`, before: perYear[y - 1].i, value: perYear[y - 1].p, tip: `Year ${y}: interest ${money(perYear[y - 1].i)}, principal ${money(perYear[y - 1].p)}` })),
        legend: ['Interest', 'Principal'], headline: `${money(emi)} a month`,
        summary: `Loan of ${money(v.amt)} at ${v.rate}% for ${years} years: EMI ${money(emi)}, total interest ${money(totalInt)} (${Math.round(totalInt / v.amt * 100)}% of the loan).` }
    }
    if (key === 'goal') {
      const target = v.amt * Math.pow(1 + v.infl / 100, years)             // in future money
      const savedFV = v.saved * Math.pow(1 + v.rate / 100, years)
      const gap = Math.max(target - savedFV, 0)
      const perRupee = sipFV(1, v.rate, years * 12)
      const monthly = gap / perRupee
      return { outs: [['Monthly SIP needed', money(monthly)], ['Target in future money', money(target)], ['Your savings grow to', money(savedFV)]],
        bars: marks.map(y => ({ label: `Y${y}`, before: v.amt * Math.pow(1 + v.infl / 100, y), value: v.saved * Math.pow(1 + v.rate / 100, y) + sipFV(monthly, v.rate, y * 12), tip: `Year ${y}: on track for ${money(v.saved * Math.pow(1 + v.rate / 100, y) + sipFV(monthly, v.rate, y * 12))}` })),
        legend: ['Goal cost', 'Your pot'], headline: `${money(monthly)} a month`,
        summary: `Goal of ${money(v.amt)} today in ${years} years at ${v.infl}% inflation = ${money(target)}; with ${money(v.saved)} already saved at ${v.rate}%, I need ${money(monthly)} a month.` }
    }
    const fd = (y: number) => v.amt * Math.pow(1 + v.rate / 400, 4 * y)
    return { outs: [['Maturity value', money(fd(years))], ['Interest earned', money(fd(years) - v.amt)], ['Effective yearly rate', `${((Math.pow(1 + v.rate / 400, 4) - 1) * 100).toFixed(2)}%`]],
      bars: marks.map(y => ({ label: `Y${y}`, before: v.amt, value: fd(y), tip: `Year ${y}: ${money(fd(y))}` })),
      legend: ['Deposit', 'Value'], headline: `${money(fd(years))} at maturity`,
      summary: `FD of ${money(v.amt)} at ${v.rate}% for ${years} years, compounded quarterly: matures at ${money(fd(years))}.` }
  }, [key, v, cur])

  const fmtVal = (s: Slider, n: number) => s.kind === 'money' ? money(n) : s.kind === 'pct' ? `${n}%` : `${n} yr${n === 1 ? '' : 's'}`

  return (
    <div className="flex flex-col gap-3.5 md:gap-[18px] animate-fade-up">
      <PageHeader title="Calculators" sub="Move the sliders — results update instantly. Returns are assumptions, not promises." />

      <div className="flex gap-1.5 overflow-x-auto no-scrollbar -mx-4 px-4 md:mx-0 md:px-0">
        {ORDER.map(k => (
          <button key={k} onClick={() => setKey(k)} aria-pressed={key === k} className="wl-chip flex-shrink-0">{CALCS[k].name}</button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.2fr] gap-4 items-start">
        <section className="wl-card px-4 md:px-6 py-4 md:py-5 flex flex-col gap-4">
          <div>
            <h2 className="text-[15px] font-semibold" style={{ color: 'var(--text)' }}>{CALCS[key].name} calculator</h2>
            <p className="text-[12.5px] mt-0.5" style={{ color: 'var(--text3)' }}>{CALCS[key].blurb}</p>
          </div>
          {CALCS[key].sliders.map(s => (
            <div key={s.id}>
              <div className="flex justify-between items-baseline mb-1">
                <label htmlFor={`s-${s.id}`} className="text-[12.5px]" style={{ color: 'var(--text2)' }}>{s.label}</label>
                <span className="text-[14px] font-bold tabular-nums" style={{ color: 'var(--accent2)' }}>{fmtVal(s, v[s.id])}</span>
              </div>
              <input id={`s-${s.id}`} type="range" min={s.min} max={s.max} step={s.step} value={v[s.id]}
                onChange={e => set(s.id, Number(e.target.value))} className="w-full" style={{ accentColor: 'var(--accent)' }} />
            </div>
          ))}
        </section>

        <div className="flex flex-col gap-3.5">
          <section className="rounded-[20px] bg-hero text-white px-5 md:px-6 py-4 md:py-5" style={{ boxShadow: 'var(--shadow-hero)' }}>
            <div className="text-[11px] font-semibold uppercase tracking-[0.05em]" style={{ color: '#CFC8FA' }}>Result</div>
            <div className="text-[26px] md:text-[30px] font-bold tabular-nums tracking-[-0.02em] mt-0.5" aria-live="polite">{result.headline}</div>
            <div className="grid grid-cols-3 gap-3 mt-3 pt-3" style={{ borderTop: '1px solid rgba(255,255,255,.18)' }}>
              {result.outs.map(([l, val]) => (
                <div key={l}>
                  <div className="text-[11px]" style={{ color: '#CFC8FA' }}>{l}</div>
                  <div className="text-[14px] md:text-[16px] font-semibold tabular-nums">{val}</div>
                </div>
              ))}
            </div>
          </section>

          <section className="wl-card px-4 md:px-5 py-4">
            <div className="flex justify-between items-center gap-3">
              <h2 className="text-[13.5px] font-semibold" style={{ color: 'var(--text)' }}>Year by year</h2>
              <div className="flex gap-3 text-[11.5px]" style={{ color: 'var(--text3)' }}>
                <span><i className="inline-block w-[9px] h-[9px] rounded-sm mr-1.5" style={{ background: '#C9C2F5' }} />{result.legend[0]}</span>
                <span><i className="inline-block w-[9px] h-[9px] rounded-sm mr-1.5" style={{ background: 'var(--accent)' }} />{result.legend[1]}</span>
              </div>
            </div>
            <Bars data={result.bars} className="h-[150px] md:h-[190px] mt-3" label={`${CALCS[key].name} by year`} />
          </section>

          <section className="rounded-[18px] md:rounded-[20px] bg-ai px-4 md:px-5 py-3.5" style={{ border: '1px solid #E1DAFF' }}>
            <div className="flex gap-2 flex-wrap">
              <button onClick={() => openAdvisor(`Explain this result simply and what I should do next. ${result.summary}`)}
                className="rounded-full px-[13px] py-[7px] text-[12px] font-semibold text-white" style={{ background: 'var(--accent)' }}>✦ Explain my result</button>
            </div>
            <form className="flex gap-1.5 mt-2.5" onSubmit={e => { e.preventDefault(); if (whatIf.trim()) { openAdvisor(`${whatIf.trim()} — based on this calculation: ${result.summary}`); setWhatIf('') } }}>
              <input value={whatIf} onChange={e => setWhatIf(e.target.value)} placeholder="What if… I add 5,000 more a month?" aria-label="Ask a what-if question"
                className="flex-1 min-w-0 h-[38px] rounded-[9px] px-3 text-[13px] outline-none bg-white" style={{ border: '1px solid var(--accent-border)', color: 'var(--text)' }} />
              <button type="submit" aria-label="Ask" className="w-[38px] h-[38px] rounded-[9px] text-white flex items-center justify-center" style={{ background: 'var(--accent)' }}>↑</button>
            </form>
          </section>
        </div>
      </div>
    </div>
  )
}
