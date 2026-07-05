'use client'
import { useState, useEffect } from 'react'
import { ArrowLeftRight, RefreshCw, Target, TrendingUp, TrendingDown, Loader2 } from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, ReferenceLine } from 'recharts'

interface FxData { series: { date: string; rate: number }[]; current: number; avg: number; min: number; max: number; live: boolean }

export default function FxOptimizerClient() {
  const [data, setData] = useState<FxData | null>(null)
  const [loading, setLoading] = useState(true)
  const [amount, setAmount] = useState('10000')
  const [target, setTarget] = useState('')

  useEffect(() => { try { const t = localStorage.getItem('fx.target'); if (t) setTarget(t) } catch {} }, [])
  function saveTarget(v: string) { setTarget(v); try { localStorage.setItem('fx.target', v) } catch {} }

  async function load() {
    setLoading(true)
    try { const r = await fetch('/api/fx-history'); setData(await r.json()) }
    catch { setData(null) } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  const cur = data?.current ?? 0
  const avg = data?.avg ?? 0
  const min = data?.min ?? 0
  const max = data?.max ?? 0
  const range = max - min
  const pctile = range > 0 ? Math.round(((cur - min) / range) * 100) : 50
  const vsAvg = avg > 0 ? Math.round((cur - avg) / avg * 1000) / 10 : 0
  const good = cur >= avg
  const aed = Number(amount) || 0
  const tgt = Number(target) || 0
  const inrNow = Math.round(aed * cur)
  const gapToTarget = tgt > 0 ? Math.round((tgt - cur) * 10000) / 10000 : null
  const targetHit = tgt > 0 && cur >= tgt

  const money = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`

  return (
    <div className="space-y-5 animate-fade-up">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2" style={{ color: 'var(--text)' }}>
            <ArrowLeftRight size={20} style={{ color: 'var(--sage)' }} /> Remittance / FX Optimizer
          </h1>
          <p className="text-[12px] mt-0.5" style={{ color: 'var(--text3)' }}>
            AED → INR · is now a good time to send money home?
          </p>
        </div>
        <button onClick={load} disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold border disabled:opacity-50"
          style={{ borderColor: 'var(--border)', color: 'var(--sage)', background: 'var(--sage-bg)' }}>
          {loading ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} Refresh
        </button>
      </div>

      {loading && !data ? (
        <div className="wl-card py-16 text-center text-[13px]" style={{ color: 'var(--text3)' }}>
          <Loader2 size={20} className="animate-spin mx-auto mb-2" /> Fetching 90-day rate history…
        </div>
      ) : !data || !data.series.length ? (
        <div className="wl-card py-16 text-center text-[13px]" style={{ borderStyle: 'dashed', color: 'var(--text3)' }}>
          Couldn’t load rate history right now. Try Refresh in a moment.
        </div>
      ) : (
        <>
          {/* Signal hero */}
          <div className="wl-card p-5" style={{ borderTop: `3px solid ${good ? 'var(--income)' : 'var(--gold)'}` }}>
            <div className="flex items-end justify-between flex-wrap gap-4">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--text3)' }}>Current AED → INR</div>
                <div className="text-[34px] leading-none font-black font-mono" style={{ color: 'var(--text)' }}>₹{cur.toFixed(3)}</div>
                <div className="flex items-center gap-1.5 mt-2 text-[12px] font-semibold" style={{ color: good ? 'var(--income)' : 'var(--gold)' }}>
                  {good ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                  {vsAvg >= 0 ? '+' : ''}{vsAvg}% vs 90-day avg (₹{avg.toFixed(3)})
                </div>
              </div>
              <div className={`rounded-xl px-4 py-3 text-center max-w-[240px]`}
                style={{ background: good ? 'var(--income-bg)' : '#FFFBEB', border: `1px solid ${good ? 'var(--income)' : 'var(--gold)'}40` }}>
                <div className="text-[13px] font-black" style={{ color: good ? 'var(--income)' : 'var(--gold)' }}>
                  {good ? '✅ Good time to send' : '⏳ Below average — consider waiting'}
                </div>
                <div className="text-[10px] mt-1" style={{ color: 'var(--text3)' }}>
                  Rate is at the <strong>{pctile}th percentile</strong> of the last 90 days
                </div>
              </div>
            </div>
            {/* Range bar */}
            <div className="mt-4">
              <div className="relative h-2 rounded-full" style={{ background: 'linear-gradient(90deg, var(--rose) 0%, var(--gold) 50%, var(--income) 100%)', opacity: 0.35 }} />
              <div className="relative h-0">
                <div className="absolute -top-3 w-3 h-3 rounded-full border-2 border-white shadow"
                  style={{ left: `calc(${pctile}% - 6px)`, background: good ? 'var(--income)' : 'var(--gold)' }} />
              </div>
              <div className="flex justify-between text-[9px] mt-2" style={{ color: 'var(--text3)' }}>
                <span>90d low ₹{min.toFixed(3)}</span><span>avg ₹{avg.toFixed(3)}</span><span>90d high ₹{max.toFixed(3)}</span>
              </div>
            </div>
          </div>

          {/* Chart */}
          <div className="wl-card p-4">
            <div className="text-[11px] font-bold uppercase tracking-wider mb-3" style={{ color: 'var(--text3)' }}>AED → INR · last 90 days</div>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={data.series} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="date" tick={{ fill: 'var(--text3)', fontSize: 9 }} axisLine={false} tickLine={false}
                  tickFormatter={(d: string) => d.slice(5)} />
                <YAxis domain={['dataMin - 0.1', 'dataMax + 0.1']} tick={{ fill: 'var(--text3)', fontSize: 10 }}
                  axisLine={false} tickLine={false} width={46} tickFormatter={(v: number) => v.toFixed(2)} />
                <ReferenceLine y={avg} stroke="var(--text3)" strokeDasharray="4 4"
                  label={{ value: 'avg', position: 'right', fill: 'var(--text3)', fontSize: 9 }} />
                {tgt > 0 && <ReferenceLine y={tgt} stroke="var(--sage)" strokeDasharray="4 4"
                  label={{ value: 'target', position: 'right', fill: 'var(--sage)', fontSize: 9 }} />}
                <Tooltip contentStyle={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 8, fontSize: 11 }}
                  formatter={(v: any) => [`₹${Number(v).toFixed(3)}`, 'AED→INR']} />
                <Line type="monotone" dataKey="rate" stroke={good ? 'var(--income)' : 'var(--gold)'} strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Target + converter */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="wl-card p-4">
              <div className="text-[13px] font-bold flex items-center gap-2 mb-3" style={{ color: 'var(--text)' }}>
                <Target size={15} style={{ color: 'var(--sage)' }} /> Target rate alert
              </div>
              <label className="block text-[10px] uppercase tracking-wider font-semibold mb-1" style={{ color: 'var(--text3)' }}>Send when AED → INR reaches</label>
              <input type="number" step="0.01" value={target} onChange={e => saveTarget(e.target.value)} placeholder="e.g. 23.20"
                className="wl-input" style={{ background: 'var(--bg2)', border: '1px solid var(--border)', color: 'var(--text)' }} />
              {tgt > 0 && (
                <div className="mt-3 rounded-xl p-3 text-center"
                  style={{ background: targetHit ? 'var(--income-bg)' : 'var(--bg2)', border: `1px solid ${targetHit ? 'var(--income)' : 'var(--border)'}` }}>
                  {targetHit
                    ? <div className="text-[13px] font-bold" style={{ color: 'var(--income)' }}>🎯 Target reached — send now!</div>
                    : <div className="text-[12px]" style={{ color: 'var(--text)' }}>
                        <span className="font-mono font-bold">₹{Math.abs(gapToTarget!).toFixed(3)}</span> to go
                        <span style={{ color: 'var(--text3)' }}> (current ₹{cur.toFixed(3)})</span>
                      </div>}
                </div>
              )}
              <div className="mt-2 text-[10px]" style={{ color: 'var(--text3)' }}>
                Saved on this device. Check back or hit Refresh — the app flags when the rate crosses your target.
              </div>
            </div>

            <div className="wl-card p-4">
              <div className="text-[13px] font-bold flex items-center gap-2 mb-3" style={{ color: 'var(--text)' }}>
                <ArrowLeftRight size={15} style={{ color: 'var(--blue)' }} /> How much you’d receive
              </div>
              <label className="block text-[10px] uppercase tracking-wider font-semibold mb-1" style={{ color: 'var(--text3)' }}>Send amount (AED)</label>
              <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="10000"
                className="wl-input font-mono" style={{ background: 'var(--bg2)', border: '1px solid var(--border)', color: 'var(--text)' }} />
              <div className="grid grid-cols-3 gap-2 mt-3 text-center">
                <div className="rounded-lg p-2" style={{ background: 'var(--bg2)' }}>
                  <div className="text-[9px] uppercase" style={{ color: 'var(--text3)' }}>At now</div>
                  <div className="text-[13px] font-bold font-mono" style={{ color: 'var(--text)' }}>{money(inrNow)}</div>
                </div>
                <div className="rounded-lg p-2" style={{ background: 'var(--bg2)' }}>
                  <div className="text-[9px] uppercase" style={{ color: 'var(--text3)' }}>At avg</div>
                  <div className="text-[13px] font-bold font-mono" style={{ color: 'var(--text3)' }}>{money(aed * avg)}</div>
                </div>
                <div className="rounded-lg p-2" style={{ background: tgt > 0 ? 'var(--sage-bg)' : 'var(--bg2)' }}>
                  <div className="text-[9px] uppercase" style={{ color: 'var(--text3)' }}>At target</div>
                  <div className="text-[13px] font-bold font-mono" style={{ color: tgt > 0 ? 'var(--sage)' : 'var(--text3)' }}>{tgt > 0 ? money(aed * tgt) : '—'}</div>
                </div>
              </div>
              {tgt > 0 && aed > 0 && (
                <div className="mt-2 text-[10px] text-center" style={{ color: 'var(--text3)' }}>
                  Waiting for your target would earn <strong style={{ color: 'var(--income)' }}>{money(Math.max(0, aed * tgt - inrNow))}</strong> more on this transfer.
                </div>
              )}
            </div>
          </div>

          <div className="text-[10px]" style={{ color: 'var(--text3)' }}>
            Indicative mid-market rates (fawazahmed0 currency API){data.live ? '' : ' · using fallback'}. Your bank/remittance provider’s rate will differ — compare before sending.
          </div>
        </>
      )}
    </div>
  )
}
