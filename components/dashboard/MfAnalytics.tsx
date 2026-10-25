'use client'
import { useMemo, useState, useEffect } from 'react'
import { Sparkles, TrendingUp, Receipt, Lock, PieChart as PieIcon, Layers, CheckCircle2, AlertTriangle, Info, type LucideIcon } from 'lucide-react'
import { Donut } from '@/components/ui/kit'

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
  'Large Cap': '#3B8EF0', 'Mid Cap': '#7C3AED', 'Small Cap': '#EC5B8C', 'Large & Mid': '#0891B2',
  'Multi Cap': '#14B8A6', 'Flexi Cap': '#2FB67C', 'ELSS': '#F29A2E', 'Index/ETF': '#6A55E8',
  'Hybrid': '#D97706', 'Debt': '#64748B', 'Gold/Silver': '#CA8A04', 'Other Equity': '#9333EA',
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
    const colors: Record<string, string> = { Equity: '#2FB67C', Debt: '#64748B', 'Gold/Silver': '#CA8A04', Hybrid: '#D97706' }
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
    const out: { icon: LucideIcon; c: string; bg: string; text: string }[] = []
    const good = { icon: CheckCircle2, c: '#1E8F5F', bg: '#E7F7EF' }, warn = { icon: AlertTriangle, c: '#B96A0B', bg: '#FFF2E2' }, info = { icon: Info, c: '#5640D6', bg: '#F0EDFF' }
    const cats = byCap.length
    out.push(cats >= 4 ? { ...good, text: `Nicely spread across ${cats} fund categories.` } : { ...info, text: `You're in ${cats} categor${cats === 1 ? 'y' : 'ies'}. Adding a different cap or style improves diversification.` })
    const top = byCap[0]
    if (top && top.pct > 50) out.push({ ...warn, text: `${Math.round(top.pct)}% sits in ${top.cap}, which is fairly concentrated.` })
    const eq = byAsset.find(a => a.asset === 'Equity')
    if (eq) out.push({ ...info, icon: PieIcon, text: `${Math.round(eq.pct)}% of your money is in equity.` })
    out.push(beatsBench >= 0
      ? { ...good, icon: TrendingUp, text: `Your ${overallXirr != null ? 'XIRR' : 'return'} of ${xirrShown.toFixed(1)}% is ahead of the ~${blendedBench.toFixed(0)}% category benchmark by ${beatsBench.toFixed(1)}%.` }
      : { ...warn, text: `You're at ${xirrShown.toFixed(1)}% against a ~${blendedBench.toFixed(0)}% category benchmark, ${Math.abs(beatsBench).toFixed(1)}% behind. Worth reviewing the laggards.` })
    const lockedTotal = elss.reduce((a, e) => a + e.lockedAmt, 0)
    if (lockedTotal > 0) out.push({ ...info, icon: Lock, text: `${abbr(lockedTotal, sym)} in ELSS is still inside its 3-year lock-in.` })
    if (tax.total > 0) out.push({ ...info, icon: Receipt, text: `Redeeming everything today would cost roughly ${abbr(tax.total, sym)} in tax.` })
    return out
  }, [byCap, byAsset, beatsBench, xirrShown, overallXirr, blendedBench, elss, tax, sym])

  if (rows.length === 0) return <div className="wl-card p-8 text-center text-[13px]" style={{ color: 'var(--text3)' }}>Add or import mutual funds to see analytics.</div>

  const Section = ({ icon: Icon, title, children, note }: { icon: LucideIcon; title: string; children: React.ReactNode; note?: string }) => (
    <section className="wl-card px-4 md:px-5 py-4 md:py-[18px]">
      <div className="flex items-center gap-2.5 mb-3.5">
        <span className="w-8 h-8 rounded-[10px] flex items-center justify-center flex-shrink-0" style={{ background: 'var(--accent-bg)', color: 'var(--accent)' }}><Icon size={15} /></span>
        <h3 className="text-[14px] md:text-[15px] font-semibold" style={{ color: 'var(--text)' }}>{title}</h3>
      </div>
      {children}
      {note && <p className="text-[11.5px] mt-3 leading-snug" style={{ color: 'var(--text4)' }}>{note}</p>}
    </section>
  )
  const Stat = ({ label, value, color = 'var(--text)', note }: { label: string; value: string; color?: string; note?: string }) => (
    <div className="rounded-xl px-2.5 md:px-3.5 py-2.5 min-w-0" style={{ background: '#FAFAFE', border: '1px solid var(--line)' }}>
      <div className="text-[11.5px] truncate" style={{ color: 'var(--text3)' }}>{label}</div>
      <div className="text-[15px] md:text-[18px] font-bold tabular-nums mt-0.5 truncate" style={{ color }}>{value}</div>
      {note && <div className="text-[11px] truncate" style={{ color: 'var(--text4)' }}>{note}</div>}
    </div>
  )
  const Pill = ({ ok, children }: { ok: boolean | null; children: React.ReactNode }) => (
    <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap"
      style={ok == null ? { background: 'var(--track)', color: 'var(--text3)' } : ok ? { background: '#E7F7EF', color: '#1E8F5F' } : { background: '#FDECE8', color: '#D9482F' }}>{children}</span>
  )
  const Row = ({ i, children }: { i: number; children: React.ReactNode }) => (
    <div className="flex items-center gap-3 px-4 md:px-5 py-2.5" style={{ borderTop: i ? '1px solid var(--track)' : '1px solid var(--line)' }}>{children}</div>
  )

  return (
    <div className="flex flex-col gap-3.5 md:gap-4">
      <Section icon={Sparkles} title="Your portfolio at a glance">
        <div className="flex flex-col gap-2.5">
          {insights.map((ins, i) => (
            <div key={i} className="flex items-start gap-2.5">
              <span className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: ins.bg, color: ins.c }}><ins.icon size={14} /></span>
              <span className="text-[13px] leading-snug pt-1" style={{ color: 'var(--text2)' }}>{ins.text}</span>
            </div>
          ))}
        </div>
      </Section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5 md:gap-4">
        <Section icon={PieIcon} title="Allocation by category" note="Category is inferred from each fund's name and type.">
          <div className="flex items-center gap-4">
            <Donut segments={byCap.map(c => ({ value: c.value, color: c.color }))} size={104} label={`By category: ${byCap.map(c => `${c.cap} ${c.pct.toFixed(0)}%`).join(', ')}`}>
              <div className="text-[10.5px]" style={{ color: 'var(--text3)' }}>Funds</div>
              <div className="text-[14px] font-bold" style={{ color: 'var(--text)' }}>{abbr(totalCurrent, sym)}</div>
            </Donut>
            <div className="flex-1 min-w-0 flex flex-col gap-2">
              {byCap.map(c => (
                <div key={c.cap}>
                  <div className="flex items-center justify-between gap-2 text-[12.5px] mb-1">
                    <span className="font-semibold truncate" style={{ color: 'var(--text)' }}>{c.cap}</span>
                    <span className="tabular-nums whitespace-nowrap" style={{ color: 'var(--text3)' }}>{c.pct.toFixed(0)}%</span>
                  </div>
                  <div className="h-1.5 rounded-full" style={{ background: 'var(--track)' }}><div className="h-full rounded-full wl-grow" style={{ width: `${c.pct}%`, background: c.color }} /></div>
                </div>
              ))}
            </div>
          </div>
        </Section>

        <Section icon={Layers} title="Equity, debt, gold and hybrid">
          <div className="flex h-3 rounded-full overflow-hidden gap-[2px] mb-3.5" style={{ background: 'var(--track)' }}>
            {byAsset.map(a => <div key={a.asset} style={{ width: `${a.pct}%`, background: a.color }} title={`${a.asset} ${a.pct.toFixed(0)}%`} />)}
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            {byAsset.map(a => (
              <div key={a.asset} className="rounded-xl px-3.5 py-2.5" style={{ background: '#FAFAFE', border: '1px solid var(--line)' }}>
                <div className="flex items-center gap-1.5 text-[12px] font-medium" style={{ color: 'var(--text3)' }}><i className="w-2 h-2 rounded-full" style={{ background: a.color }} />{a.asset}</div>
                <div className="text-[18px] font-bold tabular-nums mt-0.5" style={{ color: 'var(--text)' }}>{a.pct.toFixed(0)}%</div>
                <div className="text-[11.5px] tabular-nums" style={{ color: 'var(--text4)' }}>{abbr(a.value, sym)}</div>
              </div>
            ))}
          </div>
        </Section>
      </div>

      <Section icon={TrendingUp} title="Returns vs benchmark" note="Benchmark is a typical category return (a WealthLens estimate), not an index feed.">
        <div className="grid grid-cols-3 gap-2.5 mb-3">
          <Stat label={overallXirr != null ? 'Your XIRR' : 'Your return'} value={`${xirrShown >= 0 ? '+' : ''}${xirrShown.toFixed(1)}%`} color={xirrShown >= 0 ? '#16A34A' : '#DC2626'} />
          <Stat label="Benchmark" value={`~${blendedBench.toFixed(1)}%`} />
          <Stat label={beatsBench >= 0 ? 'Ahead by' : 'Behind by'} value={`${beatsBench >= 0 ? '+' : ''}${beatsBench.toFixed(1)}%`} color={beatsBench >= 0 ? '#16A34A' : '#DC2626'} />
        </div>
        {nifty && (
          <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5 rounded-xl mb-3" style={{ background: 'var(--accent-bg)', border: '1px solid var(--accent-border)' }}>
            <span className="text-[12.5px]" style={{ color: 'var(--accent2)' }}>Nifty 50 over the same period: <b>{nifty.cagr >= 0 ? '+' : ''}{nifty.cagr.toFixed(1)}% a year</b></span>
            {(() => { const d = xirrShown - nifty.cagr; return <Pill ok={d >= 0}>{d >= 0 ? `Ahead by ${d.toFixed(1)}%` : `Behind by ${Math.abs(d).toFixed(1)}%`}</Pill> })()}
          </div>
        )}
        <div className="-mx-4 md:-mx-5 -mb-1">
          {rows.filter(r => r.retPct != null).sort((a, b) => (b.retPct ?? 0) - (a.retPct ?? 0)).map((r, i) => {
            const diff = (r.retPct ?? 0) - (BENCH[r.f.fund_type] ?? 10)
            return (
              <Row key={r.f.id} i={i}>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-semibold truncate" style={{ color: 'var(--text)' }}>{r.f.fund_name}</div>
                  <div className="text-[11.5px]" style={{ color: 'var(--text3)' }}>{r.cap} · benchmark ~{BENCH[r.f.fund_type] ?? 10}%</div>
                </div>
                <div className="text-right flex-shrink-0 flex flex-col items-end gap-0.5">
                  <span className="text-[13px] font-semibold tabular-nums" style={{ color: (r.retPct ?? 0) >= 0 ? '#16A34A' : '#DC2626' }}>{(r.retPct ?? 0) >= 0 ? '+' : ''}{(r.retPct ?? 0).toFixed(1)}%</span>
                  <Pill ok={diff >= 0}>{diff >= 0 ? '+' : ''}{diff.toFixed(1)}% vs bench</Pill>
                </div>
              </Row>
            )
          })}
        </div>
      </Section>

      <Section icon={Receipt} title="Tax if you redeem today" note="Estimate using current rules: equity LTCG 12.5% above ₹1.25L, STCG 20%; debt and gold at your slab (assumed 30%). Hybrid treated as equity; holding period from your earliest purchase. Not tax advice.">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 mb-3">
          <Stat label="Estimated tax" value={abbr(tax.total, sym)} color="#DC2626" />
          <Stat label="Equity LTCG tax" value={abbr(tax.eqLTCGtax, sym)} note="12.5% over ₹1.25L" />
          <Stat label="Equity STCG tax" value={abbr(tax.eqSTCGtax, sym)} note="20%" />
          <Stat label="Net in hand" value={abbr(tax.net, sym)} color="#16A34A" note="after tax and exit load" />
        </div>
        <div className="-mx-4 md:-mx-5 -mb-1">
          {rows.map((r, i) => {
            const hm = monthsSince(r.firstBuy)
            const eqTaxed = r.asset === 'Equity' || r.asset === 'Hybrid'
            const term = !eqTaxed ? 'Debt (slab)' : hm >= 12 ? 'Long term' : 'Short term'
            return (
              <Row key={r.f.id} i={i}>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-semibold truncate" style={{ color: 'var(--text)' }}>{r.f.fund_name}</div>
                  <div className="text-[11.5px] flex items-center gap-1.5 mt-0.5" style={{ color: 'var(--text3)' }}>
                    held {hm >= 12 ? `${Math.floor(hm / 12)}y ${hm % 12}m` : `${hm}m`}
                    <Pill ok={term === 'Long term' ? true : term === 'Short term' ? false : null}>{term}</Pill>
                  </div>
                </div>
                <div className="text-[13px] font-semibold tabular-nums flex-shrink-0" style={{ color: r.gain >= 0 ? '#16A34A' : '#DC2626' }}>{r.gain >= 0 ? '+' : '−'}{abbr(Math.abs(r.gain), sym)}</div>
              </Row>
            )
          })}
        </div>
      </Section>

      {elss.length > 0 && (
        <Section icon={Lock} title="ELSS lock-in (3 years)" note="Each ELSS investment is locked for 3 years from its purchase date.">
          <div className="-mx-4 md:-mx-5 -mb-1">
            {elss.map((e, i) => (
              <Row key={i} i={i}>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-semibold truncate" style={{ color: 'var(--text)' }}>{e.name}</div>
                  <div className="text-[11.5px]" style={{ color: 'var(--text3)' }}>{e.lockedAmt > 0 ? `${abbr(e.lockedAmt, sym)} locked` : 'Fully unlocked'}</div>
                </div>
                {e.lockedAmt > 0 && e.unlock
                  ? <div className="text-right"><div className="text-[11px]" style={{ color: 'var(--text4)' }}>unlocks by</div><div className="text-[13px] font-semibold" style={{ color: '#B96A0B' }}>{e.unlock.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}</div></div>
                  : <Pill ok>Free to redeem</Pill>}
              </Row>
            ))}
          </div>
        </Section>
      )}
    </div>
  )
}
