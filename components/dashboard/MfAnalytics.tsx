'use client'
import { useMemo, useState, useEffect } from 'react'
import { Sparkles, TrendingUp, Receipt, Lock, PieChart as PieIcon, Layers } from 'lucide-react'

interface Props {
  funds:       any[]
  navOf:       (f: any) => number | null
  txnsByFund:  Record<string, any[]>
  allTxns:     any[]
  currency?:   string
}

// Category benchmarks (typical annual %) — heuristic, not an agency figure
const BENCH: Record<string, number> = { equity: 12, debt: 7, hybrid: 10, elss: 12, index: 11, liquid: 6 }
const CAP_COLORS: Record<string, string> = {
  'Large Cap': '#2563EB', 'Mid Cap': '#7C3AED', 'Small Cap': '#DB2777', 'Large & Mid': '#0891B2',
  'Multi Cap': '#0D9488', 'Flexi Cap': '#3D7A58', 'ELSS': '#D4920A', 'Index/ETF': '#6366F1',
  'Hybrid': '#C2640A', 'Debt': '#64748B', 'Gold/Silver': '#CA8A04', 'Other Equity': '#9333EA',
}
const INFLOW = new Set(['purchase', 'sip', 'switch_in'])
const OUTFLOW = new Set(['redemption', 'switch_out'])

function abbr(n: number, sym: string) {
  const a = Math.abs(n)
  if (a >= 1e7) return `${sym}${(n / 1e7).toFixed(2)}Cr`
  if (a >= 1e5) return `${sym}${(n / 1e5).toFixed(2)}L`
  if (a >= 1e3) return `${sym}${(n / 1e3).toFixed(1)}K`
  return `${sym}${Math.round(n).toLocaleString('en-IN')}`
}

function capOf(name: string, type: string): string {
  const n = (name || '').toLowerCase()
  if (type === 'debt' || /\bdebt\b|gilt|liquid|overnight|money\s*market|corporate\s*bond|credit\s*risk|banking\s*&?\s*psu|duration|\bincome\b|treasury|\bbond\b/.test(n)) return 'Debt'
  if (/gold|silver|precious/.test(n)) return 'Gold/Silver'
  if (type === 'elss' || /elss|tax\s*saver|tax\s*saving/.test(n)) return 'ELSS'
  if (/small\s*cap/.test(n)) return 'Small Cap'
  if (/mid\s*cap/.test(n)) return 'Mid Cap'
  if (/large\s*&?\s*and?\s*mid|large\s*&\s*mid/.test(n)) return 'Large & Mid'
  if (/large\s*cap|bluechip|blue\s*chip|top\s*100/.test(n)) return 'Large Cap'
  if (/multi\s*cap/.test(n)) return 'Multi Cap'
  if (/flexi\s*cap/.test(n)) return 'Flexi Cap'
  if (type === 'index' || /index|nifty|sensex|\betf\b/.test(n)) return 'Index/ETF'
  if (type === 'hybrid' || /hybrid|balanced|advantage|asset\s*alloc|multi\s*asset|equity\s*savings|arbitrage/.test(n)) return 'Hybrid'
  return 'Other Equity'
}
function assetOf(cap: string): 'Equity' | 'Debt' | 'Gold/Silver' | 'Hybrid' {
  if (cap === 'Debt') return 'Debt'
  if (cap === 'Gold/Silver') return 'Gold/Silver'
  if (cap === 'Hybrid') return 'Hybrid'
  return 'Equity'
}

function xirr(cf: { t: number; a: number }[]): number | null {
  if (cf.length < 2) return null
  const s = [...cf].sort((x, y) => x.t - y.t), t0 = s[0].t
  const yf = (t: number) => (t - t0) / (365.25 * 864e5)
  if (!s.some(c => c.a < 0) || !s.some(c => c.a > 0)) return null
  const npv = (r: number) => s.reduce((a, c) => a + c.a / Math.pow(1 + r, yf(c.t)), 0)
  let lo = -0.999, hi = 10, flo = npv(lo)
  if (isNaN(flo) || flo * npv(hi) > 0) return null
  for (let i = 0; i < 120; i++) { const m = (lo + hi) / 2, fm = npv(m); if (!isFinite(fm)) return null; if (Math.abs(fm) < 1e-7) return m * 100; if (flo * fm < 0) hi = m; else { lo = m; flo = fm } }
  const r = ((lo + hi) / 2) * 100
  return r > -99 && r < 1000 ? r : null
}

