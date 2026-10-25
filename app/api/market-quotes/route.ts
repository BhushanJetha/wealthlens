import { NextRequest, NextResponse } from 'next/server'

// Latest price + day change for the market ticker (indices, gold, AED/INR)
// and, optionally, the user's stock symbols (?symbols=INFY,TCS.NS).
// Yahoo chart meta, cached 10 minutes per symbol.

const INDICES = [
  { symbol: '^NSEI',    label: 'Nifty 50' },
  { symbol: '^BSESN',   label: 'Sensex' },
  { symbol: '^NSEBANK', label: 'Bank Nifty' },
  { symbol: 'GC=F',     label: 'Gold (USD/oz)' },
  { symbol: 'AEDINR=X', label: 'AED → INR' },
]

interface Quote { symbol: string; label: string; price: number; change: number; changePct: number; currency: string }

const CACHE = new Map<string, { q: Quote | null; ts: number }>()
const TTL = 10 * 60 * 1000

async function quote(symbol: string, label: string): Promise<Quote | null> {
  const hit = CACHE.get(symbol)
  if (hit && Date.now() - hit.ts < TTL) return hit.q ? { ...hit.q, label } : null
  let q: Quote | null = null
  for (const host of ['query1', 'query2']) {
    try {
      const url = `https://${host}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`
      const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(6000) })
      if (!res.ok) continue
      const meta = (await res.json())?.chart?.result?.[0]?.meta
      // range=1d: chartPreviousClose is the previous trading day's close (a day change)
      const price = Number(meta?.regularMarketPrice), prev = Number(meta?.chartPreviousClose ?? meta?.previousClose)
      if (!price || !prev) continue
      q = { symbol, label, price, change: price - prev, changePct: (price - prev) / prev * 100, currency: String(meta.currency ?? '') }
      break
    } catch { continue }
  }
  CACHE.set(symbol, { q, ts: Date.now() })
  return q
}

// Holdings symbols: keep exchange suffixes, default bare symbols to NSE
const toTicker = (s: string) => /[.=^]/.test(s) ? s : `${s}.NS`

export async function GET(req: NextRequest) {
  const raw = (req.nextUrl.searchParams.get('symbols') ?? '').split(',').map(s => s.trim().toUpperCase()).filter(s => /^[A-Z0-9.&^=-]{1,20}$/.test(s)).slice(0, 15)
  const [indices, holdings] = await Promise.all([
    Promise.all(INDICES.map(i => quote(i.symbol, i.label))),
    Promise.all(raw.map(s => quote(toTicker(s), s.replace(/\.(NS|BO)$/, '')))),
  ])
  return NextResponse.json({
    indices: indices.filter(Boolean),
    holdings: holdings.filter(Boolean),
  })
}
