'use client'
import { useState, useEffect } from 'react'
import { Globe, Briefcase, CalendarClock, Landmark, Info } from 'lucide-react'

// ── Persisted inputs (localStorage — personal planning, no DB needed) ──
function useLocal<T>(key: string, initial: T): [T, (v: T) => void] {
  const [val, setVal] = useState<T>(initial)
  useEffect(() => {
    try { const s = localStorage.getItem(key); if (s) setVal(JSON.parse(s)) } catch {}
  }, [key])
  const set = (v: T) => { setVal(v); try { localStorage.setItem(key, JSON.stringify(v)) } catch {} }
  return [val, set]
}

const Lbl = ({ children }: { children: React.ReactNode }) => (
  <label className="block text-[10px] uppercase tracking-wider font-semibold mb-1" style={{ color: 'var(--text3)' }}>{children}</label>
)
const inputStyle = { background: 'var(--bg2)', border: '1px solid var(--border)', color: 'var(--text)' }
const aed = (n: number) => `AED ${Math.round(n).toLocaleString('en-AE')}`

export default function NriToolkitClient() {
  return (
    <div className="space-y-5 animate-fade-up">
      <div>
        <h1 className="text-xl font-bold flex items-center gap-2" style={{ color: 'var(--text)' }}>
          <Globe size={20} style={{ color: 'var(--sage)' }} /> NRI Toolkit
        </h1>
        <p className="text-[12px] mt-0.5" style={{ color: 'var(--text3)' }}>
          UAE gratuity, India tax-residency and NRE/NRO essentials — the NRI things generic apps miss
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <GratuityCard />
        <ResidencyCard />
      </div>

      <NreNroCard />

      <div className="text-[10px] flex items-start gap-1.5" style={{ color: 'var(--text3)' }}>
        <Info size={12} className="flex-shrink-0 mt-0.5" />
        Estimates for planning only, based on UAE Federal Decree-Law 33/2021 and the Indian Income-Tax residency rules. Confirm specifics with a qualified advisor.
      </div>
    </div>
  )
}

// ── UAE Gratuity (end-of-service) ──────────────────────────────────────────────
function GratuityCard() {
  const [joinDate, setJoinDate] = useLocal('nri.grat.join', '')
  const [endDate,  setEndDate]  = useLocal('nri.grat.end', new Date().toISOString().slice(0, 10))
  const [basic,    setBasic]    = useLocal('nri.grat.basic', '')
  const [reason,   setReason]   = useLocal<'termination' | 'resignation'>('nri.grat.reason', 'resignation')

  const b = Number(basic) || 0
  const start = joinDate ? new Date(joinDate) : null
  const end   = endDate ? new Date(endDate) : new Date()
  const years = start ? Math.max(0, (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24 * 365.25)) : 0
  const daily = b / 30

  // 21 days/yr for first 5 years, 30 days/yr after; capped at 2 years' basic.
  let gratuity = 0
  if (years >= 1) {
    const first5 = Math.min(years, 5) * 21 * daily
    const after5 = Math.max(years - 5, 0) * 30 * daily
    gratuity = Math.min(first5 + after5, b * 24)
  }
  // Unlimited-contract resignation before 5 years is pro-rated (post-2021 law
  // largely removed this, but we keep a gentle note rather than reduce).
  const preOneYear = years > 0 && years < 1

  return (
    <div className="wl-card p-4">
      <div className="text-[13px] font-bold flex items-center gap-2 mb-3" style={{ color: 'var(--text)' }}>
        <Briefcase size={15} style={{ color: '#0891B2' }} /> UAE Gratuity Estimator
      </div>
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div><Lbl>Joining date</Lbl>
          <input type="date" value={joinDate} onChange={e => setJoinDate(e.target.value)} className="wl-input" style={inputStyle} /></div>
        <div><Lbl>Last working day</Lbl>
          <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="wl-input" style={inputStyle} /></div>
        <div><Lbl>Last basic salary / mo</Lbl>
          <input type="number" value={basic} onChange={e => setBasic(e.target.value)} placeholder="AED 10000" className="wl-input" style={inputStyle} /></div>
        <div><Lbl>Leaving because</Lbl>
          <select value={reason} onChange={e => setReason(e.target.value as any)} className="wl-input" style={inputStyle}>
            <option value="resignation">Resignation</option>
            <option value="termination">Termination</option>
          </select>
        </div>
      </div>
      <div className="rounded-xl p-4 text-center" style={{ background: '#ECFEFF', border: '1px solid #0891B240' }}>
        <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#0E7490' }}>Estimated gratuity</div>
        <div className="text-[26px] font-black font-mono" style={{ color: '#0E7490' }}>{aed(gratuity)}</div>
        <div className="text-[10px] mt-1" style={{ color: 'var(--text3)' }}>
          {start ? `${years.toFixed(2)} yrs of service · basic ${aed(b)}/mo` : 'Enter joining date & basic salary'}
        </div>
      </div>
      {preOneYear && (
        <div className="mt-2 text-[10px]" style={{ color: 'var(--gold)' }}>⚠ Under 1 year of service — no gratuity is payable.</div>
      )}
      <div className="mt-2 text-[10px] leading-snug" style={{ color: 'var(--text3)' }}>
        21 days’ basic per year for the first 5 years, 30 days after, capped at 2 years’ pay. Based on <strong>basic</strong> salary only (excludes allowances).
      </div>
    </div>
  )
}

