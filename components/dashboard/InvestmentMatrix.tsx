'use client'
import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

export interface MatrixTxn { txn_date: string; txn_type: string; amount: number }
export interface MatrixAsset { id: string; name: string; invested: number; currentValue: number }

interface Props {
  assets:      MatrixAsset[]
  txnsByAsset: Record<string, MatrixTxn[]>
  currency?:   string
}

const INFLOW  = new Set(['purchase', 'sip', 'switch_in'])
const OUTFLOW = new Set(['redemption', 'switch_out'])
const MONTHS  = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const net = (t: MatrixTxn) => OUTFLOW.has(t.txn_type) ? -t.amount : INFLOW.has(t.txn_type) ? t.amount : 0

function abbr(n: number, sym: string) {
  const a = Math.abs(n)
  if (a >= 1e7) return `${sym}${(n / 1e7).toFixed(2)}Cr`
  if (a >= 1e5) return `${sym}${(n / 1e5).toFixed(2)}L`
  if (a >= 1e3) return `${sym}${(n / 1e3).toFixed(1)}K`
  return `${sym}${Math.round(n).toLocaleString('en-IN')}`
}

export default function InvestmentMatrix({ assets, txnsByAsset, currency = 'INR' }: Props) {
  const sym = currency === 'AED' ? 'AED ' : '₹'
  const [selected, setSelected] = useState<string | null>(null)

  // ── Yearly matrix (assets × years) ────────────────────────────────────
  const yearly = useMemo(() => {
    const yearsSet = new Set<string>()
    const perAsset: Record<string, Record<string, number>> = {}
    for (const a of assets) {
      perAsset[a.id] = {}
      for (const t of txnsByAsset[a.id] ?? []) {
        const y = t.txn_date.slice(0, 4)
        yearsSet.add(y)
        perAsset[a.id][y] = (perAsset[a.id][y] ?? 0) + net(t)
      }
    }
    const years = Array.from(yearsSet).sort()
    const totalsByYear: Record<string, number> = {}
    years.forEach(y => { totalsByYear[y] = assets.reduce((s, a) => s + (perAsset[a.id][y] ?? 0), 0) })
    // Invested per asset from its own year cells, so each row's cells add up to its Invested column
    const perAssetInvested: Record<string, number> = {}
    assets.forEach(a => { perAssetInvested[a.id] = years.reduce((s, y) => s + (perAsset[a.id][y] ?? 0), 0) })
    return { years, perAsset, totalsByYear, perAssetInvested }
  }, [assets, txnsByAsset])

  // Use the transaction-derived invested (so year cells reconcile); fall back to holding cost
  const investedOf = (a: MatrixAsset) => yearly.perAssetInvested[a.id] > 0 ? yearly.perAssetInvested[a.id] : a.invested
  const totalInvested = assets.reduce((s, a) => s + investedOf(a), 0)
  const totalCurrent  = assets.reduce((s, a) => s + a.currentValue, 0)

  const ret = (inv: number, cur: number) => inv > 0 ? ((cur - inv) / inv) * 100 : 0
  const retColor = (v: number) => (v >= 0 ? 'var(--income)' : 'var(--rose)')

  const cell = (v: number) => v === 0
    ? <span style={{ color: 'var(--text3)' }}>–</span>
    : <span style={{ color: v < 0 ? 'var(--rose)' : 'var(--text)' }}>{abbr(v, sym)}</span>

  // ── Monthly view for a selected asset (years × months) ────────────────
  const monthly = useMemo(() => {
    if (!selected) return null
    const txns = txnsByAsset[selected] ?? []
    const yearsSet = new Set<string>()
    const grid: Record<string, number[]> = {}     // year -> [12 months]
    for (const t of txns) {
      const y = t.txn_date.slice(0, 4)
      const m = parseInt(t.txn_date.slice(5, 7)) - 1
      yearsSet.add(y)
      ;(grid[y] ||= new Array(12).fill(0))[m] += net(t)
    }
    return { years: Array.from(yearsSet).sort(), grid }
  }, [selected, txnsByAsset])

  const thBase: React.CSSProperties = { color: 'var(--text4)', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }

  // ════════════════════════════════════════════════════════════════════
  // MONTHLY (drill-down)
  // ════════════════════════════════════════════════════════════════════
  if (selected) {
    const asset = assets.find(a => a.id === selected)
    const m = monthly!
    return (
      <div className="space-y-3">
        <button onClick={() => setSelected(null)}
          className="flex items-center gap-1 text-[13px] font-semibold" style={{ color: 'var(--accent)' }}>
          <ChevronLeft size={14} /> All investments
        </button>
        <div className="flex items-baseline gap-3 flex-wrap">
          <div className="text-[14px] font-bold" style={{ color: 'var(--text)' }}>{asset?.name}</div>
          {asset && (
            <div className="text-[11px]" style={{ color: 'var(--text3)' }}>
              Invested <strong style={{ color: 'var(--text)' }}>{abbr(asset.invested, sym)}</strong> ·
              Current <strong style={{ color: retColor(asset.currentValue - asset.invested) }}> {abbr(asset.currentValue, sym)}</strong> ·
              <strong style={{ color: retColor(asset.currentValue - asset.invested) }}> {ret(asset.invested, asset.currentValue) >= 0 ? '+' : ''}{ret(asset.invested, asset.currentValue).toFixed(1)}%</strong>
            </div>
          )}
        </div>
        {m.years.length === 0 ? (
          <div className="text-[12.5px] py-5 text-center rounded-xl" style={{ color: 'var(--text3)', background: '#FAFAFE', border: '1.5px dashed var(--border2)' }}>No dated history for this holding yet.</div>
        ) : (<>
          <div className="md:hidden rounded-2xl overflow-hidden" style={{ background: '#fff', border: '1px solid var(--line)' }}>
            {m.years.map((y, yi) => {
              const row = m.grid[y]
              const total = row.reduce((s, v) => s + v, 0)
              const prev = yi > 0 ? m.grid[m.years[yi - 1]].reduce((s, v) => s + v, 0) : null
              const yoy = prev && prev !== 0 ? ((total - prev) / Math.abs(prev)) * 100 : null
              return (
                <div key={y} className="px-4 py-3" style={{ borderTop: yi ? '1px solid var(--track)' : undefined }}>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-[14px] font-semibold" style={{ color: 'var(--text)' }}>{y}{yoy != null && <span className="ml-2 text-[12px] font-semibold" style={{ color: retColor(yoy) }}>{yoy >= 0 ? '+' : ''}{yoy.toFixed(0)}%</span>}</span>
                    <span className="text-[14px] font-bold tabular-nums" style={{ color: 'var(--text)' }}>{abbr(total, sym)}</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {row.map((v, mi) => v !== 0 && (
                      <span key={mi} className="rounded-full px-2 py-0.5 text-[11.5px] tabular-nums" style={{ background: 'var(--accent-bg)', color: v < 0 ? '#DC2626' : 'var(--accent2)' }}>{MONTHS[mi]} {abbr(v, sym)}</span>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
          <div className="hidden md:block overflow-x-auto rounded-xl border" style={{ borderColor: 'var(--line)' }}>
            <table className="w-full text-[12px]" style={{ borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#FAFAFE' }}>
                  <th className="px-3 py-2 text-left sticky left-0" style={{ ...thBase, background: '#FAFAFE' }}>Year</th>
                  {MONTHS.map(mo => <th key={mo} className="px-2 py-2 text-right" style={thBase}>{mo}</th>)}
                  <th className="px-3 py-2 text-right" style={thBase}>Total</th>
                </tr>
              </thead>
              <tbody>
                {m.years.map((y, yi) => {
                  const row = m.grid[y]
                  const rowTotal = row.reduce((s, v) => s + v, 0)
                  const prevTotal = yi > 0 ? m.grid[m.years[yi - 1]].reduce((s, v) => s + v, 0) : null
                  const yoy = prevTotal && prevTotal !== 0 ? ((rowTotal - prevTotal) / Math.abs(prevTotal)) * 100 : null
                  return (
                    <tr key={y} style={{ borderTop: '1px solid var(--line)' }}>
                      <td className="px-3 py-2 font-bold sticky left-0" style={{ color: 'var(--text)', background: 'var(--card)' }}>
                        {y}{yoy != null && <span className="ml-1.5 text-[9px] tabular-nums" style={{ color: retColor(yoy) }}>{yoy >= 0 ? '+' : ''}{yoy.toFixed(0)}%</span>}
                      </td>
                      {row.map((v, mi) => <td key={mi} className="px-2 py-2 text-right tabular-nums">{cell(v)}</td>)}
                      <td className="px-3 py-2 text-right tabular-nums font-bold" style={{ color: 'var(--text)' }}>{abbr(rowTotal, sym)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>)}
        <div className="text-[11.5px]" style={{ color: 'var(--text4)' }}>Net amount invested each month. The % next to a year is the change on the year before.</div>
      </div>
    )
  }

  // ════════════════════════════════════════════════════════════════════
  // YEARLY (overview)
  // ════════════════════════════════════════════════════════════════════
  return (
    <div className="space-y-3">
      <div className="md:hidden rounded-2xl overflow-hidden" style={{ background: '#fff', border: '1px solid var(--line)' }}>
        {assets.map((a, i) => {
          const inv = investedOf(a)
          const r = ret(inv, a.currentValue)
          return (
            <button key={a.id} onClick={() => setSelected(a.id)} className="w-full flex items-center gap-3 px-4 py-3 text-left active:bg-[#FAFAFE]"
              style={{ borderTop: i ? '1px solid var(--track)' : undefined }}>
              <div className="flex-1 min-w-0">
                <div className="text-[13.5px] font-semibold truncate" style={{ color: 'var(--text)' }}>{a.name}</div>
                <div className="text-[11.5px] tabular-nums truncate" style={{ color: 'var(--text3)' }}>put in {abbr(inv, sym)} · now {abbr(a.currentValue, sym)}</div>
              </div>
              <span className="text-[13.5px] font-semibold tabular-nums" style={{ color: retColor(r) }}>{r >= 0 ? '+' : ''}{r.toFixed(1)}%</span>
              <ChevronRight size={16} style={{ color: 'var(--text4)' }} />
            </button>
          )
        })}
        <div className="flex items-center justify-between px-4 py-3" style={{ borderTop: '1px solid var(--line)', background: '#FAFAFE' }}>
          <span className="text-[13px] font-semibold" style={{ color: 'var(--text)' }}>Total</span>
          <span className="text-[13px] tabular-nums" style={{ color: 'var(--text3)' }}>{abbr(totalInvested, sym)} → <b style={{ color: retColor(totalCurrent - totalInvested) }}>{abbr(totalCurrent, sym)}</b></span>
        </div>
      </div>
      <div className="hidden md:block overflow-x-auto rounded-xl border" style={{ borderColor: 'var(--line)' }}>
        <table className="w-full text-[12px]" style={{ borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#FAFAFE' }}>
              <th className="px-3 py-2 text-left sticky left-0" style={{ ...thBase, background: '#FAFAFE', width: 200, minWidth: 200, zIndex: 2 }}>Investment</th>
              {yearly.years.map(y => <th key={y} className="px-2 py-2 text-right" style={thBase}>{y}</th>)}
              <th className="px-3 py-2 text-right" style={thBase}>Invested</th>
              <th className="px-3 py-2 text-right" style={thBase}>Current</th>
              <th className="px-3 py-2 text-right" style={thBase}>Return</th>
            </tr>
          </thead>
          <tbody>
            {assets.map(a => {
              const inv = investedOf(a)
              const r = ret(inv, a.currentValue)
              return (
                <tr key={a.id} className="cursor-pointer transition-colors hover:brightness-95"
                  style={{ borderTop: '1px solid var(--line)' }}
                  onClick={() => setSelected(a.id)}>
                  <td className="px-3 py-2 font-semibold sticky left-0" style={{ color: 'var(--text)', background: 'var(--card)', width: 200, maxWidth: 200, zIndex: 1 }} title={a.name}>
                    <div className="flex items-center gap-1" style={{ maxWidth: 188 }}>
                      <ChevronRight size={12} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                      <span className="truncate">{a.name}</span>
                    </div>
                  </td>
                  {yearly.years.map(y => <td key={y} className="px-2 py-2 text-right tabular-nums whitespace-nowrap">{cell(yearly.perAsset[a.id][y] ?? 0)}</td>)}
                  <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap" style={{ color: 'var(--text2)' }}>{abbr(inv, sym)}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-semibold whitespace-nowrap" style={{ color: retColor(a.currentValue - inv) }}>{abbr(a.currentValue, sym)}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-bold whitespace-nowrap" style={{ color: retColor(r) }}>{r >= 0 ? '+' : ''}{r.toFixed(1)}%</td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr style={{ borderTop: '1px solid var(--line)', background: '#FAFAFE' }}>
              <td className="px-3 py-2 font-bold sticky left-0" style={{ color: 'var(--text)', background: '#FAFAFE', width: 200, maxWidth: 200, zIndex: 1 }}>Total</td>
              {yearly.years.map((y, yi) => {
                const v = yearly.totalsByYear[y]
                const prev = yi > 0 ? yearly.totalsByYear[yearly.years[yi - 1]] : null
                const yoy = prev && prev !== 0 ? ((v - prev) / Math.abs(prev)) * 100 : null
                return (
                  <td key={y} className="px-2 py-2 text-right tabular-nums font-bold" style={{ color: 'var(--text)' }}>
                    {abbr(v, sym)}
                    {yoy != null && <div className="text-[9px] font-normal" style={{ color: retColor(yoy) }}>{yoy >= 0 ? '+' : ''}{yoy.toFixed(0)}%</div>}
                  </td>
                )
              })}
              <td className="px-3 py-2 text-right tabular-nums font-bold" style={{ color: 'var(--text)' }}>{abbr(totalInvested, sym)}</td>
              <td className="px-3 py-2 text-right tabular-nums font-bold" style={{ color: retColor(totalCurrent - totalInvested) }}>{abbr(totalCurrent, sym)}</td>
              <td className="px-3 py-2 text-right tabular-nums font-bold" style={{ color: retColor(totalCurrent - totalInvested) }}>{ret(totalInvested, totalCurrent) >= 0 ? '+' : ''}{ret(totalInvested, totalCurrent).toFixed(1)}%</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <div className="text-[11.5px]" style={{ color: 'var(--text4)' }}>
        Amount put in each year, from your imported statements. Tap an investment for its month-by-month breakdown.
      </div>
    </div>
  )
}
