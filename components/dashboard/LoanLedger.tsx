'use client'
import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { fmtMoney, fmtCompact } from '@/lib/format'
import { loanLedger, type LedgerRow } from '@/lib/property'

const MN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const sum = (xs: LedgerRow[], f: (x: LedgerRow) => number) => xs.reduce((s, x) => s + f(x), 0)

// A loan's records, two ways: what you paid back (EMIs split into principal
// and interest, prepayments, what was owed after) and what you borrowed (each
// release by the bank) — year by year, or month by month a year at a time.
// The same records the property page adds up (lib/property loanLedger).
export default function LoanLedger({ loan, txns }: { loan: any; txns: any[] }) {
  const cur = loan.currency === 'AED' ? 'AED' : 'INR'
  const full = (n: number) => (n ? fmtMoney(n, cur) : '—'), short = (n: number) => (n ? fmtCompact(n, cur) : '—')
  const ledger = useMemo(() => loanLedger(loan, txns), [loan, txns])
  const years = useMemo(() => Array.from(new Set(ledger.map(x => Number(x.date.slice(0, 4))))).sort(), [ledger])
  const [tab, setTab] = useState<'paid' | 'borrowed'>('paid')
  const [mode, setMode] = useState<'year' | 'month'>('year')
  const [year, setYear] = useState<number>(years[years.length - 1] ?? new Date().getFullYear())
  if (!ledger.length) return null
  const paid = tab === 'paid', yearly = mode === 'year', fmt = yearly ? short : full
  const groups = yearly
    ? years.map(y => ({ label: String(y), name: String(y), xs: ledger.filter(x => x.date.startsWith(String(y))), none: false }))
    : MN.map((mn, i) => { const k = `${year}-${String(i + 1).padStart(2, '0')}`; const xs = ledger.filter(x => x.date.startsWith(k)); return { label: mn, name: `${mn} ${year}`, xs, none: !xs.length } })
  const scope = yearly ? ledger : ledger.filter(x => x.date.startsWith(String(year)))
  const before = ledger.filter(x => Number(x.date.slice(0, 4)) < year)
  const emis = (xs: LedgerRow[]) => xs.filter(x => x.kind === 'emi')
  const P = sum(emis(scope), x => x.principal), I = sum(scope, x => x.interest), PP = sum(scope.filter(x => x.kind === 'prepayment'), x => x.principal), E = sum(emis(scope), x => x.amount)
  const B = sum(scope.filter(x => x.kind === 'disbursement'), x => x.amount), nRel = scope.filter(x => x.kind === 'disbursement').length
  const borrowedBy = sum((yearly ? ledger : [...before, ...scope]).filter(x => x.kind === 'disbursement'), x => x.amount)
  const sanctioned = Number(loan.sanctioned_amt) || 0
  const last = scope[scope.length - 1]
  const stats = paid ? [
    { label: yearly ? 'Paid in EMIs, all years' : `Paid in EMIs, ${year}`, value: short(E), sub: `${emis(scope).length} EMI${emis(scope).length === 1 ? '' : 's'}${PP ? ` + ${short(PP)} prepaid` : ''}`, bg: 'var(--bg2)', ink: 'var(--text3)' },
    { label: 'Principal paid back', value: short(P + PP), sub: PP ? `${short(P)} in EMIs + ${short(PP)} prepaid` : 'Out of your EMIs', bg: '#EAF7EF', ink: '#1E6B44' },
    { label: 'Interest paid', value: short(I), sub: E ? `${Math.round(I / E * 100)}% of what the EMIs paid` : '—', bg: '#FFF4E6', ink: '#8A4F06' },
    { label: yearly ? 'Owed after the last entry' : `Owed at the end of ${year}`, value: last ? short(last.owedAfter) : '—', sub: last ? new Date(`${last.date}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '', bg: '#FDECEA', ink: '#8A1C14' },
  ] : [
    { label: yearly ? 'Borrowed, all years' : `Borrowed in ${year}`, value: short(B), sub: `${nRel} release${nRel === 1 ? '' : 's'} by the bank`, bg: '#E6F4F2', ink: '#0F5E57' },
    { label: `Borrowed by ${yearly ? 'now' : `the end of ${year}`}`, value: short(borrowedBy), sub: sanctioned ? `of ${short(sanctioned)} sanctioned` : '', bg: 'var(--bg2)', ink: 'var(--text3)' },
    ...(sanctioned > borrowedBy ? [{ label: 'Still to be released', value: short(sanctioned - borrowedBy), sub: yearly ? 'when the next steps are due' : `after ${year}`, bg: '#FFF9EC', ink: '#7A5300' }] : []),
  ]
  // Chart: principal and interest (a prepayment is a label, so ordinary months stay readable), or releases
  const val = (xs: LedgerRow[]) => (paid ? [sum(emis(xs), x => x.principal), sum(xs, x => x.interest)] : [sum(xs.filter(x => x.kind === 'disbursement'), x => x.amount), 0])
  const mx = Math.max(1, ...groups.map(g => { const [a, b] = val(g.xs); return a + b }))
  const pill = (on: boolean) => (on ? { background: '#fff', color: 'var(--text)', fontWeight: 600, boxShadow: '0 1px 2px rgba(20,23,43,.08)' } : { color: 'var(--text2)' })
  const th = 'px-2 py-2 text-[11px] font-semibold uppercase tracking-[.05em] whitespace-nowrap'

  return (
    <section id="ledger" className="wl-card max-md:order-6 p-4 md:px-5 md:py-[18px] flex flex-col gap-3.5 scroll-mt-20">
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div>
          <h2 className="text-[15px] font-semibold" style={{ color: 'var(--text)' }}>Borrowed and paid back</h2>
          <p className="text-[12px] mt-0.5" style={{ color: 'var(--text3)' }}>Every release, EMI and prepayment you’ve recorded on this loan</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div role="tablist" aria-label="What to show" className="flex gap-1 p-1 rounded-xl" style={{ background: 'var(--bg2)' }}>
            {([['paid', 'Paid back'], ['borrowed', 'Borrowed']] as const).map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className="h-9 px-3.5 rounded-[9px] text-[13px]" style={pill(tab === k)}>{l}</button>)}
          </div>
          <div role="group" aria-label="Year or month" className="flex p-[3px] rounded-[10px]" style={{ background: 'var(--bg2)' }}>
            {([['year', 'Year by year'], ['month', 'Month by month']] as const).map(([k, l]) => <button key={k} aria-pressed={mode === k} onClick={() => setMode(k)} className="h-[34px] px-3 rounded-lg text-[12.5px]" style={pill(mode === k)}>{l}</button>)}
          </div>
          {!yearly && (
            <div className="flex items-center gap-1">
              <button onClick={() => setYear(y => Math.max(years[0], y - 1))} disabled={year <= years[0]} aria-label="Year before" className="w-[38px] h-[38px] rounded-[10px] flex items-center justify-center disabled:opacity-40" style={{ border: '1px solid var(--line)', background: '#fff' }}><ChevronLeft size={16} /></button>
              <span className="min-w-[56px] text-center text-[14px] font-bold">{year}</span>
              <button onClick={() => setYear(y => Math.min(years[years.length - 1], y + 1))} disabled={year >= years[years.length - 1]} aria-label="Year after" className="w-[38px] h-[38px] rounded-[10px] flex items-center justify-center disabled:opacity-40" style={{ border: '1px solid var(--line)', background: '#fff' }}><ChevronRight size={16} /></button>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        {stats.map(s => <div key={s.label} className="rounded-xl px-3.5 py-3" style={{ background: s.bg }}><div className="text-[12px]" style={{ color: s.ink }}>{s.label}</div><div className="text-[18px] md:text-[20px] font-extrabold tabular-nums" style={{ color: 'var(--text)' }}>{s.value}</div><div className="text-[11.5px]" style={{ color: 'var(--text3)' }}>{s.sub}</div></div>)}
      </div>

      <div className="flex gap-3.5 flex-wrap text-[12px]" style={{ color: 'var(--text2)' }}>
        {(paid ? [['Principal', '#16A34A'], ['Interest', '#F59E0B']] : [['Released by the bank', '#0F766E']]).map(([l, c]) => <span key={l} className="inline-flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-[3px]" style={{ background: c }} />{l}</span>)}
        {paid && <span style={{ color: 'var(--text3)' }}>A prepayment shows as a label</span>}
      </div>
      <div role="img" aria-label={paid ? `Principal and interest paid ${yearly ? 'each year' : `each month of ${year}`}` : `Money released ${yearly ? 'each year' : `each month of ${year}`}`} className="flex items-end px-1 relative" style={{ gap: yearly ? 24 : 6, height: 190, borderBottom: '1px solid #D9DCE6' }}>
        {groups.map(g => {
          const [a, b] = val(g.xs), pp = paid ? sum(g.xs.filter(x => x.kind === 'prepayment'), x => x.principal) : 0
          return (
            <div key={g.label} title={`${g.name}: ${paid ? `principal ${full(a)}, interest ${full(b)}${pp ? `, prepaid ${full(pp)}` : ''}` : `released ${full(a)}`}`} className="flex-1 min-w-0 h-full flex flex-col justify-end items-center gap-[3px]">
              {pp > 0 && <span className="text-[10.5px] font-bold whitespace-nowrap" style={{ color: '#15803D' }}>+{short(pp)} prepaid</span>}
              {yearly && a + b > 0 && <span className="text-[10.5px] whitespace-nowrap" style={{ color: 'var(--text3)' }}>{short(a + b)}</span>}
              {!yearly && !paid && a > 0 && <span className="text-[10.5px] whitespace-nowrap" style={{ color: '#0F5E57' }}>{short(a)}</span>}
              <div className="w-[62%] max-w-[46px] flex flex-col gap-[2px]">
                {b > 0 && <div className="rounded-t-[5px]" style={{ height: b / mx * 150, background: '#F59E0B' }} />}
                {a > 0 && <div style={{ height: a / mx * 150, background: paid ? '#16A34A' : '#0F766E', borderRadius: b > 0 ? 0 : '5px 5px 0 0' }} />}
              </div>
            </div>
          )
        })}
      </div>
      <div className="flex px-1 -mt-1.5" style={{ gap: yearly ? 24 : 6 }}>{groups.map(g => <div key={g.label} className="flex-1 min-w-0 text-center text-[11.5px]" style={{ color: 'var(--text3)' }}>{g.label}</div>)}</div>

      <div className="overflow-x-auto -mx-1">
        <table className="w-full text-[13px] tabular-nums" style={{ minWidth: paid ? 620 : 480 }}>
          <thead><tr style={{ color: 'var(--text3)' }}>
            <th className={`${th} text-left`}>{yearly ? 'Year' : 'Month'}</th>
            {paid ? <><th className={`${th} text-right`}>EMIs</th><th className={`${th} text-right`}>Principal</th><th className={`${th} text-right`}>Interest</th><th className={`${th} text-right`}>Prepaid</th><th className={`${th} text-right`}>Owed after</th></>
              : <><th className={`${th} text-right`}>Released</th><th className={`${th} text-left`}>For</th><th className={`${th} text-right`}>Borrowed by then</th></>}
          </tr></thead>
          <tbody>
            {(() => {
              let run = yearly ? 0 : sum(before.filter(x => x.kind === 'disbursement'), x => x.amount)
              return groups.map(g => {
                const e = emis(g.xs), lastRow = g.xs[g.xs.length - 1], rel = g.xs.filter(x => x.kind === 'disbursement'), r1 = sum(rel, x => x.amount)
                run += r1
                return (
                  <tr key={g.label} style={{ borderTop: '1px solid var(--track)', color: g.none ? '#A3A7B7' : undefined }}>
                    <td className="px-2 py-2.5 font-medium">{g.name}{yearly && e.length ? <span className="text-[11.5px] font-normal" style={{ color: 'var(--text3)' }}> · {e.length}</span> : null}</td>
                    {paid ? <>
                      <td className="px-2 py-2.5 text-right">{fmt(sum(e, x => x.amount))}</td>
                      <td className="px-2 py-2.5 text-right font-semibold" style={{ color: g.none ? undefined : '#15803D' }}>{fmt(sum(e, x => x.principal))}</td>
                      <td className="px-2 py-2.5 text-right" style={{ color: g.none ? undefined : '#B45309' }}>{fmt(sum(g.xs, x => x.interest))}</td>
                      <td className="px-2 py-2.5 text-right font-semibold" style={{ color: g.none ? undefined : '#14532D' }}>{fmt(sum(g.xs.filter(x => x.kind === 'prepayment'), x => x.principal))}</td>
                      <td className="px-2 py-2.5 text-right font-semibold">{lastRow ? short(lastRow.owedAfter) : '—'}</td>
                    </> : <>
                      <td className="px-2 py-2.5 text-right font-semibold" style={{ color: r1 ? '#0F766E' : undefined }}>{fmt(r1)}</td>
                      <td className="px-2 py-2.5">{rel.map(x => x.note).filter(Boolean).join(', ') || '—'}</td>
                      <td className="px-2 py-2.5 text-right">{g.none && !yearly ? '—' : short(run)}</td>
                    </>}
                  </tr>
                )
              })
            })()}
            <tr style={{ borderTop: '1.5px solid #D9DCE6', background: '#FAFAFE' }}>
              <td className="px-2 py-2.5 font-bold">{yearly ? 'All years' : `Total ${year}`}</td>
              {paid ? <><td className="px-2 py-2.5 text-right font-bold">{fmt(E)}</td><td className="px-2 py-2.5 text-right font-bold" style={{ color: '#15803D' }}>{fmt(P)}</td><td className="px-2 py-2.5 text-right font-bold" style={{ color: '#B45309' }}>{fmt(I)}</td><td className="px-2 py-2.5 text-right font-bold" style={{ color: '#14532D' }}>{fmt(PP)}</td><td /></>
                : <><td className="px-2 py-2.5 text-right font-bold" style={{ color: '#0F766E' }}>{fmt(B)}</td><td /><td /></>}
            </tr>
          </tbody>
        </table>
      </div>
      <p className="text-[12px] leading-snug" style={{ color: 'var(--text3)' }}>{paid ? 'Each EMI splits into principal (what you owe goes down) and interest (the bank’s charge) — its own split when you recorded one, else a month’s interest on what was owed. Months with nothing recorded show —.' : 'Each release is the bank paying for you: it adds to what you owe from that day. Add them in the Bank releases tab below.'}</p>
    </section>
  )
}