const monthsSince = (d?: string | null) => d ? (new Date().getFullYear() - new Date(d).getFullYear()) * 12 + (new Date().getMonth() - new Date(d).getMonth()) : 0

export default function MfAnalytics({ funds, navOf, txnsByFund, allTxns, currency = 'INR' }: Props) {
  const sym = currency === 'AED' ? 'AED ' : '₹'

  // Actual Nifty 50 return over the same period as the portfolio (for XIRR vs index)
  const [nifty, setNifty] = useState<{ cagr: number } | null>(null)
  useEffect(() => {
    const from = (allTxns ?? []).map(t => t.txn_date).filter(Boolean).sort()[0]
    if (!from) return
    fetch(`/api/index-return?from=${from}`).then(r => r.json())
      .then(d => { if (typeof d?.cagr === 'number') setNifty({ cagr: d.cagr }) })
      .catch(() => {})
  }, [allTxns])

  const rows = useMemo(() => funds.map(f => {
    const nav = navOf(f)
    const invested = Number(f.invested_amount) || 0
    const units = Number(f.units) || 0
    const current = nav != null ? units * nav : invested
    const gain = current - invested
    const retPct = invested > 0 ? gain / invested * 100 : null
    const txns = txnsByFund[f.id] ?? []
    const buys = txns.filter((t: any) => INFLOW.has(t.txn_type)).map((t: any) => t.txn_date).filter(Boolean).sort()
    const firstBuy = buys[0] ?? f.purchase_date ?? f.created_at ?? null
    const cap = capOf(f.fund_name, f.fund_type)
    const asset = assetOf(cap)
    return { f, invested, units, current, gain, retPct, nav, firstBuy, cap, asset, txns }
  }), [funds, txnsByFund]) // eslint-disable-line

  const totalInvested = rows.reduce((a, r) => a + r.invested, 0)
  const totalCurrent  = rows.reduce((a, r) => a + r.current, 0)
  const totalGain     = totalCurrent - totalInvested
  const totalRetPct   = totalInvested > 0 ? totalGain / totalInvested * 100 : 0

  // ── allocation by category ──────────────────────────────────────────────
  const byCap = useMemo(() => {
    const m: Record<string, number> = {}
    rows.forEach(r => { m[r.cap] = (m[r.cap] ?? 0) + r.current })
    return Object.entries(m).map(([cap, v]) => ({ cap, value: v, pct: totalCurrent > 0 ? v / totalCurrent * 100 : 0, color: CAP_COLORS[cap] ?? '#6B7280' }))
      .sort((a, b) => b.value - a.value)
  }, [rows, totalCurrent])

  const byAsset = useMemo(() => {
    const m: Record<string, number> = {}
    rows.forEach(r => { m[r.asset] = (m[r.asset] ?? 0) + r.current })
    const colors: Record<string, string> = { Equity: '#3D7A58', Debt: '#64748B', 'Gold/Silver': '#CA8A04', Hybrid: '#C2640A' }
    return Object.entries(m).map(([asset, v]) => ({ asset, value: v, pct: totalCurrent > 0 ? v / totalCurrent * 100 : 0, color: colors[asset] ?? '#6B7280' })).sort((a, b) => b.value - a.value)
  }, [rows, totalCurrent])

  // ── overall XIRR + benchmark ────────────────────────────────────────────
  const overallXirr = useMemo(() => {
    const cf = (allTxns ?? []).filter(t => INFLOW.has(t.txn_type) || OUTFLOW.has(t.txn_type))
      .map(t => ({ t: new Date(t.txn_date).getTime(), a: INFLOW.has(t.txn_type) ? -t.amount : t.amount }))
    if (totalCurrent > 0) cf.push({ t: Date.now(), a: totalCurrent })
    return xirr(cf)
  }, [allTxns, totalCurrent])
  // blended benchmark weighted by current value
  const blendedBench = totalCurrent > 0 ? rows.reduce((a, r) => a + (BENCH[r.f.fund_type] ?? 10) * r.current, 0) / totalCurrent : 10
  const xirrShown = overallXirr ?? totalRetPct
  const beatsBench = xirrShown - blendedBench

  // ── tax (LTCG / STCG) — India FY24+ heuristic ─────────────────────────────
  const tax = useMemo(() => {
    let eqLTCG = 0, eqSTCG = 0, debt = 0, exitLoad = 0
    rows.forEach(r => {
      const eqTaxed = r.asset === 'Equity' || r.asset === 'Hybrid'
      const hm = monthsSince(r.firstBuy)
      if (eqTaxed) {
        if (hm >= 12) eqLTCG += r.gain; else { eqSTCG += r.gain; exitLoad += r.current * 0.01 }
      } else debt += r.gain
    })
    const eqLTCGtax = Math.max(0, eqLTCG - 125000) * 0.125
    const eqSTCGtax = Math.max(0, eqSTCG) * 0.20
    const debtTax   = Math.max(0, debt) * 0.30
    const total     = eqLTCGtax + eqSTCGtax + debtTax
    return { eqLTCG, eqSTCG, debt, eqLTCGtax, eqSTCGtax, debtTax, exitLoad, total, net: totalCurrent - total - exitLoad }
  }, [rows, totalCurrent])

  // ── ELSS lock-in ──────────────────────────────────────────────────────────
  const elss = useMemo(() => rows.filter(r => r.f.fund_type === 'elss' || /elss|tax\s*sav/i.test(r.f.fund_name)).map(r => {
    const locked = r.txns.filter((t: any) => INFLOW.has(t.txn_type) && monthsSince(t.txn_date) < 36)
    const lockedAmt = locked.reduce((a: number, t: any) => a + (t.amount || 0), 0)
    const earliestLocked = locked.map((t: any) => t.txn_date).filter(Boolean).sort()[0] ?? r.firstBuy
    const unlock = earliestLocked ? new Date(new Date(earliestLocked).setFullYear(new Date(earliestLocked).getFullYear() + 3)) : null
    return { name: r.f.fund_name, lockedAmt: lockedAmt || (monthsSince(r.firstBuy) < 36 ? r.invested : 0), unlock }
  }), [rows])

  // ── readout / insights ──────────────────────────────────────────────────
  const insights = useMemo(() => {
    const out: { icon: string; text: string }[] = []
    const cats = byCap.length
    out.push(cats >= 4 ? { icon: '✅', text: `Nicely spread across ${cats} fund categories.` } : { icon: '💡', text: `You're in ${cats} categor${cats === 1 ? 'y' : 'ies'} — adding a different cap/style improves diversification.` })
    const top = byCap[0]
    if (top && top.pct > 50) out.push({ icon: '⚠️', text: `${Math.round(top.pct)}% sits in ${top.cap} — fairly concentrated.` })
    const eq = byAsset.find(a => a.asset === 'Equity')
    if (eq) out.push({ icon: '📊', text: `${Math.round(eq.pct)}% of your money is in equity.` })
    out.push(beatsBench >= 0
      ? { icon: '🎉', text: `Your ${overallXirr != null ? 'XIRR' : 'return'} of ${xirrShown.toFixed(1)}% is beating the category benchmark (~${blendedBench.toFixed(0)}%) by ${beatsBench.toFixed(1)}%. Keep it up!` }
      : { icon: '👀', text: `You're at ${xirrShown.toFixed(1)}% vs a ~${blendedBench.toFixed(0)}% category benchmark — trailing by ${Math.abs(beatsBench).toFixed(1)}%. Worth reviewing the laggards.` })
    const lockedTotal = elss.reduce((a, e) => a + e.lockedAmt, 0)
    if (lockedTotal > 0) out.push({ icon: '🔒', text: `${abbr(lockedTotal, sym)} in ELSS is within its 3-yr lock-in.` })
    if (tax.total > 0) out.push({ icon: '🧾', text: `Redeeming everything today would attract roughly ${abbr(tax.total, sym)} in tax.` })
    return out
  }, [byCap, byAsset, beatsBench, xirrShown, overallXirr, blendedBench, elss, tax, sym])

  if (rows.length === 0) return <div className="wl-card p-8 text-center text-[13px]" style={{ color: 'var(--text3)' }}>Add or import mutual funds to see analytics.</div>

  const Section = ({ icon: Icon, title, children }: { icon: any; title: string; children: React.ReactNode }) => (
    <div className="wl-card p-5">
      <div className="flex items-center gap-2 mb-4"><Icon size={15} style={{ color: 'var(--sage)' }} /><div className="text-[13px] font-bold" style={{ color: 'var(--text)' }}>{title}</div></div>
      {children}
    </div>
  )

  return (
    <div className="space-y-4">
      {/* Readout */}
      <div className="wl-card p-5" style={{ borderLeft: '3px solid var(--sage)' }}>
        <div className="flex items-center gap-2 mb-3"><Sparkles size={15} style={{ color: 'var(--sage)' }} /><div className="text-[13px] font-bold" style={{ color: 'var(--text)' }}>Your portfolio at a glance</div></div>
        <div className="space-y-2">
          {insights.map((ins, i) => (
            <div key={i} className="flex items-start gap-2 text-[12px]"><span>{ins.icon}</span><span style={{ color: 'var(--text2)' }}>{ins.text}</span></div>
          ))}
        </div>
      </div>

      {/* Category allocation */}
      <Section icon={PieIcon} title="Allocation by category (cap & style)">
        <div className="space-y-2.5">
          {byCap.map(c => (
            <div key={c.cap}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[12px] font-semibold" style={{ color: 'var(--text)' }}>{c.cap}</span>
                <span className="text-[11px] font-mono" style={{ color: 'var(--text3)' }}>{abbr(c.value, sym)} · <strong style={{ color: c.color }}>{c.pct.toFixed(1)}%</strong></span>
              </div>
              <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--bg2)' }}><div className="h-full rounded-full" style={{ width: `${c.pct}%`, background: c.color }} /></div>
            </div>
          ))}
        </div>
        <div className="text-[10px] mt-3" style={{ color: 'var(--text3)' }}>Category is inferred from each fund's name &amp; type.</div>
      </Section>

      {/* Asset split */}
      <Section icon={Layers} title="Equity vs Debt vs Gold/Silver vs Hybrid">
        <div className="flex h-4 rounded-full overflow-hidden mb-3" style={{ background: 'var(--bg2)' }}>
          {byAsset.map(a => <div key={a.asset} style={{ width: `${a.pct}%`, background: a.color }} title={`${a.asset} ${a.pct.toFixed(0)}%`} />)}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {byAsset.map(a => (
            <div key={a.asset} className="rounded-lg px-3 py-2" style={{ background: 'var(--bg2)' }}>
              <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider" style={{ color: a.color }}><span className="w-2 h-2 rounded-sm" style={{ background: a.color }} />{a.asset}</div>
              <div className="text-[14px] font-bold font-mono mt-0.5" style={{ color: 'var(--text)' }}>{a.pct.toFixed(0)}%</div>
              <div className="text-[10px]" style={{ color: 'var(--text3)' }}>{abbr(a.value, sym)}</div>
            </div>
          ))}
        </div>
      </Section>

      {/* Returns vs benchmark */}
      <Section icon={TrendingUp} title="Returns vs benchmark">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
          {[
            { label: overallXirr != null ? 'Your XIRR' : 'Your return', value: `${xirrShown >= 0 ? '+' : ''}${xirrShown.toFixed(1)}%`, color: xirrShown >= 0 ? 'var(--income)' : 'var(--rose)' },
            { label: 'Category benchmark', value: `~${blendedBench.toFixed(1)}%`, color: 'var(--text2)' },
            { label: beatsBench >= 0 ? 'Beating by' : 'Trailing by', value: `${beatsBench >= 0 ? '+' : ''}${beatsBench.toFixed(1)}%`, color: beatsBench >= 0 ? 'var(--income)' : 'var(--rose)' },
          ].map(c => (
            <div key={c.label} className="rounded-lg px-3 py-2" style={{ background: 'var(--bg2)' }}>
              <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text3)' }}>{c.label}</div>
              <div className="text-[18px] font-bold font-mono mt-0.5" style={{ color: c.color }}>{c.value}</div>
            </div>
          ))}
        </div>
        {nifty && (
          <div className="flex items-center justify-between p-3 rounded-lg mb-4" style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}>
            <div className="text-[11px]" style={{ color: 'var(--text2)' }}>
              vs <strong>Nifty 50</strong> over the same period: <strong style={{ color: 'var(--text)' }}>{nifty.cagr >= 0 ? '+' : ''}{nifty.cagr.toFixed(1)}%/yr</strong>
            </div>
            {(() => { const d = xirrShown - nifty.cagr; return (
              <span className="text-[12px] font-bold font-mono" style={{ color: d >= 0 ? 'var(--income)' : 'var(--rose)' }}>
                {d >= 0 ? `Beating index by +${d.toFixed(1)}%` : `Trailing index by ${d.toFixed(1)}%`}
              </span>
            ) })()}
          </div>
        )}
        <div className="space-y-1.5">
          {rows.filter(r => r.retPct != null).sort((a, b) => (b.retPct ?? 0) - (a.retPct ?? 0)).map(r => {
            const bench = BENCH[r.f.fund_type] ?? 10
            const diff = (r.retPct ?? 0) - bench
            return (
              <div key={r.f.id} className="flex items-center gap-2 text-[11px]">
                <span className="flex-1 truncate" style={{ color: 'var(--text2)' }}>{r.f.fund_name}</span>
                <span className="font-mono w-14 text-right" style={{ color: (r.retPct ?? 0) >= 0 ? 'var(--income)' : 'var(--rose)' }}>{(r.retPct ?? 0) >= 0 ? '+' : ''}{(r.retPct ?? 0).toFixed(1)}%</span>
                <span className="text-[9px] px-1.5 py-0.5 rounded font-semibold w-20 text-center flex-shrink-0" style={{ background: diff >= 0 ? '#D1FAE5' : '#FEE2E2', color: diff >= 0 ? '#065F46' : '#991B1B' }}>
                  {diff >= 0 ? 'beats' : 'below'} {diff >= 0 ? '+' : ''}{diff.toFixed(1)}%
                </span>
              </div>
            )
          })}
        </div>
        <div className="text-[10px] mt-3" style={{ color: 'var(--text3)' }}>Benchmark = a typical category return (WealthLens estimate), not an index feed.</div>
      </Section>

      {/* Tax */}
      <Section icon={Receipt} title="Tax if you redeem today (estimate)">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
          {[
            { label: 'Est. total tax', value: abbr(tax.total, sym), color: 'var(--rose)' },
            { label: 'Equity LTCG tax', value: abbr(tax.eqLTCGtax, sym), color: 'var(--text2)', note: '12.5% over ₹1.25L' },
            { label: 'Equity STCG tax', value: abbr(tax.eqSTCGtax, sym), color: 'var(--text2)', note: '20%' },
            { label: 'Net in hand', value: abbr(tax.net, sym), color: 'var(--income)', note: 'after tax + exit load' },
          ].map(c => (
            <div key={c.label} className="rounded-lg px-3 py-2" style={{ background: 'var(--bg2)' }}>
              <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text3)' }}>{c.label}</div>
              <div className="text-[15px] font-bold font-mono mt-0.5" style={{ color: c.color }}>{c.value}</div>
              {c.note && <div className="text-[9px]" style={{ color: 'var(--text3)' }}>{c.note}</div>}
            </div>
          ))}
        </div>
        <div className="overflow-x-auto rounded-lg border" style={{ borderColor: 'var(--border)' }}>
          <table className="w-full text-[11px]" style={{ borderCollapse: 'collapse' }}>
            <thead><tr style={{ background: 'var(--bg2)' }}>{['Fund', 'Held', 'Gain', 'Term'].map(h => <th key={h} className="px-3 py-2 text-left first:text-left" style={{ color: 'var(--text3)', fontSize: 10, textTransform: 'uppercase', fontWeight: 700, textAlign: h === 'Fund' ? 'left' : 'right' }}>{h}</th>)}</tr></thead>
            <tbody>
              {rows.map(r => {
                const hm = monthsSince(r.firstBuy)
                const eqTaxed = r.asset === 'Equity' || r.asset === 'Hybrid'
                const term = !eqTaxed ? 'Debt (slab)' : hm >= 12 ? 'LTCG' : 'STCG'
                return (
                  <tr key={r.f.id} style={{ borderTop: '1px solid var(--border)' }}>
                    <td className="px-3 py-2 truncate" style={{ color: 'var(--text)', maxWidth: 200 }}>{r.f.fund_name}</td>
                    <td className="px-3 py-2 text-right font-mono" style={{ color: 'var(--text3)' }}>{hm >= 12 ? `${Math.floor(hm / 12)}y ${hm % 12}m` : `${hm}m`}</td>
                    <td className="px-3 py-2 text-right font-mono" style={{ color: r.gain >= 0 ? 'var(--income)' : 'var(--rose)' }}>{r.gain >= 0 ? '+' : ''}{abbr(r.gain, sym)}</td>
                    <td className="px-3 py-2 text-right"><span className="text-[9px] px-1.5 py-0.5 rounded font-semibold" style={{ background: term === 'LTCG' ? '#D1FAE5' : term === 'STCG' ? '#FEF3C7' : 'var(--bg2)', color: term === 'LTCG' ? '#065F46' : term === 'STCG' ? '#92400E' : 'var(--text3)' }}>{term}</span></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div className="text-[10px] mt-2" style={{ color: 'var(--text3)' }}>
          Estimate using current rules (equity LTCG 12.5% above ₹1.25L, STCG 20%; debt &amp; gold at slab, assumed 30%). Hybrid treated as equity. Holding period from your earliest purchase. Not tax advice — confirm with your advisor.
        </div>
      </Section>

      {/* ELSS lock-in */}
      {elss.length > 0 && (
        <Section icon={Lock} title="ELSS lock-in (3 years)">
          <div className="space-y-2">
            {elss.map((e, i) => (
              <div key={i} className="flex items-center justify-between p-3 rounded-lg" style={{ background: 'var(--bg2)' }}>
                <div className="min-w-0"><div className="text-[12px] font-semibold truncate" style={{ color: 'var(--text)' }}>{e.name}</div>
                  <div className="text-[10px]" style={{ color: 'var(--text3)' }}>{e.lockedAmt > 0 ? `${abbr(e.lockedAmt, sym)} locked` : 'Fully unlocked'}</div></div>
                <div className="text-right flex-shrink-0">
                  {e.lockedAmt > 0 && e.unlock
                    ? <><div className="text-[10px]" style={{ color: 'var(--text3)' }}>unlocks by</div><div className="text-[12px] font-semibold font-mono" style={{ color: 'var(--gold)' }}>{e.unlock.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}</div></>
                    : <span className="text-[10px] px-2 py-0.5 rounded font-semibold" style={{ background: '#D1FAE5', color: '#065F46' }}>✓ Free to redeem</span>}
                </div>
              </div>
            ))}
          </div>
          <div className="text-[10px] mt-2" style={{ color: 'var(--text3)' }}>Each ELSS investment is locked for 3 years from its purchase date.</div>
        </Section>
      )}
    </div>
  )
}
