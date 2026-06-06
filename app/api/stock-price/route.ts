import { NextRequest, NextResponse } from 'next/server'

const CACHE = new Map<string, { data: Record<string, unknown>; ts: number }>()

function isMarketOpen(): boolean {
  const now = new Date()
  const ist = new Date(now.getTime() + 5.5 * 60 * 60 * 1000)
  const day  = ist.getUTCDay()
  if (day === 0 || day === 6) return false
  const mins = ist.getUTCHours() * 60 + ist.getUTCMinutes()
  return mins >= 9 * 60 + 15 && mins <= 15 * 60 + 30
}

export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get('symbol')
  if (!symbol) return NextResponse.json({ error: 'symbol required' }, { status: 400 })

  const TTL = isMarketOpen() ? 5 * 60 * 1000 : 60 * 60 * 1000

  const hit = CACHE.get(symbol)
  if (hit && Date.now() - hit.ts < TTL) return NextResponse.json(hit.data)

  // Try the symbol as-is (indices / pre-suffixed), then NSE, then BSE
  const tickers = symbol.startsWith('^') || symbol.includes('.')
    ? [symbol]
    : [`${symbol}.NS`, `${symbol}.BO`]

  for (const ticker of tickers) {
    for (const host of ['query1', 'query2']) {
      try {
        const url = `https://${host}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1m&range=1d`
        const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(6000) })
        if (!res.ok) continue
        const json = await res.json()
        const meta = json?.chart?.result?.[0]?.meta
        if (!meta?.regularMarketPrice) continue
        const data = {
          symbol:        ticker,
          price:         meta.regularMarketPrice as number,
          previousClose: meta.previousClose      as number,
          currency:      meta.currency           as string,
          marketState:   meta.marketState        as string,
          change:        (meta.regularMarketPrice - meta.previousClose) as number,
          changePct:     ((meta.regularMarketPrice - meta.previousClose) / meta.previousClose * 100) as number,
        }
        CACHE.set(symbol, { data, ts: Date.now() })
        return NextResponse.json(data)
      } catch { continue }
    }
  }

  const stale = CACHE.get(symbol)
  if (stale) return NextResponse.json({ ...stale.data, stale: true })
  return NextResponse.json({ error: 'Price unavailable', symbol }, { status: 503 })
}
