import { NextRequest, NextResponse } from 'next/server'

// Benchmark index return (default Nifty 50) over a period, for XIRR-vs-index.
// Pulls monthly closes from Yahoo Finance between `from` and today.
const CACHE = new Map<string, { data: Record<string, unknown>; ts: number }>()
const TTL   = 6 * 60 * 60 * 1000  // 6h

export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get('symbol') || '^NSEI'  // Nifty 50
  const from   = req.nextUrl.searchParams.get('from')               // ISO date (YYYY-MM-DD)
  if (!from) return NextResponse.json({ error: 'from required' }, { status: 400 })

  const key = `${symbol}|${from}`
  const hit = CACHE.get(key)
  if (hit && Date.now() - hit.ts < TTL) return NextResponse.json(hit.data)

  const p1 = Math.floor(new Date(from).getTime() / 1000)
  const p2 = Math.floor(Date.now() / 1000)
  if (!p1 || p1 >= p2) return NextResponse.json({ error: 'bad from date' }, { status: 400 })

  for (const host of ['query1', 'query2']) {
    try {
      const url = `https://${host}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?period1=${p1}&period2=${p2}&interval=1mo`
      const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(7000) })
      if (!res.ok) continue
      const j = await res.json()
      const r = j?.chart?.result?.[0]
      const closes: number[] = (r?.indicators?.quote?.[0]?.close ?? []).filter((x: any) => x != null)
      if (closes.length < 2) continue
      const first    = closes[0]
      const nowPrice = (r?.meta?.regularMarketPrice as number) ?? closes[closes.length - 1]
      const years    = Math.max(0.08, (p2 - p1) / (365.25 * 86400))
      const totalRet = (nowPrice / first - 1) * 100
      const cagr     = (Math.pow(nowPrice / first, 1 / years) - 1) * 100
      const data = { symbol, from, fromValue: first, nowValue: nowPrice, totalRet, cagr, years: Math.round(years * 10) / 10 }
      CACHE.set(key, { data, ts: Date.now() })
      return NextResponse.json(data)
    } catch { continue }
  }
  const stale = CACHE.get(key)
  if (stale) return NextResponse.json({ ...stale.data, stale: true })
  return NextResponse.json({ error: 'index unavailable', symbol }, { status: 503 })
}
