import { NextRequest, NextResponse } from 'next/server'
import { tryTicker, searchSymbol, UA } from '@/lib/stockQuote'

const CACHE = new Map<string, { data: Record<string, unknown>; ts: number }>()

function isMarketOpen(): boolean {
  const now = new Date()
  const ist = new Date(now.getTime() + 5.5 * 60 * 60 * 1000)
  const day  = ist.getUTCDay()
  if (day === 0 || day === 6) return false
  const mins = ist.getUTCHours() * 60 + ist.getUTCMinutes()
  return mins >= 9 * 60 + 15 && mins <= 15 * 60 + 30
}

// Weekly closes for a price chart (history=1y|3y|5y), for the holding page
const HIST = new Map<string, { data: { date: string; price: number }[]; ts: number }>()
async function tryHistory(ticker: string, range: string): Promise<{ date: string; price: number }[] | null> {
  for (const host of ['query1', 'query2']) {
    try {
      const url = `https://${host}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1wk&range=${range}`
      const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(8000) })
      if (!res.ok) continue
      const r = (await res.json())?.chart?.result?.[0]
      const ts: number[] = r?.timestamp ?? [], close: (number | null)[] = r?.indicators?.quote?.[0]?.close ?? []
      const out = ts.map((t, i) => ({ date: new Date(t * 1000).toISOString().slice(0, 10), price: Number(close[i]) })).filter(p => p.price > 0)
      if (out.length > 4) return out
    } catch { continue }
  }
  return null
}

export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get('symbol')
  if (!symbol) return NextResponse.json({ error: 'symbol required' }, { status: 400 })

  const history = req.nextUrl.searchParams.get('history')
  if (history) {
    const range = ['1y', '3y', '5y'].includes(history) ? history : '5y'
    const key = `${symbol}:${range}`, hit = HIST.get(key)
    if (hit && Date.now() - hit.ts < 12 * 60 * 60 * 1000) return NextResponse.json({ data: hit.data })
    const tickers = symbol.startsWith('^') || symbol.includes('.') ? [symbol] : [`${symbol}.NS`, `${symbol}.BO`]
    for (const t of tickers) {
      const data = await tryHistory(t, range)
      if (data) { HIST.set(key, { data, ts: Date.now() }); return NextResponse.json({ data }) }
    }
    const resolved = await searchSymbol(symbol)
    const data = resolved ? await tryHistory(resolved, range) : null
    if (data) HIST.set(key, { data, ts: Date.now() })
    return NextResponse.json({ data: data ?? [] })
  }

  const TTL = isMarketOpen() ? 5 * 60 * 1000 : 60 * 60 * 1000
  const hit = CACHE.get(symbol)
  if (hit && Date.now() - hit.ts < TTL) return NextResponse.json(hit.data)

  // 1) Try the symbol as-is (indices / pre-suffixed), then NSE, then BSE
  // exact=1: a ticker as it is on Yahoo (AAPL, VWRA.L, BTC-USD) — no Indian suffix
  const exact = req.nextUrl.searchParams.get('exact') === '1'
  const direct = exact || symbol.startsWith('^') || symbol.includes('.')
    ? [symbol]
    : [`${symbol}.NS`, `${symbol}.BO`]

  for (const ticker of direct) {
    const data = await tryTicker(ticker)
    if (data) { CACHE.set(symbol, { data, ts: Date.now() }); return NextResponse.json(data) }
  }

  // 2) Fallback: the stored "symbol" is often a company name (e.g. "Angel One").
  //    Resolve it to a real ticker via search, then fetch that.
  if (!symbol.startsWith('^')) {
    const resolved = await searchSymbol(symbol)
    if (resolved && !direct.includes(resolved)) {
      const data = await tryTicker(resolved)
      if (data) {
        const out = { ...data, resolvedFrom: symbol }
        CACHE.set(symbol, { data: out, ts: Date.now() })
        return NextResponse.json(out)
      }
    }
  }

  const stale = CACHE.get(symbol)
  if (stale) return NextResponse.json({ ...stale.data, stale: true })
  return NextResponse.json({ error: 'Price unavailable', symbol }, { status: 503 })
}