// ── India tax-residency (182-day rule) ─────────────────────────────────────────
function fyLabel(d = new Date()) {
  const y = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1
  return `FY ${y}-${String((y + 1) % 100).padStart(2, '0')}`
}
function ResidencyCard() {
  const [days, setDays]       = useLocal('nri.res.days', '')
  const [highInc, setHighInc] = useLocal<boolean>('nri.res.highinc', false)
  const d = Number(days) || 0
  const threshold = highInc ? 120 : 182   // 120-day rule if Indian income > ₹15L
  const isResident = d >= threshold
  const remaining = Math.max(0, threshold - d)
  const status = isResident
    ? (highInc && d < 182 ? 'Resident (RNOR likely)' : 'Resident')
    : 'Non-Resident (NRI)'
  const color = isResident ? 'var(--rose)' : 'var(--income)'

  return (
    <div className="wl-card p-4">
      <div className="text-[13px] font-bold flex items-center gap-2 mb-3" style={{ color: 'var(--text)' }}>
        <CalendarClock size={15} style={{ color: '#7C3AED' }} /> India Tax Residency · {fyLabel()}
      </div>
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div><Lbl>Days in India (this FY)</Lbl>
          <input type="number" value={days} onChange={e => setDays(e.target.value)} placeholder="e.g. 45" className="wl-input" style={inputStyle} /></div>
        <div className="flex flex-col justify-end">
          <label className="flex items-center gap-2 text-[11px] cursor-pointer" style={{ color: 'var(--text2, var(--text))' }}>
            <input type="checkbox" checked={highInc} onChange={e => setHighInc(e.target.checked)} />
            Indian income &gt; ₹15L
          </label>
        </div>
      </div>
      <div className="rounded-xl p-4 text-center" style={{ background: isResident ? 'var(--rose-bg)' : 'var(--income-bg)' }}>
        <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text3)' }}>Likely status</div>
        <div className="text-[22px] font-black" style={{ color }}>{status}</div>
        <div className="text-[10px] mt-1" style={{ color: 'var(--text3)' }}>
          {isResident
            ? `${d} days ≥ ${threshold}-day limit`
            : `${remaining} more day${remaining === 1 ? '' : 's'} in India would make you a Resident (${threshold}-day limit)`}
        </div>
      </div>
      <div className="mt-2 h-2 rounded-full overflow-hidden" style={{ background: 'var(--bg2)' }}>
        <div className="h-full rounded-full" style={{ width: `${Math.min(100, (d / threshold) * 100)}%`, background: color }} />
      </div>
      <div className="mt-2 text-[10px] leading-snug" style={{ color: 'var(--text3)' }}>
        NRI status keeps foreign income out of Indian tax. Staying ≥ {threshold} days in India this FY can make you Resident{highInc ? ' (120-day rule applies as Indian income &gt; ₹15L)' : ''}.
      </div>
    </div>
  )
}

// ── NRE / NRO / FCNR + repatriation reference ──────────────────────────────────
function NreNroCard() {
  const rows = [
    { name: 'NRE Account', tax: 'Interest tax-free in India', repat: 'Fully repatriable (principal + interest)', use: 'Park foreign earnings, no Indian tax', color: '#16A34A' },
    { name: 'NRO Account', tax: 'Interest taxable · 30% TDS', repat: 'Up to USD 1M / financial year', use: 'India-sourced income (rent, dividends)', color: '#D97706' },
    { name: 'FCNR (B)',    tax: 'Interest tax-free in India', repat: 'Fully repatriable', use: 'Hold foreign currency, avoid FX risk', color: '#2563EB' },
  ]
  return (
    <div className="wl-card overflow-hidden">
      <div className="px-4 py-3 border-b flex items-center gap-2" style={{ borderColor: 'var(--border)' }}>
        <Landmark size={15} style={{ color: '#0284C7' }} />
        <span className="text-[13px] font-bold" style={{ color: 'var(--text)' }}>NRE vs NRO vs FCNR — tax & repatriation</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[11px]">
          <thead>
            <tr style={{ background: 'var(--bg2)', borderBottom: '1px solid var(--border)' }}>
              {['Account', 'Tax on interest', 'Repatriation', 'Best for'].map(h => (
                <th key={h} className="px-4 py-2.5 text-left text-[9px] uppercase tracking-wider font-bold" style={{ color: 'var(--text3)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.name} style={{ borderBottom: '1px solid var(--border)' }}>
                <td className="px-4 py-2.5 font-bold" style={{ color: r.color }}>{r.name}</td>
                <td className="px-4 py-2.5" style={{ color: 'var(--text)' }}>{r.tax}</td>
                <td className="px-4 py-2.5" style={{ color: 'var(--text)' }}>{r.repat}</td>
                <td className="px-4 py-2.5" style={{ color: 'var(--text3)' }}>{r.use}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="px-4 py-2.5 border-t text-[10px]" style={{ borderColor: 'var(--border)', color: 'var(--text3)' }}>
        Repatriation from NRO is capped at <strong>USD 1 million per financial year</strong> (needs Form 15CA/CB). NRE &amp; FCNR have no such cap.
      </div>
    </div>
  )
}
