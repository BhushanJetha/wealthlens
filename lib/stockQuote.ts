// Share and ETF prices from Yahoo Finance: the latest quote for a ticker, and
// finding the ticker when what's saved is a company name. Indian shares are
// tried on NSE (.NS) first, then BSE (.BO). The price is the exchange's last
// traded price (about 15 minutes behind while the market is open, the closing
// price after it shuts), with the time it's from.
export const UA = { 'User-Agent': 'Mozilla/5.0' }

// Fetch the live quote for one exact ticker (e.g. INFY.NS). Returns null on miss.
export async function tryTicker(ticker: string): Promise<Record<string, unknown> | null> {
  for (const host of ['query1', 'query2']) {
    try {
      const url = `https://${host}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1m&range=1d`
      const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(6000) })
      if (!res.ok) continue
      const json = await res.json()
      const meta = json?.chart?.result?.[0]?.meta
      if (!meta?.regularMarketPrice) continue
      return {
        symbol:        ticker,
        price:         meta.regularMarketPrice as number,
        previousClose: meta.previousClose      as number,
        currency:      meta.currency           as string,
        marketState:   meta.marketState        as string,
        at:            meta.regularMarketTime ? new Date(Number(meta.regularMarketTime) * 1000).toISOString() : null,
        change:        (meta.regularMarketPrice - meta.previousClose) as number,
        changePct:     ((meta.regularMarketPrice - meta.previousClose) / meta.previousClose * 100) as number,
      }
    } catch { continue }
  }
  return null
}

// Resolve a company name or wrong ticker to a real symbol via Yahoo search.
// Prefers NSE (.NS), then BSE (.BO), then any equity — so "Infosys" → INFY.NS,
// "Angel One" → ANGELONE.NS, "Jio Financial" → JIOFIN.NS.
export async function searchSymbol(q: string): Promise<string | null> {
  for (const host of ['query1', 'query2']) {
    try {
      const url = `https://${host}.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=8&newsCount=0`
      const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(6000) })
      if (!res.ok) continue
      const json = await res.json()
      const quotes = (json?.quotes ?? []).filter((x: any) => x?.symbol)
      const nse = quotes.find((x: any) => x.symbol.endsWith('.NS'))
      const bo  = quotes.find((x: any) => x.symbol.endsWith('.BO'))
      const eq  = quotes.find((x: any) => x.quoteType === 'EQUITY')
      const pick = nse ?? bo ?? eq ?? quotes[0]
      if (pick?.symbol) return pick.symbol as string
    } catch { continue }
  }
  return null
}


// The latest price for a saved symbol: as-is when it already names an exchange,
// else NSE then BSE, else found by name
export async function quoteFor(symbol: string, exact = false): Promise<(Record<string, unknown> & { price: number; symbol: string }) | null> {
  const direct = exact || symbol.startsWith('^') || symbol.includes('.') ? [symbol] : [`${symbol}.NS`, `${symbol}.BO`]
  for (const t of direct) { const q = await tryTicker(t); if (q) return q as any }
  if (symbol.startsWith('^')) return null
  const resolved = await searchSymbol(symbol)
  if (!resolved || direct.includes(resolved)) return null
  const q = await tryTicker(resolved)
  return q ? { ...(q as any), resolvedFrom: symbol } : null
}
