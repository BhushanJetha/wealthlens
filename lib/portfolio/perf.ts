// Live performance for the portfolio review (server side): each fund's 1- and
// 3-year return from its NAV history (mfapi.in, needs the fund's scheme code),
// shares and ETFs from Yahoo Finance, and the index each is measured against.
// Cached 6 hours. Anything that can't be fetched is left out — the review
// then says there's no history to compare, rather than guessing.
import type { PHolding } from './holdings'
import type { Perf } from './advice'

type Pt = { t: number; c: number }
const UA = { 'User-Agent': 'Mozilla/5.0' }
const YEAR = 365.25 * 864e5
const cache = { next: { revalidate: 21600 } } as RequestInit

async function yahoo(symbol: string): Promise<Pt[] | null> {
  for (const host of ['query1', 'query2']) {
    try {
      const res = await fetch(`https://${host}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1wk&range=5y`, { headers: UA, signal: AbortSignal.timeout(8000), ...cache })
      if (!res.ok) continue
      const r = (await res.json())?.chart?.result?.[0]
      const ts: number[] = r?.timestamp ?? [], cs: (number | null)[] = r?.indicators?.quote?.[0]?.close ?? []
      const pts = ts.map((t, i) => ({ t: t * 1000, c: cs[i] as number })).filter(p => p.c > 0)
      if (pts.length > 10) return pts
    } catch { continue }
  }
  return null
}
async function mfapi(code: number | string): Promise<Pt[] | null> {
  try {
    const res = await fetch(`https://api.mfapi.in/mf/${code}`, { signal: AbortSignal.timeout(10000), ...cache })
    if (!res.ok) return null
    const rows: { date: string; nav: string }[] = (await res.json())?.data ?? []
    const pts = rows.map(r => { const [d, m, y] = r.date.split('-').map(Number); return { t: Date.UTC(y, m - 1, d), c: Number(r.nav) } }).filter(p => p.c > 0).sort((a, b) => a.t - b.t)
    return pts.length > 10 ? pts : null
  } catch { return null }
}
// Yearly return over the last 1 and 3 years (3 only if the history is long enough)
export function returnsOf(pts: Pt[], now = Date.now()): { r1y: number | null; r3y: number | null } {
  const last = pts[pts.length - 1]
  const at = (ago: number) => { const want = now - ago; if (pts[0].t > want + 20 * 864e5) return null; return pts.reduce((best, p) => (Math.abs(p.t - want) < Math.abs(best.t - want) ? p : best), pts[0]) }
  const one = at(YEAR), three = at(3 * YEAR)
  return {
    r1y: one ? (last.c / one.c - 1) * 100 : null,
    r3y: three ? (Math.pow(last.c / three.c, YEAR / (last.t - three.t)) - 1) * 100 : null,
  }
}

const BENCH = { nifty50: { symbol: '^NSEI', name: 'Nifty 50' }, nifty500: { symbol: '^CRSLDX', name: 'Nifty 500' }, sp500: { symbol: '^GSPC', name: 'S&P 500' } } as const
type BenchKey = keyof typeof BENCH
function benchFor(h: PHolding): BenchKey | null {
  if (h.mix.equity < 0.5) return null
  const n = h.name.toLowerCase()
  if (/nasdaq|s&p|us |global|international|world|overseas/.test(n) || h.currency === 'AED') return 'sp500'
  if (h.type === 'mf' && /mid|small|flexi|multi|focused|value|contra/.test(n)) return 'nifty500'
  return 'nifty50'
}
const tickers = (s: string) => (s.includes('.') || s.startsWith('^') ? [s] : [`${s}.NS`, `${s}.BO`])

export async function portfolioPerf(hs: PHolding[]): Promise<Record<string, Perf>> {
  const want = Array.from(new Set(hs.map(benchFor).filter(Boolean))) as BenchKey[]
  const benches: Partial<Record<BenchKey, { name: string; r1y: number | null; r3y: number | null }>> = {}
  await Promise.all(want.map(async k => { const pts = await yahoo(BENCH[k].symbol); if (pts) benches[k] = { name: BENCH[k].name, ...returnsOf(pts) } }))
  if (!benches.nifty500 && benches.nifty50 === undefined && want.includes('nifty500')) { const pts = await yahoo(BENCH.nifty50.symbol); if (pts) benches.nifty50 = { name: BENCH.nifty50.name, ...returnsOf(pts) } }
  const benchOf = (h: PHolding) => { const k = benchFor(h); return k ? benches[k] ?? (k === 'nifty500' ? benches.nifty50 : undefined) : undefined }

  const out: Record<string, Perf> = {}
  await Promise.all(hs.map(async h => {
    let pts: Pt[] | null = null
    if (h.type === 'mf' && h.raw?.scheme_code) pts = await mfapi(h.raw.scheme_code)
    else if ((h.type === 'stock' || h.type === 'etf') && h.raw?.symbol) for (const t of tickers(String(h.raw.symbol).trim().toUpperCase())) { pts = await yahoo(t); if (pts) break }
    else if (h.type === 'other' && h.raw?.symbol) pts = await yahoo(String(h.raw.symbol).trim().toUpperCase())
    if (!pts) return
    out[h.key] = { ...returnsOf(pts), bench: benchOf(h) }
  }))
  return out
}
